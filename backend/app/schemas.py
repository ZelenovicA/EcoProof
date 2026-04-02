from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum

class UserLogin(BaseModel):
    wallet_address: str
    signature: str

class SensorCreate(BaseModel):
    device_id: str
    isActive: Optional[bool] = True
    timestamp_registered: datetime = datetime.utcnow()
    lat: float
    lon: float
    owner_address: str

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

class HourlyValidationCreate(BaseModel):
    sensor_id: int
    timestamp_hour: datetime
    cluster_id: int
    avg_pm25: float
    avg_pm10: Optional[float] = None
    variance_pm25: float
    total_readings: int
    valid_readings: int

class HourlyValidationResponse(HourlyValidationCreate):
    id: int

    class Config:
        from_attributes = True

class RejectionReason(str, Enum):
    NONE = "NONE"
    ZERO_VARIANCE = "ZERO_VARIANCE"
    OUTLIER = "OUTLIER"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
