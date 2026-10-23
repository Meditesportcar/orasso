// Fichier généré par scripts/generate-tokens.mjs d'après docs/design-system/tokens.json + tokens.v2.json. Ne pas modifier à la main.
// Jetons du système de design Orasso (v3, gelé le 15/10/2026, surcouche DA v2 du 2026-10-19), communs au site et à l'appli.

export const THEME_IDS = ["beton","sable"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const tokens = {
  "themes": [
    "beton",
    "sable"
  ],
  "color": {
    "beton": {
      "ground": "#17191e",
      "groundCenter": "#101216",
      "groundDeep": "#050608",
      "bar": "#08090b",
      "barInk": "#f3ebdd",
      "barMuted": "#8f897d",
      "barEdge": "rgba(233,184,36,0.55)",
      "surface": "#262930",
      "surfaceRaised": "#30333b",
      "surfaceSunken": "#23262d",
      "plate": "#262930",
      "plateInk": "#f3ebdd",
      "plateMuted": "#aaa397",
      "plateLine": "rgba(243,235,221,0.14)",
      "plateEdge": "transparent",
      "plateChip": "rgba(243,235,221,0.4)",
      "line": "#565b66",
      "ink": "#f3ebdd",
      "inkMuted": "#aaa397",
      "inkFaint": "#7a7468",
      "poster": "#f3ebdd",
      "posterInk": "#131417",
      "posterMuted": "#5b554b",
      "night": "#131417",
      "nightInk": "#f3ebdd",
      "accent": "#e9b824",
      "accentInk": "#131417",
      "accentText": "#e9b824",
      "win": "#c8322b",
      "winInk": "#f3ebdd",
      "winText": "#ff6a5f",
      "statusPending": "#afa89c",
      "statusRetained": "#e9b824",
      "statusWaitlist": "#7fa6ff",
      "statusRefused": "#7f7a70",
      "statusOnsite": "#f3ebdd",
      "statusCancelled": "#c8322b",
      "statusUncertain": "#e9b824",
      "scrim": "rgba(0,0,0,0.6)",
      "photoFade": "#2b2e36",
      "brandCredit": "rgba(233,184,36,0.7)",
      "brandCreditLight": "#8a6200",
      "surfaceField": "#1e2025",
      "plateField": "#363941",
      "mapLand": "#1f2227",
      "mapLand2": "#262a30",
      "deptLand": "#3b3f48",
      "mapSea": "#0f1216",
      "mapRoad": "#f3ebdd",
      "mapLabel": "#c9c1b2",
      "barControlEdge": "rgba(243,235,221,0.18)",
      "barShellEdge": "rgba(243,235,221,0.06)",
      "barChip": "rgba(243,235,221,0.1)",
      "photoInk": "#f3ebdd",
      "sceneSkyTop": "#070a12",
      "sceneSkyBottom": "#1a2233",
      "sceneGround": "#121317",
      "sceneCar": "#d4552a",
      "sceneWindow": "#0e1116",
      "sceneWheel": "#0b0c0e",
      "sceneRim": "#9a9a9a",
      "avatar1": "#7a2412",
      "avatar2": "#2f5fb8",
      "avatar3": "#565b66",
      "avatar4": "#6b3fa0",
      "avatar5": "#b8441d",
      "avatar6": "#8a6200",
      "avatar7": "#131417",
      "avatar8": "#a3261f",
      "avatar9": "#3d4f7a",
      "avatarInk": "#f3ebdd",
      "cardLine": "rgba(243,235,221,0.08)",
      "vitrineFrom": "#d4552a",
      "vitrineTo": "#8f1d22",
      "stampInk66": "#ff6a5f",
      "stampInk34": "#b48ce6",
      "stampInk31": "#f3ebdd",
      "stampInk11": "#7fa6ff",
      "stampInkDefault": "#c8322b",
      "statusWaitlistOnPlate": "#7fa6ff"
    },
    "sable": {
      "ground": "#e8dfca",
      "groundCenter": "#ddd2b8",
      "groundDeep": "#c9bc9b",
      "bar": "#131417",
      "barInk": "#f3ebdd",
      "barMuted": "#a39b8b",
      "barEdge": "#e9b824",
      "surface": "#f7f1e3",
      "surfaceRaised": "#efe6d1",
      "surfaceSunken": "#23262d",
      "plate": "#f7f1e3",
      "plateInk": "#131417",
      "plateMuted": "#4f493f",
      "plateLine": "rgba(19,20,23,0.16)",
      "plateEdge": "transparent",
      "plateChip": "rgba(19,20,23,0.28)",
      "line": "#8f8773",
      "ink": "#131417",
      "inkMuted": "#4f493f",
      "inkFaint": "#655d50",
      "poster": "#131417",
      "posterInk": "#f3ebdd",
      "posterMuted": "#b9b1a2",
      "night": "#131417",
      "nightInk": "#f3ebdd",
      "accent": "#e9b824",
      "accentInk": "#131417",
      "accentText": "#654800",
      "win": "#b42b24",
      "winInk": "#f3ebdd",
      "winText": "#a3261f",
      "statusPending": "#6b6660",
      "statusRetained": "#e9b824",
      "statusWaitlist": "#2f5fb8",
      "statusRefused": "#8f897d",
      "statusOnsite": "#131417",
      "statusCancelled": "#c8322b",
      "statusUncertain": "#e9b824",
      "scrim": "rgba(19,20,23,0.45)",
      "photoFade": "#2b2e36",
      "brandCredit": "rgba(233,184,36,0.7)",
      "brandCreditLight": "#8a6200",
      "surfaceField": "#fffaf0",
      "plateField": "#fffaf0",
      "mapLand": "#e6dcc4",
      "mapLand2": "#dbcfb2",
      "deptLand": "#d6c9a6",
      "mapSea": "#aebbbd",
      "mapRoad": "#2a2723",
      "mapLabel": "#3d3830",
      "barControlEdge": "rgba(243,235,221,0.18)",
      "barShellEdge": "rgba(243,235,221,0.06)",
      "barChip": "rgba(243,235,221,0.1)",
      "photoInk": "#f3ebdd",
      "sceneSkyTop": "#070a12",
      "sceneSkyBottom": "#1a2233",
      "sceneGround": "#121317",
      "sceneCar": "#d4552a",
      "sceneWindow": "#0e1116",
      "sceneWheel": "#0b0c0e",
      "sceneRim": "#9a9a9a",
      "avatar1": "#7a2412",
      "avatar2": "#2f5fb8",
      "avatar3": "#565b66",
      "avatar4": "#6b3fa0",
      "avatar5": "#b8441d",
      "avatar6": "#8a6200",
      "avatar7": "#131417",
      "avatar8": "#a3261f",
      "avatar9": "#3d4f7a",
      "avatarInk": "#f3ebdd",
      "cardLine": "rgba(19,20,23,0.12)",
      "vitrineFrom": "#d4552a",
      "vitrineTo": "#8f1d22",
      "stampInk66": "#c8322b",
      "stampInk34": "#6b3fa0",
      "stampInk31": "#131417",
      "stampInk11": "#2f5fb8",
      "stampInkDefault": "#b42b24",
      "statusWaitlistOnPlate": "#2f5fb8"
    }
  },
  "shadow": {
    "beton": {
      "shadowCard": "0 10px 26px rgba(0,0,0,0.45)",
      "shadowPoster": "0 24px 60px rgba(0,0,0,0.6)",
      "shadowSheet": "0 -14px 40px rgba(0,0,0,0.4)",
      "shadowBarTop": "none",
      "shadowBarBottom": "0 -8px 24px rgba(0,0,0,0.50)",
      "embossBar": "none",
      "neonAccent": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 0 26px rgba(233,184,36,0.55), 0 6px 14px rgba(0,0,0,0.35)",
      "neonAccentSoft": "0 0 10px rgba(233,184,36,0.40)",
      "neonWin": "0 0 16px rgba(200,50,43,0.60)",
      "neonScan": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 0 34px rgba(233,184,36,0.65), 0 6px 14px rgba(0,0,0,0.35)",
      "shadowTabbar": "0 14px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(243,235,221,0.08)",
      "shadowOButton": "0 -6px 16px rgba(0,0,0,0.25)"
    },
    "sable": {
      "shadowCard": "0 10px 24px rgba(60,45,15,0.16)",
      "shadowPoster": "0 22px 48px rgba(50,35,10,0.28)",
      "shadowSheet": "0 -14px 40px rgba(0,0,0,0.4)",
      "shadowBarTop": "none",
      "shadowBarBottom": "0 -8px 24px rgba(0,0,0,0.30)",
      "embossBar": "none",
      "neonAccent": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 8px 18px rgba(0,0,0,0.25)",
      "neonAccentSoft": "0 2px 6px rgba(0,0,0,0.15)",
      "neonWin": "0 6px 14px rgba(200,50,43,0.35)",
      "neonScan": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 10px 24px rgba(0,0,0,0.30)",
      "shadowTabbar": "0 14px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(243,235,221,0.08)",
      "shadowOButton": "0 -6px 16px rgba(0,0,0,0.25)"
    }
  },
  "groundFx": {
    "beton": {
      "halo": "radial-gradient(ellipse 70% 50% at 95% -10%, rgba(233,184,36,0.85), rgba(233,184,36,0.30) 40%, transparent 68%)",
      "reflet": "radial-gradient(ellipse 60% 42% at -12% 108%, rgba(255,246,225,0.42), rgba(255,246,225,0.10) 45%, transparent 65%)",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(255,246,225,0.14) 36% 56%, transparent 56%)",
      "marquage": "none",
      "vignette": "radial-gradient(ellipse 130% 90% at 55% 25%, #17191e 0, #101216 62%, #050608 125%)",
      "battleLamp": "radial-gradient(ellipse 74% 34% at 104% -4%, rgba(255,204,92,0.55), transparent 100%)",
      "battleSpill": "radial-gradient(ellipse 100% 58% at 100% 0%, rgba(233,184,36,0.22), transparent 72%)",
      "battleRim": "radial-gradient(ellipse 95% 60% at -4% 108%, rgba(110,130,175,0.12), transparent 70%)",
      "grain": "feTurbulence fractalNoise 0.9 · 2 octaves · blanc α 0.6 · opacity 0.28 · mix-blend-mode overlay"
    },
    "sable": {
      "halo": "none",
      "reflet": "none",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(19,20,23,0.16) 36% 56%, transparent 56%)",
      "marquage": "none",
      "vignette": "radial-gradient(ellipse 130% 90% at 55% 25%, #e8dfca 0, #ddd2b8 62%, #c9bc9b 125%)",
      "battleLamp": "none",
      "battleSpill": "none",
      "battleRim": "none",
      "grain": "feTurbulence fractalNoise 0.9 · 2 octaves · noir α 0.6 · opacity 0.32 · mix-blend-mode multiply"
    }
  },
  "groundFxSite": {
    "beton": {
      "halo": "radial-gradient(ellipse 46% 60% at 94% 0%, rgba(233,184,36,0.85), rgba(233,184,36,0.30) 40%, transparent 68%)",
      "reflet": "radial-gradient(ellipse 60% 42% at -12% 108%, rgba(255,246,225,0.42), rgba(255,246,225,0.10) 45%, transparent 65%)",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(255,246,225,0.14) 36% 56%, transparent 56%)",
      "marquage": "none",
      "vignette": "radial-gradient(ellipse 130% 90% at 55% 25%, #17191e 0, #101216 62%, #050608 125%)",
      "battleLamp": "radial-gradient(ellipse 74% 34% at 104% -4%, rgba(255,204,92,0.55), transparent 100%)",
      "battleSpill": "radial-gradient(ellipse 100% 58% at 100% 0%, rgba(233,184,36,0.22), transparent 72%)",
      "battleRim": "radial-gradient(ellipse 95% 60% at -4% 108%, rgba(110,130,175,0.12), transparent 70%)"
    },
    "sable": {
      "halo": "none",
      "reflet": "none",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(19,20,23,0.16) 36% 56%, transparent 56%)",
      "marquage": "none",
      "vignette": "radial-gradient(ellipse 82% 62% at 50% 26%, #e8dfca 0, #ddd2b8 62%, #c9bc9b 125%)",
      "battleLamp": "none",
      "battleSpill": "none",
      "battleRim": "none"
    }
  },
  "grain": {
    "beton": {
      "baseFrequency": 0.9,
      "numOctaves": 2,
      "color": [
        1,
        1,
        1
      ],
      "alpha": 0.6,
      "opacity": 0.28,
      "blend": "overlay"
    },
    "sable": {
      "baseFrequency": 0.9,
      "numOctaves": 2,
      "color": [
        0,
        0,
        0
      ],
      "alpha": 0.6,
      "opacity": 0.32,
      "blend": "multiply"
    }
  },
  "barFx": {
    "beton": {
      "barGradient": "linear-gradient(180deg, #131418 0%, #08090b 55%, #030304 100%)",
      "barBrush": "feColorMatrix chaud (0.95, 0.92, 0.85) α 0.5 · opacity 0.6 · mix-blend-mode screen",
      "barBrushFilter": "feTurbulence type=fractalNoise baseFrequency=\"0.012 0.9\" numOctaves=3 stitchTiles=stitch"
    },
    "sable": {
      "barGradient": "linear-gradient(180deg, #1c1d22 0%, #131417 55%, #0b0c0e 100%)",
      "barBrush": "feColorMatrix chaud (0.95, 0.92, 0.85) α 0.5 · opacity 0.6 · mix-blend-mode screen",
      "barBrushFilter": "feTurbulence type=fractalNoise baseFrequency=\"0.012 0.9\" numOctaves=3 stitchTiles=stitch"
    }
  },
  "barBrush": {
    "beton": {
      "baseFrequency": "0.012 0.9",
      "numOctaves": 3,
      "color": [
        0.95,
        0.92,
        0.85
      ],
      "alpha": 0.5,
      "opacity": 0.6,
      "blend": "screen"
    },
    "sable": {
      "baseFrequency": "0.012 0.9",
      "numOctaves": 3,
      "color": [
        0.95,
        0.92,
        0.85
      ],
      "alpha": 0.5,
      "opacity": 0.6,
      "blend": "screen"
    }
  },
  "spacing": {
    "space1": 4,
    "space2": 8,
    "space3": 12,
    "space4": 16,
    "space6": 24,
    "space8": 32,
    "space12": 48,
    "touch": 48,
    "barTop": 64,
    "barTabs": 80,
    "brandMark": 30,
    "brandLogo": 128,
    "sidebar": 230
  },
  "radius": {
    "radiusSm": 8,
    "radiusMd": 12,
    "radiusLg": 18,
    "radiusXl": 30,
    "radiusPill": 999,
    "radiusChip": 11
  },
  "geometry": {
    "skew": "-8deg",
    "skewTab": "-6deg",
    "cut": "10deg",
    "band": "14deg"
  },
  "timing": {
    "fast": 120,
    "base": 220,
    "poster": 420,
    "scan": 1000,
    "stagger": 40,
    "loader": 1600,
    "breath": 6000,
    "phares": 9000,
    "sweep": 14000
  },
  "easing": {
    "park": "cubic-bezier(.12,.75,.25,1)",
    "inout": "cubic-bezier(.4,0,.2,1)",
    "out": "cubic-bezier(.2,.8,.2,1)",
    "linear": "linear"
  },
  "families": {
    "display": "\"Archivo\", \"Archivo Black\", Impact, sans-serif",
    "sans": "\"Archivo\", system-ui, sans-serif",
    "narrow": "\"Archivo Narrow\", \"Archivo\", system-ui, sans-serif"
  },
  "type": {
    "posterXl": {
      "family": "display",
      "fontSize": 38,
      "lineHeight": 34,
      "fontWeight": 900,
      "fontStyle": "italic",
      "letterSpacing": -0.01,
      "fontStretch": null,
      "sample": "NOCTURNE DE CANET"
    },
    "posterL": {
      "family": "display",
      "fontSize": 24,
      "lineHeight": 24,
      "fontWeight": 900,
      "fontStyle": "italic",
      "letterSpacing": -0.01,
      "fontStretch": null,
      "sample": "DAMIEN_66"
    },
    "posterM": {
      "family": "display",
      "fontSize": 17,
      "lineHeight": 19,
      "fontWeight": 900,
      "fontStyle": "italic",
      "letterSpacing": 0,
      "fontStretch": null,
      "sample": "NISSAN 200SX S14"
    },
    "posterS": {
      "family": "display",
      "fontSize": 13,
      "lineHeight": 15,
      "fontWeight": 900,
      "fontStyle": "italic",
      "letterSpacing": 0,
      "fontStretch": null,
      "sample": "EXPO RIVESALTES"
    },
    "title": {
      "family": "display",
      "fontSize": 20,
      "lineHeight": 22,
      "fontWeight": 900,
      "fontStyle": "normal",
      "letterSpacing": 0.02,
      "fontStretch": null,
      "sample": "MON GARAGE"
    },
    "button": {
      "family": "display",
      "fontSize": 14,
      "lineHeight": 18,
      "fontWeight": 900,
      "fontStyle": "normal",
      "letterSpacing": 0.02,
      "fontStretch": "118%",
      "sample": "MODE JOUR J"
    },
    "tab": {
      "family": "display",
      "fontSize": 9.5,
      "lineHeight": 11,
      "fontWeight": 800,
      "fontStyle": "normal",
      "letterSpacing": 0.03,
      "fontStretch": "115%",
      "sample": "ACCÈS"
    },
    "label": {
      "family": "narrow",
      "fontSize": 11,
      "lineHeight": 14,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.09,
      "fontStretch": "75%",
      "sample": "PROCHAIN ACCÈS · J-2"
    },
    "meta": {
      "family": "narrow",
      "fontSize": 12.5,
      "lineHeight": 15,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.05,
      "fontStretch": "75%",
      "sample": "SAM 17 OCT · 19 H · ZONE JDM"
    },
    "zone": {
      "family": "narrow",
      "fontSize": 30,
      "lineHeight": 30,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.04,
      "fontStretch": null,
      "sample": "JDM"
    },
    "credit": {
      "family": "narrow",
      "fontSize": 9,
      "lineHeight": 11,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.14,
      "fontStretch": "75%",
      "sample": "ORASSO"
    },
    "body": {
      "family": "sans",
      "fontSize": 15,
      "lineHeight": 22,
      "fontWeight": 400,
      "fontStyle": "normal",
      "letterSpacing": 0,
      "fontStretch": null,
      "sample": "Départs au pas, aucun burn, exclusion immédiate."
    },
    "bodyStrong": {
      "family": "sans",
      "fontSize": 15,
      "lineHeight": 22,
      "fontWeight": 600,
      "fontStyle": "normal",
      "letterSpacing": 0,
      "fontStretch": null,
      "sample": "Kenji_66 · Circuit · 14 événements"
    },
    "caption": {
      "family": "sans",
      "fontSize": 13,
      "lineHeight": 18,
      "fontWeight": 400,
      "fontStyle": "normal",
      "letterSpacing": 0,
      "fontStretch": null,
      "sample": "Plaque visible par l'organisateur seulement"
    },
    "number": {
      "family": "sans",
      "fontSize": 34,
      "lineHeight": 34,
      "fontWeight": 800,
      "fontStyle": "normal",
      "letterSpacing": -0.02,
      "fontStretch": null,
      "sample": "116"
    },
    "numberNarrow": {
      "family": "sans",
      "fontSize": 34,
      "lineHeight": 34,
      "fontWeight": 800,
      "fontStyle": "normal",
      "letterSpacing": -0.02,
      "fontStretch": "62%",
      "sample": "116"
    }
  }
} as const;

