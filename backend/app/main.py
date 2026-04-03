import json
import os
import secrets
from datetime import datetime, timedelta

import requests
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import database, models, schemas
from .chain_listener import ChainListener
from .models import Sensor, WeeklySensorScore
from .validation import run_weekly_validation

pinata_url = os.getenv("IPFS_API_URL", "https://api.pinata.cloud/pinning/pinJSONToIPFS")

models.Base.metadata.create_all(bind=database.engine)
database.ensure_compat_schema()

app = FastAPI(
    title="EcoProof API",
    description="API for EcoProof sensor, rewards, and blockchain-sync flows.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _normalized_window_end() -> datetime:
    return datetime.utcnow().replace(minute=0, second=0, microsecond=0)


def _looks_like_bytes32(value: str | None) -> bool:
    return bool(value and value.startswith("0x") and len(value) == 66)


def _normalize_device_identifier(value: str | None) -> str | None:
    if not value:
        return None
    return value.lower() if _looks_like_bytes32(value) else value


def _normalize_wallet_address(value: str | None) -> str | None:
    return value.lower() if value else None


def _find_sensor_by_device_identifier(db: Session, identifier: str | None) -> models.Sensor | None:
    normalized = _normalize_device_identifier(identifier)
    if normalized is None:
        return None

    if _looks_like_bytes32(normalized):
        return (
            db.query(models.Sensor)
            .filter(
                (models.Sensor.device_id == normalized)
                | (models.Sensor.device_id_hash == normalized)
            )
            .first()
        )

    return (
        db.query(models.Sensor)
        .filter(
            (models.Sensor.device_id == normalized)
            | (models.Sensor.activation_code == normalized)
        )
        .first()
    )


def _ensure_user_record(db: Session, wallet_address: str) -> None:
    normalized_wallet = _normalize_wallet_address(wallet_address)
    if not normalized_wallet:
        return

    existing = db.query(models.User).filter(func.lower(models.User.wallet_address) == normalized_wallet).first()
    if existing is None:
        db.add(models.User(wallet_address=normalized_wallet))
        db.flush()


def _generate_activation_code(db: Session) -> str:
    for _ in range(100):
        code = f"{secrets.randbelow(1_000_000):06d}"
        existing_order = (
            db.query(models.SensorOrder.id)
            .filter(models.SensorOrder.activation_code == code)
            .first()
        )
        existing_sensor = (
            db.query(models.Sensor.id)
            .filter(models.Sensor.activation_code == code)
            .first()
        )
        if existing_order is None and existing_sensor is None:
            return code

    raise HTTPException(status_code=500, detail="Could not generate a unique activation code.")


def _assign_missing_order_activation_codes(db: Session) -> int:
    orders = (
        db.query(models.SensorOrder)
        .filter(
            (models.SensorOrder.activation_code.is_(None))
            | (models.SensorOrder.activation_code == "")
        )
        .order_by(models.SensorOrder.id.asc())
        .all()
    )

    for order in orders:
        order.activation_code = _generate_activation_code(db)

    if orders:
        db.commit()

    return len(orders)


def _ensure_weekly_scores(db: Session, days: int, refresh: bool) -> tuple[datetime, datetime] | None:
    target_end = _normalized_window_end()
    target_start = target_end - timedelta(days=days)

    existing_count = (
        db.query(func.count(WeeklySensorScore.id))
        .filter(
            WeeklySensorScore.week_start == target_start,
            WeeklySensorScore.week_end == target_end,
        )
        .scalar()
        or 0
    )

    if refresh or existing_count == 0:
        result = run_weekly_validation(days=days, end_time=target_end, db=db, persist=True)
        if result["weekly_records"] == 0:
            return None

    return target_start, target_end


def _serialize_weekly_score(score: WeeklySensorScore) -> dict:
    sensor = score.sensor
    return {
        "sensor_id": score.sensor_id,
        "device_id": sensor.device_id,
        "owner_address": sensor.owner_address,
        "week_start": score.week_start,
        "week_end": score.week_end,
        "cluster_id": score.cluster_id,
        "cluster_size": score.cluster_size,
        "total_readings": score.total_readings,
        "comparable_readings": score.comparable_readings,
        "trusted_readings": score.trusted_readings,
        "trust_score": round(score.trust_score, 2),
        "peer_agreement_score": round(score.peer_agreement_score, 2),
        "temporal_score": round(score.temporal_score, 2),
        "coverage_score": round(score.coverage_score, 2),
        "anomaly_ratio": round(score.anomaly_ratio, 4),
        "avg_pm25": round(score.avg_pm25, 2),
        "avg_pm10": round(score.avg_pm10, 2) if score.avg_pm10 is not None else None,
        "reward_multiplier": round(score.trust_score / 100.0, 4),
    }


def _build_epoch_response(epoch: models.MerkleEpoch, allocations: list[models.RewardAllocation]) -> schemas.MerkleTreeResponse:
    ipfs_json = {
        "merkle_root": epoch.merkle_root,
        "total_rewards": epoch.total_rewards or "0",
        "num_users": len(allocations),
        "allocations": [
            {
                "wallet_address": allocation.wallet_address,
                "cumulative_amount": allocation.cumulative_amount,
                "proof": json.loads(allocation.proof),
            }
            for allocation in allocations
        ],
    }
    return schemas.MerkleTreeResponse(
        epoch_id=epoch.id,
        merkle_root=epoch.merkle_root,
        ipfs_json=ipfs_json,
        total_rewards=epoch.total_rewards or "0",
        num_users=len(allocations),
        ipfs_cid=None if epoch.ipfs_cid == "pending" else epoch.ipfs_cid,
    )

def _clean_env_secret(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().strip('"').strip("'").replace("\n", "").replace("\r", "")
    return cleaned or None
def _post_pinata_json(pinata_url: str, headers: dict[str, str], payload: dict, filename: str) -> requests.Response:
    return requests.post(
        pinata_url,
        headers=headers,
        json={
            "pinataContent": payload,
            "pinataMetadata": {"name": filename},
        },
        timeout=30,
    )

def _pin_json_to_ipfs(payload: dict, filename: str) -> str:
    jwt = _clean_env_secret(os.getenv("PINATA_JWT"))
    api_key = _clean_env_secret(os.getenv("PINATA_API_KEY"))
    api_secret = _clean_env_secret(os.getenv("PINATA_API_SECRET"))

    auth_attempts: list[tuple[str, dict[str, str]]] = []
    if jwt:
        auth_attempts.append(
            (
                "jwt",
                {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {jwt}",
                },
            )
        )
    if api_key and api_secret:
        auth_attempts.append(
            (
                "api_key_secret",
                {
                    "Content-Type": "application/json",
                    "pinata_api_key": api_key,
                    "pinata_secret_api_key": api_secret,
                },
            )
        )
    if not auth_attempts:
        raise HTTPException(status_code=400, detail="Pinata credentials are not configured on the backend.")

    try:
        ast_response: requests.Response | None = None
        last_mode: str | None = None
        for mode, headers in auth_attempts:
            print(f"Pinata auth mode: {mode}")
            response = _post_pinata_json(pinata_url, headers, payload, filename)
            if response.ok:
                last_response = response
                last_mode = mode
                break
            print(f"Pinata error via {mode} {response.status_code}: {response.text}")
            last_response = response
            last_mode = mode
            if response.status_code not in {401, 403}:
                break
        if last_response is None or not last_response.ok:
            status_code = 502
            detail = "Failed to upload epoch JSON to IPFS."
            if last_response is not None:
                detail = f"Failed to upload epoch JSON to IPFS via {last_mode}: {last_response.status_code} - {last_response.text}"
            raise HTTPException(status_code=status_code, detail=detail)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Failed to upload epoch JSON to IPFS: {exc}") from exc

    data = last_response.json()
    ipfs_hash = data.get("IpfsHash")
    if not ipfs_hash:
        raise HTTPException(status_code=502, detail="Pinata response did not include an IpfsHash.")
    return ipfs_hash


@app.on_event("startup")
def startup_event() -> None:
    with database.SessionLocal() as db:
        _assign_missing_order_activation_codes(db)

    listener = ChainListener(database.SessionLocal)
    app.state.chain_listener = listener
    listener.start()


@app.on_event("shutdown")
def shutdown_event() -> None:
    listener = getattr(app.state, "chain_listener", None)
    if listener is not None:
        listener.stop()


@app.get("/")
def read_root():
    return {"status": "ok", "message": "EcoProof API is active"}


@app.get("/health")
def read_health():
    return {"status": "ok"}


@app.get("/chain/status")
def get_chain_status(db: Session = Depends(get_db)):
    listener = getattr(app.state, "chain_listener", None)
    base_status = listener.status() if listener is not None else {"configured": False, "running": False}

    cursor = None
    contract_address = base_status.get("contract_address")
    if contract_address:
        cursor = (
            db.query(models.ChainSyncCursor)
            .filter(models.ChainSyncCursor.contract_address == contract_address)
            .first()
        )

    return {
        **base_status,
        "last_synced_block": cursor.last_synced_block if cursor is not None else None,
        "last_synced_at": cursor.updated_at if cursor is not None else None,
    }


@app.post("/chain/sync")
def run_chain_sync():
    listener = getattr(app.state, "chain_listener", None)
    if listener is None:
        listener = ChainListener(database.SessionLocal)
        app.state.chain_listener = listener
    return listener.sync_once()


@app.post("/sensors/", response_model=schemas.SensorResponse)
def register_sensor(sensor: schemas.SensorCreate, db: Session = Depends(get_db)):
    owner_address = _normalize_wallet_address(sensor.owner_address) or sensor.owner_address
    _ensure_user_record(db, owner_address)

    device_id = _normalize_device_identifier(sensor.device_id) or sensor.device_id
    device_id_hash = _normalize_device_identifier(sensor.device_id_hash) or (
        device_id if _looks_like_bytes32(device_id) else None
    )

    existing = _find_sensor_by_device_identifier(db, device_id)
    if existing is None and device_id_hash and device_id_hash != device_id:
        existing = _find_sensor_by_device_identifier(db, device_id_hash)

    if existing is None:
        existing = models.Sensor(
            device_id=device_id,
            device_id_hash=device_id_hash,
            activation_code=sensor.activation_code,
            active=sensor.active,
            registered_at=sensor.registered_at,
            lat=sensor.lat,
            lon=sensor.lon,
            owner_address=owner_address,
            sensor_type=sensor.sensor_type,
        )
        db.add(existing)
    else:
        existing.device_id_hash = device_id_hash or existing.device_id_hash
        existing.activation_code = sensor.activation_code or existing.activation_code
        existing.active = sensor.active
        existing.lat = sensor.lat
        existing.lon = sensor.lon
        existing.owner_address = owner_address
        existing.sensor_type = sensor.sensor_type or existing.sensor_type

    db.commit()
    db.refresh(existing)
    return existing


@app.get("/sensors/", response_model=list[schemas.SensorResponse])
def list_sensors(owner_address: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Sensor)
    if owner_address:
        query = query.filter(func.lower(models.Sensor.owner_address) == _normalize_wallet_address(owner_address))
    return query.order_by(models.Sensor.registered_at.desc()).all()


@app.get("/sensors/{sensor_id}", response_model=schemas.SensorResponse)
def get_sensor(sensor_id: int, db: Session = Depends(get_db)):
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if sensor is None:
        raise HTTPException(status_code=404, detail="Sensor not found.")
    return sensor


@app.patch("/sensors/{sensor_id}", response_model=schemas.SensorResponse)
def update_sensor(sensor_id: int, update: schemas.SensorUpdate, db: Session = Depends(get_db)):
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if sensor is None:
        raise HTTPException(status_code=404, detail="Sensor not found.")

    payload = update.model_dump(exclude_unset=True)
    owner_address = payload.get("owner_address")
    if owner_address:
        payload["owner_address"] = _normalize_wallet_address(owner_address)
        _ensure_user_record(db, owner_address)

    for field, value in payload.items():
        setattr(sensor, field, value)

    db.commit()
    db.refresh(sensor)
    return sensor


@app.post("/telemetry/", response_model=schemas.SensorDataResponse)
def add_telemetry(data: schemas.SensorDataCreate, db: Session = Depends(get_db)):
    sensor = _find_sensor_by_device_identifier(db, data.device_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail="Sensor not found. Register first.")

    reading = models.SensorData(sensor_id=sensor.id, pm25=data.pm25, pm10=data.pm10)
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


@app.get("/telemetry/{sensor_id}", response_model=list[schemas.SensorDataResponse])
def get_telemetry(sensor_id: int, hours: int = 24, db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(hours=hours)
    return (
        db.query(models.SensorData)
        .filter(models.SensorData.sensor_id == sensor_id, models.SensorData.timestamp >= since)
        .order_by(models.SensorData.timestamp.desc())
        .all()
    )


@app.get("/validations/{sensor_id}", response_model=list[schemas.HourlyValidationResponse])
def get_validations(sensor_id: int, hours: int = 24, db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(hours=hours)
    return (
        db.query(models.HourlyValidation)
        .filter(
            models.HourlyValidation.sensor_id == sensor_id,
            models.HourlyValidation.timestamp_hour >= since,
        )
        .order_by(models.HourlyValidation.timestamp_hour.desc())
        .all()
    )


@app.post("/orders/", response_model=schemas.SensorOrderResponse)
def create_order(order: schemas.SensorOrderCreate, db: Session = Depends(get_db)):
    buyer_address = _normalize_wallet_address(order.buyer_address) or order.buyer_address
    existing = None
    if order.tx_hash:
        existing = db.query(models.SensorOrder).filter(models.SensorOrder.tx_hash == order.tx_hash).first()

    if existing is None:
        existing = models.SensorOrder(
            buyer_address=buyer_address,
            shipping_street=order.shipping_street,
            shipping_city=order.shipping_city,
            shipping_zip=order.shipping_zip,
            shipping_country=order.shipping_country,
            tx_hash=order.tx_hash,
            amount_eth=order.amount_eth,
            activation_code=_generate_activation_code(db),
        )
        db.add(existing)
    else:
        existing.shipping_street = order.shipping_street
        existing.shipping_city = order.shipping_city
        existing.shipping_zip = order.shipping_zip
        existing.shipping_country = order.shipping_country
        existing.amount_eth = order.amount_eth or existing.amount_eth
        existing.activation_code = existing.activation_code or _generate_activation_code(db)

    db.commit()
    db.refresh(existing)
    return existing


@app.get("/orders/", response_model=list[schemas.SensorOrderResponse])
def list_orders(buyer_address: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.SensorOrder)
    if buyer_address:
        query = query.filter(func.lower(models.SensorOrder.buyer_address) == _normalize_wallet_address(buyer_address))
    return query.order_by(models.SensorOrder.created_at.desc()).all()


@app.get("/orders/{order_id}", response_model=schemas.SensorOrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(models.SensorOrder).filter(models.SensorOrder.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@app.patch("/orders/{order_id}", response_model=schemas.SensorOrderResponse)
def update_order_status(order_id: int, update: schemas.SensorOrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(models.SensorOrder).filter(models.SensorOrder.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")

    order.status = update.status
    if update.activation_code is not None:
        order.activation_code = update.activation_code
    elif order.activation_code in {None, ""}:
        order.activation_code = _generate_activation_code(db)

    db.commit()
    db.refresh(order)
    return order


@app.post("/subscriptions/", response_model=schemas.ApiSubscriptionResponse)
def create_subscription(sub: schemas.ApiSubscriptionCreate, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    wallet_address = _normalize_wallet_address(sub.wallet_address) or sub.wallet_address
    _ensure_user_record(db, wallet_address)
    existing = (
        db.query(models.ApiSubscription)
        .filter(
            func.lower(models.ApiSubscription.wallet_address) == wallet_address,
            models.ApiSubscription.status == models.SubscriptionStatus.ACTIVE,
        )
        .first()
    )

    if existing is None:
        existing = models.ApiSubscription(
            wallet_address=wallet_address,
            plan=models.SubscriptionPlan(sub.plan.value),
            api_key=f"ecr_{secrets.token_hex(16)}",
            tx_hash=sub.tx_hash,
            subscribed_at=now,
            expires_at=now + timedelta(days=30),
            status=models.SubscriptionStatus.ACTIVE,
        )
        db.add(existing)
    else:
        existing.plan = models.SubscriptionPlan(sub.plan.value)
        existing.tx_hash = sub.tx_hash or existing.tx_hash
        existing.subscribed_at = now
        existing.expires_at = now + timedelta(days=30)
        existing.status = models.SubscriptionStatus.ACTIVE

    db.commit()
    db.refresh(existing)
    return existing


@app.get("/subscriptions/", response_model=list[schemas.ApiSubscriptionResponse])
def list_subscriptions(wallet_address: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.ApiSubscription)
    if wallet_address:
        query = query.filter(func.lower(models.ApiSubscription.wallet_address) == _normalize_wallet_address(wallet_address))
    return query.order_by(models.ApiSubscription.subscribed_at.desc()).all()


@app.get("/subscriptions/{sub_id}", response_model=schemas.ApiSubscriptionResponse)
def get_subscription(sub_id: int, db: Session = Depends(get_db)):
    subscription = db.query(models.ApiSubscription).filter(models.ApiSubscription.id == sub_id).first()
    if subscription is None:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    return subscription


@app.patch("/subscriptions/{sub_id}", response_model=schemas.ApiSubscriptionResponse)
def update_subscription(sub_id: int, update: schemas.ApiSubscriptionUpdate, db: Session = Depends(get_db)):
    subscription = db.query(models.ApiSubscription).filter(models.ApiSubscription.id == sub_id).first()
    if subscription is None:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    payload = update.model_dump(exclude_unset=True)
    if "plan" in payload and payload["plan"] is not None:
        payload["plan"] = models.SubscriptionPlan(payload["plan"])
    if "status" in payload and payload["status"] is not None:
        payload["status"] = models.SubscriptionStatus(payload["status"])

    for field, value in payload.items():
        setattr(subscription, field, value)

    db.commit()
    db.refresh(subscription)
    return subscription


@app.get("/scores/", response_model=list[schemas.UserScoreResponse])
def list_scores(db: Session = Depends(get_db)):
    return db.query(models.UserScore).order_by(models.UserScore.score.desc()).all()


@app.get("/scores/{wallet_address}", response_model=schemas.UserScoreResponse)
def get_score(wallet_address: str, db: Session = Depends(get_db)):
    normalized_wallet = _normalize_wallet_address(wallet_address) or wallet_address
    score = db.query(models.UserScore).filter(func.lower(models.UserScore.wallet_address) == normalized_wallet).first()
    if score is None:
        raise HTTPException(status_code=404, detail="No score found for this wallet.")
    return score


@app.patch("/scores/{wallet_address}", response_model=schemas.UserScoreResponse)
def update_score(wallet_address: str, update: schemas.UserScoreUpdate, db: Session = Depends(get_db)):
    normalized_wallet = _normalize_wallet_address(wallet_address) or wallet_address
    score = db.query(models.UserScore).filter(func.lower(models.UserScore.wallet_address) == normalized_wallet).first()
    if score is None:
        score = models.UserScore(wallet_address=normalized_wallet, score=0.0, cumulative_amount="0")
        db.add(score)

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(score, field, value)

    db.commit()
    db.refresh(score)
    return score


@app.post("/rewards/epochs/", response_model=schemas.MerkleEpochResponse)
def create_epoch(epoch: schemas.MerkleEpochCreate, db: Session = Depends(get_db)):
    existing = db.query(models.MerkleEpoch).filter(models.MerkleEpoch.merkle_root == epoch.merkle_root).first()
    if existing is not None:
        return existing

    created = models.MerkleEpoch(
        merkle_root=epoch.merkle_root,
        ipfs_cid=epoch.ipfs_cid,
        tx_hash=epoch.tx_hash,
        total_rewards=epoch.total_rewards,
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return created


@app.get("/rewards/epochs/", response_model=list[schemas.MerkleEpochResponse])
def list_epochs(db: Session = Depends(get_db)):
    return db.query(models.MerkleEpoch).order_by(models.MerkleEpoch.created_at.desc()).all()


@app.post("/rewards/allocations/", response_model=schemas.RewardAllocationResponse)
def create_allocation(alloc: schemas.RewardAllocationCreate, db: Session = Depends(get_db)):
    wallet_address = _normalize_wallet_address(alloc.wallet_address) or alloc.wallet_address
    existing = (
        db.query(models.RewardAllocation)
        .filter(
            models.RewardAllocation.epoch_id == alloc.epoch_id,
            func.lower(models.RewardAllocation.wallet_address) == wallet_address,
        )
        .first()
    )
    if existing is None:
        existing = models.RewardAllocation(
            epoch_id=alloc.epoch_id,
            wallet_address=wallet_address,
            cumulative_amount=alloc.cumulative_amount,
            proof=alloc.proof,
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)
    return existing


@app.get("/rewards/{wallet_address}", response_model=schemas.UserRewardInfo)
def get_user_reward(wallet_address: str, db: Session = Depends(get_db)):
    normalized_wallet = _normalize_wallet_address(wallet_address) or wallet_address
    latest_epoch = db.query(models.MerkleEpoch).order_by(models.MerkleEpoch.id.desc()).first()
    if latest_epoch is None:
        raise HTTPException(status_code=404, detail="No reward epochs found.")

    allocation = (
        db.query(models.RewardAllocation)
        .filter(
            models.RewardAllocation.epoch_id == latest_epoch.id,
            func.lower(models.RewardAllocation.wallet_address) == normalized_wallet,
        )
        .first()
    )
    if allocation is None:
        raise HTTPException(status_code=404, detail="No allocation found for this wallet.")

    return schemas.UserRewardInfo(
        wallet_address=allocation.wallet_address,
        cumulative_amount=allocation.cumulative_amount,
        proof=json.loads(allocation.proof),
        merkle_root=latest_epoch.merkle_root,
        already_claimed=allocation.claimed,
    )


@app.post("/rewards/generate-tree", response_model=schemas.MerkleTreeResponse)
def generate_merkle_tree(pin_to_ipfs: bool = False, db: Session = Depends(get_db)):
    from .merkle_tree import generate_epoch

    scores = db.query(models.UserScore).filter(models.UserScore.cumulative_amount != "0").all()
    if not scores:
        raise HTTPException(status_code=400, detail="No user scores available to build a Merkle tree.")

    users = [{"wallet_address": score.wallet_address, "cumulative_amount": score.cumulative_amount} for score in scores]
    result = generate_epoch(users)

    epoch = db.query(models.MerkleEpoch).filter(models.MerkleEpoch.merkle_root == result["merkle_root"]).first()
    if epoch is None:
        epoch = models.MerkleEpoch(
            merkle_root=result["merkle_root"],
            ipfs_cid="pending",
            total_rewards=result["total_rewards"],
        )
        db.add(epoch)
        db.flush()

        for allocation in result["allocations"]:
            db.add(
                models.RewardAllocation(
                    epoch_id=epoch.id,
                    wallet_address=allocation["wallet_address"],
                    cumulative_amount=allocation["cumulative_amount"],
                    proof=json.dumps(allocation["proof"]),
                )
            )

        db.commit()
        db.refresh(epoch)

    allocations = (
        db.query(models.RewardAllocation)
        .filter(models.RewardAllocation.epoch_id == epoch.id)
        .order_by(models.RewardAllocation.wallet_address.asc())
        .all()
    )

    if pin_to_ipfs and epoch.ipfs_cid == "pending":
        epoch_json = _build_epoch_response(epoch, allocations).ipfs_json
        epoch.ipfs_cid = _pin_json_to_ipfs(epoch_json, f"ecoproof_epoch_{epoch.id}.json")
        db.commit()
        db.refresh(epoch)

    return _build_epoch_response(epoch, allocations)

@app.post("/rewards/auto-generate", response_model=schemas.MerkleTreeResponse)
def auto_generate(db: Session = Depends(get_db)):
    """
    Seed telemetry for 3 test users, compute scores, generate Merkle tree, pin to IPFS.
    One-click flow for the admin panel.
    """
    from .seed_data import seed_and_score
    seed_and_score(db, days=7)
    return generate_merkle_tree(pin_to_ipfs=True, db=db)

@app.patch("/rewards/epochs/{epoch_id}/ipfs")
def update_epoch_ipfs(epoch_id: int, ipfs_cid: str, tx_hash: str | None = None, db: Session = Depends(get_db)):
    epoch = db.query(models.MerkleEpoch).filter(models.MerkleEpoch.id == epoch_id).first()
    if epoch is None:
        raise HTTPException(status_code=404, detail="Epoch not found.")

    epoch.ipfs_cid = ipfs_cid
    if tx_hash:
        epoch.tx_hash = tx_hash

    db.commit()
    return {"status": "updated"}


@app.post("/api/validation/run-weekly", response_model=schemas.ValidationRunResponse)
def run_validation_job(days: int = Query(7, ge=1, le=30), db: Session = Depends(get_db)):
    result = run_weekly_validation(days=days, db=db, persist=True)
    return {
        "week_start": result["week_start"],
        "week_end": result["week_end"],
        "sensor_count": result["sensor_count"],
        "hourly_records": result["hourly_records"],
        "weekly_records": result["weekly_records"],
    }


@app.get("/api/sensors/weekly-scores", response_model=schemas.WeeklyScoreboardResponse)
def get_weekly_scores(
    days: int = Query(7, ge=1, le=30),
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    window = _ensure_weekly_scores(db, days=days, refresh=refresh)
    if window is None:
        now = datetime.utcnow()
        return {
            "generated_at": now,
            "week_start": now,
            "week_end": now,
            "sensor_count": 0,
            "sensors": [],
        }

    week_start, week_end = window
    scores = (
        db.query(WeeklySensorScore)
        .join(Sensor, WeeklySensorScore.sensor_id == Sensor.id)
        .filter(WeeklySensorScore.week_start == week_start, WeeklySensorScore.week_end == week_end)
        .order_by(WeeklySensorScore.trust_score.desc(), WeeklySensorScore.sensor_id.asc())
        .all()
    )

    return {
        "generated_at": datetime.utcnow(),
        "week_start": week_start,
        "week_end": week_end,
        "sensor_count": len(scores),
        "sensors": [_serialize_weekly_score(score) for score in scores],
    }


@app.get("/api/sensors/{sensor_id}/weekly-score", response_model=schemas.WeeklySensorScoreResponse)
def get_sensor_weekly_score(
    sensor_id: int,
    days: int = Query(7, ge=1, le=30),
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    window = _ensure_weekly_scores(db, days=days, refresh=refresh)
    if window is None:
        raise HTTPException(status_code=404, detail="No scored telemetry found for the selected window.")

    week_start, week_end = window
    score = (
        db.query(WeeklySensorScore)
        .join(Sensor, WeeklySensorScore.sensor_id == Sensor.id)
        .filter(
            WeeklySensorScore.sensor_id == sensor_id,
            WeeklySensorScore.week_start == week_start,
            WeeklySensorScore.week_end == week_end,
        )
        .first()
    )
    if score is None:
        raise HTTPException(status_code=404, detail="No weekly score found for this sensor.")

    return _serialize_weekly_score(score)


@app.get("/api/sensors/{sensor_id}/weekly-reward")
def get_weekly_reward(
    sensor_id: int,
    days: int = Query(7, ge=1, le=30),
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    weekly_erc_pool = 100000.0

    window = _ensure_weekly_scores(db, days=days, refresh=refresh)
    if window is None:
        return {"message": "No scored telemetry found for the selected window."}

    week_start, week_end = window
    score = (
        db.query(WeeklySensorScore)
        .join(Sensor, WeeklySensorScore.sensor_id == Sensor.id)
        .filter(
            WeeklySensorScore.sensor_id == sensor_id,
            WeeklySensorScore.week_start == week_start,
            WeeklySensorScore.week_end == week_end,
        )
        .first()
    )
    if score is None:
        raise HTTPException(status_code=404, detail="Sensor not found in weekly scoring window.")

    total_locations = (
        db.query(func.count(func.distinct(WeeklySensorScore.cluster_id)))
        .filter(
            WeeklySensorScore.week_start == week_start,
            WeeklySensorScore.week_end == week_end,
            WeeklySensorScore.cluster_id != -1,
        )
        .scalar()
        or 1
    )

    pool_per_location = weekly_erc_pool / total_locations
    sensors_in_cluster = max(score.cluster_size, 1)
    max_reward_per_sensor = pool_per_location / sensors_in_cluster
    reward_multiplier = score.trust_score / 100.0
    earned_erc = max_reward_per_sensor * reward_multiplier

    return {
        "device_id": score.sensor.device_id,
        "week_window": {"week_start": week_start, "week_end": week_end},
        "network_stats": {
            "total_locations": total_locations,
            "pool_per_location": round(pool_per_location, 2),
        },
        "sensor_stats": {
            "sensors_at_this_location": sensors_in_cluster,
            "weekly_trust_score": f"{round(score.trust_score, 2)}%",
            "trusted_reading_ratio": round(score.trusted_readings / score.total_readings, 4)
            if score.total_readings
            else 0.0,
            "coverage_score": round(score.coverage_score, 2),
            "max_possible_reward": round(max_reward_per_sensor, 2),
        },
        "payout": {
            "earned_erc": round(earned_erc, 2),
            "currency": "ECR",
            "network": "Base",
            "destination_address": score.sensor.owner_address,
            "reward_multiplier": round(reward_multiplier, 4),
        },
        "score_breakdown": {
            "peer_agreement_score": round(score.peer_agreement_score, 2),
            "temporal_score": round(score.temporal_score, 2),
            "anomaly_ratio": round(score.anomaly_ratio, 4),
        },
    }
# ── Pending Registrations ──
@app.post("/registrations/", response_model=schemas.PendingRegistrationResponse)
def create_registration(reg: schemas.PendingRegistrationCreate, db: Session = Depends(get_db)):
    wallet_address = _normalize_wallet_address(reg.wallet_address) or reg.wallet_address
    code = reg.activation_code.strip()
    # Validate: code must exist in an order belonging to this wallet
    order = (
        db.query(models.SensorOrder)
        .filter(
            models.SensorOrder.activation_code == code,
            func.lower(models.SensorOrder.buyer_address) == wallet_address,
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=400, detail="Invalid activation code or it does not belong to your wallet.")
    # Check if already pending
    existing = (
        db.query(models.PendingRegistration)
        .filter(
            models.PendingRegistration.activation_code == code,
            func.lower(models.PendingRegistration.wallet_address) == wallet_address,
            models.PendingRegistration.status == models.RegistrationStatus.PENDING,
        )
        .first()
    )
    if existing is not None:
        return existing
    _ensure_user_record(db, wallet_address)
    pending = models.PendingRegistration(
        activation_code=code,
        wallet_address=wallet_address,
        lat=reg.lat,
        lon=reg.lon,
        order_id=order.id,
    )
    db.add(pending)
    db.commit()
    db.refresh(pending)
    return pending
@app.get("/registrations/", response_model=list[schemas.PendingRegistrationResponse])
def list_registrations(
    status: str | None = None,
    wallet_address: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.PendingRegistration)
    if status:
        query = query.filter(models.PendingRegistration.status == status)
    if wallet_address:
        query = query.filter(
            func.lower(models.PendingRegistration.wallet_address) == _normalize_wallet_address(wallet_address)
        )
    return query.order_by(models.PendingRegistration.created_at.desc()).all()
@app.patch("/registrations/{reg_id}", response_model=schemas.PendingRegistrationResponse)
def update_registration(reg_id: int, update: schemas.PendingRegistrationUpdate, db: Session = Depends(get_db)):
    reg = db.query(models.PendingRegistration).filter(models.PendingRegistration.id == reg_id).first()
    if reg is None:
        raise HTTPException(status_code=404, detail="Registration request not found.")
    reg.status = models.RegistrationStatus(update.status.value)
     # When approved, create the actual sensor record
    if update.status.value == "approved":
        import secrets as _secrets
        device_id = _secrets.token_hex(16)
        new_sensor = models.Sensor(
            device_id=device_id,
            activation_code=reg.activation_code,
            lat=reg.lat,
            lon=reg.lon,
            owner_address=reg.wallet_address,
            active=True,
        )
        db.add(new_sensor)

    db.commit()
    db.refresh(reg)
    return reg

