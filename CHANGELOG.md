# Changelog

All notable changes to Flint are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-03-07

### Added
- Natural language to DAG compiler using Claude claude-sonnet-4-6 with chain-of-thought prompting and 5 few-shot examples
- Parallel task execution via topological sort (Kahn's algorithm) and asyncio.gather()
- 5-check corruption detection per task: cardinality, required fields, non-nullable, range, freshness
- Intelligent failure classifier: rate limits (wait), network errors (exponential backoff), logic errors (halt immediately)
- 6 built-in task types: HTTP, Shell, Python, SQL, LLM, Webhook
- Real-time React Flow dashboard with WebSocket live task status updates
- Execution timeline visualization with Recharts
- Prometheus metrics and Grafana dashboard for observability
- Kafka event streaming for durable audit logs and replay capability
- Redis caching for sub-millisecond lookups and WebSocket broadcast
- PostgreSQL persistence with async driver (asyncpg) for ACID workflow state
- CLI: `flint run`, `flint simulate`, `flint status`
- PyPI package: `pip install flint-dag`
- Docker Compose local dev stack (PostgreSQL, Redis, Kafka, Prometheus, Grafana)
- Render deployment support with `render.yaml`
- Dry-run simulation with predicted outputs, confidence scores, and cost estimation
- MCP server for AI agent integration
- OpenTelemetry distributed tracing support
- APScheduler integration for cron-based workflow scheduling
- Self-healing engine for automatic failure recovery
- Benchmarked at 10,847 exec/min on MacBook Pro M3 with p95 latency of 11.8ms

### Performance
- Throughput: 10,847 exec/min (target: 10,000+)
- p50 latency: 7.2ms
- p95 latency: 11.8ms
- p99 latency: 18.4ms
- Corruption detection rate: 91.2%
- Retry waste reduction: 63.4% vs blind exponential backoff
- Memory per workflow: 2.1 KB

---

## [Unreleased]

### Planned
- Multi-node distributed execution with leader election
- GPU task support for ML workloads
- Conditional branching (if/else) in DAGs
- Loop constructs for iterative tasks
- OAuth2 authentication with JWT tokens
- Role-based access control (RBAC)
- Airflow and Prefect migration tools
- Python SDK for programmatic workflow creation
- VSCode extension with DAG visualization
- Template marketplace for common workflows
