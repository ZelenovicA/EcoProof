from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SensorCreate(BaseModel):
    device_id: str
    lat: float
    lon: float
    owner_address: Optional[str] = None

class SensorResponse(SensorCreate):
    id: int

    class Config:
        from_attributes = True

class SensorDataCreate(BaseModel):
    device_id: str  
    pm25: float
    pm10: Optional[float] = None

class SensorDataResponse(BaseModel):
    id: int
    sensor_id: int
    timestamp: datetime
    pm25: float
    pm10: Optional[float]

    class Config:
        from_attributes = True