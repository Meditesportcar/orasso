# syntax=docker/dockerfile:1
# Image de l'API (Hono, lancée par tsx comme en local). Contexte de construction : la racine du dépôt.
#   docker build -f apps/api/Dockerfile -t orasso-api:<version> .

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

# Dépendances de l'API et des paquets dont elle dépend (pas le site ni l'appli).
FROM base AS build
COPY . .
RUN --mount=type=cache,id=orasso-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.strict-dep-builds=false --filter "@orasso/api..."

FROM node:24-bookworm-slim
LABEL fr.orasso.image=api
ENV NODE_ENV=production PATH=/app/node_modules/.bin:$PATH API_PORT=3000 UPLOADS_DIR=/data/uploads
WORKDIR /app
COPY --from=build /app /app
# Photos sur disque (pilote local, en attendant le stockage objet OVH) : volume monté ici.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# Migrations versionnées puis démarrage (deploy/api-start.sh).
CMD ["sh", "/app/deploy/api-start.sh"]
