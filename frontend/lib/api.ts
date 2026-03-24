import type { QueryResponse, UploadResponse } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadFiles(files: File[]): Promise<UploadResponse> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? 'Upload failed')
  }

  return response.json()
}

// ── Query ──────────────────────────────────────────────────────────────────

export async function sendQuery(
  sessionId: string,
  query: string
): Promise<QueryResponse> {
  const response = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, query }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    if (response.status === 404) {
      throw new SessionExpiredError(error.detail ?? 'Session expired')
    }
    throw new Error(error.detail ?? 'Query failed')
  }

  return response.json()
}

// ── Share ──────────────────────────────────────────────────────────────────

export async function createShare(sessionId: string): Promise<{ share_id: string }> {
  const response = await fetch(`${API_BASE}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? 'Could not create share link')
  }

  return response.json()
}

export async function getShare(shareId: string): Promise<{
  share_id: string
  messages: Array<{ role: string; content: Record<string, unknown> }>
  schema: Record<string, unknown>
  files: string[]
  created_at: number
}> {
  const response = await fetch(`${API_BASE}/api/share/${shareId}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? 'Shared report not found')
  }

  return response.json()
}

// ── Errors ─────────────────────────────────────────────────────────────────

export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionExpiredError'
  }
}
