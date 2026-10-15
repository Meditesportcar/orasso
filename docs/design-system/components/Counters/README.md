# Counters

Une rangée de chiffres qui ne bougent pas de place quand ils changent.

- Sur téléphone, c'est une **Plate** : fond `plate`, chiffres `plate-ink`, étiquettes `plate-muted`, cellules séparées par `plate-line`, `radius-md`, `shadow-card`. Sur le site organisateur (zone claire de la page), la rangée reste en `surface` sable avec `ink` et `line`.
- Chiffre en style `number` (800, chiffres tabulaires ; 18 px sur téléphone, 24 px sur le site), étiquette en `label` réduite à 8–9 px.
- La cellule « active » (ce sur quoi on travaille : à trier, places restantes) prend le fond `accent` avec `accent-ink`. Une seule cellule active.
- Sert aux compteurs de tri (places restantes, retenus, à trier, liste d'attente, refusés), à la page événement (places, retenus, amis), au direct du jour J (arrivés, attendus, prestataires, staff).
- Les valeurs se mettent à jour en temps réel sans animation de défilement : le chiffre change, un flash `accent` de `fast` (120 ms) sur la cellule.
- Le consommateur fournit : les paires chiffre / étiquette et l'index de la cellule active.
