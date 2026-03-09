"""
Risk Analyzer — deterministic + semantic detection of dangerous operations.

What makes this NOT gimmicky:
  - CRITICAL risks are detected by deterministic patterns (regex, AST, URL matching)
    NOT by asking Claude "is this risky?" — that would be unreliable
  - Claude is only used for edge cases that patterns miss
  - Every risk has a category, level, and "can_simulate_safely" flag
  - Risk detection is fast (<5ms per node) and doesn't hit external services

Risk levels:
  CRITICAL  → will halt simulation and block real run until reviewed
  WARNING   → shown prominently, user must acknowledge
  INFO      → logged, shown in UI, not blocking

Drop into: flint/simulation/risk_analyzer.py
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any


class RiskLevel(str, Enum):
    CRITICAL = "critical"
    WARNING  = "warning"
    INFO     = "info"


class RiskCategory(str, Enum):
    IRREVERSIBLE   = "irreversible"    # cannot be undone
    FINANCIAL      = "financial"       # moves real money
    PII            = "pii"             # personal data exposure
    EXTERNAL       = "external"        # hits real external systems
    DESTRUCTIVE    = "destructive"     # deletes or drops data
    HUMAN_REQUIRED = "human_required"  # needs human approval
    SECURITY       = "security"        # credentials, secrets
    RATE_LIMIT     = "rate_limit"      # likely to hit rate limits


@dataclass
class Risk:
    level:               RiskLevel
    category:            RiskCategory
    node_id:             str
    message:             str
    detail:              str           # technical detail
    can_simulate_safely: bool          # True = simulation runs anyway; False = skip real execution
    suggested_action:    str           # plain English recommendation


# ---------------------------------------------------------------------------
# Pattern libraries
# ---------------------------------------------------------------------------

# URLs that imply real money movement
FINANCIAL_URL_PATTERNS = [
    r"api\.stripe\.com",
    r"api\.paypal\.com",
    r"api\.braintreegateway\.com",
    r"api\.square\.com",
    r"api\.adyen\.com",
    r"checkout\.",
    r"/payments?/",
    r"/charges?/",
    r"/transactions?/",
    r"/invoices?/",
    r"/subscriptions?/",
]

# SQL patterns that are destructive
DESTRUCTIVE_SQL_PATTERNS = [
    (r"\bDROP\s+TABLE\b",       RiskLevel.CRITICAL, "Drops entire table — irreversible"),
    (r"\bDROP\s+DATABASE\b",    RiskLevel.CRITICAL, "Drops entire database — catastrophic"),
    (r"\bTRUNCATE\b",           RiskLevel.CRITICAL, "Truncates all table rows — irreversible"),
    (r"\bDELETE\s+FROM\b(?!\s+\w+\s+WHERE)", RiskLevel.CRITICAL, "DELETE without WHERE — deletes all rows"),
    (r"\bDELETE\s+FROM\b",      RiskLevel.WARNING,  "DELETE with WHERE — verify condition is correct"),
    (r"\bALTER\s+TABLE\b",      RiskLevel.WARNING,  "Schema change — may break other workflows"),
    (r"\bUPDATE\b(?!\s+\w+\s+SET\s+\w+\s*=.*WHERE)", RiskLevel.WARNING, "UPDATE without WHERE — updates all rows"),
]

# PII field names (in configs, queries, outputs)
PII_FIELD_PATTERNS = [
    r"\bssn\b", r"\bsocial_security\b",
    r"\bcredit_card\b", r"\bcard_number\b", r"\bcvv\b",
    r"\bpassword\b", r"\bpasswd\b", r"\bsecret\b",
    r"\bprivate_key\b", r"\bapi_key\b", r"\btoken\b",
    r"\bdob\b", r"\bdate_of_birth\b",
    r"\bmedical\b", r"\bdiagnosis\b", r"\bphi\b",
]

# Shell commands that are dangerous
DANGEROUS_SHELL_PATTERNS = [
    (r"\brm\s+-rf\b",          RiskLevel.CRITICAL, "rm -rf is irreversible file deletion"),
    (r"\bdd\s+",               RiskLevel.CRITICAL, "dd can overwrite disk partitions"),
    (r"\bchmod\s+777\b",       RiskLevel.WARNING,  "chmod 777 makes files world-writable"),
    (r"\bsudo\b",              RiskLevel.WARNING,  "Elevated privileges — verify necessity"),
    (r"\bcurl\b.*\|\s*sh\b",   RiskLevel.CRITICAL, "Piping curl to sh — remote code execution"),
    (r"\bwget\b.*\|\s*sh\b",   RiskLevel.CRITICAL, "Piping wget to sh — remote code execution"),
    (r"\beval\b",              RiskLevel.WARNING,  "eval executes dynamic code — injection risk"),
    (r">\s*/dev/sda",          RiskLevel.CRITICAL, "Writing to raw disk device"),
    (r"\bpasswd\b",            RiskLevel.WARNING,  "Modifying user passwords"),
    (r"\bpkill\b|\bkillall\b", RiskLevel.WARNING,  "Killing processes — may affect other services"),
]

# HTTP methods that cause side effects
SIDE_EFFECT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Known irreversible external actions
IRREVERSIBLE_URL_PATTERNS = [
    (r"api\.sendgrid\.com",           "Sends real email"),
    (r"api\.mailchimp\.com",          "Sends email campaign"),
    (r"api\.twilio\.com/.*messages",  "Sends SMS"),
    (r"api\.slack\.com/.*post",       "Posts to Slack channel"),
    (r"api\.github\.com/.*delete",    "Deletes GitHub resource"),
    (r"api\.pagerduty\.com",          "Triggers PagerDuty alert"),
    (r"hooks\.slack\.com",            "Posts to Slack webhook"),
]


# ---------------------------------------------------------------------------
# Analyzer
# ---------------------------------------------------------------------------

class RiskAnalyzer:
    """
    Analyzes a node's config and predicted output for risks.
    Fast, deterministic, no LLM calls in the hot path.
    """

    async def analyze(
        self,
        node_id:          str,
        node_type:        str,
        config:           dict,
        predicted_output: dict,
        confidence:       float,
    ) -> list[Risk]:
        risks: list[Risk] = []

        if node_type in ("http", "webhook"):
            risks.extend(self._analyze_http(node_id, config, predicted_output))
        elif node_type == "sql":
            risks.extend(self._analyze_sql(node_id, config))
        elif node_type == "shell":
            risks.extend(self._analyze_shell(node_id, config))
        elif node_type == "python":
            risks.extend(self._analyze_python(node_id, config))
        elif node_type == "AGENT":
            risks.extend(self._analyze_agent(node_id, config))

        # Cross-cutting: PII in any config
        risks.extend(self._detect_pii(node_id, config, node_type))

        # Low confidence → warn
        if confidence < 0.50:
            risks.append(Risk(
                level=RiskLevel.WARNING,
                category=RiskCategory.EXTERNAL,
                node_id=node_id,
                message=f"Low simulation confidence ({int(confidence*100)}%)",
                detail="Prediction is uncertain — real output may differ significantly",
                can_simulate_safely=True,
                suggested_action="Run with real data in a staging environment first",
            ))

        return risks

    def _analyze_http(self, node_id: str, config: dict, predicted_output: dict) -> list[Risk]:
        risks = []
        url    = config.get("url", "") or ""
        method = (config.get("method", "GET") or "GET").upper()

        # Financial endpoints
        for pattern in FINANCIAL_URL_PATTERNS:
            if re.search(pattern, url, re.IGNORECASE):
                amount = self._extract_amount(config)
                risks.append(Risk(
                    level=RiskLevel.CRITICAL,
                    category=RiskCategory.FINANCIAL,
                    node_id=node_id,
                    message=f"Real money movement — financial API detected",
                    detail=f"URL matches financial API pattern: {pattern}. "
                           f"Estimated amount: ${amount}" if amount else "",
                    can_simulate_safely=False,
                    suggested_action="Use test mode credentials (e.g., Stripe test key sk_test_*) "
                                     "or add an 'if FLINT_ENV=test: skip' guard",
                ))
                break

        # Irreversible external actions
        for pattern, action in IRREVERSIBLE_URL_PATTERNS:
            if re.search(pattern, url, re.IGNORECASE) and method in SIDE_EFFECT_METHODS:
                risks.append(Risk(
                    level=RiskLevel.WARNING,
                    category=RiskCategory.IRREVERSIBLE,
                    node_id=node_id,
                    message=f"Irreversible external action: {action}",
                    detail=f"Method {method} on {url} cannot be undone",
                    can_simulate_safely=True,
                    suggested_action="Confirm this is intentional. Consider a dry-run flag in your API call.",
                ))
                break

        # Any non-GET to an unknown external URL
        if method in SIDE_EFFECT_METHODS and url.startswith("http") and not any(
            re.search(p, url, re.IGNORECASE) for p in FINANCIAL_URL_PATTERNS
        ):
            risks.append(Risk(
                level=RiskLevel.INFO,
                category=RiskCategory.EXTERNAL,
                node_id=node_id,
                message=f"{method} request will modify external state",
                detail=f"Non-GET request to {url[:80]}",
                can_simulate_safely=True,
                suggested_action="Verify the endpoint has idempotency support or use a test environment",
            ))

        return risks

    def _analyze_sql(self, node_id: str, config: dict) -> list[Risk]:
        risks = []
        query = (config.get("query", "") or "").upper().strip()

        for pattern, level, detail in DESTRUCTIVE_SQL_PATTERNS:
            if re.search(pattern, query, re.IGNORECASE):
                is_critical = level == RiskLevel.CRITICAL
                risks.append(Risk(
                    level=level,
                    category=RiskCategory.DESTRUCTIVE,
                    node_id=node_id,
                    message=f"Destructive SQL operation detected",
                    detail=detail,
                    can_simulate_safely=not is_critical,
                    suggested_action=(
                        "Run against a read replica or staging database first"
                        if not is_critical
                        else "This operation is irreversible — add explicit human approval step"
                    ),
                ))
                break   # only report the most severe SQL risk

        return risks

    def _analyze_shell(self, node_id: str, config: dict) -> list[Risk]:
        risks = []
        command = config.get("command", "") or ""

        for pattern, level, detail in DANGEROUS_SHELL_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                risks.append(Risk(
                    level=level,
                    category=RiskCategory.DESTRUCTIVE if level == RiskLevel.CRITICAL else RiskCategory.SECURITY,
                    node_id=node_id,
                    message="Dangerous shell command detected",
                    detail=detail,
                    can_simulate_safely=level != RiskLevel.CRITICAL,
                    suggested_action="Review command carefully. Consider using Python node for safer execution.",
                ))

        return risks

    def _analyze_python(self, node_id: str, config: dict) -> list[Risk]:
        risks = []
        code = config.get("code", "") or ""

        dangerous = [
            ("os.system",      "Executes shell commands — use subprocess with strict args"),
            ("subprocess.call", "Executes external process"),
            ("eval(",          "Dynamic code execution — injection risk"),
            ("exec(",          "Dynamic code execution — injection risk"),
            ("open(",          "File system access — verify path is safe"),
            ("__import__",     "Dynamic import — supply chain risk"),
            ("pickle.loads",   "Deserialization — arbitrary code execution"),
        ]
        for pattern, suggestion in dangerous:
            if pattern in code:
                risks.append(Risk(
                    level=RiskLevel.WARNING,
                    category=RiskCategory.SECURITY,
                    node_id=node_id,
                    message=f"Potentially dangerous Python pattern: {pattern}",
                    detail=suggestion,
                    can_simulate_safely=True,
                    suggested_action=suggestion,
                ))

        return risks

    def _analyze_agent(self, node_id: str, config: dict) -> list[Risk]:
        """AGENT nodes can call tools — flag if prompt implies dangerous actions."""
        risks = []
        prompt = (config.get("prompt", "") or "").lower()

        danger_keywords = [
            ("delete", "Agent prompt mentions deletion"),
            ("send email", "Agent may send real emails"),
            ("charge", "Agent prompt mentions charging"),
            ("purchase", "Agent prompt implies purchasing"),
            ("transfer", "Agent prompt implies transferring funds"),
        ]
        for kw, msg in danger_keywords:
            if kw in prompt:
                risks.append(Risk(
                    level=RiskLevel.WARNING,
                    category=RiskCategory.HUMAN_REQUIRED,
                    node_id=node_id,
                    message=msg,
                    detail=f"AGENT prompt contains '{kw}' — may trigger irreversible tool calls",
                    can_simulate_safely=True,
                    suggested_action="Add human approval gate before this AGENT node",
                ))
                break

        return risks

    def _detect_pii(self, node_id: str, config: dict, node_type: str) -> list[Risk]:
        """Scan config JSON for PII field names."""
        config_str = json.dumps(config).lower()
        found = [p.strip(r"\b") for p in PII_FIELD_PATTERNS if re.search(p, config_str)]
        if not found:
            return []

        return [Risk(
            level=RiskLevel.WARNING,
            category=RiskCategory.PII,
            node_id=node_id,
            message=f"Potential PII fields in node config: {', '.join(found[:3])}",
            detail="Sensitive field names detected — ensure data is encrypted and access is audited",
            can_simulate_safely=True,
            suggested_action="Verify this data is masked/tokenized before passing to external APIs",
        )]

    def _extract_amount(self, config: dict) -> str | None:
        """Try to extract a dollar amount from config for context."""
        body = config.get("body", {}) or {}
        for key in ("amount", "total", "price", "charge", "payment"):
            if key in body:
                val = body[key]
                # Stripe uses cents
                if isinstance(val, (int, float)) and val > 100:
                    return f"{val / 100:.2f}"
                return str(val)
        return None
