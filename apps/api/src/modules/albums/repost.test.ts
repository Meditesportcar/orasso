// Lot R9g (T44, T45, T47) : la reprise d'une photo d'album dans le journal de l'événement (crédit conservé, plaque, droits, doublon),
// le crédit servi (liste blanche), l'export 4:5 d'une publication créditée, et la notification `album_published`.
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { addMember, call, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { eventAlbumPhotos, feedPostPhotos, feedPosts, notifications, session, user } from "../../db/schema";
import { rateRecord } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import {
  accredit,
  addPhoto,
  draftOf,
  INSIDE,
  keysOf,
  mediaUser,
  OUTSIDE,
  organizerEvent,
  paris,
  photoRows,
  spread,
} from "./albums-test-helpers";

afterAll(async () => {
  await pool.end();
});

let orga: TestUser;
let eventId: string;
let structureId: string;
let leo: TestUser;
let leoMedia: string;
let albumId: string;

const repost = (u: TestUser | null, photo: string, body?: unknown, album = albumId, event = eventId) =>
  call(u, "POST", `/events/${event}/albums/${album}/photos/${photo}/repost`, body);

/** Un album publié de Léo dont les trois photos ont les trois décisions de plaque. */
async function threeDecisions() {
  const album = await draftOf(leo, eventId);
  const kinds = ["blurred", "none", "kept"] as const;
  for (const decision of kinds) {
    const res = await addPhoto(leo, album.id, { decision });
    if (res.status !== 201) throw new Error(`Ajout ${res.status} : ${res.text}`);
  }
  const pub = await call(leo, "POST", `/me/albums/${album.id}/publish`);
  if (pub.status !== 200) throw new Error("publication");
  return { id: album.id, photos: await photoRows(album.id) };
}

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  const s = await organizerEvent();
  orga = s.orga;
  eventId = s.event.id;
  structureId = s.structure.id;
  const media = await mediaUser("Leo_Media", "Sud Cars");
  leo = media.user;
  leoMedia = media.mediaId;
  await accredit(leo, leoMedia, eventId);
});

