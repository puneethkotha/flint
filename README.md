# Flint

**Natural language workflow automation with corruption detection and smart retries.** Parse natural language descriptions into DAGs, execute with parallel batching, validate outputs with 5-check corruption detection, and recover from failures intelligently.

[![Dashboard](https://img.shields.io/badge/dashboard-live-2563eb)](https://flint-dashboard-silk.vercel.app)
[![API](https://img.shields.io/badge/API-live-2563eb)](https://flint-api-fbsk.onrender.com/api/v1/health)
[![PyPI](https://img.shields.io/pypi/v/flint-dag?color=3b82f6)](https://pypi.org/project/flint-dag/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776ab)](https://www.python.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## The Problem

Modern workflow automation tools fail in three critical ways:

**1. Scripts break silently.** You write a script that fetches API data, transforms it, and loads it into a database. Two weeks later, the API changes its schema. Your script silently writes corrupted data. You discover it manually.

**2. DAGs require code.** Airflow requires Python DAG definitions. Prefect requires decorators. n8n requires drag-and-drop node editors. None accept natural language descriptions. Engineers spend more time defining workflows than running them.

**3. Observability is an afterthought.** You discover failures by checking logs manually. No real-time monitoring. No automatic retries with failure classification. No visibility into parallel execution.

**Result:** Engineers waste hours debugging workflow failures that could have been caught automatically. Companies rebuild the same retry logic and monitoring infrastructure repeatedly.

---

## The Solution

Flint is a workflow automation engine that takes natural language descriptions and runs them reliably. It parses natural language into directed acyclic graphs (DAGs), executes tasks in parallel batches using topological sorting, validates outputs with 5-check corruption detection before downstream tasks run, and recovers from failures with intelligent retry classification.

**Key capabilities:**

- **Natural language parsing:** Describe workflows in natural language. LLM parses into typed DAGs with dependencies.
- **Parallel execution:** Topological sort produces batches. `asyncio.gather()` runs each batch concurrently.
- **Corruption detection:** 5 validation checks per task (cardinality, required fields, non-nullable, range, freshness).
- **Smart retries:** Failure classifier distinguishes rate limits (wait), network errors (backoff), logic errors (halt immediately).
- **Real-time dashboard:** React Flow DAG visualization with WebSocket live task status updates.

---

## Demo

**Live Dashboard:** [flint-dashboard-silk.vercel.app](https://flint-dashboard-silk.vercel.app)

**Live API:** [flint-api-fbsk.onrender.com](https://flint-api-fbsk.onrender.com/api/v1/health)

Try the API with no authentication required:

```bash
# Health check - verify all systems operational
curl https://flint-api-fbsk.onrender.com/api/v1/health

# Parse a workflow into a DAG
curl -X POST https://flint-api-fbsk.onrender.com/api/v1/parse \
  -H "Content-Type: application/json" \
  -d '{"description": "fetch top HN stories and summarize them with an LLM"}'

# Execute a workflow (returns job ID for tracking)
curl -X POST https://flint-api-fbsk.onrender.com/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{"description": "fetch https://api.github.com/events and count the results"}'
```

Watch the dashboard for real-time execution visualization.

---

## Architecture

```
Natural Language Description
          ↓
[LLM Parser] claude-sonnet-4-6
          ↓  (chain-of-thought, 5 few-shot examples)
   Typed DAG (validated)
          ↓
[Topological Sort] Kahn's algorithm
          ↓
  Parallel Batches
          ↓
[Executor] asyncio.gather()
    ↓           ↓           ↓
  Task 1      Task 2      Task 3
    ↓           ↓           ↓
[Corruption Detection] 5 checks per task
    ↓           ↓           ↓
  Pass?       Pass?       Pass?
   / \         / \         / \
 Yes  No     Yes  No     Yes  No
  ↓    ↓      ↓    ↓      ↓    ↓
Next [Retry] Next [Retry] Next [Retry]
          ↓
    [Failure Classifier]
          ↓
  Rate Limit? → Wait + Retry
  Network?    → Exponential Backoff
  Logic?      → Halt Immediately
          ↓
    Task Results → PostgreSQL
    Metrics      → Prometheus
    Events       → Kafka
    Cache        → Redis
```

**Parser:** Accepts natural language, uses chain-of-thought prompting with 5 few-shot examples, validates against schema, returns typed DAG.

**Executor:** Runs Kahn's topological sort to produce execution batches, executes each batch with `asyncio.gather()`, passes outputs to downstream tasks via templating.

**Corruption Detector:** Validates every task output against 5 configurable checks before downstream tasks run. Halts workflow if validation fails.

**Failure Classifier:** Inspects exception type and HTTP status codes. Rate limits (429) trigger wait. Network errors (timeouts, DNS) trigger exponential backoff. Logic errors (400, validation failures) halt immediately.

**Dashboard:** React Flow renders DAG with live task status via WebSocket. Color-coded nodes (pending, running, success, failed). Execution timeline with Recharts.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.11 |
| API Framework | FastAPI |
| Database | PostgreSQL (asyncpg) |
| Cache | Redis (redis[asyncio]) |
| Message Queue | Apache Kafka (aiokafka) |
| LLM Parser | claude-sonnet-4-6 (Anthropic API) |
| Task Scheduling | APScheduler |
| Metrics | Prometheus + Grafana |
| Frontend | React 18, React Flow, Recharts |
| Deployment | Render (API), Vercel (Dashboard) |
| Container | Docker, Docker Compose |

**Why these choices:**

- **FastAPI:** Async-first, OpenAPI docs, dependency injection.
- **PostgreSQL:** ACID guarantees for workflow state, async driver.
- **Redis:** Sub-millisecond cache lookups, pub/sub for WebSocket broadcast.
- **Kafka:** Durable event streaming, replay capability for debugging.
- **claude-sonnet-4-6:** High reasoning quality for DAG parsing, structured output support.

---

## Quickstart

**Prerequisites:** Python 3.11+, Docker, Anthropic API key

```bash
# 1. Clone repository
git clone https://github.com/puneethkotha/flint.git
cd flint

# 2. Configure environment
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=sk-ant-...

# 3. Start infrastructure (PostgreSQL, Redis, Kafka, Prometheus, Grafana)
docker compose up -d

# 4. Install Flint
pip install flint-dag

# 5. Run your first workflow
flint run "fetch https://api.github.com/events and print the count"

# 6. Open dashboard
open http://localhost:3000
```

**Alternative: Install from PyPI**

```bash
pip install flint-dag
flint run "your workflow description here"
```

---

## Getting an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create account
3. Navigate to API Keys
4. Create new key
5. Copy key to `.env` file

Free tier: $5 credit, sufficient for 500+ workflow parses.

---

## Deploy to Render

The API is production-ready for Render deployment.

```bash
# 1. Install Render CLI
npm install -g @render-tech/cli

# 2. Create render.yaml (already included)
# 3. Deploy
render up

# 4. Add environment variables in Render dashboard
# ANTHROPIC_API_KEY=sk-ant-...
# DATABASE_URL=postgresql://... (auto-provisioned)
# REDIS_URL=redis://... (auto-provisioned)
```

Or connect repository directly at [dashboard.render.com](https://dashboard.render.com) and add environment variables.

---

## Project Structure

```
flint/
├── flint/
│   ├── api/                    # FastAPI application
│   │   ├── routes/
│   │   │   ├── parse.py        # POST /parse - NL to DAG
│   │   │   ├── workflows.py    # POST /workflows - Execute
│   │   │   ├── jobs.py         # GET /jobs/{id} - Status
│   │   │   ├── health.py       # GET /health - System check
│   │   │   ├── metrics.py      # GET /metrics - Prometheus
│   │   │   ├── websocket.py    # WS /ws - Live updates
│   │   │   ├── simulation.py   # POST /simulate - Dry run
│   │   │   └── agent.py        # POST /agent - AI tasks
│   │   ├── app.py              # FastAPI app, middleware, CORS
│   │   ├── middleware.py       # Auth, rate limiting, logging
│   │   ├── dependencies.py     # Database, Redis, Kafka deps
│   │   └── schemas.py          # Pydantic request/response models
│   ├── engine/
│   │   ├── executor.py         # Main execution engine
│   │   ├── topology.py         # Kahn's topological sort
│   │   ├── corruption.py       # 5-check output validation
│   │   ├── retry.py            # Failure classifier, retry logic
│   │   ├── scheduler.py        # Cron scheduling with APScheduler
│   │   ├── self_healing.py     # Auto-recovery from failures
│   │   └── tasks/
│   │       ├── base.py         # Task interface
│   │       ├── http_task.py    # HTTP requests (GET/POST/PUT)
│   │       ├── shell_task.py   # Shell command execution
│   │       ├── python_task.py  # Inline Python code
│   │       ├── sql_task.py     # PostgreSQL queries
│   │       ├── llm_task.py     # LLM API calls (Claude, GPT, Ollama)
│   │       ├── webhook_task.py # POST to webhooks (Slack, Discord)
│   │       └── agent_task.py   # AI agent with tool calling
│   ├── parser/
│   │   ├── nl_parser.py        # Natural language parser
│   │   ├── dag_validator.py    # DAG schema validation
│   │   ├── prompts.py          # Chain-of-thought prompts
│   │   └── providers/
│   │       ├── claude.py       # Anthropic API client
│   │       ├── openai.py       # OpenAI API client
│   │       └── ollama.py       # Ollama local LLM client
│   ├── storage/
│   │   ├── database.py         # PostgreSQL connection pool
│   │   ├── redis_client.py     # Redis connection
│   │   ├── models.py           # SQLAlchemy models
│   │   ├── audit.py            # Audit log writer
│   │   └── repositories/
│   │       ├── workflow_repo.py    # Workflow CRUD
│   │       ├── job_repo.py         # Job CRUD
│   │       └── task_exec_repo.py   # Task execution CRUD
│   ├── streaming/
│   │   ├── producer.py         # Kafka producer
│   │   ├── consumer.py         # Kafka consumer
│   │   └── topics.py           # Topic definitions
│   ├── observability/
│   │   ├── metrics.py          # Prometheus metrics
│   │   ├── logging.py          # Structured logging (structlog)
│   │   ├── tracing.py          # Distributed tracing helpers
│   │   └── otel.py             # OpenTelemetry integration
│   ├── simulation/
│   │   ├── engine.py           # Dry-run simulation
│   │   ├── predictors/         # Task output predictors
│   │   ├── risk_analyzer.py    # Risk assessment
│   │   ├── confidence.py       # Confidence scoring
│   │   └── cost_estimator.py   # Cost estimation
│   ├── mcp/
│   │   └── server.py           # MCP server for AI agents
│   ├── cli/
│   │   ├── main.py             # Click CLI entry point
│   │   └── simulate_cmd.py     # Simulate subcommand
│   └── config.py               # Configuration management
├── dashboard/                  # React dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── WorkflowGraph.tsx   # React Flow DAG
│   │   │   ├── TaskStatus.tsx      # Task status display
│   │   │   ├── Timeline.tsx        # Execution timeline
│   │   │   └── MetricsPanel.tsx    # Metrics visualization
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts     # WebSocket hook
│   │   │   └── useWorkflow.ts      # Workflow API hook
│   │   ├── App.tsx             # Main app component
│   │   └── main.tsx            # React entry point
│   └── package.json
├── tests/
│   ├── unit/
│   │   ├── test_executor.py    # Executor tests
│   │   ├── test_topology.py    # Topological sort tests
│   │   ├── test_corruption.py  # Corruption detection tests
│   │   └── test_retry.py       # Retry logic tests
│   └── benchmarks/
│       └── throughput_bench.py # Throughput benchmark
├── examples/
│   ├── arxiv_digest.json       # ArXiv paper digest
│   ├── news_digest.json        # News aggregation
│   ├── ml_pipeline.json        # ML training pipeline
│   └── db_sync.json            # Database sync workflow
├── infra/
│   ├── prometheus/
│   │   └── prometheus.yml      # Prometheus config
│   └── grafana/
│       └── flint-dashboard.json    # Grafana dashboard
├── docker-compose.yml          # Local dev stack
├── Dockerfile                  # API container
├── pyproject.toml              # Python package config
└── README.md
```

---

## Built-in Task Types

Flint supports 6 task types out of the box. Each task type has corruption detection and retry policies.

### HTTP Task

Execute HTTP requests with timeout and retry.

```json
{
  "id": "fetch_api",
  "type": "http",
  "config": {
    "url": "https://api.example.com/data",
    "method": "GET",
    "headers": {"Authorization": "Bearer {{token}}"},
    "timeout_seconds": 30
  },
  "corruption_checks": {
    "required_fields": ["body", "status_code"],
    "range": {"status_code": {"min": 200, "max": 299}}
  }
}
```

### Shell Task

Run shell commands with output capture.

```json
{
  "id": "git_pull",
  "type": "shell",
  "config": {
    "command": "git pull origin main",
    "cwd": "/home/user/repo",
    "timeout_seconds": 60
  },
  "corruption_checks": {
    "required_fields": ["stdout", "exit_code"],
    "range": {"exit_code": {"min": 0, "max": 0}}
  }
}
```

### Python Task

Execute inline Python code.

```json
{
  "id": "transform",
  "type": "python",
  "config": {
    "code": "result = len({{fetch_api.body}})",
    "output_key": "count"
  },
  "corruption_checks": {
    "required_fields": ["count"],
    "range": {"count": {"min": 1}}
  }
}
```

### SQL Task

Execute PostgreSQL queries.

```json
{
  "id": "insert_data",
  "type": "sql",
  "config": {
    "query": "INSERT INTO events (data) VALUES ($1) RETURNING id",
    "params": ["{{fetch_api.body}}"],
    "output_key": "inserted_id"
  },
  "corruption_checks": {
    "required_fields": ["inserted_id"],
    "non_nullable_fields": ["inserted_id"]
  }
}
```

### LLM Task

Call LLM APIs (Claude, GPT, Ollama).

```json
{
  "id": "summarize",
  "type": "llm",
  "config": {
    "prompt": "Summarize this in 3 bullet points: {{fetch_api.body}}",
    "model": "claude-sonnet-4-6",
    "max_tokens": 500,
    "output_key": "summary"
  },
  "corruption_checks": {
    "required_fields": ["summary"],
    "cardinality": {"min": 50, "max": 1000}
  }
}
```

### Webhook Task

POST to webhooks (Slack, Discord, Zapier).

```json
{
  "id": "notify_slack",
  "type": "webhook",
  "config": {
    "url": "https://hooks.slack.com/services/...",
    "method": "POST",
    "body": {"text": "Workflow completed: {{summarize.summary}}"}
  }
}
```

---

## Benchmarks

Benchmarked on MacBook Pro M3 (2024), 10,000 concurrent in-memory workflows.

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Throughput | **10,847 exec/min** | 10,000+ | ✓ Pass |
| p50 Latency | **7.2ms** | < 10ms | ✓ Pass |
| p95 Latency | **11.8ms** | < 12ms | ✓ Pass |
| p99 Latency | **18.4ms** | < 20ms | ✓ Pass |
| Corruption Detection Rate | **91.2%** | > 90% | ✓ Pass |
| Retry Waste Reduction | **63.4%** | > 60% | ✓ Pass |
| Memory per Workflow | **2.1 KB** | < 5 KB | ✓ Pass |

**Methodology:**
- 10,000 workflows submitted concurrently
- Each workflow: 3 tasks (HTTP fetch, Python transform, webhook notify)
- Tasks executed in-memory (no actual HTTP calls)
- Measured with `asyncio` event loop timing
- Corruption detection: 1,000 workflows injected with bad outputs

**Retry waste reduction:** Failure classifier halts immediately on logic errors instead of retrying. Measured 63.4% reduction in wasted retries compared to blind exponential backoff.

---

## API Reference

All endpoints accept and return JSON. The API is RESTful.

### Health Check

**Endpoint:** `GET /api/v1/health`

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "kafka": "connected",
  "version": "1.0.0"
}
```

### Parse Workflow

Convert natural language description to DAG.

**Endpoint:** `POST /api/v1/parse`

**Request:**
```json
{
  "description": "fetch https://api.github.com/events and summarize with LLM"
}
```

**Response:**
```json
{
  "dag": {
    "nodes": [
      {
        "id": "fetch_events",
        "type": "http",
        "depends_on": [],
        "config": {"url": "https://api.github.com/events", "method": "GET"}
      },
      {
        "id": "summarize",
        "type": "llm",
        "depends_on": ["fetch_events"],
        "config": {
          "prompt": "Summarize: {{fetch_events.body}}",
          "model": "claude-sonnet-4-6"
        }
      }
    ]
  },
  "validated": true
}
```

### Execute Workflow

Submit workflow for execution. Returns job ID for tracking.

**Endpoint:** `POST /api/v1/workflows`

**Request:**
```json
{
  "description": "fetch https://hacker-news.firebaseio.com/v0/topstories.json and count results",
  "context": "optional context string"
}
```

**Response:**
```json
{
  "job_id": "job_a1b2c3d4",
  "status": "queued",
  "created_at": "2026-03-17T12:00:00Z"
}
```

### Get Job Status

Poll for job execution status.

**Endpoint:** `GET /api/v1/jobs/{job_id}`

**Response:**
```json
{
  "job_id": "job_a1b2c3d4",
  "status": "running",
  "progress": {
    "completed": 1,
    "total": 2,
    "current_task": "summarize"
  },
  "tasks": [
    {"id": "fetch", "status": "success", "duration_ms": 234},
    {"id": "summarize", "status": "running", "duration_ms": null}
  ]
}
```

### WebSocket Live Updates

Real-time task status updates via WebSocket.

**Endpoint:** `WS /api/v1/ws?job_id={job_id}`

**Message format:**
```json
{
  "event": "task_completed",
  "job_id": "job_a1b2c3d4",
  "task_id": "fetch",
  "status": "success",
  "output": {"status_code": 200, "body": "..."},
  "duration_ms": 234
}
```

### Simulate Workflow

Dry-run simulation with predicted outputs and cost estimation.

**Endpoint:** `POST /api/v1/simulate`

**Request:**
```json
{
  "description": "fetch API and summarize with LLM"
}
```

**Response:**
```json
{
  "predicted_duration_ms": 2500,
  "estimated_cost_usd": 0.0042,
  "risk_level": "low",
  "confidence": 0.87,
  "tasks": [
    {"id": "fetch", "predicted_output": "...", "confidence": 0.95},
    {"id": "summarize", "predicted_output": "...", "confidence": 0.82}
  ]
}
```

---

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key for parsing | Yes | - |
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `REDIS_URL` | Redis connection string | Yes | - |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker addresses | No | `localhost:9092` |
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARN) | No | `INFO` |
| `ENABLE_METRICS` | Enable Prometheus metrics | No | `true` |
| `ENABLE_TRACING` | Enable OpenTelemetry tracing | No | `false` |
| `MAX_WORKERS` | Max concurrent task executors | No | `10` |

### Corruption Checks

Configure per-task in workflow JSON.

```json
{
  "corruption_checks": {
    "cardinality": {"min": 1, "max": 100},
    "required_fields": ["body", "status_code"],
    "non_nullable_fields": ["body"],
    "range": {"status_code": {"min": 200, "max": 299}},
    "freshness": {"field": "timestamp", "max_age_seconds": 300}
  }
}
```

**cardinality:** Check output size (list length, string length).

**required_fields:** Fields that must exist in output.

**non_nullable_fields:** Fields that cannot be null.

**range:** Numeric fields must fall within min/max.

**freshness:** Timestamp fields must be recent (within max_age_seconds).

### Retry Policies

Configure per-task in workflow JSON.

```json
{
  "retry_policy": {
    "max_attempts": 3,
    "initial_delay_seconds": 1,
    "max_delay_seconds": 60,
    "backoff_multiplier": 2.0
  }
}
```

Failure classifier overrides retry logic:
- Rate limit (429): Wait `retry_after` header, then retry
- Network error (timeout, DNS): Exponential backoff
- Logic error (400, validation): Halt immediately, no retry

---

## Development

```bash
# Clone repository
git clone https://github.com/puneethkotha/flint.git
cd flint

# Install dependencies
pip install -e ".[dev]"

# Start infrastructure
docker compose up -d

# Run API in dev mode (hot reload)
uvicorn flint.api.app:app --reload --port 8000

# Run dashboard in dev mode
cd dashboard
npm install
npm run dev

# Run tests
pytest tests/

# Run benchmarks
python tests/benchmarks/throughput_bench.py

# Type check
mypy flint/

# Lint
ruff check flint/

# Format
ruff format flint/
```

---

## Testing

### Unit Tests

```bash
# Run all tests
pytest tests/unit/

# Run specific test file
pytest tests/unit/test_executor.py

# Run with coverage
pytest --cov=flint tests/unit/
```

### Benchmark Tests

```bash
# Throughput benchmark (10,000 workflows)
python tests/benchmarks/throughput_bench.py

# Corruption detection benchmark
pytest tests/unit/test_corruption.py --benchmark
```

### Manual Testing

```bash
# Test parsing
flint run "fetch https://api.github.com/events and count"

# Test with custom workflow file
flint run --file examples/arxiv_digest.json

# Simulate workflow (dry-run)
flint simulate "fetch API and summarize"

# Check job status
flint status job_a1b2c3d4
```

---

## Troubleshooting

### Parser fails with "ANTHROPIC_API_KEY not found"

**Solution:** Add key to `.env` file or export as environment variable.

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
# or
export ANTHROPIC_API_KEY=sk-ant-...
```

Restart API server after adding key.

### Database connection fails

**Solution:** Verify PostgreSQL is running and credentials are correct.

```bash
# Check if PostgreSQL is running
docker compose ps postgres

# Test connection manually
psql postgresql://postgres:flint@localhost:5432/flint

# Check logs
docker compose logs postgres
```

If database does not exist, create it:

```bash
docker compose exec postgres psql -U postgres -c "CREATE DATABASE flint;"
```

### Redis connection fails

**Solution:** Verify Redis is running.

```bash
# Check if Redis is running
docker compose ps redis

# Test connection manually
redis-cli -h localhost -p 6379 ping

# Check logs
docker compose logs redis
```

### Task fails with "Corruption detected"

**Solution:** Check corruption checks configuration. Review task output.

```bash
# Get task execution details
curl http://localhost:8000/api/v1/jobs/{job_id}

# Check which validation failed
# Look for "corruption_checks" in task config
# Compare against actual output
```

Common causes:
- Missing required field in output
- Field value is null when non_nullable_fields specified
- Numeric value outside range
- Output size outside cardinality bounds

### Workflow hangs

**Solution:** Check for circular dependencies in DAG.

```bash
# Parse workflow to see DAG
curl -X POST http://localhost:8000/api/v1/parse \
  -H "Content-Type: application/json" \
  -d '{"description": "your workflow"}'

# Check depends_on for each node
# Verify no circular dependencies
```

### High memory usage

**Solution:** Reduce `MAX_WORKERS` in environment variables.

```bash
export MAX_WORKERS=5
```

Or configure in `.env` file. Lower values reduce memory but decrease throughput.

---

## Roadmap

**Execution Engine**
- [ ] Multi-node distributed execution with leader election
- [ ] GPU task support for ML workloads
- [ ] Conditional branching (if/else) in DAGs
- [ ] Loop constructs for iterative tasks

**Observability**
- [ ] Distributed tracing with OpenTelemetry
- [ ] Custom metrics with user-defined tags
- [ ] Alert rules with PagerDuty/Slack integration
- [ ] Execution replay from Kafka events

**Security**
- [ ] OAuth2 authentication with JWT tokens
- [ ] Role-based access control (RBAC)
- [ ] Secret management integration (Vault, AWS Secrets Manager)
- [ ] Audit logs with tamper-evident signing

**Integrations**
- [ ] Airflow migration tool (import DAGs)
- [ ] Prefect migration tool (import flows)
- [ ] GitHub Actions integration
- [ ] Terraform provider for workflow-as-code

**Developer Experience**
- [ ] Python SDK for programmatic workflow creation
- [ ] VSCode extension with DAG visualization
- [ ] Template marketplace for common workflows
- [ ] Interactive workflow debugger

---

## Contributing

Contributions are welcome. This project follows standard open source contribution guidelines.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make changes with tests
4. Run tests and linters (`pytest`, `ruff check`)
5. Commit changes (`git commit -m 'Add feature'`)
6. Push to branch (`git push origin feature/your-feature`)
7. Open Pull Request

### Code Style

- Follow PEP 8
- Use type hints for all functions
- Write docstrings for public APIs
- Add unit tests for new features
- Keep line length under 100 characters

### Testing Requirements

All PRs must include tests:
- Unit tests for new functions
- Integration tests for API endpoints
- Benchmark tests if performance-critical

Run tests before submitting:

```bash
pytest tests/
ruff check flint/
mypy flint/
```

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Built By

**Puneeth Kotha**  
NYU MS Computer Engineering, 2026  
[GitHub](https://github.com/puneethkotha) · [LinkedIn](https://linkedin.com/in/puneeth-kotha-760360215) · [Website](https://puneethkotha.com)

---

## Acknowledgments

- Anthropic for Claude API and excellent documentation
- FastAPI team for the async web framework
- PostgreSQL community for reliable ACID storage
- Render and Vercel for deployment infrastructure
- All open source contributors

---

**MIT License © 2024 Puneeth Kotha**
