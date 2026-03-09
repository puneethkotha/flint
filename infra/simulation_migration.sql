-- Simulation DB schema
-- Run this against your Postgres database before using the simulation feature.

-- Stores each simulation run + its predictions
CREATE TABLE IF NOT EXISTS workflow_simulations (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id         UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    dag_snapshot        JSONB       NOT NULL,
    overall_confidence  FLOAT       NOT NULL,
    node_predictions    JSONB       NOT NULL DEFAULT '[]',
    risks               JSONB       NOT NULL DEFAULT '[]',
    cost_estimate       JSONB       NOT NULL DEFAULT '{}',
    linked_job_id       UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ws_workflow_id ON workflow_simulations(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ws_created_at  ON workflow_simulations(created_at DESC);

-- Stores calibration data: predicted vs actual, per node
CREATE TABLE IF NOT EXISTS simulation_calibration_records (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id       UUID        NOT NULL,
    job_id              UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    node_id             TEXT        NOT NULL,
    predicted_confidence FLOAT      NOT NULL,
    shape_accuracy      FLOAT       NOT NULL,
    value_accuracy      FLOAT       NOT NULL,
    overall_accuracy    FLOAT       NOT NULL,
    brier_score         FLOAT       NOT NULL,
    correct             BOOLEAN     NOT NULL,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scr_simulation_id ON simulation_calibration_records(simulation_id);
CREATE INDEX IF NOT EXISTS idx_scr_recorded_at   ON simulation_calibration_records(recorded_at DESC);

-- Useful view: per-workflow simulation accuracy
CREATE OR REPLACE VIEW workflow_simulation_accuracy AS
SELECT
    ws.workflow_id,
    COUNT(DISTINCT ws.id)                       AS total_simulations,
    COUNT(scr.id)                               AS total_predictions,
    ROUND(AVG(scr.overall_accuracy)::numeric, 3) AS avg_accuracy,
    ROUND(AVG(scr.brier_score)::numeric, 3)     AS avg_brier_score,
    ROUND(SUM(CASE WHEN scr.correct THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(scr.id), 0), 3) AS correct_rate
FROM workflow_simulations ws
LEFT JOIN simulation_calibration_records scr ON scr.simulation_id::text = ws.id::text
GROUP BY ws.workflow_id;

-- Useful view: global simulation accuracy (for benchmarks page)
CREATE OR REPLACE VIEW global_simulation_stats AS
SELECT
    COUNT(*)                                    AS total_predictions,
    ROUND(AVG(overall_accuracy)::numeric, 3)    AS avg_accuracy,
    ROUND(AVG(brier_score)::numeric, 3)         AS avg_brier_score,
    ROUND(AVG(CASE WHEN correct THEN 1.0 ELSE 0.0 END)::numeric, 3) AS correct_rate,
    MIN(recorded_at)                            AS tracking_since
FROM simulation_calibration_records
WHERE recorded_at > NOW() - INTERVAL '30 days';
