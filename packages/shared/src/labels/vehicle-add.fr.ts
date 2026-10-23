import type { BodyColorFamily } from "../rules/vehicleAdd";
import type { VehicleDrivetrain } from "../schemas/vehicle";

// Ajout de véhicule refait (lot M1, maquettes 1.1 à 1.9 validées par Damien le 23/10). Les libellés de l'étape Plaque
// restent dans `vehicleWizardLabels` (lot M2) ; ceux-ci s'y ajoutent.

const thePhotos = (n: number) => (n <= 1 ? `${n} photo` : `${n} photos`);
/** « 1 495 » (espace insécable), sans dépendre d'Intl sur le téléphone. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");

export const vehicleAddLabels = {
  /** Ordre décidé par Damien (retour 11) : la photo d'abord, la plaque ensuite (elle préremplit le numéro). */
  steps: ["Photos", "Plaque", "Marque et modèle", "Fiche technique", "Catégories"] as const,
  stepOf: (n: number, total: number, label: string) => `Étape ${n} sur ${total} · ${label}`,
  sending: "Envoi",
  done: "Terminé",
  close: "Fermer",
  back: "Étape précédente",
  progress: (n: number, total: number) => `Étape ${n} sur ${total}`,
  // Fiche qui se construit (`.vlive`)
  liveNoPhoto: "Pas encore de photo",
  livePhotos: thePhotos,
  liveName: "Ton véhicule",
  liveLater: "Marque et modèle à l'étape 3",
  livePlate: "Plaque masquée, numéro privé",
  // 1. Photos
  photosTitle: "Ses photos",
  photosText:
    "On commence par elles : ce sont elles qu'on verra partout. Format carré, l'étoile choisit la couverture.",
  callTitle: "Ajouter des photos",
  callText: "Prends-le en photo ou choisis dans ta galerie. Une à huit photos, au format carré.",
  camera: "Appareil photo",
  gallery: "Galerie",
  add: "Ajouter",
  addHint: "Appareil ou galerie",
  count: (n: number) => `${n} sur 8`,
  certTitle: "3 photos conseillées",
  certReady: "3 photos : la certification est possible",
  certNone: "Il en faut 3 pour demander la certification.",
  certSome: (n: number) => `${n} sur 3 · il en faut 3 pour demander la certification.`,
  certRest: "Il restera la description, à l'étape 4.",
  plateNote: "La plaque est masquée toute seule : tu vérifies photo par photo à l'étape suivante.",
  needPhoto: "Ajoute au moins une photo pour continuer.",
  cover: "Couverture",
  makeCover: "Choisir comme couverture",
  isCover: "Photo de couverture",
  crop: "Recadrer",
  remove: "Supprimer",
  photoN: (n: number) => `Photo ${n}`,
  // Recadrage carré (1.2)
  cropTitle: "Recadrer",
  cropOf: (n: number, total: number) => `Photo ${n} sur ${total} · format carré`,
  cropBadge: "Cadre fixe · carré",
  cropHint: "Glisse la photo · pince à deux doigts pour zoomer",
  zoomOut: "Dézoomer",
  zoomIn: "Zoomer",
  zoomValue: (z: number) => `×${z.toFixed(1).replace(".", ",")}`,
  previewThumb: "Vignette",
  previewCard: "Fiche",
  previewText: "Aperçu en direct : le même carré partout, grille, fiche et affiche.",
  cropValidate: "Valider le cadrage",
  cropCancel: "Annuler",
  cropBusy: "Cadrage de la photo…",
  // 2. Plaque (1.3 et 1.4, visuel du lot M1 sur la logique du lot M2)
  plateTitle: "Sa plaque",
  plateText: "On la masque sur chaque photo. Vérifie d'un coup d'œil, puis confirme le numéro : il reste privé.",
  plateState: {
    ok: "Masquée",
    none: "Aucune",
    check: "À vérifier",
    fix: "À régler",
    pending: "Recherche…",
    online: "En ligne",
  },
  plateStrip: "Tes photos et leur plaque",
  plateOpen: (n: number, state: string) => `Photo ${n}, ${state}, ouvrir`,
  plateBadgeMasked: (n: number) => `Photo ${n} · plaque masquée`,
  plateBadgeNone: (n: number) => `Photo ${n} · aucune plaque`,
  plateBadgeHand: (n: number) => `Photo ${n} · à la main`,
  plateBadgeOnline: (n: number) => `Photo ${n} · déjà en ligne`,
  toolFrame: "Cadre",
  toolRemove: "Retirer",
  toolNone: "Aucune plaque",
  plateFix: (n: number) => `Photo ${n} : pose le cadre sur la plaque, ou touche « Aucune plaque ».`,
  plateProbable: (n: number) =>
    `Photo ${n} : une plaque semble visible, à vérifier. Pose le cadre dessus, ou touche « Aucune plaque ».`,
  plateSearching: "On cherche la plaque sur tes photos…",
  noneTitle: "Aucune plaque visible sur cette photo ?",
  noneText: "Elle partira sans masque. Vérifie bien : l'avant et l'arrière de la voiture.",
  noneYes: "Oui, aucune plaque",
  noneCancel: "Annuler",
  plateLabel: "Numéro de plaque · privé",
  plateRead: "Lu sur la photo",
  plateHelp:
    "Obligatoire. Corrige-le si la lecture s'est trompée : tape-le comme tu veux, on le met en forme tout seul.",
  formerNoCert: "Un ancien véhicule (vendu, souvenir ou accidenté) ne peut pas être certifié.",
  unregisteredText: "Circuit, collection ou import en cours.",
  privacyShort: "Le numéro reste privé : seule l'équipe organisatrice le voit, pour vérifier ton inscription.",
  handTwo: "Deux doigts n'importe où :",
  handTwoText: "pince pour agrandir, tourne pour pivoter. La loupe s'affiche quand tu déplaces le cadre ou son coin.",
  handOne: "Un doigt dans le cadre :",
  handOneText: "il se déplace. Coin moutarde : agrandir. Rond blanc : tourner.",
  // 3. Marque et modèle (1.5)
  clearSearch: "Effacer la recherche",
  crumb: "Ton choix",
  // 4. Fiche technique (1.6)
  specsText: "La motorisation vient de la base Orasso : puissance et poids se remplissent seuls.",
  specsTextFree:
    "Ce modèle n'a pas encore ses motorisations dans la base Orasso : indique la tienne, l'équipe l'ajoutera.",
  engines: "Motorisation",
  engineFacts: (power: number | null, weight: number | null, drive: VehicleDrivetrain | null) =>
    [power ? `${power} ch` : null, weight ? `${thousands(weight)} kg` : null, drive ? drivetrainLabels[drive] : null]
      .filter(Boolean)
      .join(" · "),
  otherEngine: "Autre motorisation",
  otherEngineHint: "Pas dans la liste ? Saisis-la, l'équipe Orasso l'ajoute.",
  enginePlaceholder: "Ex. 1.4 T-Jet 160",
  year: "Année",
  yearOther: "Autre année",
  color: "Couleur",
  colorPick: "Choisis sa teinte",
  colorOther: "Autre teinte",
  colorOtherLabel: "Sa teinte",
  colorOtherPlaceholder: "Ex. Bleu Laguna, vert Sarthe…",
  colorFamilies: {
    white: "Blancs",
    grey: "Gris et argent",
    black: "Noirs",
    red: "Rouges",
    blue: "Bleus",
    green: "Verts",
    yellow: "Jaunes et oranges",
    brown: "Bruns et beiges",
    purple: "Violets et roses",
    special: "Bicolores et effets",
  } satisfies Record<BodyColorFamily, string>,
  colorFinish: {
    gloss: "vernie",
    metal: "métallisée",
    pearl: "nacrée",
    matte: "mate",
    duo: "bicolore",
    chameleon: "à effet",
  },
  description: "Description",
  descriptionHint: "Ce qui la rend unique. Obligatoire pour demander la certification.",
  descriptionPlaceholder: "Son histoire, ce qui a été fait, où elle sort…",
  descriptionCount: (n: number, max: number) => `${n} / ${max}`,
  preparation: "Préparation · plusieurs choix",
  // 5. Catégories (1.7)
  originLocked: "déduite de la marque, non modifiable",
  /**
   * Ligne d'origine (maquette 1.7) : « Japonaise », puis « JDM · déduit de Toyota » quand la catégorie d'origine porte
   * un autre nom que le pays (sinon « Déduit de Toyota »).
   */
  originLine: (category: string, country: string | null, make: string) => {
    const adjective = country ? (originAdjectives[country] ?? null) : null;
    const deduced = `Déduit de ${make}`;
    if (!adjective || adjective.toLowerCase() === category.toLowerCase()) return { title: category, detail: deduced };
    return { title: adjective, detail: `${category} · déduit de ${make}` };
  },
  stylesDimmed: (labels: string[], noun: string, year: number) =>
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)} sont grisées : ${noun} est de ${year}.`
      : `${labels[0] ?? ""} est grisée : ${noun} est de ${year}.`,
  preparedChecked: "Préparée est cochée car tu as indiqué une préparation.",
  vehicleNoun: { car: "ta voiture", moto: "ta moto", truck: "ton camion" } as const,
  send: "Envoyer",
  // Envoi (1.8, correction de Damien : compact, jamais « vous pouvez quitter l'écran »)
  sendTitle: "On la gare",
  sendPhotos: (n: number, total: number) => `Envoi des photos : ${n} sur ${total} · plaque masquée`,
  sendParked: (total: number) =>
    total <= 1 ? "La photo est garée · plaque masquée" : `Les ${total} photos sont garées · plaque masquée`,
  saving: "Enregistrement de la fiche…",
  photoCover: (n: number) => `Photo ${n} · couverture`,
  photoMasked: "Plaque masquée",
  photoNoPlate: "Aucune plaque",
  photoOnline: "Déjà en ligne",
  photoSent: "Envoyée",
  photoWaiting: "En attente",
  percent: (p: number) => `${Math.round(p)} %`,
  // Succès (1.9)
  doneText: "Sa fiche est prête : plaque masquée, couverture choisie.",
  preferences: "Continuer · tes préférences",
  backToGarage: "Retour au garage",
  share: "Partager son affiche",
  certificationNote:
    "Il manque encore de quoi demander la certification : 3 photos et une description. Tu les ajoutes depuis sa fiche.",
};

/** Pays de la marque en adjectif (féminin : « une voiture japonaise »), pour la ligne d'origine. */
export const originAdjectives: Record<string, string> = {
  JP: "Japonaise",
  DE: "Allemande",
  FR: "Française",
  IT: "Italienne",
  US: "Américaine",
  GB: "Britannique",
  SE: "Suédoise",
  KR: "Coréenne",
  ES: "Espagnole",
  CZ: "Tchèque",
  NL: "Néerlandaise",
  AT: "Autrichienne",
  CN: "Chinoise",
};

export const drivetrainLabels: Record<VehicleDrivetrain, string> = {
  rwd: "propulsion",
  fwd: "traction",
  awd: "intégrale",
};
