"""aiokafka async producer for Flint events."""

import json
from typing import Any

import structlog
from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaConnectionError

from flint.config import get_settings
from flint.streaming.topics import ALL_TOPICS

logger = structlog.get_logger(__name__)

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer | None:
    """Return the global Kafka producer."""
    return _producer


async def start_producer() -> None:
    """Initialize and start the Kafka producer."""
    global _producer
    settings = get_settings()
    try:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            compression_type="gzip",
            acks="all",
            enable_idempotence=True,
            max_batch_size=16384,
        )
        await _producer.start()
        logger.info("kafka_producer_started", servers=settings.kafka_bootstrap_servers)
    except KafkaConnectionError as exc:
        logger.warning("kafka_producer_start_failed", error=str(exc))
        _producer = None


async def stop_producer() -> None:
    """Stop the Kafka producer gracefully."""
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None
        logger.info("kafka_producer_stopped")


async def publish_event(topic: str, event: dict[str, Any], key: str | None = None) -> bool:
    """Publish a JSON event to a Kafka topic. Returns False if unavailable."""
    if _producer is None:
        return False
    try:
        await _producer.send_and_wait(topic, value=event, key=key)
        return True
    except Exception as exc:
        logger.warning("kafka_publish_failed", topic=topic, error=str(exc))
        return False


async def ping_kafka() -> bool:
    """Check if Kafka is reachable."""
    settings = get_settings()
    try:
        probe = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            request_timeout_ms=3000,
        )
        await probe.start()
        await probe.stop()
        return True
    except Exception:
        return False
