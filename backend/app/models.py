import enum
from sqlalchemy import Column, Integer, Float, Boolean, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from .database import Base
import datetime

class UserRole(enum.Enum):
    ADMIN = "admin"
    USER = "user"

class SubscriptionPlan(enum.Enum):
    NONE = "none"
    STARTER = "starter"
    BUSINESS = "business"
    ENTERPRISE = "enterprise"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String, unique=True, index=True, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.USER)
    subscription_plan = Column(SQLEnum(SubscriptionPlan), default=SubscriptionPlan.NONE)
    subscription_plan_expiry = Column(DateTime, nullable=True)

    sensors = relationship("Sensor", back_populates="user")

class Sensor(Base):
    __tablename__ = "sensors"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    isActive = Column(Boolean, nullable=False, default=True)
    timestamp_registered = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    owner_address = Column(String, nullable=False)

    user = relationship("User", back_populates="sensors")
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
    
    total_readings = Column(Integer, nullable=False, default=0)
    valid_readings = Column(Integer, nullable=False, default=0)