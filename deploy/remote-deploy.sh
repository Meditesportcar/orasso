#!/usr/bin/env bash
# Côté VPS, exécuté en root par deploy.sh (sudo). Ne touche qu'à ce qui porte le nom « orasso ».
#   remote-deploy.sh deploy <version> <archive.tar.gz>   construit, démarre, contrôle ; revient en arrière si échec
#   remote-deploy.sh rollback                            revient à la version précédente
#   remote-deploy.sh status | logs [service]
set -euo pipefail

ROOT=/opt/orasso
ENV_FILE=/etc/orasso/dev.env
STATE=$ROOT/state
KEEP=3 # versions gardées (dossiers et images)

log() { printf '[orasso] %s\n' "$*"; }
die() { printf '[orasso] ERREUR : %s\n' "$*" >&2; exit 1; }

# Crée /etc/orasso/dev.env au premier déploiement, secrets générés ici et jamais affichés.
ensure_env() {
  [ -f "$ENV_FILE" ] && return
  log "création de $ENV_FILE (secrets générés sur le serveur)"
  install -d -m 700 -o root -g root /etc/orasso
  (
    umask 077
    cat >"$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
NODE_ENV=production
PUBLIC_URL=https://dev.orasso.fr
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
SENTRY_DSN=
SENTRY_ENVIRONMENT=dev
SEED_DEMO=1
EOF
  )
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

compose() { # compose <version> <arguments…> : avec le compose.yml de cette version
  local tag=$1; shift
  ORASSO_TAG=$tag docker compose -f "$ROOT/releases/$tag/deploy/compose.yml" --env-file "$ENV_FILE" "$@"
}

current() { cat "$STATE/current" 2>/dev/null || true; }
previous() { cat "$STATE/previous" 2>/dev/null || true; }

start() { # start <version> : démarre et attend que les trois conteneurs soient sains
  compose "$1" up -d --wait --wait-timeout 180 --remove-orphans
}

seed() {
  local tag=$1
  grep -q '^SEED_DEMO=1' "$ENV_FILE" || return 0
  grep -q '"db:seed"' "$ROOT/releases/$tag/apps/api/package.json" || { log "pas de commande db:seed : seed ignoré"; return 0; }
  log "seed de démonstration"
  # Un seed en échec ne remet pas en cause la version, déjà en ligne : on le signale et on continue.
  docker exec orasso-api npm run db:seed || log "ATTENTION : le seed a échoué (version $tag en ligne quand même)"
}

# Signale les variables de deploy/dev.env.example absentes de dev.env (noms seulement, jamais les valeurs).
check_env() {
  local example=$ROOT/releases/$1/deploy/dev.env.example missing
  [ -f "$example" ] || return 0
  missing=$(comm -23 <(grep -oE '^[A-Z_][A-Z0-9_]*=' "$example" | sort -u) <(grep -oE '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE" | sort -u) | tr -d '=' | tr '\n' ' ')
  [ -z "$missing" ] || log "ATTENTION : variables absentes de $ENV_FILE : $missing(voir deploy/README.md)"
}

cleanup() { # garde les $KEEP dernières versions + courante et précédente
  local keep cur prev
  cur=$(current); prev=$(previous)
  keep=$(ls -1t "$ROOT/releases" | head -n "$KEEP")
  for dir in $(ls -1t "$ROOT/releases"); do
    if ! grep -qx "$dir" <<<"$keep" && [ "$dir" != "$cur" ] && [ "$dir" != "$prev" ]; then
      log "suppression de l'ancienne version $dir"
      rm -rf "${ROOT:?}/releases/$dir"
      docker image rm "orasso-api:$dir" "orasso-web:$dir" >/dev/null 2>&1 || true
    fi
  done
  # Images Orasso devenues anonymes (même version reconstruite) : seulement celles qui portent l'étiquette Orasso.
  docker image ls -q -f dangling=true -f label=fr.orasso.image | xargs -r docker image rm >/dev/null 2>&1 || true
  # Cache de construction borné à 10 Go (accord de Damien du 16/10/2026) : sans cela il grossissait à chaque
  # déploiement (52 Go le 16/10 sur un disque commun de 99 Go). Ne touche ni images, ni conteneurs, ni volumes.
  docker builder prune -f --max-used-space 10GB >/dev/null 2>&1 || log "ATTENTION : purge du cache de construction impossible"
}

deploy() {
  local tag=$1 archive=$2 prev
  [[ $tag =~ ^[0-9a-f]{7,40}$ ]] || die "version invalide : $tag"
  [ -f "$archive" ] || die "archive introuvable : $archive"
  ensure_env
  install -d -m 755 "$ROOT/releases" "$STATE"

  local dir=$ROOT/releases/$tag
  rm -rf "$dir" && mkdir -p "$dir"
  tar -xzf "$archive" -C "$dir"
  rm -f "$archive"

  local app
  for app in api web; do
    # Même commit = même contenu : ne pas reconstruire (une reconstruction déplacerait l'étiquette sans rien changer).
    if docker image inspect "orasso-$app:$tag" >/dev/null 2>&1; then
      log "image orasso-$app:$tag déjà construite"
      continue
    fi
    log "construction de orasso-$app:$tag (journal : $STATE/build.log)"
    docker build --progress=plain -f "$dir/apps/$app/Dockerfile" -t "orasso-$app:$tag" "$dir" >"$STATE/build.log" 2>&1 ||
      { tail -n 40 "$STATE/build.log"; die "construction de l'image $app impossible"; }
  done

  check_env "$tag"
  prev=$(current)
  log "démarrage de $tag${prev:+ (précédente : $prev)}"
  if ! start "$tag"; then
    docker logs --tail 40 orasso-api 2>&1 || true
    if [ -n "$prev" ] && [ "$prev" != "$tag" ] && [ -d "$ROOT/releases/$prev" ]; then
      log "échec : retour à $prev"
      start "$prev" || die "le retour à $prev a aussi échoué"
    else
      # Rien vers quoi revenir : arrêter plutôt que laisser l'API redémarrer en boucle.
      compose "$tag" stop orasso-web orasso-api || true
    fi
    die "la version $tag ne démarre pas"
  fi

  if [ "$prev" != "$tag" ]; then
    [ -n "$prev" ] && echo "$prev" >"$STATE/previous"
    echo "$tag" >"$STATE/current"
  fi
  seed "$tag"
  cleanup
  log "version $tag en ligne"
}

rollback() {
  local cur prev
  cur=$(current); prev=$(previous)
  [ -n "$prev" ] && [ -d "$ROOT/releases/$prev" ] || die "aucune version précédente disponible"
  log "retour de $cur à $prev"
  start "$prev"
  echo "$cur" >"$STATE/previous"
  echo "$prev" >"$STATE/current"
  log "version $prev en ligne (relancer rollback pour revenir à $cur)"
}

status() {
  echo "version courante : $(current)   précédente : $(previous)"
  docker ps -a --filter name=orasso- --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
}

# Un seul déploiement ou retour arrière à la fois (plusieurs sessions peuvent lancer deploy.sh).
lock() {
  exec 9>/run/orasso-deploy.lock
  flock -n 9 || die "un déploiement Orasso est déjà en cours"
}

case "${1:-}" in
  deploy | rollback) lock ;;
esac

case "${1:-}" in
  deploy) deploy "${2:?version}" "${3:?archive}" ;;
  rollback) rollback ;;
  status) status ;;
  logs) docker logs --tail "${LINES:-100}" "orasso-${2:-api}" ;;
  *) die "usage : $0 deploy <version> <archive> | rollback | status | logs [api|web|db]" ;;
esac