describe("POST /events/:id/albums/:albumId/photos/:photoId/repost", () => {
  it("crée une publication de la structure : une photo, crédit servi, légende par défaut, rôle organizer", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const res = await repost(orga, a.photos[1]?.id as string);
    expect(res.status).toBe(201);
    expect(res.json.caption).toBe("Photo : Sud Cars");
    expect(res.json.photos).toHaveLength(1);
    expect(res.json.photos[0].credit).toEqual({ mediaKey: `m:${leoMedia}`, mediaName: "Sud Cars", albumId });
    // Liste blanche du crédit : jamais le compte derrière le média.
    expect([...keysOf(res.json.photos[0].credit)].sort()).toEqual(["albumId", "mediaKey", "mediaName"]);
    const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, res.json.id));
    expect(post).toMatchObject({
      persona: "organizer",
      structureId,
      eventId,
      eventRole: "organizer",
      authorId: orga.id,
    });
    expect(post?.importantReason).toBeNull();
  });

  it("légende choisie : gardée telle quelle", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const res = await repost(orga, a.photos[1]?.id as string, { caption: "  Merci à Sud Cars !  " });
    expect(res.status).toBe(201);
    expect(res.json.caption).toBe("Merci à Sud Cars !");
  });

  it("plaque : blurred copiée telle quelle, none → no_plate_confirmed, kept → copie FLOUTÉE (pixels changés)", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const [blurred, none, kept] = a.photos;
    const flags = async (postId: string) => {
      const [p] = await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, postId));
      return p;
    };
    const r1 = await repost(orga, blurred?.id as string);
    expect(await flags(r1.json.id)).toMatchObject({
      plateBlurred: true,
      creditMediaId: leoMedia,
      sourceAlbumPhotoId: blurred?.id,
    });
    const r2 = await repost(orga, none?.id as string);
    expect(await flags(r2.json.id)).toMatchObject({ plateBlurred: false, noPlateConfirmed: true });
    // La photo « gardée telle quelle » : l'original de l'album reste net, la copie du journal est floutée dans le cadre.
    const r3 = await repost(orga, kept?.id as string);
    const copy = await flags(r3.json.id);
    expect(copy).toMatchObject({ plateBlurred: true, creditMediaId: leoMedia });
    const original = await spread(kept?.storageKey as string, INSIDE);
    expect(original).toBeGreaterThan(50);
    expect(await spread(copy?.storageKey as string, INSIDE)).toBeLessThan(original / 3);
    expect(await spread(copy?.storageKey as string, OUTSIDE)).toBeGreaterThan(50);
    // La photo de l'album n'a pas bougé.
    expect(await storage.get(kept?.storageKey as string)).not.toBeNull();
  });

  it("une photo d'ancienne galerie (plaque inconnue) : 409 plate_unknown, rien n'est écrit", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const photo = a.photos[1]?.id as string;
    await db.update(eventAlbumPhotos).set({ plateState: "unknown" }).where(eq(eventAlbumPhotos.id, photo));
    const res = await repost(orga, photo);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("plate_unknown");
    expect(res.json.error.message).toBe("Cette photo d'une ancienne galerie ne peut pas être reprise.");
    expect(await db.select().from(feedPosts)).toHaveLength(0);
  });

  it("la même photo deux fois : 409 already_reposted ; deux reprises simultanées : une seule publication", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const photo = a.photos[1]?.id as string;
    expect((await repost(orga, photo)).status).toBe(201);
    const again = await repost(orga, photo);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("already_reposted");
    expect(again.json.error.message).toBe("Déjà reprise dans le journal.");
    const other = a.photos[0]?.id as string;
    const [x, y] = await Promise.all([repost(orga, other), repost(orga, other)]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect(await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.sourceAlbumPhotoId, other))).toHaveLength(1);
    // Supprimer la publication libère la photo : elle peut être reprise de nouveau.
    const first = await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.sourceAlbumPhotoId, photo));
    expect((await call(orga, "DELETE", `/me/feed-posts/${first[0]?.postId}`)).status).toBe(204);
    expect((await repost(orga, photo)).status).toBe(201);
  });

  it("album brouillon, retiré ou d'un média non accrédité : 404", async () => {
    const draft = await draftOf(leo, eventId);
    const added = await addPhoto(leo, draft.id, { decision: "none" });
    const draftPhoto = added.json.id as string;
    expect((await repost(orga, draftPhoto, undefined, draft.id)).status).toBe(404);
    const a = await threeDecisions();
    albumId = a.id;
    await db.execute(sql`update applications set status = 'refused' where user_id = ${leo.id}`);
    expect((await repost(orga, a.photos[1]?.id as string)).status).toBe(404);
    await db.execute(sql`update applications set status = 'accepted' where user_id = ${leo.id}`);
    expect((await repost(orga, crypto.randomUUID())).status).toBe(404);
    expect(await db.select().from(feedPosts)).toHaveLength(0);
  });

  it("droits : staff, autre structure, média, passionné 403 ; sans session 401 ; second facteur manquant 403", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const photo = a.photos[1]?.id as string;
    const staff = await signUp("Staff_66", { twoFactor: true });
    await addMember(structureId, staff.id, "staff");
    const other = await signUp("Autre_Orga", { twoFactor: true });
    await createStructure(other.id);
    const fan = await signUp("Fan_66");
    for (const u of [staff, other, leo, fan]) expect((await repost(u, photo)).status).toBe(403);
    expect((await repost(null, photo)).status).toBe(401);
    await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, orga.id));
    await db.update(session).set({ secondFactor: null }).where(eq(session.userId, orga.id));
    const res = await repost(orga, photo);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("two_factor_required");
    expect(await db.select().from(feedPosts)).toHaveLength(0);
  });

  it("une publication ordinaire : journal, épingle, commentaires, Fil ; le quota de publication est compté", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const res = await repost(orga, a.photos[1]?.id as string);
    const postId = res.json.id as string;
    const journal = await call(orga, "GET", `/events/${eventId}/feed-posts`);
    expect(journal.json.items.map((p: { id: string }) => p.id)).toContain(postId);
    expect(journal.json.items.find((p: { id: string }) => p.id === postId).photos[0].credit.mediaName).toBe("Sud Cars");
    expect((await call(orga, "PUT", `/events/${eventId}/feed-posts/${postId}/pin`)).status).toBe(200);
    const fan = await signUp("Fan_66");
    const comment = await call(fan, "POST", `/feed-posts/${postId}/comments`, {
      text: "Belle photo",
      clientId: crypto.randomUUID(),
    });
    expect(comment.status).toBe(201);
    // Quota : la limite de publications par heure s'applique aussi à une reprise.
    for (let i = 0; i < 20; i++) rateRecord("feedPost", orga.id);
    const limited = await repost(orga, a.photos[0]?.id as string);
    expect(limited.status).toBe(429);
  });

  it("le crédit ne se retire pas : PATCH ne le touche pas ; l'album supprimé garde la reprise, albumId devient null", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const res = await repost(orga, a.photos[1]?.id as string);
    const postId = res.json.id as string;
    await call(orga, "PATCH", `/me/feed-posts/${postId}`, { commercialPartnerId: null, credit: null });
    const [row] = await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, postId));
    expect(row?.creditMediaId).toBe(leoMedia);
    expect((await call(leo, "DELETE", `/me/albums/${a.id}`)).status).toBe(204);
    const after = await call(orga, "GET", `/feed-posts/${postId}`);
    expect(after.status).toBe(200);
    expect(after.json.photos[0].credit).toEqual({ mediaKey: `m:${leoMedia}`, mediaName: "Sud Cars", albumId: null });
    // L'ancien album n'est plus ouvrable.
    expect((await call(orga, "GET", `/albums/${a.id}`)).status).toBe(404);
  });

  it("l'export 4:5 d'une publication créditée garde ses dimensions ; une photo ordinaire n'a pas de champ credit", async () => {
    const a = await threeDecisions();
    albumId = a.id;
    const res = await repost(orga, a.photos[1]?.id as string);
    const plain = await call(orga, "GET", `/feed-posts/${res.json.id}/export`);
    expect(plain.status).toBe(200);
    const exported = await app.request(`/api/feed-posts/${res.json.id}/export`, { headers: { cookie: orga.cookie } });
    const meta = await sharp(Buffer.from(await exported.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
    // Une publication ordinaire de la structure : la forme d'avant, sans `credit`.
    const id = crypto.randomUUID();
    await db.insert(feedPosts).values({
      id,
      authorId: orga.id,
      persona: "organizer",
      structureId,
      eventId,
      eventRole: "organizer",
      caption: "Ordinaire",
      department: "66",
    });
    await db.insert(feedPostPhotos).values({
      postId: id,
      storageKey: `private/feed/${id}/${"a".repeat(32)}.webp`,
      width: 100,
      height: 100,
      position: 0,
      noPlateConfirmed: true,
    });
    const view = await call(orga, "GET", `/feed-posts/${id}`);
    expect(Object.keys(view.json.photos[0]).sort()).toEqual(["height", "url", "width"]);
    // Aucune photo ordinaire n'a de crédit (migration : colonnes nulles par défaut).
    const credited = await db
      .select({ id: feedPostPhotos.id })
      .from(feedPostPhotos)
      .where(and(eq(feedPostPhotos.postId, id), isNull(feedPostPhotos.creditMediaId)));
    expect(credited).toHaveLength(1);
  });
});

