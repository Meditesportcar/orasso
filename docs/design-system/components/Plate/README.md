# Plate

La plaque graphite : la carte du thème Sable dès que le fond est sombre, c'est-à-dire presque toujours sur le téléphone.

- Fond `plate` (rgba(43,46,54,.92) en Sable, `surface` en Béton où c'est simplement la carte), liseré `plate-edge` 1 px, `radius-lg`, `shadow-card`, padding 12 × 14 px. Texte `plate-ink` (poster), secondaire `plate-muted`, filets `plate-line`, chips en contour `plate-chip`, chip moutarde en `accent`, liste d'attente en #7fa6ff.
- **Règle du 15/10** : sur Sable, rien ne se pose en clair ni en transparence sur la zone sombre du fond. Toute carte du téléphone est une plaque (profil, véhicules, compteurs, carte candidat, agenda, Autour de moi, En attente, consignes) ; un libellé isolé monte sur une petite plaque `radius-sm` ; les notes de clavier et d'usage aussi.
- **Boutons secondaires sur plaque** (Refuser, Attente, Annuler) : fond `plate`, texte `plate-ink`, contour poster à 50 % (pointillé pour Refuser, #7fa6ff pour Attente). Retenir reste `accent`, Alerte reste `win`. Les gros boutons de secours du staff (Plaque, Express, Sans scan), en bas de l'écran dans la zone claire, restent en sable avec un contour `ink` de 2 px.
- Les notes et encarts « à confirmer » (bordure pointillée) sont des plaques eux aussi : en Béton ils peuvent être transparents sur le fond sombre, en Sable ils prennent le fond graphite comme les autres, jamais transparents. Un champ de saisie dans une plaque est en `surface-raised` graphite (#363941) dans les deux thèmes, texte poster : jamais un champ sable dans une plaque graphite.
- Pas de text-shadow, pas de contour, pas de néon sur les textes : la lisibilité vient du contraste plaque / poster (13:1).
- En Béton, Plate et la carte ordinaire sont la même chose : un seul composant dans le code, qui lit ses couleurs dans les jetons `plate-*`.
- Le consommateur fournit : le contenu. La plaque ne se décline pas en couleur.
