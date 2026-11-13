// Lot R9e : albums des médias. Création d'un brouillon (un par événement), ajout d'une photo à la fois (décision de plaque
// obligatoire, rectangles gardés, floutage réel, rejeu, plafond de 200 sous verrou), publication, retrait, purge des brouillons,
// signalement d'une photo.
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { call, createEvent, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { eventAlbums, events, reports, uploads } from "../../db/schema";
import { storage } from "../../lib/storage";
import { retryRemove } from "../vehicles/photos-blur";
import {
  accredit,
  addPhoto,
  albumRow,
  draftOf,
  INSIDE,
  mediaUser,
  OUTSIDE,
  organizerEvent,
  paris,
  photoRows,
  publishedAlbum,
  RECT,
  sendUpload,
  spread,
} from "./albums-test-helpers";
import { lockOwnAlbum } from "./guards";
import { purgeDrafts } from "./publish";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let leo: TestUser;
let leoMedia: string;
let eventId: string;
let eventSlug: string;
let orga: TestUser;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(11, 5, 12));
  const scenario = await organizerEvent();
  orga = scenario.orga;
  eventId = scenario.event.id;
  eventSlug = scenario.event.slug;
  const media = await mediaUser("Leo_Media");
  leo = media.user;
  leoMedia = media.mediaId;
  await accredit(leo, leoMedia, eventId);
});

describe("POST /me/albums : le brouillon", () => {
  it("crée un brouillon pour un événement où le média est accrédité (201), titre par défaut servi", async () => {
    const res = await call(leo, "POST", "/me/albums", { eventId });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      status: "draft",
      title: "Les photos du Rassemblement du Lydia",
      photosCount: 0,
      allowSave: false,
      official: false,
      publishedAt: null,
      mine: true,
      media: { key: `m:${leoMedia}`, name: "Sud Cars" },
    });
    expect(res.json.event).toMatchObject({ id: eventId, slug: eventSlug });
  });

  it("un seul brouillon par événement et par média : le second appel rend le premier (200)", async () => {
    const a = await call(leo, "POST", "/me/albums", { eventId });
    const b = await call(leo, "POST", "/me/albums", { eventId, title: "Autre titre" });
    expect(b.status).toBe(200);
    expect(b.json.id).toBe(a.json.id);
    expect((await db.select().from(eventAlbums)).length).toBe(1);
  });

  it("un autre média accrédité a son propre brouillon sur le même événement", async () => {
    const other = await mediaUser("Marc_Photo", "Marc Photo");
    await accredit(other.user, other.mediaId, eventId);
    const a = await draftOf(leo, eventId);
    const b = await draftOf(other.user, eventId);
    expect(a.id).not.toBe(b.id);
  });

  it("rejouer la création avec le même clientId rend le même album, publié ou non", async () => {
    const clientId = crypto.randomUUID();
    const a = await call(leo, "POST", "/me/albums", { eventId, clientId });
    const b = await call(leo, "POST", "/me/albums", { eventId, clientId });
    expect(b.json.id).toBe(a.json.id);
    expect((await db.select().from(eventAlbums)).length).toBe(1);
  });

  it("refuse : sans session (401), sans profil média (404), non accrédité (403 not_accredited), événement inconnu ou non publié (404)", async () => {
    expect((await call(null, "POST", "/me/albums", { eventId })).status).toBe(401);
    const fan = await signUp("Kenji_66");
    expect((await call(fan, "POST", "/me/albums", { eventId })).status).toBe(404);
    const other = await mediaUser("Marc_Photo", "Marc Photo");
    const refused = await call(other.user, "POST", "/me/albums", { eventId });
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("not_accredited");
    const unknown = await call(leo, "POST", "/me/albums", { eventId: crypto.randomUUID() });
    expect(unknown.status).toBe(404);
    // Un événement annulé n'accepte plus de nouvel album.
    await db.execute(sql`update events set status = 'cancelled' where id = ${eventId}`);
    expect((await call(leo, "POST", "/me/albums", { eventId })).status).toBe(404);
  });

  it("une accréditation en attente, refusée ou retirée ne suffit pas (403)", async () => {
    for (const status of ["pending", "refused", "withdrawn"] as const) {
      const m = await mediaUser(`Media_${status}`, `Media ${status}`);
      await accredit(m.user, m.mediaId, eventId, status);
      const res = await call(m.user, "POST", "/me/albums", { eventId });
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe("not_accredited");
    }
  });

  it("l'organisateur et un passionné ne créent pas d'album (pas de profil média)", async () => {
    expect((await call(orga, "POST", "/me/albums", { eventId })).status).toBe(404);
  });

  it("un compte suspendu lit, n'écrit pas", async () => {
    await db.execute(sql`update profiles set suspended_until = now() + interval '3 days' where user_id = ${leo.id}`);
    expect((await call(leo, "POST", "/me/albums", { eventId })).status).toBe(403);
  });
});

