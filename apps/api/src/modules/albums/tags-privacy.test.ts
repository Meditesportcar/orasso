// Lot R9f, T5 : qui voit une identification. Compte public : tout membre connecté. Compte privé : lui, le média auteur, les responsables de la
// structure, un abonné accepté, jamais un membre quelconque ; sans session : jamais (ni pseudo, ni nombre). Comptes suspendus, bannis,
// supprimés exclus. Liste blanche des champs (jamais l'identifiant du compte ni la plaque), voiture d'un compte privé « sans pseudo ».
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { profiles, userFollows, vehicles } from "../../db/schema";
import { keysOf, paris } from "./albums-test-helpers";
import { type Ref, tagScenario } from "./tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;
let nina: TestUser;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref);
  nina = await signUp("Nina_34");
});

const photo = (i: number) => s.photos[i]?.id as string;
const pose = (u: TestUser, photoId: string, body: unknown) => call(u, "POST", `/album-photos/${photoId}/tags`, body);
const album = (u: TestUser | null) => call(u, "GET", `/albums/${s.albumId}`);
const tagsOf = (res: { json: { photos: { tags?: unknown[] }[] } }) =>
  res.json.photos.flatMap((p) => p.tags ?? []) as {
    kind: string;
    vehicle: { id: string; label: string } | null;
    user: { pseudo: string; avatarUrl: string | null } | null;
    mine: boolean;
    canRemove: boolean;
    removeAs: string | null;
  }[];

describe("compte public : tout membre connecté, jamais sans session", () => {
  beforeEach(async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { userId: s.kenji.id });
  });

  it("servie à tout membre (pseudo compris), avec la liste blanche ; le nombre de photos identifiées suit", async () => {
    for (const who of [nina, s.marc, s.orga, s.dam, s.kenji, s.leo]) {
      const res = await album(who);
      expect(res.status).toBe(200);
      expect(tagsOf(res)).toHaveLength(2);
      expect(res.json.tagsCount).toBe(2);
      for (const p of res.json.photos) {
        for (const t of p.tags ?? []) {
          expect(Object.keys(t).sort()).toEqual([
            "canRemove",
            "id",
            "kind",
            "mine",
            "removeAs",
            "taggedAs",
            "user",
            "vehicle",
          ]);
          expect(Object.keys(t.user).sort()).toEqual(["avatarUrl", "pseudo"]);
        }
      }
      // Jamais l'identifiant d'un compte, ni la plaque, ni ce qui dit qui a posé quoi.
      for (const id of [s.dam.id, s.kenji.id, s.leo.id]) expect(res.text).not.toContain(id);
      expect(res.text).not.toContain(s.car.dam.vehicle.plate ?? "plaque-introuvable");
      expect([...keysOf(res.json)]).not.toEqual(
        expect.arrayContaining(["userId", "taggedBy", "plateRects", "plateState"]),
      );
    }
    const car = tagsOf(await album(nina)).find((t) => t.kind === "vehicle");
    expect(car).toMatchObject({ user: { pseudo: "Dam_66" }, mine: false, canRemove: false, removeAs: null });
    expect(car?.vehicle?.id).toBe(s.car.dam.vehicle.id);
  });

  it("sans session : 401 partout, aucune identification (la route publique d'une photo n'en porte pas)", async () => {
    expect((await album(null)).status).toBe(401);
    expect((await call(null, "GET", `/me/albums/${s.albumId}/my-photos`)).status).toBe(401);
    expect((await call(null, "GET", `/albums/${s.albumId}/taggable`)).status).toBe(401);
    const photoRow = s.photos[0];
    const name = (photoRow?.storageKey ?? "").split("/").pop();
    const file = await app.request(`/api/public/albums/${s.albumId}/photos/${name}`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/webp");
    // La liste d'événement (façade publique de la fiche) ne porte aucun champ d'identification.
    const list = await call(null, "GET", `/events/by-slug/${s.event.slug}/media-contents`);
    expect(JSON.stringify(list.json)).not.toMatch(/tags|Dam_66|Kenji_66/);
  });

  it("le geste de retrait se lit selon le regard : l'intéressé, celui qui a posé, personne d'autre", async () => {
    const dam = tagsOf(await album(s.dam)).find((t) => t.kind === "vehicle");
    expect(dam).toMatchObject({ mine: true, canRemove: true, removeAs: "not_mine" });
    const leo = tagsOf(await album(s.leo)).find((t) => t.kind === "vehicle");
    expect(leo).toMatchObject({ mine: false, canRemove: true, removeAs: "tagger" });
    // L'organisateur n'a pas posé l'identification du média : pas de croix.
    expect(tagsOf(await album(s.orga)).every((t) => !t.canRemove)).toBe(true);
    // Posée par l'organisateur : sa croix, pas celle du média.
    await pose(s.orga, photo(2), { vehicleId: s.car.kenji.vehicle.id });
    expect(tagsOf(await album(s.orga)).filter((t) => t.canRemove)).toHaveLength(1);
    // Le média garde la croix de ses deux identifications, pas celle de l'organisateur.
    expect(tagsOf(await album(s.leo)).filter((t) => t.canRemove)).toHaveLength(2);
    // L'identification que Dam a posée lui-même : « Retirer mon identification ».
    await pose(s.dam, photo(3), { userId: s.dam.id });
    expect(tagsOf(await album(s.dam)).find((t) => t.kind === "user" && t.mine)).toMatchObject({ removeAs: "withdraw" });
  });

  it("comptes banni, suspendu ou supprimé : exclus partout, nombre compris", async () => {
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, s.dam.id));
    expect(tagsOf(await album(nina))).toHaveLength(1);
    await db.update(profiles).set({ bannedAt: null, deletedAt: new Date() }).where(eq(profiles.userId, s.dam.id));
    expect(tagsOf(await album(nina))).toHaveLength(1);
    await db
      .update(profiles)
      .set({ deletedAt: null, suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, s.dam.id));
    const res = await album(nina);
    expect(tagsOf(res)).toHaveLength(1);
    expect(res.json.tagsCount).toBe(1);
    expect(res.text).not.toContain("Dam_66");
  });

  it("une voiture archivée n'est plus servie aux autres, seulement à son propriétaire", async () => {
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, s.car.dam.vehicle.id));
    expect(tagsOf(await album(nina)).filter((t) => t.kind === "vehicle")).toHaveLength(0);
    expect(tagsOf(await album(s.dam)).filter((t) => t.kind === "vehicle")).toHaveLength(1);
  });
});

