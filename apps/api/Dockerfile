# syntax=docker/dockerfile:1
# Image de l'API (Hono, lancée par tsx comme en local). Contexte de construction : la racine du dépôt.
#   docker build -f apps/api/Dockerfile -t orasso-api:<version> .
# Image finale : dépendances de production seulement, plus tsx à la version du lockfile.
# Tout ce que l'API (et son seed) importe à l'exécution doit donc être dans « dependencies ».

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

# Version exacte de tsx donnée par le lockfile.
FROM base AS tsx-version
COPY . .
RUN --mount=type=cache,id=orasso-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.strict-dep-builds=false --filter "@orasso/api..." \
    && node -p "require('./node_modules/tsx/package.json').version" >/tsx-version

# Dépendances de production de l'API et des paquets dont elle dépend (pas le site ni l'appli).
FROM base AS prod-deps
COPY . .
RUN --mount=type=cache,id=orasso-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.strict-dep-builds=false --prod --filter "@orasso/api..."

FROM node:24-bookworm-slim
LABEL fr.orasso.image=api
ENV NODE_ENV=production API_PORT=3000 UPLOADS_DIR=/data/uploads
COPY --from=tsx-version /tsx-version /tmp/tsx-version
RUN npm install -g "tsx@$(cat /tmp/tsx-version)" && npm cache clean --force && rm /tmp/tsx-version
WORKDIR /app
COPY --from=prod-deps /app /app
# Photos sur disque (pilote local, en attendant le stockage objet OVH) : volume monté ici.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# Migrations versionnées puis démarrage (deploy/api-start.sh).
CMD ["sh", "/app/deploy/api-start.sh"]
