// Lot R8c1 : le Fil de la vague R8 — publications des pages, visibilité, mes publications dans « Abonnements », ordre des trois
// onglets, popularité et « ma sortie », zones « pas vu » / « vu sans interaction » et curseur (version 3).
import { type FeedCard, feedMyOutingLabel } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  events,
  orders,
  proFollows,
  profiles,
  signingKeys,
  structureFollows,
  structures,
  tickets,
  ticketTypes,
} from "../../db/schema";
import { decodeCursor } from "./cursor";
import {
  DAY,
  dbPost,
  fil,
  flames,
  follow,
  HOUR,
  ids,
  POSTER,
  person,
  postIds,
  seen,
  view,
  walk,
} from "./fil-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  // Un peu en avance sur l'horloge de la base : les lignes créées « maintenant » sont avant l'instant du parcours.
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  ref = await seedReference();
});

const hoursAgo = (h: number) => new Date(clock.now.getTime() - h * HOUR);
const followStructure = (u: TestUser, structureId: string) =>
  db.insert(structureFollows).values({ structureId, userId: u.id, source: "manual" });

/** Une candidature véhicule de `u` à l'événement. */
async function apply(u: TestUser, eventId: string, status: (typeof applications.$inferInsert)["status"] = "accepted") {
  const car = await createVehicle(u.id, ref);
  await db.insert(applications).values({
    eventId,
    userId: u.id,
    vehicleId: car.id,
    status,
    rulesAcceptedAt: clock.now,
    followStructure: false,
  });
}

/** Un billet de `u`, sans passer par la billetterie. */
async function ticket(u: TestUser, eventId: string, status: "valid" | "used" | "cancelled" = "valid") {
  const [type] = await db.insert(ticketTypes).values({ eventId, name: "Entrée visiteur", capacity: 100 }).returning();
  const [order] = await db
    .insert(orders)
    .values({
      eventId,
      userId: u.id,
      ticketTypeId: type!.id,
      status: "paid",
      quantity: 1,
      amountCents: 0,
      paidAt: clock.now,
    })
    .returning();
  await db
    .insert(signingKeys)
    .values({ kid: 1, publicKey: Buffer.alloc(32) })
    .onConflictDoNothing();
  await db.insert(tickets).values({
    orderId: order!.id,
    eventId,
    userId: u.id,
    ticketTypeId: type!.id,
    status,
    kid: 1,
    signature: Buffer.from("00", "hex"),
    issuedAt: clock.now,
  });
}

const cardOf = (items: FeedCard[], id: string) => items.find((c) => c.id === `feed_post:${id}`);
const createdAtOf = (c: FeedCard) => (c.payload as { post: { createdAt: string } }).post.createdAt;

