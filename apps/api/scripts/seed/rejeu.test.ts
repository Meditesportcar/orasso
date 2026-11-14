// Rejeu de la graine (lot R9-fix, tours 2 et 3) : elle tourne à chaque déploiement de dev, où des gens publient pour de vrai. Règle
// unique : elle ne touche que ses propres comptes et publications (identifiant fixe, `seed-scope.ts`). Après une activité réelle,
// un rejeu ne plante pas, ne double rien et ne touche à aucune publication ni aucun compte réel.
// La graine complète tourne dans un processus à part sur la base du test (mêmes variables d'environnement) : une dizaine de passages
// d'environ 25 s, donc des délais larges (voir le journal des choix pour la place de ce test dans `pnpm test`).
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { resetDb } from "../../test/helpers";
import { createAccount } from "./helpers";

const API = fileURLToPath(new URL("../..", import.meta.url));
const FIRST = "00000000-0000-4000-8000-0000000009a1";
const SECOND = "00000000-0000-4000-8000-0000000009a2";
// Après `SEED_ADOPT_BEFORE` : jamais adoptées par la graine, même avec la légende et l'auteur de la graine.
const REAL_AT = new Date("2027-01-15T10:00:00Z");

/** Le délai de 280 s borne UN passage de la graine (~25 s en temps normal, ~40 s sous charge) ; chaque test a 900 s. */
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
/** Rien de la graine sur cette publication : ni commentaire, ni flamme, ni épingle, ni « vu », ni compteur. */
async function expectUntouched(id: string) {
  const row = await db.query.feedPosts.findFirst({ where: eq(t.feedPosts.id, id) });
  expect(row?.commentsCount).toBe(0);
  expect(row?.commentsOff).toBe(false);
  expect(row?.reactionsCount).toBe(0);
  expect(row?.pinnedAt).toBeNull();
  expect(await db.query.feedPostComments.findFirst({ where: eq(t.feedPostComments.postId, id) })).toBeUndefined();
  expect(await db.query.feedPostReactions.findFirst({ where: eq(t.feedPostReactions.postId, id) })).toBeUndefined();
  expect(await db.query.feedSeen.findFirst({ where: eq(t.feedSeen.cardId, `feed_post:${id}`) })).toBeUndefined();
}

afterAll(async () => {
  await pool.end();
});
beforeAll(async () => {
  await resetDb();
}, 60_000);

describe("rejeu de la graine après une activité réelle", () => {
  it("réponse supprimée, vraies publications (photo, Lydia, légendes du seed reprises), vrai compte : rien de réel touché", async () => {
    seed();
    expect(await seedComments()).toHaveLength(2);
    const base = await counts();

    // 1. La réponse de La Brasa est supprimée : le rejeu ne la repose pas et ne plante pas.
    await db.update(t.feedPostComments).set({ deletedAt: new Date() }).where(eq(t.feedPostComments.clientId, SECOND));
    seed();
    expect(await seedComments()).toHaveLength(2);
    expect((await counts()).comments).toBe(base.comments);

    // 2. Vraies publications : Kenji_66 (légendes du plan reprises), Roues Libres 66 au Lydia (légende du seed reprise).
    const kenji = await profile("Kenji_66");
    const sarah = await profile("Sarah_66");
    const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
    const lydia = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
    const real = [
      await realPost({ authorId: kenji.userId, caption: "Une vraie publication de Kenji." }),
      await realPost({ authorId: kenji.userId, caption: "Sur le plateau ce week-end." }),
      await realPost({
        authorId: sarah.userId,
        persona: "organizer",
        structureId: structure?.id,
        eventId: lydia?.id,
        eventRole: "organizer",
        caption: "Le plateau JDM prend forme au pied du Lydia : passez nous voir.",
      }),
    ];
    // Un vrai compte (hors @orasso.local) dont le pseudo passe avant ceux de la graine.
    const stranger = await createAccount("x", { pseudo: "Aaa_reel", email: "reel@example.com", departments: ["66"] });
    const before = await counts();
    seed();
    expect(await counts()).toEqual(before);
    for (const id of real) await expectUntouched(id);
    expect(
      await db.query.feedPostReactions.findFirst({ where: eq(t.feedPostReactions.userId, stranger.id) }),
    ).toBeUndefined();
  }, 900_000);

  it("sans commentaires de page, publication support supprimée puis republiée avec la même légende", async () => {
    const [support] = await seedComments();
    const kenji = await profile("Kenji_66");
    // La publication support est supprimée par Kenji_66 ; les commentaires de page n'existent plus.
    await db
      .update(t.feedPosts)
      .set({ deletedAt: new Date() })
      .where(eq(t.feedPosts.id, support?.postId ?? ""));
    await db.delete(t.feedPostComments).where(inArray(t.feedPostComments.clientId, [FIRST, SECOND]));
    // Il republie avec la même légende : ce n'est pas la publication de la graine.
    const republished = await realPost({ authorId: kenji.userId, caption: "Retour de la sortie du Roussillon Drift." });
    const before = await counts();
    seed();
    expect(await seedComments()).toHaveLength(0);
    expect(await counts()).toEqual(before);
    await expectUntouched(republished);
  }, 900_000);

  it("titulaires de page suspendus (Sofia_66, Léo) : la graine va au bout", async () => {
    const holders = [await profile("Sofia_66"), await profile("Leo_SudCars")].map((p) => p.userId);
    await db.update(t.stories).set({ deletedAt: new Date() }).where(inArray(t.stories.authorId, holders));
    await db
      .update(t.profiles)
      .set({ bannedAt: new Date(), suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(inArray(t.profiles.userId, holders));
    expect(seed()).toContain("Messagerie : Kenji_66");
  }, 900_000);
});
