// Lot R9f, T40 et T41 : les notifications des identifications. Une par album et par personne (dix photos : `count 10`, une seule ligne),
// jamais à soi-même, pour un brouillon seulement à la publication (un seul envoi), pour un compte privé (c'est lui) mais pas pour un
// compte supprimé ou banni, famille « Événements » hors de l'Essentiel, présente au Journal ; « Ce n'est pas ma voiture » prévient le média
// (la structure si c'est l'organisateur), jamais le pseudo d'un compte privé, jamais pour un simple retrait.
import { essentialNotificationTypes } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, quietHours, resetDb, seedReference, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { albumPhotoTags, notifications, profiles } from "../../db/schema";
import { notificationsService } from "../notifications/service";
import { addPhoto, draftOf, paris } from "./albums-test-helpers";
import { carAt, type Ref, tagScenario } from "./tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref, 12);
});

const photo = (i: number) => s.photos[i]?.id as string;
const pose = (u: TestUser, photoId: string, body: unknown) => call(u, "POST", `/album-photos/${photoId}/tags`, body);
const of = async (userId: string, type = "album_tagged") => {
  await notificationsService.flush();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));
};

describe("album_tagged : une notification par album et par personne (T40)", () => {
  it("dix photos de la même voiture : une seule ligne, `count 10`, le titre dit le nombre et la voiture, dans l'album publié", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await pose(s.leo, photo(i), { vehicleId: s.car.dam.vehicle.id })).status).toBe(201);
    }
    const list = await of(s.dam.id);
    expect(list).toHaveLength(1);
    const n = list[0];
    expect(n?.title).toBe("Sud Cars a publié 10 photos de ta BMW Série 3 E36 au Rassemblement du Lydia");
    expect(n?.groupKey).toBe(`album_tagged:${s.albumId}:${s.dam.id}`);
    expect(n?.family).toBe("event");
    expect(n?.inJournal).toBe(true);
    expect(n?.eventId).toBe(s.event.id);
    expect(n?.deliveredAt).not.toBeNull();
    expect(n?.data).toMatchObject({ albumId: s.albumId, screen: "album-my-photos", count: 10, mediaName: "Sud Cars" });
    // La bande de vignettes : quatre au plus, adresses protégées de l'album.
    const thumbs = ((n?.data ?? {}) as { thumbs: string[] }).thumbs;
    expect(thumbs).toHaveLength(4);
    for (const t of thumbs) expect(t.startsWith(`/api/albums/${s.albumId}/photos/`)).toBe(true);
  });

  it("hors de l'Essentiel ; par pseudo : « t'a identifié sur N photos » ; le Journal la montre", async () => {
    expect((essentialNotificationTypes as readonly string[]).includes("album_tagged")).toBe(false);
    await pose(s.leo, photo(0), { userId: s.kenji.id });
    const [n] = await of(s.kenji.id);
    expect(n?.title).toBe("Sud Cars t'a identifié sur 1 photo au Rassemblement du Lydia");
    // Deux autres poses sur d'autres photos : elles rejoignent la ligne ; le titre suit le vrai compte.
    await pose(s.leo, photo(1), { userId: s.kenji.id });
    await pose(s.leo, photo(2), { userId: s.kenji.id });
    const after = await of(s.kenji.id);
    expect(after).toHaveLength(1);
    expect(after[0]?.title).toBe("Sud Cars t'a identifié sur 3 photos au Rassemblement du Lydia");
    expect(((after[0]?.data ?? {}) as { count?: number }).count).toBe(3);
    const activity = await call(s.kenji, "GET", "/me/activity");
    expect(activity.status).toBe(200);
    expect(activity.text).toContain("t'a identifié sur 3 photos");
  });

  it("jamais à soi-même : « C'est ma voiture » ne notifie personne ; le compte privé est prévenu (c'est lui)", async () => {
    await pose(s.dam, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.dam, photo(1), { userId: s.dam.id });
    expect(await of(s.dam.id)).toHaveLength(0);
    await pose(s.leo, photo(2), { vehicleId: s.car.priv.vehicle.id });
    const [n] = await of(s.priv.id);
    expect(n?.title).toContain("Sud Cars a publié 1 photo de ta BMW Série 3 E36");
    // Une photo que Dam a posée lui-même n'est jamais comptée dans l'annonce du média.
    await pose(s.leo, photo(3), { vehicleId: s.car.dam.vehicle.id });
    const dam = await of(s.dam.id);
    expect(dam).toHaveLength(1);
    expect(((dam[0]?.data ?? {}) as { count?: number }).count).toBe(1);
  });

  it("un organisateur qui identifie : la notification nomme le média auteur de l'album", async () => {
    await pose(s.orga, photo(0), { vehicleId: s.car.kenji.vehicle.id });
    const [n] = await of(s.kenji.id);
    expect(n?.title).toContain("Sud Cars a publié 1 photo");
  });

  it("brouillon : rien avant la publication, puis un seul envoi par personne avec le bon compte ; compte banni : rien", async () => {
    const draft = await draftOf(s.leo, s.event.id);
    const added: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await addPhoto(s.leo, draft.id);
      expect(r.status).toBe(201);
      added.push(r.json.id as string);
    }
    for (const id of added.slice(0, 3)) await pose(s.leo, id, { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, added[3] as string, { userId: s.kenji.id });
    expect(await of(s.dam.id)).toHaveLength(0);
    expect(await of(s.kenji.id)).toHaveLength(0);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, s.kenji.id));
    expect((await call(s.leo, "POST", `/me/albums/${draft.id}/publish`)).status).toBe(200);
    const dam = await of(s.dam.id);
    expect(dam).toHaveLength(1);
    expect(((dam[0]?.data ?? {}) as { count?: number }).count).toBe(3);
    expect(dam[0]?.title).toContain("a publié 3 photos de ta BMW");
    expect(await of(s.kenji.id)).toHaveLength(0);
    // Rejouée : rien ne repart (`notified_at` est posé).
    expect((await call(s.leo, "POST", `/me/albums/${draft.id}/publish`)).status).toBe(200);
    expect(await of(s.dam.id)).toHaveLength(1);
    const pending = await db.select().from(albumPhotoTags).where(eq(albumPhotoTags.userId, s.kenji.id));
    // Le compte banni garde son identification en attente, jamais annoncée (et jamais servie).
    expect(pending[0]?.notifiedAt).toBeNull();
  });

  it("le Journal ne garde pas une ligne dont plus aucune identification n'existe", async () => {
    const a = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const before = await call(s.dam, "GET", "/me/activity");
    expect(before.text).toContain("Sud Cars a publié 1 photo");
    await call(s.dam, "DELETE", `/me/album-tags/${a.json.id}`);
    const after = await call(s.dam, "GET", "/me/activity");
    expect(after.text).not.toContain("Sud Cars a publié");
  });
});

