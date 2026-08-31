// Every API call in this app goes through this one function. It wraps the
// browser's built-in `fetch`, adds JSON headers, sends the session cookie,
// and turns non-2xx responses into thrown errors so callers can just
// `try { await ... } catch (err) {}`.
//
// Because vite.config.js proxies /api to the FastAPI backend, the app and the
// API share an origin — so the httpOnly admin session cookie is sent
// automatically and stays unreadable from JavaScript.
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new ApiError(detail, response.status)
  }

  if (response.status === 204) return null
  return response.json()
}

export const get = (path) => request(path)
export const post = (path, body) =>
  request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
export const del = (path) => request(path, { method: 'DELETE' })
