// Lot R6b (D37) : la migration des amitiés en abonnements, jouée sur une base existante qui a des amitiés, des
// demandes et des abonnements qui se recouvrent. Seule la partie « données » du fichier est rejouée (le schéma est
// déjà migré dans la base de test) ; le fichier est cherché par son nom, pas par son numéro (renuméroté à la fusion).
import { readdirSync, readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resetDb, signUp, type TestUser } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { friendships, profiles, userFollows } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

const DIR = new URL("../../../drizzle/", import.meta.url);
const file = readdirSync(DIR).find((f) => f.endsWith("_follow-requests.sql"));
const dataPart = () => {
  const text = readFileSync(new URL(file as string, DIR), "utf8");
  const start = text.indexOf("-- Lot R6b");
  return text
    .slice(start)
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
};

async function migrate() {
  for (const statement of dataPart()) await db.execute(sql.raw(statement));
}

const row = async (follower: TestUser, followed: TestUser) =>
  (
    await db
      .select()
      .from(userFollows)
      .where(and(eq(userFollows.followerId, follower.id), eq(userFollows.followedId, followed.id)))
  )[0];

const setPrivate = (u: TestUser) => db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));

describe("migration des amitiés en abonnements (lot R6b)", () => {
  it("amitié acceptée → deux abonnements ; demande → demande d'abonnement ; refus : rien ; sans doublon", async () => {
    expect(file).toBeDefined();
    const [kenji, lea, marc, julie, nina, damien, theo, sarah, paul] = (await Promise.all(
      ["Kenji_M", "Lea_M", "Marc_M", "Julie_M", "Nina_M", "Damien_M", "Theo_M", "Sarah_M", "Paul_M"].map((p) =>
        signUp(p),
      ),
    )) as TestUser[] as [TestUser, TestUser, TestUser, TestUser, TestUser, TestUser, TestUser, TestUser, TestUser];
    await setPrivate(marc);
    await setPrivate(sarah);
    const at = new Date("2026-09-01T10:00:00Z");
    const accepted = new Date("2026-09-02T10:00:00Z");
    await db.insert(friendships).values([
      // Amitiés acceptées : Kenji ↔ Léa (Kenji suivait déjà Léa), Marc (privé) ↔ Julie.
      { requesterId: kenji.id, addresseeId: lea.id, status: "accepted", createdAt: at, respondedAt: accepted },
      { requesterId: marc.id, addresseeId: julie.id, status: "accepted", createdAt: at, respondedAt: accepted },
      // Demandes en attente : Théo → Marc (privé), Nina → Damien (public).
      { requesterId: theo.id, addresseeId: marc.id, status: "pending", createdAt: at },
      { requesterId: nina.id, addresseeId: damien.id, status: "pending", createdAt: at },
      // Refusée : rien.
      { requesterId: paul.id, addresseeId: sarah.id, status: "declined", createdAt: at, respondedAt: accepted },
    ]);
    // Abonnements existants (lot R4c) : Kenji → Léa (recouvre l'amitié), Paul → Marc (compte devenu privé depuis, sans
    // amitié), Julie → Marc (compte devenu privé, amitié acceptée), Théo → Damien (public).
    const before = new Date("2026-08-01T10:00:00Z");
    await db.insert(userFollows).values([
      { followerId: kenji.id, followedId: lea.id, createdAt: before },
      { followerId: paul.id, followedId: marc.id, createdAt: before },
      { followerId: julie.id, followedId: marc.id, createdAt: before },
      { followerId: theo.id, followedId: damien.id, createdAt: before },
    ]);

    await migrate();

    // Amitiés : deux abonnements acceptés ; l'abonnement qui existait garde sa date d'origine.
    expect(await row(kenji, lea)).toMatchObject({ status: "accepted", createdAt: before });
    expect((await row(kenji, lea))?.acceptedAt).toEqual(before);
    expect(await row(lea, kenji)).toMatchObject({ status: "accepted", createdAt: at, acceptedAt: accepted });
    expect(await row(marc, julie)).toMatchObject({ status: "accepted", acceptedAt: accepted });
    expect(await row(julie, marc)).toMatchObject({ status: "accepted" });
    // Demandes : vers un privé, une demande ; vers un public, acceptée.
    expect(await row(theo, marc)).toMatchObject({ status: "pending", acceptedAt: null });
    expect(await row(nina, damien)).toMatchObject({ status: "accepted", acceptedAt: at });
    // Refus : rien.
    expect(await row(paul, sarah)).toBeUndefined();
    // Un compte devenu privé ne s'ouvre pas à qui le suivait sans amitié : l'abonnement redevient une demande.
    expect(await row(paul, marc)).toMatchObject({ status: "pending", acceptedAt: null });
    // Un abonnement vers un compte public reste accepté, daté de sa création.
    expect(await row(theo, damien)).toMatchObject({ status: "accepted", acceptedAt: before });
    // Sans doublon : une ligne par paire et par sens.
    const all = await db.select().from(userFollows);
    expect(all).toHaveLength(8);
    expect(new Set(all.map((r) => `${r.followerId}>${r.followedId}`)).size).toBe(all.length);
    // L'archive `friendships` reste telle quelle (retirée dans un lot suivant).
    expect(await db.select().from(friendships)).toHaveLength(5);
  });

  it("rejouée sur une base déjà migrée : rien ne change", async () => {
    const a = await signUp("Alpha_M");
    const b = await signUp("Bravo_M");
    await db.insert(friendships).values({ requesterId: a.id, addresseeId: b.id, status: "accepted" });
    await migrate();
    const sorted = async () =>
      (await db.select().from(userFollows)).sort((x, y) =>
        `${x.followerId}${x.followedId}`.localeCompare(`${y.followerId}${y.followedId}`),
      );
    const first = await sorted();
    await migrate();
    expect(await sorted()).toEqual(first);
    expect(first).toHaveLength(2);
  });
});
