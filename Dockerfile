# ── Stage 1: Build dashboard ─────────────────────────────────────────────────
FROM node:20-alpine AS dashboard-builder

WORKDIR /app/dashboard
COPY dashboard/package.json .
RUN npm install --frozen-lockfile 2>/dev/null || npm install

COPY dashboard/ .
RUN npm run build

# ── Stage 2: Python builder ───────────────────────────────────────────────────
FROM python:3.11-slim AS python-builder

WORKDIR /app

RUN pip install uv

COPY pyproject.toml .
RUN uv sync --no-dev

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy Python virtual environment
COPY --from=python-builder /app/.venv /app/.venv

# Copy application code
COPY flint/ /app/flint/

# Copy built dashboard
COPY --from=dashboard-builder /app/dashboard/dist /app/dashboard/dist

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')"

CMD ["uvicorn", "flint.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
