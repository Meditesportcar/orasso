// Agir au nom d'une casquette (R8a1) : les droits, regard par regard. Le seul endroit où l'on décide qu'un compte parle au
// nom d'une page : structure (propriétaire ou co-organisateur actif, second facteur), fiche pro, prestataire, média.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { addMember, createPro, createStructure, resetDb, signUp, useClock, viewerOf } from "../../test/helpers";
import { db, pool } from "../db/client";
import { mediaProfiles, providerProfiles, structureMembers, structures } from "../db/schema";
import { canManagePost, managedPageKeys, type PostPageColumns, requireAuthorship } from "./authorship";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-11-10T09:00:00Z"));
});

const denied = { code: "persona_forbidden", status: 403 };

describe("requireAuthorship : structure", () => {
  it("propriétaire avec second facteur : la clé de la structure", async () => {
    const owner = await signUp("Owner_Auth", { twoFactor: true });
    const s = await createStructure(owner.id);
    const a = await requireAuthorship(await viewerOf(owner), { persona: "organizer", structureId: s.id });
    expect(a).toEqual({ key: `s:${s.id}`, kind: "structure", id: s.id });
  });

  it("co-organisateur actif avec second facteur : accepté", async () => {
    const owner = await signUp("Owner_Co");
    const co = await signUp("Co_Auth", { twoFactor: true });
    const s = await createStructure(owner.id);
    await addMember(s.id, co.id, "co_organizer");
    const a = await requireAuthorship(await viewerOf(co), { persona: "organizer", structureId: s.id });
    expect(a.key).toBe(`s:${s.id}`);
  });

  it("membre du staff : refusé", async () => {
    const owner = await signUp("Owner_Staff");
    const staff = await signUp("Staff_Auth", { twoFactor: true });
    const s = await createStructure(owner.id);
    await addMember(s.id, staff.id, "staff");
    await expect(
      requireAuthorship(await viewerOf(staff), { persona: "organizer", structureId: s.id }),
    ).rejects.toMatchObject(denied);
  });

  it("ancien membre : refusé", async () => {
    const owner = await signUp("Owner_Ex");
    const ex = await signUp("Ex_Auth", { twoFactor: true });
    const s = await createStructure(owner.id);
    await addMember(s.id, ex.id, "co_organizer");
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.userId, ex.id));
    await expect(
      requireAuthorship(await viewerOf(ex), { persona: "organizer", structureId: s.id }),
    ).rejects.toMatchObject(denied);
  });

  it("sans second facteur : l'erreur du second facteur remonte telle quelle", async () => {
    const owner = await signUp("Owner_Sans2fa");
    const s = await createStructure(owner.id);
    await expect(
      requireAuthorship(await viewerOf(owner), { persona: "organizer", structureId: s.id }),
    ).rejects.toMatchObject({ code: "two_factor_required" });
  });

  it("structure suspendue ou supprimée : refusé", async () => {
    const owner = await signUp("Owner_Susp", { twoFactor: true });
    const s = await createStructure(owner.id);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s.id));
    await expect(
      requireAuthorship(await viewerOf(owner), { persona: "organizer", structureId: s.id }),
    ).rejects.toMatchObject(denied);
    await db.update(structures).set({ verification: "verified", deletedAt: new Date() }).where(eq(structures.id, s.id));
    await expect(
      requireAuthorship(await viewerOf(owner), { persona: "organizer", structureId: s.id }),
    ).rejects.toMatchObject(denied);
  });

  it("la structure d'un autre : refusé ; sans identifiant : 400", async () => {
    const owner = await signUp("Owner_Autre");
    const other = await signUp("Other_Auth", { twoFactor: true });
    const s = await createStructure(owner.id);
    await expect(
      requireAuthorship(await viewerOf(other), { persona: "organizer", structureId: s.id }),
    ).rejects.toMatchObject(denied);
    await expect(requireAuthorship(await viewerOf(other), { persona: "organizer" })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("requireAuthorship : pro, prestataire, média, passionné", () => {
  it("fiche pro : son propriétaire seulement, non supprimée", async () => {
    const owner = await signUp("Pro_Auth");
    const other = await signUp("Pro_Autre");
    const pro = await createPro(owner.id);
    expect(await requireAuthorship(await viewerOf(owner), { persona: "pro", proId: pro.id })).toEqual({
      key: `p:${pro.id}`,
      kind: "pro",
      id: pro.id,
    });
    await expect(requireAuthorship(await viewerOf(other), { persona: "pro", proId: pro.id })).rejects.toMatchObject(
      denied,
    );
    await expect(requireAuthorship(await viewerOf(owner), { persona: "pro" })).rejects.toMatchObject({ status: 400 });
  });

  it("prestataire et média : le titulaire du profil non supprimé, l'identifiant vient du serveur", async () => {
    const u = await signUp("Titulaire_Auth");
    const other = await signUp("Intrus_Auth");
    await expect(requireAuthorship(await viewerOf(u), { persona: "provider" })).rejects.toMatchObject(denied);
    await expect(requireAuthorship(await viewerOf(u), { persona: "media" })).rejects.toMatchObject(denied);
    const [prov] = await db
      .insert(providerProfiles)
      .values({ userId: u.id, type: "photographer", name: "Studio" })
      .returning();
    const [med] = await db.insert(mediaProfiles).values({ userId: u.id, name: "Média" }).returning();
    expect(await requireAuthorship(await viewerOf(u), { persona: "provider" })).toEqual({
      key: `v:${prov?.id}`,
      kind: "provider",
      id: prov?.id,
    });
    expect(await requireAuthorship(await viewerOf(u), { persona: "media" })).toEqual({
      key: `m:${med?.id}`,
      kind: "media",
      id: med?.id,
    });
    await expect(requireAuthorship(await viewerOf(other), { persona: "provider" })).rejects.toMatchObject(denied);
    // Profil supprimé : plus de droit.
    await db.update(providerProfiles).set({ deletedAt: new Date() }).where(eq(providerProfiles.userId, u.id));
    await db.update(mediaProfiles).set({ deletedAt: new Date() }).where(eq(mediaProfiles.userId, u.id));
    await expect(requireAuthorship(await viewerOf(u), { persona: "provider" })).rejects.toMatchObject(denied);
    await expect(requireAuthorship(await viewerOf(u), { persona: "media" })).rejects.toMatchObject(denied);
  });

  it("passionné : sa propre clé, jamais de page", async () => {
    const u = await signUp("Fan_Auth");
    expect(await requireAuthorship(await viewerOf(u), { persona: "fan" })).toEqual({
      key: `u:${u.id}`,
      kind: "user",
      id: u.id,
    });
    await expect(
      requireAuthorship(await viewerOf(u), { persona: "fan", structureId: "0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a01" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("canManagePost et managedPageKeys", () => {
  const post = (over: Partial<PostPageColumns>): PostPageColumns => ({
    persona: "fan",
    authorId: "x",
    structureId: null,
    proId: null,
    providerId: null,
    mediaId: null,
    ...over,
  });

  it("passionné : son auteur seulement", async () => {
    const a = await signUp("Auteur_Gere");
    const b = await signUp("Autre_Gere");
    expect(await canManagePost(await viewerOf(a), post({ authorId: a.id }))).toBe(true);
    expect(await canManagePost(await viewerOf(b), post({ authorId: a.id }))).toBe(false);
  });

  it("page : les droits de la page, pas l'auteur de la ligne ; faux sur persona_forbidden, second facteur remonté", async () => {
    const owner = await signUp("Owner_Gere", { twoFactor: true });
    const co = await signUp("Co_Gere", { twoFactor: true });
    const staff = await signUp("Staff_Gere", { twoFactor: true });
    const noFactor = await signUp("Co_Sans2fa");
    const s = await createStructure(owner.id);
    await addMember(s.id, co.id, "co_organizer");
    await addMember(s.id, staff.id, "staff");
    await addMember(s.id, noFactor.id, "co_organizer");
    const p = post({ persona: "organizer", authorId: owner.id, structureId: s.id });
    expect(await canManagePost(await viewerOf(owner), p)).toBe(true);
    // Le co-organisateur gère une publication faite par le propriétaire.
    expect(await canManagePost(await viewerOf(co), p)).toBe(true);
    expect(await canManagePost(await viewerOf(staff), p)).toBe(false);
    await expect(canManagePost(await viewerOf(noFactor), p)).rejects.toMatchObject({ code: "two_factor_required" });
    // Une autre structure : refusé même pour son propriétaire.
    const other = await createStructure(co.id);
    expect(await canManagePost(await viewerOf(co), post({ persona: "organizer", structureId: other.id }))).toBe(true);
    expect(await canManagePost(await viewerOf(owner), post({ persona: "organizer", structureId: other.id }))).toBe(
      false,
    );
  });

  it("managedPageKeys : mes pages, sans second facteur, sans les pages perdues", async () => {
    const owner = await signUp("Cles_Owner");
    const staff = await signUp("Cles_Staff");
    const s = await createStructure(owner.id);
    const pro = await createPro(owner.id);
    await addMember(s.id, staff.id, "staff");
    expect(await managedPageKeys(owner.id)).toEqual(new Set([`s:${s.id}`, `p:${pro.id}`]));
    expect(await managedPageKeys(staff.id)).toEqual(new Set());
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s.id));
    expect(await managedPageKeys(owner.id)).toEqual(new Set([`p:${pro.id}`]));
  });
});
