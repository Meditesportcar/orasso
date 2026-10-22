"""Instances statiques d'Archivo pour React Native (lot 04 ; largeurs de l'artefact DA v2 au lot C1).

Sur Android l'axe de largeur (wdth) d'une police variable n'est pas pris en charge : l'appli embarque donc
une instance statique par combinaison utilisée (largeur, graisse, style), générée ici depuis les polices
variables du site (src/web/fonts, sous-ensemble latin). Sorties versionnées dans src/native/fonts/.

Lot C1 (D33, D34) : l'artefact DA v2 emploie dix largeurs (62 à 125 %). On génère celles des composants du socle :
chiffres 62 %, logo d'organisateur 70 %, étiquettes 75 %, étiquettes inclinées 80 %, itinéraires 110 % (850), bouton QR de l'accès flottant 115 % (900),
onglets 115 %, boutons 118 %, titres 125 %. Le choix de l'instance se fait dans src/native/fontFamily.ts.

Usage (une fois, ou si les polices du site changent) :
    python -m pip install fonttools brotli
    python scripts/generate-native-fonts.py
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "web" / "fonts"
OUT = ROOT / "src" / "native" / "fonts"

INSTANCES = [
    # (fichier source, wdth, wght, nom du fichier de sortie)
    # Socle d'origine (lot 04) : 125 % (titres), 100 % (texte), 78,4 % (étiquettes v1, gardée pour le tampon du
    # passeport et le générateur d'affiche de l'API, qui lisent ce fichier).
    ("archivo-latin.woff2", 125, 900, "Archivo-Expanded-Black.ttf"),
    ("archivo-italic-latin.woff2", 125, 900, "Archivo-Expanded-BlackItalic.ttf"),
    ("archivo-latin.woff2", 78.4, 700, "Archivo-Narrow-Bold.ttf"),
    ("archivo-latin.woff2", 100, 400, "Archivo-Regular.ttf"),
    ("archivo-latin.woff2", 100, 600, "Archivo-SemiBold.ttf"),
    ("archivo-latin.woff2", 100, 800, "Archivo-ExtraBold.ttf"),
    # Lot C1 : largeurs de l'artefact DA v2.
    ("archivo-latin.woff2", 118, 900, "Archivo-118-Black.ttf"),
    ("archivo-latin.woff2", 115, 800, "Archivo-115-ExtraBold.ttf"),
    ("archivo-latin.woff2", 115, 900, "Archivo-115-Black.ttf"),
    ("archivo-latin.woff2", 110, 900, "Archivo-110-Black.ttf"),
    ("archivo-latin.woff2", 110, 850, "Archivo-110-Heavy.ttf"),
    ("archivo-latin.woff2", 80, 800, "Archivo-80-ExtraBold.ttf"),
    ("archivo-latin.woff2", 75, 700, "Archivo-75-Bold.ttf"),
    ("archivo-latin.woff2", 75, 800, "Archivo-75-ExtraBold.ttf"),
    ("archivo-latin.woff2", 75, 900, "Archivo-75-Black.ttf"),
    ("archivo-latin.woff2", 70, 900, "Archivo-70-Black.ttf"),
    ("archivo-latin.woff2", 62, 800, "Archivo-62-ExtraBold.ttf"),
    ("archivo-latin.woff2", 62, 900, "Archivo-62-Black.ttf"),
]

OUT.mkdir(parents=True, exist_ok=True)
for source, wdth, wght, name in INSTANCES:
    font = TTFont(SRC / source)
    font = instancer.instantiateVariableFont(font, {"wdth": wdth, "wght": wght}, inplace=False)
    font.flavor = None
    family = name.removesuffix(".ttf")
    for record in font["name"].names:
        if record.nameID in (1, 4, 6, 16):
            record.string = family
    font.save(OUT / name)
    has_ellipsis = 0x2026 in font.getBestCmap()
    print(name, (OUT / name).stat().st_size, "U+2026" if has_ellipsis else "sans U+2026")
