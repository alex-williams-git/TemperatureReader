# Frontend — DHT11 Monitor dashboard

Next.js 16 (App Router) · React 19 · Tailwind v4 · Recharts · SWR.

```bash
npm install
npm run dev                          # http://localhost:3000
```

The backend (`../backend`) must be running. The browser calls a same-origin
`/api/*` path that the Next server proxies to the backend
(`next.config.ts` → `rewrites`), so there's no CORS to configure. The proxy
target defaults to `http://localhost:8000`; override with `BACKEND_ORIGIN`.

Production image: `output: "standalone"` in `next.config.ts` + a multi-stage
`Dockerfile`. The `/api` target is resolved at build time, so the Dockerfile
sets `BACKEND_ORIGIN=http://backend:8000` before `next build`.

## How it's put together

| Piece | File | Notes |
|---|---|---|
| Shell | `app/components/Dashboard.tsx` | Client-gated via `useIsClient`; owns the °C/°F unit (persisted to `localStorage`). |
| Live card | `app/components/LiveReading.tsx` | SWR polls `/readings/latest` every 5s, `/health` every 10s. |
| History | `app/components/HistoryChart.tsx` | A stack of zoom "frames". Clicking a bucket pushes a child frame; a breadcrumb + Back/Reset pop it. |
| Chart panel | `app/components/MetricChart.tsx` | One Recharts `ComposedChart`: avg line + shaded min/max `Area`. Reused for temp and humidity. |
| Zoom model | `lib/zoom.ts` | `WINDOW_LEVELS` defs, window math, drill/pan, tz offset. |
| API types + fetcher | `lib/api.ts` | |

## Zoom levels

| Level | Window | Bucket | Endpoint |
|---|---|---|---|
| Week | 7 days | 1 day | `/readings/aggregate?bucket=day` |
| Day | 24 h | 1 hour | `/readings/aggregate?bucket=hour` |
| Hour | 60 min | 10 min | `/readings/aggregate?bucket=ten_min` |
| 10 min | 10 min | raw | `/readings/range` |

Aggregation happens in SQL on the backend, so a week of 10-second readings
is ~7 points on the wire, not ~60,000.

## Theming

`next-themes` toggles `class="dark"` on `<html>`; `app/globals.css` defines
the light palette on `:root` and the dark overrides on `.dark`, mapped to
Tailwind utilities via `@theme inline`. Primary accent is blue; temperature
is orange, humidity is sky-blue.
