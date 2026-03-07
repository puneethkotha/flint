"""aiokafka async consumer for Flint events."""

import asyncio
import json
from collections.abc import AsyncIterator, Callable, Coroutine
from typing import Any

import structlog
from aiokafka import AIOKafkaConsumer

from flint.config import get_settings

logger = structlog.get_logger(__name__)


class FlintConsumer:
    """Async Kafka consumer wrapper."""

    def __init__(
        self,
        topics: list[str],
        group_id: str,
        handler: Callable[[str, dict[str, Any]], Coroutine[Any, Any, None]],
    ) -> None:
        self.topics = topics
        self.group_id = group_id
        self.handler = handler
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        settings = get_settings()
        self._consumer = AIOKafkaConsumer(
            *self.topics,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id=self.group_id,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=True,
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._consume_loop())
        logger.info("kafka_consumer_started", topics=self.topics, group=self.group_id)

    async def _consume_loop(self) -> None:
        if self._consumer is None:
            return
        try:
            async for msg in self._consumer:
                try:
                    await self.handler(msg.topic, msg.value)
                except Exception as exc:
                    logger.error(
                        "consumer_handler_error",
                        topic=msg.topic,
                        error=str(exc),
                    )
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("consumer_loop_error", error=str(exc))

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._consumer is not None:
            await self._consumer.stop()
            self._consumer = None
        logger.info("kafka_consumer_stopped")


async def stream_topic(
    topic: str, group_id: str, max_messages: int = 100
) -> AsyncIterator[dict[str, Any]]:
    """One-shot async generator for reading messages from a topic."""
    settings = get_settings()
    consumer = AIOKafkaConsumer(
        topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=group_id,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        auto_offset_reset="latest",
        consumer_timeout_ms=5000,
    )
    await consumer.start()
    count = 0
    try:
        async for msg in consumer:
            yield msg.value
            count += 1
            if count >= max_messages:
                break
    finally:
        await consumer.stop()
