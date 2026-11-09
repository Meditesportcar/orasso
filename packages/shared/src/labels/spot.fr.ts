// Rendez-vous au spot (lot R7i) : libellés de l'API, de l'appli et du site, mêmes mots partout.
import { SPOT_NOTE_MAX, SPOT_PLACE_MAX } from "../rules/spotMeetup";

export const spotLabels = {
  feature: "Rendez-vous au spot",
  block: "Au spot",
  who: "Qui vient ?",
  launch: "Lancer un rendez-vous",
  launchForCrew: "Lancer un rendez-vous pour le crew",
  launchShort: "Lancer",
  yes: "Je viens",
  maybe: "Peut-être",
  cancel: "Annuler le rendez-vous",
  cancelConfirm: "Annuler ce rendez-vous ? Le lieu et la liste disparaissent tout de suite.",
  cancelled: "Rendez-vous annulé.",
  subtitle: "De jour comme de nuit, une rencontre de dernière minute",
  ended: "Ce rendez-vous est terminé",
  endedHint: "Ni lieu ni liste ne restent.",
  endedMine: "Ton rendez-vous a disparu, comme prévu",
  endedCame: (n: number) =>
    n === 0 ? "Personne n'est venu." : n === 1 ? "1 personne est venue." : `${n} personnes sont venues.`,
  unavailable: "Ce rendez-vous n'existe plus, ou il n'est pas pour toi.",
  empty: "Personne ne lance de rendez-vous pour l'instant. Et toi ?",
  // Écran « Lancer »
  title: "Rendez-vous au spot",
  where: "Où",
  whereSearch: "Une adresse ou un lieu",
  whereFind: "Chercher",
  whereFound: (label: string) => `Trouvé : ${label}`,
  whereNotFound: "Adresse introuvable : essaie avec la ville, ou touche la carte.",
  whereTouch: "Touche la carte pour placer le point.",
  whereMine: "Autour de moi",
  whereMineDenied: "Position refusée : cherche une adresse.",
  whereHint: "Ta position sert seulement à centrer la carte : elle n'est jamais envoyée.",
  whereMissing: "Choisis un lieu : cherche une adresse ou touche la carte.",
  placeName: "Nom du lieu",
  placeNameHint: `${SPOT_PLACE_MAX} caractères au plus, par exemple « Port de Saint-Cyprien ».`,
  whatTime: "À quelle heure",
  now: "Maintenant",
  otherTime: "Autre heure",
  howLong: "Combien de temps",
  otherLength: "Une heure au choix",
  lengthLess: "Moins",
  lengthMore: "Plus",
  note: "Un mot",
  noteOptional: "facultatif",
  notePlaceholder: "Café au port, qui vient ?",
  noteMax: SPOT_NOTE_MAX,
  warned: "Qui est prévenu",
  followers: "Mes abonnés",
  followersHint: (n: number) => (n === 0 ? "Personne ne te suit encore" : n === 1 ? "1 personne" : `${n} personnes`),
  crew: (name: string) => `Mon crew · ${name}`,
  crewHint: (n: number) => `${n} membre${n > 1 ? "s" : ""} · il apparaît aussi dans les spots du crew`,
  noAudience: "Personne à prévenir pour l'instant : fais-toi suivre ou rejoins un crew.",
  privacy: (until: string) =>
    `Le lieu exact n'est montré qu'à eux. Le rendez-vous disparaît ${until}, lieu et liste compris.`,
  launching: "Je lance…",
  launched: "Rendez-vous lancé.",
  active: "Tu as déjà un rendez-vous en cours. Un seul à la fois.",
  seeActive: "Voir mon rendez-vous",
  // Reçu
  from: (pseudo: string) => `${pseudo} · rendez-vous au spot`,
  whoCome: (names: string[], maybe: number) => {
    const come = names.length ? `${names.join(", ")} ${names.length > 1 ? "viennent" : "vient"}` : "";
    const may = maybe > 0 ? `${maybe} peut-être` : "";
    return [come, may].filter(Boolean).join(" · ");
  },
  nobodyYet: "Personne n'a répondu pour l'instant.",
  yesCount: (n: number) => (n === 1 ? "1 vient" : `${n} viennent`),
  maybeCount: (n: number) => (n === 1 ? "1 peut-être" : `${n} peut-être`),
  // Crew
  crewEmptyTitle: "Pas de rendez-vous",
  crewEmptyHint: "Les rendez-vous au spot lancés pour le crew apparaissent ici.",
  crewActive: "En cours",
  crewPast: "Terminés",
  errorRetry: "Réessayer",
  // Au spot (Accueil)
  homeOthers: (n: number) => (n === 1 ? "1 autre rendez-vous" : `${n} autres rendez-vous`),
  open: "Ouvrir",
} as const;

export const spotErrors = {
  active: "Tu as déjà un rendez-vous au spot en cours.",
  ends_before_start: "La fin doit venir après le début.",
  too_long: "Un rendez-vous dure 12 h au plus.",
  start_in_past: "L'heure de début est déjà passée.",
  start_too_far: "Un rendez-vous se lance dans les 24 h.",
  already_over: "Ce rendez-vous serait déjà fini.",
  not_member: "Tu n'es pas membre actif de ce crew.",
  notFound: "Rendez-vous introuvable.",
} as const;
