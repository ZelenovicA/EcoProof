from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sqlalchemy.orm import Session

try:
    from .database import SessionLocal
    from .models import HourlyValidation, Sensor, SensorData, WeeklySensorScore
except ImportError:  # pragma: no cover - enables direct script execution
    from database import SessionLocal
    from models import HourlyValidation, Sensor, SensorData, WeeklySensorScore

EARTH_RADIUS_KM = 6371.0088
MIN_PM25_SCALE = 2.0
MIN_PM10_SCALE = 4.0
DEFAULT_TRUST_THRESHOLD = 0.6
DEFAULT_CLUSTER_RADIUS_KM = 2.0
DEFAULT_COMPARISON_WINDOW = "1h"
TEMPORAL_HISTORY_WINDOW = 12
MIN_HISTORY_POINTS = 3


@dataclass(frozen=True)
class ValidationConfig:
    cluster_radius_km: float = DEFAULT_CLUSTER_RADIUS_KM
    min_cluster_size: int = 2
    trusted_threshold: float = DEFAULT_TRUST_THRESHOLD
    comparison_window: str = DEFAULT_COMPARISON_WINDOW


@dataclass
class ValidationArtifacts:
    scored_readings: pd.DataFrame
    hourly_validations: pd.DataFrame
    weekly_scores: pd.DataFrame


def _robust_center_scale(values: pd.Series | list[float], minimum_scale: float) -> tuple[float, float]:
    clean = pd.Series(values, dtype="float64").dropna()
    if clean.empty:
        return 0.0, minimum_scale

    center = float(clean.median())
    mad = float(np.median(np.abs(clean - center))) if len(clean) > 1 else 0.0
    scale = max(mad * 1.4826, minimum_scale, abs(center) * 0.08)
    return center, scale


def _gaussian_score(value: float | None, center: float, scale: float) -> float:
    if value is None or pd.isna(value):
        return np.nan

    deviation = abs(float(value) - center) / max(scale, 1e-9)
    return float(np.exp(-0.5 * (deviation ** 2)))


def _combine_scores(*scores: float) -> float:
    valid_scores = [float(score) for score in scores if not pd.isna(score)]
    if not valid_scores:
        return 0.5
    return float(np.mean(valid_scores))


def _weighted_average(values: pd.Series, weights: pd.Series) -> float | None:
    mask = values.notna() & weights.notna()
    if not mask.any():
        return None

    filtered_values = values[mask].astype(float)
    filtered_weights = weights[mask].clip(lower=0.05).astype(float)

    weight_sum = float(filtered_weights.sum())
    if weight_sum <= 0:
        return float(filtered_values.mean())
    return float(np.average(filtered_values, weights=filtered_weights))


def _mode_int(values: pd.Series, default: int = -1) -> int:
    non_null = values.dropna()
    if non_null.empty:
        return default
    return int(non_null.mode().iloc[0])


def _assign_geo_clusters(df: pd.DataFrame, config: ValidationConfig) -> tuple[pd.DataFrame, dict[int, int]]:
    sensors = df[["sensor_id", "lat", "lon"]].drop_duplicates().copy()
    if len(sensors) < config.min_cluster_size:
        sensors["cluster_id"] = -1
    else:
        coords = np.radians(sensors[["lat", "lon"]].to_numpy())
        eps = config.cluster_radius_km / EARTH_RADIUS_KM
        clustering = DBSCAN(eps=eps, min_samples=config.min_cluster_size, metric="haversine")
        sensors["cluster_id"] = clustering.fit_predict(coords)

    cluster_sizes = sensors.groupby("cluster_id")["sensor_id"].nunique().astype(int).to_dict()
    enriched = df.merge(sensors[["sensor_id", "cluster_id"]], on="sensor_id", how="left")
    enriched["cluster_id"] = enriched["cluster_id"].fillna(-1).astype(int)
    enriched["cluster_size"] = enriched["cluster_id"].map(cluster_sizes).fillna(1).astype(int)
    return enriched, cluster_sizes


def _score_against_history(value: float | None, history: list[float], minimum_scale: float) -> float:
    if value is None or pd.isna(value):
        return np.nan
    if len(history) < MIN_HISTORY_POINTS:
        return 0.5

    center, scale = _robust_center_scale(history[-TEMPORAL_HISTORY_WINDOW:], minimum_scale)
    return _gaussian_score(value, center, scale)


