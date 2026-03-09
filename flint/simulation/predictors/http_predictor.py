"""
HTTP Predictor — predicts REST API responses without making real calls.

Priority order:
  1. Historical runs for this exact node (highest confidence)
  2. Claude's knowledge of the API (if URL is a known service)
  3. Generic HTTP response shape based on method + status pattern

Drop into: flint/simulation/predictors/http_predictor.py
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

import anthropic

from flint.config import get_settings
from flint.simulation.engine import NodeSimulation, ConfidenceBasis  # type: ignore
from flint.simulation.predictors.base import BasePredictor

settings = get_settings()

# Well-known APIs Claude has strong knowledge of
WELL_KNOWN_APIS = {
    r"api\.stripe\.com":     "Stripe payments API",
    r"api\.github\.com":     "GitHub REST API",
    r"api\.slack\.com":      "Slack API",
    r"api\.twilio\.com":     "Twilio Communications API",
    r"api\.sendgrid\.com":   "SendGrid Email API",
    r"graph\.microsoft\.com":"Microsoft Graph API",
    r"api\.notion\.com":     "Notion API",
    r"api\.linear\.app":     "Linear project management API",
    r"api\.airtable\.com":   "Airtable API",
    r"hooks\.slack\.com":    "Slack Webhooks",
    r"api\.openai\.com":     "OpenAI API",
    r"api\.anthropic\.com":  "Anthropic Claude API",
}

CLAUDE_PREDICTION_SYSTEM = """You are a REST API response simulator for a workflow testing tool.
Given a URL, HTTP method, and request body, predict what the API would return.
You must respond with ONLY a valid JSON object — no markdown, no explanation.
The JSON must represent a realistic API response for the given endpoint.
Include realistic field names, types, and values. Use mock but plausible IDs.
If the API would return an error for bad input, include the error response instead."""


class HttpPredictor(BasePredictor):

    async def predict(
        self,
        node_id:          str,
        node_type:        str,
        config:           dict,
        workflow_id:      uuid.UUID,
        upstream_context: dict,
        input_data:       dict,
    ) -> NodeSimulation:

        url     = config.get("url", "")
        method  = (config.get("method", "GET") or "GET").upper()
        headers = config.get("headers", {}) or {}
        body    = config.get("body", {}) or {}

        # 1. Check historical runs first
        runs = await self.get_historical_runs(workflow_id, node_id)

        if runs:
            conf     = self.confidence_from_runs(runs)
            output   = self.most_common_output(runs)
            duration = self.avg_duration(runs)
            n        = len(runs)

            basis = (
                ConfidenceBasis.HISTORICAL_HIGH if n >= 50 else
                ConfidenceBasis.HISTORICAL_MED  if n >= 10 else
                ConfidenceBasis.HISTORICAL_LOW
            )
            note = f"Based on {n} historical runs of this node"

        else:
            # 2. Claude prediction
            api_name = self._identify_api(url)
            familiarity = "well_known" if api_name else "common"
            base_conf = self.propagator.from_claude_knowledge(familiarity)

            output, duration = await self._claude_predict(url, method, body, headers, upstream_context)
            conf   = base_conf
            basis  = ConfidenceBasis.CLAUDE_KNOWLEDGE
            note   = (
                f"Predicted using Claude's knowledge of {api_name}"
                if api_name
                else f"Predicted using Claude's general REST API knowledge"
            )

        return NodeSimulation(
            node_id=node_id,
            node_type=node_type,
            predicted_output=output,
            raw_confidence=conf,
            propagated_confidence=conf,  # will be set by engine
            confidence_basis=basis,
            historical_run_count=len(runs),
            risks=[],  # set by risk analyzer
            warnings=self._warnings(url, method, output),
            predicted_duration_ms=duration,
            simulation_note=note,
        )

    def _identify_api(self, url: str) -> str | None:
        for pattern, name in WELL_KNOWN_APIS.items():
            if re.search(pattern, url, re.IGNORECASE):
                return name
        return None

    async def _claude_predict(
        self,
        url:      str,
        method:   str,
        body:     dict,
        headers:  dict,
        context:  dict,
    ) -> tuple[dict, int]:
        """Ask Claude to predict the API response."""
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        # Sanitize headers (remove auth tokens for safety)
        safe_headers = {
            k: ("***" if any(s in k.lower() for s in ("auth", "key", "token", "secret")) else v)
            for k, v in headers.items()
        }

        prompt = (
            f"Predict the JSON response for this HTTP request:\n\n"
            f"Method: {method}\n"
            f"URL: {url}\n"
            f"Headers: {json.dumps(safe_headers, indent=2)}\n"
            f"Body: {json.dumps(body, indent=2)}\n"
        )
        if context:
            prompt += f"\nUpstream context (inputs from previous nodes):\n{json.dumps(context, indent=2)}"

        try:
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",  # fast + cheap for simulation
                max_tokens=512,
                system=CLAUDE_PREDICTION_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = resp.content[0].text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            output = json.loads(raw)
            # Estimate duration: GET ~200ms, POST ~400ms, external ~600ms
            duration = 200 if method == "GET" else 450
            return output, duration
        except Exception:
            # Graceful fallback
            return self._generic_response(method), 500

    def _generic_response(self, method: str) -> dict:
        """Last-resort generic response when Claude fails."""
        if method == "GET":
            return {"status": "ok", "data": {}}
        elif method in ("POST", "PUT", "PATCH"):
            return {"status": "ok", "id": "sim_mock_id_001", "created": True}
        elif method == "DELETE":
            return {"status": "ok", "deleted": True}
        return {"status": "ok"}

    def _warnings(self, url: str, method: str, output: dict) -> list[str]:
        warnings = []
        if "error" in output or "errors" in output:
            warnings.append("Predicted response contains error fields — review node config")
        if method != "GET" and not url.startswith("http"):
            warnings.append("URL appears relative — may fail without base URL configuration")
        return warnings
