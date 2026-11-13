import { albumTagLabels } from "../labels/albumTags.fr";
import type { AlbumMention, AlbumTagView, Taggable } from "../schemas/albumTags";

// Ce que l'appli et le site affichent d'une identification (lot R9f, partie 2) : règles pures, une seule pour les deux. L'API décide de
// tout (qui identifie, qui voit, qui retire) ; ici seulement le rôle de celui qui regarde et la phrase « identifiée par … ».

/** Qui regarde un album : le média auteur, l'organisateur, un passionné qui peut s'identifier (`tagged`), ou tout autre membre. */
export type AlbumViewerRole = "media" | "organizer" | "tagged" | "member";

/**
 * Qui je suis pour identifier sur cet album. Le média auteur identifie toute voiture du plateau ; le responsable de l'événement aussi
 * (second facteur exigé par l'API, sinon il redevient un passionné) ; un passionné seulement sa voiture ou son pseudo ; les autres
 * ne peuvent rien poser.
 */
export function albumViewerRoleOf(input: {
  mine: boolean;
  taggable: Pick<Taggable, "role" | "vehicles" | "people"> | null;
}): AlbumViewerRole {
  if (input.mine) return "media";
  const t = input.taggable;
  if (!t) return "member";
  if (t.role === "organizer") return "organizer";
  if (t.role === "media") return "media";
  // « C'est ma voiture » : seulement si j'ai une voiture identifiable à l'événement, ou si mon pseudo l'est.
  return t.vehicles.length > 0 || t.people.length > 0 ? "tagged" : "member";
}

/** La phrase « qui je suis » sous la photo (`r9who`) ; `null` pour un membre qui ne peut rien poser. */
export function whoLabelOf(role: AlbumViewerRole): string | null {
  if (role === "media") return albumTagLabels.mediaAuthor;
  if (role === "organizer") return albumTagLabels.eventOrganizer;
  if (role === "tagged") return albumTagLabels.carOwnerPresent;
  return null;
}

/**
 * « identifiée par toi | <média> | l'organisateur | son propriétaire » : moi si j'ai posé cette identification (l'intéressé pour lui-même,
 * le média ou l'organisateur pour la sienne : la croix `tagger`), sinon celui qui l'a posée.
 */
export function taggedByText(
  tag: Pick<AlbumTagView, "taggedAs" | "mine" | "removeAs">,
  viewer: AlbumViewerRole,
  mediaName: string,
): string {
  const byMe =
    (tag.taggedAs === "owner" && tag.mine) ||
    (tag.removeAs === "tagger" && tag.taggedAs === "media" && viewer === "media") ||
    (tag.removeAs === "tagger" && tag.taggedAs === "organizer" && viewer === "organizer");
  if (byMe) return albumTagLabels.identifiedByYou;
  if (tag.taggedAs === "media") return albumTagLabels.identifiedBy(mediaName);
  if (tag.taggedAs === "organizer") return albumTagLabels.identifiedBy(albumTagLabels.screens.organizerName);
  return albumTagLabels.identifiedBy(albumTagLabels.screens.ownerName);
}

/** Le texte d'une ligne de « Tes photos » : « Identifiée par <média> | toi | l'organisateur ». */
export function myPhotoTaggedBy(by: "media" | "organizer" | "me", mediaName: string): string {
  if (by === "me") return albumTagLabels.identifiedByYouCap;
  if (by === "organizer") return albumTagLabels.identifiedByCap(albumTagLabels.screens.organizerName);
  return albumTagLabels.identifiedByCap(mediaName);
}

/**
 * « N photos de ta <voiture> · <média> » (souvenir « Il y a un an ») ou « N photos où tu es identifié · <média> » : le total des photos
 * de mes identifications d'un événement et le ou les médias, **sans** doublon. `null` sans photo.
 */
export function mentionsSummary(
  mentions: readonly Pick<AlbumMention, "count" | "mediaName">[] | undefined,
  vehicleLabel: string | null,
): { count: number; media: string; line: string } | null {
  if (!mentions || mentions.length === 0) return null;
  const count = mentions.reduce((n, m) => n + m.count, 0);
  if (count === 0) return null;
  const media = [...new Set(mentions.map((m) => m.mediaName))].join(", ");
  const head = vehicleLabel
    ? albumTagLabels.photosOfYourCar(count, vehicleLabel)
    : albumTagLabels.photosWhereIdentified(count);
  return { count, media, line: `${head} · ${media}` };
}

/**
 * « Voir plus » du plateau à choisir : la page suivante s'ajoute à celles déjà lues (sans doublon : une voiture déjà montrée ne revient
 * pas), le curseur et le reste (rôle, puces, repli, personnes) sont ceux de la **dernière** réponse.
 */
export function appendTaggablePage(prev: Taggable, next: Taggable): Taggable {
  const seen = new Set(prev.vehicles.map((v) => v.vehicleId));
  return { ...next, vehicles: [...prev.vehicles, ...next.vehicles.filter((v) => !seen.has(v.vehicleId))] };
}

/** L'onglet « Personnes » existe dès qu'on peut en proposer : une recherche de deux caractères, ou « moi » rendu sans recherche par l'API. */
export function showPeopleTab(searchLongEnough: boolean, peopleCount: number): boolean {
  return searchLongEnough || peopleCount > 0;
}

/**
 * Une « génération » d'opération asynchrone : `start()` rend une fonction qui n'est vraie que tant qu'aucune autre opération n'a démarré et
 * qu'aucune `invalidate()` n'a eu lieu. Sert aux réponses qui arrivent dans le désordre (« Voir plus » du plateau après un changement de
 * recherche, d'album ou une réouverture) et à « Enregistrer » (jamais repris après une perte de focus).
 */
export function createOperationGate() {
  let n = 0;
  return {
    start(): () => boolean {
      const id = ++n;
      return () => n === id;
    },
    invalidate() {
      n += 1;
    },
  };
}

/**
 * Les lectures du plateau : la lecture de liste (recherche, puce, album, réouverture) et les pages « Voir plus » ont chacune leur
 * compteur. Une nouvelle lecture de liste périme les pages en route ; une page ne périme jamais la lecture de liste, et seule la
 * dernière page démarrée, lancée sur la même liste, est appliquée.
 */
export function createPagedReads() {
  let list = 0;
  let page = 0;
  return {
    startList(): () => boolean {
      const id = ++list;
      page += 1;
      return () => list === id;
    },
    startPage(): () => boolean {
      const l = list;
      const p = ++page;
      return () => list === l && page === p;
    },
    invalidate() {
      list += 1;
      page += 1;
    },
  };
}

/**
 * Les boutons « Revoir mes photos » d'un souvenir : **un par album** (un seul : le libellé simple ; plusieurs : le média et le rang, pour les
 * distinguer). Appli et site les rendent tels quels.
 */
export function reviewButtonsOf(
  albums: readonly Pick<AlbumMention, "albumId" | "mediaName">[] | undefined,
): { albumId: string; label: string }[] {
  const list = albums ?? [];
  return list.map((m, i) => ({
    albumId: m.albumId,
    label: list.length > 1 ? albumTagLabels.screens.reviewAlbum(m.mediaName, i + 1) : albumTagLabels.reviewMyPhotos,
  }));
}
