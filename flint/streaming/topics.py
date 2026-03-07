"""Kafka topic constants."""

TOPIC_JOB_EVENTS = "flint.job.events"
TOPIC_TASK_EVENTS = "flint.task.events"
TOPIC_CORRUPTION_EVENTS = "flint.corruption.events"
TOPIC_METRICS = "flint.metrics"

ALL_TOPICS = [
    TOPIC_JOB_EVENTS,
    TOPIC_TASK_EVENTS,
    TOPIC_CORRUPTION_EVENTS,
    TOPIC_METRICS,
]