describe("compte privé : lui, le média auteur, les responsables, un abonné accepté ; jamais un membre quelconque (T5)", () => {
  beforeEach(async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.priv.vehicle.id });
    await pose(s.leo, photo(1), { userId: s.priv.id });
    // Une identification publique à côté, pour vérifier que seule celle du compte privé disparaît.
    await pose(s.leo, photo(2), { vehicleId: s.car.dam.vehicle.id });
  });

  it("un membre quelconque ne voit ni l'identification, ni le pseudo, ni le nombre", async () => {
    for (const who of [nina, s.marc, s.kenji]) {
      const res = await album(who);
      expect(tagsOf(res)).toHaveLength(1);
      expect(res.json.tagsCount).toBe(1);
      expect(res.text).not.toContain("Priv_66");
      expect(res.text).not.toContain(s.priv.id);
      expect(res.text).not.toContain(s.car.priv.vehicle.id);
    }
  });

  it("lui-même (avec son pseudo), le média auteur et les responsables de la structure les voient", async () => {
    const own = await album(s.priv);
    expect(tagsOf(own)).toHaveLength(3);
    expect(tagsOf(own).find((t) => t.kind === "vehicle" && t.mine)).toMatchObject({
      user: { pseudo: "Priv_66" },
      removeAs: "not_mine",
    });
    for (const who of [s.leo, s.orga]) {
      const res = await album(who);
      expect(tagsOf(res)).toHaveLength(3);
      expect(res.json.tagsCount).toBe(3);
    }
  });

  it("une voiture d'un compte privé se montre « <voiture> » sans pseudo pour le média et l'organisateur ; par pseudo, celui qui l'a tapé le voit", async () => {
    for (const who of [s.leo, s.orga]) {
      const res = await album(who);
      const car = tagsOf(res).find((t) => t.kind === "vehicle" && t.vehicle?.id === s.car.priv.vehicle.id);
      expect(car).toBeTruthy();
      expect(car?.user).toBeNull();
      expect(car?.vehicle?.label).toContain("BMW");
      const byPseudo = tagsOf(res).find((t) => t.kind === "user");
      expect(byPseudo?.user?.pseudo).toBe("Priv_66");
    }
  });

  it("un abonné accepté les voit (avec son pseudo) ; un abonnement en attente ne voit rien", async () => {
    await db.insert(userFollows).values({ followerId: nina.id, followedId: s.priv.id, status: "pending" });
    expect(tagsOf(await album(nina))).toHaveLength(1);
    await db
      .update(userFollows)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(userFollows.followerId, nina.id));
    const res = await album(nina);
    expect(tagsOf(res)).toHaveLength(3);
    expect(tagsOf(res).find((t) => t.kind === "vehicle" && t.vehicle?.id === s.car.priv.vehicle.id)?.user?.pseudo).toBe(
      "Priv_66",
    );
  });

  it("un compte public qui passe en privé disparaît des regards ordinaires", async () => {
    expect(tagsOf(await album(nina)).some((t) => t.user?.pseudo === "Dam_66")).toBe(true);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, s.dam.id));
    expect(tagsOf(await album(nina)).some((t) => t.user?.pseudo === "Dam_66")).toBe(false);
  });

  it("aucune identification dans les publications du Fil ni dans la liste d'une page", async () => {
    const feed = await call(nina, "GET", `/authors/u:${s.dam.id}/feed-posts`);
    expect(feed.status).toBe(200);
    expect(JSON.stringify(feed.json)).not.toContain(s.albumId);
    const posts = await call(s.dam, "GET", "/me/feed-posts");
    expect([200, 404]).toContain(posts.status);
    expect(JSON.stringify(posts.json ?? {})).not.toContain(s.albumId);
  });
});
