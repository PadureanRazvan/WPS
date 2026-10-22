FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080

# Native Codex HTTPS needs system trust roots, independently of Node's roots.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/cloud/codex-worker
COPY cloud/codex-worker/package.json cloud/codex-worker/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Only reviewed runtime source enters the image. No repository, credentials,
# local CODEX_HOME, environment files, tests, or deployment tooling is copied.
COPY --chown=node:node cloud/codex-worker/src ./src
COPY --chown=node:node functions/sherpa-ai-policy.js /app/functions/sherpa-ai-policy.js

USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
