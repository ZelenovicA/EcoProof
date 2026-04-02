from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class UserLogin(BaseModel):
    wallet_address: str
    signature: str

class SensorCreate(BaseModel):
    device_id: str
    isActive: Optional[bool] = True
    timestamp_registered: datetime = Field(default_factory=datetime.utcnow)
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

    class Config:
        from_attributes = True

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

class WeeklySensorScoreResponse(BaseModel):
    sensor_id: int
    device_id: str
    owner_address: str
    week_start: datetime
    week_end: datetime
    cluster_id: int
    cluster_size: int
    total_readings: int
    comparable_readings: int
    trusted_readings: int
    trust_score: float
    peer_agreement_score: float
    temporal_score: float
    coverage_score: float
    anomaly_ratio: float
    avg_pm25: float
    avg_pm10: Optional[float] = None
    reward_multiplier: float

class WeeklyScoreboardResponse(BaseModel):
    generated_at: datetime
    week_start: datetime
    week_end: datetime
    sensor_count: int
    sensors: list[WeeklySensorScoreResponse]

class ValidationRunResponse(BaseModel):
    week_start: datetime
    week_end: datetime
    sensor_count: int
    hourly_records: int
    weekly_records: int

class RejectionReason(str, Enum):
    NONE = "NONE"
    ZERO_VARIANCE = "ZERO_VARIANCE"
    OUTLIER = "OUTLIER"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
