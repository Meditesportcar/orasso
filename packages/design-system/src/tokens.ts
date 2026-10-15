// Fichier généré par scripts/generate-tokens.mjs d'après docs/design-system/tokens.json. Ne pas modifier à la main.
// Jetons du système de design Orasso (v3, gelé le 15/10/2026), communs au site et à l'appli.

export const THEME_IDS = ["beton","sable"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const tokens = {
  "themes": [
    "beton",
    "sable"
  ],
  "color": {
    "beton": {
      "ground": "#1f2126",
      "groundCenter": "#262932",
      "groundDeep": "#07080a",
      "bar": "#08090b",
      "barInk": "#f3ebdd",
      "barMuted": "#afa89c",
      "barEdge": "rgba(233,184,36,0.45)",
      "surface": "#2b2e36",
      "surfaceRaised": "#363941",
      "surfaceSunken": "#23262d",
      "plate": "#2b2e36",
      "plateInk": "#f3ebdd",
      "plateMuted": "#afa89c",
      "plateLine": "#565b66",
      "plateEdge": "transparent",
      "plateChip": "rgba(243,235,221,0.4)",
      "line": "#565b66",
      "ink": "#f3ebdd",
      "inkMuted": "#afa89c",
      "inkFaint": "#7f7a70",
      "poster": "#f3ebdd",
      "posterInk": "#131417",
      "posterMuted": "#6b6660",
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
      "scrim": "#131417cc",
      "photoFade": "#2b2e36",
      "brandCredit": "rgba(233,184,36,0.7)",
      "brandCreditLight": "#8a6200",
      "statusWaitlistOnPlate": "#7fa6ff",
      "surfaceField": "#363941"
    },
    "sable": {
      "ground": "#cfc8b8",
      "groundCenter": "#e4ddcb",
      "groundDeep": "#3b3427",
      "bar": "#8a8472",
      "barInk": "#131417",
      "barMuted": "#2a2722",
      "barEdge": "#e9b824",
      "surface": "#ded7c7",
      "surfaceRaised": "#363941",
      "surfaceSunken": "#23262d",
      "plate": "rgba(43,46,54,0.92)",
      "plateInk": "#f3ebdd",
      "plateMuted": "#c9c2b4",
      "plateLine": "rgba(243,235,221,0.15)",
      "plateEdge": "rgba(243,235,221,0.12)",
      "plateChip": "rgba(243,235,221,0.4)",
      "line": "#8f8773",
      "ink": "#131417",
      "inkMuted": "#6b6660",
      "inkFaint": "#8f897d",
      "poster": "#131417",
      "posterInk": "#f3ebdd",
      "posterMuted": "#9c958a",
      "night": "#131417",
      "nightInk": "#f3ebdd",
      "accent": "#e9b824",
      "accentInk": "#131417",
      "accentText": "#8a6200",
      "win": "#c8322b",
      "winInk": "#f3ebdd",
      "winText": "#a3261f",
      "statusPending": "#6b6660",
      "statusRetained": "#e9b824",
      "statusWaitlist": "#2f5fb8",
      "statusRefused": "#8f897d",
      "statusOnsite": "#131417",
      "statusCancelled": "#c8322b",
      "statusUncertain": "#e9b824",
      "scrim": "#131417b3",
      "photoFade": "#2b2e36",
      "brandCredit": "rgba(233,184,36,0.7)",
      "brandCreditLight": "#8a6200",
      "statusWaitlistOnPlate": "#7fa6ff",
      "surfaceField": "#e8e2d3"
    }
  },
  "shadow": {
    "beton": {
      "shadowCard": "0 8px 24px rgba(0,0,0,0.40)",
      "shadowPoster": "0 18px 40px rgba(0,0,0,0.50)",
      "shadowSheet": "0 -12px 40px rgba(0,0,0,0.55)",
      "shadowBarTop": "0 6px 18px rgba(0,0,0,0.45)",
      "shadowBarBottom": "0 -8px 24px rgba(0,0,0,0.50)",
      "embossBar": "none",
      "neonAccent": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 0 26px rgba(233,184,36,0.55), 0 6px 14px rgba(0,0,0,0.35)",
      "neonAccentSoft": "0 0 10px rgba(233,184,36,0.40)",
      "neonWin": "0 0 16px rgba(200,50,43,0.60)",
      "neonScan": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 0 34px rgba(233,184,36,0.65), 0 6px 14px rgba(0,0,0,0.35)"
    },
    "sable": {
      "shadowCard": "0 8px 24px rgba(40,30,10,0.22)",
      "shadowPoster": "0 18px 40px rgba(20,15,5,0.40)",
      "shadowSheet": "0 -12px 40px rgba(20,15,5,0.35)",
      "shadowBarTop": "0 6px 18px rgba(0,0,0,0.28)",
      "shadowBarBottom": "0 -8px 24px rgba(0,0,0,0.30)",
      "embossBar": "0 1px 0 rgba(255,250,235,0.45)",
      "neonAccent": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 8px 18px rgba(0,0,0,0.25)",
      "neonAccentSoft": "0 2px 6px rgba(0,0,0,0.15)",
      "neonWin": "0 6px 14px rgba(200,50,43,0.35)",
      "neonScan": "inset 0 0 0 1px rgba(255,220,120,0.60), 0 10px 24px rgba(0,0,0,0.30)"
    }
  },
  "groundFx": {
    "beton": {
      "halo": "radial-gradient(ellipse 70% 50% at 95% -10%, rgba(233,184,36,0.85), rgba(233,184,36,0.30) 40%, transparent 68%)",
      "reflet": "radial-gradient(ellipse 60% 42% at -12% 108%, rgba(255,246,225,0.42), rgba(255,246,225,0.10) 45%, transparent 65%)",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(255,246,225,0.14) 36% 56%, transparent 56%)",
      "marquage": "repeating-linear-gradient(170deg, transparent 0 104px, rgba(243,235,221,0.18) 104px 112px)",
      "vignette": "radial-gradient(ellipse 100% 72% at 50% 32%, #262932 0, #15171b 60%, #07080a 100%)",
      "grain": "feTurbulence fractalNoise 0.9 · 2 octaves · blanc α 0.6 · opacity 0.28 · mix-blend-mode overlay"
    },
    "sable": {
      "halo": "radial-gradient(ellipse 95% 70% at 100% -14%, rgba(19,21,26,1), rgba(31,34,42,0.92) 30%, rgba(38,41,50,0.55) 55%, transparent 78%)",
      "reflet": "radial-gradient(ellipse 62% 44% at -14% 110%, rgba(255,250,232,0.45), rgba(255,250,232,0.12) 45%, transparent 65%)",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(19,20,23,0.16) 36% 56%, transparent 56%)",
      "marquage": "repeating-linear-gradient(170deg, transparent 0 104px, rgba(19,20,23,0.30) 104px 112px)",
      "vignette": "radial-gradient(ellipse 96% 70% at 50% 30%, #e4ddcb 0, #9f9479 55%, #3b3427 100%)",
      "grain": "feTurbulence fractalNoise 0.9 · 2 octaves · noir α 0.6 · opacity 0.32 · mix-blend-mode multiply"
    }
  },
  "groundFxSite": {
    "beton": {
      "halo": "radial-gradient(ellipse 46% 60% at 94% 0%, rgba(233,184,36,0.85), rgba(233,184,36,0.30) 40%, transparent 68%)",
      "reflet": "radial-gradient(ellipse 60% 42% at -12% 108%, rgba(255,246,225,0.42), rgba(255,246,225,0.10) 45%, transparent 65%)",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(255,246,225,0.14) 36% 56%, transparent 56%)",
      "marquage": "repeating-linear-gradient(170deg, transparent 0 190px, rgba(243,235,221,0.18) 190px 200px)",
      "vignette": "radial-gradient(ellipse 100% 72% at 50% 32%, #262932 0, #15171b 60%, #07080a 100%)"
    },
    "sable": {
      "halo": "radial-gradient(ellipse 64% 80% at 100% -4%, rgba(19,21,26,1), rgba(31,34,42,0.92) 30%, rgba(38,41,50,0.55) 55%, transparent 78%)",
      "reflet": "radial-gradient(ellipse 44% 48% at 0% 102%, rgba(255,250,232,0.45), rgba(255,250,232,0.12) 45%, transparent 65%)",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(19,20,23,0.16) 36% 56%, transparent 56%)",
      "marquage": "repeating-linear-gradient(170deg, transparent 0 190px, rgba(19,20,23,0.30) 190px 200px)",
      "vignette": "radial-gradient(ellipse 82% 62% at 50% 26%, #e4ddcb 0, #9f9479 55%, #3b3427 100%)"
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
      "barGradient": "linear-gradient(180deg, #9c9685 0%, #8a8472 55%, #7e7765 100%)",
      "barBrush": "feColorMatrix sombre (0.08, 0.07, 0.05) α 1 · opacity 0.38 · mix-blend-mode multiply",
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
        0.08,
        0.07,
        0.05
      ],
      "alpha": 1,
      "opacity": 0.38,
      "blend": "multiply"
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
      "sample": "NOCTURNE DE CANET"
    },
    "posterL": {
      "family": "display",
      "fontSize": 24,
      "lineHeight": 24,
      "fontWeight": 900,
      "fontStyle": "italic",
      "letterSpacing": -0.01,
      "sample": "DAMIEN_66"
    },
    "posterM": {
      "family": "display",
      "fontSize": 17,
      "lineHeight": 19,
      "fontWeight": 900,
      "fontStyle": "italic",
      "letterSpacing": 0,
      "sample": "NISSAN 200SX S14"
    },
    "posterS": {
      "family": "display",
      "fontSize": 13,
      "lineHeight": 15,
      "fontWeight": 900,
      "fontStyle": "italic",
      "letterSpacing": 0,
      "sample": "EXPO RIVESALTES"
    },
    "title": {
      "family": "display",
      "fontSize": 20,
      "lineHeight": 22,
      "fontWeight": 900,
      "fontStyle": "normal",
      "letterSpacing": 0.02,
      "sample": "MON GARAGE"
    },
    "button": {
      "family": "display",
      "fontSize": 15,
      "lineHeight": 18,
      "fontWeight": 900,
      "fontStyle": "normal",
      "letterSpacing": 0.02,
      "sample": "MODE JOUR J"
    },
    "tab": {
      "family": "display",
      "fontSize": 9,
      "lineHeight": 11,
      "fontWeight": 900,
      "fontStyle": "normal",
      "letterSpacing": 0.04,
      "sample": "ACCÈS"
    },
    "label": {
      "family": "narrow",
      "fontSize": 11,
      "lineHeight": 14,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.1,
      "sample": "PROCHAIN ACCÈS · J-2"
    },
    "meta": {
      "family": "narrow",
      "fontSize": 12,
      "lineHeight": 15,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.08,
      "sample": "SAM 17 OCT · 19 H · ZONE JDM"
    },
    "zone": {
      "family": "narrow",
      "fontSize": 30,
      "lineHeight": 30,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.04,
      "sample": "JDM"
    },
    "credit": {
      "family": "narrow",
      "fontSize": 9,
      "lineHeight": 11,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.14,
      "sample": "ORASSO"
    },
    "body": {
      "family": "sans",
      "fontSize": 15,
      "lineHeight": 22,
      "fontWeight": 400,
      "fontStyle": "normal",
      "letterSpacing": 0,
      "sample": "Départs au pas, aucun burn, exclusion immédiate."
    },
    "bodyStrong": {
      "family": "sans",
      "fontSize": 15,
      "lineHeight": 22,
      "fontWeight": 600,
      "fontStyle": "normal",
      "letterSpacing": 0,
      "sample": "Kenji_66 · Circuit · 14 événements"
    },
    "caption": {
      "family": "sans",
      "fontSize": 13,
      "lineHeight": 18,
      "fontWeight": 400,
      "fontStyle": "normal",
      "letterSpacing": 0,
      "sample": "Plaque visible par l'organisateur seulement"
    },
    "number": {
      "family": "sans",
      "fontSize": 34,
      "lineHeight": 34,
      "fontWeight": 800,
      "fontStyle": "normal",
      "letterSpacing": -0.02,
      "sample": "116"
    }
  }
} as const;

export type Tokens = typeof tokens;
export type ColorTokenName = keyof Tokens["color"]["beton"];
export type TypeStyleName = keyof Tokens["type"];
