#!/usr/bin/env bash
# Contrôle HTTP des sites du VPS commun, avant et après toute modification nginx (depuis le PC, Git Bash).
# Affiche le code de chaque site ; échoue si l'un d'eux ne répond pas 200/301/302.
set -uo pipefail

status=0
for site in orasso.fr sidewaysfest.fr crndrift.fr medite-event.fr meditesportcar.com; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$site/")
  printf '%-22s %s\n' "$site" "$code"
  case $code in 200 | 301 | 302) ;; *) status=1 ;; esac
done
exit $status
