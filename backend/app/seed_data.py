"""
Seed telemetry data for 3 hardcoded users, run validation, compute scores,
generate a Merkle tree, and pin to IPFS — all in one call.
"""

import math
import random
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .models import Sensor, SensorData, UserScore, User
from .validation import run_weekly_validation

SAMPLE_INTERVAL_MINUTES = 15
WEEKLY_ERC_POOL = 100_000

SEED_USERS = [
    {
        "wallet": "0x5c3c6cf95261da214a6ef539d6f0d90a0b3be8b5",
        "sensors": [
            {"device_id": "seed_sensor_a1", "lat": 44.8100, "lon": 20.4600},
            {"device_id": "seed_sensor_a2", "lat": 44.8106, "lon": 20.4606},
        ],
    },
    {
        "wallet": "0xa06ac2b00087a2be33c1774a28a54fd6beed443f",
        "sensors": [
            {"device_id": "seed_sensor_b1", "lat": 44.8111, "lon": 20.4611},
        ],
    },
    {
        "wallet": "0x73de0835802f5d525834519f8b470a7a60433b70",
        "sensors": [
            {"device_id": "seed_sensor_c1", "lat": 44.8115, "lon": 20.4615},
        ],
    },
]


def _aligned_utc_now() -> datetime:
    now = datetime.utcnow().replace(second=0, microsecond=0)
    return now - timedelta(minutes=now.minute % SAMPLE_INTERVAL_MINUTES)


def _daily_wave(step: int, steps_per_day: int, amplitude: float) -> float:
    return amplitude * math.sin((2 * math.pi * step) / steps_per_day)


def _ensure_user(db: Session, wallet: str) -> None:
    from sqlalchemy import func
    existing = db.query(User).filter(func.lower(User.wallet_address) == wallet.lower()).first()
    if not existing:
        db.add(User(wallet_address=wallet.lower()))
        db.flush()


def seed_and_score(db: Session, days: int = 7) -> dict:
    """
    Ensure sensors exist for the 3 seed users, generate realistic telemetry,
    run weekly validation, and update UserScore records.
    Returns the validation result dict.
    """
    random.seed(42)
    all_sensors: list[Sensor] = []

    for user_cfg in SEED_USERS:
        wallet = user_cfg["wallet"].lower()
        _ensure_user(db, wallet)

        for sensor_cfg in user_cfg["sensors"]:
            existing = db.query(Sensor).filter(Sensor.device_id == sensor_cfg["device_id"]).first()
            if existing is None:
                existing = Sensor(
                    device_id=sensor_cfg["device_id"],
                    lat=sensor_cfg["lat"],
                    lon=sensor_cfg["lon"],
                    owner_address=wallet,
                    active=True,
                )
                db.add(existing)
                db.flush()
                db.refresh(existing)
            all_sensors.append(existing)

    db.commit()

    end_time = _aligned_utc_now()
    start_time = end_time - timedelta(days=days)
    total_steps = int((end_time - start_time).total_seconds() // (SAMPLE_INTERVAL_MINUTES * 60))
    steps_per_day = int((24 * 60) / SAMPLE_INTERVAL_MINUTES)

    # Clear old seed telemetry for these sensors
    sensor_ids = [s.id for s in all_sensors]
    db.query(SensorData).filter(
        SensorData.sensor_id.in_(sensor_ids),
        SensorData.timestamp >= start_time,
    ).delete(synchronize_session=False)
    db.flush()

    readings: list[SensorData] = []
    current_time = start_time

    for step in range(total_steps):
        baseline = 18 + _daily_wave(step, steps_per_day, 5.5)
        baseline += 3.0 * max(0.0, math.sin(math.pi * (current_time.hour * 60 + current_time.minute) / (24 * 60)))

        for sensor in all_sensors:
            noise = random.gauss(0, 1.0)
            pm25 = max(baseline + noise, 1.0)
            pm10 = max(pm25 * 1.35 + random.gauss(0, 2.0), pm25)
            readings.append(SensorData(
                sensor_id=sensor.id,
                timestamp=current_time,
                pm25=round(pm25, 3),
                pm10=round(pm10, 3),
            ))

        current_time += timedelta(minutes=SAMPLE_INTERVAL_MINUTES)

    db.add_all(readings)
    db.commit()

    # Run weekly validation
    result = run_weekly_validation(days=days, end_time=end_time, db=db, persist=True)

    # Convert weekly sensor scores → per-user scores
    weekly_scores = result.get("weekly_scores", [])
    if weekly_scores:
        # Group scores by owner address
        owner_scores: dict[str, list[float]] = {}
        for ws in weekly_scores:
            sid = ws["sensor_id"]
            sensor = next((s for s in all_sensors if s.id == sid), None)
            if sensor:
                owner = sensor.owner_address.lower()
                owner_scores.setdefault(owner, []).append(ws["trust_score"])

        # Calculate total trust for reward distribution
        total_trust = sum(max(scores) for scores in owner_scores.values()) or 1.0

        for owner, scores in owner_scores.items():
            best_score = max(scores)
            share = best_score / total_trust
            cumulative = int(share * WEEKLY_ERC_POOL * 10**18)

            user_score = db.query(UserScore).filter(
                UserScore.wallet_address == owner
            ).first()

            if user_score is None:
                user_score = UserScore(
                    wallet_address=owner,
                    score=round(best_score, 2),
                    cumulative_amount=str(cumulative),
                )
                db.add(user_score)
            else:
                user_score.score = round(best_score, 2)
                # Add to existing cumulative
                existing = int(user_score.cumulative_amount or "0")
                user_score.cumulative_amount = str(existing + cumulative)

        db.commit()

    return result