describe("publications des pages dans le Fil", () => {
  it("une page se voit sans suivre la personne qui a publié, n'entre pas dans « Abonnements » de ses abonnés personnels et entre pour qui suit la structure", async () => {
    const orga = await person("Orga_Page");
    const structure = await createStructure(orga.id);
    const personalFollower = await person("Abonne_Perso");
    const structFollower = await person("Abonne_Structure");
    const stranger = await person("Passant_Page");
    await follow(personalFollower, orga);
    await followStructure(structFollower, structure.id);
    const page = await dbPost(orga, hoursAgo(1), { persona: "organizer", structureId: structure.id });

    // Sans rien suivre : « Pour toi » et « Autour de moi ».
    for (const q of ["", "?filter=nearby"]) {
      const res = await fil(stranger, q);
      const card = cardOf(res.items, page);
      expect(card, q).toBeTruthy();
      const post = ((card as FeedCard).payload as { post: { author: { kind: string; key: string; name: string } } })
        .post;
      // La carte parle au nom de la page, jamais de la personne qui l'a publiée.
      expect(post.author.kind).toBe("structure");
      expect(post.author.key).toBe(`s:${structure.id}`);
      expect(post.author.name).toBe(structure.name);
      expect(JSON.stringify(card)).not.toContain(orga.id);
    }
    // « Abonnements » de qui suit la personne (pas la page) : rien.
    expect(postIds((await fil(personalFollower, "?filter=following")).items)).not.toContain(page);
    // Et sa raison, dans « Pour toi », n'est pas « Tu suis … » : elle ne suit pas les abonnés de la personne.
    const forYou = cardOf((await fil(personalFollower)).items, page);
    expect(forYou?.reason.code).not.toBe("following_author");
    // « Abonnements » de qui suit la structure : présente, avec la raison d'un abonnement.
    const following = await fil(structFollower, "?filter=following");
    expect(postIds(following.items)).toContain(page);
    expect(cardOf(following.items, page)?.reason).toEqual({
      code: "following_structure",
      label: "Nouveauté d'un abonnement",
    });
  });

  it("une fiche pro suivie entre dans « Abonnements »", async () => {
    const owner = await person("Pro_Owner");
    const pro = await createPro(owner.id);
    const viewer = await person("Suit_Pro");
    const other = await person("Ne_Suit_Pas");
    await db.insert(proFollows).values({ proId: pro.id, userId: viewer.id });
    const page = await dbPost(owner, hoursAgo(1), { persona: "pro", proId: pro.id });
    expect(postIds((await fil(viewer, "?filter=following")).items)).toContain(page);
    expect(postIds((await fil(other, "?filter=following")).items)).not.toContain(page);
    expect(postIds((await fil(other)).items)).toContain(page);
  });

  it("une structure suspendue ou supprimée se tait ; la personne qui a publié bannie aussi ; son compte privé n'y change rien", async () => {
    const orga = await person("Orga_Prive", { visibility: "private" });
    const structure = await createStructure(orga.id);
    const viewer = await person("Lecteur_Page");
    const page = await dbPost(orga, hoursAgo(1), { persona: "organizer", structureId: structure.id });
    // Compte privé de la personne qui a publié : la page reste publique.
    expect(postIds((await fil(viewer)).items)).toContain(page);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structure.id));
    expect(postIds((await fil(viewer)).items)).not.toContain(page);
    await db.update(structures).set({ verification: "verified" }).where(eq(structures.id, structure.id));
    expect(postIds((await fil(viewer)).items)).toContain(page);
    await db.update(structures).set({ deletedAt: new Date() }).where(eq(structures.id, structure.id));
    expect(postIds((await fil(viewer)).items)).not.toContain(page);
    await db.update(structures).set({ deletedAt: null }).where(eq(structures.id, structure.id));
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, orga.id));
    expect(postIds((await fil(viewer)).items)).not.toContain(page);
  });

  it("sans photo : l'affiche de l'événement sert de visuel ; sans visuel du tout, la publication n'est pas servie (T1)", async () => {
    const author = await person("Passionne_Sans_Photo");
    const orga = await person("Orga_Affiche");
    const structure = await createStructure(orga.id);
    const viewer = await person("Lecteur_Affiche");
    const withPoster = await createEvent(structure.id, { posterKey: POSTER });
    const bare = await createEvent(structure.id, { posterKey: null });
    const a = await dbPost(author, hoursAgo(1), { photos: 0, eventId: withPoster.id, eventRole: "attendee" });
    const b = await dbPost(author, hoursAgo(2), { photos: 0, eventId: bare.id, eventRole: "attendee" });
    const c = await dbPost(orga, hoursAgo(3), {
      photos: 0,
      persona: "organizer",
      structureId: structure.id,
      eventId: withPoster.id,
      eventRole: "organizer",
    });
    const got = postIds((await fil(viewer)).items);
    expect(got).toContain(a);
    expect(got).toContain(c);
    expect(got).not.toContain(b);
    const view_ = ((cardOf((await fil(viewer)).items, a) as FeedCard).payload as { post: { visual: string } }).post;
    expect(view_.visual).toBe("event_poster");
  });
});

describe("mes publications dans « Abonnements »", () => {
  it("elles y sont, une seule fois sur tout le parcours, et pas celles des inconnus", async () => {
    const me = await person("Moi_Meme");
    const followed = await person("Suivi_Un");
    const stranger = await person("Inconnu_Un");
    await follow(me, followed);
    const mine = await Promise.all(Array.from({ length: 25 }, (_, i) => dbPost(me, hoursAgo(1 + i))));
    const theirs = await Promise.all(Array.from({ length: 25 }, (_, i) => dbPost(followed, hoursAgo(1 + i))));
    const noise = await dbPost(stranger, hoursAgo(1));
    const pages = await walk(me, "following");
    const all = pages.flat();
    const got = postIds(all);
    expect(new Set(got).size).toBe(got.length);
    expect([...got].sort()).toEqual([...mine, ...theirs].sort());
    expect(got).not.toContain(noise);
    expect(pages.length).toBeGreaterThan(1);
  });
});

