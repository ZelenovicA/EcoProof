import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal, engine
from backend.app.models import Base, Sensor, SensorData, HourlyValidation

def reset_and_seed_db():
    print("Deleting existing tables...")
    Base.metadata.drop_all(bind=engine)
    
    print("Creating new tables...")
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()

    base_lat, base_lon = 44.81, 20.46
    sensors = []
    for i in range(1, 6):
        sensor = Sensor(
            device_id=f"sensor_00{i}",
            lat=base_lat + random.uniform(-0.01, 0.01),
            lon=base_lon + random.uniform(-0.01, 0.01),
            owner_address=f"0xWalletAddress00{i}"
        )
        db.add(sensor)
        sensors.append(sensor)
    
    db.commit()
    for s in sensors:
        db.refresh(s)

    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=1)
    readings = []
    
    current_time = start_time
    while current_time <= end_time:
        for i in range(0, 3):
            readings.append(SensorData(
                sensor_id=sensors[i].id,
                timestamp=current_time,
                pm25=15.0 + random.uniform(-10.0, 50.0),
                pm10=20.0 + random.uniform(-15.0, 60.0)
            ))

        readings.append(SensorData(
            sensor_id=sensors[3].id,
            timestamp=current_time,
            pm25=100.0,
            pm10=150.0
        ))

        readings.append(SensorData(
            sensor_id=sensors[4].id,
            timestamp=current_time,
            pm25=85.0 + random.uniform(-25.0, 205.0),
            pm10=110.0 + random.uniform(-25.0, 205.0)
        ))

        current_time += timedelta(minutes=1)

    db.add_all(readings)
    db.commit()
    
    print(f"Database is saved. New readings added: {len(readings)} .")
    db.close()

if __name__ == "__main__":
    reset_and_seed_db()