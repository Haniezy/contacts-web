FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM build AS migrations
ENV NODE_ENV=production
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(4000)}).then(async r=>{if(!r.ok||(await r.json()).status!=='ok')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