describe("album_tag_declined : « Ce n'est pas ma voiture » (T41)", () => {
  it("prévient le média auteur ; jamais le pseudo d'un compte privé ; un retrait ne prévient personne", async () => {
    const pub = await pose(s.leo, photo(0), { vehicleId: s.car.kenji.vehicle.id });
    await call(s.kenji, "DELETE", `/me/album-tags/${pub.json.id}`, { reason: "not_mine" });
    const [n] = await of(s.leo.id, "album_tag_declined");
    expect(n?.title).toBe("Kenji_66 dit que ce n'est pas sa voiture · Les photos du Rassemblement du Lydia");
    expect(n?.structureId).toBeNull();
    expect(n?.data).toMatchObject({ albumId: s.albumId });
    const priv = await pose(s.leo, photo(1), { vehicleId: s.car.priv.vehicle.id });
    await call(s.priv, "DELETE", `/me/album-tags/${priv.json.id}`);
    const all = await of(s.leo.id, "album_tag_declined");
    expect(all).toHaveLength(2);
    const text = JSON.stringify(all);
    expect(text).not.toContain("Priv_66");
    expect(all.some((x) => x.title.startsWith("Un propriétaire dit que ce n'est pas sa voiture"))).toBe(true);
    // « Retirer mon identification » (posée par lui) : personne n'est prévenu.
    const own = await pose(s.dam, photo(2), { vehicleId: s.car.dam.vehicle.id });
    await call(s.dam, "DELETE", `/me/album-tags/${own.json.id}`);
    expect(await of(s.leo.id, "album_tag_declined")).toHaveLength(2);
    // Le média qui retire sa propre identification ne prévient personne.
    const mine = await pose(s.leo, photo(3), { vehicleId: s.car.dam.vehicle.id });
    await call(s.leo, "DELETE", `/album-photos/${photo(3)}/tags/${mine.json.id}`);
    expect(await of(s.dam.id, "album_tag_declined")).toHaveLength(0);
    expect(await of(s.leo.id, "album_tag_declined")).toHaveLength(2);
  });

  it("une identification de l'organisateur prévient la structure (une ligne par responsable), pas le média", async () => {
    const r = await pose(s.orga, photo(0), { vehicleId: s.car.kenji.vehicle.id });
    await call(s.kenji, "DELETE", `/me/album-tags/${r.json.id}`);
    const rows = await of(s.orga.id, "album_tag_declined");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.structureId).toBe(s.structure.id);
    expect(await of(s.leo.id, "album_tag_declined")).toHaveLength(0);
  });

  it("par pseudo : « ce n'est pas lui » ; un autre propriétaire d'une seconde voiture est prévenu comme les autres", async () => {
    const r = await pose(s.leo, photo(0), { userId: s.kenji.id });
    await call(s.kenji, "DELETE", `/me/album-tags/${r.json.id}`);
    const [n] = await of(s.leo.id, "album_tag_declined");
    expect(n?.title).toContain("Kenji_66 dit que ce n'est pas lui sur cette photo");
    const second = await carAt(s.event.id, s.kenji, ref);
    expect((await pose(s.leo, photo(1), { vehicleId: second.vehicle.id })).status).toBe(201);
  });
});
