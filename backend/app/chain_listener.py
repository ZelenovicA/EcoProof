from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models

DEVICE_REGISTERED_TOPIC = "0x0c38606168b95b9169aaf161b682e94d874282589ad2685c508bd65b496d3fc8"
DEVICE_STATUS_CHANGED_TOPIC = "0x474aa30b69008da435e0b43b8b5c9e42e883eba26d538b52d7aa557e95c471a5"
METADATA_UPDATED_TOPIC = "0x8fab01a3c157561b5a118c03af5e8c0005ab80aca5f91b8380787cd15f68c84a"
REWARD_CLAIMED_TOPIC = "0x106f923f993c2149d49b4255ff723acafa1f2d94393f561d3eda32ae348f7241"
MERKLE_ROOT_UPDATED_TOPIC = "0x025711307d0fbbbc9c2c30e9b3b3991ecf8f1310bf182f453caa8235b0c21da9"


def _hex_to_int(value: str) -> int:
    return int(value, 16)


def _split_words(data: str) -> list[str]:
    payload = data[2:] if data.startswith("0x") else data
    return [payload[i : i + 64] for i in range(0, len(payload), 64) if payload[i : i + 64]]


def _decode_int256(word: str) -> int:
    return int.from_bytes(bytes.fromhex(word), byteorder="big", signed=True)


def _decode_uint256(word: str) -> int:
    return int.from_bytes(bytes.fromhex(word), byteorder="big", signed=False)


def _decode_bool(word: str) -> bool:
    return _decode_uint256(word) != 0


def _decode_address(topic: str) -> str:
    return f"0x{topic[-40:]}".lower()


def _decode_bytes32_string(topic: str) -> str:
    raw = bytes.fromhex(topic[2:] if topic.startswith("0x") else topic)
    return raw.rstrip(b"\x00").decode("utf-8", errors="ignore") or "AQ-V2"


def _decode_dynamic_string(data: str, word_index: int = 0) -> str | None:
    payload = data[2:] if data.startswith("0x") else data
    words = _split_words(payload)
    if len(words) <= word_index:
        return None

    offset = _decode_uint256(words[word_index]) * 2
    if len(payload) < offset + 64:
        return None

    length = int(payload[offset : offset + 64], 16)
    start = offset + 64
    end = start + (length * 2)
    if len(payload) < end:
        return None

    return bytes.fromhex(payload[start:end]).decode("utf-8", errors="ignore")


