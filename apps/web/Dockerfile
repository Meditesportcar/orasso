# syntax=docker/dockerfile:1
# Image du site (React Router 8, rendu serveur). Contexte de construction : la racine du dépôt.
#   docker build -f apps/web/Dockerfile -t orasso-web:<version> .

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS build
COPY . .
RUN --mount=type=cache,id=orasso-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.strict-dep-builds=false --filter "@orasso/web..."
# DSN GlitchTip du navigateur (lot 15) : vide = rien n'est chargé ni envoyé.
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN pnpm --filter @orasso/web build

# Dépendances d'exécution seulement (sans Vite ni outils de compilation).
FROM base AS prod-deps
COPY . .
RUN --mount=type=cache,id=orasso-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.strict-dep-builds=false --prod --filter "@orasso/web..."

FROM node:24-bookworm-slim
LABEL fr.orasso.image=web
ENV NODE_ENV=production PATH=/app/node_modules/.bin:$PATH PORT=3000
WORKDIR /app
COPY --from=prod-deps /app /app
COPY --from=build /app/apps/web/build /app/apps/web/build
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["react-router-serve", "./build/server/index.js"]
