import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, Sensor, HourlyValidation

def seed_weekly_v2():
    print("Cleaning the base and preparing for the Base network...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()

    sensors = [
        Sensor(device_id="sensor_top", lat=44.81, lon=20.46, owner_address="0xHero123"),
        Sensor(device_id="sensor_mid", lat=44.811, lon=20.461, owner_address="0xUser456"),
        Sensor(device_id="sensor_low", lat=44.812, lon=20.462, owner_address="0xScammer789")
    ]
    db.add_all(sensors)
    db.commit()

    end_time = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start_time = end_time - timedelta(days=7)
    
    validations = []
    current_time = start_time

    print("Generating 504 hours of granular data (3 sensors * 168h)...")

    while current_time < end_time:
        valid_1 = random.randint(54, 60)
        validations.append(HourlyValidation(
            sensor_id=1, timestamp_hour=current_time, cluster_id=1,
            avg_pm25=15.5, avg_pm10=22.0, variance_pm25=2.1,
            total_readings=60, valid_readings=valid_1
        ))

        # Senzor 2: 50-70% tačnost (30-42 validna minuta)
        valid_2 = random.randint(30, 42)
        validations.append(HourlyValidation(
            sensor_id=2, timestamp_hour=current_time, cluster_id=1,
            avg_pm25=17.0, avg_pm10=25.0, variance_pm25=4.5,
            total_readings=60, valid_readings=valid_2
        ))

        # Senzor 3: 5-15% tačnost (3-9 validnih minuta) - npr. loš senzor ili pokušaj prevare
        valid_3 = random.randint(3, 9)
        validations.append(HourlyValidation(
            sensor_id=3, timestamp_hour=current_time, cluster_id=1,
            avg_pm25=90.0, avg_pm10=130.0, variance_pm25=0.05,
            total_readings=60, valid_readings=valid_3
        ))

        current_time += timedelta(hours=1)

    db.add_all(validations)
    db.commit()
    db.close()
    print("Database loaded with weekly granular data!")

if __name__ == "__main__":
    seed_weekly_v2()