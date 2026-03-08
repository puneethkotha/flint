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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
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

  createWorkflow: (payload: { description?: string; dag?: unknown; run_immediately?: boolean }) =>
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
}
