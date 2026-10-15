# VehicleCard

La carte d'un véhicule : une photo pleine, un nom en italique d'affiche, ses catégories.

- C'est une **Plate** : fond `plate`, texte `plate-ink`, liseré `plate-edge`, `radius-lg`, `shadow-card`. En Béton c'est la carte graphite ordinaire ; en Sable aussi (les cartes sable claires du garage ont été abandonnées le 15/10 : elles choquaient sur le fond sombre).
- Photo pleine en haut (156 px pour la première, 120 px pour les suivantes), fondue vers `photo-fade` (graphite) sur les 45 % du bas. Tag « Certifié » en `poster` sur `poster-ink` en haut à gauche, « 6 photos » en haut à droite sur `scrim`.
- Nom en `poster-m`, année et puissance en `meta` à droite sur la même ligne, chips de catégories en contour `plate-chip` (la catégorie recherchée par l'événement en `accent`), ligne de faits en `body` 13 px `plate-muted`.
- Dans le garage, le crédit « ORASSO » n'est **pas** sur les véhicules mais sur la carte profil au-dessus (une signature par écran, composant Brand). Sur une fiche partagée hors d'Orasso, la carte porte le logotype complet.
- Vignette (dans Autour de moi, Explorer) : 150 px, photo de 84 px coupée à `--cut`, titre `poster-s`, faits `meta`.
- Le consommateur fournit : photo(s), nom, année, puissance, catégories, catégorie mise en avant, faits, certification.
