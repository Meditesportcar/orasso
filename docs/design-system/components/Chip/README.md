# Chip

Une catégorie, un filtre ou un fait, en capitales étroites.

- Style `meta` sur `radius-pill`, contour `line`. Sélectionnée : fond `ink`, texte inversé.
- **Sur plaque** : contour `plate-chip`, texte `plate-ink` ; sélectionnée : fond `accent`, texte `accent-ink` (c'est le filtre actif du bandeau de tri) ; moutarde : contour et texte `accent` tel quel, pas `accent-text`.
- Variante moutarde (inclinée à `--skew`, contour et texte `accent-text`, `neon-accent-soft`) pour ce qui est à toi : ton rayon, ta zone, ton grade. Dans une liste de catégories, la chip moutarde (droite, sans inclinaison) signale la catégorie recherchée par l'événement.
- Variante « vérifié » (coins à 4 px, plus petite) pour les badges de confiance : structure vérifiée, pro vérifié, certifié. Toujours en `ink`, jamais en couleur.
- Les chips de catégories dans une liste de filtres sont en défilement horizontal, celle qui est sélectionnée reste visible.
- Le consommateur fournit : le libellé, l'état sélectionné, la variante, le support (surface ou plaque).
