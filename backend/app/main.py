from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import database, models, schemas
from .models import Sensor, WeeklySensorScore
from .validation import run_weekly_validation

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="MVP EcoProof API",
    description="API for managing air quality sensors and weekly trust scoring.",
)


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _normalized_window_end() -> datetime:
    return datetime.utcnow().replace(minute=0, second=0, microsecond=0)


def _ensure_weekly_scores(db: Session, days: int, refresh: bool) -> tuple[datetime, datetime] | None:
    target_end = _normalized_window_end()
    target_start = target_end - timedelta(days=days)

    existing_count = (
        db.query(func.count(WeeklySensorScore.id))
        .filter(
            WeeklySensorScore.week_start == target_start,
            WeeklySensorScore.week_end == target_end,
        )
        .scalar()
        or 0
    )

    if refresh or existing_count == 0:
        result = run_weekly_validation(days=days, end_time=target_end, db=db, persist=True)
        if result["weekly_records"] == 0:
            return None

    return target_start, target_end


def _serialize_weekly_score(score: WeeklySensorScore) -> dict:
    sensor = score.sensor
    return {
        "sensor_id": score.sensor_id,
        "device_id": sensor.device_id,
        "owner_address": sensor.owner_address,
        "week_start": score.week_start,
        "week_end": score.week_end,
        "cluster_id": score.cluster_id,
        "cluster_size": score.cluster_size,
        "total_readings": score.total_readings,
        "comparable_readings": score.comparable_readings,
        "trusted_readings": score.trusted_readings,
        "trust_score": round(score.trust_score, 2),
        "peer_agreement_score": round(score.peer_agreement_score, 2),
        "temporal_score": round(score.temporal_score, 2),
        "coverage_score": round(score.coverage_score, 2),
        "anomaly_ratio": round(score.anomaly_ratio, 4),
        "avg_pm25": round(score.avg_pm25, 2),
        "avg_pm10": round(score.avg_pm10, 2) if score.avg_pm10 is not None else None,
        "reward_multiplier": round(score.trust_score / 100.0, 4),
    }


@app.get("/")
def read_root():
    return {"status": "API is active", "message": "Welcome!"}


