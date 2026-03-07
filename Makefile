.PHONY: dev test bench deploy install lint clean

dev:
	docker compose up -d && uv run uvicorn flint.api.app:app --reload --port 8000

test:
	uv run pytest tests/ -v

bench:
	uv run python tests/benchmarks/throughput_bench.py

deploy:
	railway up

install:
	uv sync

lint:
	uv run ruff check . && uv run mypy flint/

clean:
	docker compose down -v
