# ScanResult

Le résultat d'un scan à l'entrée : une couleur, un son, un chiffre lisible à trois mètres, et la caméra qui ne s'arrête jamais. Sans vert.

- S'affiche en bas de la caméra, sans l'interrompre, pendant `scan` (1 000 ms), puis reste visible en « dernier scan » jusqu'au suivant.
- **OK** : fond `accent` (moutarde : ta place, tu passes), `neon-scan`, un son bref, la zone en style `zone` (30 px) à droite.
- **Déjà entré** : fond `poster`, `shadow-card`, deux bips, l'heure du premier scan. Ni moutarde ni rouge : ce n'est pas une faute, c'est une information.
- **Refusé** : fond `win`, `neon-win`, un son grave, la raison en une ligne (QR inconnu, autre événement, banni).
- Couleur + forme (coche, chiffre, croix) + son : chaque résultat se distingue des autres même au soleil et même sans regarder.
- Le nom du véhicule et le pseudo sont en style `title` (droit, 15–16 px) : à l'entrée on lit, on ne crie pas. **Jamais tronqué** : le texte passe sur deux lignes, la zone à droite garde sa taille.
- Le résultat est l'objet principal de l'écran de scan : il porte la signature « ORASSO » (`credit`, `brand-credit-light`) en bas à droite. L'en-tête du scan a le monogramme à gauche et la pastille ✕ Quitter à droite, après le compteur.
- Le consommateur fournit : l'état, le véhicule, le pseudo, la zone, l'heure, la raison.
