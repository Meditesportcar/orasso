import type { MainProfile } from "../enums";

// Tutos par profil (lot 42) : textes exacts du prototype DA v2 (`s-tuto`, une diapo = un jour, un titre, un texte).
// Tout au « tu », sans genre. Les valeurs de points (+40, +20, +60, Sport 1 280, Circuit 1 760) sont illustratives :
// le barème est « en discussion » (docs/01) et les tutos ne promettent rien (journal des choix, lot 42).

export const tutoLabels = {
  skip: "Passer",
  next: "Suivant",
  previous: "Précédent",
  start: "C'est parti",
  /** Libellé accessible de la progression : « Diapo 2 sur 7 ». */
  progress: (index: number, total: number) => `Diapo ${index} sur ${total}`,
  slidesCount: (total: number) => (total > 1 ? `${total} diapos` : "1 diapo"),
  /** Mon profil › Aide. */
  replay: "Revoir le tuto",
  replayHint: "Un tour de ton espace, diapo par diapo.",
  replayChoose: "Pour quel profil ?",
} as const;

/** Le nom du profil dans le choix « Revoir le tuto » (les tuiles de l'arrivée). */
export const tutoProfileNames: Record<MainProfile, string> = {
  exhibitor: "Exposant",
  visitor: "Visiteur",
  pro: "Pro de l'auto",
  organizer: "Organisateur",
  provider: "Prestataire",
  media: "Média",
};

export type TutoSlideText = { day: string; title: string; text: string };

const social = {
  exhibitor: {
    day: "Entre deux sorties",
    title: "Tu retrouves ta bande",
    text: "Explorer montre aussi les personnes et les crews du coin. Tu suis d'autres passionnés, tu rejoins un crew, vous vous écrivez et vous candidatez ensemble.",
  },
  visitor: {
    day: "Entre deux sorties",
    title: "Tu retrouves ta bande",
    text: "Explorer montre aussi les personnes et les crews du coin. Tu suis d'autres passionnés et tes crews préférés, vous vous écrivez, et tu vois qui va où.",
  },
} as const;