describe("POST /me/albums/:id/photos : une photo à la fois", () => {
  it("sans décision de plaque : 400 plate_decision_required", async () => {
    const album = await draftOf(leo, eventId);
    const sent = await sendUpload(leo);
    const res = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: sent.key,
      clientId: crypto.randomUUID(),
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("plate_decision_required");
  });

  it("« aucune plaque repérée » (none) : la photo est ajoutée, sans cadre ; la clé devient privée sous l'album", async () => {
    const album = await draftOf(leo, eventId);
    const res = await addPhoto(leo, album.id, { decision: "none" });
    expect(res.status).toBe(201);
    const rows = await photoRows(album.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plateState: "none", plateRects: null, position: 0 });
    expect(rows[0]?.storageKey).toMatch(new RegExp(`^private/albums/${album.id}/[0-9a-f]{32}\\.webp$`));
    // La photo est copiée sous sa clé d'album et l'envoi d'origine est effacé après la validation.
    expect(await storage.get(rows[0]?.storageKey as string)).not.toBeNull();
    expect(await storage.get(res.sent.key)).toBeNull();
    expect((await albumRow(album.id))?.photosCount).toBe(1);
    expect(res.json).toMatchObject({ position: 0, width: 400, height: 200 });
    expect(res.json.url).toMatch(new RegExp(`^/api/albums/${album.id}/photos/[0-9a-f]{32}\\.webp$`));
  });

  it("« Flouter et ajouter » (blurred) : les cadres sont gardés et la zone est réellement floutée", async () => {
    const album = await draftOf(leo, eventId);
    const res = await addPhoto(leo, album.id, { decision: "blurred" });
    expect(res.status).toBe(201);
    const [row] = await photoRows(album.id);
    expect(row).toMatchObject({ plateState: "blurred" });
    expect(row?.plateRects).toEqual([{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }]);
    expect(await spread(row?.storageKey as string, INSIDE)).toBeLessThan(40);
    expect(await spread(row?.storageKey as string, OUTSIDE)).toBeGreaterThan(80);
  });

  it("la décision « blurred » ne repose pas sur l'envoi : même envoyé sans cadre, le serveur floute la copie", async () => {
    const album = await draftOf(leo, eventId);
    const plain = await sendUpload(leo, "album_photo"); // l'envoi n'est pas flouté
    expect(await spread(plain.key, INSIDE)).toBeGreaterThan(80);
    const res = await addPhoto(leo, album.id, { decision: "blurred", upload: plain });
    expect(res.status).toBe(201);
    const [row] = await photoRows(album.id);
    expect(await spread(row?.storageKey as string, INSIDE)).toBeLessThan(40);
  });

  it("« Envoyer telle quelle » (kept) : la photo n'est pas floutée, les cadres sont gardés pour flouter une copie plus tard", async () => {
    const album = await draftOf(leo, eventId);
    const res = await addPhoto(leo, album.id, { decision: "kept" });
    expect(res.status).toBe(201);
    const [row] = await photoRows(album.id);
    expect(row).toMatchObject({ plateState: "kept" });
    expect(row?.plateRects).toEqual([{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }]);
    expect(await spread(row?.storageKey as string, INSIDE)).toBeGreaterThan(80);
  });

  it("des cadres avec « aucune plaque », ou sans cadre avec blurred/kept : 400", async () => {
    const album = await draftOf(leo, eventId);
    const a = await sendUpload(leo);
    const withRects = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: a.key,
      plateDecision: "none",
      plateRects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }],
      clientId: crypto.randomUUID(),
    });
    expect(withRects.status).toBe(400);
    const noRects = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: a.key,
      plateDecision: "kept",
      clientId: crypto.randomUUID(),
    });
    expect(noRects.status).toBe(400);
    expect(await photoRows(album.id)).toHaveLength(0);
  });

  it("les positions suivent l'ordre d'ajout ; photos_count est juste", async () => {
    const album = await draftOf(leo, eventId);
    for (let i = 0; i < 3; i++) expect((await addPhoto(leo, album.id)).status).toBe(201);
    expect((await photoRows(album.id)).map((p) => p.position)).toEqual([0, 1, 2]);
    expect((await albumRow(album.id))?.photosCount).toBe(3);
  });

  it("rejeu : le même clientId rend la même photo sans rien consommer ni compter", async () => {
    const album = await draftOf(leo, eventId);
    const clientId = crypto.randomUUID();
    const first = await addPhoto(leo, album.id, { clientId });
    const again = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: first.sent.key,
      plateDecision: "none",
      clientId,
    });
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(first.json.id);
    expect(await photoRows(album.id)).toHaveLength(1);
    expect((await albumRow(album.id))?.photosCount).toBe(1);
  });

  it("rejeu avec une autre décision de plaque : 409, la photo gardée ne change pas (réponse perdue après « telle quelle »)", async () => {
    const album = await draftOf(leo, eventId);
    const clientId = crypto.randomUUID();
    // « Telle quelle » : l'ajout réussit côté serveur, la réponse se perd côté client.
    const first = await addPhoto(leo, album.id, { clientId, decision: "kept" });
    expect(first.status).toBe(201);
    // « Changer → Flouter » : même clientId, autre décision.
    const sent = await sendUpload(leo, "album_photo", [RECT]);
    const again = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: sent.key,
      plateDecision: "blurred",
      plateRects: [RECT],
      clientId,
    });
    expect(again.status).toBe(409);
    const rows = await photoRows(album.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plateState).toBe("kept");
    // Le même rejeu, avec la même décision, rend toujours la même photo.
    const same = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: first.sent.key,
      plateDecision: "kept",
      plateRects: [RECT],
      clientId,
    });
    expect(same.status).toBe(200);
    expect(same.json.id).toBe(first.json.id);
  });

  it("annulation par clientId (tour 2) : avant l'ajout, la pierre tombale refuse l'ajout tardif (409) sans consommer son envoi", async () => {
    const album = await draftOf(leo, eventId);
    const clientId = crypto.randomUUID();
    // « Retirer » part avant que l'ajout (encore en route) ne soit validé : rien à retirer, l'annulation est gardée.
    const cancel = await call(leo, "DELETE", `/me/albums/${album.id}/photos/by-client/${clientId}`);
    expect(cancel.status).toBe(204);
    const sent = await sendUpload(leo, "album_photo");
    const late = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: sent.key,
      plateDecision: "none",
      clientId,
    });
    expect(late.status).toBe(409);
    // L'envoi n'est pas consommé (le client le supprime ensuite) et l'album n'a pas de photo.
    expect((await db.select().from(uploads).where(eq(uploads.key, sent.key))).length).toBe(1);
    expect((await albumRow(album.id))?.photosCount).toBe(0);
    expect((await photoRows(album.id)).filter((p) => p.deletedAt === null)).toHaveLength(0);
    // Idempotent : la même annulation rend le même succès.
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/by-client/${clientId}`)).status).toBe(204);
  });

  it("annulation par clientId : après l'ajout, la photo est retirée (compteur, positions) ; un rejeu de l'ajout est refusé ; idempotent", async () => {
    const album = await draftOf(leo, eventId);
    const keep = await addPhoto(leo, album.id);
    const clientId = crypto.randomUUID();
    const added = await addPhoto(leo, album.id, { clientId });
    expect(added.status).toBe(201);
    expect((await albumRow(album.id))?.photosCount).toBe(2);
    const cancel = await call(leo, "DELETE", `/me/albums/${album.id}/photos/by-client/${clientId}`);
    expect(cancel.status).toBe(204);
    expect((await albumRow(album.id))?.photosCount).toBe(1);
    expect((await photoRows(album.id)).filter((p) => p.deletedAt === null).map((p) => p.id)).toEqual([keep.json.id]);
    const replay = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: added.sent.key,
      plateDecision: "none",
      clientId,
    });
    expect(replay.status).toBe(409);
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/by-client/${clientId}`)).status).toBe(204);
    expect((await albumRow(album.id))?.photosCount).toBe(1);
  });

  it("annulation et ajout simultanés (même clientId) : quel que soit l'ordre, aucune photo ne reste dans l'album", async () => {
    for (let round = 0; round < 4; round++) {
      const album = await draftOf(leo, eventId);
      const clientId = crypto.randomUUID();
      const sent = await sendUpload(leo, "album_photo");
      const [add, cancel] = await Promise.all([
        call(leo, "POST", `/me/albums/${album.id}/photos`, { uploadKey: sent.key, plateDecision: "none", clientId }),
        call(leo, "DELETE", `/me/albums/${album.id}/photos/by-client/${clientId}`),
      ]);
      expect(cancel.status).toBe(204);
      expect([201, 409]).toContain(add.status);
      expect((await photoRows(album.id)).filter((p) => p.deletedAt === null)).toHaveLength(0);
      expect((await albumRow(album.id))?.photosCount).toBe(0);
    }
  });

  it("retrait par identifiant idempotent : déjà retiré = 204 (preuve), identifiant inconnu = 404 ; la dernière photo d'un album publié ne s'annule pas", async () => {
    const album = await draftOf(leo, eventId);
    const a = await addPhoto(leo, album.id);
    await addPhoto(leo, album.id);
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/${a.json.id}`)).status).toBe(204);
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/${a.json.id}`)).status).toBe(204);
    expect((await albumRow(album.id))?.photosCount).toBe(1);
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/${crypto.randomUUID()}`)).status).toBe(404);
  });

  it("droits de l'annulation : un AUTRE média accrédité (Marc) ne touche ni à la photo, ni à l'album de Léo (404, la photo reste), ni par identifiant déjà retiré (404, pas 204)", async () => {
    const album = await draftOf(leo, eventId);
    const clientId = crypto.randomUUID();
    const added = await addPhoto(leo, album.id, { clientId });
    await addPhoto(leo, album.id);
    const marc = await mediaUser("Marc_Media", "Marc Média");
    await accredit(marc.user, marc.mediaId, eventId);
    // Par `clientId` réel de Léo : 404 (verrou de l'album de Marc, pas celui de Léo), la photo de Léo reste.
    expect((await call(marc.user, "DELETE", `/me/albums/${album.id}/photos/by-client/${clientId}`)).status).toBe(404);
    expect((await call(marc.user, "DELETE", `/me/albums/${album.id}/photos/${added.json.id}`)).status).toBe(404);
    expect((await photoRows(album.id)).filter((p) => p.deletedAt === null)).toHaveLength(2);
    // Une photo déjà retirée par Léo : Marc reçoit 404 (jamais le 204 d'idempotence du titulaire).
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/${added.json.id}`)).status).toBe(204);
    expect((await call(marc.user, "DELETE", `/me/albums/${album.id}/photos/${added.json.id}`)).status).toBe(404);
    // Ni un compte sans profil média.
    const kenji = await signUp("Kenji_Cancel");
    expect((await call(kenji, "DELETE", `/me/albums/${album.id}/photos/by-client/${crypto.randomUUID()}`)).status).toBe(
      404,
    );
  });

  it("une pierre tombale n'empêche pas un ajout avec un AUTRE clientId (201, compteur juste) ; un clientId annulé sur un album ne touche pas l'autre", async () => {
    const a = await draftOf(leo, eventId);
    const cancelled = crypto.randomUUID();
    expect((await call(leo, "DELETE", `/me/albums/${a.id}/photos/by-client/${cancelled}`)).status).toBe(204);
    const other = await addPhoto(leo, a.id);
    expect(other.status).toBe(201);
    expect((await albumRow(a.id))?.photosCount).toBe(1);
    // Le même clientId reste refusé (409) ; un autre album n'est pas concerné.
    const sent = await sendUpload(leo, "album_photo");
    expect(
      (
        await call(leo, "POST", `/me/albums/${a.id}/photos`, {
          uploadKey: sent.key,
          plateDecision: "none",
          clientId: cancelled,
        })
      ).status,
    ).toBe(409);
    const [first] = await db.select({ structureId: events.structureId }).from(events).where(eq(events.id, eventId));
    const second = await createEvent(first?.structureId ?? "", {
      title: "Autre événement R9e",
      startsAt: paris(11, 9, 11),
      endsAt: paris(11, 9, 17),
    });
    await accredit(leo, leoMedia, second.id);
    const b = await draftOf(leo, second.id);
    const kept = crypto.randomUUID();
    expect((await addPhoto(leo, b.id, { clientId: kept })).status).toBe(201);
    // Annuler « kept » sur l'album A (où il n'existe pas) pose une pierre tombale dans A seulement : B garde sa photo.
    expect((await call(leo, "DELETE", `/me/albums/${a.id}/photos/by-client/${kept}`)).status).toBe(204);
    expect((await albumRow(b.id))?.photosCount).toBe(1);
    expect((await photoRows(b.id)).filter((p) => p.deletedAt === null)).toHaveLength(1);
  });

  it("annulation d'une photo : la dernière d'un album publié ne s'annule pas (409), l'album la garde", async () => {
    const solo = await publishedAlbum(leo, eventId, 1);
    const [only] = (await photoRows(solo.id)).filter((p) => p.deletedAt === null);
    expect(only?.clientId).toBeTruthy();
    expect((await call(leo, "DELETE", `/me/albums/${solo.id}/photos/by-client/${only?.clientId}`)).status).toBe(409);
  });

  it("le titulaire retrouve ses ajouts par clientId et le nombre de plaques floutées ; personne d'autre", async () => {
    const album = await draftOf(leo, eventId);
    const a = crypto.randomUUID();
    await addPhoto(leo, album.id, { clientId: a, decision: "blurred" });
    await addPhoto(leo, album.id, { decision: "kept" });
    await addPhoto(leo, album.id);
    const mine = await call(leo, "GET", `/albums/${album.id}`);
    expect(mine.status).toBe(200);
    expect(mine.json.blurredCount).toBe(1);
    expect(mine.json.photos.map((p: { clientId?: string }) => p.clientId)).toContain(a);
    // Une fois publié, un autre membre ne voit ni `clientId` ni `blurredCount`.
    expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(200);
    const kenji = await signUp("Kenji_Tour1");
    const other = await call(kenji, "GET", `/albums/${album.id}`);
    expect(other.status).toBe(200);
    expect(other.json.blurredCount).toBeUndefined();
    expect(other.json.photos.every((p: { clientId?: string }) => p.clientId === undefined)).toBe(true);
  });

  it("l'envoi d'un autre, d'un autre usage, ou déjà consommé : 400", async () => {
    const album = await draftOf(leo, eventId);
    const other = await signUp("Kenji_66");
    const foreign = await sendUpload(other, "album_photo");
    expect((await addPhoto(leo, album.id, { upload: foreign })).status).toBe(400);
    const otherPurpose = await sendUpload(leo, "media_content");
    expect((await addPhoto(leo, album.id, { upload: otherPurpose })).status).toBe(400);
    const ok = await addPhoto(leo, album.id);
    expect(ok.status).toBe(201);
    expect((await addPhoto(leo, album.id, { upload: ok.sent })).status).toBe(400);
    // Une clé qui n'est pas un envoi d'album : jamais lue.
    const forged = await call(leo, "POST", `/me/albums/${album.id}/photos`, {
      uploadKey: "private/albums/x/y.webp",
      plateDecision: "none",
      clientId: crypto.randomUUID(),
    });
    expect(forged.status).toBe(400);
    expect(await photoRows(album.id)).toHaveLength(1);
  });

  it("la 200e photo passe, la 201e est refusée (409 album_full) et son envoi n'est pas consommé", async () => {
    const album = await draftOf(leo, eventId);
    await db.update(eventAlbums).set({ photosCount: 199 }).where(eq(eventAlbums.id, album.id));
    expect((await addPhoto(leo, album.id)).status).toBe(201);
    expect((await albumRow(album.id))?.photosCount).toBe(200);
    const sent = await sendUpload(leo);
    const over = await addPhoto(leo, album.id, { upload: sent });
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe("album_full");
    const [up] = await db.select().from(uploads).where(eq(uploads.key, sent.key));
    expect(up?.consumedAt).toBeNull();
    expect((await albumRow(album.id))?.photosCount).toBe(200);
  });

  it("deux ajouts simultanés sous le plafond : un seul passe la 200e place", async () => {
    const album = await draftOf(leo, eventId);
    await db.update(eventAlbums).set({ photosCount: 199 }).where(eq(eventAlbums.id, album.id));
    const [a, b] = await Promise.all([sendUpload(leo), sendUpload(leo)]);
    const results = await Promise.all([addPhoto(leo, album.id, { upload: a }), addPhoto(leo, album.id, { upload: b })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await albumRow(album.id))?.photosCount).toBe(200);
    expect(await photoRows(album.id)).toHaveLength(1);
  });

  it("un album publié reçoit encore des photos (le lendemain) ; un album supprimé, non", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    expect((await addPhoto(leo, album.id)).status).toBe(201);
    expect((await albumRow(album.id))?.photosCount).toBe(2);
    expect((await call(leo, "DELETE", `/me/albums/${album.id}`)).status).toBe(204);
    expect((await addPhoto(leo, album.id)).status).toBe(404);
  });

  it("l'album d'un autre média, ou l'accréditation retirée : refusé", async () => {
    const album = await draftOf(leo, eventId);
    const other = await mediaUser("Marc_Photo", "Marc Photo");
    await accredit(other.user, other.mediaId, eventId);
    expect((await addPhoto(other.user, album.id)).status).toBe(404);
    await db.execute(sql`update applications set status = 'withdrawn' where media_profile_id = ${leoMedia}`);
    const res = await addPhoto(leo, album.id);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("not_accredited");
  });
});

