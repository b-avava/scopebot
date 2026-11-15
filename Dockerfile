# syntax=docker/dockerfile:1
# The Scope Bot server with its web interface (ADR 0030).
# Build from the repository root: docker build -t scope-bot .

FROM node:24-slim AS base
WORKDIR /app
COPY package.json ./
# The pnpm the repository names in packageManager, so the lockfile reads the same as in development.
RUN npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
# Every workspace manifest, so pnpm sees the same workspace the lockfile was made for.
# A new package under apps/ or packages/ needs a line here; CI fails without it.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/desktop/package.json apps/desktop/
COPY apps/server/package.json apps/server/
COPY packages/agents/package.json packages/agents/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/integrations/package.json packages/integrations/
COPY packages/ui/package.json packages/ui/

# The browser interface, built with the desktop app's tools, which never reach the final image.
FROM base AS web
RUN pnpm install --frozen-lockfile --filter "@scope-bot/desktop..."
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/desktop ./apps/desktop
RUN pnpm --filter @scope-bot/desktop build:web

# Only what the server needs to run. The packages stay links to their own folders, because
# Node strips TypeScript types only outside node_modules.
FROM base AS server
RUN pnpm install --frozen-lockfile --prod --filter "@scope-bot/server..."
COPY packages/agents ./packages/agents
COPY packages/contracts ./packages/contracts
COPY packages/db ./packages/db
COPY packages/domain ./packages/domain
COPY packages/integrations ./packages/integrations
COPY apps/server ./apps/server

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIR=/app/web
COPY --from=server /app /app
COPY --from=web /app/apps/desktop/dist/web /app/web
COPY LICENSE ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/server/src/main.ts"]
