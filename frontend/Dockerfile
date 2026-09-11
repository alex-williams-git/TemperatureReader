# Next.js 16 dashboard, built to a standalone server for a slim runtime image.
# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT, not this directory (see docker-compose.yml
# `frontend.build.context: .`) -- AmbientBackground.tsx imports
# ../../../thermal-profile.json, the shared calibration source also read by
# rgb-bridge, which lives outside frontend/. All COPY sources below are
# therefore repo-root-relative.

# ---- deps: install node_modules from the lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# ---- builder: compile the app + trace a standalone server bundle ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .
COPY thermal-profile.json /thermal-profile.json
ENV NEXT_TELEMETRY_DISABLED=1
# Baked into the /api rewrite so the standalone server proxies to the compose
# service (also set at runtime in docker-compose.yml).
ENV BACKEND_ORIGIN=http://backend:8000
RUN npm run build

# ---- runner: just Node + the standalone output ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BACKEND_ORIGIN=http://backend:8000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# standalone/ contains server.js + the minimal node_modules it traced.
# .next/static isn't included by the trace and must be copied alongside it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
