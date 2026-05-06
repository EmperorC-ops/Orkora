# syntax=docker/dockerfile:1.6

# === Base ===
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
# Prisma needs openssl on alpine. swc and the API runtime need it too.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# === Dependencies ===
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
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

# === Runtime ===
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production runtime needs openssl for Prisma's query engine, and `pg` for
# the entrypoint's bootstrap logic to talk to Postgres directly.
RUN apk add --no-cache openssl libc6-compat curl

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 nestjs

COPY --chown=nestjs:nodejs --from=builder /app/apps/api/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/node_modules ./node_modules
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/prisma ./prisma
COPY --chown=nestjs:nodejs --from=builder /app/apps/api/package.json ./
# Schema.sql ships with the image so the entrypoint can bootstrap a fresh
# database when BOOTSTRAP_SCHEMA=true.
COPY --chown=nestjs:nodejs --from=builder /app/schema.sql /app/schema.sql

COPY --chown=nestjs:nodejs --from=builder /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nestjs

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:4000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
