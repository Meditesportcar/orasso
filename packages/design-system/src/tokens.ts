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
      "barEdge": "rgba(233,184,36,0.45)",
      "surface": "#262930",
      "surfaceRaised": "#30333b",
      "surfaceSunken": "#23262d",
      "plate": "#2b2e36",
      "plateInk": "#f3ebdd",
      "plateMuted": "#afa89c",
      "plateLine": "#565b66",
      "plateEdge": "transparent",
      "plateChip": "rgba(243,235,221,0.4)",
      "line": "#565b66",
      "ink": "#f3ebdd",
      "inkMuted": "#aaa397",
      "inkFaint": "#7a7468",
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
      "surfaceField": "#1e2025",
      "plateField": "#363941",
      "mapLand": "#1f2227",
      "mapLand2": "#262a30",
      "mapSea": "#0f1216",
      "mapRoad": "#f3ebdd",
      "mapLabel": "#c9c1b2",
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
      "plate": "rgba(43,46,54,0.92)",
      "plateInk": "#f3ebdd",
      "plateMuted": "#c9c2b4",
      "plateLine": "rgba(243,235,221,0.15)",
      "plateEdge": "rgba(243,235,221,0.12)",
      "plateChip": "rgba(243,235,221,0.4)",
      "line": "#8f8773",
      "ink": "#131417",
      "inkMuted": "#4f493f",
      "inkFaint": "#655d50",
      "poster": "#131417",
      "posterInk": "#f3ebdd",
      "posterMuted": "#9c958a",
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
      "scrim": "#131417b3",
      "photoFade": "#2b2e36",
      "brandCredit": "rgba(233,184,36,0.7)",
      "brandCreditLight": "#8a6200",
      "surfaceField": "#fffaf0",
      "plateField": "#363941",
      "mapLand": "#e6dcc4",
      "mapLand2": "#dbcfb2",
      "mapSea": "#aebbbd",
      "mapRoad": "#2a2723",
      "mapLabel": "#3d3830",
      "stampInk66": "#c8322b",
      "stampInk34": "#6b3fa0",
      "stampInk31": "#131417",
      "stampInk11": "#2f5fb8",
      "stampInkDefault": "#b42b24",
      "statusWaitlistOnPlate": "#7fa6ff"
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
      "embossBar": "none",
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
      "marquage": "repeating-linear-gradient(170deg, transparent 0 104px, rgba(19,20,23,0.30) 104px 112px)",
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
      "marquage": "repeating-linear-gradient(170deg, transparent 0 190px, rgba(243,235,221,0.18) 190px 200px)",
      "vignette": "radial-gradient(ellipse 130% 90% at 55% 25%, #17191e 0, #101216 62%, #050608 125%)",
      "battleLamp": "radial-gradient(ellipse 74% 34% at 104% -4%, rgba(255,204,92,0.55), transparent 100%)",
      "battleSpill": "radial-gradient(ellipse 100% 58% at 100% 0%, rgba(233,184,36,0.22), transparent 72%)",
      "battleRim": "radial-gradient(ellipse 95% 60% at -4% 108%, rgba(110,130,175,0.12), transparent 70%)"
    },
    "sable": {
      "halo": "none",
      "reflet": "none",
      "faisceau": "linear-gradient(170deg, transparent 0 36%, rgba(19,20,23,0.16) 36% 56%, transparent 56%)",
      "marquage": "repeating-linear-gradient(170deg, transparent 0 190px, rgba(19,20,23,0.30) 190px 200px)",
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
      "fontSize": 15,
      "lineHeight": 18,
      "fontWeight": 900,
      "fontStyle": "normal",
      "letterSpacing": 0.02,
      "fontStretch": null,
      "sample": "MODE JOUR J"
    },
    "tab": {
      "family": "display",
      "fontSize": 9,
      "lineHeight": 11,
      "fontWeight": 900,
      "fontStyle": "normal",
      "letterSpacing": 0.04,
      "fontStretch": null,
      "sample": "ACCÈS"
    },
    "label": {
      "family": "narrow",
      "fontSize": 11,
      "lineHeight": 14,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.1,
      "fontStretch": null,
      "sample": "PROCHAIN ACCÈS · J-2"
    },
    "meta": {
      "family": "narrow",
      "fontSize": 12,
      "lineHeight": 15,
      "fontWeight": 700,
      "fontStyle": "normal",
      "letterSpacing": 0.08,
      "fontStretch": null,
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
      "fontStretch": null,
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
      "fontStretch": "62.5%",
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
    "kind": "added",
    "group": "color",
    "name": "plate-field",
    "value": {
      "beton": "#363941",
      "sable": "#363941"
    },
    "why": "champ et fond graphite clair dans une plaque, sous plate-ink (ancienne valeur de surface-raised, devenue claire en Sable)"
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
      "fontStretch": "62.5%",
      "basedOn": "number"
    },
    "why": "Chiffres des cartes véhicule, compteurs, souches de date : Archivo à 62,5 % de largeur (v2)."
  }
] as const;
