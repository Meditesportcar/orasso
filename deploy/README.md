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

Seul ce qui est **commité** part (`git archive HEAD`). Le déploiement :
1. envoie l'archive et `remote-deploy.sh` sur le VPS ;
2. crée `/etc/orasso/dev.env` s'il n'existe pas (secrets générés sur le serveur) ;
3. construit `orasso-api:<commit>` et `orasso-web:<commit>` sur le VPS (pas de Docker sur le PC) ;
4. `docker compose up -d --wait` : la base, puis l'API (migrations, puis serveur), puis le site, chacun contrôlé ;
5. si un conteneur ne devient pas sain, **revient tout seul à la version précédente** et échoue ;
6. si `SEED_DEMO=1` et que `apps/api/package.json` a un script `db:seed`, lance le seed (idempotent) ;
7. contrôle `https://dev.orasso.fr/api/health` depuis le PC.

Retour arrière et migrations : `rollback` remet les images précédentes mais ne défait pas une migration déjà appliquée. Tant que les migrations ne font qu'ajouter, l'ancienne version fonctionne ; sinon, restaurer la sauvegarde (plus bas).

## Règles pour le code (lots suivants)

- Tout ce que l'API ou son seed importe à l'exécution doit être dans `dependencies` (l'image de l'API n'a pas les `devDependencies` ; `tsx` y est ajouté à la version du lockfile).
- Nouvelle variable d'environnement : l'ajouter à `deploy/dev.env.example`, puis sur le VPS dans `/etc/orasso/dev.env` (`sudo nano`), puis redéployer. Un secret se génère sur le serveur (`openssl rand -hex 32`) et ne s'affiche pas.
- Le site joint l'API pendant le rendu serveur par `API_INTERNAL_URL` (`http://orasso-api:3000`), sans repasser par nginx.
- Photos : écrire dans `UPLOADS_DIR` (`/data/uploads`), seul dossier inscriptible de l'API.

## Voir les journaux sur le VPS

```bash
ssh claude@51.210.242.118 "sudo docker logs --tail 200 -f orasso-api"
ssh claude@51.210.242.118 "sudo tail -n 50 /opt/orasso/state/build.log"
ssh claude@51.210.242.118 "sudo journalctl -u orasso-backup -n 20"
```

## nginx et certificat

`setup-nginx.sh` installe `nginx/dev.orasso.fr.conf`, obtient le certificat la première fois (vhost HTTP provisoire pour le défi ACME), et ne recharge nginx qu'après `nginx -t` (sinon il remet l'état d'avant). À relancer après une modification du vhost, en contrôlant les autres sites avant et après :

```bash
bash deploy/check-sites.sh
scp deploy/nginx/dev.orasso.fr.conf deploy/setup-nginx.sh claude@51.210.242.118:/tmp/
ssh claude@51.210.242.118 "sudo bash /tmp/setup-nginx.sh /tmp/dev.orasso.fr.conf" </dev/null
bash deploy/check-sites.sh
```

Changer le mot de passe du site : générer un hachage `openssl passwd -apr1` et le mettre dans `/etc/nginx/orasso-dev.htpasswd` (`orasso:<hachage>`, root:www-data 640), puis `sudo nginx -t && sudo systemctl reload nginx`.

## Sauvegarde et restauration

Installation (déjà faite) : `backup-db.sh` → `/usr/local/sbin/orasso-backup-db.sh` (root 750), `systemd/orasso-backup.{service,timer}` → `/etc/systemd/system/`, `systemctl enable --now orasso-backup.timer`.

Sauvegarde à la main : `ssh claude@51.210.242.118 "sudo systemctl start orasso-backup"`.

Restaurer un dump dans la base (écrase les données) :

```bash
ssh claude@51.210.242.118
sudo ls -1t /var/backups/orasso/
sudo docker stop orasso-web orasso-api
sudo cat /var/backups/orasso/<fichier>.dump | sudo docker exec -i orasso-db pg_restore -U orasso -d orasso --clean --if-exists --no-owner
sudo docker start orasso-api orasso-web
```

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
