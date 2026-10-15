"""Instances statiques d'Archivo pour React Native (lot 04).

Sur Android l'axe de largeur (wdth) d'une police variable n'est pas pris en charge : l'appli embarque donc
une instance statique par combinaison utilisée (largeur, graisse, style), générée ici depuis les polices
variables du site (src/web/fonts, sous-ensemble latin). Sorties versionnées dans src/native/fonts/.

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

# Largeurs : 125 % (titres, en-tête, onglets, boutons), 100 % (texte, chiffres), 78,4 % (étiquettes :
# même largeur de texte qu'Archivo Narrow, voir docs/JOURNAL-DES-CHOIX.md).
INSTANCES = [
    # (fichier source, wdth, wght, nom du fichier de sortie)
    ("archivo-latin.woff2", 125, 900, "Archivo-Expanded-Black.ttf"),
    ("archivo-italic-latin.woff2", 125, 900, "Archivo-Expanded-BlackItalic.ttf"),
    ("archivo-latin.woff2", 78.4, 700, "Archivo-Narrow-Bold.ttf"),
    ("archivo-latin.woff2", 100, 400, "Archivo-Regular.ttf"),
    ("archivo-latin.woff2", 100, 600, "Archivo-SemiBold.ttf"),
    ("archivo-latin.woff2", 100, 800, "Archivo-ExtraBold.ttf"),
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
    print(name, (OUT / name).stat().st_size)
