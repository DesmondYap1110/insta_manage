import { get, post } from './client'

export const createJob = ({ accountId, jobType, shortcode, forceRedownload = false }) =>
  post('/api/downloads/jobs', {
    account_id: accountId,
    job_type: jobType,
    shortcode: shortcode || null,
    force_redownload: forceRedownload,
  })

export const listJobs = (accountId) =>
  get(accountId ? `/api/downloads/jobs?account_id=${accountId}` : '/api/downloads/jobs')

export const getJob = (id) => get(`/api/downloads/jobs/${id}`)
