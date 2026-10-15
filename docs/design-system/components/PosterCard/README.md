# PosterCard

La carte affiche est la seule carte claire de l'écran : elle porte ce qui est à toi.

- Une seule par écran, toujours la plus importante : prochain accès (Accueil), QR d'inscription (mode jour J), QR de compte (Garage, en grand), résultat de scan (mode staff), carte de l'événement côté organisateur (Direct).
- Fond `poster`, texte `poster-ink`, `radius-lg`, ombre `shadow-poster`. En thème Sable elle s'inverse par les jetons, sans changer de forme ; le titre passe en `accent`.
- Structure fixe, de haut en bas : étiquette (`label`), titre (`poster-xl`, deux lignes max), ligne de faits (`meta`), photo coupée à `--cut`, bouton « sur affiche » qui chevauche la photo de 14 px.
- Bandeau en coin tourné à `--band` : moutarde pour Retenue et Sur place, rouge `win` pour Annulé, hachuré moutarde pour Incertain, aucun bandeau pour En attente.
- Signature « ORASSO » en style `credit` en bas à droite, `brand-credit-light` sur le crème, `brand-credit` sur la version inversée. C'est la signature de l'écran (composant Brand) : rien d'autre sur l'écran ne la porte.
- Le consommateur fournit : étiquette, titre, faits, image, libellé et action du bouton, statut.
- Ne jamais empiler deux PosterCard, ne jamais la mettre dans une liste défilante horizontale.
