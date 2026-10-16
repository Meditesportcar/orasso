// Jeu d'icônes d'Orasso : 32 pictogrammes de docs/design-system/components/Icons, grille de 24 px, trait de 2 px,
// coins et bouts arrondis. Les formes sont des données (pas du DOM) : le site les rend en <svg>, l'appli en
// react-native-svg. Noms en anglais (code) ; le nom du README est donné en commentaire.
// Ajouts hors des 32 (README : « jeu à compléter au développement ») : live (Direct, prototype), eye, eyeOff
// (affichage du mot de passe, README Field).

export type IconShape =
  | readonly ["path", { readonly d: string }]
  | readonly ["circle", { readonly cx: number; readonly cy: number; readonly r: number }]
  | readonly [
      "rect",
      {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly rx?: number;
      },
    ];

const p = (d: string): IconShape => ["path", { d }];
const c = (cx: number, cy: number, r: number): IconShape => ["circle", { cx, cy, r }];
const r = (x: number, y: number, width: number, height: number, rx?: number): IconShape => [
  "rect",
  rx === undefined ? { x, y, width, height } : { x, y, width, height, rx },
];

const crew = [c(9, 9, 3), c(17, 9, 3), p("M2 20a7 7 0 0114 0M12 20a6 6 0 0110-4")];

