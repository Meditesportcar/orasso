// Rejeu de la graine (lot R9-fix, tour 2) : elle tourne à chaque déploiement de dev, où des gens publient pour de vrai. Après une
// activité réelle (réponse de La Brasa supprimée, publication support supprimée, vraie publication de Kenji_66 et de Roues Libres
// 66), un rejeu ne plante pas, ne double rien et ne touche à aucune publication réelle. La graine complète tourne dans un
// processus à part sur la base du test (même variables d'environnement) : plusieurs passages, donc des délais larges.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { resetDb } from "../../test/helpers";

const API = fileURLToPath(new URL("../..", import.meta.url));
const FIRST = "00000000-0000-4000-8000-0000000009a1";
const SECOND = "00000000-0000-4000-8000-0000000009a2";

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
    .select({ id: t.feedPostComments.id, postId: t.feedPostComments.postId, deletedAt: t.feedPostComments.deletedAt })
    .from(t.feedPostComments)
    .where(sql`${t.feedPostComments.clientId} in (${FIRST}, ${SECOND})`);
const counts = async () => ({
  comments: (await db.select({ n: sql<number>`count(*)::int` }).from(t.feedPostComments))[0]?.n,
  reactions: (await db.select({ n: sql<number>`count(*)::int` }).from(t.feedPostReactions))[0]?.n,
  posts: (await db.select({ n: sql<number>`count(*)::int` }).from(t.feedPosts))[0]?.n,
});

afterAll(async () => {
  await pool.end();
});
beforeAll(async () => {
  await resetDb();
}, 60_000);

describe("rejeu de la graine après une activité réelle", () => {
  it("réponse supprimée, publication support supprimée, vraies publications : aucune erreur, aucun doublon, rien de réel touché", async () => {
    seed();
    const first = await seedComments();
    expect(first).toHaveLength(2);
    const support = first[0]?.postId ?? "";
    const base = await counts();

    // 1. La réponse de La Brasa est supprimée (par elle, Kenji ou la modération) : le rejeu ne la repose pas et ne plante pas.
    await db.update(t.feedPostComments).set({ deletedAt: new Date() }).where(eq(t.feedPostComments.clientId, SECOND));
    seed();
    expect(await seedComments()).toHaveLength(2);
    expect((await counts()).comments).toBe(base.comments);

    // 2. Vraies publications de Kenji_66 (sans commentaire) et de Roues Libres 66 (sans flamme) : aucune n'est touchée.
    const kenji = await profile("Kenji_66");
    const sarah = await profile("Sarah_66");
    const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
    const realFan = randomUUID();
    const realOrga = randomUUID();
    const later = new Date(Date.now() + 60_000);
    await db.insert(t.feedPosts).values({
      id: realFan,
      authorId: kenji.userId,
      persona: "fan",
      caption: "Une vraie publication de Kenji.",
      department: "66",
      createdAt: later,
      updatedAt: later,
    });
    await db.insert(t.feedPosts).values({
      id: realOrga,
      authorId: sarah.userId,
      persona: "organizer",
      structureId: structure?.id,
      caption: "Une vraie publication de Roues Libres 66.",
      department: "66",
      createdAt: later,
      updatedAt: later,
    });
    const before = await counts();
    seed();
    const after = await counts();
    expect(after).toEqual(before);
    for (const id of [realFan, realOrga]) {
      const row = await db.query.feedPosts.findFirst({ where: eq(t.feedPosts.id, id) });
      expect(row?.commentsCount).toBe(0);
      expect(row?.commentsOff).toBe(false);
      expect(row?.reactionsCount).toBe(0);
      expect(await db.query.feedPostComments.findFirst({ where: eq(t.feedPostComments.postId, id) })).toBeUndefined();
      expect(await db.query.feedPostReactions.findFirst({ where: eq(t.feedPostReactions.postId, id) })).toBeUndefined();
    }

    // 3. La publication support est supprimée par Kenji_66 : rien n'est reporté sur une autre, aucune erreur.
    await db.update(t.feedPosts).set({ deletedAt: new Date() }).where(eq(t.feedPosts.id, support));
    const beforeDeleted = await counts();
    seed();
    // Le rail des flammes peut passer à d'autres publications du seed (la supprimée n'est plus candidate) : on compare les commentaires
    // et les publications ; les publications réelles restent contrôlées plus bas.
    const afterDeleted = await counts();
    expect(afterDeleted.comments).toBe(beforeDeleted.comments);
    expect(afterDeleted.posts).toBe(beforeDeleted.posts);
    for (const id of [realFan, realOrga]) {
      expect((await db.query.feedPosts.findFirst({ where: eq(t.feedPosts.id, id) }))?.reactionsCount).toBe(0);
    }
    expect(
      await db.query.feedPostComments.findFirst({
        where: and(eq(t.feedPostComments.postId, realFan)),
      }),
    ).toBeUndefined();
  }, 900_000);
});
