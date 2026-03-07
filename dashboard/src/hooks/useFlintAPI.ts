import { useState, useEffect, useCallback } from 'react'
import { api, JobResponse, WorkflowResponse } from '../api/client'

export function useJobs(pollIntervalMs = 5000) {
  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.listJobs()
      setJobs(data.jobs)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, pollIntervalMs)
    return () => clearInterval(interval)
  }, [fetchJobs, pollIntervalMs])

  return { jobs, loading, error, refetch: fetchJobs }
}

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      const data = await api.listWorkflows()
      setWorkflows(data.workflows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch workflows')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { workflows, loading, error, refetch: fetch }
}

export function useJob(jobId: string | null, pollMs = 2000) {
  const [job, setJob] = useState<JobResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    try {
      const data = await api.getJob(jobId)
      setJob(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetch()
    if (!jobId) return
    const interval = setInterval(fetch, pollMs)
    return () => clearInterval(interval)
  }, [fetch, jobId, pollMs])

  return { job, loading, refetch: fetch }
}
