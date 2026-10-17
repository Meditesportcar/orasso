# Orasso

Affiche de nuit. Le système de design d'Orasso, la plateforme des rassemblements et événements automobiles. Direction artistique fixée le 15 octobre 2026 avec Damien Caron : **« Affiche de nuit »**, le croisement de la piste Affiche (la voix du logo) et de la piste Nuit de parking (l'ambiance). Thème par défaut **Béton mouillé**, thème clair **Sable**.

Signature : *Tout le monde à sa place.*

**Version 1, gelée le 15 octobre 2026 par Damien Caron.** Ce document, `tokens.json` et les quinze composants sont la référence du code (site et appli). À partir de cette date, tout changement de règle est daté, justifié et noté dans « Ce qui a changé » en fin de document ; rien ne se change au fil du code sans passer par ici.

Version 3 (15/10, fin d'étape 7) : le mouvement est consigné. Version 2 (fin d'étape 6) : ce document a été réécrit par rétro-ingénierie des écrans finaux validés. Chaque valeur ci-dessous a été relevée sur les maquettes, et les maquettes font foi.

## L'idée en une image

Une affiche de rassemblement, collée sur le mur d'un parking un samedi soir. Le mur est en béton mouillé, presque noir sur les bords, éclairé par un lampadaire moutarde en haut à droite et par les phares qui se reflètent au sol en bas à gauche. Les barres de l'interface sont en métal brossé, noir la nuit, sable le jour. Les cartes sont des plaques de graphite sombre qui se détachent par leur ombre. L'affiche elle-même, crème, est la seule chose claire à l'écran, et c'est toujours ce qui est à toi : ton prochain accès, ton QR, le résultat de ton scan. Les titres crient en capitales italiques larges, comme sur le logo. Une seule lumière, la moutarde, éclaire ce que tu dois faire. Le rouge n'apparaît que pour ce qui se gagne ou ce qui alerte.

## Les cinq choses qui font Orasso

Sans elles, on retombe dans une appli sombre générique. Elles sont obligatoires sur chaque écran.

1. **L'italique large du logo.** Tous les titres d'affiche (`poster-xl` à `poster-s`) sont en Archivo, `font-stretch: 125%`, graisse 900, italique, capitales. L'en-tête, la barre d'onglets et les boutons sont dans la même famille, même largeur, mais **droits** : l'italique est réservé à ce qui est un titre.
2. **L'inclinaison.** Étiquettes, badges, chips moutarde : `skewX(var(--skew))` (−8°), l'onglet Accès à `--skew-tab` (−6°), le texte redressé à l'intérieur. Les photos sont coupées en diagonale à `--cut` (10°, l'angle de l'animation du logo), la coupe monte vers la droite. Les bandeaux en coin tournent à `--band` (14°).
3. **Le fond vivant et les barres brossées.** Jamais un aplat : le fond est une vignette éclairée (`ground-fx`), grainée comme de l'asphalte ; les barres sont en métal brossé (`bar-fx`) bordé d'un filet moutarde. C'est ce qui donne de la vie sans animation.
4. **Le papier crème pour ce qui est à toi.** Une seule carte `poster` par écran. Elle porte l'ombre `shadow-poster`, plus profonde que les autres. En thème Sable, elle s'inverse (noir, titre moutarde) et reste la seule carte « différente ».
5. **La moutarde éclaire, le rouge se gagne.** `accent` = ce qui est à toi et ce qu'on te demande de faire : bouton principal (un seul par écran, en `neon-accent`), onglet Accès, place retenue, zone attribuée, le filet des barres. `win` = grade, points, certification, alerte staff, événement annulé. Jamais les deux sur le même élément. Jamais le rouge pour « refusée » : refuser n'est pas une alerte, c'est du gris barré. **Pas de vert dans Orasso.**

## Couleurs

Deux thèmes dans `tokens.json`, le premier est le défaut.

