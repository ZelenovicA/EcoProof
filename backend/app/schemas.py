from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class OrderStatusEnum(str, Enum):
    PENDING = "pending"
    SHIPPING = "shipping"
    ARRIVED = "arrived"
    CANCELLED = "cancelled"


class SubscriptionPlanEnum(str, Enum):
    STARTER = "starter"
    BUSINESS = "business"
    ENTERPRISE = "enterprise"


class SubscriptionStatusEnum(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


def _normalize_plan(value: str | SubscriptionPlanEnum | None) -> str | SubscriptionPlanEnum | None:
    if value is None or isinstance(value, SubscriptionPlanEnum):
        return value
    normalized = value.strip().lower()
    alias_map = {
        "starter": SubscriptionPlanEnum.STARTER,
        "business": SubscriptionPlanEnum.BUSINESS,
        "enterprise": SubscriptionPlanEnum.ENTERPRISE,
    }
    return alias_map.get(normalized, value)


class UserLogin(BaseModel):
    wallet_address: str
    signature: str


class SensorCreate(BaseModel):
    device_id: str
    activation_code: Optional[str] = None
    lat: float
    lon: float
    owner_address: str
    sensor_type: str = "AQ-V2"
    device_id_hash: Optional[str] = None
    active: bool = True
    registered_at: datetime = Field(default_factory=datetime.utcnow)


class SensorUpdate(BaseModel):
    lat: Optional[float] = None
    lon: Optional[float] = None
    owner_address: Optional[str] = None
    sensor_type: Optional[str] = None
    device_id_hash: Optional[str] = None
    activation_code: Optional[str] = None
    active: Optional[bool] = None


class SensorResponse(BaseModel):
    id: int
    device_id: str
    activation_code: Optional[str] = None
    lat: float
    lon: float
    owner_address: str
    sensor_type: str
    device_id_hash: Optional[str] = None
    active: bool
    registered_at: datetime

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


class HourlyValidationResponse(BaseModel):
    id: int
    sensor_id: int
    timestamp_hour: datetime
    cluster_id: int
    avg_pm25: float
    avg_pm10: Optional[float] = None
    variance_pm25: float
    total_readings: int
    valid_readings: int

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


class SensorOrderCreate(BaseModel):
    buyer_address: str
    shipping_street: str
    shipping_city: str
    shipping_zip: str
    shipping_country: str
    tx_hash: Optional[str] = None
    amount_eth: Optional[str] = None


class SensorOrderResponse(BaseModel):
    id: int
    buyer_address: str
    status: OrderStatusEnum
    tx_hash: Optional[str]
    amount_eth: Optional[str]
    shipping_street: Optional[str]
    shipping_city: Optional[str]
    shipping_zip: Optional[str]
    shipping_country: Optional[str]
    activation_code: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SensorOrderStatusUpdate(BaseModel):
    status: OrderStatusEnum
    activation_code: Optional[str] = None


class ApiSubscriptionCreate(BaseModel):
    wallet_address: str
    plan: SubscriptionPlanEnum
    tx_hash: Optional[str] = None

    @field_validator("plan", mode="before")
    @classmethod
    def normalize_plan(cls, value: str | SubscriptionPlanEnum) -> str | SubscriptionPlanEnum:
        return _normalize_plan(value)


class ApiSubscriptionResponse(BaseModel):
    id: int
    wallet_address: str
    plan: SubscriptionPlanEnum
    api_key: str
    tx_hash: Optional[str]
    subscribed_at: datetime
    expires_at: datetime
    status: SubscriptionStatusEnum

    class Config:
        from_attributes = True


class ApiSubscriptionUpdate(BaseModel):
    plan: Optional[SubscriptionPlanEnum] = None
    status: Optional[SubscriptionStatusEnum] = None
    tx_hash: Optional[str] = None

    @field_validator("plan", mode="before")
    @classmethod
    def normalize_plan(cls, value: str | SubscriptionPlanEnum | None) -> str | SubscriptionPlanEnum | None:
        return _normalize_plan(value)


class MerkleEpochCreate(BaseModel):
    merkle_root: str
    ipfs_cid: str
    tx_hash: Optional[str] = None
    total_rewards: Optional[str] = None


class MerkleEpochResponse(BaseModel):
    id: int
    merkle_root: str
    ipfs_cid: str
    tx_hash: Optional[str]
    created_at: datetime
    total_rewards: Optional[str]

    class Config:
        from_attributes = True


class RewardAllocationCreate(BaseModel):
    epoch_id: int
    wallet_address: str
    cumulative_amount: str
    proof: str


class RewardAllocationResponse(BaseModel):
    id: int
    epoch_id: int
    wallet_address: str
    cumulative_amount: str
    proof: str
    claimed: bool

    class Config:
        from_attributes = True


class UserRewardInfo(BaseModel):
    wallet_address: str
    cumulative_amount: str
    proof: list[str]
    merkle_root: str
    already_claimed: bool


class UserScoreResponse(BaseModel):
    id: int
    wallet_address: str
    score: float
    cumulative_amount: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserScoreUpdate(BaseModel):
    score: Optional[float] = None
    cumulative_amount: Optional[str] = None


class MerkleTreeResponse(BaseModel):
    epoch_id: int
    merkle_root: str
    ipfs_json: dict
    total_rewards: str
    num_users: int
    ipfs_cid: Optional[str] = None

class RegistrationStatusEnum(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
class PendingRegistrationCreate(BaseModel):
    activation_code: str
    wallet_address: str
    lat: float
    lon: float
class PendingRegistrationResponse(BaseModel):
    id: int
    activation_code: str
    wallet_address: str
    lat: float
    lon: float
    status: RegistrationStatusEnum
    order_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True
class PendingRegistrationUpdate(BaseModel):
    status: RegistrationStatusEnum