describe("notification album_published (T47)", () => {
  it("une ligne par responsable, jamais l'auteur s'il est responsable, rangée dans la structure, sans push", async () => {
    const coOrga = await signUp("Co_Orga", { twoFactor: true });
    await addMember(structureId, coOrga.id, "co_organizer");
    const album = await draftOf(leo, eventId);
    await addPhoto(leo, album.id, { decision: "none" });
    await addPhoto(leo, album.id, { decision: "none" });
    expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(200);
    const rows = await db.select().from(notifications).where(eq(notifications.type, "album_published"));
    expect(rows.map((r) => r.userId).sort()).toEqual([orga.id, coOrga.id].sort());
    for (const r of rows) {
      expect(r.structureId).toBe(structureId);
      expect(r.title).toBe("Sud Cars a publié un album de 2 photos · Rassemblement du Lydia");
      expect(r.pushSentAt).toBeNull();
      expect(r.data).toMatchObject({ screen: "event-photos", albumId: album.id });
    }
    // Rejouer la publication ne renotifie pas.
    await call(leo, "POST", `/me/albums/${album.id}/publish`);
    expect(await db.select().from(notifications).where(eq(notifications.type, "album_published"))).toHaveLength(2);
  });

  it("l'auteur, quand il est aussi responsable de la structure, n'est pas prévenu", async () => {
    await addMember(structureId, leo.id, "co_organizer");
    const album = await draftOf(leo, eventId);
    await addPhoto(leo, album.id, { decision: "none" });
    await call(leo, "POST", `/me/albums/${album.id}/publish`);
    const rows = await db.select().from(notifications).where(eq(notifications.type, "album_published"));
    expect(rows.map((r) => r.userId)).toEqual([orga.id]);
  });
});
