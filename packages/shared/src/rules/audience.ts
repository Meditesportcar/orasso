import type { ProfileVisibility } from "../enums";

// Regards et audiences de la vague R7 (ARCHITECTURE-R7 § 2.1, lot R7f1 ; R7e1 l'utilise aussi pour le Fil).
// Pures : l'API les applique et décide ; l'appli et le site affichent le résultat sans le recalculer. Une règle de
// visibilité appliquée par l'écran seul est une fuite.

/** À qui s'adresse une story. */
export const storyAudiences = ["followers", "crew", "public"] as const;
export type StoryAudience = (typeof storyAudiences)[number];

/** Casquette sous laquelle une story est publiée. */
export const storyPersonas = ["fan", "organizer", "pro", "provider", "media"] as const;
export type StoryPersona = (typeof storyPersonas)[number];

/** Anneau d'un auteur dans la barre : `live` (organisateur « En cours », lot R7h) ne sort pas de R7f1. */
export const storyRings = ["followers", "crew", "live"] as const;
export type StoryRing = (typeof storyRings)[number];

/**
 * La personne qui regarde. `null` = pas de session : rien n'est jamais servi sans session (vie privée des
 * identifiés ; le site public n'affiche pas de stories). `active` = profil ni supprimé, ni banni, ni suspendu.
 */
export type AudienceViewer = { id: string; active: boolean } | null;

/** Ce que `canSeeStory` lit d'une story et de son auteur. */
export type AudienceStory = {
  authorId: string;
  audience: StoryAudience;
  crewId: string | null;
  /** Réglage public / privé du compte auteur. */
  authorVisibility: ProfileVisibility;
  /** Auteur ni supprimé, ni banni, ni suspendu. */
  authorActive: boolean;
};

/** Le lien entre le regard et l'auteur, calculé par l'API. */
export type AudienceRelation = {
  /** Le regard suit l'auteur, demande acceptée (une demande en attente ne donne rien). */
  followAccepted: boolean;
  /** Le regard est membre actif de ce crew (un ancien membre ne l'est plus). */
  crewMemberActive: (crewId: string) => boolean;
};

export type StoryDenial = "no_session" | "unavailable" | "crew_only" | "followers_only";

/**
 * Pourquoi une story n'est pas visible (`null` = visible). Ordre : session, comptes disponibles, soi-même (voit tout),
 * puis l'audience. `crew_only` = refus 403 `crew_only` (une story de crew ne se montre qu'aux membres actifs).
 */
export function storyDenial(viewer: AudienceViewer, story: AudienceStory, rel: AudienceRelation): StoryDenial | null {
  if (!viewer) return "no_session";
  if (!viewer.active) return "unavailable";
  if (viewer.id === story.authorId) return null;
  if (!story.authorActive) return "unavailable";
  switch (story.audience) {
    case "public":
      return null;
    case "followers":
      if (story.authorVisibility === "public") return null;
      return rel.followAccepted ? null : "followers_only";
    case "crew":
      return story.crewId && rel.crewMemberActive(story.crewId) ? null : "crew_only";
    default:
      return "unavailable";
  }
}

/** Le regard peut-il voir cette story ? (Mineurs : aucune règle écrite dans les docs, rien n'est codé.) */
export function canSeeStory(viewer: AudienceViewer, story: AudienceStory, rel: AudienceRelation): boolean {
  return storyDenial(viewer, story, rel) === null;
}

/** Une story vit 24 h. */
export const STORY_TTL_MS = 24 * 3_600_000;
export const STORY_CAPTION_MAX = 200;
export const STORY_PLACE_MAX = 80;
export const STORY_TAGS_MAX = 10;

/** Date de fin d'une story créée à `at`. */
export const storyExpiresAt = (at: Date): Date => new Date(at.getTime() + STORY_TTL_MS);

/** Encore visible à `now` : prête, non supprimée, non expirée. */
export function isStoryLive(
  story: { status: "processing" | "ready" | "failed"; expiresAt: Date; deletedAt: Date | null },
  now: Date,
): boolean {
  return story.status === "ready" && story.deletedAt === null && story.expiresAt.getTime() > now.getTime();
}

/**
 * Une story peut-elle être publiée (`status ready`) ? Photo : seulement avec une décision de plaque (`blurred` ou
 * `none_confirmed`). Vidéo : sans décision (`not_required`, décision de Damien du 09/11 : pas de floutage vidéo).
 */
export function isStoryPublishable(story: {
  mediaKind: "photo" | "video";
  plateState: "blurred" | "none_confirmed" | "not_required" | null;
}): boolean {
  if (story.mediaKind === "video") return story.plateState === "not_required" || story.plateState === null;
  return story.plateState === "blurred" || story.plateState === "none_confirmed";
}

// --- Barre -------------------------------------------------------------------------------------------------------

/** Ce que `storyRing` lit d'une story déjà jugée visible pour le regard. */
export type RingStory = { audience: StoryAudience; expiresAt: Date; deletedAt: Date | null };

/**
 * Anneau d'un auteur pour un regard : `stories` = ses stories **déjà visibles** pour ce regard. `null` sans story
 * vivante (aucun anneau, et on ne révèle pas qu'il y en a une). `live` quand l'auteur est en direct (organisateur
 * « En cours », R7h : l'API le passe à `false` partout dans R7f1). Sinon `crew` dès qu'une story de crew est
 * visible (le crew passe avant, pour que ses membres ne la ratent pas), sinon `followers`.
 */
export function storyRing(author: { live: boolean }, stories: readonly RingStory[], now: Date): StoryRing | null {
  const alive = stories.filter((s) => s.deletedAt === null && s.expiresAt.getTime() > now.getTime());
  if (alive.length === 0) return null;
  if (author.live) return "live";
  return alive.some((s) => s.audience === "crew") ? "crew" : "followers";
}

export type BarEntry = { hasUnseen: boolean; latestAt: Date };

/** Non vues d'abord, puis la plus récente en premier. Tri stable ; ne modifie pas l'entrée. */
export function storyBarOrder<T extends BarEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return b.latestAt.getTime() - a.latestAt.getTime();
  });
}

// --- Identification ----------------------------------------------------------------------------------------------

export const storyTagKinds = ["user", "structure", "pro"] as const;
export type StoryTagKind = (typeof storyTagKinds)[number];

export type TagRefusal = "not_visible" | "private_account" | "crew_story" | "unavailable";

/**
 * L'auteur peut-il identifier `target` (ou lier l'événement `event`) sur cette story ? `null` = oui.
 * - une personne : seulement si elle peut voir la story (`canSee`, calculé par l'API avec `canSeeStory`) et si son
 *   compte est disponible ;
 * - une structure, un pro, un événement : jamais depuis un compte privé (la story ne pourrait pas être repartagée
 *   publiquement), jamais sur une story de crew (une story de crew ne s'identifie pas hors crew).
 */
export function canTag(
  author: { visibility: ProfileVisibility },
  story: { audience: StoryAudience },
  target: { kind: StoryTagKind | "event"; canSee: boolean; available: boolean },
): TagRefusal | null {
  if (!target.available) return "unavailable";
  if (target.kind === "user") return target.canSee ? null : "not_visible";
  if (story.audience === "crew") return "crew_story";
  if (author.visibility === "private") return "private_account";
  return null;
}
