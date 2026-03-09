"""Agent Mode — conversational workflow builder with streaming SSE."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Annotated, Any, AsyncGenerator

import anthropic
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from flint.api.dependencies import get_db_pool, get_executor, get_redis
from flint.config import get_settings
from flint.moderation import check_content

logger = structlog.get_logger(__name__)
router = APIRouter()

# ─── System prompt ────────────────────────────────────────────────────────────

AGENT_SYSTEM_PROMPT = """You are Flint's AI automation assistant — a friendly, expert workflow engineer.

Your job: understand what the user wants to automate, ask at most 2 clarifying questions, then build and run it.

RULES:
1. Ask at most 2 short clarifying questions across the whole conversation
2. Focus on: trigger, action, and frequency (these are the 3 things you need)
3. Once you have enough info, output INTENT_CLEAR: on its own line, followed by a friendly confirmation
4. INTENT_CLEAR: must be followed by a concise one-sentence description of the workflow
5. Be warm, confident, and technical when the user wants technical details
6. Never ask for information you don't actually need to build the workflow

Format for INTENT_CLEAR:
INTENT_CLEAR: <one-sentence workflow description here>
<friendly confirmation message to the user>

Example workflow descriptions:
- "Every day at 9am, fetch weather data from OpenWeatherMap API and send a Slack notification"
- "Every hour, run a Python script that checks database health and posts results to a webhook"
- "On demand, call GPT-4 to summarize the top 5 HN posts and email to user@example.com"

