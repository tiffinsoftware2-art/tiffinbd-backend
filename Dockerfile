# Dockerfile — multistage for test and prod (used for all NestJS services)

# ── Stage 1: Build ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Run ───────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3001
# Apply any pending migrations before starting the app — see ADR-008. This is
# the actual fix for "pull new code, deploy, app breaks": schema changes now
# ship as committed migration files and get applied automatically on every
# deploy, instead of relying on synchronize (which is deliberately off here).
CMD ["sh", "-c", "npm run migration:run:prod && node dist/main.js"]
