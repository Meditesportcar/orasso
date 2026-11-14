// Conversation entre une personne et la page d'un média (`media`, lot R9i, T55 à T60). Deux lecteurs, tous deux
// `side: "member"` (aucun second facteur : le titulaire n'est pas « côté structure ») : la personne qui écrit (l'identifiant
// porté par la clé `media:<page>:<compte>`) et le titulaire de la page (`media_profiles.user_id`, page non supprimée), droits
// recalculés à chaque appel. La personne voit la page sous son nom et son logo et **jamais le compte du titulaire** : le
// masque (`mask`) remplace, pour elle, tout auteur qui n'est pas elle par la clé d'auteur de la page (`m:<id>`).
import { authorKeyOf, parseMediaKey } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { albumPhotoTags, eventAlbumPhotos, eventAlbums, mediaProfiles, profiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import type { ConversationRow, KindRules, Mask, Reader } from "./types";

/** La page d'une conversation (même supprimée : son nom et son logo sont alors ceux que l'anonymisation a laissés). */
async function pageOf(ex: Executor, conversation: ConversationRow) {
  if (!conversation.mediaId) return null;
  const [row] = await ex
    .select({
      id: mediaProfiles.id,
      userId: mediaProfiles.userId,
      name: mediaProfiles.name,
      logoKey: mediaProfiles.logoKey,
      deletedAt: mediaProfiles.deletedAt,
    })
    .from(mediaProfiles)
    .where(eq(mediaProfiles.id, conversation.mediaId));
  return row ?? null;
}

/** Un compte non supprimé, avec son pseudo et sa photo. */
async function personOf(ex: Executor, userId: string) {
  const [row] = await ex
    .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt)));
  return row ?? null;
}

/** Le compte qui écrit à la page (porté par la clé de la conversation). */
const fanIdOf = (conversation: ConversationRow) => parseMediaKey(conversation.directKey)?.userId ?? null;

/** Le titulaire de la page, tant que la page existe et que son compte n'est pas supprimé. */
async function ownerOf(ex: Executor, conversation: ConversationRow) {
  const page = await pageOf(ex, conversation);
  if (!page || page.deletedAt) return null;
  return personOf(ex, page.userId);
}

/**
 * Une personne peut ouvrir la conversation d'une page quand elle y est identifiée (sa voiture ou son pseudo) sur une
 * photo d'un album **publié** et non supprimé de ce média : le besoin de « Tes photos ». Aucun état du titulaire n'entre
 * dans la décision (suspendu, banni : la page reste publique, un refus dirait l'état d'un compte).
 */
export async function canOpenWithMedia(ex: Executor, userId: string, mediaId: string): Promise<boolean> {
  const [row] = await ex
    .select({ id: albumPhotoTags.id })
    .from(albumPhotoTags)
    .innerJoin(eventAlbumPhotos, eq(eventAlbumPhotos.id, albumPhotoTags.photoId))
    .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
    .where(
      and(
        eq(albumPhotoTags.userId, userId),
        isNull(albumPhotoTags.removedAt),
        isNull(eventAlbumPhotos.deletedAt),
        eq(eventAlbums.mediaProfileId, mediaId),
        eq(eventAlbums.status, "published"),
        sql`${eventAlbums.deletedAt} is null`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export const mediaRules: KindRules = {
  kind: "media",

  async readers(ex, conversation) {
    const out: Reader[] = [];
    const fanId = fanIdOf(conversation);
    if (fanId && (await personOf(ex, fanId))) out.push({ userId: fanId, side: "member" });
    const owner = await ownerOf(ex, conversation);
    if (owner && owner.userId !== fanId) out.push({ userId: owner.userId, side: "member" });
    return out;
  },

  async writeBlock(ex, conversation) {
    const owner = await ownerOf(ex, conversation);
    if (!owner) return "closed";
    const fanId = fanIdOf(conversation);
    if (!fanId || !(await personOf(ex, fanId))) return "account_deleted";
    return null;
  },

  async describe(ex, conversation, viewer) {
    const page = await pageOf(ex, conversation);
    const logoUrl = storage.url(page?.logoKey ?? null);
    const name = page?.name ?? "Média supprimé";
    const pageView = (mine: boolean) =>
      page ? { key: authorKeyOf("media", page.id), id: page.id, name, logoUrl, mine } : null;
    const fanId = fanIdOf(conversation);
    if (viewer.userId === fanId) {
      return {
        title: name,
        subtitle: null,
        avatarUrl: logoUrl,
        participants: [name],
        otherUser: null,
        structure: null,
        page: pageView(false),
      };
    }
    const fan = fanId ? await personOf(ex, fanId) : null;
    const avatarUrl = storage.url(fan?.avatarKey ?? null);
    return {
      title: fan?.pseudo ?? "Compte supprimé",
      subtitle: name,
      avatarUrl,
      participants: fan ? [fan.pseudo] : [],
      otherUser: fan ? { userId: fan.userId, pseudo: fan.pseudo, avatarUrl } : null,
      structure: null,
      page: pageView(true),
    };
  },

  /** Pour la personne : la page. Pour le titulaire : rien (il voit les vrais comptes, le sien et celui de la personne). */
  async mask(ex, conversation, viewer): Promise<Mask | null> {
    if (viewer.userId !== fanIdOf(conversation)) return null;
    const page = await pageOf(ex, conversation);
    if (!page) return null;
    return { userId: authorKeyOf("media", page.id), pseudo: page.name, avatarKey: page.logoKey };
  },
};
