# Celerant — a Next.js app with better-sqlite3 against one file on a mounted
# volume. Deploy to any host with a persistent disk (Fly.io, Railway, a VPS).

FROM node:22-slim AS deps
WORKDIR /app
# Build tools in case a native module lacks a prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Overridden by the host; points at the mounted volume in production.
ENV DATABASE_PATH=/data/celerant.db
RUN useradd -m app && mkdir -p /data && chown app:app /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
