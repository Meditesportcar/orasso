// Lot R9e (T33) : la carte « album » du Fil. Un genre à part, servi seulement aux clients qui envoient `?cards=album` (l'APK en ligne
// en ferait une carte « non gérée » visible). Visible des abonnés de la page du média (« Abonnements »), du département de l'événement
// (« Autour de moi »), de tous dans « Pour toi » (note d'une publication, plus « ma sortie »). Jamais un brouillon, un album supprimé,
// un média dont l'accréditation est tombée. Carte vue : `album:<id>`. Liste blanche : ni `plate_*`, ni `author_id`, ni pseudo.
import type { FeedCard } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../../test/actor-call";
import { call, createVehicle, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { applications, pageFollows, profiles } from "../../../db/schema";
import {
  accredit,
  draftOf,
  mediaUser,
  organizerEvent,
  paris,
  publishedAlbum,
  setAccreditation,
} from "../../albums/albums-test-helpers";

afterAll(async () => {
  await pool.end();
});

let leo: TestUser;
let leoMedia: string;
let kenji: TestUser;
let eventId: string;
let leoAccreditation: string;
let clock: ReturnType<typeof useClock>;

const fil = async (u: TestUser | null, query: string) => {
  const res = await call(u, "GET", `/fil?${query}`);
  return { ...res, items: (res.json?.items ?? []) as FeedCard[] };
};
const albums = (items: FeedCard[]) => items.filter((c) => c.kind === "album");
const person = async (pseudo: string, departments: string[]) => {
  const u = await signUp(pseudo);
  await db.update(profiles).set({ departments, visibility: "public" }).where(eq(profiles.userId, u.id));
  return u;
};
const follow = (u: TestUser, mediaId: string) =>
  db.insert(pageFollows).values({ followerKind: "user", followerId: u.id, targetKind: "media", targetId: mediaId });

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(11, 5, 12));
  const scenario = await organizerEvent();
  eventId = scenario.event.id;
  const media = await mediaUser("Leo_Media");
  leo = media.user;
  leoMedia = media.mediaId;
  leoAccreditation = (await accredit(leo, leoMedia, eventId)).id;
  kenji = await person("Kenji_66", ["66"]);
});

describe("?cards=album : le genre n'est servi qu'aux clients qui le demandent", () => {
  it("sans le paramètre, aucune carte « album » (l'APK en ligne n'en voit pas) ; avec, elle est là", async () => {
    const album = await publishedAlbum(leo, eventId, 2);
    const without = await fil(kenji, "filter=for_you");
    expect(without.status).toBe(200);
    expect(albums(without.items)).toHaveLength(0);
    const other = await fil(kenji, "filter=for_you&cards=memory");
    expect(albums(other.items)).toHaveLength(0);
    const withParam = await fil(kenji, "filter=for_you&cards=album");
    expect(albums(withParam.items).map((c) => c.id)).toEqual([`album:${album.id}`]);
    const both = await fil(kenji, "filter=for_you&cards=memory,album");
    expect(albums(both.items)).toHaveLength(1);
  });

  it("la pastille « Nouvelles publications » suit la même règle", async () => {
    await publishedAlbum(leo, eventId, 1);
    const since = encodeURIComponent(paris(11, 5, 0).toISOString());
    const without = await call(kenji, "GET", `/fil/fresh?filter=for_you&since=${since}`);
    const withParam = await call(kenji, "GET", `/fil/fresh?filter=for_you&since=${since}&cards=album`);
    expect(without.json.count).toBe(0);
    expect(withParam.json.count).toBe(1);
  });
});

describe("qui voit la carte", () => {
  it("« Pour toi » : tous les membres ; sans session : 401", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const stranger = await person("Nina_34", ["34"]);
    for (const who of [kenji, stranger]) {
      expect(albums((await fil(who, "filter=for_you&cards=album")).items)).toHaveLength(1);
    }
    expect((await fil(null, "filter=for_you&cards=album")).status).toBe(401);
    expect(album.id).toBeTruthy();
  });

  it("« Abonnements » : les abonnés de la page du média seulement", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const stranger = await person("Nina_66", ["66"]);
    await follow(kenji, leoMedia);
    const mine = await fil(kenji, "filter=following&cards=album");
    expect(albums(mine.items).map((c) => c.id)).toEqual([`album:${album.id}`]);
    expect(mine.items.find((c) => c.kind === "album")?.reason.code).toBe("following_pro");
    expect(albums((await fil(stranger, "filter=following&cards=album")).items)).toHaveLength(0);
  });

  it("« Autour de moi » : le département de l'événement", async () => {
    await publishedAlbum(leo, eventId, 1);
    const far = await person("Nina_29", ["29"]);
    expect(albums((await fil(kenji, "filter=nearby&cards=album")).items)).toHaveLength(1);
    expect(albums((await fil(far, "filter=nearby&cards=album")).items)).toHaveLength(0);
  });

  it("« ma sortie » : qui avait une place à l'événement voit la raison « my_outing » et le score double", async () => {
    await publishedAlbum(leo, eventId, 1);
    const ref = await seedReference();
    const car = await createVehicle(kenji.id, ref);
    await db.insert(applications).values({
      eventId,
      userId: kenji.id,
      kind: "vehicle",
      vehicleId: car.id,
      status: "accepted",
      rulesAcceptedAt: new Date(0),
      followStructure: false,
    });
    const card = albums((await fil(kenji, "filter=for_you&cards=album")).items)[0];
    expect(card?.reason.code).toBe("my_outing");
  });

  it("jamais un brouillon, un album supprimé, ni un média dont l'accréditation est tombée ; mes propres albums ne comptent pas comme nouveautés", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    await draftOf(leo, eventId);
    const visible = () => fil(kenji, "filter=for_you&cards=album").then((r) => albums(r.items).length);
    expect(await visible()).toBe(1);
    await setAccreditation(leoAccreditation, "withdrawn");
    expect(await visible()).toBe(0);
    await setAccreditation(leoAccreditation, "accepted");
    expect(await visible()).toBe(1);
    // Mes propres albums ne font pas « Nouvelles publications ».
    const since = encodeURIComponent(paris(11, 5, 0).toISOString());
    expect((await call(leo, "GET", `/fil/fresh?filter=for_you&since=${since}&cards=album`)).json.count).toBe(0);
    await call(leo, "DELETE", `/me/albums/${album.id}`);
    expect(await visible()).toBe(0);
  });

  it("un album ancien (plus de 30 jours) ne fait plus de carte", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    await db.execute(
      sql`update event_albums set published_at = ${paris(10, 1, 12).toISOString()}::timestamptz where id = ${album.id}`,
    );
    expect(albums((await fil(kenji, "filter=for_you&cards=album")).items)).toHaveLength(0);
  });
});

