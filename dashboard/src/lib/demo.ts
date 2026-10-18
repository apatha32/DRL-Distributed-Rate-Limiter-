import type { CheckResult, RLAction } from './api'

/**
 * Scripted traffic for the live demo. Rates are requests per second, sent from
 * the browser to the real API. The scenario loops until stopped (or the time
 * limit), and stays gentle: at most ~10 requests per second in total.
 */
export interface DemoClient {
  clientId: string
  endpoint: string
  rps: number
}

export interface DemoPhase {
  id: string
  title: string
  seconds: number
  explanation: string
  clients: DemoClient[]
}

export const DEMO_MAX_MINUTES = 15
export const DEMO_SUMMARY_EVERY_MS = 5000

const regulars: DemoClient[] = [
  { clientId: 'demo_web', endpoint: 'global', rps: 1.2 },
  { clientId: 'demo_mobile', endpoint: 'global', rps: 0.8 },
]

export const DEMO_PHASES: DemoPhase[] = [
  {
    id: 'normal',
    title: 'Normal traffic',
    seconds: 30,
    explanation:
      'Two well-behaved apps, demo_web and demo_mobile, send one or two requests per second. ' +
      'That is below their limit, so every request should be allowed.',
    clients: regulars,
  },
  {
    id: 'scraper',
    title: 'A scraper floods the API',
    seconds: 35,
    explanation:
      'demo_scraper starts sending 7 requests per second, far more than its limit allows. ' +
      'Its first requests use up its allowance, then the limiter starts answering 429 Too Many Requests. ' +
      'The regular apps keep working because every client has its own limit.',
    clients: [...regulars, { clientId: 'demo_scraper', endpoint: 'global', rps: 7 }],
  },
  {
    id: 'login',
    title: 'Someone hammers a login page',
    seconds: 30,
    explanation:
      "Repeated attempts hit client_a's /login endpoint. Login has its own stricter rule, " +
      'so these attempts are cut off quickly. This is how a rate limiter slows down password guessing.',
    clients: [...regulars, { clientId: 'client_a', endpoint: 'login', rps: 4 }],
  },
  {
    id: 'quiet',
    title: 'Things calm down',
    seconds: 25,
    explanation:
      'The heavy traffic stops. Limits refill over time, so clients that were blocked will be allowed again. ' +
      'The RL agent keeps watching and may adjust limits based on what it just saw.',
    clients: regulars,
  },
]

// ---- Plain-English narration --------------------------------------------------

export const clientLabel = (clientId: string, endpoint: string) =>
  endpoint === 'global' ? clientId : `${clientId} /${endpoint}`

const ALGORITHM_STEP: Record<string, string> = {
  token_bucket: 'checked how many tokens it had left in its bucket and took one',
  leaky_bucket: 'checked how full its bucket was and added this request to it',
  fixed_window: 'counted this request in the current time window',
  sliding_window: 'counted its requests over the last window of time and logged this one',
}

const secondsText = (n: number) => (n === 1 ? '1 second' : `${n} seconds`)

const per = (window: number) => (window === 60 ? 'per minute' : `per ${window} seconds`)

/** A step-by-step account of one request, used for the first request of a demo. */
export function explainFirstRequest(clientId: string, endpoint: string, r: CheckResult): string[] {
  const step = ALGORITHM_STEP[r.algorithm] ?? 'checked its usage'
  return [
    `1. ${clientLabel(clientId, endpoint)} asked the limiter: may I make this request?`,
    `2. The limiter looked up the rule for this client: ${r.limit} requests ${per(r.window)}.`,
    `3. One small script ran inside Redis that ${step}. Running it as one step means two servers can never both spend the same allowance.`,
    r.allowed
      ? `4. The answer was 200 OK: allowed, with ${r.remaining} of ${r.limit} left.`
      : `4. The answer was 429 Too Many Requests: blocked, try again in ${secondsText(Math.max(1, Math.ceil(r.retryAfterMs / 1000)))}.`,
    `5. The whole round trip from your browser took ${Math.round(r.rttMs)} ms. Most of that is the network; the decision itself takes a fraction of a millisecond.`,
  ]
}

export interface ClientTally {
  clientId: string
  endpoint: string
  allowed: number
  blocked: number
  last?: CheckResult
}

/** One sentence per client describing the last few seconds. */
export function summarizeTally(t: ClientTally): string {
  const name = clientLabel(t.clientId, t.endpoint)
  const sent = t.allowed + t.blocked
  const limit = t.last ? `${t.last.limit} ${per(t.last.window)}` : 'its limit'
  if (t.blocked === 0) {
    return `${name} sent ${sent} and all were allowed${t.last ? ` (${t.last.remaining} of ${t.last.limit} left)` : ''}.`
  }
  if (t.allowed === 0) {
    return `${name} sent ${sent} and all were blocked. It has used up its limit of ${limit}, so it must wait.`
  }
  return `${name} sent ${sent}: ${t.allowed} allowed, ${t.blocked} blocked. It is going over its limit of ${limit}, so the extra requests are turned away.`
}

/** The moment a client is first blocked in a demo run. */
export function explainFirstBlock(clientId: string, endpoint: string, r: CheckResult): string {
  return (
    `${clientLabel(clientId, endpoint)} just hit its limit of ${r.limit} requests ${per(r.window)}. ` +
    `From now on the limiter answers 429 Too Many Requests and tells it to retry in ${secondsText(Math.max(1, Math.ceil(r.retryAfterMs / 1000)))}. ` +
    `Its requests never reach your real API, which protects it.`
  )
}

const ACTION_VERB: Record<RLAction, string> = { increase: 'raise', decrease: 'lower', keep: 'keep' }

/** When the RL agent moves a client's enforced limit. */
export function explainLimitChange(
  key: string,
  from: number,
  to: number,
  observed?: { rps: number; block_ratio: number; action: RLAction },
): string {
  const direction = to > from ? 'raised' : 'lowered'
  const base = `The RL agent ${direction} ${key.replace('/', ' /')}'s limit from ${from} to ${to}.`
  if (!observed) return base
  return (
    `${base} In the last window it saw ${observed.rps.toFixed(1)} requests per second with ` +
    `${Math.round(observed.block_ratio * 100)}% blocked, and decided to ${ACTION_VERB[observed.action]} the limit. ` +
    `It learns from the result, so its choices improve the longer it runs.`
  )
}
