# Ground

Le fond d'un écran n'est jamais un aplat : c'est un parking éclairé, et il est franc.

- Cinq couches CSS empilées sur `ground` (jetons `ground-fx`, dans l'ordre : `halo`, `reflet`, `faisceau`, `marquage`, `vignette`), puis `grain`, un SVG feTurbulence plein écran (fréquence 0,9, deux octaves) en overlay à 28 % sur Béton et en multiply à 32 % sur Sable. Le contenu est en `position: relative` au-dessus du grain.
- **Béton** : halo moutarde en haut à droite (le lampadaire, 0,85 au centre), reflet crème en bas à gauche (les phares sur le sol mouillé), faisceau clair à 10°, marquage clair, vignette de #262932 au centre à #07080a sur les bords. Les bords de l'écran sont presque noirs.
- **Sable** : à la place du lampadaire, l'**ombre graphite** du thème nuit, presque opaque dans le coin (décision du 15/10 : « pas clair mais foncé, comme la couleur principale du thème nuit ») ; lumière du jour en bas à gauche ; faisceau et marquage sombres ; vignette de #e4ddcb à #3b3427. Conséquence directe : les deux tiers supérieurs du téléphone sont sombres, d'où la plaque graphite (composant Plate).
- Sur le site, mêmes couches, halo resserré (ellipse 46 % × 60 % à 94 % 0 %), marquage au pas de 200 px, grain en `position: fixed`.
- Le fond ne bouge pas à l'étape 6. À l'étape 7, le halo respire et le faisceau balaie lentement ; le grain reste immobile.
- Le consommateur fournit : le thème. Rien d'autre : un écran n'a pas le droit de modifier son fond.
