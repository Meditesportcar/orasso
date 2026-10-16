# Déploiement de la version de test — dev.orasso.fr

Le VPS (`claude@51.210.242.118`) est **partagé avec d'autres sites en production** (sidewaysfest.fr, crndrift.fr, medite-event.fr, MéditeSportCar, supervision). Orasso n'y touche qu'à ce qui porte son nom : conteneurs `orasso-*`, réseau `orasso`, volumes `orasso_pgdata` et `orasso_uploads`, images `orasso-api` et `orasso-web`, dossiers `/opt/orasso`, `/etc/orasso`, `/var/backups/orasso`, vhost `dev.orasso.fr`, timer `orasso-backup`. Jamais de `docker system prune` ni `docker volume prune`. Éviter 02:30–04:00 UTC (sauvegardes du VPS).

## Ce qui tourne

| Élément | Où |
|---|---|
| Base PostgreSQL 17 | conteneur `orasso-db`, volume `orasso_pgdata`, aucun port publié (réseau `orasso` seulement) |
| API (Hono, tsx) | conteneur `orasso-api`, `127.0.0.1:3211`, migrations appliquées à chaque démarrage |
| Site (React Router, rendu serveur) | conteneur `orasso-web`, `127.0.0.1:3210` |
| Photos (pilote disque) | volume `orasso_uploads`, monté sur `/data/uploads` (`UPLOADS_DIR`) |
| Secrets | `/etc/orasso/dev.env` (root, 600), créé au premier déploiement, jamais affiché |
| Versions | `/opt/orasso/releases/<commit>` (3 dernières), `/opt/orasso/state/current` et `previous` |
| nginx | `/etc/nginx/sites-available/dev.orasso.fr` (lien dans `sites-enabled`) ; `/` → site, `/api/` et `/api/ws` → API |
| Certificat | Let's Encrypt `dev.orasso.fr` (certbot webroot `/var/www/html`, renouvellement automatique, reload nginx) |
| Mot de passe du site | `/etc/nginx/orasso-dev.htpasswd` ; identifiants dans `C:\Users\DELL\.claude\relais\orasso\secrets-dev.txt` (hors dépôt) |
| Sauvegarde | `/usr/local/sbin/orasso-backup-db.sh`, timer `orasso-backup` à 01:15 UTC, dumps dans `/var/backups/orasso` (7 jours) |

Le site demande un mot de passe (version de test, non indexée). `/api/` n'en demande pas : l'appli mobile l'appelle directement et l'API a sa propre authentification.

## Commandes (depuis le PC, Git Bash, à la racine du dépôt)

```bash
bash deploy/deploy.sh            # envoie le commit courant (HEAD), construit, démarre, contrôle /api/health
bash deploy/deploy.sh status     # version en ligne et état des conteneurs
bash deploy/deploy.sh logs api   # 100 dernières lignes (api, web ou db)
bash deploy/deploy.sh rollback   # revient à la version précédente (relancer pour revenir)
bash deploy/check-sites.sh       # codes HTTP des autres sites du VPS
```