def _compute_temporal_scores(df: pd.DataFrame) -> pd.Series:
    temporal_scores = pd.Series(0.5, index=df.index, dtype="float64")
    ordered = df.sort_values(["sensor_id", "timestamp", "data_id"])

    for _, group in ordered.groupby("sensor_id", sort=False):
        pm25_history: list[float] = []
        pm10_history: list[float] = []

        for row in group.itertuples():
            pm25_score = _score_against_history(row.pm25, pm25_history, MIN_PM25_SCALE)
            pm10_score = _score_against_history(row.pm10, pm10_history, MIN_PM10_SCALE)
            temporal_scores.at[row.Index] = _combine_scores(pm25_score, pm10_score)

            pm25_history.append(float(row.pm25))
            if not pd.isna(row.pm10):
                pm10_history.append(float(row.pm10))

    return temporal_scores


def _compute_peer_scores(df: pd.DataFrame, config: ValidationConfig) -> tuple[pd.Series, pd.Series, pd.Series]:
    peer_agreement = pd.Series(0.5, index=df.index, dtype="float64")
    peer_count = pd.Series(0, index=df.index, dtype="int64")
    comparable = pd.Series(False, index=df.index, dtype="bool")

    bucketed = df.copy()
    bucketed["comparison_bucket"] = bucketed["timestamp"].dt.floor(config.comparison_window)

    for (cluster_id, _), group in bucketed.groupby(["cluster_id", "comparison_bucket"], sort=False):
        if cluster_id == -1 or len(group) <= 1:
            continue

        for row in group.itertuples():
            peers = group[group["sensor_id"] != row.sensor_id]
            if peers.empty:
                continue

            comparable.at[row.Index] = True
            peer_count.at[row.Index] = int(peers["sensor_id"].nunique())

            pm25_center, pm25_scale = _robust_center_scale(peers["pm25"], MIN_PM25_SCALE)
            pm25_score = _gaussian_score(row.pm25, pm25_center, pm25_scale)

            pm10_values = peers["pm10"].dropna()
            if pd.isna(row.pm10) or pm10_values.empty:
                pm10_score = np.nan
            else:
                pm10_center, pm10_scale = _robust_center_scale(pm10_values, MIN_PM10_SCALE)
                pm10_score = _gaussian_score(row.pm10, pm10_center, pm10_scale)

            peer_agreement.at[row.Index] = _combine_scores(pm25_score, pm10_score)

    return peer_agreement, peer_count, comparable


def build_validation_artifacts(
    sensor_frame: pd.DataFrame,
    start_time: datetime,
    end_time: datetime,
    config: ValidationConfig | None = None,
) -> ValidationArtifacts:
    config = config or ValidationConfig()
    if sensor_frame.empty:
        return ValidationArtifacts(
            scored_readings=pd.DataFrame(),
            hourly_validations=pd.DataFrame(),
            weekly_scores=pd.DataFrame(),
        )

    scored = sensor_frame.copy()
    scored["timestamp"] = pd.to_datetime(scored["timestamp"])
    scored = scored.sort_values(["sensor_id", "timestamp", "data_id"]).reset_index(drop=True)

    scored, _cluster_sizes = _assign_geo_clusters(scored, config)
    scored["temporal_score"] = _compute_temporal_scores(scored)

    peer_agreement, peer_count, comparable = _compute_peer_scores(scored, config)
    scored["peer_agreement_score"] = peer_agreement
    scored["peer_count"] = peer_count
    scored["comparable"] = comparable
    scored["peer_support_score"] = np.clip(scored["peer_count"] / 3.0, 0.0, 1.0)
    scored["trust_score"] = np.clip(
        0.7 * scored["peer_agreement_score"].fillna(0.5)
        + 0.2 * scored["peer_support_score"]
        + 0.1 * scored["temporal_score"].fillna(0.5),
        0.0,
        1.0,
    )
    scored["is_trusted"] = scored["trust_score"] >= config.trusted_threshold
    scored["timestamp_hour"] = scored["timestamp"].dt.floor("h")

    hourly_rows: list[dict[str, Any]] = []
    for (sensor_id, timestamp_hour), group in scored.groupby(["sensor_id", "timestamp_hour"], sort=False):
        trust_weights = group["trust_score"]
        hourly_rows.append(
            {
                "sensor_id": int(sensor_id),
                "timestamp_hour": timestamp_hour.to_pydatetime(),
                "cluster_id": _mode_int(group["cluster_id"]),
                "avg_pm25": _weighted_average(group["pm25"], trust_weights) or float(group["pm25"].mean()),
                "avg_pm10": _weighted_average(group["pm10"], trust_weights),
                "variance_pm25": float(group["pm25"].var(ddof=0)) if len(group) > 1 else 0.0,
                "total_readings": int(len(group)),
                "valid_readings": int(group["is_trusted"].sum()),
            }
        )

    weekly_rows: list[dict[str, Any]] = []
    for sensor_id, group in scored.groupby("sensor_id", sort=False):
        trust_weights = group["trust_score"]
        total_readings = int(len(group))
        comparable_readings = int(group["comparable"].sum())
        trusted_readings = int(group["is_trusted"].sum())
        anomaly_ratio = float(1 - (trusted_readings / total_readings)) if total_readings else 1.0

        weekly_rows.append(
            {
                "sensor_id": int(sensor_id),
                "week_start": start_time,
                "week_end": end_time,
                "cluster_id": _mode_int(group["cluster_id"]),
                "cluster_size": int(group["cluster_size"].median()) if not group.empty else 1,
                "total_readings": total_readings,
                "comparable_readings": comparable_readings,
                "trusted_readings": trusted_readings,
                "trust_score": float(group["trust_score"].mean() * 100),
                "peer_agreement_score": float(group["peer_agreement_score"].mean() * 100),
                "temporal_score": float(group["temporal_score"].mean() * 100),
                "coverage_score": float((comparable_readings / total_readings) * 100) if total_readings else 0.0,
                "anomaly_ratio": anomaly_ratio,
                "avg_pm25": _weighted_average(group["pm25"], trust_weights) or float(group["pm25"].mean()),
                "avg_pm10": _weighted_average(group["pm10"], trust_weights),
            }
        )

    hourly_df = pd.DataFrame(hourly_rows)
    weekly_df = pd.DataFrame(weekly_rows).sort_values("trust_score", ascending=False).reset_index(drop=True)
    return ValidationArtifacts(scored_readings=scored, hourly_validations=hourly_df, weekly_scores=weekly_df)


