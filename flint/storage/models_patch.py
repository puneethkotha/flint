"""
Phase 3b + 3c: Storage model additions.

HOW TO APPLY: Merge these additions into flint/storage/models.py

1. Add WorkflowVersion model (new table)
2. Add failure_analysis column to Job model
3. Add a new Alembic migration (or run CREATE TABLE manually)
"""

# ============================================================
# ADD to flint/storage/models.py
# ============================================================

# 1. NEW MODEL — paste this class after the Workflow model:

WORKFLOW_VERSION_MODEL = '''
class WorkflowVersion(Base):
    """Immutable snapshot of a workflow definition at each save."""
    __tablename__ = "workflow_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    definition: Mapped[dict] = mapped_column(JSON, nullable=False)   # full DAG JSON snapshot
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # optional human note
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    avg_execution_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationship
    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("workflow_id", "version_number", name="uq_workflow_version"),
    )
'''

# 2. ADD to Workflow model — inside the class body:
WORKFLOW_VERSIONS_RELATIONSHIP = '''
    # Add this relationship to the Workflow model:
    versions: Mapped[list["WorkflowVersion"]] = relationship(
        "WorkflowVersion", back_populates="workflow", order_by="WorkflowVersion.version_number"
    )
'''

# 3. ADD failure_analysis column to Job model:
JOB_FAILURE_ANALYSIS_COLUMN = '''
    # Add this column to the Job model:
    failure_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Stores: {explanation, suggested_fix, fix_patch, confidence}
'''

# ============================================================
# SQL migration (run this if not using Alembic):
# ============================================================

MIGRATION_SQL = """
-- WorkflowVersion table
CREATE TABLE IF NOT EXISTS workflow_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    definition  JSONB NOT NULL,
    change_summary TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    avg_execution_ms INTEGER,
    CONSTRAINT uq_workflow_version UNIQUE (workflow_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_wv_workflow_id ON workflow_versions(workflow_id);

-- failure_analysis on jobs
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS failure_analysis JSONB;
"""
