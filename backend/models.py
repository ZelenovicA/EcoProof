from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
import datetime

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