import axios from 'axios'

const API_BASE = '/api'

export const api = {
  // Metrics
  getMetrics: (timeRange = '24h') => 
    axios.get(`${API_BASE}/metrics`, { params: { timeRange } }),
  
  getLatencyPercentiles: () =>
    axios.get(`${API_BASE}/metrics/latency`),
  
  getClientMetrics: () =>
    axios.get(`${API_BASE}/metrics/clients`),
  
  getErrorMetrics: () =>
    axios.get(`${API_BASE}/metrics/errors`),

  // Rate Limits
  checkLimit: (clientId: string, cost?: number) =>
    axios.post(`${API_BASE}/check`, { client_id: clientId, cost: cost || 1 }),

  // Health
  getHealth: () =>
    axios.get(`${API_BASE}/health`),
}

export default api
