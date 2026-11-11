// L'acteur d'une lecture ou d'une écriture sociale (R9a) : regard par regard. Lire en casquette ne demande pas le second
// facteur ; écrire le demande pour une structure (`requireAuthorship`). Toute page non tenue répond 403 `persona_forbidden`,
// sans dire si elle existe.
import { ACTOR_HEADER } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../test/actor-call";
import { addMember, createPro, createStructure, resetDb, signUp, useClock, viewerOf } from "../../test/helpers";
import { db, pool } from "../db/client";
import { mediaProfiles, providerProfiles, structureMembers, structures } from "../db/schema";
import { readActor, writeActor } from "./actor";
import type { AppEnv } from "./session";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-11-11T09:00:00Z"));
});

const denied = { code: "persona_forbidden", status: 403 };

/** Un contexte réduit à ce que lit l'acteur : l'en-tête. */
const ctx = (header?: string) =>
  ({ req: { header: (name: string) => (name === ACTOR_HEADER ? header : undefined) } }) as unknown as Context<AppEnv>;

describe("sans page : moi", () => {
  it("en-tête absent, vide ou u:<moi> : le compte lui-même, en lecture et en écriture", async () => {
    const u = await signUp("Acteur_Moi");
    const v = await viewerOf(u);
    for (const header of [undefined, "", "   ", `u:${u.id}`]) {
      expect(await readActor(ctx(header), v)).toEqual({ kind: "user", id: u.id, key: `u:${u.id}` });
      expect(await writeActor(ctx(header), v)).toEqual({ kind: "user", id: u.id, key: `u:${u.id}` });
    }
  });

  it("u:<un autre> et les clés mal formées : 403, jamais « moi »", async () => {
    const u = await signUp("Acteur_Mal");
    const other = await signUp("Acteur_Autre");
    const v = await viewerOf(u);
    for (const header of [
      `u:${other.id}`,
      "x:123",
      "s:pas-un-uuid",
      "v:",
      "e:3f2b1c0a-1111-4222-8333-444455556666",
      "u:",
      "n importe quoi",
    ]) {
      await expect(readActor(ctx(header), v), header).rejects.toMatchObject(denied);
      await expect(writeActor(ctx(header), v), header).rejects.toMatchObject(denied);
    }
  });
});

describe("structure", () => {
  it("propriétaire avec second facteur : lecture et écriture", async () => {
    const owner = await signUp("Acteur_Owner", { twoFactor: true });
    const s = await createStructure(owner.id);
    const v = await viewerOf(owner);
    const expected = { kind: "structure", id: s.id, key: `s:${s.id}` };
    expect(await readActor(ctx(`s:${s.id}`), v)).toEqual(expected);
    expect(await writeActor(ctx(`s:${s.id}`), v)).toEqual(expected);
    // La casse d'un UUID reçu ne change rien.
    expect(await readActor(ctx(`s:${s.id.toUpperCase()}`), v)).toEqual(expected);
  });

  it("co-organisateur : sans second facteur, la lecture passe et l'écriture remonte l'erreur du second facteur", async () => {
    const owner = await signUp("Acteur_Owner2");
    const co = await signUp("Acteur_Co");
    const s = await createStructure(owner.id);
    await addMember(s.id, co.id, "co_organizer");
    const v = await viewerOf(co);
    expect((await readActor(ctx(`s:${s.id}`), v)).key).toBe(`s:${s.id}`);
    await expect(writeActor(ctx(`s:${s.id}`), v)).rejects.toMatchObject({ code: "two_factor_required" });
  });

  it("propriétaire sans second facteur : la lecture passe, l'écriture est refusée", async () => {
    const owner = await signUp("Acteur_Owner2b");
    const s = await createStructure(owner.id);
    const v = await viewerOf(owner);
    expect((await readActor(ctx(`s:${s.id}`), v)).key).toBe(`s:${s.id}`);
    await expect(writeActor(ctx(`s:${s.id}`), v)).rejects.toMatchObject({ code: "two_factor_required" });
  });

  it("co-organisateur avec second facteur : lecture et écriture", async () => {
    const owner = await signUp("Acteur_Owner3");
    const co = await signUp("Acteur_Co2", { twoFactor: true });
    const s = await createStructure(owner.id);
    await addMember(s.id, co.id, "co_organizer");
    const v = await viewerOf(co);
    expect((await readActor(ctx(`s:${s.id}`), v)).key).toBe(`s:${s.id}`);
    expect((await writeActor(ctx(`s:${s.id}`), v)).key).toBe(`s:${s.id}`);
  });

  it("membre du staff, ancien membre, étranger : 403 en lecture comme en écriture", async () => {
    const owner = await signUp("Acteur_Owner4");
    const staff = await signUp("Acteur_Staff", { twoFactor: true });
    const ex = await signUp("Acteur_Ex", { twoFactor: true });
    const stranger = await signUp("Acteur_Etranger", { twoFactor: true });
    const s = await createStructure(owner.id);
    await addMember(s.id, staff.id, "staff");
    await addMember(s.id, ex.id, "co_organizer");
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.userId, ex.id));
    for (const u of [staff, ex, stranger]) {
      const v = await viewerOf(u);
      await expect(readActor(ctx(`s:${s.id}`), v), u.pseudo).rejects.toMatchObject(denied);
      await expect(writeActor(ctx(`s:${s.id}`), v), u.pseudo).rejects.toMatchObject(denied);
    }
  });

  it("structure suspendue ou supprimée : 403, la même réponse que pour une structure inconnue", async () => {
    const owner = await signUp("Acteur_Owner5", { twoFactor: true });
    const s = await createStructure(owner.id);
    const v = await viewerOf(owner);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s.id));
    await expect(readActor(ctx(`s:${s.id}`), v)).rejects.toMatchObject(denied);
    await expect(writeActor(ctx(`s:${s.id}`), v)).rejects.toMatchObject(denied);
    await db.update(structures).set({ verification: "verified", deletedAt: new Date() }).where(eq(structures.id, s.id));
    await expect(readActor(ctx(`s:${s.id}`), v)).rejects.toMatchObject(denied);
    await expect(writeActor(ctx(`s:${s.id}`), v)).rejects.toMatchObject(denied);
    const unknown = "3f2b1c0a-1111-4222-8333-444455556666";
    const a = await readActor(ctx(`s:${unknown}`), v).catch((e) => e);
    const b = await readActor(ctx(`s:${s.id}`), v).catch((e) => e);
    expect([a.status, a.code, a.message]).toEqual([b.status, b.code, b.message]);
  });
});

