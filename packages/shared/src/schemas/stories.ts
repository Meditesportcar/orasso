// Stories (lot R7f1, ARCHITECTURE-R7 § 1.5 et § 2.5) : formes des routes, schémas Zod, types de réponse. Les règles de
// visibilité sont dans `rules/audience.ts`, le cadrage 9:16 dans `rules/storyFrame.ts`.
import { z } from "zod";

import { STORY_CAPTION_MAX, STORY_PLACE_MAX, STORY_TAGS_MAX, storyAudiences, storyPersonas, storyTagKinds } from "../rules/audience";
import type { StoryAudience, StoryPersona, StoryRing, StoryTagKind } from "../rules/audience";
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

/** Contenu lié à une story (carte touchable). R7f1 ne résout que `event` et `vehicle` ; le reste vient avec R7f4. */
export const storyLinkTypes = ["event", "vehicle", "feed_post", "memory", "vote_result"] as const;
export type StoryLinkType = (typeof storyLinkTypes)[number];

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identifiant invalide");

export const storyFrameSchema = z.object({
  scale: z.number().min(STORY_SCALE_MIN).max(STORY_SCALE_MAX),
  offsetX: z.number().min(-STORY_OFFSET_MAX).max(STORY_OFFSET_MAX),
  offsetY: z.number().min(-STORY_OFFSET_MAX).max(STORY_OFFSET_MAX),
});

export const storyTagInputSchema = z.object({ kind: z.enum(storyTagKinds), id: z.string().min(1).max(64) });
export type StoryTagInput = z.infer<typeof storyTagInputSchema>;

/**
 * `POST /me/stories` (photo). `plateRects` : rectangles dans la photo d'origine (fractions 0–1), comme pour les
 * photos de véhicule ; sans rectangle, `noPlateConfirmed` doit être vrai (sinon 400 `plate_decision_required`,
 * quel que soit le public). L'un ou l'autre, pas les deux.
 */
export const storyCreateSchema = z
  .object({
    uploadKey: z.string().min(1).max(200),
    frame: storyFrameSchema.optional(),
    plateRects: z.array(plateRectSchema).max(MAX_PLATE_RECTS).nullish(),
    noPlateConfirmed: z.boolean().optional(),
    audience: z.enum(storyAudiences),
    crewId: uuid.optional(),
    persona: z.enum(storyPersonas).default("fan"),
    structureId: uuid.optional(),
    proId: uuid.optional(),
    caption: z.string().trim().max(STORY_CAPTION_MAX).nullish(),
    placeLabel: z.string().trim().max(STORY_PLACE_MAX).nullish(),
    vehicleId: uuid.optional(),
    eventId: uuid.optional(),
    tags: z.array(storyTagInputSchema).max(STORY_TAGS_MAX).default([]),
    linked: z.object({ type: z.enum(storyLinkTypes), id: z.string().min(1).max(64) }).optional(),
  })
  .refine((v) => !(v.plateRects?.length && v.noPlateConfirmed), {
    message: "Choisis : plaque floutée ou aucune plaque visible, pas les deux",
    path: ["noPlateConfirmed"],
  });
export type StoryCreate = z.infer<typeof storyCreateSchema>;

export const storyReplySchema = z.object({ text: z.string().trim().min(1).max(500) });
export const storyReportSchema = z.object({
  reason: z.enum(["shocking", "insult", "harassment", "plate_or_face", "copyright", "spam", "other"]),
  details: z.string().trim().max(1000).nullish(),
});
export const storyTagRemoveSchema = z
  .object({ kind: z.enum(["structure", "pro"]), id: uuid })
  .optional();

/** Clé d'un auteur dans la barre : `u:<compte>`, `s:<structure>` ou `p:<pro>`. */
export const storyAuthorKeyRe = /^([usp]):([A-Za-z0-9_-]{1,64})$/;
export type StoryAuthorKey = { kind: StoryTagKind; id: string; key: string };
export function parseStoryAuthorKey(raw: string): StoryAuthorKey | null {
  const m = storyAuthorKeyRe.exec(raw);
  if (!m) return null;
  const kind: StoryTagKind = m[1] === "u" ? "user" : m[1] === "s" ? "structure" : "pro";
  return { kind, id: m[2] ?? "", key: raw };
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
};

export type StoryTagView = { kind: StoryTagKind; id: string; name: string; slug: string | null; avatarUrl: string | null };

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
  linked: { type: StoryLinkType; id: string } | null;
  /** Posé par R7m2 ; `null` dans R7f1. */
  commercialPartner: { id: string; name: string; slug: string } | null;
  audience: StoryAudience;
  crewName: string | null;
  sharedFrom: { authorPseudo: string } | null;
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
