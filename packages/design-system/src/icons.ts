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
  // Lot C1 : symboles de l'artefact DA v2 (`#i-edit`, `#i-lock`…), tracés repris tels quels (grille 24, trait 2).
  edit: [p("M4 20h4L19 9l-4-4L4 16zM14 6l4 4")], // modifier (crayon)
  lock: [r(5, 11, 14, 10, 2), p("M8 11V8a4 4 0 0 1 8 0v3")], // sécurité, cadenas
  shield: [p("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"), p("M9 12l2 2 4-4")], // confidentialité
  gear: [
    c(12, 12, 3),
    p("M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"),
  ], // réglages
  help: [c(12, 12, 9), p("M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01")], // aide
  logout: [p("M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10")], // se déconnecter
  trophy: [p("M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6")], // prix du public
  copy: [r(8, 8, 13, 13, 2), p("M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3")], // dupliquer, copier
  camera: [p("M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"), c(12, 13.5, 3.5)], // photo, prestataire
  // « … » (`#i-dots` de l'artefact : trois points au trait de 3,4) : cercles de rayon 0,7 au trait de 2 = 3,4 de diamètre.
  more: [c(5, 12, 0.7), c(12, 12, 0.7), c(19, 12, 0.7)], // plus d'actions
  spark: [p("M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6")], // nouveauté, `#i-spark`
  star: [p("M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z")], // avis, `#i-star`
  truck: [
    p("M2 17V7a1 1 0 0 1 1-1h11v11"),
    p("M14 10h4l3 3.5V17h-2"),
    p("M5 9h6v3H5z"),
    p("M4 6l1.2-2h8.6L15 6"),
    c(6.5, 17.5, 1.8),
    c(17, 17.5, 1.8),
    p("M8.3 17.5h6.9"),
  ], // food truck, prestataire, `#i-truck`
  // Lot M1 (ajout de véhicule, maquettes 1.1 à 1.7) : symboles de l'artefact DA v2 tels quels.
  moto: [c(5.5, 16, 3.5), c(18.5, 16, 3.5), p("M5.5 16l4-7h5l4 7M9.5 9H7M14 6h3l1.5 3")], // type moto (`s-vadd`)
  crop: [p("M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14")], // recadrer, `#i-crop`
  minus: [p("M5 12h14")], // dézoomer (le pendant de `add`)
  trash: [p("M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13")], // supprimer une photo, `#i-trash`
  // Puissance (`#i-bolt`) : motorisation, style Sportive et préparation Moteur ; l'éclair « express » reste réservé.
  power: [p("M13 2L4 14h7l-1 8 9-12h-7z")],
  layers: [p("M12 3l9 5-9 5-9-5zM3 13l9 5 9-5")], // suspension, Stance, `#i-layers`
  wrench: [p("M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z")], // Préparée
  drop: [p("M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z")], // covering, Origine, `#i-drop`
  rim: [c(12, 12, 7), c(12, 12, 2.5), p("M12 2v3M12 19v3M2 12h3M19 12h3")], // jantes (`#i-gps` de l'artefact)
  info: [c(12, 12, 9), p("M12 11v6M12 7.5h.01")], // explication, `#i-info`
  upload: [p("M12 16V4M7 9l5-5 5 5M4 20h16")], // envoyer des fichiers, `#i-upload`
  move: [p("M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3")], // glisser la photo (recadrage), `#i-moveo`
  hand: [
    p(
      "M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M17 10a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L4 15.5a1.6 1.6 0 0 1 2.5-2L8 15",
    ),
  ], // à la main, gestes à deux doigts, `#i-hand`
  // Lot R2 (maquette « Explorer R2 », 24/10/2026) : la ligne de pastilles de l'Explorer (tri ⇅, filtres) et la feuille
  // « Quel métier ? » (rouleau de peinture, siège, haut-parleur, grille « Tous les métiers ») ; ajout consigné dans le
  // journal des choix (lot R2).
  sort: [p("M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5")], // trier, `#i-sort`
  filter: [p("M4 6h16M7 12h10M10 18h4")], // filtres
  roller: [r(3, 3, 15, 6, 1.5), p("M18 6h3v5h-9v3"), r(10, 14, 4, 7, 1)], // carrosserie et peinture, `#i-roller`
  seat: [p("M7 3h4a2 2 0 0 1 2 2l-.8 8H18a2 2 0 0 1 2 2v3H6.2L5 5a2 2 0 0 1 2-2z"), p("M8 18v3M17 18v3")], // sellerie
  speaker: [r(5, 2, 14, 20, 2), c(12, 14, 4), c(12, 6.5, 1)], // audio et électronique, `#i-speaker`
  grid: [r(4, 4, 6, 6, 1.5), r(14, 4, 6, 6, 1.5), r(4, 14, 6, 6, 1.5), r(14, 14, 6, 6, 1.5)], // tous les métiers
  // Lot R5c1 (maquette R5.7, fil du crew) : la flamme, seule réaction d'une publication (`#i-fire` de la maquette).
  fire: [
    p(
      "M12 21c-3.8 0-6.4-2.6-6.4-6 0-3.3 2.2-5.2 3.5-7.6.4 1.5 1.1 2.6 2.3 3.3.2-2.9 1.7-5.4 3.9-7.2-.3 2.5.7 4.4 2.1 6.2 1.2 1.5 1.8 3 1.8 4.9 0 3.7-2.9 6.4-7.2 6.4z",
    ),
  ],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof iconShapes;

/**
 * Lot C1, tour 2 : parties remplies d'une icône quand son onglet est actif (`.fillme` des symboles de l'artefact :
 * l'aiguille de la boussole, le corps du ticket, la carrosserie, la tête du profil…). Une icône absente ne se remplit pas.
 */
export const iconFillParts: Partial<Record<IconName, readonly number[]>> = {
  explore: [1],
  ticket: [0],
  vehicle: [0],
  profile: [0],
  stamp: [0],
  briefcase: [0],
  calendar: [0],
  staff: [0],
  crew: [0],
  home: [0],
  cards: [0],
  express: [0],
  grade: [0],
};

/** Remplissage d'une partie : `filled === "parts"` ne remplit que les parties `.fillme` ; `true` remplit tout. */
export function shapeFilled(name: IconName, index: number, filled: boolean | "parts"): boolean {
  if (filled === "parts") return iconFillParts[name]?.includes(index) ?? false;
  return filled;
}
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

/** Lot R2 (feuille « Quel métier ? ») : l'icône de chaque métier d'une fiche pro (`proActivities` de `@orasso/shared`). */
export const proActivityIcons = {
  garage: "wrench",
  preparation: "power",
  detailing: "drop",
  covering: "layers",
  parts: "gear",
  tyres: "rim",
  bodywork: "roller",
  tint: "weatherClear",
  upholstery: "seat",
  audio: "speaker",
  inspection: "shield",
  other: "more",
} as const satisfies Record<string, IconName>;

/** Icônes réservées à un usage précis (README Icons) : à ne pas employer ailleurs. */
export const reservedIcons = {
  alert: "alerte rouge : mode staff et annulation",
  express: "inscription express seulement",
  grade: "points et grades seulement",
} as const;
