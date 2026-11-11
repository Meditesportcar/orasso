// Mentions des publications (R8a2) : matérialisation (cibles, ordre des mots, idempotence, reprise), notification, listes
// « Sur place » / « Passionnés » / citations par regard, « Masquer de la fiche ».
import { randomBytes, randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  eventPresences,
  feedPostMentions,
  feedPostPhotos,
  feedPosts,
  mediaProfiles,
  notifications,
  profiles,
  proProfiles,
  providerProfiles,
  structures,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { backfillMentions, materializeMentions } from "./mentions";
import { feedPhotoKey } from "./posts";

afterAll(async () => {
  await pool.end();
});

const HOUR = 3_600_000;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  ref = await seedReference();
});

/** Une structure en règle, son propriétaire (second facteur prouvé) et un événement qui finit dans `endsInH` heures. */
async function world(endsInH = 5) {
  const owner = await signUp("Orga_M", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const startsAt = new Date(clock.now.getTime() + (endsInH - 4) * HOUR);
  const event = await createEvent(structure.id, {
    title: "Rassemblement M",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 4 * HOUR),
    posterKey: "events/poster-m.webp",
  });
  return { owner, structure, event };
}

type PostOver = Partial<typeof feedPosts.$inferInsert> & { authorId: string };
/** Une publication insérée directement (avec une photo), ses mentions matérialisées comme à la création. */
async function mkPost(over: PostOver, materialize = true) {
  const [row] = await db
    .insert(feedPosts)
    .values({ caption: "Une légende", department: "66", createdAt: clock.now, ...over })
    .returning();
  await db.insert(feedPostPhotos).values({
    postId: row!.id,
    storageKey: feedPhotoKey(row!.id, randomBytes(16).toString("hex")),
    width: 1080,
    height: 1350,
    position: 0,
    noPlateConfirmed: true,
  });
  if (materialize) await materializeMentions(db, row!.id);
  return row!;
}

const rowsOf = async (postId: string) =>
  (await db.select().from(feedPostMentions).where(eq(feedPostMentions.postId, postId))).map(
    (m) => `${m.targetKind}:${m.targetId}:${m.source}`,
  );
const follow = (follower: TestUser, followed: TestUser) =>
  db.insert(userFollows).values({ followerId: follower.id, followedId: followed.id, status: "accepted" });
const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));
const notifsOf = async (u: TestUser) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), sql`${notifications.type} = 'feed_post_mention'`));

