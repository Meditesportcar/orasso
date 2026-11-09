import { STORY_VIDEO_MAX_BYTES, STORY_VIDEO_MAX_MS, STORY_VIDEO_PENDING_MAX_BYTES } from "../rules/storyVideo";

// Stories vidéo (lot R7g, maquettes R7.8 `ps_4_md_video`, R7.7 `sk_video` et R7.22 `sf_cam`) : libellés de l'API, de l'appli
// et du site, mêmes mots partout.
const SECONDS = STORY_VIDEO_MAX_MS / 1000;
const MEGABYTES = STORY_VIDEO_MAX_BYTES / (1024 * 1024);
const PENDING_MEGABYTES = STORY_VIDEO_PENDING_MAX_BYTES / (1024 * 1024);

export const storyVideoLabels = {
  mode: "Vidéo",
  record: "Filmer",
  stop: "Arrêter",
  recording: "Enregistrement en cours",
  recordHint: `${SECONDS} secondes au plus, en 9:16. Le son est enregistré.`,
  recordDenied:
    "L'appli n'a pas accès au micro. Autorise-le dans les réglages du téléphone, ou choisis une vidéo de la galerie.",
  recordFailed: "La vidéo n'a pas pu être enregistrée. Réessaie.",
  gallery: "Vidéo de la galerie",
  pickSite: "Choisir une vidéo",
  pickHint: `Une vidéo de ${SECONDS} secondes au plus. Elle est publiée telle quelle : aucune plaque n'est floutée.`,
  pickHintSite: `Une vidéo de ${SECONDS} secondes et ${MEGABYTES} Mo au plus, en H.264 (MP4 ou MOV).`,
  asIs: "Publiée telle quelle : les vidéos ne sont pas floutées.",
  asIsLine: "Aucune plaque n'est floutée sur une vidéo.",
  // Aperçu et fond.
  previewNote:
    "Telle que les autres la verront. Hors 9:16, elle se pose sur sa vignette floutée ; le fichier ne change pas.",
  posterBlur: "Posée sur sa vignette floutée",
  muted: "Son coupé dans l'aperçu",
  // Refus avant l'envoi.
  tooBig: `Cette vidéo pèse plus de ${MEGABYTES} Mo : envoie-la depuis l'appli, elle la compresse.`,
  tooBigApp: "Cette vidéo est trop lourde : filme-la depuis Orasso.",
  tooLong: `Une story vidéo dure ${SECONDS} secondes au plus.`,
  empty: "Cette vidéo est vide.",
  unreadable: "Cette vidéo ne se lit pas. Choisis-en une autre.",
  notVideo: "Ce fichier n'est pas une vidéo.",
  codec: "Cette vidéo n'est pas en H.264 : envoie-la depuis l'appli, elle la compresse.",
  // Compression sur le téléphone.
  compressing: "Compression de la vidéo…",
  compressFailed: "La vidéo n'a pas pu être compressée. Choisis-en une autre ou filme-la depuis Orasso.",
  // Envoi.
  sending: "Envoi de la vidéo…",
  sendingPercent: (percent: number) => `Envoi de la vidéo · ${percent} %`,
  offline: "Impossible d'envoyer une vidéo sans réseau.",
  uploadTimeout: "L'envoi a pris trop de temps : réessaie avec une meilleure connexion.",
  doneText: (audience: string) => `${audience} la voit pendant 24 h. Publiée telle quelle, sans floutage.`,
  readingVideo: "Lecture de la vidéo…",
  // API.
  apiTooLong: `Une story vidéo dure ${SECONDS} secondes au plus.`,
  apiCodec: "Cette vidéo n'est pas en H.264 : envoie-la depuis l'appli, elle la compresse.",
  apiUnreadable: "Cette vidéo est illisible : filme-la à nouveau ou choisis-en une autre.",
  apiNoVideo: "Ce fichier ne contient pas de piste vidéo.",
  apiLocationTrack: "Cette vidéo contient une piste de position : filme-la depuis Orasso ou retire la piste.",
  apiBusy: "Plusieurs envois de vidéos sont en cours : réessaie dans un instant.",
  apiPendingFull: `Trop de vidéos en attente (${PENDING_MEGABYTES} Mo) : publie-les, supprime-les ou réessaie demain.`,
  apiLengthRequired: "Taille de la vidéo manquante : envoie-la depuis l'appli ou le site.",
  apiBadBody: "La vidéo n'est pas arrivée en entier : réessaie.",
  apiWrongType: "Envoie la vidéo telle quelle (MP4 ou MOV), sans formulaire.",
  apiPosterMissing: "La vignette de la vidéo est manquante : envoie-la à nouveau.",
  apiPosterUnused: "Cette vignette ne va pas avec cette vidéo.",
  // Lecture.
  sound: "Son",
  soundOn: "Activer le son",
  soundOff: "Couper le son",
  paused: "En pause",
  playFailed: "La vidéo ne se lit pas.",
  retry: "Réessayer",
} as const;