describe("ordre des onglets", () => {
  it("« Abonnements » et « Autour de moi » : strictement par date, sur trois pages, sans phase classée", async () => {
    const me = await person("Lecteur_Ordre");
    const followed = await person("Suivi_Ordre");
    const crowd = await person("Foule_Ordre");
    await follow(me, followed);
    // 47 publications étalées sur 10 jours, la plus ancienne a le plus de flammes : la popularité n'y change rien.
    const rows: { id: string; at: Date }[] = [];
    for (let i = 0; i < 47; i++) {
      const at = new Date(clock.now.getTime() - (1 + i * 5) * HOUR);
      rows.push({ id: await dbPost(followed, at), at });
    }
    await flames(rows.at(-1)?.id as string, [crowd], hoursAgo(2));
    const expected = rows.map((r) => r.id);
    for (const filter of ["following", "nearby"]) {
      const pages = await walk(me, filter);
      expect(pages.length).toBe(3);
      const got = postIds(pages.flat());
      expect(got).toEqual(expected);
      const dates = pages.flat().map((c) => Date.parse(createdAtOf(c)));
      expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    }
  });

  it("« Pour toi » : la popularité des 7 derniers jours passe devant la fraîcheur", async () => {
    const author = await person("Auteur_Pop");
    const me = await person("Lecteur_Pop");
    const fans = await Promise.all(["Fan_A", "Fan_B", "Fan_C"].map((p) => person(p)));
    const plain = await dbPost(author, hoursAgo(1));
    const liked = await dbPost(author, hoursAgo(1.02));
    await flames(liked, fans, hoursAgo(0.5));
    const res = await fil(me);
    expect(postIds(res.items).slice(0, 2)).toEqual([liked, plain]);
    // Des flammes de plus de 7 jours ne comptent plus.
    await db.execute(sql`update feed_post_reactions set created_at = ${hoursAgo(24 * 8).toISOString()}::timestamptz`);
    expect(postIds((await fil(me)).items).slice(0, 2)).toEqual([plain, liked]);
  });

  it("« Pour toi » : ma sortie à venir ou en cours passe devant, avec sa raison (candidature retenue, billet ; pas en attente, pas finie)", async () => {
    const orga = await person("Orga_Sortie");
    const structure = await createStructure(orga.id);
    const me = await person("Lecteur_Sortie");
    const ticketHolder = await person("Billet_Sortie");
    const pending = await person("Attente_Sortie");
    const startsAt = new Date(clock.now.getTime() + 3 * DAY);
    const event = await createEvent(structure.id, { startsAt, posterKey: POSTER });
    await apply(me, event.id);
    await ticket(ticketHolder, event.id);
    await apply(pending, event.id, "pending");
    const fresh = await dbPost(orga, hoursAgo(1));
    const journal = await dbPost(orga, hoursAgo(10), {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      eventRole: "organizer",
    });
    const weekday = startsAt.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "Europe/Paris" });
    for (const u of [me, ticketHolder]) {
      const res = await fil(u);
      expect(postIds(res.items).slice(0, 2)).toEqual([journal, fresh]);
      expect(cardOf(res.items, journal)?.reason).toEqual({ code: "my_outing", label: `Pour ta sortie de ${weekday}` });
    }
    // En attente : ni avantage ni raison.
    const res = await fil(pending);
    expect(postIds(res.items).slice(0, 2)).toEqual([fresh, journal]);
    expect(cardOf(res.items, journal)?.reason.code).not.toBe("my_outing");
    // Un événement fini n'est plus « ma sortie » ; un billet annulé non plus.
    await db
      .update(events)
      .set({ startsAt: hoursAgo(10), endsAt: hoursAgo(6) })
      .where(eq(events.id, event.id));
    const ended = await fil(me);
    expect(cardOf(ended.items, journal)?.reason.code).not.toBe("my_outing");
    // Une sortie en cours (commencée, pas finie) l'est encore, et dit le jour de son début.
    await db
      .update(events)
      .set({ startsAt: hoursAgo(1), endsAt: new Date(clock.now.getTime() + 3 * HOUR) })
      .where(eq(events.id, event.id));
    const running = await fil(me);
    expect(cardOf(running.items, journal)?.reason.code).toBe("my_outing");
    expect(cardOf(running.items, journal)?.reason.label).toBe(feedMyOutingLabel(hoursAgo(1), clock.now));
  });
});

