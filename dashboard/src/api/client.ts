const API_HOST = import.meta.env.VITE_API_URL ?? ''
const BASE = `${API_HOST}/api/v1`

export interface WorkflowResponse {
  id: string
  name: string
  description: string | null
  dag_json: Record<string, unknown>
  schedule: string | null
  status: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface FailureAnalysis {
  explanation: string
  suggested_fix: string
  fix_patch?: Record<string, unknown> | null
  confidence: 'high' | 'medium' | 'low'
}

export interface JobResponse {
  id: string
  workflow_id: string
  status: string
  trigger_type: string
  triggered_at: string
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  error: string | null
  task_executions: TaskExecution[]
  failure_analysis?: FailureAnalysis | null
}

export interface TaskExecution {
  id: string
  task_id: string
  task_type: string
  attempt_number: number
  status: string
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  output_data: Record<string, unknown>
  error: string | null
  failure_type: string | null
}

export interface ParseResponse {
  dag: Record<string, unknown>
  node_count: number
  warnings: string[]
}

// ─── Self-Heal / Reliability ──────────────────────────────────────────────

export interface ReliabilityCheck {
  scenario: string
  label: string
  description: string
  failure_type: string
  recovery_action: string
  handled: boolean
}

export interface ReliabilityGap {
  kind: string
  severity: 'high' | 'medium' | 'low'
  message: string
}

export interface NodeReport {
  node_id: string
  node_type: string
  score: number
  grade: string
  blast_radius: number
  checks: ReliabilityCheck[]
  gaps: ReliabilityGap[]
}

export interface ReliabilityReport {
  workflow_name: string
  overall_score: number
  grade: string
  node_count: number
  total_gaps: number
  total_vulnerabilities: number
  nodes: NodeReport[]
}

export interface HealTraceStep {
  node_id: string
  node_type: string
  score_before: number
  score_after: number
  healed: boolean
  vulnerabilities: ReliabilityCheck[]
  fixes_applied: string[]
  fix_patch: Record<string, unknown> | null
}

export interface HealMetrics {
  score_before: number
  score_after: number
  score_delta: number
  grade_before: string
  grade_after: string
  vulnerabilities_before: number
  vulnerabilities_after: number
  vulnerabilities_closed: number
  fixes_applied: number
  estimated_mttr_seconds: number
  retry_waste_avoided_seconds: number
}

export interface HealResult {
  workflow_name: string
  before: ReliabilityReport
  after: ReliabilityReport
  patched_dag: Record<string, unknown>
  trace: HealTraceStep[]
  metrics: HealMetrics
  narration: string
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('flint_token') : null
  if (token) return { Authorization: `Bearer ${token}` }
  return {}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers } as HeadersInit,
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  parseWorkflow: (description: string) =>
    request<ParseResponse>('/parse', {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),

  createWorkflow: (payload: {
    description?: string
    dag?: unknown
    run_immediately?: boolean
    schedule?: string | null
    timezone?: string
  }) =>
    request<WorkflowResponse>('/workflows', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listWorkflows: () =>
    request<{ workflows: WorkflowResponse[]; total: number }>('/workflows'),

  triggerJob: (workflowId: string) =>
    request<{ job_id: string; status: string; status_url: string }>(
      `/jobs/trigger/${workflowId}`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  getJob: (jobId: string) => request<JobResponse>(`/jobs/${jobId}`),

  listJobs: () => request<{ jobs: JobResponse[]; total: number }>('/jobs'),

  health: () =>
    request<{ status: string; version: string; components: Record<string, { status: string }> }>(
      '/health'
    ),

  getSuggestions: () =>
    request<{ suggestions: string[] }>('/suggestions'),

  runDemo: (description: string) =>
    request<{
      status: string
      duration_ms: number
      error: string | null
      task_results: Record<string, { status: string; output?: unknown; error?: string }>
      output_data: Record<string, unknown>
      dag: Record<string, unknown>
    }>('/demo/run', { method: 'POST', body: JSON.stringify({ description }) }),

  auditReliability: (payload: { description?: string; dag?: unknown }) =>
    request<{ dag: Record<string, unknown>; report: ReliabilityReport }>(
      '/reliability/audit',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  healWorkflow: (payload: { description?: string; dag?: unknown; narrate?: boolean }) =>
    request<HealResult>('/reliability/heal', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
