import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, Sensor, HourlyValidation, RejectionReason

def seed_weekly_validations():
    print("Brišem staru bazu i pravim čiste tabele...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()

    sensors = [
        Sensor(device_id="sensor_fair", lat=44.81, lon=20.46, owner_address="0xAddress1"),
        Sensor(device_id="sensor_clever", lat=44.82, lon=20.47, owner_address="0xAddress2"),
        Sensor(device_id="sensor_liar", lat=44.83, lon=20.48, owner_address="0xAddress3")
    ]
    db.add_all(sensors)
    db.commit()
    print("Sensors has been seeded.")

    end_time = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start_time = end_time - timedelta(days=7)
    
    validations = []
    current_time = start_time

    print("Generating hourly validations (total 168 hours per sensor)...")

    while current_time < end_time:      
        is_valid_1 = random.random() < 0.95
        validations.append(HourlyValidation(
            sensor_id=1, timestamp_hour=current_time, cluster_id=1,
            avg_pm25=15.0, avg_pm10=20.0, variance_pm25=2.5,
            is_valid=is_valid_1, 
            rejection_reason=RejectionReason.NONE if is_valid_1 else RejectionReason.OUTLIER
        ))

        is_valid_2 = random.random() < 0.70
        validations.append(HourlyValidation(
            sensor_id=2, timestamp_hour=current_time, cluster_id=1,
            avg_pm25=16.0, avg_pm10=21.0, variance_pm25=1.5,
            is_valid=is_valid_2, 
            rejection_reason=RejectionReason.NONE if is_valid_2 else RejectionReason.ZERO_VARIANCE
        ))

        is_valid_3 = random.random() < 0.10
        validations.append(HourlyValidation(
            sensor_id=3, timestamp_hour=current_time, cluster_id=1,
            avg_pm25=85.0, avg_pm10=110.0, variance_pm25=0.01,
            is_valid=is_valid_3, 
            rejection_reason=RejectionReason.NONE if is_valid_3 else RejectionReason.OUTLIER
        ))

        current_time += timedelta(hours=1)

    db.add_all(validations)
    db.commit()
    db.close()
    
    print(f"Successfully generated {len(validations)} validations (168 per sensor).")

if __name__ == "__main__":
    seed_weekly_validations()