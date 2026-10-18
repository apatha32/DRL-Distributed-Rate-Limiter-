# DRL Console

Live operations dashboard for the Distributed Rate Limiter. Built with React 18, TypeScript, Vite, Tailwind, TanStack Query, Framer Motion, and Recharts. It's deployed on Vercel.

| Page | What it shows | Data |
|---|---|---|
| Overview | Run live demo (scripted traffic with a plain-English explanation of every step), active algorithm (animated), health, decisions/sec, allowed %, server-side decision latency, throughput, busiest clients with RL-adjusted limits | `GET /v1/stats` every 2 s, `GET /health` every 5 s |
| Playground | Send bursts or a steady stream of real checks and watch each 200 / 429 come back, with the deciding algorithm, decisions per second, and remaining quota charts | `POST /v1/check` |
| RL Agent | Per-client enforced limit vs rule, exploration rate, reward per window, decision log | `GET /v1/rl/diagnostics/{client}` every 4 s |
| Algorithms | Live race (identical traffic against all four algorithms, cumulative admissions and peak-per-window), simplified Lua source, measured latency | `POST /v1/sandbox/check` |
| AI Analyst | Run a Claude analysis and apply its recommendations | admin endpoints, `X-API-Key` |

## Develop

```bash
npm install
npm run dev        # http://localhost:5173, proxies /v1 and /health to the API on :8000
npm test           # vitest + Testing Library
npm run lint && npm run typecheck && npm run build
```

## Configure

| Variable | Where | Value |
|---|---|---|
| `VITE_API_URL` | Vercel project settings | The Railway API URL, e.g. `https://drl-production.up.railway.app` |

The API must allow this site's origin: set `CORS_ORIGINS` on the API to the Vercel URL.

The admin key is never baked into the build. You type it into the AI Analyst page, and it's kept in `sessionStorage` for that tab only.

## Design notes

- Dark-only "ops console" theme. Color tokens are CSS variables in `src/index.css`, mapped to Tailwind roles.
- Allowed and blocked use a two-color categorical pair, validated for color-vision deficiency on the dark surface. Status colors only ever mark state, and always come with an icon and a label.
- Charts follow one-axis rules: 2 px lines, 10% area washes, hairline grids, a legend for two or more series, and hover tooltips.
- Motion: blurred fade-and-rise route transitions, staggered section reveals, charts that grow in from their baseline, looping algorithm illustrations, staggered cards, spring-animated numbers, and layout animations on live tables. Everything honors the OS "reduce motion" setting.
- Each page is lazy-loaded, and vendor code is split into separate chunks.