describe("pas vu / vu sans interaction", () => {
  const manyPosts = async (author: TestUser, n: number, from = 1) =>
    Promise.all(Array.from({ length: n }, (_, i) => dbPost(author, hoursAgo(from + i * 0.5))));

  it("vue puis relue : zone B (seen: true), après les autres ; ouverte, partagée ou aimée : zone A", async () => {
    const author = await person("Auteur_Vu");
    const me = await person("Lecteur_Vu");
    const [a, b, c, d, e] = await manyPosts(author, 5);
    const res0 = await fil(me);
    expect(res0.items.every((c_) => !c_.seen)).toBe(true);
    expect(typeof res0.json.ref).toBe("string");
    clock.advance(60_000);
    expect((await view(me, [a as string, b as string, c as string, d as string])).status).toBe(204);
    expect(
      (
        await seen(me, [
          { id: `feed_post:${b}`, action: "open" },
          { id: `feed_post:${c}`, action: "share" },
        ])
      ).status,
    ).toBe(204);
    // d : vue puis aimée.
    await call(me, "PUT", `/feed-posts/${d}/reaction`);
    clock.advance(60_000);
    const res = await fil(me);
    const order = res.items.map((c_) => ({ id: postIds([c_])[0], seen: c_.seen }));
    expect(order.filter((o) => o.seen).map((o) => o.id)).toEqual([a]);
    // Zone A d'abord (dont ma flamme, l'ouverture, le partage), puis la zone B.
    const firstSeen = order.findIndex((o) => o.seen);
    expect(firstSeen).toBe(order.length - 1);
    expect(new Set(order.slice(0, firstSeen).map((o) => o.id))).toEqual(new Set([b, c, d, e]));
  });

  it("l'ensemble est figé à l'instant du parcours : une carte vue pendant qu'on fait défiler ne change pas de zone", async () => {
    const author = await person("Auteur_Fige");
    const me = await person("Lecteur_Fige");
    const all = await manyPosts(author, 30);
    const first = await fil(me);
    expect(first.items.length).toBe(20);
    expect(first.next).toBeTruthy();
    // Pendant le défilement, les cartes de la page 2 sont vues (et même aimées).
    clock.advance(60_000);
    await view(me, all.slice(20));
    await call(me, "PUT", `/feed-posts/${all[25]}/reaction`);
    const second = await fil(me, `?cursor=${encodeURIComponent(first.next as string)}`);
    expect(second.items.length).toBe(10);
    expect(second.items.every((c) => !c.seen)).toBe(true);
    // Le même parcours repris à zéro (nouveau `ref`) les range en zone B.
    clock.advance(60_000);
    const again = { items: (await walk(me, "for_you")).flat() };
    // 20 cartes pas vues + la 26e (aimée : une interaction) en zone A ; les 9 autres vues sont rangées après.
    expect(again.items.filter((c) => !c.seen).length).toBe(21);
    expect(again.items.filter((c) => c.seen).length).toBe(9);
    expect(again.items.findIndex((c) => c.seen)).toBe(21);
  });

  it("tout est vu : « Tu es à jour » en tête (première carte seen), le Fil n'est jamais vide", async () => {
    const author = await person("Auteur_Tout_Vu");
    const me = await person("Lecteur_Tout_Vu");
    const all = await manyPosts(author, 12);
    await view(me, all);
    clock.advance(60_000);
    for (const q of ["", "?filter=nearby"]) {
      const res = await fil(me, q);
      expect(res.items.length).toBe(12);
      expect(res.items.every((c) => c.seen)).toBe(true);
    }
  });

  it("zone A épuisée dans une page non pleine : la zone B commence dans la même page ; sans doublon ni trou sur tout le parcours", async () => {
    const author = await person("Auteur_Zones");
    const me = await person("Lecteur_Zones");
    await follow(me, author);
    const all = await manyPosts(author, 50);
    const seenOnes = all.filter((_, i) => i % 2 === 1).slice(0, 25);
    await view(me, seenOnes);
    clock.advance(60_000);
    for (const filter of ["following", "nearby", "for_you"]) {
      const pages = await walk(me, filter);
      const flat = pages.flat();
      const got = postIds(flat);
      expect(new Set(got).size, filter).toBe(got.length);
      expect([...got].sort(), filter).toEqual([...all].sort());
      // La zone A (25 cartes) tient en une page et demie : sa fin et le début de la B partagent la page 2.
      const firstSeen = flat.findIndex((c) => c.seen);
      expect(firstSeen, filter).toBe(25);
      expect(flat.slice(firstSeen).every((c) => c.seen)).toBe(true);
      expect(pages[1]?.some((c) => !c.seen) && pages[1]?.some((c) => c.seen)).toBe(true);
      // Chaque zone est par date (onglets par date).
      if (filter !== "for_you") {
        const dates = (cards: FeedCard[]) => cards.map((c) => Date.parse(createdAtOf(c)));
        for (const zone of [flat.slice(0, firstSeen), flat.slice(firstSeen)]) {
          expect([...dates(zone)].sort((x, y) => y - x)).toEqual(dates(zone));
        }
      }
    }
  });

  it("curseur : version 2 → première page et reset ; forgé → 400 ; une phase classée hors « Pour toi » → 400", async () => {
    const author = await person("Auteur_Curseur");
    const me = await person("Lecteur_Curseur");
    await follow(me, author);
    await manyPosts(author, 30);
    const first = await fil(me);
    const raw = Buffer.from(first.next as string, "base64url");
    expect(raw[0]).toBe(3);
    // Version 2 (APK en ligne en plein parcours) : jamais un 400.
    const v2 = Buffer.concat([Buffer.from([2]), raw.subarray(1)]).toString("base64url");
    const res = await fil(me, `?cursor=${v2}`);
    expect(res.status).toBe(200);
    expect(res.json.reset).toBe(true);
    expect(res.items.length).toBe(20);
    // Même une version 2 tronquée ou inventée : première page, jamais 400.
    const junk = Buffer.from([2, 9, 9, 9]).toString("base64url");
    expect((await fil(me, `?cursor=${junk}`)).json.reset).toBe(true);
    // Forgé : octet de zone invalide, zone B en phase 1, tronqué, rallongé, version inconnue.
    const forged = [
      Buffer.concat([raw.subarray(0, 2), Buffer.from([7]), raw.subarray(3)]),
      Buffer.concat([raw.subarray(0, 2), Buffer.from([1]), raw.subarray(3)]),
      raw.subarray(0, raw.length - 1),
      Buffer.concat([raw, Buffer.from([0])]),
      Buffer.concat([Buffer.from([9]), raw.subarray(1)]),
    ];
    for (const bad of forged) expect((await fil(me, `?cursor=${bad.toString("base64url")}`)).status).toBe(400);
    expect((await fil(me, "?cursor=%%%")).status).toBe(400);
    // Un curseur de « Pour toi » (phase 1) donné à « Abonnements » : forgé.
    const forYou = await fil(me);
    const c1 = decodeCursor(forYou.next as string);
    if (c1?.phase === 1) expect((await fil(me, `?filter=following&cursor=${forYou.next}`)).status).toBe(400);
    // Le bon curseur marche encore.
    expect((await fil(me, `?cursor=${first.next}`)).status).toBe(200);
  });

  it("un curseur de la zone B est repris sans doublon ni trou, et la page n'est jamais incomplète avec une suite", async () => {
    const author = await person("Auteur_Zone_B");
    const me = await person("Lecteur_Zone_B");
    const all = await manyPosts(author, 70);
    await view(me, all);
    clock.advance(60_000);
    const pages = await walk(me, "nearby");
    expect(pages.map((p) => p.length)).toEqual([20, 20, 20, 10]);
    const got = postIds(pages.flat());
    expect(new Set(got).size).toBe(70);
    expect(pages.flat().every((c) => c.seen)).toBe(true);
    expect(ids(pages.flat()).length).toBe(70);
  });
});
