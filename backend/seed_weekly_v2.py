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


def _daily_pattern(step: int, steps_per_day: int, base: float, amplitude: float, offset: float = 0.0) -> float:
    angle = (2 * math.pi * step) / steps_per_day + offset
    return base + amplitude * math.sin(angle) + 2.5 * max(0.0, math.sin(angle / 2))


def seed_weekly_v2() -> None:
    print("Resetting database and loading week 2 telemetry scenario...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    random.seed(21)

    sensors = [
        Sensor(device_id="city_ref_1", lat=44.8100, lon=20.4600, owner_address="0xC1001"),
        Sensor(device_id="city_ref_2", lat=44.8106, lon=20.4606, owner_address="0xC1002"),
        Sensor(device_id="city_bursty", lat=44.8111, lon=20.4611, owner_address="0xC1003"),
        Sensor(device_id="park_ref_1", lat=44.7950, lon=20.4300, owner_address="0xP2001"),
        Sensor(device_id="park_ref_2", lat=44.7957, lon=20.4307, owner_address="0xP2002"),
        Sensor(device_id="park_sleepy", lat=44.7963, lon=20.4313, owner_address="0xP2003"),
        Sensor(device_id="factory_ref", lat=44.8600, lon=20.5200, owner_address="0xF3001"),
        Sensor(device_id="factory_liar", lat=44.8607, lon=20.5208, owner_address="0xF3002"),
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

    print("Generating a multi-cluster week with honest, drifting, bursty, and sleepy sensors...")

    for step in range(total_steps):
        city_base = _daily_pattern(step, steps_per_day, base=20.0, amplitude=5.0)
        park_base = _daily_pattern(step, steps_per_day, base=13.0, amplitude=3.2, offset=0.5)
        factory_base = _daily_pattern(step, steps_per_day, base=33.0, amplitude=6.8, offset=1.0)

        sensor_values = {
            sensors[0].id: city_base + random.gauss(0, 0.7),
            sensors[1].id: city_base + random.gauss(0, 0.9),
            sensors[2].id: city_base + random.gauss(0, 1.5),
            sensors[3].id: park_base + random.gauss(0, 0.6),
            sensors[4].id: park_base + random.gauss(0, 0.9),
            sensors[5].id: park_base + random.gauss(0, 1.0),
            sensors[6].id: factory_base + random.gauss(0, 1.1),
            sensors[7].id: factory_base + random.gauss(0, 1.3),
        }

        if step % 24 in {5, 6, 7}:
            sensor_values[sensors[2].id] += 16.0
        if step % 32 in {12, 13}:
            sensor_values[sensors[2].id] -= 9.0

        if step % 10 == 0:
            current_time += timedelta(minutes=SAMPLE_INTERVAL_MINUTES)
            continue

        if step > total_steps // 3:
            drift_progress = (step - total_steps // 3) / max(total_steps - total_steps // 3, 1)
            sensor_values[sensors[7].id] += 20.0 * drift_progress

        if step % 28 in {0, 1, 2, 3}:
            sensor_values[sensors[7].id] += 12.0

        for sensor in sensors:
            if sensor.id == sensors[5].id and step % 14 in {0, 1, 2, 3}:
                continue

            pm25 = max(sensor_values[sensor.id], 1.0)
            pm10 = max(pm25 * 1.28 + random.gauss(0, 1.8), pm25)
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
        f"{result['weekly_records']} weekly trust scores for week 2."
    )


if __name__ == "__main__":
    seed_weekly_v2()
