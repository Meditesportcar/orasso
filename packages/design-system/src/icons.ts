// Jeu d'icônes d'Orasso : 32 pictogrammes de docs/design-system/components/Icons, grille de 24 px, trait de 2 px,
// coins et bouts arrondis. Les formes sont des données (pas du DOM) : le site les rend en <svg>, l'appli en
// react-native-svg. Noms en anglais (code) ; le nom du README est donné en commentaire.
// Ajouts hors des 32 (README : « jeu à compléter au développement ») : live (Direct, prototype), eye, eyeOff
// (affichage du mot de passe, README Field) ; ajouts datés dans docs/design-system/README.md (météo, flag, accueil,
// barres des six profils de la DA v2).

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
  // Boîte : le bac à courrier de l'artefact DA v2 (`#i-inbox`, lot C1) ; l'ancien tracé était une bulle (= chat).
  // Itinéraire et carte (`#i-nav`, `#i-map` de l'artefact, lot C1) : la rangée d'itinéraires de la carte d'Accueil.
  nav: [p("M3 11l18-8-8 18-2-8z")],
  map: [p("M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"), p("M9 4v14M15 6v14")],
  inbox: [p("M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"), p("M3 13h5l1 3h6l1-3h5")], // boîte
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
  // Signaler (lot 32, ajout daté dans docs/design-system/README.md) : drapeau, même grille, même trait.
  flag: [p("M5 21V4"), p("M5 4h11l-2 4 2 4H5")],
  // Accueil (lot 30, ajout daté dans docs/design-system/README.md) : station-service, lavage (goutte), monter, descendre.
  fuel: [r(4, 3, 10, 18, 2), p("M7 8h4M14 9h2.5a1.5 1.5 0 011.5 1.5V16a1.5 1.5 0 003 0V8l-3-3"), p("M3 21h12")],
  wash: [p("M12 3s6 6.4 6 11a6 6 0 01-12 0c0-4.6 6-11 6-11z"), p("M9.5 15a2.5 2.5 0 002.5 2.5")],
  up: [p("M6 15l6-6 6 6")],
  down: [p("M6 9l6 6 6-6")],
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
  // Barres des six profils (lot 38, DA v2, ajout daté dans docs/design-system/README.md, écart 4) : même grille, même
  // trait, aucune couleur propre. Formes relevées dans le prototype v2 (ticket, tampon, mallette, image) ou dessinées.
  ticket: [
    p("M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"),
    p("M14.5 6.5v2M14.5 11v2M14.5 15.5v2"),
  ], // Sorties (candidatures, billets, missions)
  stamp: [p("M9 3h6l-1 7h4a2 2 0 012 2v3H4v-3a2 2 0 012-2h4z"), p("M4 20h16")], // Passeport
  send: [p("M21 3L10 14M21 3l-7 18-4-7-7-4z")], // Candidater (lot 44, prototype `s-event`)
  cards: [
    p("M7.7 3.1l11.9 1.7a2 2 0 011.7 2.2l-1.9 13a2 2 0 01-2.3 1.7L5.2 20a2 2 0 01-1.7-2.3l1.9-12.9a2 2 0 012.3-1.7z"),
    p("M4 7v12a2 2 0 002 2h9"),
  ], // Trier les candidatures (lot 44)
  briefcase: [r(3, 7, 18, 13, 2), p("M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18")], // Missions (prestataire)
  shop: [
    p("M4 9l1.5-5h13L20 9"),
    p("M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9"),
    p("M5 11v9h14v-9M10 20v-5h4v5"),
  ], // Vitrine
  press: [p("M4 5h13v14H6a2 2 0 01-2-2z"), p("M17 9h3v8a2 2 0 01-2 2"), p("M7 9h7M7 13h7M7 16h4")], // Presse (média)
  gallery: [r(3, 4, 18, 16, 2), c(9, 10, 2), p("M21 16l-5-5-9 9")], // Contenus (média), Vitrine
  badge: [c(12, 9, 6), p("M8.5 14L7 21l5-3 5 3-1.5-7")], // Structure (badge vérifié)
  o: [p("M12 4c5 0 9 3.6 9 8s-4 8-9 8-9-3.6-9-8 4-8 9-8z"), p("M8.5 13l7-2.5")], // le O (onglet central, sans la marque)
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
