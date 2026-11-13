// Lot R9f, T38 et T39 : « En story » (une story personnelle depuis la photo, sans re-téléversement, avec le crédit du média non retirable, qui
// tombe avec l'identification ou l'album) et « Enregistrer » (le fichier avec le crédit incrusté, selon `allow_save` et l'identité).
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, seedReference, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, stories, storyTags } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import { accountService } from "../account/service";
import { paris, RECT, spread } from "./albums-test-helpers";
import { type Ref, tagScenario } from "./tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref, 4);
});

const photo = (i: number) => s.photos[i]?.id as string;
const pose = (u: TestUser, photoId: string, body: unknown) => call(u, "POST", `/album-photos/${photoId}/tags`, body);
const toStory = (u: TestUser | null, photoId: string, body: unknown = {}) =>
  call(u, "POST", `/album-photos/${photoId}/share-to-story`, body);
const storyRow = async (id: string) => (await db.select().from(stories).where(eq(stories.id, id)))[0];
const byAuthor = (u: TestUser, key: string) => call(u, "GET", `/stories/by-author/${key}`);

describe("« En story » depuis une photo d'album (T38)", () => {
  beforeEach(async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { userId: s.kenji.id });
  });

  it("une story personnelle publique, créée depuis le fichier de l'album sans re-téléversement, avec la photo d'origine et la plaque traitée", async () => {
    const res = await toStory(s.dam, photo(0), { caption: "  Mon GR sur la Côte  " });
    expect(res.status).toBe(201);
    expect(Object.keys(res.json).sort()).toEqual(["audience", "expiresAt", "id", "replayed"]);
    const row = await storyRow(res.json.id);
    expect(row).toMatchObject({
      authorId: s.dam.id,
      persona: "fan",
      audience: "public",
      status: "ready",
      mediaKind: "photo",
      plateState: "none_confirmed",
      caption: "Mon GR sur la Côte",
      sourceAlbumPhotoId: photo(0),
      structureId: null,
      mediaId: null,
    });
    expect(row?.storageKey.startsWith(`private/stories/${row?.id}/`)).toBe(true);
    expect(await storage.get(row?.storageKey ?? "")).not.toBeNull();
    // La même photo : rejouée, la même story (200).
    const again = await toStory(s.dam, photo(0));
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(res.json.id);
    expect(
      await db
        .select()
        .from(stories)
        .where(eq(stories.sourceAlbumPhotoId, photo(0))),
    ).toHaveLength(1);
  });

  it("le crédit « Photos : <média> » est servi par la visionneuse, à tout regard qui voit la story, et ne se modifie nulle part", async () => {
    const res = await toStory(s.dam, photo(0));
    const view = await byAuthor(s.kenji, `u:${s.dam.id}`);
    expect(view.status).toBe(200);
    const story = view.json.stories.find((x: { id: string }) => x.id === res.json.id);
    expect(story.credit).toEqual({ mediaKey: `m:${s.leoMedia}`, mediaName: "Sud Cars" });
    expect(story.sharedFrom).toBeNull();
    // Le crédit ne se retire pas : aucune route de modification d'une story, et le crédit vient de la photo d'origine.
    for (const method of ["PATCH", "PUT"]) {
      const r = await call(s.dam, method, `/me/stories/${res.json.id}`, { credit: null });
      expect(r.status).toBe(404);
    }
    const own = await byAuthor(s.dam, `u:${s.dam.id}`);
    expect(own.json.stories[0].credit).toMatchObject({ mediaName: "Sud Cars" });
    // Une story ordinaire garde la forme d'avant : `credit` nul.
    const [plain] = await db
      .insert(stories)
      .values({
        authorId: s.kenji.id,
        audience: "public",
        storageKey: `private/stories/x/plain.webp`,
        plateState: "none_confirmed",
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    const kenji = await byAuthor(s.dam, `u:${s.kenji.id}`);
    const plainStory = kenji.json.stories.find((x: { id: string }) => x.id === plain?.id);
    expect(plainStory.credit).toBeNull();
    // Forme d'avant, champ à champ (APK en ligne) : les champs de `StoryView` d'avant, plus `credit` seulement.
    expect(Object.keys(plainStory).sort()).toEqual(
      [
        "audience",
        "caption",
        "commercialPartner",
        "createdAt",
        "credit",
        "crewName",
        "durationMs",
        "event",
        "expiresAt",
        "exportBlockedReason",
        "exportable",
        "height",
        "id",
        "linked",
        "mediaKind",
        "mediaUrl",
        "placeLabel",
        "posterUrl",
        "reacted",
        "reactionsCount",
        "sharedFrom",
        "sharing",
        "status",
        "tags",
        "vehicle",
        "viewed",
        "viewsCount",
        "width",
      ].sort(),
    );
  });

  it("réservé à qui est identifié (voiture ou pseudo) et au média auteur ; sans session : 401", async () => {
    expect((await toStory(s.kenji, photo(0))).status).toBe(403);
    expect((await toStory(s.marc, photo(0))).status).toBe(403);
    expect((await toStory(s.orga, photo(0))).status).toBe(403);
    expect((await toStory(s.dam, photo(1))).status).toBe(403);
    expect((await toStory(null, photo(0))).status).toBe(401);
    // Par pseudo : Kenji est identifié sur la photo 1.
    expect((await toStory(s.kenji, photo(1))).status).toBe(201);
    // Le média auteur : toujours.
    expect((await toStory(s.leo, photo(2))).status).toBe(201);
    expect(await db.select().from(stories)).toHaveLength(2);
  });

  it("T38 : une photo `kept` donne une copie floutée avec les cadres gardés ; `blurred` et `none` : telle quelle ; `unknown` : 409", async () => {
    // Le damier de test : une zone nette varie beaucoup ; floutée, presque plus.
    const none = await toStory(s.dam, photo(0));
    const noneRow = await storyRow(none.json.id);
    // Dans le 9:16, la photo 400 × 200 est cadrée au centre sur 1080 × 540.
    const box = { left: 300, top: 840, width: 400, height: 100 };
    const sharp0 = await spread(noneRow?.storageKey ?? "", box);
    await call(s.dam, "DELETE", `/me/stories/${none.json.id}`);
    await db
      .update(eventAlbumPhotos)
      .set({ plateState: "kept", plateRects: [RECT] })
      .where(eq(eventAlbumPhotos.id, photo(0)));
    const kept = await toStory(s.dam, photo(0));
    expect(kept.status).toBe(201);
    const keptRow = await storyRow(kept.json.id);
    expect(keptRow?.plateState).toBe("blurred");
    const blurred = await spread(keptRow?.storageKey ?? "", box);
    expect(sharp0).toBeGreaterThan(40);
    expect(blurred).toBeLessThan(sharp0 / 3);
    // Une photo déjà floutée : la copie telle quelle, plaque `blurred`.
    await db
      .update(eventAlbumPhotos)
      .set({ plateState: "blurred", plateRects: [RECT] })
      .where(eq(eventAlbumPhotos.id, photo(2)));
    await pose(s.leo, photo(2), { vehicleId: s.car.dam.vehicle.id });
    const bl = await toStory(s.dam, photo(2));
    expect((await storyRow(bl.json.id))?.plateState).toBe("blurred");
    // Ancienne galerie : 409 `plate_unknown`, rien n'est créé.
    await db
      .update(eventAlbumPhotos)
      .set({ plateState: "unknown", plateRects: null })
      .where(eq(eventAlbumPhotos.id, photo(1)));
    const unknown = await toStory(s.kenji, photo(1));
    expect(unknown.status).toBe(409);
    expect(unknown.json.error.code).toBe("plate_unknown");
    expect(unknown.json.error.message).toBe("Cette photo d'une ancienne galerie ne peut pas être partagée en story.");
    expect(await db.select().from(stories).where(eq(stories.authorId, s.kenji.id))).toHaveLength(0);
  });

  it("un compte privé ne publie jamais « à tout le monde » : ses abonnés ; un public au choix (`followers`)", async () => {
    await pose(s.leo, photo(2), { vehicleId: s.car.priv.vehicle.id });
    const priv = await toStory(s.priv, photo(2), { audience: "public" });
    expect((await storyRow(priv.json.id))?.audience).toBe("followers");
    const dam = await toStory(s.dam, photo(0), { audience: "followers" });
    expect((await storyRow(dam.json.id))?.audience).toBe("followers");
    expect((await toStory(s.dam, photo(0), { audience: "crew" })).status).toBe(400);
  });

  it("la story tombe si l'identification est retirée (par lui ou par le poseur), mais pas tant qu'il lui en reste une autre", async () => {
    const tag = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const second = await pose(s.leo, photo(0), { userId: s.dam.id });
    const story = await toStory(s.dam, photo(0));
    const key = (await storyRow(story.json.id))?.storageKey ?? "";
    // Il lui reste son pseudo : la story reste.
    expect((await call(s.dam, "DELETE", `/me/album-tags/${tag.json.id}`)).status).toBe(204);
    expect((await storyRow(story.json.id))?.deletedAt).toBeNull();
    // Plus aucune identification sur la photo : la story tombe et son fichier est effacé.
    expect((await call(s.leo, "DELETE", `/album-photos/${photo(0)}/tags/${second.json.id}`)).status).toBe(204);
    const gone = await storyRow(story.json.id);
    expect(gone?.deletedAt).not.toBeNull();
    expect(await storage.get(key)).toBeNull();
    expect((await byAuthor(s.kenji, `u:${s.dam.id}`)).json.stories ?? []).toHaveLength(0);
    // L'identification retirée par l'intéressé : il ne peut plus la reprendre en story.
    expect((await toStory(s.dam, photo(0))).status).toBe(403);
  });

  it("la story tombe si la photo, l'album ou le compte du média disparaît (le fichier avec)", async () => {
    await pose(s.leo, photo(2), { vehicleId: s.car.dam.vehicle.id });
    const a = await toStory(s.dam, photo(0));
    const b = await toStory(s.dam, photo(2));
    expect((await call(s.leo, "DELETE", `/me/albums/${s.albumId}/photos/${photo(0)}`)).status).toBe(204);
    expect((await storyRow(a.json.id))?.deletedAt).not.toBeNull();
    expect((await storyRow(b.json.id))?.deletedAt).toBeNull();
    expect((await call(s.leo, "DELETE", `/me/albums/${s.albumId}`)).status).toBe(204);
    expect((await storyRow(b.json.id))?.deletedAt).not.toBeNull();
    expect(await storage.get((await storyRow(b.json.id))?.storageKey ?? "")).toBeNull();
    // Album supprimé : plus de partage non plus.
    expect((await toStory(s.dam, photo(2))).status).toBe(404);
  });

  it("la story tombe aussi quand le compte du média est supprimé (anonymisation)", async () => {
    await pose(s.leo, photo(2), { vehicleId: s.car.dam.vehicle.id });
    const story = await toStory(s.dam, photo(0));
    expect((await storyRow(story.json.id))?.deletedAt).toBeNull();
    await accountService.anonymize(s.leo.id, null);
    expect((await storyRow(story.json.id))?.deletedAt).not.toBeNull();
    expect((await toStory(s.dam, photo(2))).status).toBe(404);
  });

  it("une story déjà en ligne est rendue telle quelle : 200, `replayed`, l'audience réelle (ni public ni légende ne la modifient)", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const first = await toStory(s.dam, photo(0), { audience: "public", caption: "Première" });
    expect(first.status).toBe(201);
    expect(first.json).toMatchObject({ replayed: false, audience: "public" });
    const again = await toStory(s.dam, photo(0), { audience: "followers", caption: "Autre" });
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ id: first.json.id, replayed: true, audience: "public" });
    expect((await storyRow(first.json.id))?.caption).toBe("Première");
  });

  it("repartagée (« Ajouter à ma story »), la copie garde le crédit du média, et elle tombe avec l'identification", async () => {
    const tag = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const story = await toStory(s.dam, photo(0));
    await db.insert(storyTags).values({ storyId: story.json.id, targetKind: "user", targetId: s.kenji.id });
    const shared = await call(s.kenji, "POST", `/stories/${story.json.id}/share-to-mine`, {});
    expect(shared.status).toBeLessThan(300);
    const copy = (await db.select().from(stories).where(eq(stories.sharedFromStoryId, story.json.id)))[0];
    expect(copy?.sourceAlbumPhotoId).toBe(photo(0));
    const view = await byAuthor(s.kenji, `u:${s.kenji.id}`);
    const mine = (view.json.stories as { id: string; credit: { mediaName: string } | null }[]).find(
      (x) => x.id === copy?.id,
    );
    expect(mine?.credit).toMatchObject({ mediaName: "Sud Cars" });
    // Une copie ne s'exporte pas (auteur seul de l'originale, `author_only`) : le crédit n'a pas à y être imprimé.
    expect((await app.request(`/api/stories/${copy?.id}/export`, { headers: { cookie: s.kenji.cookie } })).status).toBe(
      403,
    );
    // Plus d'identification : la story d'origine et la copie tombent.
    expect((await call(s.dam, "DELETE", `/me/album-tags/${tag.json.id}`)).status).toBe(204);
    expect((await storyRow(copy?.id as string))?.deletedAt).not.toBeNull();
  });

  it("l'export de la story incruste le crédit sous la signature ; sans crédit, le fichier est différent", async () => {
    const story = await toStory(s.dam, photo(0));
    const withCredit = await app.request(`/api/stories/${story.json.id}/export`, { headers: { cookie: s.dam.cookie } });
    expect(withCredit.status).toBe(200);
    expect(withCredit.headers.get("content-type")).toBe("image/jpeg");
    const a = Buffer.from(await withCredit.arrayBuffer());
    await db.update(stories).set({ sourceAlbumPhotoId: null }).where(eq(stories.id, story.json.id));
    const plain = await app.request(`/api/stories/${story.json.id}/export`, { headers: { cookie: s.dam.cookie } });
    const b = Buffer.from(await plain.arrayBuffer());
    expect(a.equals(b)).toBe(false);
    // La même largeur : seul le crédit change (la pastille au-dessus de la signature).
    const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
    expect([ma.width, ma.height]).toEqual([mb.width, mb.height]);
  });
});

