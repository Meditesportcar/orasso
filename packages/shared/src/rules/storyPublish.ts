// « Publier une story » sans React ni réseau (lot R7f3, testé par `storyPublish.test.ts`) : à qui s'adresse la story selon la
// casquette et le compte, ce qui bloque « Publier », l'autocollant d'événement (grisé pour un compte privé), la liste des
// personnes qu'on peut identifier, et le corps de `POST /me/stories`. L'appli et le site disent la même chose ; l'API reste
// juge (`canTag`, `canSeeStory`) : ces règles-ci évitent de proposer ce qu'elle refuserait.
import type { ProfileVisibility } from "../enums";
import { storyPublishLabels as L } from "../labels/storyPublish.fr";
import type { PlateRect } from "../schemas/vehicle";
import { STORY_CAPTION_MAX, STORY_PLACE_MAX, STORY_TAGS_MAX, type StoryAudience, type StoryPersona } from "./audience";
import { framesPlaced } from "./feedList";
import { clampFrame, type Frame } from "./storyFrame";

/** Sous quelle casquette la story part, et pour qui (`structureId` pour un organisateur, `proId` pour un pro). */
export type StoryAuthor = { persona: StoryPersona; structureId?: string; proId?: string; name?: string };

/** Un crew dont je suis membre actif (`GET /me/crews`). */
export type StoryCrewChoice = { id: string; name: string; members: number };

/** Une ligne du choix « Qui la voit » : une audience, et le crew quand c'est celle du crew. */
export type StoryAudienceOption = {
  key: string;
  audience: StoryAudience;
  crewId: string | null;
  label: string;
  hint: string;
};

/**
 * Qui peut voir la story, selon la casquette : passionné (ou visiteur) = « Mes abonnés » (le sous-titre dit ce que ça veut
 * dire selon mon compte) et un choix par crew dont je suis membre ; organisateur, pro, prestataire, média = « Public » seul,
 * publié au nom de la page (publique par nature, lot R9a, D38 : la story d'une page ne dépend jamais de la confidentialité du
 * compte de son titulaire). L'API refuse un crew hors casquette passionné.
 */
export function storyAudienceOptions(
  author: StoryAuthor,
  visibility: ProfileVisibility,
  crews: readonly StoryCrewChoice[],
): StoryAudienceOption[] {
  if (author.persona !== "fan") {
    // Lot R9a (D38) : une page (structure, pro, prestataire, média) est publique, quel que soit le compte de son titulaire.
    return [
      {
        key: "public",
        audience: "public",
        crewId: null,
        label: L.public,
        hint: author.name ? `${L.publicHint} ${L.publicAs(author.name)}` : L.publicHint,
      },
    ];
  }
  return [
    {
      key: "followers",
      audience: "followers",
      crewId: null,
      label: L.followers,
      hint: visibility === "public" ? L.followersPublic : L.followersPrivate,
    },
    ...crews.map(
      (c): StoryAudienceOption => ({
        key: `crew:${c.id}`,
        audience: "crew",
        crewId: c.id,
        label: L.crew(c.name),
        hint: L.crewHint(c.members),
      }),
    ),
  ];
}

/**
 * L'autocollant d'événement : refusé pour un compte privé (la story ne pourrait pas être repartagée publiquement : même
 * règle que `canTag` de l'API, qui lit le réglage du compte) et pour une story de crew. `reason` dit pourquoi, pour le
 * bouton grisé.
 */
export function storyEventSticker(
  visibility: ProfileVisibility,
  audience: StoryAudience,
): { allowed: boolean; reason: string | null } {
  if (audience === "crew") return { allowed: false, reason: L.eventCrew };
  if (visibility === "private") return { allowed: false, reason: L.eventPrivate };
  return { allowed: true, reason: null };
}

