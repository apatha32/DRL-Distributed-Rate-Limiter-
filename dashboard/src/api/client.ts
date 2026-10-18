import axios from 'axios'

// Production: VITE_API_URL points at the Railway API. Dev: empty, and Vite proxies /v1 to :8000.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

const http = axios.create({ baseURL: API_BASE })

const admin = (apiKey: string) => ({ headers: { 'X-API-Key': apiKey } })

// ---- Types (mirror src/analyst.py and src/models.py) ----------------------

export interface Finding {
  client_id: string
  endpoint: string
  severity: 'info' | 'warning' | 'critical'
  issue: string
  evidence: string
}

export interface RuleRecommendation {
  client_id: string
  endpoint: string | null
  rate: number
  window: number
  rationale: string
}

export interface AnalysisRecord {
  id: string
  created_at: number
  model: string
  usage: { input_tokens: number; output_tokens: number }
  analysis: {
    status: 'healthy' | 'watch' | 'incident'
    summary: string
    findings: Finding[]
    recommendations: RuleRecommendation[]
  }
  applied: boolean[]
}

export interface AnalystStatus {
  enabled: boolean
  model: string | null
}

export interface CheckLimitResponse {
  allowed: boolean
  remaining: number
  retry_after_ms: number
  limit: number
  window: number
  reset_at: number
}

/** Pull the API's error detail out of an axios error. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (err.response) return `Request failed (${err.response.status})`
    return `Could not reach the API at ${API_BASE || window.location.origin}`
  }
  return String(err)
}

export const api = {
  // Rate limiting (429 still carries the decision body)
  checkLimit: (clientId: string, cost = 1, limitKey = 'global') =>
    http.post<CheckLimitResponse>(
      '/v1/check',
      { client_id: clientId, cost, limit_key: limitKey },
      { validateStatus: (s) => s === 200 || s === 429 },
    ),

  getHealth: () => http.get('/health'),

  getRLDiagnostics: (clientId: string) => http.get(`/v1/rl/diagnostics/${clientId}`),

  // AI analyst (admin)
  getAnalystStatus: (apiKey: string) =>
    http.get<AnalystStatus>('/v1/admin/ai/status', admin(apiKey)),

  runAnalysis: (apiKey: string) =>
    http.post<AnalysisRecord>('/v1/admin/ai/analyses', null, admin(apiKey)),

  applyRecommendation: (apiKey: string, analysisId: string, index: number) =>
    http.post(`/v1/admin/ai/analyses/${analysisId}/recommendations/${index}/apply`, null, admin(apiKey)),
}

export default api
