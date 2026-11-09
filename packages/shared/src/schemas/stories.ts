// Stories (lot R7f1, ARCHITECTURE-R7 § 1.5 et § 2.5) : formes des routes, schémas Zod, types de réponse. Les règles de
// visibilité sont dans `rules/audience.ts`, le cadrage 9:16 dans `rules/storyFrame.ts`.
import { z } from "zod";
import type { StoryAudience, StoryPersona, StoryRing, StoryTagKind } from "../rules/audience";
import { STORY_CAPTION_MAX, STORY_PLACE_MAX, STORY_TAGS_MAX, storyAudiences, storyPersonas } from "../rules/audience";
import { STORY_OFFSET_MAX, STORY_SCALE_MAX, STORY_SCALE_MIN } from "../rules/storyFrame";
import { MAX_PLATE_RECTS, plateRectSchema } from "./vehicle";

export const storyMediaKinds = ["photo", "video"] as const;
export type StoryMediaKind = (typeof storyMediaKinds)[number];

/** `processing` : vidéo en cours de transcodage (lot R7g1) ; une photo est `ready` dès la réponse. */
export const storyStatuses = ["processing", "ready", "failed"] as const;
export type StoryStatus = (typeof storyStatuses)[number];

/**
 * Décision de plaque d'une photo : `blurred` (floutage fait) ou `none_confirmed` (l'auteur a dit « aucune plaque
 * visible »). Décision de Damien (09/11) : pas de floutage pour les vidéos, qui portent `not_required`.
 */
export const storyPlateStates = ["blurred", "none_confirmed", "not_required"] as const;
export type StoryPlateState = (typeof storyPlateStates)[number];

/** Contenu lié à une story (carte touchable) : événement, voiture, publication du Fil, souvenir, résultat de vote (R7f4). */
export const storyLinkTypes = ["event", "vehicle", "feed_post", "memory", "vote_result"] as const;
export type StoryLinkType = (typeof storyLinkTypes)[number];

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identifiant invalide");

export const storyFrameSchema = z.object({
  scale: z.number().min(STORY_SCALE_MIN).max(STORY_SCALE_MAX),
  offsetX: z.number().min(-STORY_OFFSET_MAX).max(STORY_OFFSET_MAX),
  offsetY: z.number().min(-STORY_OFFSET_MAX).max(STORY_OFFSET_MAX),
});

/** Identifiant d'un compte (texte de Better Auth) : jamais d'autre caractère que ceux-ci. */
const uuidLower = uuid.transform((v) => v.toLowerCase());
const accountId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identifiant invalide");

/** Une personne par son identifiant de compte ; une structure ou un pro par un UUID (jamais de texte libre : 400, pas 500). */
export const storyTagInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), id: accountId }),
  z.object({ kind: z.literal("structure"), id: uuidLower }),
  z.object({ kind: z.literal("pro"), id: uuidLower }),
]);
export type StoryTagInput = z.infer<typeof storyTagInputSchema>;

/**
 * `POST /me/stories` (photo). `plateRects` : rectangles dans la photo d'origine (fractions 0–1), comme pour les
 * photos de véhicule ; sans rectangle, `noPlateConfirmed` doit être vrai (sinon 400 `plate_decision_required`,
 * quel que soit le public). L'un ou l'autre, pas les deux.
 */
export const storyCreateSchema = z
  .object({
    /** Absent pour une carte liée (R7f4) : le serveur rend lui-même le 9:16 (voir `linked` et `clientId`). */
    uploadKey: z.string().min(1).max(200).optional(),
    /** Carte liée sans média (R7f4) : identifiant tiré par l'appareil, une reprise rend la même story. */
    clientId: z.uuid().optional(),
    frame: storyFrameSchema.optional(),
    plateRects: z.array(plateRectSchema).max(MAX_PLATE_RECTS).nullish(),
    noPlateConfirmed: z.boolean().optional(),
    audience: z.enum(storyAudiences),
    crewId: uuidLower.optional(),
    persona: z.enum(storyPersonas).default("fan"),
    structureId: uuidLower.optional(),
    proId: uuidLower.optional(),
    caption: z.string().trim().max(STORY_CAPTION_MAX).nullish(),
    placeLabel: z.string().trim().max(STORY_PLACE_MAX).nullish(),
    vehicleId: uuidLower.optional(),
    eventId: uuidLower.optional(),
    tags: z.array(storyTagInputSchema).max(STORY_TAGS_MAX).default([]),
    linked: z.object({ type: z.enum(storyLinkTypes), id: uuidLower }).optional(),
  })
  .refine((v) => !(v.plateRects?.length && v.noPlateConfirmed), {
    message: "Choisis : plaque floutée ou aucune plaque visible, pas les deux",
    path: ["noPlateConfirmed"],
  })
  .refine((v) => Boolean(v.uploadKey) || Boolean(v.linked), {
    message: "Une photo ou un contenu à partager est attendu",
    path: ["uploadKey"],
  })
  .refine((v) => Boolean(v.uploadKey) || Boolean(v.clientId), {
    message: "Un identifiant d'envoi est attendu pour un contenu partagé",
    path: ["clientId"],
  });
export type StoryCreate = z.infer<typeof storyCreateSchema>;