When the user is vague (e.g., "automate my emails"), ask ONE specific question like:
"What should trigger this — a new email arriving, a schedule, or something else?"
"""

# ─── Helpers ──────────────────────────────────────────────────────────────────


async def _push_event(redis: Any, session_id: str, event: dict) -> None:
    """Push an SSE event to the Redis list for this session."""
    await redis.rpush(f"agent:stream:{session_id}", json.dumps(event))
    await redis.expire(f"agent:stream:{session_id}", 3600)


async def _get_history(redis: Any, session_id: str) -> list[dict]:
    """Load conversation history from Redis."""
    raw = await redis.get(f"agent:history:{session_id}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return []
    return []


async def _save_history(redis: Any, session_id: str, history: list[dict]) -> None:
    """Persist conversation history to Redis (TTL 1h)."""
    await redis.set(f"agent:history:{session_id}", json.dumps(history), ex=3600)


def _detect_schedule(history: list[dict]) -> str | None:
    """Heuristic: extract a cron schedule from the conversation if mentioned."""
    text = " ".join(m["content"] for m in history if m["role"] == "user").lower()
    if "every hour" in text or "hourly" in text:
        return "0 * * * *"
    if "every 30 min" in text or "every half" in text:
        return "*/30 * * * *"
    if "every 15 min" in text:
        return "*/15 * * * *"
    if "every day" in text or "daily" in text or "each day" in text:
        # Look for time hint
        import re
        m = re.search(r"at (\d+)(?::(\d+))?\s*(am|pm)?", text)
        if m:
            h = int(m.group(1))
            mins = int(m.group(2) or 0)
            meridiem = m.group(3)
            if meridiem == "pm" and h != 12:
                h += 12
            elif meridiem == "am" and h == 12:
                h = 0
            return f"{mins} {h} * * *"
        return "0 9 * * *"  # default: daily 9am
    if "every week" in text or "weekly" in text or "once a week" in text:
        return "0 9 * * 1"  # Monday 9am
    if "every month" in text or "monthly" in text:
        return "0 9 1 * *"  # 1st of month 9am
    return None


# ─── Routes ───────────────────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    workflow_created: bool = False
    workflow_id: str | None = None
    job_id: str | None = None
    dag: dict | None = None


@router.post("/agent/chat", response_model=ChatResponse)
async def agent_chat(
    body: ChatRequest,
    request: Request,
    pool: Annotated[object, Depends(get_db_pool)],
    executor: Annotated[object, Depends(get_executor)],
    redis: Annotated[object, Depends(get_redis)],
) -> ChatResponse:
    """
    Multi-turn conversational agent that builds, deploys, and runs workflows.
    Events are pushed to Redis and streamed via GET /agent/stream/{session_id}.
    """
    session_id = body.session_id or str(uuid.uuid4())
    settings = get_settings()

    # Content moderation
    block_reason = check_content(body.message)
    if block_reason:
        raise HTTPException(status_code=400, detail=block_reason)

    # Load history and append new user message
    history = await _get_history(redis, session_id)
    history.append({"role": "user", "content": body.message})

    # Push "thinking" to SSE stream
    await _push_event(redis, session_id, {
        "type": "thinking",
        "message": "Understanding your request...",
    })

    # ── Call Claude for agent reasoning ──────────────────────────────────────
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            system=AGENT_SYSTEM_PROMPT,
            messages=history,
        )
    except anthropic.RateLimitError as exc:
        err = "Rate limit hit — please wait a moment and try again."
        await _push_event(redis, session_id, {"type": "error", "message": err})
        await _push_event(redis, session_id, {"type": "end", "message": ""})
        return ChatResponse(session_id=session_id, reply=err)
    except anthropic.AuthenticationError as exc:
        err = "Authentication error — check your Anthropic API key in settings."
        await _push_event(redis, session_id, {"type": "error", "message": err})
        await _push_event(redis, session_id, {"type": "end", "message": ""})
        return ChatResponse(session_id=session_id, reply=err)
    except Exception as exc:
        logger.error("agent_claude_error", error=str(exc), session_id=session_id)
        err = f"AI error: {exc}"
        await _push_event(redis, session_id, {"type": "error", "message": err})
        await _push_event(redis, session_id, {"type": "end", "message": ""})
        return ChatResponse(session_id=session_id, reply=err)

    reply_text = response.content[0].text.strip()

    # Append assistant reply to history and save
    history.append({"role": "assistant", "content": reply_text})
    await _save_history(redis, session_id, history)

    # ── Stream the reply text ────────────────────────────────────────────────
    await _push_event(redis, session_id, {"type": "reply", "message": reply_text})

    # ── Check for intent signal ──────────────────────────────────────────────
    workflow_created = False
    workflow_id_str: str | None = None
    job_id_str: str | None = None
    dag_out: dict | None = None

    if "INTENT_CLEAR:" in reply_text:
        # Extract description from INTENT_CLEAR: line
        try:
            intent_line = next(
                line for line in reply_text.split("\n")
                if line.strip().startswith("INTENT_CLEAR:")
            )
            description = intent_line.split("INTENT_CLEAR:", 1)[1].strip()
        except StopIteration:
            description = body.message  # fallback

        # Re-check extracted description (model output could differ from input)
        block_reason = check_content(description)
        if block_reason:
            await _push_event(redis, session_id, {"type": "error", "message": block_reason})
            await _push_event(redis, session_id, {"type": "end", "message": ""})
            return ChatResponse(session_id=session_id, reply=reply_text)

        await _push_event(redis, session_id, {
            "type": "building",
            "message": f"Building: {description}",
        })

        try:
            # Parse description → DAG
            from flint.parser.nl_parser import parse_workflow
            dag = await parse_workflow(description)

            # Auto-inject detected schedule
            schedule = _detect_schedule(history)
            if schedule:
                dag["schedule"] = schedule
                dag.setdefault("timezone", "UTC")

            # Emit DAG structure for live visualization
            await _push_event(redis, session_id, {
                "type": "dag",
                "message": "DAG ready",
                "dag": dag,
            })

            # Persist workflow
            from flint.storage.repositories.workflow_repo import WorkflowRepository
            repo = WorkflowRepository(pool)  # type: ignore[arg-type]
            workflow = await repo.create(dag)
            workflow_id_str = str(workflow.id)
            workflow_created = True
            dag_out = dag

            # Save version snapshot
            try:
                from flint.api.routes.versions import save_workflow_version
                await save_workflow_version(
                    pool, workflow.id, workflow.dag_json,
                    change_summary="Created by Agent Mode",
                )
            except Exception:
                pass  # non-critical

            # Register cron schedule if present
            if workflow.schedule:
                from flint.engine.scheduler import schedule_workflow
                schedule_workflow(
                    workflow_id_str,
                    workflow.schedule,
                    workflow.timezone or "UTC",
                    executor=executor,
                    db_pool=pool,
                )

            await _push_event(redis, session_id, {
                "type": "running",
                "message": f"Deploying '{workflow.name}'...",
                "workflow_id": workflow_id_str,
            })

            # Trigger immediate first run
            job_id_str = str(uuid.uuid4())
            async with pool.acquire() as conn:  # type: ignore[attr-defined]
                await conn.execute(
                    """INSERT INTO jobs (id, workflow_id, status, trigger_type)
                       VALUES ($1, $2, 'queued', 'agent')""",
                    uuid.UUID(job_id_str),
                    workflow.id,
                )
            asyncio.create_task(  # noqa: RUF006
                executor.execute_dag(dag, job_id_str)  # type: ignore[attr-defined]
            )

            await _push_event(redis, session_id, {
                "type": "done",
                "message": (
                    f"✓ '{workflow.name}' is live! "
                    f"Running job {job_id_str[:8]}…"
                ),
                "workflow_id": workflow_id_str,
                "job_id": job_id_str,
            })

            logger.info(
                "agent_workflow_created",
                session_id=session_id,
                workflow_id=workflow_id_str,
                job_id=job_id_str,
            )

        except Exception as exc:
            logger.error("agent_workflow_error", error=str(exc), session_id=session_id)
            await _push_event(redis, session_id, {
                "type": "error",
                "message": f"Build failed: {exc}",
            })

    # Always push end sentinel so the SSE consumer knows to stop
    await _push_event(redis, session_id, {"type": "end", "message": ""})

    return ChatResponse(
        session_id=session_id,
        reply=reply_text,
        workflow_created=workflow_created,
        workflow_id=workflow_id_str,
        job_id=job_id_str,
        dag=dag_out,
    )


@router.get("/agent/stream/{session_id}")
async def agent_stream(session_id: str, request: Request) -> StreamingResponse:
    """
    SSE endpoint — pops events from the Redis list for this session.
    Consumers connect before calling POST /agent/chat to receive all events.
    """
    redis = request.app.state.redis

    async def _generate() -> AsyncGenerator[str, None]:
        timeout_ticks = 0
        max_ticks = 240  # 240 × 0.5s = 120s max wait

        while timeout_ticks < max_ticks:
            if await request.is_disconnected():
                break

            result = await redis.blpop(f"agent:stream:{session_id}", timeout=0.5)

            if result is None:
                timeout_ticks += 1
                yield ":\n\n"  # SSE keep-alive comment
                continue

            timeout_ticks = 0
            _, raw = result
            try:
                event = json.loads(raw)
            except Exception:
                continue

            yield f"data: {json.dumps(event)}\n\n"

            if event.get("type") == "end":
                break

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.delete("/agent/session/{session_id}", status_code=204)
async def clear_agent_session(session_id: str, request: Request) -> None:
    """Clear all Redis state for an agent session."""
    redis = request.app.state.redis
    await redis.delete(f"agent:history:{session_id}")
    await redis.delete(f"agent:stream:{session_id}")
    logger.info("agent_session_cleared", session_id=session_id)