describe("fiche pro, prestataire, média", () => {
  it("fiche pro : la sienne seulement, pas celle d'un autre, pas une fiche supprimée", async () => {
    const owner = await signUp("Acteur_Pro");
    const other = await signUp("Acteur_ProAutre");
    const pro = await createPro(owner.id);
    const v = await viewerOf(owner);
    expect((await readActor(ctx(`p:${pro.id}`), v)).key).toBe(`p:${pro.id}`);
    expect((await writeActor(ctx(`p:${pro.id}`), v)).key).toBe(`p:${pro.id}`);
    const o = await viewerOf(other);
    await expect(readActor(ctx(`p:${pro.id}`), o)).rejects.toMatchObject(denied);
    await expect(writeActor(ctx(`p:${pro.id}`), o)).rejects.toMatchObject(denied);
    await db.execute(sql`update pro_profiles set deleted_at = now() where id = ${pro.id}`);
    await expect(readActor(ctx(`p:${pro.id}`), v)).rejects.toMatchObject(denied);
    await expect(writeActor(ctx(`p:${pro.id}`), v)).rejects.toMatchObject(denied);
  });

  it("prestataire et média : le titulaire du profil non supprimé, l'identifiant doit être celui du profil", async () => {
    const u = await signUp("Acteur_Titulaire");
    const other = await signUp("Acteur_Intrus");
    const [prov] = await db
      .insert(providerProfiles)
      .values({ userId: u.id, type: "photographer", name: "Studio" })
      .returning();
    const [med] = await db.insert(mediaProfiles).values({ userId: u.id, name: "Média" }).returning();
    const [otherProv] = await db
      .insert(providerProfiles)
      .values({ userId: other.id, type: "photographer", name: "Autre studio" })
      .returning();
    const v = await viewerOf(u);
    expect((await readActor(ctx(`v:${prov?.id}`), v)).key).toBe(`v:${prov?.id}`);
    expect((await writeActor(ctx(`v:${prov?.id}`), v)).key).toBe(`v:${prov?.id}`);
    expect((await writeActor(ctx(`m:${med?.id}`), v)).key).toBe(`m:${med?.id}`);
    // Le prestataire d'un autre : refusé, même si le titulaire a lui aussi un profil.
    await expect(readActor(ctx(`v:${otherProv?.id}`), v)).rejects.toMatchObject(denied);
    await expect(writeActor(ctx(`v:${otherProv?.id}`), v)).rejects.toMatchObject(denied);
    // Profil supprimé : plus de droit.
    await db
      .update(providerProfiles)
      .set({ deletedAt: new Date() })
      .where(eq(providerProfiles.id, prov?.id ?? ""));
    await db
      .update(mediaProfiles)
      .set({ deletedAt: new Date() })
      .where(eq(mediaProfiles.id, med?.id ?? ""));
    await expect(readActor(ctx(`v:${prov?.id}`), v)).rejects.toMatchObject(denied);
    await expect(writeActor(ctx(`m:${med?.id}`), v)).rejects.toMatchObject(denied);
  });
});

describe("seules les routes du lot lisent l'en-tête", () => {
  it("une route ordinaire ignore un acteur invalide ; les routes de la fiche le refusent", async () => {
    const u = await signUp("Acteur_Ignore");
    const bogus = "s:3f2b1c0a-1111-4222-8333-444455556666";
    expect((await callAs(u, bogus, "GET", "/me")).status).toBe(200);
    expect((await callAs(u, bogus, "GET", "/me/notifications")).status).toBe(200);
    const bar = await callAs(u, bogus, "GET", "/stories/bar");
    expect(bar.status).toBe(403);
    expect(bar.json.error.code).toBe("persona_forbidden");
  });
});
