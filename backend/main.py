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

FIXED_TOKEN_POOL_PER_LOCATION = 1000.0

@app.get("/api/sensors/{sensor_id}/weekly-score")
def get_weekly_score(sensor_id: int, db: Session = Depends(get_db)):
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found.")

    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=7)

    validations = db.query(HourlyValidation).filter(
        HourlyValidation.sensor_id == sensor_id,
        HourlyValidation.timestamp_hour >= start_time,
        HourlyValidation.timestamp_hour <= end_time
    ).all()

    total_hours = len(validations)
    if total_hours == 0:
         return {"message": "No validation data available for the past week. Score cannot be calculated."}

    valid_hours = sum(1 for v in validations if v.is_valid)
    accuracy_ratio = valid_hours / total_hours

    cluster_id = validations[0].cluster_id

    sensors_in_location = db.query(func.count(func.distinct(HourlyValidation.sensor_id))).filter(
        HourlyValidation.cluster_id == cluster_id,
        HourlyValidation.timestamp_hour >= start_time,
        HourlyValidation.timestamp_hour <= end_time
    ).scalar()

    if sensors_in_location == 0:
        sensors_in_location = 1 

    max_possible_reward = FIXED_TOKEN_POOL_PER_LOCATION / sensors_in_location
    
    earned_tokens = max_possible_reward * accuracy_ratio

    return {
        "sensor_id": sensor_id,
        "device_id": sensor.device_id,
        "cluster_id": cluster_id,
        "sensors_in_location": sensors_in_location,
        "accuracy_percentage": round(accuracy_ratio * 100, 2),
        "max_possible_tokens": round(max_possible_reward, 2),
        "earned_tokens": round(earned_tokens, 2),
        "owner_address": sensor.owner_address
    }