# syntax=docker/dockerfile:1.6

# === Base ===
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
# Prisma needs openssl on alpine. swc and the API runtime need it too.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# === Dependencies ===
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile --filter @orkora/api...

# === Builder ===
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @orkora/api exec prisma generate
RUN pnpm --filter @orkora/api build

# === Production deps ===
# pnpm workspaces hoist transitive deps to the repo-root `node_modules` and
# leave per-app `node_modules` as a forest of symlinks. To produce a runtime
# image with no symlinks, we use `pnpm deploy` which materialises a
# self-contained, production-only `node_modules` for the chosen workspace.
#
# pnpm 10 requires inject-workspace-packages=true for `pnpm deploy` to work
# (set in both .npmrc and pnpm-workspace.yaml for belt-and-suspenders).
#
# After deploy we re-run `prisma generate` against the deployed tree so the
# generated client (which lives inside @prisma/client/.prisma/) is present
# in the runtime image. The builder stage's generated client doesn't survive
# the deploy step because pnpm copies fresh package tarballs.
FROM base AS prod-deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY packages/contracts ./packages/contracts
RUN pnpm deploy --filter @orkora/api --prod /tmp/api-deploy
RUN cd /tmp/api-deploy && npx --yes prisma@5.22.0 generate --schema=./prisma/schema.prisma

# === Runtime ===
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production runtime needs openssl for Prisma's query engine, and curl for
# the healthcheck.
RUN apk add --no-cache openssl libc6-compat curl

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 nestjs

# Self-contained node_modules from `pnpm deploy` — no dangling symlinks,
# Prisma client already generated inside @prisma/client.
COPY --chown=nestjs:nodejs --from=prod-deps /tmp/api-deploy/node_modules ./node_modules
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/prisma ./prisma
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/package.json ./
# Schema.sql ships with the image so the entrypoint can bootstrap a fresh
# database when BOOTSTRAP_SCHEMA=true.
COPY --chown=nestjs:nodejs --from=builder /app/schema.sql /app/schema.sql

# Forward-only migrations + their runner. The entrypoint applies any pending
# migrations on boot (advisory-locked) so existing databases stay in sync
# without `prisma db push`. Needs `pg`, which is a production dependency.
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/migrations ./migrations
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/scripts ./scripts

COPY --chown=nestjs:nodejs --from=builder /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nestjs

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:4000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
