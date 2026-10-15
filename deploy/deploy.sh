#!/usr/bin/env bash
# Déploie la version de test sur https://dev.orasso.fr, depuis le PC (Git Bash).
#   deploy/deploy.sh            envoie le commit courant (HEAD), construit, démarre, contrôle
#   deploy/deploy.sh rollback   revient à la version précédente
#   deploy/deploy.sh status     version en ligne et état des conteneurs
#   deploy/deploy.sh logs [api|web|db]
# Variables : ORASSO_VPS (défaut claude@51.210.242.118), ORASSO_URL (défaut https://dev.orasso.fr).
set -euo pipefail

VPS=${ORASSO_VPS:-claude@51.210.242.118}
URL=${ORASSO_URL:-https://dev.orasso.fr}
cd "$(git rev-parse --show-toplevel)"

remote() { # remote <arguments de remote-deploy.sh…>
  scp -q deploy/remote-deploy.sh "$VPS:/tmp/orasso-remote-deploy.sh"
  ssh "$VPS" "sudo bash /tmp/orasso-remote-deploy.sh $*" </dev/null
}

check() { # /api/health doit répondre « ok » à travers nginx et le certificat
  local body
  for _ in 1 2 3 4 5; do
    if body=$(curl -fsS --max-time 10 "$URL/api/health" 2>/dev/null) && [[ $body == *'"status":"ok"'* ]]; then
      echo "[orasso] $URL/api/health : $body"
      return 0
    fi
    sleep 3
  done
  echo "[orasso] ERREUR : $URL/api/health ne répond pas « ok »" >&2
  return 1
}

case "${1:-deploy}" in
  deploy)
    tag=$(git rev-parse --short=12 HEAD)
    if [ -n "$(git status --porcelain)" ]; then
      echo "[orasso] attention : modifications non commitées ignorées, seul $tag est envoyé"
    fi
    archive=$(mktemp)
    trap 'rm -f "$archive"' EXIT
    git archive --format=tar.gz -o "$archive" HEAD
    echo "[orasso] envoi de $tag ($(du -h "$archive" | cut -f1))"
    scp -q "$archive" "$VPS:/tmp/orasso-$tag.tar.gz"
    remote deploy "$tag" "/tmp/orasso-$tag.tar.gz"
    check
    ;;
  rollback)
    remote rollback
    check
    ;;
  status) remote status ;;
  logs) remote logs "${2:-api}" ;;
  *)
    echo "usage : $0 [deploy|rollback|status|logs [api|web|db]]" >&2
    exit 1
    ;;
esac
