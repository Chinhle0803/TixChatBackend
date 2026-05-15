# ---- Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build 2>/dev/null || true

# ---- Runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

USER nestjs

COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --chown=nestjs:nodejs . .

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
