"""Prometheus metrics for Flint."""

from prometheus_client import Counter, Gauge, Histogram, Info

# ── Job metrics ─────────────────────────────────────────────────────────────
JOBS_TOTAL = Counter(
    "flint_jobs_total",
    "Total number of jobs triggered",
    ["trigger_type", "status"],
)

JOBS_DURATION = Histogram(
    "flint_job_duration_seconds",
    "Job execution duration in seconds",
    ["status"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300),
)

JOBS_ACTIVE = Gauge(
    "flint_jobs_active",
    "Currently running jobs",
)

# ── Task metrics ─────────────────────────────────────────────────────────────
TASKS_TOTAL = Counter(
    "flint_tasks_total",
    "Total task executions",
    ["task_type", "status"],
)

TASKS_DURATION = Histogram(
    "flint_task_duration_seconds",
    "Task execution duration in seconds",
    ["task_type"],
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60),
)

TASKS_RETRIES = Counter(
    "flint_task_retries_total",
    "Total task retry attempts",
    ["task_type", "failure_type"],
)

# ── Corruption metrics ───────────────────────────────────────────────────────
CORRUPTION_DETECTED = Counter(
    "flint_corruption_detected_total",
    "Total corruption events detected",
    ["check_type"],
)

# ── Parser metrics ───────────────────────────────────────────────────────────
PARSE_REQUESTS = Counter(
    "flint_parse_requests_total",
    "Total NL parse requests",
    ["provider", "status"],
)

PARSE_DURATION = Histogram(
    "flint_parse_duration_seconds",
    "NL parse duration in seconds",
    ["provider"],
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30),
)

# ── API metrics ──────────────────────────────────────────────────────────────
HTTP_REQUESTS = Counter(
    "flint_http_requests_total",
    "Total HTTP requests to the API",
    ["method", "path", "status_code"],
)

HTTP_LATENCY = Histogram(
    "flint_http_latency_seconds",
    "HTTP request latency",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5),
)

# ── System info ──────────────────────────────────────────────────────────────
FLINT_INFO = Info("flint", "Flint version and build info")

try:
    from flint import __version__
    FLINT_INFO.info({"version": __version__, "engine": "asyncio"})
except Exception:
    pass