export const storyReplySchema = z.object({
  text: z.string().trim().min(1).max(500),
  /** Identifiant choisi par l'appareil : une reprise réseau renvoie le même message, jamais deux. */
  clientId: z.uuid().optional(),
});
export const storyReportSchema = z.object({
  reason: z.enum(["shocking", "insult", "harassment", "plate_or_face", "copyright", "spam", "other"]),
  details: z.string().trim().max(1000).nullish(),
});
export const storyTagRemoveSchema = z.object({ kind: z.enum(["structure", "pro"]), id: uuidLower }).optional();

/** Clé d'un auteur dans la barre : `u:<compte>`, `s:<structure>` ou `p:<pro>` (UUID strict pour les deux dernières). */
export const storyAuthorKeyRe =
  /^(?:(u):([A-Za-z0-9_-]{1,64})|([sp]):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}))$/;
export type StoryAuthorKey = { kind: StoryTagKind; id: string; key: string };
export function parseStoryAuthorKey(raw: string): StoryAuthorKey | null {
  const m = storyAuthorKeyRe.exec(raw);
  if (!m) return null;
  const letter = m[1] ?? m[3];
  const kind: StoryTagKind = letter === "u" ? "user" : letter === "s" ? "structure" : "pro";
  // Les UUID sont ramenés en minuscules : la clé, les verrous et les comparaisons ne dépendent jamais de la casse reçue.
  const id = m[2] ?? (m[4] ?? "").toLowerCase();
  return { kind, id, key: kind === "user" ? raw : storyAuthorKeyOf(kind, id) };
}
export const storyAuthorKeyOf = (kind: StoryTagKind, id: string): string =>
  `${kind === "user" ? "u" : kind === "structure" ? "s" : "p"}:${id}`;

// --- Réponses ------------------------------------------------------------------------------------------------------

export type StoryCreated = {
  id: string;
  status: StoryStatus;
  expiresAt: string;
  /** Identifications ou liens écartés par les règles (compte privé, hors public…), pour que l'appli le dise. */
  skipped: { kind: StoryTagKind | "event" | "vehicle"; id: string; reason: string }[];
  /** Vrai quand c'est une reprise : la story existait déjà (réponse perdue), sans les dernières modifications. */
  replayed?: boolean;
};

export type StoryTagView = {
  kind: StoryTagKind;
  id: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
};

/** Le contenu lié d'une story : de quoi ouvrir sa page (`slug` de l'événement, `eventId` d'un vote ou d'un souvenir). */
export type StoryLinkedView = {
  type: StoryLinkType;
  id: string;
  /** « Voir l'événement », « Voir la voiture »… */
  label: string;
  slug: string | null;
  eventId: string | null;
  title: string | null;
  /** Le fichier de la story peut sortir : faux pour la publication d'un autre (l'export ne sort que de la main de son auteur). */
  exportable: boolean;
};

export type StoryView = {
  id: string;
  mediaKind: StoryMediaKind;
  /** Route protégée (`/api/stories/:id/media/:nom`) : jamais un fichier public. */
  mediaUrl: string;
  posterUrl: string | null;
  durationMs: number | null;
  status: StoryStatus;
  caption: string | null;
  placeLabel: string | null;
  vehicle: { id: string; label: string; photoUrl: string | null } | null;
  event: { id: string; slug: string; title: string; startsAt: string } | null;
  tags: StoryTagView[];
  /** Carte touchable (R7f4) : refiltrée à chaque lecture ; `null` quand le contenu n'est plus visible (carte inerte). */
  linked: StoryLinkedView | null;
  /** Posé par R7m2 ; `null` dans R7f1. */
  commercialPartner: { id: string; name: string; slug: string } | null;
  audience: StoryAudience;
  crewName: string | null;
  sharedFrom: { authorPseudo: string } | null;
  /**
   * « Vers l'extérieur » du menu de la story (l'auteur seul) : la même règle que `GET /stories/:id/export` (ni crew, ni copie,
   * ni story en traitement, ni contenu lié disparu ou d'un autre). Faux pour tout autre lecteur.
   */
  exportable: boolean;
  viewed: boolean;
  reacted: boolean;
  /** L'auteur seul. */
  viewsCount: number | null;
  reactionsCount: number | null;
  createdAt: string;
  expiresAt: string;
};

export type StoryAuthorView = {
  key: string;
  pseudoOrName: string;
  avatarUrl: string | null;
  persona: StoryPersona;
};

export type StoriesByAuthor = { author: StoryAuthorView | null; stories: StoryView[] };

export type StoryBarEntry = {
  key: string;
  pseudoOrName: string;
  avatarUrl: string | null;
  ring: StoryRing;
  hasUnseen: boolean;
  latestAt: string;
  crewName: string | null;
};

export type StoryBar = {
  mine: { count: number; hasUnseen: false; latestAt: string; ring: StoryRing } | null;
  authors: StoryBarEntry[];
};

/** Ajout à `GET /users/:pseudo`, `/structures/by-slug/:slug`, `/pros/by-slug/:slug` : selon le regard. */
export type StoriesSummary = { count: number; hasUnseen: boolean; ring: StoryRing | null };

export type StoryReplyResult =
  | { mode: "message"; conversationId: string; messageId: string }
  | { mode: "contact_request"; requestId: string };
