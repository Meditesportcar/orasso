// Vie privée des abonnements d'une casquette (R9a) : une page ne révèle jamais la personne qui la tient, les listes d'abonnés
// restent celles des personnes, deux pages d'un même titulaire ne se mélangent pas.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../test/actor-call";
import { createPro, createStructure, resetDb, signUp, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { mediaProfiles, pageFollows, providerProfiles } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { followSets } from "./pageFollows";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  useClock(new Date("2026-11-11T09:00:00Z"));
});

async function world() {
  // Un seul humain tient La Brasa ET Auto Sud Mag : ses deux pages ne doivent jamais se mélanger.
  const holder = await signUp("Titulaire_Deux", { twoFactor: true });
  const owner = await signUp("Orga_Priv", { twoFactor: true });
  const proOwner = await signUp("Pro_Priv");
  const kenji = await signUp("Kenji_66");
  const damien = await signUp("Damien_66");
  const [brasa] = await db
    .insert(providerProfiles)
    .values({ userId: holder.id, type: "photographer", name: "La Brasa" })
    .returning();
  const [media] = await db.insert(mediaProfiles).values({ userId: holder.id, name: "Auto Sud Mag" }).returning();
  return {
    holder,
    owner,
    proOwner,
    kenji,
    damien,
    brasa: brasa as NonNullable<typeof brasa>,
    media: media as NonNullable<typeof media>,
    structure: await createStructure(owner.id),
    pro: await createPro(proOwner.id),
  };
}

describe("rien ne trahit le titulaire", () => {
  it("la réponse de PUT|DELETE est exactement { following, followersCount }", async () => {
    const w = await world();
    const put = await callAs(w.holder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/s:${w.structure.id}`);
    expect(Object.keys(put.json).sort()).toEqual(["followersCount", "following"]);
    const del = await callAs(w.holder, `v:${w.brasa.id}`, "DELETE", `/me/page-follows/s:${w.structure.id}`);
    expect(Object.keys(del.json).sort()).toEqual(["followersCount", "following"]);
    for (const text of [put.text, del.text]) {
      expect(text).not.toContain(w.holder.id);
      expect(text).not.toContain(w.holder.pseudo);
    }
  });

  it("les pages du prestataire et du média : les champs d'avant plus followersCount et isFollowing, jamais le titulaire", async () => {
    const w = await world();
    const prov = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    const media = await callAs(w.kenji, null, "GET", `/media/${w.media.id}`);
    expect(prov.status, prov.text).toBe(200);
    expect(prov.json.followersCount).toBe(0);
    expect(prov.json.isFollowing).toBe(false);
    expect(media.json.followersCount).toBe(0);
    expect(media.json.isFollowing).toBe(false);
    for (const res of [prov, media]) {
      expect(res.text).not.toContain(w.holder.id);
      expect(res.text).not.toContain(w.holder.pseudo);
      expect(Object.keys(res.json)).not.toContain("userId");
      expect(Object.keys(res.json)).not.toContain("phone");
      expect(Object.keys(res.json)).not.toContain("email");
    }
  });

  it("la liste des abonnés d'une structure (organisation seule) ne contient que des personnes, jamais une page", async () => {
    const w = await world();
    await callAs(w.damien, null, "POST", `/structures/${w.structure.id}/follow`);
    await callAs(w.holder, `v:${w.brasa.id}`, "POST", `/structures/${w.structure.id}/follow`);
    const list = await callAs(w.owner, null, "GET", `/structures/${w.structure.id}/followers`);
    expect(list.status, list.text).toBe(200);
    expect(list.json.map((f: { pseudo: string }) => f.pseudo)).toEqual([w.damien.pseudo]);
    expect(list.text).not.toContain(w.holder.pseudo);
    // Le nombre, lui, compte les pages (abonnés personnes + pages).
    const page = await callAs(w.kenji, null, "GET", `/structures/by-slug/${w.structure.slug}`);
    expect(page.json.followersCount).toBe(2);
  });
});

describe("deux pages d'un même titulaire ne se mélangent pas", () => {
  it("La Brasa et Auto Sud Mag ont chacune leurs abonnements, et un même titulaire ne peut pas faire suivre l'une par l'autre à son insu", async () => {
    const w = await world();
    expect((await callAs(w.holder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/s:${w.structure.id}`)).status).toBe(200);
    expect((await callAs(w.holder, `m:${w.media.id}`, "PUT", `/me/page-follows/p:${w.pro.id}`)).status).toBe(200);
    const brasa = await followSets({ kind: "provider", id: w.brasa.id, key: `v:${w.brasa.id}` });
    const media = await followSets({ kind: "media", id: w.media.id, key: `m:${w.media.id}` });
    expect([...brasa.structures, ...brasa.pros]).toEqual([w.structure.id]);
    expect([...media.structures, ...media.pros]).toEqual([w.pro.id]);
    // Une page peut suivre l'autre page du même titulaire (c'est une page, pas lui) ; la ligne est à la page suiveuse.
    expect((await callAs(w.holder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/m:${w.media.id}`)).status).toBe(200);
    const rows = await db.select().from(pageFollows);
    expect(rows.filter((r) => r.followerKind === "provider")).toHaveLength(2);
    expect(rows.filter((r) => r.followerKind === "media")).toHaveLength(1);
    // L'état « suivi » se lit pour l'acteur : La Brasa suit Auto Sud Mag, Auto Sud Mag ne suit pas La Brasa.
    expect((await callAs(w.holder, `v:${w.brasa.id}`, "GET", `/media/${w.media.id}`)).json.isFollowing).toBe(true);
    expect((await callAs(w.holder, `m:${w.media.id}`, "GET", `/providers/${w.brasa.id}`)).json.isFollowing).toBe(false);
    // Sans en-tête, la personne ne « suit » rien en son nom.
    expect((await callAs(w.holder, null, "GET", `/media/${w.media.id}`)).json.isFollowing).toBe(false);
  });
});