describe("matérialisation", () => {
  it("rattachement par un passionné ou un prestataire : l'événement et sa structure (source attach)", async () => {
    const { structure, event } = await world();
    const fan = await signUp("Fan_M");
    const prov = await signUp("Presta_M");
    const [profile] = await db
      .insert(providerProfiles)
      .values({ userId: prov.id, type: "photographer", name: "Presta" })
      .returning();
    const a = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee" });
    const b = await mkPost({
      authorId: prov.id,
      persona: "provider",
      providerId: profile!.id,
      eventId: event.id,
      eventRole: "on_site",
    });
    for (const p of [a, b]) {
      expect((await rowsOf(p.id)).sort()).toEqual(
        [`event:${event.id}:attach`, `structure:${structure.id}:attach`].sort(),
      );
    }
  });

  it("l'organisateur, un rattachement sans rôle, une publication sans événement : aucune mention", async () => {
    const { owner, structure, event } = await world();
    const fan = await signUp("Fan_M");
    const org = await mkPost({
      authorId: owner.id,
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      eventRole: "organizer",
    });
    const noRole = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: null });
    const none = await mkPost({ authorId: fan.id });
    for (const p of [org, noRole, none]) expect(await rowsOf(p.id)).toEqual([]);
  });

  it("@mot : fiche pro publiée, puis structure, puis personne ; mot inconnu ignoré ; cinq fois le même mot, une ligne", async () => {
    const { structure } = await world();
    const proOwner = await signUp("ProOwner_M");
    const pro = await createPro(proOwner.id, { slug: "wrap-66", verifiedAt: new Date(0) });
    const kenji = await signUp("Kenji_M");
    const fan = await signUp("Fan_M");
    const unpublished = await createPro((await signUp("ProDraft_M")).id, { slug: "brouillon", publishedAt: null });
    const caption = `Merci @wrap-66, @${structure.slug}, @kenji_m, @inconnu, @brouillon @wrap-66 @wrap-66 @wrap-66 @wrap-66`;
    const post = await mkPost({ authorId: fan.id, caption });
    expect((await rowsOf(post.id)).sort()).toEqual(
      [`pro:${pro.id}:caption`, `structure:${structure.id}:caption`, `user:${kenji.id}:caption`].sort(),
    );
    expect((await rowsOf(post.id)).join()).not.toContain(unpublished.id);
    // Une seule cible par mot, dans l'ordre pro > structure > personne : un slug qui est aussi un pseudo va à la fiche pro.
    await signUp("Wrap-66");
    const again = await mkPost({ authorId: fan.id, caption: "@wrap-66" });
    expect(await rowsOf(again.id)).toEqual([`pro:${pro.id}:caption`]);
  });

  it("collaboration commerciale : pro:<id> (source commercial) ; l'auteur ne se cite pas lui-même", async () => {
    const { structure, owner } = await world();
    const proOwner = await signUp("ProOwner_M");
    const pro = await createPro(proOwner.id, { verifiedAt: new Date(0) });
    const fan = await signUp("Fan_M");
    const c = await mkPost({ authorId: fan.id, commercialPartnerId: pro.id, caption: null });
    expect(await rowsOf(c.id)).toEqual([`pro:${pro.id}:commercial`]);
    const self = await mkPost({
      authorId: owner.id,
      persona: "organizer",
      structureId: structure.id,
      caption: `@${structure.slug} @${owner.pseudo.toLowerCase()}`,
    });
    // La page ne se cite pas ; la personne qui publie est citée (elle n'est pas l'auteur au sens de la clé `s:`).
    expect(await rowsOf(self.id)).toEqual([`user:${owner.id}:caption`]);
    const fanSelf = await mkPost({ authorId: fan.id, caption: `@${fan.pseudo.toLowerCase()}` });
    expect(await rowsOf(fanSelf.id)).toEqual([]);
  });

  it("idempotente ; la ligne garde la date de la publication", async () => {
    const { event } = await world();
    const fan = await signUp("Fan_M");
    const past = new Date(clock.now.getTime() - 3 * HOUR);
    const p = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee", createdAt: past });
    const before = await db.select().from(feedPostMentions).where(eq(feedPostMentions.postId, p.id));
    expect(await materializeMentions(db, p.id)).toBe(0);
    const after = await db.select().from(feedPostMentions).where(eq(feedPostMentions.postId, p.id));
    expect(after).toHaveLength(2);
    expect(after.map((m) => m.createdAt.getTime())).toEqual(before.map(() => past.getTime()));
  });

  it("un prestataire ou un média ne peut pas être cité par @ : ses mentions restent vides", async () => {
    await world();
    const u = await signUp("Presta_M");
    await db.insert(providerProfiles).values({ userId: u.id, type: "photographer", name: "Studio" });
    await db.insert(mediaProfiles).values({ userId: u.id, name: "Media" });
    const fan = await signUp("Fan_M");
    const p = await mkPost({ authorId: fan.id, caption: "@studio @media" });
    expect((await rowsOf(p.id)).filter((r) => r.startsWith("provider") || r.startsWith("media"))).toEqual([]);
  });

  it("la création par l'API matérialise dans sa transaction ; le rejeu `clientId` ne double rien", async () => {
    const { structure, event } = await world();
    const fan = await signUp("Fan_M");
    const clientId = randomUUID();
    const body = { eventId: event.id, caption: `Salut @${structure.slug}`, clientId, photos: [] };
    // Sans rôle déduit (aucune place) : accepté sans rôle, seule la citation de la légende compte.
    const res = await call(fan, "POST", "/me/feed-posts", { ...body, linked: { type: "event", id: event.id } });
    expect(res.status).toBe(201);
    const again = await call(fan, "POST", "/me/feed-posts", { ...body, linked: { type: "event", id: event.id } });
    expect(again.json.id).toBe(res.json.id);
    expect(await rowsOf(res.json.id)).toEqual([`structure:${structure.id}:caption`]);
  });
});

describe("reprise", () => {
  it("rejouée deux fois : mêmes lignes, aucune notification", async () => {
    const { event, structure } = await world();
    const fan = await signUp("Fan_M");
    const kenji = await signUp("Kenji_M");
    const p = await mkPost(
      { authorId: fan.id, eventId: event.id, eventRole: "attendee", caption: "Avec @kenji_m" },
      false,
    );
    await mkPost({ authorId: fan.id, caption: "rien du tout" }, false);
    const first = await backfillMentions(1);
    const rows = (await rowsOf(p.id)).sort();
    expect(rows).toEqual(
      [`event:${event.id}:attach`, `structure:${structure.id}:attach`, `user:${kenji.id}:caption`].sort(),
    );
    expect(first.created).toBe(3);
    const second = await backfillMentions();
    expect(second.created).toBe(0);
    expect((await rowsOf(p.id)).sort()).toEqual(rows);
    expect(await notifsOf(kenji)).toHaveLength(0);
  });
});