/** Ce qu'on demande à `GET /users/search` pour proposer seulement ceux qui pourraient voir la story. */
export function taggableQuery(choice: { audience: StoryAudience; crewId: string | null; persona: StoryPersona }): {
  taggableFor: StoryAudience;
  crewId?: string;
  persona: StoryPersona;
} {
  return {
    taggableFor: choice.audience,
    ...(choice.audience === "crew" && choice.crewId ? { crewId: choice.crewId } : {}),
    persona: choice.persona,
  };
}

/** Phrase qui dit à qui est limitée la liste des identifiables. */
export function taggableHint(audience: StoryAudience, visibility: ProfileVisibility, persona: StoryPersona): string {
  if (audience === "crew") return L.tagHintCrew;
  const publicAuthor = persona !== "fan" || visibility === "public";
  return publicAuthor ? L.tagHintPublic : L.tagHintFollowers;
}

export type StoryTagPick = { id: string; pseudo: string };

/** Ajoute une personne identifiée : sans doublon, `STORY_TAGS_MAX` au plus (sinon la liste reste telle quelle). */
export function addTag(tags: readonly StoryTagPick[], pick: StoryTagPick): StoryTagPick[] {
  if (tags.some((t) => t.id === pick.id) || tags.length >= STORY_TAGS_MAX) return [...tags];
  return [...tags, pick];
}

export const removeTag = (tags: readonly StoryTagPick[], id: string): StoryTagPick[] => tags.filter((t) => t.id !== id);

/**
 * Le public change : les personnes déjà identifiées ne pourraient peut-être plus voir la story, elles sont retirées (la
 * liste des identifiables dépend du public) ; l'événement collé tombe si le nouveau public est un crew. `changed` : quelque
 * chose a été retiré, pour le dire.
 */
export function pruneForAudience(
  before: { audience: StoryAudience; crewId: string | null },
  next: { audience: StoryAudience; crewId: string | null },
  state: { tags: readonly StoryTagPick[]; eventId: string | null },
): { tags: StoryTagPick[]; eventId: string | null; changed: boolean } {
  const same = before.audience === next.audience && before.crewId === next.crewId;
  const tags = same ? [...state.tags] : [];
  const eventId = next.audience === "crew" ? null : state.eventId;
  return { tags, eventId, changed: tags.length !== state.tags.length || eventId !== state.eventId };
}

/** La décision de plaque de la photo (ses cadres et « aucune plaque visible »), et l'état de la recherche. */
export type StoryPlateDraft = {
  rects: readonly PlateRect[];
  noPlate: boolean;
  detection: "pending" | "found" | "none" | "unavailable";
};

/** La plaque est-elle décidée ? Un cadre ajouté et resté où il est né n'est pas une décision. */
export const storyPlateDecided = (p: Pick<StoryPlateDraft, "rects" | "noPlate">): boolean =>
  p.noPlate || framesPlaced(p.rects);

/** Ce qui manque à la plaque, en une ligne (jamais un bouton grisé sans raison), ou `null`. */
export function storyPlateIssue(p: StoryPlateDraft): string | null {
  if (p.detection === "pending") return L.plateSearching;
  if (storyPlateDecided(p)) return null;
  return p.rects.length > 0 ? L.platePlace : L.plateMissing;
}

/** Ce qui empêche de publier, en une ligne qui dit quoi, ou `null`. */
export function storyPublishIssue(draft: {
  hasPhoto: boolean;
  preparing?: boolean;
  /** `null` : une vidéo, publiée telle quelle, sans décision de plaque (lot R7g). */
  plate: StoryPlateDraft | null;
  caption: string;
  needsCrew?: boolean;
  /** Le public choisi n'existe plus (crew quitté ou supprimé, casquette changée) : rien ne part avant un nouveau choix. */
  audienceLost?: boolean;
}): string | null {
  if (draft.preparing) return L.preparing;
  if (!draft.hasPhoto) return L.missingPhoto;
  const plate = draft.plate ? storyPlateIssue(draft.plate) : null;
  if (plate) return plate;
  if (draft.audienceLost) return L.audienceLost;
  if (draft.needsCrew) return L.missingCrew;
  if (draft.caption.trim().length > STORY_CAPTION_MAX) return L.captionTooLong;
  return null;
}

