# TabBar

Cinq onglets sur du métal brossé, avec l'Accès au milieu comme une pastille d'affiche.

- 80 px (`bar-tabs`), fond `bar-gradient` et texture `bar-brush` (voir AppBar), filet `bar-edge` de 2 px en haut, coins bas `radius-xl`, `shadow-bar-bottom`. Version 1 (fond `ground-deep` translucide) abandonnée le 15/10.
- Chaque onglet porte une icône de 22 px du jeu Icons au-dessus de son libellé `tab` : passionné = accueil, explorer, qr, véhicule, boîte ; organisateur = direct, événements, tri, boîte, staff ; pro = accueil, explorer, qr, boutique, boîte.
- Au repos `bar-muted`, actif `bar-ink` avec l'icône remplie. En Sable, `emboss-bar` sur les libellés (le seul text-shadow).
- L'onglet du milieu est une pastille inclinée à `--skew-tab` (−6°) qui déborde de 16 px vers le haut : `accent` sur `accent-ink` en Béton, `night` à texte `accent` en Sable, `neon-accent` dans les deux. C'est l'Accès (QR) pour le passionné et le pro, le Tri pour l'organisateur.
- Pastille de notification : 8 px `accent` en `neon-accent-soft` sur l'icône de la Boîte.
- Le consommateur fournit : la casquette, l'onglet actif, les pastilles. Le mode staff et le mode jour J n'ont pas de barre d'onglets : on en sort par la pastille ✕ de l'en-tête.