/** Les diapos de chaque profil, dans l'ordre : exposant 7, visiteur 6, pro 4, organisateur 6, prestataire 4, média 4. */
export const tutoSlides: Record<MainProfile, readonly TutoSlideText[]> = {
  exhibitor: [
    {
      day: "Mardi soir, tu scrolles",
      title: "Tu trouves un rasso",
      text: "Explorer liste tout ce qui se passe autour de toi, du plus proche au plus loin.",
    },
    {
      day: "Mercredi",
      title: "Tu candidates avec ta voiture",
      text: "Tu choisis ta voiture dans ton garage, tu acceptes le règlement de l'événement et tu envoies. Ensuite, c'est l'organisateur qui choisit les voitures et la zone de chacune.",
    },
    {
      day: "Jeudi",
      title: "Ta voiture est retenue",
      text: "Tu reçois ton accès, ton créneau d'arrivée et les consignes. Tout est dans Sorties.",
    },
    {
      day: "Samedi, 18 h 52",
      title: "On te guide jusqu'à ta place",
      text: "À l'entrée, le staff scanne ton QR, même sans réseau. L'appli te montre ta zone et le chemin jusqu'à ta place.",
    },
    {
      day: "Lundi, J+2",
      title: "Des points et des souvenirs",
      text: "Ta présence est pointée : des points vers le grade suivant. Le tampon de la Nocturne et les photos de l'événement restent dans ton passeport.",
    },
    {
      day: "Toute la saison",
      title: "Tes points t'ouvrent des remises",
      text: "Plus tu participes, plus ton grade monte. Tu trouves les pros du coin (garage, prépa, detailing) et tu montres ton QR de compte en boutique : la remise de ton grade s'applique.",
    },
    social.exhibitor,
  ],
  visitor: [
    {
      day: "Vendredi midi, tu cherches une sortie",
      title: "Tu trouves une expo",
      text: "Explorer liste les rassemblements et les expos autour de toi. Pas besoin de voiture pour venir voir celles des autres.",
    },
    {
      day: "Vendredi, 12 h 05",
      title: "Tu réserves ton entrée",
      text: "Une entrée public en deux touches. Ton billet, avec ton QR, t'attend dans Sorties.",
    },
    {
      day: "Samedi, 19 h 10",
      title: "Un scan, un tampon",
      text: "À l'entrée, ton QR passe, même sans réseau. Le tampon de la Nocturne tombe dans ton passeport.",
    },
    {
      day: "Samedi, 21 h",
      title: "Tu votes pour ta préférée",
      text: "Prix du public : une voix par personne pointée à l'entrée. Le classement bouge en direct.",
    },
    {
      day: "Toute la saison",
      title: "Tes points t'ouvrent des remises",
      text: "Chaque entrée pointée te rapporte des points. Ton grade monte et te donne des remises chez les pros du coin : tu montres ton QR de compte en boutique.",
    },
    social.visitor,
  ],
  pro: [
    {
      day: "Lundi, tu ouvres Orasso",
      title: "Tu montes la fiche de ton atelier",
      text: "Activités, zone, réalisations et surtout tes remises par grade : ta fiche se remplit en quelques touches.",
    },
    {
      day: "Mercredi",
      title: "Les passionnés du coin te trouvent",
      text: "Ta fiche apparaît dans Explorer, sur la carte et dans la recherche de pros, avec la remise de chaque grade.",
    },
    {
      day: "Samedi, 10 h",
      title: "Un scan, la remise",
      text: "Un client montre son QR de compte, tu le scannes : grade vérifié, la remise s'affiche. Une capture d'écran ne passe pas, le code change sans cesse.",
    },
    {
      day: "Fin du mois",
      title: "Tu vois ce que ça rapporte",
      text: "Vues de ta fiche, remises accordées, clics vers ton site : tes statistiques, grade par grade.",
    },
  ],
  organizer: [
    {
      day: "Septembre, au local de l'asso",
      title: "Tu crées ton événement",
      text: "L'assistant te guide en huit temps : format, adresse, arrivées, critères, règlement… et l'affiche se génère toute seule, en plusieurs styles.",
    },
    {
      day: "Octobre, 148 candidatures",
      title: "Tu tries d'un geste",
      text: "Une carte par candidature : photos, véhicule, grade, historique. Retenue, liste d'attente ou refus, et chacun est prévenu.",
    },
    {
      day: "La semaine d'avant",
      title: "Tu places ton équipe",
      text: "Tes bénévoles en bulles : la taille dit l'engagement. Un rôle par événement (entrée, parking, accueil) et chacun reçoit ses consignes.",
    },
    {
      day: "Vendredi, la veille",
      title: "Tu préviens tout le monde",
      text: "Orasso surveille la météo et te conseille « Incertain » si elle tourne. Maintenu, incertain ou annulé : tous les inscrits reçoivent la notification, comme tes annonces (horaires, prévention, station la plus proche).",
    },
    {
      day: "Samedi, 18 h 40",
      title: "Le jour J, en direct",
      text: "Les scans de ton staff arrivent en direct, même hors ligne : entrées, zones, retards. Tout se synchronise quand le réseau revient.",
    },
    {
      day: "Lundi, J+2",
      title: "Les points partent tout seuls",
      text: "Le pointage de ton staff fait foi : chaque présent reçoit ses points, l'absent non excusé un malus. La personne peut contester, c'est toi qui tranches.",
    },
  ],
  provider: [
    {
      day: "Lundi, tu cherches des dates",
      title: "Tu trouves une mission",
      text: "Missions liste les événements qui cherchent un food truck, une animation ou un stand près de chez toi, selon ton métier.",
    },
    {
      day: "Lundi, 14 h",
      title: "Tu proposes ta prestation",
      text: "Ta vitrine part avec ta candidature : photos, menu, besoins en électricité. L'organisateur choisit qui vient.",
    },
    {
      day: "Jeudi, ta candidature est retenue",
      title: "Ton emplacement t'attend",
      text: "Tu reçois ton emplacement, ton heure d'arrivée et les consignes. Ton QR d'accès marche sans réseau.",
    },
    {
      day: "Lundi, J+2",
      title: "Les avis font ta vitrine",
      text: "L'organisateur laisse un avis. Ta vitrine affiche tes événements et tes notes : les missions suivantes viennent plus vite.",
    },
  ],
  media: [
    {
      day: "Dimanche, tu prépares ton mois",
      title: "Tu repères quoi couvrir",
      text: "Explorer cherche dans toute la France, accréditation ouverte en tête. Tu gardes ceux que tu veux couvrir dans ton agenda.",
    },
    {
      day: "Lundi",
      title: "Tu demandes ton accréditation",
      text: "Ta carte média part à l'organisation : ta chaîne, ce que tu filmes, où tu publies. L'organisation valide ou refuse.",
    },
    {
      day: "Samedi, 18 h",
      title: "Badge presse et zones photo",
      text: "Ton badge presse, un QR qui change sans cesse, ouvre les zones réservées. Les consignes disent où et quand filmer.",
    },
    {
      day: "Mardi",
      title: "Tes vidéos mises en avant",
      text: "Tu déposes tes liens et ta galerie. La page de l'événement les met en avant, les participants les retrouvent.",
    },
  ],
};