- **Béton mouillé** (`beton`) : fond vignette de `ground-center` #262932 à `ground-deep` #07080a, barres `bar` #08090b (noir de nuit brossé), cartes `surface` #2b2e36 (assombries le 15/10 : le gris moyen d'origine se fondait dans le fond), `ink` #f3ebdd. C'est le thème du passionné, du site public, du mode jour J et du scan de nuit.
- **Sable** (`sable`) : fond vignette de `ground-center` #e4ddcb à `ground-deep` #3b3427, avec le coin haut-droit qui descend jusqu'au graphite de nuit (décision du 15/10 : « pas clair mais foncé, comme la couleur principale du thème nuit »), barres `bar` #8a8472 (sable brossé), `ink` #131417. C'est le thème du plein soleil : le mode staff et le tri sur téléphone l'imposent le jour (bascule automatique selon le lever et le coucher du soleil, forçable dans les paramètres), l'espace organisateur sur le site et l'administration l'utilisent par défaut.
- `night` #131417 n'est jamais un fond d'écran : il sert au bouton sur affiche, à la carte affiche inversée et à l'onglet Accès en Sable, au fond de la caméra.
- Les couleurs de **statut** se distinguent par leur clarté, pas seulement par leur teinte : en attente (contour `status-pending`), retenue (fond `status-retained`, texte `accent-ink`), liste d'attente (`status-waitlist`, le seul bleu), refusée (`status-refused`, texte barré), sur place (`status-onsite`, inversé comme `poster`), annulé (`status-cancelled`), incertain (`status-uncertain`, hachuré).
- Le résultat de scan OK est moutarde (`accent`, `neon-scan`) : ta place, tu passes. Déjà entré est crème (`poster`), refusé est rouge (`win`).
- Les textes sur `accent` sont toujours `accent-ink` (noir) : jamais de blanc sur moutarde. `accent-text` est assombri en Sable (#8a6200) sur sable, mais reste `accent` tel quel sur une plaque graphite.

## Thème Sable : la plaque graphite

C'est la règle la plus importante apprise à l'étape 6. Sur le téléphone en Sable, les deux tiers supérieurs de l'écran sont dans l'ombre graphite du fond ; une carte sable claire posée là « choque », et un texte posé en transparence ne se lit pas. La solution n'est ni un contour ni un néon sur le texte (essayés, rejetés : « pas de néon ») mais une **plaque graphite** (`plate`, rgba(43,46,54,.92), liseré `plate-edge`) avec du texte poster (`plate-ink`, `plate-muted`). Autrement dit, en Sable, les cartes sont celles du Béton posées sur un mur clair : c'est littéralement l'affiche de nuit collée en plein jour.

- **Sur le téléphone en Sable, toutes les cartes sont des plaques** : profil, véhicules, compteurs, carte candidat, agenda, Autour de moi, En attente, consignes, notes de clavier. Les chips dessus sont en contour `plate-chip`, la chip moutarde en `accent`, la liste d'attente en #7fa6ff.
- **Les boutons secondaires aussi** (Refuser, Attente, Annuler) : plaque graphite, texte poster, contour poster à 50 % (pointillé pour Refuser). Retenir reste moutarde, Alerte reste rouge.
- **Le sable (`surface`) reste pour les zones claires** : les grandes cartes de contenu du site organisateur (le centre de la page est clair), les gros boutons de secours du staff (Plaque, Express, Sans scan) qui sont en bas de l'écran, et les barres.
- **La carte affiche en Sable** est `night` avec le titre `accent`, comme avant : plaque et affiche se ressemblent, mais l'affiche a son ombre plus profonde, son bandeau et son bouton.
- Rien ne se pose en transparence sur la zone sombre. Un libellé isolé (« Véhicules actifs · 2 ») monte lui aussi sur une petite plaque `radius-sm`.

## Fonds vivants

Un fond n'est jamais un aplat, et le dosage est franc (validé le 15/10 après quatre passes « mets la dose »). Cinq couches CSS sur `ground` (jetons `ground-fx`, la première listée est au-dessus), puis le grain :

1. **Le halo** en haut à droite : le lampadaire moutarde en Béton (0,85 au centre) ; en Sable, à la même place, l'ombre graphite presque opaque.
2. **Le reflet** en bas à gauche : les phares sur le sol mouillé (Béton), la lumière du jour (Sable).
3. **Le faisceau** : une bande à 10° qui traverse l'écran, claire en Béton, sombre en Sable.
4. **Le marquage** : les lignes de marquage au sol à 10°, 8 px au pas de 112 px sur téléphone, 10 px au pas de 200 px sur le site.
5. **La vignette** : la couche de base, de `ground-center` au centre à `ground-deep` sur les bords. Les bords du téléphone sont presque noirs en Béton, brun sombre en Sable.
6. **Le grain** : un bruit SVG (feTurbulence 0,9, deux octaves), overlay à 28 % sur Béton, multiply à 32 % sur Sable. Plein écran, sous le contenu, immobile.

Le contenu est en `position: relative` au-dessus du grain. Les cartes et plaques restent opaques (la plaque Sable à 92 %) : le fond vit autour d'elles, pas à travers.

## Barres : en-tête, onglets, site

Les barres ne sont plus translucides (version 1) : elles sont en **métal brossé** (jetons `bar-fx`), opaques, et bordées d'un filet moutarde.

- **En-tête d'écran** : 64 px avec la zone de sécurité (`bar-top`), `bar-gradient`, texture `bar-brush` en z-index −1 (le conteneur est en `isolation: isolate`), filet `bar-edge` en bas (1 px à 45 % en Béton, 2 px plein en Sable), `shadow-bar-top`. Il déborde de la marge de 16 px sur toute la largeur de l'écran. Composition fixe, de gauche à droite : **la marque, le titre, puis à droite Recherche, Cloche et l'Avatar** sur tout écran à onglets (l'avatar ouvre « Moi » : profil, casquettes, paramètres ; il porte le logo de la structure active quand on est organisateur ; appui long = retour au passionné), ou l'action de contexte puis **✕ Fermer** sur un écran de flux (voir « La marque » et le composant AppBar).
- **Barre d'onglets** : 80 px (`bar-tabs`), même métal, filet `bar-edge` de 2 px en haut, coins bas en `radius-xl`, `shadow-bar-bottom`. Cinq onglets avec icône de 22 px et libellé `tab` ; l'onglet Accès au centre est une pastille inclinée à `--skew-tab`, moutarde en Béton, `night` à texte moutarde en Sable, en `neon-accent`.
- **Site** : en-tête et pied de page en `bar-gradient` Béton avec filet 2 px ; menu latéral de l'espace organisateur (230 px) en `bar-gradient` Sable, filet 2 px à droite, lien actif en `night` à texte moutarde.
- Textes et icônes sur une barre : `bar-ink`, secondaires en `bar-muted`. En Sable seulement, ils portent `emboss-bar` (un relief d'1 px, gravé dans le sable brossé). C'est le seul text-shadow autorisé dans Orasso.
- Les pastilles d'action de l'en-tête (recherche, cloche, fermer) font 34 px en `radius-chip` : contour `line` 1,5 px en Béton ; contour `ink` 2 px sur fond crème à 22 % en Sable.

## Ombres et néon

Les ombres sont profondes et le néon est assumé, mais chacun a une place et une seule, et **jamais sur un texte** (décision du 15/10 : les contours et halos de texte essayés pour la lisibilité ont tous été retirés ; la lisibilité vient d'une plaque, pas d'un effet).

- `shadow-card` sous toute carte et plaque, `shadow-poster` sous la carte affiche, `shadow-sheet` sous les feuilles qui montent du bas, `shadow-bar-top` et `shadow-bar-bottom` sous et sur les barres.
- `neon-accent` : le bouton principal, l'onglet Accès, la pastille de notification. Un seul élément en néon moutarde par écran.
- `neon-accent-soft` : chips et contours moutarde, bandeau Retenue.
- `neon-win` : le bandeau rouge, la carte de grade, le badge Sport, le bouton alerte.
- `neon-scan` : le résultat de scan OK, moutarde plus forte que le bouton principal.
- En thème Sable, chaque néon devient une ombre portée : le soleil éteint les lampadaires.

## Mouvement : tout se gare

Validé le 15/10 (étape 7). Un seul geste pour toute l'interface, celui du logo : la voiture arrive vite, dépasse de 6 px, puis se range. Jetons `easing` et `timing`, composant Motion.

1. **Ce qui arrive se gare.** Toute apparition suit `park` (cubic-bezier(.12,.75,.25,1)) jusqu'à 6 px au-delà de sa place, puis `inout` jusqu'à sa place, en `base` (220 ms) : feuilles, badges, bandeaux, résultats de scan, pastilles, toasts, lignes de liste (en cascade, `stagger` 40 ms, quatre lignes max). Ce qui part s'efface simplement : opacité, `fast` (120 ms).
2. **Le fond respire, le contenu non.** Le halo bat en `breath` (6 s, échelle 1 → 1,07), les phares passent en `phares` (9 s), le faisceau balaie en `sweep` (14 s, linéaire). Le grain, le marquage, les cartes et les textes ne bougent jamais. Rien ne tourne en boucle dans une carte.
3. **Un seul néon pulse à la fois, pour un événement.** Résultat de scan, place retenue, nouveau grade : montée en `fast`, retour en `poster` (420 ms). Jamais de pulsation continue sur un bouton. L'appui sur un bouton le réduit à 0,97 et baisse son néon pendant `fast`.
4. **L'affiche se dévoile par la coupe.** Ce qui est « affiche » (carte poster, nouveau grade, mode jour J) apparaît par un balayage `clip-path` à 10°, l'angle du logo, en `poster` avec `out`. C'est la seule transition spectaculaire ; le passage de grade se joue dans la carte, pas en plein écran.
5. **Le terrain ne joue pas.** Mode staff et mode jour J : le fond ne respire pas, pas de cascade. Restent le retour de scan (flash `fast` à la détection, résultat qui se gare, néon en pic puis `scan` 1 s plein puis atténué à 88 %), le flash de compteur (`fast`, le chiffre glisse de 10 px, rien ne défile) et le refus secoué trois fois (±7 px en 320 ms). Trois sons, un par couleur : bip (OK), double bip (déjà entré), grave (refusé). La caméra ne s'arrête jamais.
6. **Les chargements sont la voiture qui se gare.** L'indicateur du kit, `loader` 1,6 s par cycle, en 72 px plein écran et 24 px dans un bouton ou en tirant une liste ; jamais de roue qui tourne. Les squelettes sont des plaques où la lumière balaie le métal brossé (1,6 s). Hors ligne : un bandeau `night` se gare du haut, un point moutarde bat.
7. **Écran d'ouverture : le logo animé du kit, seul.** 1,6 s, une fois par lancement, sur le fond immobile, sans faisceau ni signature (décision du 15/10).
8. **Réduction des animations respectée.** Avec `prefers-reduced-motion`, tout devient un fondu `fast` ; le logo d'ouverture s'affiche garé ; les résultats de scan gardent couleur, forme et son.

Micro-interactions de référence (planche « Douze micro-interactions » du canevas) : appui (fast), onglet (base, l'icône se remplit et le nouvel onglet se gare), compteur (fast), chip (fast, le fond encre glisse de gauche à droite), pastille de notification (pop 220 ms à 1,25 puis une onde toutes les 3 s), badge de statut (retourné comme une plaque, base), affiche (poster, coupe), feuille (base, voile à 80 %), cascade (base + stagger), champ en saisie (fast, contour moutarde et halo doux), interrupteur (base, 4 px de dépassement), bouton qui travaille (loader, le néon s'éteint pendant l'attente).

## Typographie

Une seule famille, celle du logo : **Archivo** (Google Fonts, licence OFL), dans trois largeurs.

- Archivo Expanded (`font-stretch: 125%`) pour les titres d'affiche (italique) et pour l'en-tête, les onglets et les boutons (droit).
- Archivo Narrow pour les étiquettes, les lignes de faits et la signature (`label`, `meta`, `zone`, `credit`), en capitales espacées.
- Archivo pour le texte courant (`body`, `caption`) et les grands chiffres (`number`, chiffres tabulaires).

Chargement : `https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,100,400;0,100,600;0,100,800;0,125,900;1,125,900&family=Archivo+Narrow:wght@500;700&display=swap`. Dans l'appli Expo, les mêmes fichiers sont embarqués.

Le système compile `fontSize`, `lineHeight`, `fontWeight`, `fontStyle` et `letterSpacing` ; **`font-stretch: 125%` et `text-transform: uppercase` sont à ajouter par le consommateur** sur les styles `poster-*`, `title`, `button`, `tab`, et `uppercase` seul sur `label`, `meta`, `zone`, `credit`.

## Espacements et rayons

Grille de 4 px. Marge latérale des écrans téléphone `space-4` (16 px), cartes et plaques en `radius-lg` (18 px), boutons, champs et compteurs en `radius-md` (12 px), statuts et chips en `radius-pill`, pastilles d'en-tête en `radius-chip` (11 px). Toute cible tactile fait au moins `touch` (48 px) ; dans le mode staff, 56 px, et les trois issues de secours du scan (plaque, express, sans scan) 72 px.

## Photos

Les photos de véhicules sont le contenu le plus précieux. Elles sont pleines, jamais tramées dans l'interface (la trame est réservée aux visuels partagés sur Instagram). Dans une carte, la photo se fond vers `photo-fade` en bas (graphite dans les deux thèmes, puisque les cartes véhicule sont des plaques) ; en vignette, elle est coupée à `--cut`. Sur un héros d'écran (Événement, Pro), un voile `linear-gradient` du haut (noir 25 %) vers `ground` en bas. Jamais de filtre de couleur sur une photo.

## Iconographie

Icônes en trait de 2 px, coins arrondis, 24 px, en `currentColor`, jamais remplies sauf l'état actif de la barre d'onglets. Le jeu de 32 pictogrammes est dans le composant Icons. **Tout bouton porte une icône** à gauche de son libellé ; chaque onglet porte la sienne (accueil, explorer, qr, véhicule, boîte ; côté organisateur : direct, événements, tri, boîte, staff) ; les titres de carte peuvent en porter une petite, les titres d'affiche jamais. Le logo n'est jamais déformé ni recoloré ; sur fond sombre la version fond sombre, sur Sable la version fond clair ; en dessous de 100 px de large, le monogramme. Les fichiers sont dans les assets, le kit complet dans `C:\Users\DELL\Orasso\identite`.

## La marque : trois ancres, jamais ailleurs

Harmonisé le 15/10 après un premier passage où la marque se retrouvait à cinq endroits différents selon l'écran (« absolument pas harmonieux »). Désormais trois emplacements fixes, et rien d'autre.

1. **L'en-tête : la marque est toujours le premier élément à gauche, et c'est toujours le même O.** Sur l'Accueil, le logotype complet (`brand-logo`, 128 px, version du thème) ancré à 18 px du bord gauche, sans titre. Sur tous les autres écrans, le monogramme (`brand-mark`, 30 px ; O crème sur les barres Béton, **O noir** sur les barres Sable), dont le O a exactement la taille du O du logotype (monogramme = 0,234 × largeur du logotype) et le même bord gauche (margin-left −1,5 px pour compenser la marge du viewBox) : en passant d'un écran à l'autre, le O ne bouge pas, ce sont les lettres qui apparaissent et disparaissent. Sur les écrans à photo sans barre (Événement, Pro), la même ancre en pastille flottante de 40 px (à 12 px du bord, 18 px du haut), monogramme de 30 px dedans : le O est au même endroit qu'avec une barre. Conséquence : **la navigation « Fermer / Quitter » est toujours à droite**, dernier élément, en pastille ✕ de 34 px (composant Button, variante « fermer ») sur tous les écrans de flux : Scan, Jour J, Candidature, Événement, Pro. Il n'y a plus de flèche retour ni de « Quitter » à gauche. Côté organisateur, le badge de la structure (MSC) passe à droite du titre ; la marque reste à gauche.
2. **La signature « ORASSO » : une seule par écran, en bas à droite de l'objet principal.** Style `credit` (9 px, Archivo Narrow, espacée), à 12 px du bord droit et 8 px du bas, `brand-credit` sur surface sombre, `brand-credit-light` sur surface claire. L'objet principal : l'affiche (Accueil, Jour J), la photo héros (Événement), le véhicule sélectionné (Candidature), la carte candidat (Tri), le résultat de scan (Scan), la carte profil (Garage), la carte des remises (Pro). Jamais deux par écran, jamais sur une carte secondaire.
3. **Le site : le logotype complet en haut à gauche** (120 px dans l'en-tête public, 110 px en tête du menu latéral organisateur, la structure de l'organisateur juste dessous) et **« Propulsé par Orasso » dans le pied de page public uniquement**. Pas de « propulsé par » dans le back-office : le logo est déjà en haut.

Et ailleurs : le monogramme reste l'icône de l'appli (centre de chaque QR, encart « Télécharge l'appli », chargement, favicon). Écran d'ouverture : le logo animé (la voiture se gare dans le O), 1,6 s, une fois par lancement. Ce qui sort d'Orasso (fiches partagées, e-mails, PDF, badges) porte le logotype complet.

Interdit : **le monogramme comme avatar de quelqu'un d'autre** (un pro, une structure, un compte sans photo : chacun a son portrait ou une initiale), un logo par carte, le logo dans la barre d'onglets, le logo en filigrane sur les photos, deux signatures sur un écran, la marque centrée dans l'en-tête.

## Par casquette

- **Passionné, site public** : Béton mouillé, tous les effets, la carte affiche sur l'accueil, l'événement, le garage (carte profil avec le QR de compte réduit), le mode jour J.
- **Staff, tri sur téléphone** : Sable le jour, Béton la nuit, bascule automatique. Toutes les cartes en plaques graphite ; cibles de 56 px ; pas de néon sauf `neon-scan` et `neon-win` (alerte). Le scan et le mode jour J quittent par la pastille ✕ à droite de l'en-tête.
- **Organisateur sur le site, administration** : Sable par défaut, Béton au choix. Menu latéral en sable brossé avec le logo en tête ; bandeau de titre, boutons secondaires et notes de clavier en plaques graphite ; grandes cartes de contenu en sable ; clavier, densité ; les titres d'affiche ne servent qu'au nom de l'événement et de la structure.
- **Pro** : comme le passionné, mais le scanner de QR suit les règles du staff.

## Composants

Chaque composant a sa page avec son aperçu et ses règles. Les aperçus sont statiques (HTML et CSS sur les jetons) : ils montrent la forme attendue, le code de l'appli (React Native) et du site (React) les reproduit à partir des jetons. Nouveaux en version 2 : **Ground** (les fonds vivants des deux thèmes), **AppBar** (en-tête et onglets brossés, dans les deux thèmes), **Plate** (la plaque graphite du Sable), **Brand** (les trois ancres de la marque). Version 3 : **Motion** (le mouvement).

## Ce qui reste à faire

Le prototype cliquable (étape 8), puis le code : l'appli Expo et le site reproduisent ces jetons et composants. À confirmer avec Damien : la régénération des fichiers du logo avec la moutarde #e9b824 (les couleurs du kit étaient provisoires).

## Ce qui a changé depuis le gel

- 15/10/2026 : version 1 gelée. Aucun changement.
- 16/10/2026 (lot 28) : dix pictogrammes météo ajoutés au jeu Icons (`weatherClear`, `weatherPartlyCloudy`, `weatherCloudy`, `weatherFog`, `weatherDrizzle`, `weatherRain`, `weatherHeavyRain`, `weatherSnow`, `weatherThunderstorm`, `weatherWind`) : grille de 24 px, trait de 2 px, bouts arrondis, `currentColor`, aucune couleur propre. Raison : « météo à l'approche », jour J et widget de l'Accueil demandent une icône par condition et le README prévoit que le jeu se complète au développement. Aucune autre règle touchée.
- 17/10/2026 (lot 32) : pictogramme `flag` (drapeau) ajouté au jeu Icons pour le bouton « Signaler » (docs/01 : « bouton Signaler partout ») : grille de 24 px, trait de 2 px, bouts arrondis, `currentColor`, aucune couleur propre. Raison : tout bouton porte une icône et aucune des 32 ne dit « signaler » (`alert` est réservée au rouge du staff et des annulations). Aucune autre règle touchée.
