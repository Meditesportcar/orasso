#!/usr/bin/env bash
# Côté VPS, en root, une seule fois (ou après une modification de deploy/nginx/dev.orasso.fr.conf).
# Installe le vhost dev.orasso.fr, obtient le certificat si besoin, et ne recharge nginx qu'après `nginx -t`.
#   sudo bash setup-nginx.sh /tmp/dev.orasso.fr.conf
# Prérequis : /etc/nginx/orasso-dev.htpasswd (identifiants de l'authentification basique).
# Ne touche à aucun autre vhost.
set -euo pipefail

DOMAIN=dev.orasso.fr
CONF_SRC=${1:?chemin du fichier de vhost}
AVAILABLE=/etc/nginx/sites-available/$DOMAIN
ENABLED=/etc/nginx/sites-enabled/$DOMAIN
HTPASSWD=/etc/nginx/orasso-dev.htpasswd

log() { printf '[orasso-nginx] %s\n' "$*"; }

[ -f "$HTPASSWD" ] || { log "ERREUR : $HTPASSWD absent"; exit 1; }

# Installe un vhost puis teste ; en cas d'échec, remet l'état d'avant et s'arrête sans recharger.
install_vhost() {
  local src=$1 backup=""
  if [ -f "$AVAILABLE" ]; then backup=$(mktemp) && cp "$AVAILABLE" "$backup"; fi
  install -m 644 -o root -g root "$src" "$AVAILABLE"
  ln -sfn "$AVAILABLE" "$ENABLED"
  if ! nginx -t; then
    log "nginx -t en échec : retour à l'état précédent, nginx non rechargé"
    if [ -n "$backup" ]; then install -m 644 "$backup" "$AVAILABLE"; else rm -f "$AVAILABLE" "$ENABLED"; fi
    exit 1
  fi
  systemctl reload nginx
  [ -z "$backup" ] || rm -f "$backup"
}

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  log "pas encore de certificat : vhost HTTP provisoire pour le défi ACME"
  tmp=$(mktemp)
  cat >"$tmp" <<EOF
# ORASSO — $DOMAIN : vhost provisoire, le temps d'obtenir le certificat (remplacé par setup-nginx.sh).
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 404;
    }
}
EOF
  install_vhost "$tmp"
  rm -f "$tmp"
  log "certificat Let's Encrypt pour $DOMAIN (webroot)"
  certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive \
    --key-type ecdsa --deploy-hook "systemctl reload nginx"
fi

log "installation du vhost $DOMAIN"
install_vhost "$CONF_SRC"
log "vhost $DOMAIN en place"