/**
 * Les textes DANS les illustrations (cartes, étiquettes, listes d'exemple). Ce sont des exemples de l'écran, pas des
 * données : Nocturne de Canet, Kenji_66, Atelier Têt Detailing… comme dans le prototype.
 */
export const tutoArt = {
  /** Descriptions des illustrations pour les lecteurs d'écran (une phrase par diapo, les exemples ne sont pas lus). */
  alt: {
    find: "Explorer : un événement près de toi",
    findPublic: "Explorer : une expo près de toi",
    apply: "Candidature : choisir sa voiture dans le garage, cocher le règlement, envoyer",
    qrTicket: "QR du billet (exemple)",
    qrAccount: "QR de compte (exemple)",
    qrBadge: "QR du badge presse (exemple)",
  },
  /** Le département montré dans les exemples d'Explorer. */
  department: "66",
  departments: "66 · 11",
  initials: { a: "IN", b: "KE", c: "MA" },
  event: { month: "OCT", weekday: "SAM", day: "24", title: "Nocturne de Canet" },
  eventMeta: "MéditeSportCar · 12 km",
  eventMetaPublic: "MéditeSportCar · 12 km · ouvert au public",
  garage: {
    kicker: "Ton garage",
    car: "Toyota GR Supra",
    rule: "J'ai lu le règlement de l'événement et je l'accepte.",
    send: "Envoyer ma candidature",
    sent: "Candidature envoyée",
    wait: "En attente",
    retained: "Retenue",
    waitlist: "Liste d'attente",
  },
  accepted: { qrLabel: "QR d'accès (exemple)", note: "MéditeSportCar a retenu la Supra pour la zone JDM" },
  parking: {
    label: "Scan à l'entrée, puis ta Supra suit le chemin jusqu'à ta place en zone JDM",
    scan: "Scan OK · zone JDM",
    zoneJdm: "Zone JDM",
    zoneEuro: "Zone Euro",
    entry: "Entrée",
    place: "Ta place",
  },
  souvenir: {
    passport: "Passeport · 2026",
    stampLabel: "Tampon de la Nocturne de Canet",
    photoA: "Nocturne de Canet",
    photoB: "Zone JDM",
    counted: "Participation pointée",
    plus: "+40 pts",
    sport: "Sport · 1 280 pts",
    circuit: "Circuit à 1 760",
  },
  grade: {
    kicker: "Ton grade · saison 2026",
    name: "Sport",
    steps: ["Rodage", "Route", "Sport", "Circuit", "Légende"],
    search: "Pros près de toi · Perpignan",
    pros: [
      { logo: "AT", name: "Atelier Têt Detailing", meta: "Detailing · 3,2 km", discount: "−10 %" },
      { logo: "MC", name: "Méca Canet", meta: "Garage · 6 km", discount: "−8 %" },
      { logo: "RC", name: "Roussillon Covering", meta: "Covering · 9 km", discount: "−10 %" },
    ],
    scanned: "QR scanné · grade Sport · −10 %",
  },
  social: {
    kicker: "Personnes et crews · autour de toi",
    crew: { logo: "TN", name: "Têt Nights", meta: "Crew · 9 membres · 3 sorties ce mois" },
    join: "Rejoindre",
    requested: "Demande envoyée",
    follow: "Suivre",
    followed: "Suivi",
    person: { logo: "IN", name: "Inès_34", meta: "Nissan GT-R · grade Route" },
    chatFrom: "Inès_34",
    chatA: "Tu viens à la Nocturne ? On monte ensemble depuis Perpignan ?",
    chatB: "Carrément, départ 18 h au rond-point de la Têt.",
    friends: "3 personnes que tu suis vont à la Nocturne de Canet",
  },
  visitor: {
    publicEntry: "Entrée public",
    free: "Gratuite",
    dates: "Sam. 24 oct. · 18 h – 23 h 30",
    reserve: "Réserver mon entrée",
    ticketFor: "Entrée public · Léa_66",
    inOutings: "Dans Sorties",
    scanOk: "Scan OK",
    passport: "Passeport · 2026",
    voteKicker: "Prix du public · en direct",
    oneVote: "1 voix",
    ranking: [
      { name: "Mazda RX-8 · Marco_11", votes: 41, width: 82 },
      { name: "Toyota GR Supra · Kenji_66", votes: 42, width: 76 },
      { name: "Nissan GT-R · Inès_34", votes: 25, width: 50 },
    ],
    yourVote: "Ta voix compte · Supra en tête",
  },
  pro: {
    sheet: { logo: "AT", name: "Atelier Têt Detailing", meta: "Perpignan · zone : tout le 66" },
    chips: ["Detailing", "Céramique", "Covering", "Rénovation phares"],
    discounts: "Tes remises par grade",
    grades: [
      { name: "Rodage", value: "5 %", width: 33 },
      { name: "Route", value: "8 %", width: 53 },
      { name: "Sport", value: "10 %", width: 67 },
      { name: "Circuit+", value: "15 %", width: 100 },
    ],
    found: { meta: "Detailing · 3,2 km · −10 % grade Sport", favorite: "Garage favori de Kenji_66" },
    scan: {
      off: "−10 %",
      verified: "Grade Sport vérifié",
      client: "Kenji_66 · Toyota GR Supra",
      applied: "Remise appliquée",
    },
    stats: {
      views: "Vues de la fiche",
      discounts: "Remises",
      byGrade: "Remises par grade · octobre",
      grades: [
        { name: "Rodage", value: "6", width: 43 },
        { name: "Route", value: "14", width: 100 },
        { name: "Sport", value: "12", width: 86 },
        { name: "Circuit+", value: "5", width: 36 },
      ],
      growth: "+18 % de vues ce mois",
    },
  },
  organizer: {
    fieldLabel: "Titre de l'événement",
    typed: "Nocturne de Canet",
    posterWord: "Canet",
    published: "Publiée · 60 places exposants",
    retained: "Retenues",
    waitlist: "Liste d'attente",
    cardA: { name: "Nissan GT-R", meta: "Inès_34" },
    cardB: { name: "BMW E30 325i", meta: "Marco_11 · Route · 2 événements" },
    cardC: { name: "Toyota GR Supra", meta: "Kenji_66 · Sport · 6 événements · zone JDM" },
    team: { kicker: "Équipe · Nocturne de Canet", volunteers: "12 bénévoles", roles: ["Entrée", "Parking", "Accueil"] },
    weather: {
      title: "Météo samedi : averses 19 h – 21 h",
      meta: "Rafales à 50 km/h · Orasso te conseille « Incertain »",
      segments: ["Maintenu", "Incertain", "Annulé"],
      notifs: [
        { small: "Nocturne de Canet · maintenant", text: "Incertain : décision samedi à 14 h, la météo hésite." },
        { small: "Annonce de MéditeSportCar", text: "Musique coupée à 22 h. Animation drift à 21 h." },
        { small: "Avant de partir", text: "Station la plus proche : Canet-Plage, à 900 m, ouverte jusqu'à 22 h." },
      ],
      sent: "Envoyé aux",
      sentTail: "inscrits",
    },
    live: {
      entered: "Entrés",
      offline: "Hors ligne · scans en mémoire",
      zones: [
        { name: "JDM", value: "28/30", width: 93 },
        { name: "Euro", value: "21/30", width: 70 },
        { name: "US", value: "14/20", width: 70 },
        { name: "Public", value: "24/40", width: 60 },
      ],
      scans: [
        { text: "Scan OK · Toyota GR Supra · JDM", meta: "Entrée nord · Thomas · 18 h 41", ok: true },
        { text: "Scan OK · BMW E30 325i · Euro", meta: "Entrée nord · Thomas · 18 h 42", ok: true },
        { text: "Retard signalé · Golf GTI", meta: "Arrivée prévue 19 h 30", ok: false },
      ],
    },
    points: {
      done: "Pointage terminé",
      present: "présents pointés",
      rows: [
        { name: "Kenji_66", meta: "Exposant · zone JDM", tag: "+40 pts", accent: true },
        { name: "Léa_66", meta: "Entrée public", tag: "+20 pts", accent: true },
        { name: "Marco_11", meta: "Retenue, absence sans désistement", tag: "Malus", accent: false },
      ],
      sent: "Points envoyés, rien à saisir",
    },
  },
  provider: {
    trades: ["Food truck", "Animation", "Stand", "Barbier"],
    missions: [
      {
        weekday: "SAM",
        day: "24",
        month: "OCT",
        name: "Nocturne de Canet",
        meta: "Cherche 1 food truck · 12 km",
        places: "1 place",
      },
      {
        weekday: "DIM",
        day: "07",
        month: "NOV",
        name: "Expo Rivesaltes",
        meta: "Cherche 2 food trucks · 18 km",
        places: "2 places",
      },
      {
        weekday: "SAM",
        day: "14",
        month: "NOV",
        name: "Run de Collioure",
        meta: "Cherche 1 food truck · 31 km",
        places: "1 place",
      },
    ],
    showcase: {
      name: "La Brasa",
      meta: "Grillades catalanes · food truck",
      chips: ["Électricité 16 A", "Menu 8 à 12 €", "2 personnes"],
    },
    propose: "Proposer La Brasa",
    spot: { chips: ["Emplacement B2", "Arrivée 16 h", "Électricité 16 A"], food: "Food", entry: "Entrée" },
    review: {
      from: "MéditeSportCar",
      meta: "a laissé un avis · Nocturne de Canet",
      quote: "« File bien gérée, service rapide jusqu'à la fin. On la reprend. »",
      events: "Événements",
      note: "Note",
      noteValue: "4,9",
      noteMax: "/ 5",
    },
  },
  media: {
    agenda: "Agenda · octobre",
    week: [
      { d: "L", n: "19" },
      { d: "M", n: "20" },
      { d: "M", n: "21" },
      { d: "J", n: "22" },
      { d: "V", n: "23" },
      { d: "S", n: "24" },
      { d: "D", n: "25" },
    ],
    items: [
      { name: "Nocturne de Canet", meta: "Sam. 24 · rassemblement · MéditeSportCar" },
      { name: "Balade du Conflent", meta: "Dim. 25 · balade · Têt Classic Club" },
    ],
    kept: "Gardé dans ton agenda",
    request: {
      accredited: "Accréditation validée",
      card: { logo: "SC", name: "Sud Cars · Léo", meta: "YouTube · 48 k abonnés · vidéaste" },
      chips: ["Vidéo", "Photo", "Presse écrite"],
      send: "Demander l'accréditation",
    },
    badge: {
      band: "PRESSE",
      name: "Léo · Sud Cars",
      meta: "Nocturne de Canet · sam. 24 oct.",
      renew: "Nouveau code toutes les 20 s",
      zones: [
        { name: "Zone piste", meta: "19 h – 21 h · gilet presse", yes: true },
        { name: "Paddock", meta: "Libre toute la soirée", yes: true },
        { name: "Entrée des exposants", meta: "Pas pendant les arrivées (18 h 30 – 19 h 15)", yes: false },
      ],
    },
    publish: {
      sending: "Envoi · 3 vidéos, 24 photos",
      done: "Terminé",
      seenBy: "Vu par Sud Cars",
      views: "vues depuis la page",
    },
  },
} as const;