export const iconShapes = {
  qr: [r(3, 3, 7, 7), r(14, 3, 7, 7), r(3, 14, 7, 7), p("M14 14h3v3h-3zM20 14v6h-6v-3")], // qr
  vehicle: [p("M3 13l2-5h14l2 5v6H3z"), c(7, 17, 1.5), c(17, 17, 1.5)], // véhicule
  home: [p("M4 11l8-7 8 7v9H4z")], // accueil
  explore: [c(12, 12, 8), p("M15 9l-2 6-4 2 2-6z")], // explorer
  inbox: [p("M4 6h16v10H8l-4 4z")], // boîte
  search: [c(11, 11, 7), p("M20 20l-4-4")], // recherche
  bell: [p("M6 17V11a6 6 0 0112 0v6l2 2H4z"), p("M10 21h4")], // cloche
  next: [p("M5 12h14M13 6l6 6-6 6")], // suivant
  check: [p("M5 12l5 5 9-10")], // retenir · ok
  close: [p("M6 6l12 12M18 6L6 18")], // refuser · fermer
  wait: [c(12, 12, 9), p("M12 7v5l3 2")], // attente
  undo: [p("M9 14L4 9l5-5"), p("M4 9h11a5 5 0 010 10h-3")], // annuler
  add: [p("M12 5v14M5 12h14")], // ajouter · suivre
  heart: [p("M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z")], // favori
  share: [c(18, 5, 2.5), c(6, 12, 2.5), c(18, 19, 2.5), p("M8 11l8-5M8 13l8 5")], // partager
  calendar: [r(3, 5, 18, 16, 2), p("M3 10h18M8 3v4M16 3v4")], // agenda
  place: [p("M12 21s-6-6-6-11a6 6 0 0112 0c0 5-6 11-6 11z"), c(12, 10, 2)], // lieu · itinéraire
  entry: [p("M4 12h12M11 7l5 5-5 5M20 4v16")], // entrée
  phone: [p("M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z")], // appeler
  instagram: [r(3, 3, 18, 18, 5), c(12, 12, 4), c(17.5, 6.5, 1)], // instagram
  plate: [r(2, 7, 20, 10, 2), p("M6 12h3M11 12h7")], // plaque
  express: [p("M13 2L4 14h7l-1 8 9-12h-7z")], // express (réservée : inscription express)
  skip: [p("M5 4l10 8-10 8z"), p("M19 4v16")], // sans scan
  list: [p("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01")], // liste
  incident: [p("M4 20l4-1 11-11-3-3L5 16z")], // incident
  chat: [p("M4 5h16v11H9l-5 4z")], // discussion
  alert: [p("M12 3l10 18H2z"), p("M12 10v5M12 18h.01")], // alerte (réservée : rouge, staff et annulation)
  back: [p("M15 5l-7 7 7 7")], // retour
  export: [p("M12 3v12M7 8l5-5 5 5M5 14v6h14v-6")], // exporter
  profile: [c(12, 8, 4), p("M4 21a8 8 0 0116 0")], // profil
  crew, // crew
  grade: [p("M12 3l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.5 9.1l5.9-.8z")], // grade (réservée : points)
  staff: crew, // onglet Staff de l'organisateur (prototype) : même pictogramme que crew
  live: [p("M3 12h4l3-7 4 14 3-7h4")], // Direct (prototype)
  eye: [p("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"), c(12, 12, 3)], // afficher le mot de passe
  eyeOff: [p("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"), c(12, 12, 3), p("M4 4l16 16")],
  // Météo (lot 28, ajout daté dans docs/design-system/README.md) : même grille, même trait, aucune couleur propre.
  weatherClear: [
    c(12, 12, 4),
    p("M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"),
  ],
  weatherPartlyCloudy: [
    c(8, 8, 3),
    p("M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"),
    p("M9 20h8.5a3.5 3.5 0 00.3-7 5 5 0 00-9.4 1A3 3 0 009 20z"),
  ],
  weatherCloudy: [p("M7 19h10.5a4 4 0 00.4-8 6 6 0 00-11.5 1.6A3.2 3.2 0 007 19z")],
  weatherFog: [p("M7 13h10.5a4 4 0 00.4-8 6 6 0 00-11.5 1.6A3.2 3.2 0 007 13z"), p("M4 17h16M7 21h10")],
  weatherDrizzle: [
    p("M7 14h10.5a4 4 0 00.4-8 6 6 0 00-11.5 1.6A3.2 3.2 0 007 14z"),
    p("M8 18v.01M12 19v.01M16 18v.01"),
  ],
  weatherRain: [
    p("M7 14h10.5a4 4 0 00.4-8 6 6 0 00-11.5 1.6A3.2 3.2 0 007 14z"),
    p("M8 17l-1 3M12 17l-1 3M16 17l-1 3"),
  ],
  weatherHeavyRain: [
    p("M7 13h10.5a4 4 0 00.4-8 6 6 0 00-11.5 1.6A3.2 3.2 0 007 13z"),
    p("M7 16l-1.5 4M11 16l-1.5 4M15 16l-1.5 4M19 16l-1.5 4"),
  ],
  weatherSnow: [
    p("M7 14h10.5a4 4 0 00.4-8 6 6 0 00-11.5 1.6A3.2 3.2 0 007 14z"),
    p("M8 18v.01M12 18v.01M16 18v.01M10 21v.01M14 21v.01"),
  ],
  weatherThunderstorm: [
    p("M7 13h10.5a4 4 0 00.4-8 6 6 0 00-11.5 1.6A3.2 3.2 0 007 13z"),
    p("M12.5 12l-3 4.5h4l-2.5 4.5"),
  ],
  weatherWind: [p("M3 8h10a2.5 2.5 0 10-2.5-2.5M3 12h15a3 3 0 11-3 3M3 16h7a2 2 0 11-2 2")],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof iconShapes;
export const iconNames = Object.keys(iconShapes) as IconName[];

/** Icône de chaque condition météo de `@orasso/shared` (`WeatherCode`), lot 28. */
export const weatherIcons = {
  clear: "weatherClear",
  partly_cloudy: "weatherPartlyCloudy",
  cloudy: "weatherCloudy",
  fog: "weatherFog",
  drizzle: "weatherDrizzle",
  rain: "weatherRain",
  heavy_rain: "weatherHeavyRain",
  snow: "weatherSnow",
  thunderstorm: "weatherThunderstorm",
  wind: "weatherWind",
} as const satisfies Record<string, IconName>;

/** Icônes réservées à un usage précis (README Icons) : à ne pas employer ailleurs. */
export const reservedIcons = {
  alert: "alerte rouge : mode staff et annulation",
  express: "inscription express seulement",
  grade: "points et grades seulement",
} as const;