export type Tokens = typeof tokens;
export type ColorTokenName = keyof Tokens["color"]["beton"];
export type TypeStyleName = keyof Tokens["type"];

/** Écarts de la surcouche DA v2 au système gelé (tokens.v2.json), avec leur raison : affichés par /ds et /_ds. */
export const tokensV2Overlay = [
  {
    "kind": "changed",
    "group": "color",
    "name": "ground",
    "before": {
      "beton": "#1f2126",
      "sable": "#cfc8b8"
    },
    "value": {
      "beton": "#17191e",
      "sable": "#e8dfca"
    },
    "why": "Sable papier clair (fond uni, v10) ; Béton plus profond (prototype --bg)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "ground-center",
    "before": {
      "beton": "#262932",
      "sable": "#e4ddcb"
    },
    "value": {
      "beton": "#101216",
      "sable": "#ddd2b8"
    },
    "why": "vignette du fond (prototype --bg-2) ; plus d'ombre graphite dans le coin en Sable"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "ground-deep",
    "before": {
      "beton": "#07080a",
      "sable": "#3b3427"
    },
    "value": {
      "beton": "#050608",
      "sable": "#c9bc9b"
    },
    "why": "bord de la vignette (prototype --bg-deep) ; Sable sans graphite"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "surface",
    "before": {
      "beton": "#2b2e36",
      "sable": "#ded7c7"
    },
    "value": {
      "beton": "#262930",
      "sable": "#f7f1e3"
    },
    "why": "cartes claires en Sable : la plaque graphite devient facultative (prototype --card)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "surface-raised",
    "before": {
      "beton": "#363941",
      "sable": "#363941"
    },
    "value": {
      "beton": "#30333b",
      "sable": "#efe6d1"
    },
    "why": "carte surélevée (prototype --card-2)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "surface-field",
    "before": {},
    "value": {
      "beton": "#1e2025",
      "sable": "#fffaf0"
    },
    "why": "champ de saisie (prototype --field ; dérivé du générateur remplacé)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "ink-muted",
    "before": {
      "beton": "#afa89c",
      "sable": "#6b6660"
    },
    "value": {
      "beton": "#aaa397",
      "sable": "#4f493f"
    },
    "why": "lisibilité Sable, contraste 4,5:1 (audit v40)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "ink-faint",
    "before": {
      "beton": "#7f7a70",
      "sable": "#8f897d"
    },
    "value": {
      "beton": "#7a7468",
      "sable": "#655d50"
    },
    "why": "lisibilité Sable (audit v40)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "accent-text",
    "before": {
      "beton": "#e9b824",
      "sable": "#8a6200"
    },
    "value": {
      "beton": "#e9b824",
      "sable": "#654800"
    },
    "why": "moutarde lisible sur papier clair (audit v40)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "win",
    "before": {
      "beton": "#c8322b",
      "sable": "#c8322b"
    },
    "value": {
      "beton": "#c8322b",
      "sable": "#b42b24"
    },
    "why": "rouge plus sombre sur papier clair (audit v40)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "bar",
    "before": {
      "beton": "#08090b",
      "sable": "#8a8472"
    },
    "value": {
      "beton": "#08090b",
      "sable": "#131417"
    },
    "why": "barre nuit en Sable (au lieu du métal sable brossé)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "bar-ink",
    "before": {
      "beton": "#f3ebdd",
      "sable": "#131417"
    },
    "value": {
      "beton": "#f3ebdd",
      "sable": "#f3ebdd"
    },
    "why": "encre crème sur la barre nuit"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "bar-muted",
    "before": {
      "beton": "#afa89c",
      "sable": "#2a2722"
    },
    "value": {
      "beton": "#8f897d",
      "sable": "#a39b8b"
    },
    "why": "onglets inactifs (prototype --bar-muted)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "plate",
    "before": {
      "beton": "#2b2e36",
      "sable": "rgba(43,46,54,0.92)"
    },
    "value": {
      "beton": "#262930",
      "sable": "#f7f1e3"
    },
    "why": "lot C1 (D33) : artefact DA v2, .card (--card) : la plaque est la carte du thème, claire en Sable (écart R4 de l'audit)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "plate-ink",
    "before": {
      "beton": "#f3ebdd",
      "sable": "#f3ebdd"
    },
    "value": {
      "beton": "#f3ebdd",
      "sable": "#131417"
    },
    "why": "lot C1 (D33) : artefact DA v2, encre de .card (--ink)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "plate-muted",
    "before": {
      "beton": "#afa89c",
      "sable": "#c9c2b4"
    },
    "value": {
      "beton": "#aaa397",
      "sable": "#4f493f"
    },
    "why": "lot C1 (D33) : artefact DA v2, --muted"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "plate-line",
    "before": {
      "beton": "#565b66",
      "sable": "rgba(243,235,221,0.15)"
    },
    "value": {
      "beton": "rgba(243,235,221,0.14)",
      "sable": "rgba(19,20,23,0.16)"
    },
    "why": "lot C1 (D33) : artefact DA v2, --line"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "plate-edge",
    "before": {
      "beton": "transparent",
      "sable": "rgba(243,235,221,0.12)"
    },
    "value": {
      "beton": "transparent",
      "sable": "transparent"
    },
    "why": "lot C1 (D33) : artefact DA v2, .card sans bord"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "plate-chip",
    "before": {
      "beton": "rgba(243,235,221,0.4)",
      "sable": "rgba(243,235,221,0.4)"
    },
    "value": {
      "beton": "rgba(243,235,221,0.4)",
      "sable": "rgba(19,20,23,0.28)"
    },
    "why": "lot C1 (D33) : artefact DA v2, contour sur carte claire en Sable (--field-line)"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "poster-muted",
    "before": {
      "beton": "#6b6660",
      "sable": "#9c958a"
    },
    "value": {
      "beton": "#5b554b",
      "sable": "#b9b1a2"
    },
    "why": "lot C1 (D33) : artefact DA v2, --poster-muted"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "bar-edge",
    "before": {
      "beton": "rgba(233,184,36,0.45)",
      "sable": "#e9b824"
    },
    "value": {
      "beton": "rgba(233,184,36,0.55)",
      "sable": "#e9b824"
    },
    "why": "lot C1 (D33) : artefact DA v2, --bar-line"
  },
  {
    "kind": "changed",
    "group": "color",
    "name": "scrim",
    "before": {
      "beton": "#131417cc",
      "sable": "#131417b3"
    },
    "value": {
      "beton": "rgba(0,0,0,0.6)",
      "sable": "rgba(19,20,23,0.45)"
    },
    "why": "lot C1 (D33) : artefact DA v2, --scrim (voile des feuilles)"
  },
  {
    "kind": "changed",
    "group": "shadow",
    "name": "emboss-bar",
    "before": {
      "beton": "none",
      "sable": "0 1px 0 rgba(255,250,235,0.45)"
    },
    "value": {
      "beton": "none",
      "sable": "none"
    },
    "why": "pas de gaufrage clair sur la barre nuit"
  },
  {
    "kind": "changed",
    "group": "shadow",
    "name": "shadow-card",
    "before": {
      "beton": "0 8px 24px rgba(0,0,0,0.40)",
      "sable": "0 8px 24px rgba(40,30,10,0.22)"
    },
    "value": {
      "beton": "0 10px 26px rgba(0,0,0,0.45)",
      "sable": "0 10px 24px rgba(60,45,15,0.16)"
    },
    "why": "lot C1 (D33) : artefact DA v2, --shadow"
  },
  {
    "kind": "changed",
    "group": "shadow",
    "name": "shadow-poster",
    "before": {
      "beton": "0 18px 40px rgba(0,0,0,0.50)",
      "sable": "0 18px 40px rgba(20,15,5,0.40)"
    },
    "value": {
      "beton": "0 24px 60px rgba(0,0,0,0.6)",
      "sable": "0 22px 48px rgba(50,35,10,0.28)"
    },
    "why": "lot C1 (D33) : artefact DA v2, --shadow-lg"
  },
  {
    "kind": "changed",
    "group": "shadow",
    "name": "shadow-sheet",
    "before": {
      "beton": "0 -12px 40px rgba(0,0,0,0.55)",
      "sable": "0 -12px 40px rgba(20,15,5,0.35)"
    },
    "value": {
      "beton": "0 -14px 40px rgba(0,0,0,0.4)",
      "sable": "0 -14px 40px rgba(0,0,0,0.4)"
    },
    "why": "lot C1 (D33) : artefact DA v2, .sheet"
  },
  {
    "kind": "changed",
    "group": "shadow",
    "name": "shadow-bar-top",
    "before": {
      "beton": "0 6px 18px rgba(0,0,0,0.45)",
      "sable": "0 6px 18px rgba(0,0,0,0.28)"
    },
    "value": {
      "beton": "none",
      "sable": "none"
    },
    "why": "lot C1 (D33) : artefact DA v2, .appbar unie, sans ombre"
  },
  {
    "kind": "changed",
    "group": "shadow",
    "name": "shadow-tabbar",
    "before": {},
    "value": {
      "beton": "0 14px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(243,235,221,0.08)",
      "sable": "0 14px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(243,235,221,0.08)"
    },
    "why": "lot C1 (D33) : artefact DA v2, .tabbar flottante"
  },
  {
    "kind": "changed",
    "group": "shadow",
    "name": "shadow-o-button",
    "before": {},
    "value": {
      "beton": "0 -6px 16px rgba(0,0,0,0.25)",
      "sable": "0 -6px 16px rgba(0,0,0,0.25)"
    },
    "why": "lot C1 (D33) : artefact DA v2, .obtn (le O de la barre)"
  },
  {
    "kind": "changed",
    "group": "ground-fx",
    "name": "halo",
    "before": {
      "beton": "radial-gradient(ellipse 70% 50% at 95% -10%, rgba(233,184,36,0.85), rgba(233,184,36,0.30) 40%, transparent 68%)",
      "sable": "radial-gradient(ellipse 95% 70% at 100% -14%, rgba(19,21,26,1), rgba(31,34,42,0.92) 30%, rgba(38,41,50,0.55) 55%, transparent 78%)"
    },
    "value": {
      "beton": "radial-gradient(ellipse 70% 50% at 95% -10%, rgba(233,184,36,0.85), rgba(233,184,36,0.30) 40%, transparent 68%)",
      "sable": "none"
    },
    "why": "Sable en fond uni, sans ombre graphite (v10)"
  },
  {
    "kind": "changed",
    "group": "ground-fx",
    "name": "reflet",
    "before": {
      "beton": "radial-gradient(ellipse 60% 42% at -12% 108%, rgba(255,246,225,0.42), rgba(255,246,225,0.10) 45%, transparent 65%)",
      "sable": "radial-gradient(ellipse 62% 44% at -14% 110%, rgba(255,250,232,0.45), rgba(255,250,232,0.12) 45%, transparent 65%)"
    },
    "value": {
      "beton": "radial-gradient(ellipse 60% 42% at -12% 108%, rgba(255,246,225,0.42), rgba(255,246,225,0.10) 45%, transparent 65%)",
      "sable": "none"
    },
    "why": "Sable en fond uni (v10)"
  },
  {
    "kind": "changed",
    "group": "ground-fx",
    "name": "battle-lamp",
    "before": {},
    "value": {
      "beton": "radial-gradient(ellipse 74% 34% at 104% -4%, rgba(255,204,92,0.55), transparent 100%)",
      "sable": "none"
    },
    "why": "fond battle (lot 39) : cœur de la lampe à sodium du prototype (--halo-core, 0,55)"
  },
  {
    "kind": "changed",
    "group": "ground-fx",
    "name": "battle-spill",
    "before": {},
    "value": {
      "beton": "radial-gradient(ellipse 100% 58% at 100% 0%, rgba(233,184,36,0.22), transparent 72%)",
      "sable": "none"
    },
    "why": "fond battle (lot 39) : lumière diffuse de la lampe (--halo-spill, 0,22)"
  },
  {
    "kind": "changed",
    "group": "ground-fx",
    "name": "battle-rim",
    "before": {},
    "value": {
      "beton": "radial-gradient(ellipse 95% 60% at -4% 108%, rgba(110,130,175,0.12), transparent 70%)",
      "sable": "none"
    },
    "why": "fond battle (lot 39) : contre-jour froid en bas à gauche (--rim, 0,12)"
  },
  {
    "kind": "changed",
    "group": "ground-fx",
    "name": "vignette",
    "before": {
      "beton": "radial-gradient(ellipse 100% 72% at 50% 32%, #262932 0, #15171b 60%, #07080a 100%)",
      "sable": "radial-gradient(ellipse 96% 70% at 50% 30%, #e4ddcb 0, #9f9479 55%, #3b3427 100%)"
    },
    "value": {
      "beton": "radial-gradient(ellipse 130% 90% at 55% 25%, #17191e 0, #101216 62%, #050608 125%)",
      "sable": "radial-gradient(ellipse 130% 90% at 55% 25%, #e8dfca 0, #ddd2b8 62%, #c9bc9b 125%)"
    },
    "why": "vignette du prototype (ground → ground-center → ground-deep)"
  },
  {
    "kind": "changed",
    "group": "ground-fx",
    "name": "marquage",
    "before": {
      "beton": "repeating-linear-gradient(170deg, transparent 0 104px, rgba(243,235,221,0.18) 104px 112px)",
      "sable": "repeating-linear-gradient(170deg, transparent 0 104px, rgba(19,20,23,0.30) 104px 112px)"
    },
    "value": {
      "beton": "none",
      "sable": "none"
    },
    "why": "lot C1 (D33) : artefact DA v2 : aucun marquage, fond net à lueur (écart R1 de l'audit)"
  },
  {
    "kind": "changed",
    "group": "bar-fx",
    "name": "bar-gradient",
    "before": {
      "beton": "linear-gradient(180deg, #131418 0%, #08090b 55%, #030304 100%)",
      "sable": "linear-gradient(180deg, #9c9685 0%, #8a8472 55%, #7e7765 100%)"
    },
    "value": {
      "beton": "linear-gradient(180deg, #131418 0%, #08090b 55%, #030304 100%)",
      "sable": "linear-gradient(180deg, #1c1d22 0%, #131417 55%, #0b0c0e 100%)"
    },
    "why": "barre nuit en Sable"
  },
  {
    "kind": "changed",
    "group": "bar-fx",
    "name": "bar-brush",
    "before": {
      "beton": "feColorMatrix chaud (0.95, 0.92, 0.85) α 0.5 · opacity 0.6 · mix-blend-mode screen",
      "sable": "feColorMatrix sombre (0.08, 0.07, 0.05) α 1 · opacity 0.38 · mix-blend-mode multiply"
    },
    "value": {
      "beton": "feColorMatrix chaud (0.95, 0.92, 0.85) α 0.5 · opacity 0.6 · mix-blend-mode screen",
      "sable": "feColorMatrix chaud (0.95, 0.92, 0.85) α 0.5 · opacity 0.6 · mix-blend-mode screen"
    },
    "why": "brossage de la barre nuit, comme en Béton"
  },
  {
    "kind": "changed",
    "group": "bar-fx",
    "name": "bar-brush-filter",
    "before": {
      "beton": "feTurbulence type=fractalNoise baseFrequency=\"0.012 0.9\" numOctaves=3 stitchTiles=stitch",
      "sable": "feTurbulence type=fractalNoise baseFrequency=\"0.012 0.9\" numOctaves=3 stitchTiles=stitch"
    },
    "value": {
      "beton": "feTurbulence type=fractalNoise baseFrequency=\"0.012 0.9\" numOctaves=3 stitchTiles=stitch",
      "sable": "feTurbulence type=fractalNoise baseFrequency=\"0.012 0.9\" numOctaves=3 stitchTiles=stitch"
    },
    "why": "brossage de la barre nuit, comme en Béton"
  },
  {
    "kind": "changed",
    "group": "type",
    "name": "button",
    "before": {
      "name": "button",
      "fontSize": "15px",
      "lineHeight": "18px",
      "fontWeight": 900,
      "letterSpacing": "0.02em",
      "sample": "MODE JOUR J",
      "usage": "Libellé des boutons (12 à 14 px pour les boutons secondaires en rangée, 11 px pour les gros boutons du staff). font-stretch 125 %, uppercase, droit."
    },
    "value": {
      "fontSize": "14px",
      "fontStretch": "118%"
    },
    "why": "lot C1 (D33) : artefact DA v2, .btn : 118 % 900 14 px"
  },
  {
    "kind": "changed",
    "group": "type",
    "name": "tab",
    "before": {
      "name": "tab",
      "fontSize": "9px",
      "lineHeight": "11px",
      "fontWeight": 900,
      "letterSpacing": "0.04em",
      "sample": "ACCÈS",
      "usage": "Libellé d'onglet sous son icône de 22 px. font-stretch 125 %, uppercase, droit."
    },
    "value": {
      "fontSize": "9.5px",
      "fontWeight": 800,
      "letterSpacing": "0.03em",
      "fontStretch": "115%"
    },
    "why": "lot C1 (D33) : artefact DA v2, .tab : 115 % 800 9,5 px"
  },
  {
    "kind": "changed",
    "group": "type",
    "name": "label",
    "before": {
      "name": "label",
      "fontSize": "11px",
      "lineHeight": "14px",
      "fontWeight": 700,
      "letterSpacing": "0.1em",
      "sample": "PROCHAIN ACCÈS · J-2",
      "usage": "Étiquette au-dessus d'un bloc, statut, catégorie. uppercase, couleur ink-muted (plate-muted sur plaque)."
    },
    "value": {
      "letterSpacing": "0.09em",
      "fontStretch": "75%"
    },
    "why": "lot C1 (D33) : artefact DA v2, .t-label : 75 % 700 11 px"
  },
  {
    "kind": "changed",
    "group": "type",
    "name": "meta",
    "before": {
      "name": "meta",
      "fontSize": "12px",
      "lineHeight": "15px",
      "fontWeight": 700,
      "letterSpacing": "0.08em",
      "sample": "SAM 17 OCT · 19 H · ZONE JDM",
      "usage": "Date, heure, distance, zone : la ligne de faits sous un titre. uppercase."
    },
    "value": {
      "fontSize": "12.5px",
      "letterSpacing": "0.05em",
      "fontStretch": "75%"
    },
    "why": "lot C1 (D33) : artefact DA v2, .t-meta : 75 % 700 12,5 px"
  },
  {
    "kind": "changed",
    "group": "type",
    "name": "credit",
    "before": {
      "name": "credit",
      "fontSize": "9px",
      "lineHeight": "11px",
      "fontWeight": 700,
      "letterSpacing": "0.14em",
      "sample": "ORASSO",
      "usage": "La signature de marque en bas à droite de l'objet principal de l'écran. uppercase, brand-credit ou brand-credit-light. Une seule par écran."
    },
    "value": {
      "fontStretch": "75%"
    },
    "why": "lot C1 (D33) : artefact DA v2, .credit : 75 % 700 9 px"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "plate-field",
    "value": {
      "beton": "#363941",
      "sable": "#fffaf0"
    },
    "why": "champ et fond de saisie dans une plaque, sous plate-ink : graphite clair en Béton, --field de l’artefact en Sable (lot C1, tour 2 : la plaque est claire en Sable)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "map-land",
    "value": {
      "beton": "#1f2227",
      "sable": "#e6dcc4"
    },
    "why": "terre de la carte (style de carte Orasso, lot 44)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "map-land-2",
    "value": {
      "beton": "#262a30",
      "sable": "#dbcfb2"
    },
    "why": "terre secondaire de la carte (parcs, zones)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "dept-land",
    "value": {
      "beton": "#3b3f48",
      "sable": "#d6c9a6"
    },
    "why": "la France remplie de « Ton coin » (carte des départements, un cran au-dessus de la carte qui la porte ; lot M6, maquette 8.1, validé par Damien le 23/10)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "map-sea",
    "value": {
      "beton": "#0f1216",
      "sable": "#aebbbd"
    },
    "why": "mer et eau de la carte"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "map-road",
    "value": {
      "beton": "#f3ebdd",
      "sable": "#2a2723"
    },
    "why": "routes de la carte"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "map-label",
    "value": {
      "beton": "#c9c1b2",
      "sable": "#3d3830"
    },
    "why": "noms de lieux de la carte"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "bar-control-edge",
    "value": {
      "beton": "rgba(243,235,221,0.18)",
      "sable": "rgba(243,235,221,0.18)"
    },
    "why": "contour des boutons de l'en-tête (.abtn de l'artefact)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "bar-shell-edge",
    "value": {
      "beton": "rgba(243,235,221,0.06)",
      "sable": "rgba(243,235,221,0.06)"
    },
    "why": "bord de la barre d'onglets flottante (.tabbar)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "bar-chip",
    "value": {
      "beton": "rgba(243,235,221,0.1)",
      "sable": "rgba(243,235,221,0.1)"
    },
    "why": "fond de la pastille « Organisateur » de l'en-tête (.capchip)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "photo-ink",
    "value": {
      "beton": "#f3ebdd",
      "sable": "#f3ebdd"
    },
    "why": "texte posé sur une photo (compte à rebours de la carte d'Accueil, .hn-cd)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "scene-sky-top",
    "value": {
      "beton": "#070a12",
      "sable": "#070a12"
    },
    "why": "repli sans photo : ciel de nuit (carPhoto « nuit » de l'artefact)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "scene-sky-bottom",
    "value": {
      "beton": "#1a2233",
      "sable": "#1a2233"
    },
    "why": "repli sans photo : bas du ciel"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "scene-ground",
    "value": {
      "beton": "#121317",
      "sable": "#121317"
    },
    "why": "repli sans photo : sol"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "scene-car",
    "value": {
      "beton": "#d4552a",
      "sable": "#d4552a"
    },
    "why": "repli sans photo : carrosserie (Supra de l'artefact)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "scene-window",
    "value": {
      "beton": "#0e1116",
      "sable": "#0e1116"
    },
    "why": "repli sans photo : vitres"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "scene-wheel",
    "value": {
      "beton": "#0b0c0e",
      "sable": "#0b0c0e"
    },
    "why": "repli sans photo : pneus"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "scene-rim",
    "value": {
      "beton": "#9a9a9a",
      "sable": "#9a9a9a"
    },
    "why": "repli sans photo : jantes"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-1",
    "value": {
      "beton": "#7a2412",
      "sable": "#7a2412"
    },
    "why": "fond d’avatar n° 1 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-2",
    "value": {
      "beton": "#2f5fb8",
      "sable": "#2f5fb8"
    },
    "why": "fond d’avatar n° 2 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-3",
    "value": {
      "beton": "#565b66",
      "sable": "#565b66"
    },
    "why": "fond d’avatar n° 3 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-4",
    "value": {
      "beton": "#6b3fa0",
      "sable": "#6b3fa0"
    },
    "why": "fond d’avatar n° 4 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-5",
    "value": {
      "beton": "#b8441d",
      "sable": "#b8441d"
    },
    "why": "fond d’avatar n° 5 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-6",
    "value": {
      "beton": "#8a6200",
      "sable": "#8a6200"
    },
    "why": "fond d’avatar n° 6 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-7",
    "value": {
      "beton": "#131417",
      "sable": "#131417"
    },
    "why": "fond d’avatar n° 7 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-8",
    "value": {
      "beton": "#a3261f",
      "sable": "#a3261f"
    },
    "why": "fond d’avatar n° 8 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-9",
    "value": {
      "beton": "#3d4f7a",
      "sable": "#3d4f7a"
    },
    "why": "fond d’avatar n° 9 (bulles d’équipe, avatars sans photo ; artefact DA v2, relevé du lot C4a)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "avatar-ink",
    "value": {
      "beton": "#f3ebdd",
      "sable": "#f3ebdd"
    },
    "why": "initiales sur un fond d’avatar (.avatar de l’artefact)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "card-line",
    "value": {
      "beton": "rgba(243,235,221,0.08)",
      "sable": "rgba(19,20,23,0.12)"
    },
    "why": "filet des cartes (--card-line de l’artefact)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "vitrine-from",
    "value": {
      "beton": "#d4552a",
      "sable": "#d4552a"
    },
    "why": "dégradé des vitrines de prestataire, début (artefact : #d4552a → #8f1d22)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "vitrine-to",
    "value": {
      "beton": "#8f1d22",
      "sable": "#8f1d22"
    },
    "why": "dégradé des vitrines de prestataire, fin"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "stamp-ink-66",
    "value": {
      "beton": "#ff6a5f",
      "sable": "#c8322b"
    },
    "why": "encre de tampon (66)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "stamp-ink-34",
    "value": {
      "beton": "#b48ce6",
      "sable": "#6b3fa0"
    },
    "why": "encre de tampon (34)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "stamp-ink-31",
    "value": {
      "beton": "#f3ebdd",
      "sable": "#131417"
    },
    "why": "encre de tampon (31)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "stamp-ink-11",
    "value": {
      "beton": "#7fa6ff",
      "sable": "#2f5fb8"
    },
    "why": "encre de tampon (11)"
  },
  {
    "kind": "added",
    "group": "color",
    "name": "stamp-ink-default",
    "value": {
      "beton": "#c8322b",
      "sable": "#b42b24"
    },
    "why": "= win"
  },
  {
    "kind": "added",
    "group": "type",
    "name": "number-narrow",
    "value": {
      "fontStretch": "62%",
      "basedOn": "number"
    },
    "why": "Chiffres des cartes, compteurs, souches de date, compte à rebours : Archivo à 62 % de largeur (.t-num de l'artefact)."
  }
] as const;
