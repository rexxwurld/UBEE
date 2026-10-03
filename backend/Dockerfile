# Dockerfile
#
# Multi-stage build: the `deps` stage installs dependencies once and is
# cached across builds as long as package.json/package-lock.json don't
# change; the final stage copies only what's needed to run, not the
# npm cache or build tooling.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# --omit=dev: this is a production image, not a dev/CI environment -
# nodemon, jest, mongodb-memory-server have no business in the runtime
# image.
RUN npm install --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app

# Run as a non-root user - the base image's own built-in `node` user,
# not root. Nothing in this app needs root (no privileged ports below
# 1024 by default here, no filesystem operations outside /app).
USER node

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

ENV NODE_ENV=production
EXPOSE 4000

# No HEALTHCHECK instruction here on purpose - the app's own
# /health endpoint (src/app.js) is DB-connectivity-aware (Phase 6);
# wire that into your actual orchestrator's health check (Docker
# Compose's healthcheck:, Kubernetes readiness/liveness probes, etc.)
# rather than duplicating that logic in two places.

CMD ["node", "src/server.js"]