describe("« Enregistrer » (T39)", () => {
  beforeEach(async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { userId: s.kenji.id });
  });

  const download = (u: TestUser | null, photoId: string) =>
    app.request(`/api/album-photos/${photoId}/download`, { headers: u ? { cookie: u.cookie } : {} });

  it("le fichier avec le crédit incrusté (WebP, pièce jointe), même taille que la photo, pixels changés en bas à gauche", async () => {
    const res = await download(s.dam, photo(0));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="orasso-photo-[0-9a-f]{8}\.webp"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const credited = Buffer.from(await res.arrayBuffer());
    const original = (await storage.get(s.photos[0]?.storageKey ?? "")) as Buffer;
    const [mc, mo] = await Promise.all([sharp(credited).metadata(), sharp(original).metadata()]);
    expect([mc.width, mc.height]).toEqual([mo.width, mo.height]);
    // La pastille sombre du crédit : la zone en bas à gauche est plus sombre que dans l'original (damier clair et sombre en moyenne).
    const zone = { left: 8, top: (mo.height ?? 0) - 40, width: 200, height: 32 };
    const mean = async (b: Buffer) => (await sharp(b).extract(zone).stats()).channels[0]?.mean ?? 0;
    expect(await mean(credited)).toBeLessThan(await mean(original));
    expect(credited.equals(original)).toBe(false);
  });

  it("403 si le média ne l'autorise pas (`save_not_allowed`), ou si je ne suis pas identifié ; le média auteur : toujours", async () => {
    expect((await download(s.kenji, photo(0))).status).toBe(403);
    expect((await download(s.marc, photo(0))).status).toBe(403);
    expect((await download(s.orga, photo(0))).status).toBe(403);
    expect((await download(null, photo(0))).status).toBe(401);
    await db.update(eventAlbums).set({ allowSave: false }).where(eq(eventAlbums.id, s.albumId));
    const refused = await download(s.dam, photo(0));
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("save_not_allowed");
    expect((await download(s.leo, photo(2))).status).toBe(200);
    // Une identification retirée ferme l'enregistrement.
    await db.update(eventAlbums).set({ allowSave: true }).where(eq(eventAlbums.id, s.albumId));
    expect((await download(s.dam, photo(0))).status).toBe(200);
    const tags = (await call(s.dam, "GET", `/me/albums/${s.albumId}/my-photos`)).json.photos;
    await call(s.dam, "DELETE", `/me/album-tags/${tags[0].tagId}`);
    expect((await download(s.dam, photo(0))).status).toBe(403);
  });

  it("une photo retirée ou un album supprimé : 404 ; la limite : 60 par heure ; jamais qui a téléchargé quoi", async () => {
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await download(s.leo, photo(2))).status;
    expect(last).toBe(429);
    resetRateLimits();
    await call(s.leo, "DELETE", `/me/albums/${s.albumId}`);
    expect((await download(s.dam, photo(0))).status).toBe(404);
    const rows = await db
      .select()
      .from(stories)
      .where(and(eq(stories.authorId, s.dam.id)));
    expect(rows).toHaveLength(0);
  });
});