/** Le texte du lieu : rogné, borné ; vide = pas de lieu. Jamais une coordonnée. */
export function storyPlaceText(raw: string): string | null {
  const text = raw.trim().slice(0, STORY_PLACE_MAX);
  return text || null;
}

/**
 * Le corps de `POST /me/stories` (photo). Les rectangles de plaque restent dans les coordonnées de la photo d'origine (le
 * serveur les transforme avec `frame`) ; sans rectangle, « aucune plaque visible » confirmée : l'un ou l'autre, jamais les
 * deux (l'API refuse sans décision, `plate_decision_required`).
 */
export function storyBody(draft: {
  uploadKey: string;
  frame: Frame;
  rects: readonly PlateRect[];
  noPlate: boolean;
  audience: StoryAudience;
  crewId: string | null;
  author: StoryAuthor;
  caption: string;
  place: string;
  vehicleId: string | null;
  eventId: string | null;
  tags: readonly { id: string }[];
  /** Mention « Collaboration commerciale » posée à la main (R7m2) ; un partenaire actif cité est posé par l'API. */
  commercialPartnerId?: string | null;
}) {
  const blurred = draft.rects.length > 0;
  return {
    uploadKey: draft.uploadKey,
    frame: clampFrame(draft.frame),
    plateRects: blurred ? draft.rects.map((r) => ({ ...r })) : null,
    noPlateConfirmed: !blurred && draft.noPlate,
    audience: draft.audience,
    ...(draft.audience === "crew" && draft.crewId ? { crewId: draft.crewId } : {}),
    persona: draft.author.persona,
    ...(draft.author.persona === "organizer" && draft.author.structureId
      ? { structureId: draft.author.structureId }
      : {}),
    ...(draft.author.persona === "pro" && draft.author.proId ? { proId: draft.author.proId } : {}),
    caption: draft.caption.trim() || null,
    placeLabel: storyPlaceText(draft.place),
    ...(draft.vehicleId ? { vehicleId: draft.vehicleId } : {}),
    ...(draft.eventId && draft.audience !== "crew" ? { eventId: draft.eventId } : {}),
    tags: draft.tags.map((t) => ({ kind: "user" as const, id: t.id })),
    ...(draft.commercialPartnerId ? { commercialPartnerId: draft.commercialPartnerId } : {}),
  };
}

/**
 * Le corps de `POST /me/stories` d'une **vidéo** (lot R7g) : `uploadKey` est l'envoi `story_video`, `posterKey` la vignette.
 * Ni cadre ni décision de plaque : la vidéo est publiée telle quelle.
 */
export function storyVideoBody(
  draft: Omit<Parameters<typeof storyBody>[0], "frame" | "rects" | "noPlate"> & { posterKey: string },
) {
  const {
    frame: _f,
    plateRects: _p,
    noPlateConfirmed: _n,
    ...rest
  } = storyBody({
    ...draft,
    frame: { scale: 1, offsetX: 0, offsetY: 0 },
    rects: [],
    noPlate: false,
  });
  return { ...rest, posterKey: draft.posterKey };
}

/**
 * Envoie la photo puis crée la story, sauf si l'écran a été fermé entre-temps (`alive` faux juste avant la création :
 * rien n'est publié, la photo déjà envoyée reste sans story et sera balayée par le serveur).
 */
export async function sendIfAlive<T>(
  alive: () => boolean,
  upload: () => Promise<void>,
  create: () => Promise<T>,
): Promise<{ sent: false } | { sent: true; value: T }> {
  await upload();
  if (!alive()) return { sent: false };
  return { sent: true, value: await create() };
}
