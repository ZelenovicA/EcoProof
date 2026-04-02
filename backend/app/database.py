import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()


def _build_database_url() -> str:
    explicit_url = os.getenv("DATABASE_URL")
    if explicit_url:
        return explicit_url

    db_user = os.getenv("POSTGRES_USER")
    db_password = os.getenv("POSTGRES_PASSWORD")
    db_host = os.getenv("POSTGRES_HOST")
    db_port = os.getenv("POSTGRES_PORT")
    db_name = os.getenv("POSTGRES_DB")

    if all([db_user, db_password, db_host, db_port, db_name]):
        return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

    return "sqlite:///./ecoproof.db"


SQLALCHEMY_DATABASE_URL = _build_database_url()

engine_kwargs = {"pool_pre_ping": True}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _column_map(inspector, table_name: str) -> dict[str, dict]:
    return {column["name"]: column for column in inspector.get_columns(table_name)}


def ensure_compat_schema() -> None:
    """
    Best-effort compatibility adjustments for existing dev databases.
    This keeps iterative hackathon schema changes from breaking startup.
    """
    if engine.dialect.name != "postgresql":
        return

    inspector = inspect(engine)

    statements: list[str] = []

    if inspector.has_table("sensors"):
        sensor_columns = _column_map(inspector, "sensors")
        if "device_id_hash" not in sensor_columns:
            statements.append("ALTER TABLE sensors ADD COLUMN device_id_hash VARCHAR(66)")
        if "sensor_type" not in sensor_columns:
            statements.append("ALTER TABLE sensors ADD COLUMN sensor_type VARCHAR(64)")
        statements.append("UPDATE sensors SET sensor_type = 'AQ-V2' WHERE sensor_type IS NULL")
        if "active" not in sensor_columns:
            statements.append("ALTER TABLE sensors ADD COLUMN active BOOLEAN DEFAULT TRUE")
        statements.append("UPDATE sensors SET active = TRUE WHERE active IS NULL")
        activation_code_column = sensor_columns.get("activation_code")
        if activation_code_column and not activation_code_column.get("nullable", True):
            statements.append("ALTER TABLE sensors ALTER COLUMN activation_code DROP NOT NULL")

    if inspector.has_table("sensor_orders"):
        order_columns = _column_map(inspector, "sensor_orders")
        if "activation_code" not in order_columns:
            statements.append("ALTER TABLE sensor_orders ADD COLUMN activation_code VARCHAR(6)")
        if "updated_at" not in order_columns:
            statements.append("ALTER TABLE sensor_orders ADD COLUMN updated_at TIMESTAMP DEFAULT NOW()")
        if "created_at" in order_columns:
            statements.append("UPDATE sensor_orders SET updated_at = created_at WHERE updated_at IS NULL")
        # Backfill missing activation codes with random 6-digit codes
        statements.append(
            "UPDATE sensor_orders SET activation_code = LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0') "
            "WHERE activation_code IS NULL OR activation_code = ''"
        )

    if inspector.has_table("api_subscriptions"):
        api_subscription_columns = _column_map(inspector, "api_subscriptions")
        if "tx_hash" not in api_subscription_columns:
            statements.append("ALTER TABLE api_subscriptions ADD COLUMN tx_hash VARCHAR(66)")

    if inspector.has_table("merkle_epochs"):
        merkle_epoch_columns = _column_map(inspector, "merkle_epochs")
        if "total_rewards" not in merkle_epoch_columns:
            statements.append("ALTER TABLE merkle_epochs ADD COLUMN total_rewards VARCHAR")

    if inspector.has_table("reward_allocations"):
        reward_allocation_columns = _column_map(inspector, "reward_allocations")
        if "claimed" not in reward_allocation_columns:
            statements.append("ALTER TABLE reward_allocations ADD COLUMN claimed BOOLEAN DEFAULT FALSE")
        statements.append("UPDATE reward_allocations SET claimed = FALSE WHERE claimed IS NULL")

    if inspector.has_table("user_scores"):
        user_score_columns = _column_map(inspector, "user_scores")
        if "cumulative_amount" not in user_score_columns:
            statements.append("ALTER TABLE user_scores ADD COLUMN cumulative_amount VARCHAR DEFAULT '0'")
        statements.append("UPDATE user_scores SET cumulative_amount = '0' WHERE cumulative_amount IS NULL")

    if not statements:
        return

    for statement in statements:
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(statement)
        except Exception:
            # Existing local dev databases can vary a lot; failures here
            # should not block the app from starting.
            continue