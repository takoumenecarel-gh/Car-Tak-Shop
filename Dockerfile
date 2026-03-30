# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY app/package*.json ./
RUN npm ci --only=production

# ─── Stage 2: Lean production image ───────────────────────────────────────────
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser  -G appgroup

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY app/ .

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