describe("notification feed_post_mention", () => {
  it("à la personne citée qui peut voir la publication ; jamais à soi-même ; jamais à qui ne peut pas la voir", async () => {
    await world();
    const author = await signUp("Auteur_M");
    const kenji = await signUp("Kenji_M");
    const post = async (over: Record<string, unknown> = {}) => {
      const res = await call(author, "POST", "/me/feed-posts", { caption: "Coucou @kenji_m @auteur_m", ...over });
      return res;
    };
    // L'API exige une photo : on passe par un compte public et une carte partagée (affiche d'un événement).
    const ev = (await db.query.events.findFirst())!;
    const res = await post({ linked: { type: "event", id: ev.id } });
    expect(res.status).toBe(201);
    expect(await notifsOf(kenji)).toHaveLength(1);
    expect(await notifsOf(author)).toHaveLength(0);
    // Compte privé non suivi par la personne citée : rien ne part.
    await makePrivate(author);
    const second = await post({ linked: { type: "event", id: ev.id }, caption: "Encore @kenji_m" });
    expect(second.status).toBe(201);
    expect(await notifsOf(kenji)).toHaveLength(1);
    // Compte privé suivi (abonnement accepté) : elle est prévenue.
    await follow(kenji, author);
    const third = await post({ linked: { type: "event", id: ev.id }, caption: "Et puis @kenji_m" });
    expect(third.status).toBe(201);
    expect(await notifsOf(kenji)).toHaveLength(2);
  });

  it("une page qui cite une personne : la personne est prévenue sous le nom de la page", async () => {
    const { owner, structure, event } = await world();
    const kenji = await signUp("Kenji_M");
    const res = await call(owner, "POST", "/me/feed-posts", {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "Bravo @kenji_m",
    });
    expect(res.status).toBe(201);
    const [n] = await notifsOf(kenji);
    expect(n?.title).toContain("Club de test");
    expect(JSON.stringify(n)).not.toContain(owner.id);
  });
});

describe("pseudos avec point et notification d'une page", () => {
  it("@jean.dupont ne mentionne pas jean ; @jean. en fin de phrase mentionne jean", async () => {
    await world();
    const jean = await signUp("Jean");
    const dotted = await signUp("Jean.Dupont");
    const fan = await signUp("Fan_M");
    const a = await mkPost({ authorId: fan.id, caption: "Merci @jean.dupont pour tout" });
    expect(await rowsOf(a.id)).toEqual([`user:${dotted.id}:caption`]);
    const b = await mkPost({ authorId: fan.id, caption: "Merci à @jean." });
    expect(await rowsOf(b.id)).toEqual([`user:${jean.id}:caption`]);
  });

  it("la notification d'une page porte le logo et le nom de la page, jamais l'avatar ni l'identifiant du gestionnaire", async () => {
    const { owner, structure, event } = await world();
    await db
      .update(profiles)
      .set({ avatarKey: `avatars/${owner.id}/moi.webp`, visibility: "private" })
      .where(eq(profiles.userId, owner.id));
    await db.update(structures).set({ logoKey: "logos/club.webp" }).where(eq(structures.id, structure.id));
    const kenji = await signUp("Kenji_M");
    const res = await call(owner, "POST", "/me/feed-posts", {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "Bravo @kenji_m",
    });
    expect(res.status).toBe(201);
    const [n] = await notifsOf(kenji);
    const text = JSON.stringify(n);
    expect(text).toContain("logos/club.webp");
    expect(text).not.toContain(owner.id);
    expect(text).not.toContain("avatars/");
    expect(text).not.toContain(owner.pseudo);
  });
});