@app.post("/sensors/", response_model=schemas.SensorResponse)
def register_sensor(sensor: schemas.SensorCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Sensor).filter(models.Sensor.device_id == sensor.device_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sensor already exists.")

    new_sensor = models.Sensor(
        device_id=sensor.device_id,
        lat=sensor.lat,
        lon=sensor.lon,
        owner_address=sensor.owner_address,
        isActive=sensor.isActive if sensor.isActive is not None else True,
        timestamp_registered=sensor.timestamp_registered,
    )
    db.add(new_sensor)
    db.commit()
    db.refresh(new_sensor)
    return new_sensor


@app.post("/telemetry/", response_model=schemas.SensorDataResponse)
def add_telemetry(data: schemas.SensorDataCreate, db: Session = Depends(get_db)):
    sensor = db.query(models.Sensor).filter(models.Sensor.device_id == data.device_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found. Please register the sensor first.")

    new_reading = models.SensorData(
        sensor_id=sensor.id,
        pm25=data.pm25,
        pm10=data.pm10,
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)
    return new_reading


@app.post("/api/validation/run-weekly", response_model=schemas.ValidationRunResponse)
def run_validation_job(
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    result = run_weekly_validation(days=days, db=db, persist=True)
    return {
        "week_start": result["week_start"],
        "week_end": result["week_end"],
        "sensor_count": result["sensor_count"],
        "hourly_records": result["hourly_records"],
        "weekly_records": result["weekly_records"],
    }


@app.get("/api/sensors/weekly-scores", response_model=schemas.WeeklyScoreboardResponse)
def get_weekly_scores(
    days: int = Query(7, ge=1, le=30),
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    window = _ensure_weekly_scores(db, days=days, refresh=refresh)
    if window is None:
        return {
            "generated_at": datetime.utcnow(),
            "week_start": datetime.utcnow(),
            "week_end": datetime.utcnow(),
            "sensor_count": 0,
            "sensors": [],
        }

    week_start, week_end = window
    scores = (
        db.query(WeeklySensorScore)
        .join(Sensor, WeeklySensorScore.sensor_id == Sensor.id)
        .filter(WeeklySensorScore.week_start == week_start, WeeklySensorScore.week_end == week_end)
        .order_by(WeeklySensorScore.trust_score.desc(), WeeklySensorScore.sensor_id.asc())
        .all()
    )

    return {
        "generated_at": datetime.utcnow(),
        "week_start": week_start,
        "week_end": week_end,
        "sensor_count": len(scores),
        "sensors": [_serialize_weekly_score(score) for score in scores],
    }


@app.get("/api/sensors/{sensor_id}/weekly-score", response_model=schemas.WeeklySensorScoreResponse)
def get_sensor_weekly_score(
    sensor_id: int,
    days: int = Query(7, ge=1, le=30),
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    window = _ensure_weekly_scores(db, days=days, refresh=refresh)
    if window is None:
        raise HTTPException(status_code=404, detail="No scored telemetry found for the selected window.")

    week_start, week_end = window
    score = (
        db.query(WeeklySensorScore)
        .join(Sensor, WeeklySensorScore.sensor_id == Sensor.id)
        .filter(
            WeeklySensorScore.sensor_id == sensor_id,
            WeeklySensorScore.week_start == week_start,
            WeeklySensorScore.week_end == week_end,
        )
        .first()
    )
    if score is None:
        raise HTTPException(status_code=404, detail="No weekly score found for this sensor.")

    return _serialize_weekly_score(score)


@app.get("/api/sensors/{sensor_id}/weekly-reward")
def get_weekly_reward(
    sensor_id: int,
    days: int = Query(7, ge=1, le=30),
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    WEEKLY_ERC_POOL = 100000.0

    window = _ensure_weekly_scores(db, days=days, refresh=refresh)
    if window is None:
        return {"message": "No scored telemetry found for the selected window."}

    week_start, week_end = window
    score = (
        db.query(WeeklySensorScore)
        .join(Sensor, WeeklySensorScore.sensor_id == Sensor.id)
        .filter(
            WeeklySensorScore.sensor_id == sensor_id,
            WeeklySensorScore.week_start == week_start,
            WeeklySensorScore.week_end == week_end,
        )
        .first()
    )
    if score is None:
        raise HTTPException(status_code=404, detail="Sensor not found in weekly scoring window.")

    total_locations = (
        db.query(func.count(func.distinct(WeeklySensorScore.cluster_id)))
        .filter(
            WeeklySensorScore.week_start == week_start,
            WeeklySensorScore.week_end == week_end,
            WeeklySensorScore.cluster_id != -1,
        )
        .scalar()
        or 1
    )

    pool_per_location = WEEKLY_ERC_POOL / total_locations
    sensors_in_my_cluster = max(score.cluster_size, 1)
    max_reward_per_sensor = pool_per_location / sensors_in_my_cluster
    reward_multiplier = score.trust_score / 100.0
    earned_erc = max_reward_per_sensor * reward_multiplier

    return {
        "device_id": score.sensor.device_id,
        "week_window": {
            "week_start": week_start,
            "week_end": week_end,
        },
        "network_stats": {
            "total_locations": total_locations,
            "pool_per_location": round(pool_per_location, 2),
        },
        "sensor_stats": {
            "sensors_at_this_location": sensors_in_my_cluster,
            "weekly_trust_score": f"{round(score.trust_score, 2)}%",
            "trusted_reading_ratio": round(score.trusted_readings / score.total_readings, 4)
            if score.total_readings
            else 0.0,
            "coverage_score": round(score.coverage_score, 2),
            "max_possible_reward": round(max_reward_per_sensor, 2),
        },
        "payout": {
            "earned_erc": round(earned_erc, 2),
            "currency": "ERC",
            "network": "Base",
            "destination_address": score.sensor.owner_address,
            "reward_multiplier": round(reward_multiplier, 4),
        },
        "score_breakdown": {
            "peer_agreement_score": round(score.peer_agreement_score, 2),
            "temporal_score": round(score.temporal_score, 2),
            "anomaly_ratio": round(score.anomaly_ratio, 4),
        },
    }