class ChainListener:
    def __init__(self, session_factory):
        self.session_factory = session_factory
        self.rpc_url = (os.getenv("RPC_URL") or os.getenv("VITE_RPC_URL") or "").strip()
        self.contract_address = (os.getenv("CONTRACT_ADDRESS") or os.getenv("VITE_CONTRACT_ADDRESS") or "").strip().lower()
        self.poll_interval_seconds = int(os.getenv("CHAIN_LISTENER_POLL_SECONDS", "10"))
        self.batch_size = int(os.getenv("CHAIN_LISTENER_BATCH_SIZE", "250"))
        self.start_block = os.getenv("CHAIN_LISTENER_START_BLOCK", "").strip()
        self.enabled = os.getenv("CHAIN_LISTENER_ENABLED", "true").lower() not in {"0", "false", "no"}

        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._session = requests.Session()
        self._block_timestamp_cache: dict[int, datetime] = {}

    def configuration_issue(self) -> str | None:
        if not self.enabled:
            return "CHAIN_LISTENER_ENABLED is disabled."
        if not self.rpc_url:
            return "RPC_URL is not configured."
        if not self.contract_address:
            return "CONTRACT_ADDRESS is not configured."
        if "your_infura_api_key" in self.rpc_url.lower():
            return "RPC_URL still contains a placeholder value."
        if self.contract_address.startswith("0xyour"):
            return "CONTRACT_ADDRESS still contains a placeholder value."
        return None

    def is_configured(self) -> bool:
        return self.configuration_issue() is None

    def start(self) -> None:
        if not self.is_configured() or self._thread is not None:
            return

        self._thread = threading.Thread(target=self._run_forever, name="ecoproof-chain-listener", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "configured": self.is_configured(),
            "configuration_issue": self.configuration_issue(),
            "contract_address": self.contract_address or None,
            "rpc_configured": bool(self.rpc_url),
            "poll_interval_seconds": self.poll_interval_seconds,
            "running": bool(self._thread and self._thread.is_alive()),
        }

    def sync_once(self) -> dict[str, Any]:
        if not self.is_configured():
            return {
                "configured": False,
                "reason": self.configuration_issue(),
                "synced": False,
                "from_block": None,
                "to_block": None,
                "events": {},
            }

        latest_block = self._get_latest_block_number()

        with self.session_factory() as db:
            cursor = self._get_or_create_cursor(db, latest_block)
            if latest_block <= cursor.last_synced_block:
                return {
                    "configured": True,
                    "synced": True,
                    "from_block": latest_block,
                    "to_block": latest_block,
                    "events": {},
                }

            counts = {
                "device_registered": 0,
                "device_status_changed": 0,
                "metadata_updated": 0,
                "reward_claimed": 0,
                "merkle_root_updated": 0,
            }

            from_block = cursor.last_synced_block + 1
            batch_start = from_block

            while batch_start <= latest_block:
                batch_end = min(batch_start + self.batch_size - 1, latest_block)
                logs = self._get_logs(batch_start, batch_end)

                logs.sort(
                    key=lambda log: (
                        _hex_to_int(log.get("blockNumber", "0x0")),
                        _hex_to_int(log.get("transactionIndex", "0x0")),
                        _hex_to_int(log.get("logIndex", "0x0")),
                    )
                )

                for log in logs:
                    self._process_log(db, log, counts)

                cursor.last_synced_block = batch_end
                db.commit()
                batch_start = batch_end + 1

            return {
                "configured": True,
                "synced": True,
                "from_block": from_block,
                "to_block": latest_block,
                "events": counts,
            }

    def _run_forever(self) -> None:
        while not self._stop_event.is_set():
            try:
                self.sync_once()
            except Exception as exc:  # pragma: no cover - background diagnostic
                print(f"[chain-listener] sync failed: {exc}")
            self._stop_event.wait(self.poll_interval_seconds)

    def _rpc(self, method: str, params: list[Any]) -> Any:
        response = self._session.post(
            self.rpc_url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            raise RuntimeError(payload["error"])
        return payload["result"]

    def _get_latest_block_number(self) -> int:
        return _hex_to_int(self._rpc("eth_blockNumber", []))

    def _get_logs(self, from_block: int, to_block: int) -> list[dict[str, Any]]:
        params = [
            {
                "address": self.contract_address,
                "fromBlock": hex(from_block),
                "toBlock": hex(to_block),
            }
        ]
        return self._rpc("eth_getLogs", params) or []

    def _get_or_create_cursor(self, db: Session, latest_block: int) -> models.ChainSyncCursor:
        cursor = (
            db.query(models.ChainSyncCursor)
            .filter(models.ChainSyncCursor.contract_address == self.contract_address)
            .first()
        )
        if cursor is not None:
            return cursor

        if self.start_block:
            try:
                initial_block = max(int(self.start_block), 0)
            except ValueError:
                initial_block = 0
        else:
            initial_block = 0

        cursor = models.ChainSyncCursor(
            contract_address=self.contract_address,
            last_synced_block=initial_block,
        )
        db.add(cursor)
        db.commit()
        db.refresh(cursor)
        return cursor

    def _get_block_timestamp(self, block_number_hex: str) -> datetime:
        block_number = _hex_to_int(block_number_hex)
        if block_number in self._block_timestamp_cache:
            return self._block_timestamp_cache[block_number]

        block = self._rpc("eth_getBlockByNumber", [block_number_hex, False])
        timestamp = datetime.fromtimestamp(_hex_to_int(block["timestamp"]), tz=timezone.utc).replace(tzinfo=None)
        self._block_timestamp_cache[block_number] = timestamp
        return timestamp

    def _find_sensor(self, db: Session, device_id: str) -> models.Sensor | None:
        return (
            db.query(models.Sensor)
            .filter(
                (models.Sensor.device_id == device_id)
                | (models.Sensor.device_id_hash == device_id)
            )
            .first()
        )

    def _ensure_user_record(self, db: Session, wallet_address: str) -> None:
        if not wallet_address:
            return

        existing = db.query(models.User).filter(func.lower(models.User.wallet_address) == wallet_address).first()
        if existing is None:
            db.add(models.User(wallet_address=wallet_address))
            db.flush()

    def _process_log(self, db: Session, log: dict[str, Any], counts: dict[str, int]) -> None:
        topics = log.get("topics", [])
        if not topics:
            return

        topic = topics[0].lower()
        if topic == DEVICE_REGISTERED_TOPIC:
            self._handle_device_registered(db, log)
            counts["device_registered"] += 1
        elif topic == DEVICE_STATUS_CHANGED_TOPIC:
            self._handle_device_status_changed(db, log)
            counts["device_status_changed"] += 1
        elif topic == METADATA_UPDATED_TOPIC:
            self._handle_metadata_updated(db, log)
            counts["metadata_updated"] += 1
        elif topic == REWARD_CLAIMED_TOPIC:
            self._handle_reward_claimed(db, log)
            counts["reward_claimed"] += 1
        elif topic == MERKLE_ROOT_UPDATED_TOPIC:
            self._handle_merkle_root_updated(db, log)
            counts["merkle_root_updated"] += 1

    def _handle_device_registered(self, db: Session, log: dict[str, Any]) -> None:
        topics = log["topics"]
        words = _split_words(log.get("data", "0x"))
        device_id = topics[1].lower()
        owner_address = _decode_address(topics[2])
        sensor_type = _decode_bytes32_string(topics[3])
        lat = _decode_int256(words[0]) / 1_000_000 if len(words) > 0 else 0.0
        lon = _decode_int256(words[1]) / 1_000_000 if len(words) > 1 else 0.0
        registered_at = self._get_block_timestamp(log["blockNumber"])
        self._ensure_user_record(db, owner_address)

        sensor = self._find_sensor(db, device_id)
        if sensor is None:
            sensor = models.Sensor(
                device_id=device_id,
                device_id_hash=device_id,
                activation_code=None,
                active=True,
                registered_at=registered_at,
                lat=lat,
                lon=lon,
                owner_address=owner_address,
                sensor_type=sensor_type,
            )
            db.add(sensor)
            return

        sensor.device_id_hash = device_id
        sensor.owner_address = owner_address
        sensor.sensor_type = sensor_type
        sensor.lat = lat
        sensor.lon = lon
        sensor.active = True

    def _handle_device_status_changed(self, db: Session, log: dict[str, Any]) -> None:
        topics = log["topics"]
        words = _split_words(log.get("data", "0x"))
        if not words:
            return

        sensor = self._find_sensor(db, topics[1].lower())
        if sensor is None:
            return

        sensor.active = _decode_bool(words[0])

    def _handle_metadata_updated(self, db: Session, log: dict[str, Any]) -> None:
        topics = log["topics"]
        words = _split_words(log.get("data", "0x"))
        sensor = self._find_sensor(db, topics[1].lower())
        if sensor is None:
            return

        if len(words) > 0:
            sensor.lat = _decode_int256(words[0]) / 1_000_000
        if len(words) > 1:
            sensor.lon = _decode_int256(words[1]) / 1_000_000

    def _handle_reward_claimed(self, db: Session, log: dict[str, Any]) -> None:
        wallet_address = _decode_address(log["topics"][1])
        (
            db.query(models.RewardAllocation)
            .filter(
                func.lower(models.RewardAllocation.wallet_address) == wallet_address,
                models.RewardAllocation.claimed.is_(False),
            )
            .update({"claimed": True}, synchronize_session=False)
        )

    def _handle_merkle_root_updated(self, db: Session, log: dict[str, Any]) -> None:
        merkle_root = log["topics"][1].lower()
        epoch = db.query(models.MerkleEpoch).filter(models.MerkleEpoch.merkle_root == merkle_root).first()
        if epoch is None:
            return

        ipfs_cid = _decode_dynamic_string(log.get("data", "0x"))
        if ipfs_cid:
            epoch.ipfs_cid = ipfs_cid
        epoch.tx_hash = log.get("transactionHash")