Seul ce qui est **commité** part (`git archive HEAD`), et par défaut seulement un commit **déjà dans `origin/main`** : les migrations Drizzle s'appliquent par ordre de date, donc déployer une branche non fusionnée (migration récente) puis `main` (migration plus ancienne) ferait sauter cette dernière sans erreur. Pour essayer une branche quand même : `ORASSO_ALLOW_BRANCH=1 bash deploy/deploy.sh`, en sachant qu'il faudra peut-être repartir d'une sauvegarde. Un seul déploiement à la fois (verrou sur le VPS). Le déploiement :
1. envoie l'archive et `remote-deploy.sh` sur le VPS ;
2. crée `/etc/orasso/dev.env` s'il n'existe pas (secrets générés sur le serveur), et signale les variables de `deploy/dev.env.example` qui y manquent (noms seulement) ;
3. construit `orasso-api:<commit>` et `orasso-web:<commit>` sur le VPS (pas de Docker sur le PC) ;
4. `docker compose up -d --wait` : la base, puis l'API (migrations, puis serveur), puis le site, chacun contrôlé ;
5. si un conteneur ne devient pas sain, **revient tout seul à la version précédente** et échoue (sans version précédente, il arrête l'API et le site) ;
6. si `SEED_DEMO=1` et que `apps/api/package.json` a un script `db:seed`, lance le seed (idempotent) ; un seed en échec est signalé sans annuler la version ;
7. contrôle `https://dev.orasso.fr/api/health` depuis le PC.

Retour arrière et migrations : `rollback` remet les images précédentes mais ne défait pas une migration déjà appliquée. Tant que les migrations ne font qu'ajouter, l'ancienne version fonctionne ; sinon, restaurer la sauvegarde (plus bas).

## Règles pour le code (lots suivants)

- Tout ce que l'API ou son seed importe à l'exécution doit être dans `dependencies` (l'image de l'API n'a pas les `devDependencies` ; `tsx` y est ajouté à la version du lockfile).
- Le script `db:seed` de `apps/api` est lancé par `npm run` dans l'image (pas de pnpm) : il appelle `tsx` directement (ex. `tsx src/scripts/seed.ts`) et doit être idempotent.
- Taille des envois (nginx) : 16 Mo par requête sur l'API, 128 Mo sur `POST /api/me/vehicles/:id/photos` seulement. Une autre route d'envoi lourd = une `location` de plus dans `nginx/dev.orasso.fr.conf`. Débit : 30 requêtes/s par adresse IP (pointe 60), au-delà 429.
- L'API reçoit l'adresse du client dans `X-Forwarded-For` (une seule adresse, posée par nginx) et `X-Real-IP`. Le mot de passe du site (`Authorization: Basic`) ne lui est pas transmis ; un jeton `Bearer` l'est.
- Nouvelle variable d'environnement : l'ajouter à `deploy/dev.env.example`, puis sur le VPS dans `/etc/orasso/dev.env` (`sudo nano`), puis redéployer. Un secret se génère sur le serveur (`openssl rand -hex 32`) et ne s'affiche pas.
- Le site joint l'API pendant le rendu serveur par `API_INTERNAL_URL` (`http://orasso-api:3000`), sans repasser par nginx.
- Photos : écrire dans `UPLOADS_DIR` (`/data/uploads`), seul dossier inscriptible de l'API.
- GlitchTip / Sentry (lot 15) : `SENTRY_DSN` (API) et `VITE_SENTRY_DSN` (rendu serveur du site) se lisent au démarrage depuis `/etc/orasso/dev.env` ; `SENTRY_RELEASE` reçoit l'étiquette de l'image (`compose.yml`). Côté navigateur, `VITE_SENTRY_DSN` est lu **à la construction** de l'image du site : `remote-deploy.sh` le lit dans `/etc/orasso/dev.env` et le passe en `--build-arg` (vide si absent). Vides = rien n'est envoyé ; pas de traces de performance.
- Clés d'accès (passkeys, lot 15) : identifiant de domaine = hôte de `PUBLIC_URL` (`dev.orasso.fr`) ; une clé créée sur dev.orasso.fr ne vaut pas pour orasso.fr.

## Voir les journaux sur le VPS

```bash
ssh claude@51.210.242.118 "sudo docker logs --tail 200 -f orasso-api"
ssh claude@51.210.242.118 "sudo tail -n 50 /opt/orasso/state/build.log"
ssh claude@51.210.242.118 "sudo journalctl -u orasso-backup -n 20"
```

## Clés de signature des QR (lot 06)

`QR_SIGNING_KEYS` (JSON `[{"kid":1,"privateKey":"<graine 32 octets base64>"}]`) et `QR_SIGNING_ACTIVE_KID` dans
`/etc/orasso/dev.env` (voir `dev.env.example`). En production, l'API refuse de démarrer sans elles, avec le `kid 0`
(réservé à la clé de démonstration du développement), ou si un `kid` déjà connu a changé de clé.

**Rotation simple** (clé non compromise) : ajouter une clé à la liste (`kid` suivant), la rendre active, redéployer ;
garder l'ancienne dans la liste tant que des QR signés avec elle servent encore.

**Clé compromise** :
1. Générer une nouvelle graine (`openssl rand -base64 32`), l'ajouter à `QR_SIGNING_KEYS` sous un nouveau `kid`, mettre
   `QR_SIGNING_ACTIVE_KID` sur ce `kid` (ne pas afficher le fichier), redémarrer l'API (redéploiement ou
   `docker compose … up -d`).
2. Révoquer l'ancienne : `ssh claude@51.210.242.118 "sudo docker exec orasso-api npm run keys:revoke -- <kid>"`. La clé
   sort de `/api/keys`, de la synchro du staff et de la vérification serveur ; chaque QR valide qu'elle avait signé est
   remplacé par un QR signé avec la clé active (motif `replaced`), visible aussitôt par son titulaire et par le staff à
   la synchro suivante.
3. Retirer ensuite l'ancienne clé de `QR_SIGNING_KEYS` et redémarrer.

## nginx et certificat

`setup-nginx.sh` installe `nginx/dev.orasso.fr.conf`, obtient le certificat la première fois (vhost HTTP provisoire pour le défi ACME), et ne recharge nginx qu'après `nginx -t` (sinon il remet l'état d'avant). À relancer après une modification du vhost, en contrôlant les autres sites avant et après :

```bash
bash deploy/check-sites.sh
scp deploy/nginx/dev.orasso.fr.conf deploy/setup-nginx.sh claude@51.210.242.118:/tmp/
ssh claude@51.210.242.118 "sudo bash /tmp/setup-nginx.sh /tmp/dev.orasso.fr.conf" </dev/null
bash deploy/check-sites.sh
```

Changer le mot de passe du site : générer un hachage `openssl passwd -apr1` (bcrypt serait mieux, mais `htpasswd` n'est pas installé sur le VPS) et le mettre dans `/etc/nginx/orasso-dev.htpasswd` (`orasso:<hachage>`, root:www-data 640), puis `sudo nginx -t && sudo systemctl reload nginx`.

## Sauvegarde et restauration

Installation (déjà faite) : `backup-db.sh` → `/usr/local/sbin/orasso-backup-db.sh` (root 750), `systemd/orasso-backup.{service,timer}` → `/etc/systemd/system/`, `systemctl enable --now orasso-backup.timer`.

Sauvegarde à la main : `ssh claude@51.210.242.118 "sudo systemctl start orasso-backup"`.

Restaurer un dump dans la base (écrase les données). La base est recréée vide d'abord : un simple `pg_restore --clean` laisserait les tables créées après le dump, et l'API ne redémarrerait plus (migration rejouée sur une table existante).

```bash
ssh claude@51.210.242.118
sudo ls -1t /var/backups/orasso/
sudo docker stop orasso-web orasso-api
sudo docker exec orasso-db dropdb -U orasso --force orasso
sudo docker exec orasso-db createdb -U orasso orasso
sudo cat /var/backups/orasso/<fichier>.dump | sudo docker exec -i orasso-db pg_restore -U orasso -d orasso --no-owner --exit-on-error
sudo docker start orasso-api orasso-web
```

Après une restauration, revenir aussi à la version du code de la date du dump si des migrations ont été ajoutées depuis (`bash deploy/deploy.sh rollback`).

Tester un dump sans toucher à la base : le restaurer dans un conteneur jetable `postgres:17 --network none` (testé le 15/10/2026 : mêmes tables, migrations comprises).

### Envoi hors VPS — à valider par Damien (non appliqué)

`vps-backup.sh` (03:30 UTC, rclone chiffré vers Drive) lit des dossiers supplémentaires dans `/etc/vps-backup/files.list` (`nom:chemin`, synchro avec corbeille de 7 jours). Pour y ajouter Orasso **sans modifier le script**, deux lignes :

```
orasso-dev-db:/var/backups/orasso
orasso-dev-uploads:/var/lib/docker/volumes/orasso_uploads/_data
```

```bash
ssh claude@51.210.242.118 "printf '%s\n' orasso-dev-db:/var/backups/orasso orasso-dev-uploads:/var/lib/docker/volumes/orasso_uploads/_data | sudo tee -a /etc/vps-backup/files.list >/dev/null" </dev/null
```

Les dumps d'Orasso sont faits à 01:15 UTC, avant le passage de `vps-backup.sh`.

## Variante : le VPS récupère le code depuis GitHub (non activée)

Aujourd'hui le code part du PC (`git archive`). Pour que le VPS le récupère lui-même (utile pour une CI plus tard) :

1. Sur le VPS : `sudo ssh-keygen -t ed25519 -N "" -C "orasso-deploy@vps" -f /etc/orasso/github_deploy_key` (clé privée root 600).
2. Damien ajoute `/etc/orasso/github_deploy_key.pub` dans GitHub → dépôt `Meditesportcar/orasso` → Settings → Deploy keys, **lecture seule** (validation humaine).
3. Clone nu une fois, puis à chaque déploiement `fetch` et archive du commit voulu (GitHub n'accepte pas `git archive --remote`) :
   ```bash
   export GIT_SSH_COMMAND="ssh -i /etc/orasso/github_deploy_key -o IdentitiesOnly=yes"
   sudo -E git clone --bare git@github.com:Meditesportcar/orasso.git /opt/orasso/repo.git   # une fois
   sudo -E git --git-dir=/opt/orasso/repo.git fetch origin '+refs/heads/*:refs/heads/*'
   sudo git --git-dir=/opt/orasso/repo.git archive --format=tar.gz -o /tmp/orasso-<commit>.tar.gz <commit>
   ```
4. Puis `sudo bash remote-deploy.sh deploy <commit> /tmp/orasso-<commit>.tar.gz`, comme aujourd'hui.

## Disque et cache de construction

Les images sont construites sur le VPS (disque commun de 99 Go). Le cache de construction Docker grossissait à chaque déploiement (52 Go le 16/10/2026) : avec l'accord de Damien, il a été purgé (`docker builder prune -f --max-used-space 10GB`, 38,6 Go libérés) et `remote-deploy.sh` le borne désormais à 10 Go à la fin de chaque déploiement réussi. Cette commande ne touche ni les images, ni les conteneurs, ni les volumes (ceux des autres services du VPS non plus). Contrôle : `ssh claude@51.210.242.118 'df -h /; sudo docker system df'`.