describe("publication", () => {
  it("sans photo : 400 album_empty ; avec photo : publié, idempotent", async () => {
    const album = await draftOf(leo, eventId);
    const empty = await call(leo, "POST", `/me/albums/${album.id}/publish`);
    expect(empty.status).toBe(400);
    expect(empty.json.error.code).toBe("album_empty");
    await addPhoto(leo, album.id);
    clock.set(paris(11, 6, 9));
    const pub = await call(leo, "POST", `/me/albums/${album.id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.json).toMatchObject({ status: "published", photosCount: 1 });
    const publishedAt = (await albumRow(album.id))?.publishedAt;
    expect(publishedAt?.toISOString()).toBe(paris(11, 6, 9).toISOString());
    clock.set(paris(11, 7, 9));
    const again = await call(leo, "POST", `/me/albums/${album.id}/publish`);
    expect(again.status).toBe(200);
    expect((await albumRow(album.id))?.publishedAt?.toISOString()).toBe(publishedAt?.toISOString());
  });

  it("l'accréditation retirée avant la publication : 403 ; aucun e-mail ni notification en R9e", async () => {
    const album = await draftOf(leo, eventId);
    await addPhoto(leo, album.id);
    await db.execute(sql`update applications set status = 'refused' where media_profile_id = ${leoMedia}`);
    expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(403);
    await db.execute(sql`update applications set status = 'accepted' where media_profile_id = ${leoMedia}`);
    expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(200);
    const n = await db.execute(sql`select count(*)::int as n from notifications where type = 'album_published'`);
    expect((n.rows[0] as { n: number }).n).toBe(0);
  });

  it("l'album d'un autre ne se publie pas (404)", async () => {
    const album = await draftOf(leo, eventId);
    await addPhoto(leo, album.id);
    const other = await signUp("Kenji_66");
    expect((await call(other, "POST", `/me/albums/${album.id}/publish`)).status).toBe(404);
  });
});

describe("titre, enregistrement, retraits", () => {
  it("PATCH : le titre (vide = titre par défaut) et l'option « Enregistrer »", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const set = await call(leo, "PATCH", `/me/albums/${album.id}`, { title: "Nuit au Barcarès", allowSave: true });
    expect(set.status).toBe(200);
    expect(set.json).toMatchObject({ title: "Nuit au Barcarès", allowSave: true });
    const reset = await call(leo, "PATCH", `/me/albums/${album.id}`, { title: "" });
    expect(reset.json.title).toBe("Les photos du Rassemblement du Lydia");
    expect(reset.json.allowSave).toBe(true);
    expect((await call(leo, "PATCH", `/me/albums/${album.id}`, {})).status).toBe(400);
    expect((await call(leo, "PATCH", `/me/albums/${album.id}`, { title: "x".repeat(81) })).status).toBe(400);
  });

  it("DELETE d'une photo : repositionne les suivantes, efface le fichier ; la dernière d'un album publié ne part pas (409)", async () => {
    const album = await publishedAlbum(leo, eventId, 3);
    const rows = await photoRows(album.id);
    const middle = rows[1];
    const res = await call(leo, "DELETE", `/me/albums/${album.id}/photos/${middle?.id}`);
    expect(res.status).toBe(204);
    const left = (await photoRows(album.id)).filter((p) => !p.deletedAt);
    expect(left.map((p) => p.position)).toEqual([0, 1]);
    expect(left.map((p) => p.id)).toEqual([rows[0]?.id, rows[2]?.id]);
    expect(await storage.get(middle?.storageKey as string)).toBeNull();
    expect((await albumRow(album.id))?.photosCount).toBe(2);
    // Une photo ajoutée ensuite prend la place suivante, sans collision.
    expect((await addPhoto(leo, album.id)).status).toBe(201);
    expect((await photoRows(album.id)).filter((p) => !p.deletedAt).map((p) => p.position)).toEqual([0, 1, 2]);
    await call(leo, "DELETE", `/me/albums/${album.id}/photos/${left[0]?.id}`);
    const lastTwo = (await photoRows(album.id)).filter((p) => !p.deletedAt);
    await call(leo, "DELETE", `/me/albums/${album.id}/photos/${lastTwo[0]?.id}`);
    const last = (await photoRows(album.id)).filter((p) => !p.deletedAt);
    const refused = await call(leo, "DELETE", `/me/albums/${album.id}/photos/${last[0]?.id}`);
    expect(refused.status).toBe(409);
  });

  it("DELETE d'un album : supprimé, fichiers effacés après la validation, plus servi nulle part", async () => {
    const album = await publishedAlbum(leo, eventId, 2);
    const keys = (await photoRows(album.id)).map((p) => p.storageKey);
    expect((await call(leo, "DELETE", `/me/albums/${album.id}`)).status).toBe(204);
    for (const key of keys) expect(await storage.get(key)).toBeNull();
    expect((await call(leo, "GET", `/albums/${album.id}`)).status).toBe(404);
    expect((await call(leo, "GET", "/me/albums")).json.items).toHaveLength(0);
    const row = await albumRow(album.id);
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.photosCount).toBe(0);
    // Un autre brouillon peut ensuite être créé pour le même événement.
    expect((await call(leo, "POST", "/me/albums", { eventId })).status).toBe(201);
  });

  it("l'album d'un autre ne se modifie ni ne se supprime", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const other = await signUp("Kenji_66");
    expect((await call(other, "PATCH", `/me/albums/${album.id}`, { title: "Piraté" })).status).toBe(404);
    expect((await call(other, "DELETE", `/me/albums/${album.id}`)).status).toBe(404);
    expect((await call(orga, "DELETE", `/me/albums/${album.id}`)).status).toBe(404);
    expect((await albumRow(album.id))?.deletedAt).toBeNull();
  });
});

describe("tâche albums.draft-purge", () => {
  it("efface les brouillons sans activité depuis 7 jours (lignes et fichiers), jamais un album publié ni un brouillon récent", async () => {
    const old = await draftOf(leo, eventId);
    await addPhoto(leo, old.id);
    const oldKey = (await photoRows(old.id))[0]?.storageKey as string;
    const other = await mediaUser("Marc_Photo", "Marc Photo");
    await accredit(other.user, other.mediaId, eventId);
    const fresh = await draftOf(other.user, eventId);
    const published = await publishedAlbum(other.user, eventId, 1);
    // Six jours et demi : encore là ; sept jours : purgé.
    const at = new Date("2026-11-20T10:00:00Z");
    await db.execute(
      sql`update event_albums set updated_at = ${new Date("2026-11-13T10:00:00Z").toISOString()}::timestamptz where id = ${old.id}`,
    );
    await db.execute(
      sql`update event_albums set updated_at = ${new Date("2026-11-13T10:00:01Z").toISOString()}::timestamptz where id = ${fresh.id}`,
    );
    await db.execute(
      sql`update event_albums set updated_at = ${new Date("2026-11-01T10:00:00Z").toISOString()}::timestamptz where id = ${published.id}`,
    );
    expect(await purgeDrafts(at)).toBe(1);
    expect(await albumRow(old.id)).toBeUndefined();
    expect(await storage.get(oldKey)).toBeNull();
    expect(await photoRows(old.id)).toHaveLength(0);
    expect(await albumRow(fresh.id)).toBeDefined();
    expect(await albumRow(published.id)).toBeDefined();
    expect(await purgeDrafts(at)).toBe(0);
  });
});

describe("signalement d'une photo (cible album_photo)", () => {
  it("un passionné signale une photo d'un album visible ; un brouillon ou un album supprimé reste introuvable", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const [photo] = await photoRows(album.id);
    const fan = await signUp("Kenji_66");
    const res = await call(fan, "POST", "/reports", {
      targetType: "album_photo",
      targetId: photo?.id,
      reason: "plate_or_face",
    });
    expect(res.status).toBe(201);
    const [report] = await db.select().from(reports);
    expect(report).toMatchObject({ targetType: "album_photo", targetId: photo?.id });
    // Un brouillon n'est pas visible d'un autre : sa photo n'est pas signalable (404, comme sa lecture).
    const own = await draftOf(leo, eventId);
    const draftPhoto = await addPhoto(leo, own.id);
    const hidden = await call(fan, "POST", "/reports", {
      targetType: "album_photo",
      targetId: draftPhoto.json.id,
      reason: "spam",
    });
    expect(hidden.status).toBe(404);
    // Un motif qui n'existe pas pour ce type est refusé.
    const wrong = await call(fan, "POST", "/reports", {
      targetType: "album_photo",
      targetId: photo?.id,
      reason: "scam",
    });
    expect(wrong.status).toBe(400);
  });
});

describe("verrous (Codex 2 et 3)", () => {
  it("la purge ignore un brouillon verrouillé par un usage en cours (skip locked), puis le purge une fois libre", async () => {
    const draft = await draftOf(leo, eventId);
    await db.execute(sql`update event_albums set updated_at = '2026-11-01T00:00:00Z' where id = ${draft.id}`);
    const at = new Date("2026-11-20T00:00:00Z");
    await db.transaction(async (tx) => {
      await lockOwnAlbum(tx, draft.id, leoMedia);
      expect(await purgeDrafts(at)).toBe(0);
    });
    expect(await albumRow(draft.id)).toBeDefined();
    expect(await purgeDrafts(at)).toBe(1);
    expect(await albumRow(draft.id)).toBeUndefined();
  });

  it("deux ajouts concurrents avec l'identifiant en minuscules et en majuscules à 199 photos : un seul passe", async () => {
    const album = await draftOf(leo, eventId);
    await db.update(eventAlbums).set({ photosCount: 199 }).where(eq(eventAlbums.id, album.id));
    const [a, b] = await Promise.all([sendUpload(leo), sendUpload(leo)]);
    const results = await Promise.all([
      addPhoto(leo, album.id.toLowerCase(), { upload: a }),
      addPhoto(leo, album.id.toUpperCase(), { upload: b }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await albumRow(album.id))?.photosCount).toBe(200);
  });

  it("la publication d'un album retiré entre-temps ne répond pas « publié »", async () => {
    const album = await draftOf(leo, eventId);
    await addPhoto(leo, album.id);
    await db.update(eventAlbums).set({ deletedAt: new Date() }).where(eq(eventAlbums.id, album.id));
    expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(404);
  });
});

describe("effacement persistant des fichiers (Codex 6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("un premier effacement en échec est replanifié (storage.remove) puis repris ; le fichier part à la reprise", async () => {
    const album = await publishedAlbum(leo, eventId, 2);
    const [first] = await photoRows(album.id);
    const key = first?.storageKey as string;
    const real = storage.remove.bind(storage);
    vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("disque occupé"));
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/${first?.id}`)).status).toBe(204);
    // La requête a réussi, le fichier est encore là, et un effacement est planifié.
    expect(await storage.get(key)).not.toBeNull();
    const job = clock.jobs.jobs.find((j) => j.name === "storage.remove" && j.data.key === key);
    expect(job).toBeDefined();
    // La reprise (tâche pg-boss) l'efface ; ses motifs acceptent les clés d'album.
    vi.mocked(storage.remove).mockImplementation(real);
    await retryRemove(key);
    expect(await storage.get(key)).toBeNull();
    for (const k of [
      `private/albums/${crypto.randomUUID()}/${"a".repeat(32)}.webp`,
      `private/album-uploads/${crypto.randomUUID()}.webp`,
      `media-contents/${crypto.randomUUID()}.webp`,
    ]) {
      await storage.put(k, Buffer.from("x"));
      await retryRemove(k);
      expect(await storage.get(k)).toBeNull();
    }
    // Une photo du seed reprise dans un album (`seed/media/…`) : premier effacement en échec, puis reprise.
    const seedKey = "seed/media/beziers-night-0.webp";
    await storage.put(seedKey, Buffer.from("x"));
    await retryRemove(seedKey);
    expect(await storage.get(seedKey)).toBeNull();
    // Une clé qui n'est pas d'un album n'est jamais effacée par cette tâche.
    await storage.put("avatars/x/y.webp", Buffer.from("x"));
    await retryRemove("avatars/x/y.webp");
    expect(await storage.get("avatars/x/y.webp")).not.toBeNull();
  });
});