describe("la carte", () => {
  it("porte la page du média (jamais le compte), « présent au … » (on_site), le nombre de photos et la mosaïque (4 au plus)", async () => {
    const album = await publishedAlbum(leo, eventId, 5, { title: "Nuit au Lydia" });
    const res = await fil(kenji, "filter=for_you&cards=album");
    const card = albums(res.items)[0] as FeedCard<"album">;
    expect(card.id).toBe(`album:${album.id}`);
    expect(card.seen).toBe(false);
    const view = card.payload.album;
    expect(view).toMatchObject({
      id: album.id,
      title: "Nuit au Lydia",
      photosCount: 5,
      official: false,
      author: {
        key: `m:${leoMedia}`,
        kind: "media",
        name: "Sud Cars",
        pseudo: "Sud Cars",
        grade: null,
        official: false,
      },
      attach: { role: "on_site", phase: "before", presenceValidated: false },
    });
    expect(view.attach.event).toMatchObject({
      id: eventId,
      slug: "rassemblement-du-lydia",
      title: "Rassemblement du Lydia",
    });
    expect(view.cover).toHaveLength(4);
    expect(view.cover[0]?.url).toMatch(new RegExp(`^/api/albums/${album.id}/photos/[0-9a-f]{32}\\.webp$`));
    // Liste blanche.
    const text = JSON.stringify(card);
    expect(text).not.toMatch(/plate|author_?id|rects/i);
    expect(text).not.toContain(leo.id);
    expect(text).not.toContain("Leo_Media");
    expect(text).not.toContain("private/");
    // Un album sans flamme ni commentaire : rien de tel dans la carte.
    expect(Object.keys(view).sort()).toEqual(["attach", "author", "cover", "id", "official", "photosCount", "title"]);
  });

  it("carte vue : `album:<id>` s'accepte dans POST /me/fil/seen et la place en zone « vue »", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const sent = await call(kenji, "POST", "/me/fil/seen", { cards: [{ id: `album:${album.id}`, action: "view" }] });
    expect(sent.status).toBe(204);
    clock.advance(60_000);
    const next = await fil(kenji, "filter=for_you&cards=album");
    expect((next.items.find((c) => c.kind === "album") as FeedCard).seen).toBe(true);
    expect(
      (await call(kenji, "POST", "/me/fil/seen", { cards: [{ id: "album:pas-un-uuid", action: "view" }] })).status,
    ).toBe(400);
  });

  it("« Moins de ce genre » accepte le genre « album » comme les autres", async () => {
    const res = await call(kenji, "POST", "/me/feed/less", { kind: "album" });
    expect(res.status).toBe(200);
    expect(res.json.kinds).toContain("album");
  });

  it("en casquette (média) : la page lit les abonnements de la page, jamais une donnée de la personne derrière", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const marc = await mediaUser("Marc_Photo", "Marc Photo");
    await accredit(marc.user, marc.mediaId, eventId);
    // Marc, en casquette média, suit la page de Sud Cars ; son compte personnel n'a rien à voir.
    await db
      .insert(pageFollows)
      .values({ followerKind: "media", followerId: marc.mediaId, targetKind: "media", targetId: leoMedia });
    const res = await call(marc.user, "GET", "/fil?filter=following&cards=album");
    expect(albums(res.json.items)).toHaveLength(0); // sans en-tête d'acteur : la personne ne suit pas la page
    const asPage = await callAs(marc.user, `m:${marc.mediaId}`, "GET", "/fil?filter=following&cards=album");
    expect(asPage.status).toBe(200);
    expect(albums(asPage.json.items).map((c) => c.id)).toEqual([`album:${album.id}`]);
    // Son propre album n'est pas une nouveauté pour sa page.
    const own = await publishedAlbum(marc.user, eventId, 1);
    const ownRes = await callAs(marc.user, `m:${marc.mediaId}`, "GET", "/fil?filter=for_you&cards=album");
    expect(albums(ownRes.json.items).find((c: FeedCard) => c.id === `album:${own.id}`)).toBeDefined();
  });
});
