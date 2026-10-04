# Base images come through ArvanCloud's Docker Hub mirror; pass
# --build-arg REGISTRY=docker.io to pull from Docker Hub directly.
ARG REGISTRY=docker.arvancloud.ir

FROM ${REGISTRY}/node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# npm's download cache survives between builds, so packages are not fetched
# again when the dependency layer is rebuilt.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# docker compose run --rm migrate: applies Prisma migrations (needs DIRECT_URL).
FROM build AS migrations
ENV NODE_ENV=production
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM ${REGISTRY}/node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(4000)}).then(async r=>{if(!r.ok||(await r.json()).status!=='ok')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
