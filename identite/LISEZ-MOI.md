# Orasso — kit d'identité v1

Logo retenu : « affiche de course », version D optimisée. Le premier O (avec la voiture vue du ciel) passe au-dessus, chaque lettre passe sur la suivante, séparées par un filet.

## Quel fichier pour quel usage

| Besoin | Fichier |
|---|---|
| Site, appli, documents (vectoriel) | `logo/orasso-logo-principal-fond-clair.svg` ou `-fond-sombre.svg` |
| Word, PowerPoint, réseaux, mail | les `.png` (fond transparent), en 2400 px ou 800 px |
| Imprimeur, signalétique, bâche | les `.pdf` (vectoriels) |
| Sur fond jaune Orasso | `logo/orasso-logo-sur-jaune.svg` |
| Une seule couleur (gravure, tampon encreur, vinyle) | `logo/orasso-logo-mono-noir.*` / `-mono-blanc.*` |
| Logo affiché à moins de 200 px de large (en-tête d'appli, signature mail) | `logo/orasso-logo-petit-*` : filets plus épais, voiture simplifiée |
| Icône, pastille, tampon, avatar | `monogramme/` |
| Site web | tout le dossier `favicon/` à la racine du site + coller `head-snippet.html` dans le `<head>` |
| Partage de lien (Facebook, WhatsApp, LinkedIn) | `reseaux/og-image.png` (1200 × 630) |
| Photo de profil Instagram / Facebook | `reseaux/avatar-reseaux.png` (1080 × 1080, se recadre en rond) |

## Couleurs (provisoires)

Couleurs de travail utilisées pour produire ces fichiers, pas encore validées comme palette officielle. Si elles changent, tous les fichiers peuvent être régénérés.

| Nom | Hex | Rôle |
|---|---|---|
| Asphalte | `#17191C` | fond, texte, boutons principaux |
| Marquage | `#F7F6F2` | surfaces claires |
| Béton | `#CFCBC2` | lignes, séparations |
| Jaune | `#FFC629` | la voiture, « toi, ta place, l'accueil » |

Statuts : En attente `#5E636B` · Retenue `#167B53` · Liste d'attente `#2F5FB8` · Refusée `#B5341F` · Sur place `#FFC629`.

## Règles

- Le jaune est réservé à la voiture dans le logo.
- Marge minimale autour du logo : la moitié de la hauteur du O.
- Taille minimum : 100 px / 25 mm de large pour le logo complet ; en dessous, utiliser le monogramme (16 px / 5 mm minimum).
- Ne pas déformer, ne pas changer l'ordre de chevauchement, ne pas ajouter d'ombre ou de contour.
- La couleur d'un organisateur ne s'applique qu'à sa fiche événement, jamais au logo Orasso.

## Typographie

- Logo : dessin sur mesure à partir d'Archivo Expanded Black Italic (licence libre SIL OFL), redessiné (O-place, lettres emboîtées).
- Interface : Archivo (titres et texte) et Overpass Mono (zones, places, codes) — gratuites sur Google Fonts.

## Note technique

Les SVG utilisent des masques pour les filets et les vitres de la voiture : ils s'ouvrent correctement dans les navigateurs, Figma, Illustrator, Inkscape et Affinity. Si un imprimeur demande des contours « aplatis », utiliser le PDF ou faire Objet > Aplatir la transparence dans Illustrator.

## Logo animé (dossier `anime/`)

La voiture arrive, freine et se gare dans le O, le O se referme autour d'elle, puis les lettres se dévoilent avec une coupe inclinée à 10°. Durée : 1,6 s pour le logo, 3,6 s avec la signature « Tout le monde à sa place. ».

| Besoin | Fichier |
|---|---|
| Site web, écran d'ouverture de l'appli (vectoriel, se joue une fois) | `orasso-logo-anime-fond-sombre.svg` / `-fond-clair.svg` |
| Vidéos d'événement, YouTube, écran géant | `orasso-logo-anime-1920x1080.mp4` |
| Stories et Reels Instagram, TikTok | `orasso-logo-anime-stories-1080x1920.mp4` |
| Mail, WhatsApp, présentation | `orasso-logo-anime.gif` |
| Incrustation sur une vidéo dans un logiciel de montage (fond transparent) | `orasso-logo-anime-transparent-prores.mov` (Premiere, DaVinci, Final Cut) ou `-transparent.webm` (web, CapCut) |
| Les mêmes en version claire (fond Marquage, lettres foncées) | `orasso-logo-anime-clair-*` : à utiliser sur fond blanc, présentation partenaires, images très lumineuses |
| Indicateur « chargement en cours » (appli, site, en boucle) | `orasso-chargement-fond-sombre.svg` / `-fond-clair.svg` ; GIF de secours ; code prêt à coller dans `orasso-chargement-integration.html` |

Le chargement : la voiture entre dans le O, s'y gare, puis repart, en boucle de 1,6 s. Taille conseillée : 48 à 120 px.

Les SVG animés respectent le réglage « réduire les animations » du téléphone : dans ce cas, le logo s'affiche directement, sans animation.

## Badge « Propulsé par Orasso » (dossier `badge/`)

À placer sur les affiches, visuels et pages des événements organisés avec Orasso. Les PNG sont en 4× (fond transparent pour les versions « transparent »).

| Version | Usage |
|---|---|
| `propulse-horizontal-sombre` / `-clair` | bas d'affiche, pied de page web, billet |
| `propulse-horizontal-transparent-blanc` / `-noir` | directement sur une photo ou un visuel coloré |
| `propulse-empile-*` | coins de visuels carrés, stories, petits formats |
| `inscriptions-qr-sombre` / `-clair` | affiche avec inscriptions ouvertes : le cadre « QR CODE » est à remplacer par le QR de l'événement, et l'adresse par celle de l'événement |

Règles : en bas, dans un coin, jamais au centre ; au moins 160 px ou 40 mm de large (badge horizontal) ; marge d'un quart de la hauteur du badge ; ne pas recolorer, déformer ni retirer « Propulsé par ».
