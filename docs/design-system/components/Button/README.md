# Button

Le bouton Orasso est droit, en capitales larges, et un seul par écran porte le néon moutarde.

- **Principal** : `accent` sur `accent-ink`, `neon-accent`, 48 px de haut, `radius-md`. Un seul par écran : l'action que l'écran demande (Candidater, Mode jour J, Retenir).
- **Secondaire** : contour `ink` 1,5 px, fond transparent (sur Béton). Les actions de même niveau mais non prioritaires (Suivre, Partager, Écrire).
- **Sur plaque** : fond `plate`, texte `plate-ink`, contour poster à 50 % ; pointillé pour Refuser, #7fa6ff pour Attente. C'est la forme des boutons secondaires en rangée d'action (tri, candidature) dans les deux thèmes : en Béton elle se confond avec la carte, en Sable c'est ce qui les rend lisibles sur la zone sombre. Les boutons « discrets » gris sur transparent de la version 1 ont disparu : ils ne se lisaient pas (Refuser, Sans scan, Discussion, Annuler ont tous été remontés en contraste le 15/10).
- **Secours du staff** (Plaque, Express, Sans scan ; Liste, Incident, Discussion) : 72 px et 56 px, `radius-md` 14 px, sur `surface` avec contour `ink` 2 px en Sable, contour `ink` 1,5 px en Béton. Sans scan en pointillé.
- **Sur affiche** : posé sur la carte `poster`, fond `night`, texte `accent`. C'est le seul bouton qui écrit en moutarde.
- **Alerte** : `win`, `neon-win`, 56 px. Réservé au mode staff (alerte) et aux confirmations graves (annuler l'événement).
- **Fermer** : la pastille ✕ de 34 px en `radius-chip`, contour `line` 1,5 px (Béton) ou contour `ink` 2 px sur crème à 22 % (Sable), toujours dernier élément à droite de l'en-tête. Sur photo, pastille de 36 px `rgba(19,20,23,.55)`. C'est la seule façon de quitter un écran de flux.
- Libellé en style `button` : famille display, `font-stretch: 125%`, 900, capitales, jamais italique. **Toujours une icône à gauche** (20 px sur le principal, 18 px ailleurs, 22 px au-dessus du libellé sur les boutons en colonne du tri) ; la flèche « suivant » à droite termine un libellé qui ouvre un mode plein écran.
- **Rangée de trois** (Liste · Incident · Discussion, Refuser · Attente · Retenir, Écrire · Me désister) : icône au-dessus du libellé, 11 px, chaque bouton en `flex: 1` avec `min-width: 0`. Un libellé ne déborde jamais d'un bouton : s'il ne tient pas en colonne, on raccourcit le mot, pas le bouton.
- Un raccourci clavier (site) se met devant l'icône, dans une touche `key` : 22 px min, contour 1,5 px currentColor, `radius-sm` 6 px.
- Désactivé : opacité 0,4, pas de néon. Chargement : le libellé laisse place à l'indicateur « voiture qui se gare » (asset `orasso-chargement`), 24 px.
