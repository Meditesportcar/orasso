# StatusBadge

Le statut d'une candidature ou d'un événement, incliné comme une étiquette d'affiche, reconnaissable sans sa couleur.

- Style `label`, `radius-pill`, `skewX(var(--skew))` avec le texte redressé.
- Candidature : **En attente** contour `status-pending` seul · **Retenue** fond `status-retained` (moutarde), texte `accent-ink`, `neon-accent-soft` · **Liste d'attente** fond `status-waitlist` (le seul bleu), avec le rang · **Refusée** contour `status-refused`, texte barré · **Sur place** fond `status-onsite` (inversé).
- Événement : **Maintenu** n'a pas de badge (c'est la normale) · **Incertain** hachures `status-uncertain` · **Annulé** fond `status-cancelled`, `neon-win`.
- Chaque état se distingue des autres par sa forme autant que par sa couleur : contour, plein, barré, hachuré. Un daltonien les lit.
- Le consommateur fournit : l'état, et le rang pour la liste d'attente.
- Sur une plaque graphite (Sable), la liste d'attente garde le bleu clair #7fa6ff (valeur Béton) : le bleu panneau foncé ne se lit pas sur le graphite.
- Jamais de badge « Refusée » en rouge, jamais deux badges côte à côte sur une même carte.
