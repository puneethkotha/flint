"""
Content moderation for user prompts and workflow descriptions.
Blocks illegal, harmful, or sensitive content before processing.
"""

from __future__ import annotations

import re
from typing import Sequence

# Phrases that indicate illegal or harmful intent (case-insensitive, substring match)
# Keep these specific to avoid false positives on legitimate automation (e.g. "kill process")
BLOCKED_PHRASES: tuple[str, ...] = (
    # Exploitation / abuse
    "child porn",
    "child abuse",
    "sexual abuse",
    "non-consensual",
    # Violence / weapons
    "how to make explosives",
    "build a bomb",
    "create weapon",
    "illegal weapons",
    # Fraud / theft
    "steal credentials",
    "phishing campaign",
    "credit card fraud",
    "identity theft",
    "launder money",
    "money laundering",
    # Malware / hacking
    "create malware",
    "create ransomware",
    "create virus",
    "distribute malware",
    "hack into",
    "unauthorized access",
    "ddos attack",
    "sql injection attack",
    # Self-harm
    "how to kill myself",
    "suicide methods",
    "self-harm",
    # Drug trafficking
    "sell drugs",
    "drug trafficking",
)

# Regex patterns for sensitive PII (block to prevent accidental exposure)
PII_PATTERNS: Sequence[tuple[re.Pattern[str], str]] = (
    # SSN (US): XXX-XX-XXXX or XXXXXXXXX
    (re.compile(r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b"), "SSN/social security number"),
    # Credit card: 4 groups of 4 digits (XXXX-XXXX-XXXX-XXXX or similar)
    (re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"), "credit card number"),
)


def check_content(text: str) -> str | None:
    """
    Check user content for policy violations.
    Returns an error message if blocked, else None.
    """
    if not text or not isinstance(text, str):
        return None

    t = text.lower().strip()
    if len(t) < 10:
        return None  # Very short input, skip check

    # Blocklisted phrases
    for phrase in BLOCKED_PHRASES:
        if phrase in t:
            return (
                "This request appears to involve content we cannot support. "
                "Please describe a legitimate automation workflow."
            )

    # PII patterns
    for pattern, name in PII_PATTERNS:
        if pattern.search(text):  # Use original case for pattern match
            return (
                f"We detected what looks like a {name} in your message. "
                "Please don't include sensitive personal or financial data in workflow descriptions."
            )

    return None


# Patterns in shell commands / inline Python that indicate an attempt to
# exfiltrate secrets, open a reverse shell, or destroy the host. These fields
# were previously NOT scanned — a malicious task could smuggle code past
# moderation. Kept tight to avoid false positives on legitimate automation.
DANGEROUS_CODE_PATTERNS: Sequence[tuple[re.Pattern[str], str]] = (
    (re.compile(r"\brm\s+-rf\s+/(?:\s|$)"), "destructive filesystem command"),
    (re.compile(r":\(\)\s*\{\s*:\|:&\s*\}"), "fork bomb"),
    (re.compile(r"\b(?:bash|sh)\s+-i\b.*(?:/dev/tcp|nc\s|ncat\s)"), "reverse shell"),
    (re.compile(r"/dev/tcp/"), "reverse shell socket"),
    (re.compile(r"\b(?:nc|ncat|netcat)\b.*\s-e\b"), "netcat command execution"),
    (re.compile(r"169\.254\.169\.254"), "cloud metadata endpoint access"),
    (re.compile(r"\bos\.environ\b|\bprintenv\b|\benv\b\s*\|\s*curl"), "environment/secret exfiltration"),
    (re.compile(r"\bcurl\b[^\n]*\|\s*(?:bash|sh)\b"), "pipe-to-shell execution"),
)


def check_code_content(text: str) -> str | None:
    """Scan a shell command or inline code snippet for dangerous patterns."""
    if not text or not isinstance(text, str):
        return None
    for pattern, name in DANGEROUS_CODE_PATTERNS:
        if pattern.search(text):
            return (
                f"This workflow contains a {name} in a shell/code task, which we "
                "cannot run. Remove it and describe a legitimate automation instead."
            )
    return None


def check_dag_content(dag: dict) -> str | None:
    """
    Check a DAG structure for policy violations in node configs.

    Scans both natural-language fields (prompt/description/query) and — critically —
    executable fields (command/code), which earlier versions ignored.
    Returns an error message if blocked, else None.
    """
    if not dag or not isinstance(dag, dict):
        return None

    nodes = dag.get("nodes") or []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        config = node.get("config") or {}
        if not isinstance(config, dict):
            continue
        # Natural-language fields → policy blocklist + PII
        for key in ("prompt", "description", "query"):
            val = config.get(key)
            if isinstance(val, str) and val.strip():
                reason = check_content(val)
                if reason:
                    return reason
        # Executable fields → dangerous-code scan
        for key in ("command", "code", "script"):
            val = config.get(key)
            if isinstance(val, str) and val.strip():
                reason = check_code_content(val)
                if reason:
                    return reason
    return None
