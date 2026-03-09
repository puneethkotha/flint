"""
SQL Predictor — predicts query results without touching the real database.

For SELECT queries: predicts result shape from schema + historical data.
For writes: simulates with a dry-run explanation (never runs against real DB).

Drop into: flint/simulation/predictors/sql_predictor.py
"""

from __future__ import annotations

import re
import uuid

from flint.simulation.engine import NodeSimulation, ConfidenceBasis  # type: ignore
from flint.simulation.predictors.base import BasePredictor


class SqlPredictor(BasePredictor):

    async def predict(
        self,
        node_id:          str,
        node_type:        str,
        config:           dict,
        workflow_id:      uuid.UUID,
        upstream_context: dict,
        input_data:       dict,
    ) -> NodeSimulation:

        query = (config.get("query", "") or "").strip()
        op    = self._classify_operation(query)

        runs = await self.get_historical_runs(workflow_id, node_id)

        if runs:
            conf     = self.confidence_from_runs(runs)
            output   = self.most_common_output(runs)
            duration = self.avg_duration(runs)
            n        = len(runs)
            basis    = (
                ConfidenceBasis.HISTORICAL_HIGH if n >= 50 else
                ConfidenceBasis.HISTORICAL_MED  if n >= 10 else
                ConfidenceBasis.HISTORICAL_LOW
            )
            note = f"Based on {n} historical runs — operation type: {op}"
            warnings = []
        else:
            # No history — predict from query structure
            output, conf, note = self._predict_from_query(query, op, upstream_context)
            basis    = ConfidenceBasis.CLAUDE_KNOWLEDGE
            duration = 80 if op == "SELECT" else 120
            n        = 0
            warnings = self._sql_warnings(query, op)

        return NodeSimulation(
            node_id=node_id,
            node_type=node_type,
            predicted_output=output,
            raw_confidence=conf,
            propagated_confidence=conf,
            confidence_basis=basis,
            historical_run_count=n,
            risks=[],
            warnings=warnings,
            predicted_duration_ms=duration if runs else 100,
            simulation_note=note,
        )

    def _classify_operation(self, query: str) -> str:
        q = query.upper().lstrip()
        for op in ("SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE"):
            if q.startswith(op):
                return op
        return "UNKNOWN"

    def _predict_from_query(
        self,
        query: str,
        op: str,
        context: dict,
    ) -> tuple[dict, float, str]:
        """Predict output shape from the SQL query structure."""

        if op == "SELECT":
            # Extract column names from SELECT clause
            cols = self._extract_select_columns(query)
            if cols and cols != ["*"]:
                mock_row = {col: self._mock_value_for_column(col) for col in cols[:10]}
                output = {"rows": [mock_row], "row_count": 1}
            else:
                output = {"rows": [{}], "row_count": 1}
            return output, 0.55, "Predicted SELECT result shape from query structure"

        elif op == "INSERT":
            output = {"rows_affected": 1, "inserted_id": "sim_mock_id"}
            return output, 0.70, "INSERT typically returns 1 row affected"

        elif op == "UPDATE":
            output = {"rows_affected": 1}
            return output, 0.65, "UPDATE result depends on WHERE clause match"

        elif op == "DELETE":
            output = {"rows_affected": 1}
            return output, 0.60, "DELETE result depends on WHERE clause match"

        else:
            output = {"status": "executed"}
            return output, 0.40, f"Unknown SQL operation: {op}"

    def _extract_select_columns(self, query: str) -> list[str]:
        """Parse column names from SELECT ... FROM."""
        match = re.search(r"SELECT\s+(.*?)\s+FROM", query, re.IGNORECASE | re.DOTALL)
        if not match:
            return ["*"]
        cols_str = match.group(1).strip()
        if cols_str == "*":
            return ["*"]
        # Strip aliases, functions — get just column names
        cols = []
        for col in cols_str.split(","):
            col = col.strip()
            # Handle "func(col) AS alias" → take alias
            alias_match = re.search(r"\bAS\s+(\w+)", col, re.IGNORECASE)
            if alias_match:
                cols.append(alias_match.group(1))
                continue
            # Handle "table.column" → take column
            bare = re.sub(r"^\w+\.", "", col)
            bare = re.sub(r"\(.*\)", "", bare).strip()  # strip function calls
            if bare and re.match(r"^\w+$", bare):
                cols.append(bare)
        return cols or ["*"]

    def _mock_value_for_column(self, col: str) -> object:
        """Return a realistic mock value based on column name heuristics."""
        col_lower = col.lower()
        if any(x in col_lower for x in ("id", "_id")):
            return "sim_550e8400-e29b"
        if any(x in col_lower for x in ("email",)):
            return "user@example.com"
        if any(x in col_lower for x in ("name", "title")):
            return "Example Name"
        if any(x in col_lower for x in ("count", "total", "num", "amount")):
            return 42
        if any(x in col_lower for x in ("created", "updated", "at", "date", "time")):
            return "2026-03-09T10:00:00Z"
        if any(x in col_lower for x in ("status",)):
            return "active"
        if any(x in col_lower for x in ("enabled", "active", "is_", "has_")):
            return True
        if any(x in col_lower for x in ("price", "cost", "fee", "rate")):
            return 9.99
        return "example_value"

    def _sql_warnings(self, query: str, op: str) -> list[str]:
        warnings = []
        if op == "SELECT" and "LIMIT" not in query.upper():
            warnings.append("SELECT without LIMIT may return large result sets in production")
        if op in ("UPDATE", "DELETE") and "WHERE" not in query.upper():
            warnings.append("⚠ No WHERE clause — this will affect ALL rows")
        return warnings
