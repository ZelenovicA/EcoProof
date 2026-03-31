from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
import models, schemas, database

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