describe("listes de mentions : « Sur place » et « Passionnés »", () => {
  it("« Sur place » : les prestataires et médias retenus ; « Passionnés » : les passionnés, comptes publics seulement", async () => {
    const { event } = await world();
    const viewer = await signUp("Lecteur_M");
    const prov = await signUp("Presta_M");
    const [pp] = await db
      .insert(providerProfiles)
      .values({ userId: prov.id, type: "photographer", name: "Presta" })
      .returning();
    const fan = await signUp("Fan_M");
    const priv = await signUp("Prive_M");
    await makePrivate(priv);
    const onSite = await mkPost({
      authorId: prov.id,
      persona: "provider",
      providerId: pp!.id,
      eventId: event.id,
      eventRole: "on_site",
    });
    const fanPost = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee" });
    const privPost = await mkPost({ authorId: priv.id, eventId: event.id, eventRole: "attendee" });
    const sur = await call(viewer, "GET", `/events/${event.id}/mentions?section=on_site`);
    expect(sur.status).toBe(200);
    expect(sur.json.items.map((i: { post: { id: string } }) => i.post.id)).toEqual([onSite.id]);
    expect(sur.json.items[0]).toMatchObject({ source: "attach", hidden: false });
    const fans = await call(viewer, "GET", `/events/${event.id}/mentions?section=fans`);
    expect(fans.json.items.map((i: { post: { id: string } }) => i.post.id)).toEqual([fanPost.id]);
    // Un compte privé n'est jamais montré, même à lui-même ni à qui le suit.
    await follow(viewer, priv);
    for (const who of [viewer, priv]) {
      const r = await call(who, "GET", `/events/${event.id}/mentions?section=fans`);
      expect(r.text).not.toContain(privPost.id);
    }
  });

  it("« Passionnés » avant la fin : toute place (pending, accepted, billet) ; après : présence validée seulement", async () => {
    const { event } = await world(5);
    const viewer = await signUp("Lecteur_M");
    const present = await signUp("Present_M");
    const absent = await signUp("Absent_M");
    const a = await mkPost({ authorId: present.id, eventId: event.id, eventRole: "attendee" });
    const b = await mkPost({ authorId: absent.id, eventId: event.id, eventRole: "attendee" });
    const ids = async () =>
      (await call(viewer, "GET", `/events/${event.id}/mentions?section=fans`)).json.items.map(
        (i: { post: { id: string } }) => i.post.id,
      ) as string[];
    expect((await ids()).sort()).toEqual([a.id, b.id].sort());
    clock.advance(6 * HOUR);
    // L'événement est fini : sans présence validée, ni l'un ni l'autre.
    expect(await ids()).toEqual([]);
    await db.insert(eventPresences).values({ eventId: event.id, userId: present.id, validatedAt: clock.now });
    expect(await ids()).toEqual([a.id]);
    // L'absence ne se déduit pas du compteur non plus.
    const counts = await call(viewer, "GET", `/events/by-slug/${event.slug}`);
    expect(counts.json.mentions).toEqual({ count: 1 });
  });

  it("« Passionnés » avant la fin, par l'API : candidature en attente ou retenue dans la liste ; sans place, rien", async () => {
    const { event } = await world();
    const viewer = await signUp("Lecteur_M");
    const posted: string[] = [];
    for (const status of ["pending", "accepted", null] as const) {
      const fan = await signUp(`Fan${status ?? "sans"}_M`);
      if (status) {
        const car = await createVehicle(fan.id, ref);
        await db.insert(applications).values({
          eventId: event.id,
          userId: fan.id,
          status,
          rulesAcceptedAt: clock.now,
          followStructure: false,
          vehicleId: car.id,
        });
      }
      const res = await call(fan, "POST", "/me/feed-posts", { linked: { type: "event", id: event.id } });
      expect(res.status).toBe(201);
      if (status) posted.push(res.json.id);
    }
    const r = await call(viewer, "GET", `/events/${event.id}/mentions?section=fans`);
    expect(r.json.items.map((i: { post: { id: string } }) => i.post.id).sort()).toEqual(posted.sort());
  });

  it("session requise ; événement brouillon ou inconnu : 404 ; section inconnue : 400", async () => {
    const { owner, structure, event } = await world();
    const viewer = await signUp("Lecteur_M");
    expect((await call(null, "GET", `/events/${event.id}/mentions?section=fans`)).status).toBe(401);
    const draft = await createEvent(structure.id, { status: "draft" });
    expect((await call(viewer, "GET", `/events/${draft.id}/mentions?section=fans`)).status).toBe(404);
    expect((await call(viewer, "GET", `/events/${randomUUID()}/mentions?section=fans`)).status).toBe(404);
    expect((await call(viewer, "GET", `/events/${event.id}/mentions?section=autre`)).status).toBe(400);
    void owner;
  });

  it("curseur : aucun doublon ni trou, y compris à la même milliseconde ; une page de 20", async () => {
    const { event } = await world();
    const fan = await signUp("Fan_M");
    const viewer = await signUp("Lecteur_M");
    const same = new Date(clock.now.getTime() - HOUR);
    const made: string[] = [];
    for (let i = 0; i < 47; i++) {
      const at = i < 6 ? same : new Date(clock.now.getTime() - (i + 2) * 60_000);
      made.push((await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee", createdAt: at })).id);
    }
    const seen: string[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const r = await call(viewer, "GET", `/events/${event.id}/mentions?section=fans${cursor}`);
      expect(r.status).toBe(200);
      expect(r.json.items.length).toBeLessThanOrEqual(20);
      seen.push(...r.json.items.map((i: { post: { id: string } }) => i.post.id));
      if (!r.json.nextCursor) break;
      cursor = `&cursor=${r.json.nextCursor}`;
    }
    expect(seen).toHaveLength(47);
    expect(new Set(seen).size).toBe(47);
    expect([...seen].sort()).toEqual([...made].sort());
  });
});

describe("listes de mentions d'une page", () => {
  it("structure : ses événements et ses citations ; pro : collaborations et citations ; v: m: vides ; u: 404", async () => {
    const { structure, event } = await world();
    const viewer = await signUp("Lecteur_M");
    const fan = await signUp("Fan_M");
    const proOwner = await signUp("ProOwner_M");
    const pro = await createPro(proOwner.id, { slug: "wrap-66", verifiedAt: new Date(0) });
    const attach = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee", caption: null });
    const cite = await mkPost({ authorId: fan.id, caption: `Allez voir @${structure.slug}` });
    const collab = await mkPost({ authorId: fan.id, caption: "@wrap-66 merci", commercialPartnerId: pro.id });
    const s = await call(viewer, "GET", `/authors/s:${structure.id}/mentions`);
    expect(s.json.items.map((i: { post: { id: string } }) => i.post.id).sort()).toEqual([attach.id, cite.id].sort());
    const p = await call(viewer, "GET", `/authors/p:${pro.id}/mentions`);
    expect(p.json.items.map((i: { post: { id: string }; source: string }) => `${i.post.id}:${i.source}`)).toEqual([
      `${collab.id}:caption`,
    ]);
    const [prov] = await db
      .insert(providerProfiles)
      .values({ userId: proOwner.id, type: "photographer", name: "P" })
      .returning();
    const [med] = await db.insert(mediaProfiles).values({ userId: proOwner.id, name: "M" }).returning();
    for (const key of [`v:${prov!.id}`, `m:${med!.id}`]) {
      const r = await call(viewer, "GET", `/authors/${key}/mentions`);
      expect(r.json).toEqual({ items: [], nextCursor: null });
    }
    expect((await call(viewer, "GET", `/authors/u:${fan.id}/mentions`)).status).toBe(404);
    expect((await call(viewer, "GET", `/authors/n-importe-quoi/mentions`)).status).toBe(404);
    expect((await call(null, "GET", `/authors/s:${structure.id}/mentions`)).status).toBe(401);
    // Une page supprimée : 404.
    await db.update(proProfiles).set({ deletedAt: new Date() }).where(eq(proProfiles.id, pro.id));
    expect((await call(viewer, "GET", `/authors/p:${pro.id}/mentions`)).status).toBe(404);
  });
});

describe("« Masquer de la fiche »", () => {
  it("une seule cible ; l'auteur garde sa publication et n'est pas prévenu ; les responsables la revoient avec hidden", async () => {
    const { owner, structure, event } = await world();
    const fan = await signUp("Fan_M");
    const viewer = await signUp("Lecteur_M");
    const post = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee" });
    const before = await db.select().from(feedPosts).where(eq(feedPosts.id, post.id));
    const hide = await call(owner, "PUT", `/mentions/e:${event.id}/${post.id}/hidden`);
    expect(hide.status).toBe(200);
    expect(hide.json).toEqual({ hidden: true });
    // Masquée sur la fiche de l'événement seulement : la page de la structure la montre encore.
    expect((await call(viewer, "GET", `/events/${event.id}/mentions?section=fans`)).json.items).toEqual([]);
    const onStructure = await call(viewer, "GET", `/authors/s:${structure.id}/mentions`);
    expect(onStructure.json.items).toHaveLength(1);
    // L'auteur : même publication, aucune notification.
    expect(await db.select().from(feedPosts).where(eq(feedPosts.id, post.id))).toEqual(before);
    expect((await db.select().from(notifications).where(eq(notifications.userId, fan.id))).length).toBe(0);
    expect((await call(fan, "GET", `/feed-posts/${post.id}`)).status).toBe(200);
    // Les responsables la voient, marquée ; un autre ne le peut pas (403).
    const mine = await call(owner, "GET", `/events/${event.id}/mentions?section=fans&hidden=1`);
    expect(mine.json.items).toHaveLength(1);
    expect(mine.json.items[0].hidden).toBe(true);
    expect((await call(viewer, "GET", `/events/${event.id}/mentions?section=fans&hidden=1`)).status).toBe(403);
    // Compteur : ce que le lecteur verrait (pas la masquée).
    expect((await call(viewer, "GET", `/events/by-slug/${event.slug}`)).json.mentions).toEqual({ count: 0 });
    // Ré-afficher.
    expect((await call(owner, "DELETE", `/mentions/e:${event.id}/${post.id}/hidden`)).json).toEqual({ hidden: false });
    expect((await call(viewer, "GET", `/events/${event.id}/mentions?section=fans`)).json.items).toHaveLength(1);
  });

  it("par un non-responsable, un staff, sans session : refusé ; clé inconnue ou mention absente : 404", async () => {
    const { owner, structure, event } = await world();
    const fan = await signUp("Fan_M");
    const staff = await signUp("Staff_M", { twoFactor: true });
    await addMember(structure.id, staff.id, "staff");
    const noFactor = await signUp("Sans2fa_M");
    const post = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee" });
    for (const who of [fan, staff]) {
      const r = await call(who, "PUT", `/mentions/e:${event.id}/${post.id}/hidden`);
      expect(r.status, who.pseudo).toBe(403);
      expect(r.json.error.code).toBe("persona_forbidden");
    }
    expect((await call(noFactor, "PUT", `/mentions/s:${structure.id}/${post.id}/hidden`)).status).toBe(403);
    expect((await call(null, "PUT", `/mentions/e:${event.id}/${post.id}/hidden`)).status).toBe(401);
    expect((await call(owner, "PUT", `/mentions/u:${fan.id}/${post.id}/hidden`)).status).toBe(404);
    expect((await call(owner, "PUT", `/mentions/bidon/${post.id}/hidden`)).status).toBe(404);
    expect((await call(owner, "PUT", `/mentions/e:${event.id}/${randomUUID()}/hidden`)).status).toBe(404);
    // Un co-organisateur peut ; un propriétaire sans second facteur non (comme publier).
    const co = await signUp("Co_M", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    expect((await call(co, "PUT", `/mentions/e:${event.id}/${post.id}/hidden`)).status).toBe(200);
  });

  it("fiche pro : son propriétaire masque une citation, un autre non", async () => {
    await world();
    const fan = await signUp("Fan_M");
    const proOwner = await signUp("ProOwner_M");
    const other = await signUp("Autre_M");
    const pro = await createPro(proOwner.id, { slug: "wrap-66", verifiedAt: new Date(0) });
    const post = await mkPost({ authorId: fan.id, caption: "@wrap-66" });
    expect((await call(other, "PUT", `/mentions/p:${pro.id}/${post.id}/hidden`)).status).toBe(403);
    expect((await call(proOwner, "PUT", `/mentions/p:${pro.id}/${post.id}/hidden`)).status).toBe(200);
    expect((await call(other, "GET", `/authors/p:${pro.id}/mentions`)).json.items).toEqual([]);
    expect((await call(proOwner, "GET", `/authors/p:${pro.id}/mentions?hidden=1`)).json.items[0].hidden).toBe(true);
  });

  it("`manage.hideFrom` : les fiches que le lecteur gère et qui portent la publication", async () => {
    const { owner, structure, event } = await world();
    const fan = await signUp("Fan_M");
    const post = await mkPost({ authorId: fan.id, eventId: event.id, eventRole: "attendee" });
    const asOwner = await call(owner, "GET", `/feed-posts/${post.id}`);
    expect(asOwner.json.manage.hideFrom.sort()).toEqual([`e:${event.id}`, `s:${structure.id}`].sort());
    expect(asOwner.json.manage).toMatchObject({ canDelete: false, canPin: false, canCommentsOff: false });
    const asFan = await call(fan, "GET", `/feed-posts/${post.id}`);
    expect(asFan.json.manage).toEqual({ canDelete: true, canPin: false, canCommentsOff: true, hideFrom: [] });
  });
});