describe("une photo signalée garde son fichier jusqu'à la décision", () => {
  async function reported() {
    const album = await publishedAlbum(leo, eventId, 2);
    const photos = await photoRows(album.id);
    const fan = await signUp("Kenji_66");
    const mod = await signUp("Moderateur", { role: "moderator", twoFactor: true });
    const report = await call(fan, "POST", "/reports", {
      targetType: "album_photo",
      targetId: photos[0]?.id,
      reason: "plate_or_face",
    });
    expect(report.status).toBe(201);
    return { album, photos, fan, mod, report: report.json };
  }
  const decide = (mod: TestUser, reportId: string) =>
    call(mod, "POST", `/admin/reports/${reportId}/status`, { status: "resolved_no_action", note: null });

  it("le média retire la photo signalée : la ligne part, le fichier reste, la décision l'efface", async () => {
    const { album, photos, mod, report } = await reported();
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/${photos[0]?.id}`)).status).toBe(204);
    expect(await storage.get(photos[0]?.storageKey as string)).not.toBeNull();
    // La modération la voit toujours dans le dossier du signalement.
    const detail = await call(mod, "GET", `/admin/reports/${report.id}`);
    const url = JSON.stringify(detail.json).match(/\/api\/admin\/reports\/[^"]+\.webp/)?.[0] as string;
    expect(url).toContain(`/media/${photos[0]?.id}.webp`);
    expect((await app.request(url, { headers: { cookie: mod.cookie } })).status).toBe(200);
    // La décision efface le fichier gardé.
    expect((await decide(mod, report.id)).status).toBe(200);
    expect(await storage.get(photos[0]?.storageKey as string)).toBeNull();
    // Le fichier effacé : le dossier ne propose plus d'adresse vers un 404.
    const after = await call(mod, "GET", `/admin/reports/${report.id}`);
    expect(JSON.stringify(after.json)).not.toMatch(/\/media\//);
  });

  it("une photo non signalée part tout de suite", async () => {
    const { album, photos } = await reported();
    expect((await call(leo, "DELETE", `/me/albums/${album.id}/photos/${photos[1]?.id}`)).status).toBe(204);
    expect(await storage.get(photos[1]?.storageKey as string)).toBeNull();
    expect(await storage.get(photos[0]?.storageKey as string)).not.toBeNull();
  });

  it("l'album supprimé garde aussi la photo signalée, et seulement elle", async () => {
    const { album, photos, mod, report } = await reported();
    expect((await call(leo, "DELETE", `/me/albums/${album.id}`)).status).toBe(204);
    expect(await storage.get(photos[0]?.storageKey as string)).not.toBeNull();
    expect(await storage.get(photos[1]?.storageKey as string)).toBeNull();
    await decide(mod, report.id);
    expect(await storage.get(photos[0]?.storageKey as string)).toBeNull();
  });

  it("plusieurs signalements sur la même photo : tant qu'aucune décision n'est prise le fichier reste, une décision les clôt tous", async () => {
    const { album, photos, mod, report } = await reported();
    const second = await signUp("Nina_34");
    const other = await call(second, "POST", "/reports", {
      targetType: "album_photo",
      targetId: photos[0]?.id,
      reason: "spam",
    });
    expect(other.status).toBe(201);
    await call(leo, "DELETE", `/me/albums/${album.id}/photos/${photos[0]?.id}`);
    expect(await storage.get(photos[0]?.storageKey as string)).not.toBeNull();
    expect((await decide(mod, report.id)).status).toBe(200);
    const open = await db.execute(
      sql`select count(*)::int as n from reports where target_id = ${photos[0]?.id} and status in ('pending', 'reviewing')`,
    );
    expect((open.rows[0] as { n: number }).n).toBe(0);
    expect(await storage.get(photos[0]?.storageKey as string)).toBeNull();
  });
});

describe("GET /media/:id : compteurs d'albums", () => {
  it("albumsCount et photosCount (publiés seulement), la forme d'avant conservée", async () => {
    const fan = await signUp("Kenji_66");
    const before = await call(fan, "GET", `/media/${leoMedia}`);
    expect(before.status).toBe(200);
    expect(before.json).toMatchObject({ id: leoMedia, name: "Sud Cars", albumsCount: 0, photosCount: 0 });
    expect(before.json.verified).toBe(false);
    await publishedAlbum(leo, eventId, 3);
    const draftKeep = await draftOf(leo, eventId);
    await addPhoto(leo, draftKeep.id);
    const after = await call(fan, "GET", `/media/${leoMedia}`);
    expect(after.json).toMatchObject({ albumsCount: 1, photosCount: 3 });
    // Les champs d'avant sont toujours là.
    for (const key of [
      "id",
      "name",
      "formats",
      "description",
      "website",
      "instagram",
      "youtube",
      "logoUrl",
      "departments",
      "verified",
    ]) {
      expect(after.json).toHaveProperty(key);
    }
    expect((await call(null, "GET", `/media/${leoMedia}`)).status).toBe(401);
    expect((await call(fan, "GET", `/media/${crypto.randomUUID()}`)).status).toBe(404);
    // La décoration ne touche que `GET /media/:id`.
    expect((await call(fan, "GET", `/media/${leoMedia}/contents`)).json).not.toHaveProperty("albumsCount");
  });
});
