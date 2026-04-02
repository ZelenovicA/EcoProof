import datetime
import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    SHIPPING = "shipping"
    ARRIVED = "arrived"
    CANCELLED = "cancelled"


class SubscriptionPlan(str, enum.Enum):
    STARTER = "starter"
    BUSINESS = "business"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), unique=True, index=True, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.USER, nullable=False)
    subscription_plan = Column(SQLEnum(SubscriptionPlan), nullable=True)
    subscription_plan_expiry = Column(DateTime, nullable=True)

    sensors = relationship(
        "Sensor",
        back_populates="user",
        primaryjoin="User.wallet_address == foreign(Sensor.owner_address)",
    )


class UserScore(Base):
    __tablename__ = "user_scores"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), unique=True, index=True, nullable=False)
    score = Column(Float, nullable=False, default=0.0)
    cumulative_amount = Column(String, nullable=False, default="0")
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )


class Sensor(Base):
    __tablename__ = "sensors"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(66), unique=True, index=True, nullable=False)
    device_id_hash = Column(String(66), unique=True, index=True, nullable=True)
    activation_code = Column(String(6), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    registered_at = Column("timestamp_registered", DateTime, default=datetime.datetime.utcnow, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    owner_address = Column(String(42), ForeignKey("users.wallet_address"), nullable=False, index=True)
    sensor_type = Column(String(64), nullable=False, default="AQ-V2")

    user = relationship("User", back_populates="sensors")
    readings = relationship("SensorData", back_populates="sensor")
    hourly_validations = relationship("HourlyValidation", back_populates="sensor")
    weekly_scores = relationship("WeeklySensorScore", back_populates="sensor")


class SensorOrder(Base):
    __tablename__ = "sensor_orders"

    id = Column(Integer, primary_key=True, index=True)
    buyer_address = Column(String(42), index=True, nullable=False)
    status = Column(SQLEnum(OrderStatus), nullable=False, default=OrderStatus.PENDING)
    tx_hash = Column(String(66), unique=True, nullable=True)
    amount_eth = Column(String, nullable=True)
    shipping_street = Column(String, nullable=True)
    shipping_city = Column(String, nullable=True)
    shipping_zip = Column(String, nullable=True)
    shipping_country = Column(String, nullable=True)
    activation_code = Column(String(6), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )


class SensorData(Base):
    __tablename__ = "sensor_data"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    pm25 = Column(Float, nullable=False)
    pm10 = Column(Float, nullable=True)

    sensor = relationship("Sensor", back_populates="readings")


class ApiSubscription(Base):
    __tablename__ = "api_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), index=True, nullable=False)
    plan = Column(SQLEnum(SubscriptionPlan), nullable=False)
    api_key = Column(String(64), unique=True, index=True, nullable=False)
    tx_hash = Column(String(66), nullable=True)
    subscribed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    status = Column(SQLEnum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.ACTIVE)


class MerkleEpoch(Base):
    __tablename__ = "merkle_epochs"

    id = Column(Integer, primary_key=True, index=True)
    merkle_root = Column(String(66), unique=True, nullable=False)
    ipfs_cid = Column(String, nullable=False)
    tx_hash = Column(String(66), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    total_rewards = Column(String, nullable=True)


class RewardAllocation(Base):
    __tablename__ = "reward_allocations"

    id = Column(Integer, primary_key=True, index=True)
    epoch_id = Column(Integer, ForeignKey("merkle_epochs.id"), index=True, nullable=False)
    wallet_address = Column(String(42), index=True, nullable=False)
    cumulative_amount = Column(String, nullable=False)
    proof = Column(Text, nullable=False)
    claimed = Column(Boolean, default=False, nullable=False)

    epoch = relationship("MerkleEpoch")

    __table_args__ = (
        UniqueConstraint("epoch_id", "wallet_address", name="uq_epoch_wallet"),
    )


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

    sensor = relationship("Sensor", back_populates="hourly_validations")


class WeeklySensorScore(Base):
    __tablename__ = "weekly_sensor_scores"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), index=True, nullable=False)
    week_start = Column(DateTime, index=True, nullable=False)
    week_end = Column(DateTime, index=True, nullable=False)
    cluster_id = Column(Integer, index=True, nullable=False, default=-1)
    total_readings = Column(Integer, nullable=False, default=0)
    comparable_readings = Column(Integer, nullable=False, default=0)
    trusted_readings = Column(Integer, nullable=False, default=0)
    cluster_size = Column(Integer, nullable=False, default=1)
    trust_score = Column(Float, nullable=False, default=0.0)
    peer_agreement_score = Column(Float, nullable=False, default=0.0)
    temporal_score = Column(Float, nullable=False, default=0.0)
    coverage_score = Column(Float, nullable=False, default=0.0)
    anomaly_ratio = Column(Float, nullable=False, default=0.0)
    avg_pm25 = Column(Float, nullable=False, default=0.0)
    avg_pm10 = Column(Float, nullable=True)
    calculated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    sensor = relationship("Sensor", back_populates="weekly_scores")


class ChainSyncCursor(Base):
    __tablename__ = "chain_sync_cursors"

    id = Column(Integer, primary_key=True, index=True)
    contract_address = Column(String(42), unique=True, nullable=False, index=True)
    last_synced_block = Column(BigInteger, nullable=False, default=0)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )
