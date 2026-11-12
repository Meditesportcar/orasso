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
  /**
   * Le regard est **identifié** dans cette story (lui-même, ou une structure / un pro qu'il gère), identification non
   * retirée (lot R7h). Il peut la voir, même sans suivre l'auteur : sinon l'organisateur identifié ne verrait pas ce
   * qu'on lui demande de reprendre. Jamais pour une story de crew (elle ne sort pas du crew).
   */
  tagged?: boolean;
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
  // Lot R7h : le regard « identifié » voit une story d'abonnés ou publique, jamais celle d'un crew.
  if (rel.tagged && story.audience !== "crew") return null;
  switch (story.audience) {
    // Tour 2 : une story « publique » d'un compte privé se lit comme « abonnés », quel que soit le moment où le compte
    // est passé en privé (ou la casquette `provider` / `media` qui l'a publiée). Une structure et un pro (casquettes
    // `organizer` / `pro`) sont publics par nature : l'API leur donne `authorVisibility: "public"`.
    case "public":
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

export type ShareRefusal = "crew_story" | "not_visible" | "private_author";

/**
 * Une story peut-elle être reprise dans « ma story » (lot R7h) ? `null` = oui. Une copie garde le public et les droits de
 * l'originale, sans jamais les élargir : refusée pour un crew (elle ne sort pas du crew), pour une story que le regard ne
 * voit pas, et pour une story d'un compte **privé** (la copie, visible de mes abonnés ou de tous, ouvrirait la story à des
 * gens que l'auteur n'a pas choisis).
 */
export function shareRefusal(viewer: AudienceViewer, story: AudienceStory, rel: AudienceRelation): ShareRefusal | null {
  if (story.audience === "crew") return "crew_story";
  if (storyDenial(viewer, story, rel) !== null) return "not_visible";
  if (story.authorVisibility === "private") return "private_author";
  return null;
}

/** Une story vit 24 h. */
export const STORY_TTL_MS = 24 * 3_600_000;
export const STORY_CAPTION_MAX = 200;
export const STORY_PLACE_MAX = 80;
export const STORY_TAGS_MAX = 10;
/** Stories vivantes au plus par auteur (personne, structure ou pro), en plus de la limite horaire. */
export const STORY_LIVE_MAX = 50;

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

/**
 * Rang d'un auteur dans la barre (décisions R8 § 8, calculé par le serveur) : 2 = la structure d'un événement en cours où
 * j'ai ma place ; 3 = la structure d'un événement à venir où je suis retenu ou porteur d'un billet valable ; 4 = tout le
 * reste (crew, abonnements, structures et pros suivis). « Ta story » (`mine`) est à part, toujours en tête.
 */
export type BarRank = 2 | 3 | 4;

export type BarEntry = { hasUnseen: boolean; latestAt: Date; rank: BarRank };

/**
 * Non vues d'abord, puis par rang (2, 3, 4), puis la plus récente en premier ; les déjà vues suivent dans le même ordre.
 * Tri stable (à égalité, l'ordre reçu) ; ne modifie pas l'entrée.
 */
export function storyBarOrder<T extends BarEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
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

// --- Le Fil (lot R7e1) : une publication du Fil. Regard propre au Fil (`FeedViewer`), distinct du regard des stories.

/** Qui regarde le Fil : `null` = visiteur sans compte (jamais de Fil). */
export type FeedViewer = { userId: string } | null;

/** Le lien entre le lecteur et l'auteur, décidé par l'API (jamais par l'écran). */
export type AudienceRel = {
  /** Le lecteur suit l'auteur, demande acceptée (`user_follows.status = accepted`). */
  followAccepted: boolean;
};

export type FeedPostFacts = {
  authorId: string;
  authorVisibility: ProfileVisibility;
  /** Auteur supprimé, banni ou suspendu en ce moment. */
  authorUnavailable: boolean;
  /** Publication retirée (par l'auteur ou la modération). */
  deleted: boolean;
  /**
   * Publication d'une page (structure, fiche pro, prestataire, média : vague R8). Elle se voit de tout membre connecté
   * tant que la page est en règle, **quelle que soit la confidentialité du compte personnel** de qui l'a publiée ; elle
   * n'appartient pas à son compte (un compte supprimé la laisse à la page). `authorUnavailable` ne vaut alors que pour
   * un compte **banni**. Absent : publication d'une personne, règle inchangée.
   */
  page?: { inGoodStanding: boolean };
};

/**
 * Une publication du Fil se voit : avec une session, jamais retirée, d'un auteur en règle ; compte public → tout
 * membre connecté ; compte privé → ses abonnés acceptés et lui-même (un abonnement en attente ne voit rien). Rien d'un
 * crew : les publications de crew (`crew_posts`) ne sont pas des publications du Fil (D36).
 */
export function canSeeFeedPost(viewer: FeedViewer, post: FeedPostFacts, rel: AudienceRel): boolean {
  if (!viewer || post.deleted) return false;
  if (post.page) return post.page.inGoodStanding && !post.authorUnavailable;
  if (viewer.userId === post.authorId) return true;
  if (post.authorUnavailable) return false;
  if (post.authorVisibility === "public") return true;
  return rel.followAccepted;
}
