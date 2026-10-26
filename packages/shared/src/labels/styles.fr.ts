// Libellés du lot R5a (maquettes R5.1 à R5.3) : listes de marques par type, styles rangés par famille, « Propose-le »,
// catalogue des styles de l'administration. Communs à l'appli et au site.
import type { VehicleType } from "../enums";
import type { CategoryFamily } from "../rules/styles";

export const categoryFamilyLabels: Record<CategoryFamily, string> = {
  epoque: "Époque",
  genre: "Genre",
  preparation: "Préparation",
  pratique: "Pratique",
  pays: "Pays",
};

const plural: Record<VehicleType, string> = { car: "voitures", moto: "motos", truck: "camions" };
const singular: Record<VehicleType, string> = { car: "voiture", moto: "moto", truck: "camion" };

export const styleLabels = {
  // R5.1 : la liste suit le type.
  makesOfType: (type: VehicleType) => `Marques de ${plural[type]}`,
  makesCount: (n: number) => `de A à Z, ${n}`,
  results: "Résultats",
  resultsCount: (n: number, type: VehicleType) => `${n} ${n > 1 ? plural[type] : singular[type]}`,
  modelsOf: (make: string) => `Modèles ${make}`,
  generationsOf: (model: string) => `Générations ${model}`,
  // R5.2 : styles par famille, « Propose-le ».
  categoriesText: "L'origine vient du pays de la marque. Choisis le reste : ce qui ne colle pas est grisé.",
  manyHint: "plusieurs choix",
  paused: "en pause",
  pausedHint: "Ce style n'est plus proposé ; il reste sur ta fiche tant que tu le gardes.",
  /** Tour 2 : un style de la fiche devenu refusé (« 4x4 » d'un camion). */
  keptNote: (label: string, reason: string) =>
    `${label} : ${reason.charAt(0).toLowerCase()}${reason.slice(1)} ; il reste sur ta fiche tant que tu le gardes.`,
  loadMore: "Charger la suite",
  proposeTitle: "Il manque un style ?",
  proposeText: "Propose-le : l'équipe Orasso l'ajoute pour tout le monde.",
  sheetTitle: "Proposer un style",
  nameField: "Nom du style",
  forType: "Pour",
  familyByTeam: "· famille au choix de l'équipe",
  /** « S'il est retenu, il est ajouté à ta Yamaha et tu es prévenu dans la Boîte. » */
  sheetNote: (vehicle: string | null, type: VehicleType) =>
    vehicle
      ? `L'équipe Orasso le regarde. S'il est retenu, il est ajouté à ${type === "truck" ? "ton" : "ta"} ${vehicle} et tu es prévenu dans la Boîte.`
      : "L'équipe Orasso le regarde. S'il est retenu, tu es prévenu dans la Boîte.",
  send: "Proposer",
  nameIssue: "Le nom du style fait 2 à 24 caractères.",
  toast: (label: string) => `Merci : « ${label} » est proposé à l'équipe Orasso.`,
  proposed: (label: string) => `« ${label} » proposé à l'équipe Orasso`,
  /** « Youngtimer et Ancien sont grisés : ton camion est de 2008. » */
  dimmed: (labels: string[], noun: string, year: number, masculine: boolean) => {
    const e = masculine ? "" : "e";
    return labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)} sont grisé${e}s : ${noun} est de ${year}.`
      : `${labels[0] ?? ""} est grisé${e} : ${noun} est de ${year}.`;
  },
  preparedChecked: (label: string, masculine: boolean) =>
    `${label} est coché${masculine ? "" : "e"} car tu as indiqué une préparation.`,
  // R5.3 : catalogue des styles (administration).
  adminTab: "Styles",
  adminTabCount: (n: number) => (n > 0 ? `Styles · ${n} proposé${n > 1 ? "s" : ""}` : "Styles"),
  baseTab: "Marques et modèles",
  adminIntro:
    "Glisser une ligne change l'ordre dans l'appli et sur le site. Un style en pause ne se propose plus ; il reste sur les véhicules qui l'ont déjà.",
  adminIntroApp:
    "Les flèches changent l'ordre dans l'appli et sur le site. Un style en pause ne se propose plus ; il reste sur les véhicules qui l'ont déjà.",
  typeTab: (type: VehicleType, n: number) => `${singular[type][0]?.toUpperCase()}${singular[type].slice(1)} · ${n}`,
  addStyle: "Ajouter un style",
  addStyleTo: (type: VehicleType) => `Ajouter un style aux ${plural[type]}`,
  edit: "Modifier",
  save: "Enregistrer",
  cancel: "Annuler",
  pause: "Mettre en pause",
  resume: "Réactiver",
  active: "Actif",
  pausedState: "En pause",
  up: "Monter",
  down: "Descendre",
  styleCount: (n: number) => `${n} style${n > 1 ? "s" : ""}`,
  vehicles: (n: number) => (n > 0 ? `${n} véhicule${n > 1 ? "s" : ""}` : "aucun véhicule"),
  ageRule: (n: number | null) => (n ? `${n} ans et plus` : "—"),
  makesRule: "marques choisies",
  countriesRule: "déduit de la marque",
  sharedWith: (types: string) => `Commun : ${types}`,
  fieldLabel: "Nom",
  fieldLabelM: "Au masculin (camion), facultatif",
  fieldFamily: "Famille",
  fieldIcon: "Icône",
  fieldAge: "Âge minimal (ans), facultatif",
  pausedFamily: "En pause",
  countriesFamily: "Pays (déduits de la marque)",
  // File des propositions.
  queueTitle: "Styles proposés",
  queueCount: (n: number) => `${n} proposition${n > 1 ? "s" : ""}`,
  queueEmpty: "Rien à traiter.",
  queueGroup: (types: string, variants: string, since: string) => `${types} · ${variants} · ${since}`,
  queueWithVehicle: (n: number) =>
    n > 0
      ? `Ajouté ou rattaché : le style est posé sur ${n > 1 ? `les ${n} véhicules` : "le véhicule"} du proposant si les règles l'acceptent, et chaque proposant est prévenu.`
      : "Chaque proposant est prévenu dans sa Boîte.",
  queueExisting: (label: string) => `Existe déjà : ${label}`,
  familyAndIcon: "Famille et icône",
  accept: "Ajouter au catalogue",
  merge: "Rattacher à…",
  mergeTo: "Style existant",
  mergeConfirm: "Rattacher",
  decline: "Refuser",
  declineTitle: "Refuser cette proposition ?",
  declineBody: "Chaque proposant est prévenu dans sa Boîte.",
  open: "Ouvrir",
  done: "C'est fait. L'action est écrite au journal d'administration.",
  sinceDays: (days: number) => (days <= 0 ? "depuis aujourd'hui" : days === 1 ? "depuis hier" : `depuis ${days} j`),
  typesList: (types: readonly VehicleType[]) =>
    types.map((t) => `${singular[t][0]?.toUpperCase()}${singular[t].slice(1)}`).join(", "),
};

/** Libellé d'une icône de style (choix de l'admin, lecteurs d'écran). */
export const categoryIconLabels: Record<string, string> = {
  wait: "Horloge",
  star: "Étoile",
  power: "Éclair",
  spark: "Étincelle",
  trophy: "Trophée",
  weatherClear: "Soleil",
  vehicle: "Voiture",
  moto: "Moto",
  truck: "Camion",
  mount: "Montagne",
  explore: "Boussole",
  map: "Carte",
  home: "Maison",
  drop: "Goutte",
  wrench: "Clé",
  layers: "Calques",
  undo: "Flèche retour",
  weatherWind: "Vent",
  flag: "Drapeau",
  rim: "Jante",
  roller: "Rouleau",
  seat: "Siège",
  speaker: "Haut-parleur",
  fuel: "Carburant",
  heart: "Cœur",
  camera: "Appareil photo",
};
