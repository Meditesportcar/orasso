# Assets du seed

- `logo-msc.png` : logo réel de MéditeSportCar (blanc, fond transparent, rogné, 512 px), fourni par Damien (lot C6). Il se pose sur le fond sombre de la fiche organisateur.
- `photos/*.jpg` : 23 photos réelles de JohnGRD Photographie (photographe de Damien, usage autorisé par lui), choisies parmi 121,
  recompressées (côté long 1600 px, JPEG qualité 80, sans EXIF), **plaques d'immatriculation floutées** (flou gaussien fort sur chaque plaque lisible, avant ou arrière, marge de 15 %). Préfixes : `event-` (scènes de rassemblement), `car-` (voitures),
  `moto-`, `detail-` (pare-brise MéditeSportCar). Les originaux ne sont pas versionnés.
  Usage : affiches d'événements (`event-`, `car-`), garage des comptes de démonstration (`car-`, `moto-`), galeries (pros, média).

Si Damien dépose d'autres photos dans `photos-seed/` (à la racine du dépôt, ou dans le dossier donné par `PHOTOS_SEED_DIR`),
le seed les prend à la place pour les affiches.
