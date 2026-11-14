// Rejeu de la graine (lot R9-fix, tours 2, 3 et 4) : elle tourne à chaque déploiement de dev, où des gens publient pour de vrai. Règle
// unique : elle ne touche que ses propres comptes et publications (identifiant fixe, `seed-scope.ts`). Après une activité réelle,
// un rejeu ne plante pas, ne double rien et ne touche à aucune publication ni aucun compte réel.
// La graine complète tourne dans un processus à part sur la base du test (mêmes variables d'environnement). Chaque cas repart d'une
// base réinitialisée puis semée (~25 s par passage) : il s'exécute seul avec un filtre (`-t`). Délais larges.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { resetDb } from "../../test/helpers";
import { BRASA_POST_CAPTION, KENJI_PRESENT_CAPTION, LYDIA_ORGA_POSTS } from "./feed";
import { JULIE_CAPTION, MARC_CAPTION } from "./feed-mentions";
import { createAccount } from "./helpers";

const API = fileURLToPath(new URL("../..", import.meta.url));
const FIRST = "00000000-0000-4000-8000-0000000009a1";
const SECOND = "00000000-0000-4000-8000-0000000009a2";
const REAL_AT = new Date("2027-01-15T10:00:00Z");

/** Le délai de 280 s borne UN passage de la graine (~25 s en temps normal, ~40 s sous charge) ; chaque cas a 900 s. */
function seed(): string {
  const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
    cwd: API,
    env: { ...process.env, NODE_ENV: "development", DEV_CLOCK: "off" },
    encoding: "utf8",
    timeout: 280_000,
  });
  const out = `${run.stdout}\n${run.stderr}`;
  expect(run.status, out.slice(-1500)).toBe(0);
  return out;
}

const profile = async (pseudo: string) => {
  const p = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });
  if (!p) throw new Error(`Compte du seed absent : ${pseudo}`);
  return p;
};
const seedComments = () =>
  db
    .select({ id: t.feedPostComments.id, postId: t.feedPostComments.postId })
    .from(t.feedPostComments)
    .where(sql`${t.feedPostComments.clientId} in (${FIRST}, ${SECOND})`);
const counts = async () => ({
  comments: (await db.select({ n: sql<number>`count(*)::int` }).from(t.feedPostComments))[0]?.n,
  posts: (await db.select({ n: sql<number>`count(*)::int` }).from(t.feedPosts))[0]?.n,
});

/** Une publication réelle (hors graine), avec photo. */
async function realPost(values: Partial<typeof t.feedPosts.$inferInsert> & { authorId: string; caption: string }) {
  const id = randomUUID();
  await db
    .insert(t.feedPosts)
    .values({ id, persona: "fan", department: "66", createdAt: REAL_AT, updatedAt: REAL_AT, ...values });
  await db.insert(t.feedPostPhotos).values({
    postId: id,
    storageKey: `private/feed/${id}/reel.webp`,
    width: 1080,
    height: 1350,
    position: 0,
    plateBlurred: false,
    noPlateConfirmed: true,
  });
  return id;
}
/** Rien de la graine sur cette publication : ni commentaire, ni flamme, ni épingle, ni « vu », ni compteur, ni mention masquée. */
async function expectUntouched(id: string) {
  const row = await db.query.feedPosts.findFirst({ where: eq(t.feedPosts.id, id) });
  expect(row?.commentsCount).toBe(0);
  expect(row?.commentsOff).toBe(false);
  expect(row?.reactionsCount).toBe(0);
  expect(row?.pinnedAt).toBeNull();
  expect(await db.query.feedPostComments.findFirst({ where: eq(t.feedPostComments.postId, id) })).toBeUndefined();
  expect(await db.query.feedPostReactions.findFirst({ where: eq(t.feedPostReactions.postId, id) })).toBeUndefined();
  expect(await db.query.feedSeen.findFirst({ where: eq(t.feedSeen.cardId, `feed_post:${id}`) })).toBeUndefined();
  const hidden = await db.select().from(t.feedPostMentions).where(eq(t.feedPostMentions.postId, id));
  expect(hidden.filter((m) => m.hiddenAt !== null)).toEqual([]);
}

