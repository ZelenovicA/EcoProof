import enum
from sqlalchemy import Column, Integer, Float, Boolean, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from database import Base
import datetime

class RejectionReason(enum.Enum):
    NONE = "NONE"
    ZERO_VARIANCE = "ZERO_VARIANCE"
    OUTLIER = "OUTLIER"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"

class Sensor(Base):
    __tablename__ = "sensors"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    owner_address = Column(String, nullable=True)

    readings = relationship("SensorData", back_populates="sensor")

class SensorData(Base):
    __tablename__ = "sensor_data"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), nullable=False)
    
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    pm25 = Column(Float, nullable=False)
    pm10 = Column(Float, nullable=True)

    sensor = relationship("Sensor", back_populates="readings")

class HourlyValidation(Base):
    __tablename__ = "hourly_validations"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), index=True, nullable=False)
    timestamp_hour = Column(DateTime, index=True, nullable=False)
    
    cluster_id = Column(Integer, index=True, nullable=False)
    
    avg_pm25 = Column(Float, nullable=False)
    avg_pm10 = Column(Float, nullable=True)
    variance_pm25 = Column(Float, nullable=False)
    
    is_valid = Column(Boolean, default=False, nullable=False)
    rejection_reason = Column(SQLEnum(RejectionReason), default=RejectionReason.NONE, nullable=False)