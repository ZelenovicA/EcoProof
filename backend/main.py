from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
import models, schemas, database
from datetime import datetime, timedelta
from sqlalchemy import func
from models import Sensor, HourlyValidation
from database import SessionLocal

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="MVP EcoProof API", description="API for managing air quality sensors and their data")

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
        owner_address=sensor.owner_address
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
        pm10=data.pm10
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)
    return new_reading

@app.get("/api/sensors/{sensor_id}/weekly-reward")
def get_weekly_reward(sensor_id: int, db: Session = Depends(get_db)):
    WEEKLY_ERC_POOL = 100000.0
    
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Senzor nije pronađen.")

    start_time = datetime.utcnow() - timedelta(days=7)

    total_locations = db.query(func.count(func.distinct(HourlyValidation.cluster_id))).filter(
        HourlyValidation.timestamp_hour >= start_time
    ).scalar() or 1

    validations = db.query(HourlyValidation).filter(
        HourlyValidation.sensor_id == sensor_id,
        HourlyValidation.timestamp_hour >= start_time
    ).all()

    if not validations:
        return {"message": "No data."}

    sum_total_minutes = sum(v.total_readings for v in validations)
    sum_valid_minutes = sum(v.valid_readings for v in validations)
    
    accuracy_ratio = sum_valid_minutes / sum_total_minutes if sum_total_minutes > 0 else 0

    my_cluster_id = validations[0].cluster_id
    sensors_in_my_cluster = db.query(func.count(func.distinct(HourlyValidation.sensor_id))).filter(
        HourlyValidation.cluster_id == my_cluster_id,
        HourlyValidation.timestamp_hour >= start_time
    ).scalar() or 1

    pool_per_location = WEEKLY_ERC_POOL / total_locations
    max_reward_per_sensor = pool_per_location / sensors_in_my_cluster
    earned_erc = max_reward_per_sensor * accuracy_ratio

    return {
        "device_id": sensor.device_id,
        "network_stats": {
            "total_locations": total_locations,
            "pool_per_location": round(pool_per_location, 2)
        },
        "sensor_stats": {
            "sensors_at_this_location": sensors_in_my_cluster,
            "weekly_accuracy": f"{round(accuracy_ratio * 100, 2)}%",
            "max_possible_reward": round(max_reward_per_sensor, 2)
        },
        "payout": {
            "earned_erc": round(earned_erc, 2),
            "currency": "ERC",
            "network": "Base",
            "destination_address": sensor.owner_address
        }
    }