afterAll(async () => {
  await pool.end();
});
// Chaque cas : base réinitialisée, graine complète, puis le scénario.
beforeEach(async () => {
  await resetDb();
  seed();
}, 300_000);

describe("rejeu de la graine après une activité réelle", () => {
  it("réponse supprimée, vraies publications (photo, Lydia, légendes du seed reprises), vrai compte : rien de réel touché", async () => {
    expect(await seedComments()).toHaveLength(2);
    const base = await counts();

    // La réponse de La Brasa est supprimée : le rejeu ne la repose pas et ne plante pas.
    await db.update(t.feedPostComments).set({ deletedAt: new Date() }).where(eq(t.feedPostComments.clientId, SECOND));
    seed();
    expect(await seedComments()).toHaveLength(2);
    expect((await counts()).comments).toBe(base.comments);

    // Vraies publications : légendes du plan ou du seed reprises (même antérieures à l'ancienne borne d'adoption), photo hors seed,
    // Roues Libres 66 au Lydia, Julie_66 avec la légende de la mention masquée.
    const kenji = await profile("Kenji_66");
    const sarah = await profile("Sarah_66");
    const julie = await profile("Julie_66");
    const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
    const lydia = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
    const early = new Date("2026-11-01T10:00:00Z");
    const real = [
      await realPost({ authorId: kenji.userId, caption: "Une vraie publication de Kenji." }),
      await realPost({
        authorId: kenji.userId,
        caption: "Sur le plateau ce week-end.",
        createdAt: early,
        updatedAt: early,
      }),
      await realPost({
        authorId: sarah.userId,
        persona: "organizer",
        structureId: structure?.id,
        eventId: lydia?.id,
        eventRole: "organizer",
        caption: "Le plateau JDM prend forme au pied du Lydia : passez nous voir.",
        createdAt: early,
        updatedAt: early,
      }),
    ];
    const realJulie = await realPost({
      authorId: julie.userId,
      eventId: lydia?.id,
      eventRole: "attendee",
      caption: JULIE_CAPTION,
    });
    // Un vrai compte (hors @orasso.local) dont le pseudo passe avant ceux de la graine.
    const stranger = await createAccount("x", { pseudo: "Aaa_reel", email: "reel@example.com", departments: ["66"] });
    const before = await counts();
    seed();
    expect(await counts()).toEqual(before);
    for (const id of [...real, realJulie]) await expectUntouched(id);
    expect(
      await db.query.feedPostReactions.findFirst({ where: eq(t.feedPostReactions.userId, stranger.id) }),
    ).toBeUndefined();
  }, 900_000);

  it("sans commentaires de page, publication support supprimée puis republiée avec la même légende", async () => {
    // Un premier rejeu : la graine reprend ses annonces en publications au deuxième passage (état stable avant le scénario).
    seed();
    const [support] = await seedComments();
    const kenji = await profile("Kenji_66");
    await db
      .update(t.feedPosts)
      .set({ deletedAt: new Date() })
      .where(eq(t.feedPosts.id, support?.postId ?? ""));
    await db.delete(t.feedPostComments).where(inArray(t.feedPostComments.clientId, [FIRST, SECOND]));
    const republished = await realPost({ authorId: kenji.userId, caption: "Retour de la sortie du Roussillon Drift." });
    const before = await counts();
    seed();
    expect(await seedComments()).toHaveLength(0);
    expect(await counts()).toEqual(before);
    await expectUntouched(republished);
  }, 900_000);

  it("comptes suspendus (titulaires de page, Sarah_66, Kenji_66), stories purgées : la graine va au bout", async () => {
    const who = await Promise.all(["Sofia_66", "Leo_SudCars", "Sarah_66", "Kenji_66"].map(profile));
    // La garde « aucune story » se rouvre après la purge : les stories de la graine sont reposées par des comptes suspendus.
    await db.delete(t.stories);
    await db
      .update(t.profiles)
      .set({ bannedAt: new Date(), suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(
        inArray(
          t.profiles.userId,
          who.map((p) => p.userId),
        ),
      );
    expect(seed()).toContain("Messagerie : Kenji_66");
  }, 900_000);

  /** Les publications de la graine liées au Lydia : (pseudo de l'auteur, légende). Sarah_66 ×3, La Brasa, Julie_66, Marc_66, la sortie. */
  const lydiaKeys: [string, string][] = [
    ...LYDIA_ORGA_POSTS.map((p) => ["Sarah_66", p.caption] as [string, string]),
    ["Sofia_66", BRASA_POST_CAPTION],
    ["Julie_66", JULIE_CAPTION],
    ["Marc_66", MARC_CAPTION],
  ];
  const OUTING = "Le programme de la journée est en ligne%";
  /** Nombre de lignes non supprimées d'un auteur avec une légende (aucun doublon : au plus une). */
  const rows = async (pseudo: string, caption: string) => {
    const p = await profile(pseudo);
    return db
      .select()
      .from(t.feedPosts)
      .where(
        and(eq(t.feedPosts.authorId, p.userId), like(t.feedPosts.caption, caption), isNull(t.feedPosts.deletedAt)),
      );
  };
  const renew = async () => {
    await db
      .update(t.events)
      .set({ endsAt: new Date(Date.now() + 3_600_000) })
      .where(eq(t.events.slug, "rassemblement-du-lydia"));
    seed();
    return (await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") })) ?? null;
  };
  const brasaKept = async (eventId: string) => {
    const sofia = await profile("Sofia_66");
    return db
      .select()
      .from(t.applications)
      .where(
        and(
          eq(t.applications.eventId, eventId),
          eq(t.applications.userId, sofia.userId),
          eq(t.applications.kind, "provider"),
          eq(t.applications.status, "accepted"),
        ),
      );
  };

  it("renouvellement du Lydia ×2 : chaque publication de la graine (dont La Brasa, sa candidature, la sortie) sur le Lydia courant, sans doublon", async () => {
    const old = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
    const ids = LYDIA_ORGA_POSTS.map((p) => p.id);
    expect(await db.select().from(t.feedPosts).where(inArray(t.feedPosts.id, ids))).toHaveLength(3);
    for (const [pseudo, caption] of lydiaKeys) expect(await rows(pseudo, caption), `${pseudo} avant`).toHaveLength(1);
    const outingBefore = await db.select().from(t.feedPosts).where(like(t.feedPosts.caption, OUTING));
    expect(outingBefore.length).toBeLessThanOrEqual(1);
    // Une des trois publications de Roues Libres 66 est supprimée par Sarah_66 : elle ne revient jamais.
    await db
      .update(t.feedPosts)
      .set({ deletedAt: new Date() })
      .where(eq(t.feedPosts.id, ids[2] ?? ""));

    const first = await renew();
    expect(first?.id).not.toBe(old?.id);
    for (const [pseudo, caption] of lydiaKeys) {
      const found = await rows(pseudo, caption);
      const expected = caption === LYDIA_ORGA_POSTS[2]?.caption ? 0 : 1;
      expect(found, `${pseudo} après le 1er renouvellement : ${caption.slice(0, 25)}`).toHaveLength(expected);
      for (const p of found) expect(p.eventId, `${pseudo} rattachée au Lydia courant`).toBe(first?.id);
    }
    expect(await brasaKept(first?.id ?? "")).toHaveLength(1);
    const pinned = await db
      .select({ id: t.feedPosts.id })
      .from(t.feedPosts)
      .where(
        and(
          eq(t.feedPosts.eventId, first?.id ?? ""),
          isNull(t.feedPosts.deletedAt),
          sql`${t.feedPosts.pinnedAt} is not null`,
        ),
      );
    expect(pinned).toHaveLength(1);
    expect(ids).toContain(pinned[0]?.id);
    const kenjiBefore = await rows("Kenji_66", KENJI_PRESENT_CAPTION);
    const outing = await db
      .select()
      .from(t.feedPosts)
      .where(and(like(t.feedPosts.caption, OUTING), isNull(t.feedPosts.deletedAt)));
    expect(outing.length).toBeLessThanOrEqual(1);

    // Deuxième renouvellement : aucun doublon (par auteur et légende), la publication supprimée ne revient toujours pas.
    const second = await renew();
    expect(second?.id).not.toBe(first?.id);
    for (const [pseudo, caption] of lydiaKeys) {
      const found = await rows(pseudo, caption);
      const expected = caption === LYDIA_ORGA_POSTS[2]?.caption ? 0 : 1;
      expect(found, `${pseudo} après le 2e renouvellement`).toHaveLength(expected);
      for (const p of found) expect(p.eventId).toBe(second?.id);
    }
    expect(await brasaKept(second?.id ?? "")).toHaveLength(1);
    expect(await rows("Kenji_66", KENJI_PRESENT_CAPTION)).toHaveLength(kenjiBefore.length);
    expect(
      (
        await db
          .select()
          .from(t.feedPosts)
          .where(and(like(t.feedPosts.caption, OUTING), isNull(t.feedPosts.deletedAt)))
      ).length,
    ).toBe(outing.length);
  }, 900_000);

  it("renouvellement : propriétaire hors graine ou structure supprimée, rien n'est supprimé", async () => {
    const old = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
    // Structure supprimée.
    await db.update(t.structures).set({ deletedAt: new Date() }).where(eq(t.structures.slug, "roues-libres-66"));
    const kept = await renew();
    expect(kept?.id).toBe(old?.id);
    await db.update(t.structures).set({ deletedAt: null }).where(eq(t.structures.slug, "roues-libres-66"));
    // Propriétaire de la structure hors graine (compte réel).
    const sarah = await profile("Sarah_66");
    await db
      .update(t.user)
      .set({ email: `reel-${randomUUID().slice(0, 8)}@example.com` })
      .where(eq(t.user.id, sarah.userId));
    const keptAgain = await renew();
    expect(keptAgain?.id).toBe(old?.id);
    expect(await brasaKept(old?.id ?? "")).toHaveLength(1);
    for (const p of LYDIA_ORGA_POSTS) {
      expect((await db.query.feedPosts.findFirst({ where: eq(t.feedPosts.id, p.id) }))?.eventId).toBe(old?.id);
    }
  }, 900_000);

  it("structure du Lydia suspendue : le renouvellement est sauté, l'ancienne édition est gardée", async () => {
    const old = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
    await db.update(t.structures).set({ verification: "suspended" }).where(eq(t.structures.slug, "roues-libres-66"));
    await db
      .update(t.events)
      .set({ endsAt: new Date(Date.now() + 3_600_000) })
      .where(eq(t.events.slug, "rassemblement-du-lydia"));
    seed();
    const same = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
    expect(same?.id).toBe(old?.id);
  }, 900_000);

  it("« Pour ta sortie » : jamais au nom d'un organisateur hors graine", async () => {
    const sarah = await profile("Sarah_66");
    const stranger = `reel-${randomUUID().slice(0, 8)}@example.com`;
    await db.update(t.user).set({ email: stranger }).where(eq(t.user.id, sarah.userId));
    await db.delete(t.feedPosts).where(like(t.feedPosts.caption, "Le programme de la journée est en ligne%"));
    seed();
    const outing = await db
      .select()
      .from(t.feedPosts)
      .where(like(t.feedPosts.caption, "Le programme de la journée est en ligne%"));
    expect(outing.filter((p) => p.authorId === sarah.userId)).toEqual([]);
  }, 900_000);
});
