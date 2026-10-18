import axios from 'axios'

// Default: same-origin calls. In dev Vite proxies /v1 and /health to :8000; on Vercel,
// dashboard/vercel.json rewrites them to the Railway API. VITE_API_URL overrides both.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiNotConnectedError extends Error {
  constructor() {
    super(
      `${API_BASE || window.location.origin} answered with a web page instead of API data. ` +
        'Check the /v1 and /health rewrites in dashboard/vercel.json, or set VITE_API_URL to the API and redeploy.',
    )
    this.name = 'ApiNotConnectedError'
  }
}

const http = axios.create({ baseURL: API_BASE, timeout: 10_000 })

// Every API response is JSON. Anything else (typically the dashboard's own
// index.html from a SPA rewrite) means we are talking to the wrong server.
export function requireJson<T extends { headers: Record<string, unknown> }>(res: T): T {
  const type = String(res.headers['content-type'] ?? '')
  if (!type.includes('application/json')) throw new ApiNotConnectedError()
  return res
}
http.interceptors.response.use(requireJson)

const admin = (apiKey: string) => ({ headers: { 'X-API-Key': apiKey } })

// ---- Types (mirror src/models.py and src/analyst.py) ----------------------

export interface Health {
  status: 'healthy' | 'degraded'
  service: string
  redis_available: boolean
}

export interface ClientStat {
  client_id: string
  endpoint: string
  allowed: number
  blocked: number
  rule_rate: number
  rule_window: number
  effective_limit: number
  rl_epsilon: number | null
}

export interface Stats {
  generated_at: number
  uptime_sec: number
  node: string
  algorithm: string
  rl_enabled: boolean
  rl_update_interval_sec: number
  fail_mode: string
  circuit_breaker: 'closed' | 'open' | 'half_open'
  totals: { allowed: number; blocked: number }
  latency_ms: { p50: number | null; p95: number | null; p99: number | null; samples: number | null }
  clients: ClientStat[]
  clients_total: number
}

export type RLAction = 'decrease' | 'keep' | 'increase'

export interface RLDecision {
  ts: number
  rps: number
  block_ratio: number
  rps_delta: number
  requests: number
  reward: number
  action: RLAction
  limit_before: number
  limit_after: number
}

export interface RLDiagnostics {
  client_id: string
  rl_enabled: boolean
  current_limit: number | null
  epsilon: number | null
  rps: number | null
  block_ratio: number | null
  rps_delta: number | null
  total_requests_window: number | null
  recent_decisions: RLDecision[] | null
}

export interface CheckResult {
  algorithm: string
  allowed: boolean
  status: number
  remaining: number
  limit: number
  window: number
  retryAfterMs: number
  rttMs: number
}

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

/** RL state is tracked per client, and per client/endpoint for endpoint rules. */
export const agentKey = (clientId: string, endpoint: string) =>
  endpoint === 'global' ? clientId : `${clientId}/${endpoint}`

/** Pull the API's error detail out of an axios error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiNotConnectedError) return err.message
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
    if (err.response) return `Request failed (${err.response.status})`
    return `Can't reach the API at ${API_BASE || window.location.origin}`
  }
  return err instanceof Error ? err.message : String(err)
}

async function decide(path: string, body: object): Promise<CheckResult> {
  const started = performance.now()
  const res = await http.post(path, body, { validateStatus: (s) => s === 200 || s === 429 })
  return {
    algorithm: res.data.algorithm,
    allowed: res.status === 200,
    status: res.status,
    remaining: res.data.remaining,
    limit: res.data.limit,
    window: res.data.window,
    retryAfterMs: res.data.retry_after_ms,
    rttMs: performance.now() - started,
  }
}

export const api = {
  health: async () => (await http.get<Health>('/health')).data,

  stats: async () => (await http.get<Stats>('/v1/stats')).data,

  rlDiagnostics: async (key: string) =>
    (await http.get<RLDiagnostics>(`/v1/rl/diagnostics/${key.split('/').map(encodeURIComponent).join('/')}`)).data,

  /** A real rate-limit decision. 429 is a normal answer, not an error. */
  checkLimit: (clientId: string, limitKey: string, cost: number) =>
    decide('/v1/check', { client_id: clientId, limit_key: limitKey, cost }),

  /** A decision in the isolated sandbox: any algorithm, ad-hoc limit, never touches real clients. */
  sandboxCheck: (algorithm: string, sessionId: string, rate: number, window: number) =>
    decide('/v1/sandbox/check', { algorithm, session_id: sessionId, rate, window }),

  analystStatus: async (apiKey: string) =>
    (await http.get<AnalystStatus>('/v1/admin/ai/status', admin(apiKey))).data,

  runAnalysis: async (apiKey: string) =>
    (await http.post<AnalysisRecord>('/v1/admin/ai/analyses', null, { ...admin(apiKey), timeout: 180_000 })).data,

  applyRecommendation: async (apiKey: string, analysisId: string, index: number) =>
    (await http.post(`/v1/admin/ai/analyses/${analysisId}/recommendations/${index}/apply`, null, admin(apiKey))).data,
}