def load_sensor_frame(db: Session, start_time: datetime, end_time: datetime) -> pd.DataFrame:
    query = (
        db.query(
            SensorData.id.label("data_id"),
            SensorData.sensor_id,
            Sensor.lat,
            Sensor.lon,
            SensorData.pm25,
            SensorData.pm10,
            SensorData.timestamp,
        )
        .join(Sensor, SensorData.sensor_id == Sensor.id)
        .filter(SensorData.timestamp >= start_time, SensorData.timestamp < end_time)
        .filter(Sensor.active.is_(True))
    )
    return pd.read_sql(query.statement, db.get_bind())


def persist_validation_artifacts(
    db: Session,
    artifacts: ValidationArtifacts,
    start_time: datetime,
    end_time: datetime,
) -> None:
    start_hour = start_time.replace(minute=0, second=0, microsecond=0)

    db.query(HourlyValidation).filter(
        HourlyValidation.timestamp_hour >= start_hour,
        HourlyValidation.timestamp_hour < end_time,
    ).delete(synchronize_session=False)

    db.query(WeeklySensorScore).filter(
        WeeklySensorScore.week_start == start_time,
        WeeklySensorScore.week_end == end_time,
    ).delete(synchronize_session=False)

    hourly_models = [HourlyValidation(**row) for row in artifacts.hourly_validations.to_dict(orient="records")]
    weekly_models = [WeeklySensorScore(**row) for row in artifacts.weekly_scores.to_dict(orient="records")]

    db.add_all(hourly_models)
    db.add_all(weekly_models)
    db.commit()


def run_weekly_validation(
    days: int = 7,
    end_time: datetime | None = None,
    db: Session | None = None,
    persist: bool = True,
    config: ValidationConfig | None = None,
) -> dict[str, Any]:
    own_session = db is None
    session = db or SessionLocal()

    try:
        effective_end = (end_time or datetime.utcnow()).replace(second=0, microsecond=0)
        effective_start = effective_end - timedelta(days=days)

        sensor_frame = load_sensor_frame(session, effective_start, effective_end)
        artifacts = build_validation_artifacts(sensor_frame, effective_start, effective_end, config)

        if persist and not artifacts.scored_readings.empty:
            persist_validation_artifacts(session, artifacts, effective_start, effective_end)

        return {
            "week_start": effective_start,
            "week_end": effective_end,
            "sensor_count": int(artifacts.weekly_scores["sensor_id"].nunique()) if not artifacts.weekly_scores.empty else 0,
            "hourly_records": int(len(artifacts.hourly_validations)),
            "weekly_records": int(len(artifacts.weekly_scores)),
            "weekly_scores": artifacts.weekly_scores.to_dict(orient="records"),
        }
    finally:
        if own_session:
            session.close()


if __name__ == "__main__":
    result = run_weekly_validation()
    print(
        f"Generated {result['hourly_records']} hourly validations and "
        f"{result['weekly_records']} weekly trust scores."
    )
