import math
import random
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.models import Base, Sensor, SensorData
from app.validation import run_weekly_validation

SAMPLE_INTERVAL_MINUTES = 15


def _aligned_utc_now() -> datetime:
    now = datetime.utcnow().replace(second=0, microsecond=0)
    return now - timedelta(minutes=now.minute % SAMPLE_INTERVAL_MINUTES)


def _daily_wave(index: int, total_steps_per_day: int, amplitude: float) -> float:
    return amplitude * math.sin((2 * math.pi * index) / total_steps_per_day)


def seed_weekly_validations() -> None:
    print("Resetting database and loading week 1 telemetry scenario...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    random.seed(7)

    sensors = [
        Sensor(device_id="cluster_a_ref_1", lat=44.8100, lon=20.4600, owner_address="0xA1001"),
        Sensor(device_id="cluster_a_ref_2", lat=44.8108, lon=20.4605, owner_address="0xA1002"),
        Sensor(device_id="cluster_a_noisy", lat=44.8114, lon=20.4610, owner_address="0xA1003"),
        Sensor(device_id="cluster_a_spoofer", lat=44.8119, lon=20.4615, owner_address="0xA1004"),
        Sensor(device_id="cluster_b_ref", lat=44.8450, lon=20.4100, owner_address="0xB2001"),
        Sensor(device_id="cluster_b_drifter", lat=44.8457, lon=20.4106, owner_address="0xB2002"),
    ]
    db.add_all(sensors)
    db.commit()
    for sensor in sensors:
        db.refresh(sensor)

    end_time = _aligned_utc_now()
    start_time = end_time - timedelta(days=7)
    total_steps = int((end_time - start_time).total_seconds() // (SAMPLE_INTERVAL_MINUTES * 60))
    steps_per_day = int((24 * 60) / SAMPLE_INTERVAL_MINUTES)

    readings: list[SensorData] = []
    current_time = start_time

    print("Generating raw telemetry for 6 sensors across 2 geographic clusters...")

    for step in range(total_steps):
        day_fraction = (current_time.hour * 60 + current_time.minute) / (24 * 60)

        cluster_a_baseline = 18 + _daily_wave(step, steps_per_day, 5.5) + 3.0 * max(0.0, math.sin(math.pi * day_fraction))
        cluster_b_baseline = 26 + _daily_wave(step, steps_per_day, 7.0) + 4.0 * max(0.0, math.sin(math.pi * (day_fraction - 0.1)))

        sensor_values = {
            sensors[0].id: cluster_a_baseline + random.gauss(0, 0.8),
            sensors[1].id: cluster_a_baseline + random.gauss(0, 1.1),
            sensors[2].id: cluster_a_baseline + random.gauss(0, 2.4),
            sensors[3].id: cluster_a_baseline + random.gauss(0, 1.2),
            sensors[4].id: cluster_b_baseline + random.gauss(0, 1.0),
            sensors[5].id: cluster_b_baseline + random.gauss(0, 1.5),
        }

        if step % 18 in {0, 1, 2}:
            sensor_values[sensors[3].id] += 18.0
        elif step % 40 in {10, 11, 12, 13}:
            sensor_values[sensors[3].id] = 11.5

        if step > total_steps // 2:
            drift_progress = (step - total_steps // 2) / max(total_steps // 2, 1)
            sensor_values[sensors[5].id] += 8.0 * drift_progress

        for sensor in sensors:
            pm25 = max(sensor_values[sensor.id], 1.0)
            pm10 = max(pm25 * 1.35 + random.gauss(0, 2.0), pm25)
            readings.append(
                SensorData(
                    sensor_id=sensor.id,
                    timestamp=current_time,
                    pm25=round(pm25, 3),
                    pm10=round(pm10, 3),
                )
            )

        current_time += timedelta(minutes=SAMPLE_INTERVAL_MINUTES)

    db.add_all(readings)
    db.commit()

    result = run_weekly_validation(days=7, end_time=end_time, db=db, persist=True)
    db.close()

    print(f"Inserted {len(readings)} raw readings.")
    print(
        f"Generated {result['hourly_records']} hourly validations and "
        f"{result['weekly_records']} weekly trust scores for week 1."
    )


if __name__ == "__main__":
    seed_weekly_validations()
