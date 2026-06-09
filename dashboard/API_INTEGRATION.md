# Dashboard API Integration Guide

## Overview

The dashboard is configured to communicate with your DRL backend API. All requests are proxied through Vite's dev server during development.

## Configuration

### Development (Vite Proxy)

Edit `vite.config.ts`:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '/v1'),
  },
}
```

This automatically:
- Proxies `/api/*` requests to `http://localhost:8000/v1/*`
- Handles CORS issues
- Rewrites paths transparently

### Production

For production, configure your reverse proxy (nginx/Apache):

```nginx
location /api/ {
    proxy_pass http://backend:8000/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## API Endpoints Used

### Metrics Endpoints

```typescript
// Get general metrics
GET /api/metrics?timeRange=24h
Response: {
  totalRequests: number
  allowedRequests: number
  blockedRequests: number
  activeClients: number
}

// Get latency percentiles
GET /api/metrics/latency
Response: {
  p50: number
  p95: number
  p99: number
}

// Get per-client metrics
GET /api/metrics/clients
Response: Array<{
  clientId: string
  requests: number
  allowed: number
  blocked: number
  avgLatency: number
}>

// Get error metrics
GET /api/metrics/errors
Response: Array<{
  time: string
  redisErrors: number
  circuitBreakerTrips: number
  timeouts: number
}>
```

### Rate Limit Endpoints

```typescript
// Check rate limit
POST /api/check
Body: {
  client_id: string
  cost?: number (default: 1)
}
Response: {
  allowed: boolean
  remaining: number
  retryAfter: number
}
```

### Health Endpoints

```typescript
// Health check
GET /api/health
Response: {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
}
```

## Making API Calls

### Using the API Client

```typescript
import { api } from './api/client'

// Get metrics
const metrics = await api.getMetrics('24h')
console.log(metrics.data)

// Check rate limit
const result = await api.checkLimit('user_123', 1)
console.log(result.data)

// Get health status
const health = await api.getHealth()
console.log(health.data)
```

### Direct Axios Calls

```typescript
import axios from 'axios'

// Make a request
const response = await axios.get('/api/metrics', {
  params: { timeRange: '24h' }
})

// Handle errors
try {
  const data = await axios.post('/api/check', {
    client_id: 'user_123'
  })
} catch (error) {
  console.error('Rate limit check failed', error)
}
```

### Fetch API

```typescript
// GET request
const response = await fetch('/api/metrics?timeRange=24h')
const data = await response.json()

// POST request
const result = await fetch('/api/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_id: 'user_123' })
})
const data = await result.json()
```

## Error Handling

```typescript
import axios from 'axios'

try {
  const response = await api.getMetrics()
  // Handle success
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      console.error('Endpoint not found')
    } else if (error.response?.status === 429) {
      console.error('Too many requests')
    } else if (error.response?.status === 500) {
      console.error('Server error')
    }
  } else {
    console.error('Network error', error)
  }
}
```

## Response Caching

To avoid unnecessary requests, implement caching:

```typescript
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 5000 // 5 seconds

async function getCachedMetrics(timeRange: string) {
  const key = `metrics:${timeRange}`
  const cached = cache.get(key)
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data
  }
  
  const response = await api.getMetrics(timeRange)
  cache.set(key, { data: response.data, timestamp: Date.now() })
  return response.data
}
```

## WebSocket Support (Future)

For real-time updates, implement WebSocket:

```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/metrics')

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log('Real-time metric:', data)
}

ws.onerror = (error) => {
  console.error('WebSocket error:', error)
}

ws.close()
```

## Rate Limiting Client Side

Implement exponential backoff for retries:

```typescript
async function fetchWithRetry(url: string, options: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, options)
    } catch (error) {
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
}
```

## CORS Configuration

If running on different domains, ensure backend CORS headers:

```python
# Flask/FastAPI
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Testing API Integration

### Mock API for Development

```typescript
// src/api/mock.ts
export const mockMetrics = {
  totalRequests: 127534,
  allowedRequests: 126234,
  blockedRequests: 1300,
  activeClients: 342,
}

export const useMockAPI = process.env.USE_MOCK_API === 'true'
```

### Use Mock Data

```typescript
import { api } from './api/client'
import { mockMetrics, useMockAPI } from './api/mock'

async function getMetrics() {
  if (useMockAPI) {
    return { data: mockMetrics }
  }
  return api.getMetrics()
}
```

## Troubleshooting

### CORS Errors
- Check backend CORS headers
- Verify dev server proxy configuration
- Use browser DevTools Network tab to inspect requests

### 404 Errors
- Verify endpoint path is correct
- Check backend is running on correct port
- Inspect actual request URL in Network tab

### Timeout Errors
- Increase timeout in axios config: `timeout: 30000`
- Check backend performance
- Verify network connectivity

### Connection Refused
- Ensure backend is running
- Check port number matches configuration
- Verify firewall isn't blocking connections
