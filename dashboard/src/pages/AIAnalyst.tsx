import React, { useEffect, useState } from 'react'
import { Sparkles, KeyRound, Play, Check, AlertTriangle, Loader2 } from 'lucide-react'
import Badge from '../components/Badge'
import api, { API_BASE, AnalysisRecord, AnalystStatus, errorMessage } from '../api/client'

const KEY_STORAGE = 'drl-admin-key'

function readStoredKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

const STATUS_VARIANT = { healthy: 'success', watch: 'warning', incident: 'error' } as const
const SEVERITY_VARIANT = { info: 'info', warning: 'warning', critical: 'error' } as const

export default function AIAnalyst() {
  const [apiKey, setApiKey] = useState(readStoredKey)
  const [status, setStatus] = useState<AnalystStatus | null>(null)
  const [record, setRecord] = useState<AnalysisRecord | null>(null)
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY_STORAGE, apiKey)
    } catch {
      /* storage unavailable: key just isn't remembered */
    }
    if (!apiKey) {
      setStatus(null)
      return
    }
    api.getAnalystStatus(apiKey)
      .then((r) => { setStatus(r.data); setError(null) })
      .catch((e) => { setStatus(null); setError(errorMessage(e)) })
  }, [apiKey])

  const runAnalysis = async () => {
    setRunning(true)
    setError(null)
    try {
      setRecord((await api.runAnalysis(apiKey)).data)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setRunning(false)
    }
  }

  const apply = async (index: number) => {
    if (!record) return
    setApplying(index)
    setError(null)
    try {
      await api.applyRecommendation(apiKey, record.id, index)
      setRecord({ ...record, applied: record.applied.map((a, i) => (i === index ? true : a)) })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setApplying(null)
    }
  }

  const analysis = record?.analysis

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2 flex items-center space-x-3">
          <Sparkles className="w-8 h-8 text-cyan-400" />
          <span>AI Traffic Analyst</span>
        </h1>
        <p className="text-slate-400">
          Claude reviews live limiter state and the Q-learning agent's recent decisions, then
          proposes rule changes. Nothing changes until you apply a recommendation.
        </p>
      </div>

      {/* Connection */}
      <div className="card space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <label className="flex-1">
            <span className="text-sm text-slate-400 flex items-center space-x-2 mb-2">
              <KeyRound className="w-4 h-4" />
              <span>Admin API key</span>
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value.trim())}
              placeholder="X-API-Key for /v1/admin"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-cyan-500"
            />
          </label>
          <button
            onClick={runAnalysis}
            disabled={!status?.enabled || running}
            className="btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:hover:scale-100"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{running ? 'Analyzing…' : 'Run analysis'}</span>
          </button>
        </div>
        <div className="text-xs text-slate-500 font-mono">
          API: {API_BASE || 'same origin (dev proxy)'}
          {status && (status.enabled ? ` · model ${status.model}` : ' · analyst disabled (ANTHROPIC_API_KEY not set)')}
        </div>
        {error && (
          <div className="flex items-center space-x-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {analysis && record && (
        <>
          {/* Summary */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Summary</h2>
              <Badge variant={STATUS_VARIANT[analysis.status]}>{analysis.status}</Badge>
            </div>
            <p className="text-slate-300 leading-relaxed">{analysis.summary}</p>
            <p className="text-xs text-slate-500 mt-4 font-mono">
              {new Date(record.created_at * 1000).toLocaleString()} · {record.model} ·{' '}
              {record.usage.input_tokens.toLocaleString()} in / {record.usage.output_tokens.toLocaleString()} out tokens
            </p>
          </div>

          {/* Findings */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Findings</h2>
            {analysis.findings.length === 0 ? (
              <p className="text-slate-400 text-sm">No issues found.</p>
            ) : (
              <div className="space-y-3">
                {analysis.findings.map((f, i) => (
                  <div key={i} className="border border-slate-700 rounded-lg p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={SEVERITY_VARIANT[f.severity]}>{f.severity}</Badge>
                      <span className="font-mono text-sm text-cyan-400">
                        {f.client_id}{f.endpoint !== 'global' && ` / ${f.endpoint}`}
                      </span>
                    </div>
                    <p className="text-slate-200 text-sm">{f.issue}</p>
                    <p className="text-slate-500 text-xs mt-1">{f.evidence}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recommendations */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Recommended rule changes</h2>
            {analysis.recommendations.length === 0 ? (
              <p className="text-slate-400 text-sm">No changes recommended.</p>
            ) : (
              <div className="space-y-3">
                {analysis.recommendations.map((r, i) => (
                  <div key={i} className="border border-slate-700 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm">
                        <span className="text-cyan-400">{r.client_id}{r.endpoint && ` / ${r.endpoint}`}</span>
                        <span className="text-slate-400"> → </span>
                        <span className="text-slate-100">{r.rate} req / {r.window}s</span>
                      </div>
                      <p className="text-slate-400 text-sm mt-1">{r.rationale}</p>
                    </div>
                    <button
                      onClick={() => apply(i)}
                      disabled={record.applied[i] || applying !== null}
                      className={`${record.applied[i] ? 'btn-secondary' : 'btn-primary'} flex items-center justify-center space-x-2 disabled:opacity-60 disabled:hover:scale-100`}
                    >
                      {record.applied[i] ? <Check className="w-4 h-4" /> : applying === i ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      <span>{record.applied[i] ? 'Applied' : 'Apply'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
