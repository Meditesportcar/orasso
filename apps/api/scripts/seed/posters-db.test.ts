// Lot B3b, tour 1 : ce que la graine des affiches écrit, et ce qu'elle laisse ; la preuve d'origine des éditions de la structure.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "../../src/db/client";
import { events, user } from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { POSTER_PHOTO_PREFIX, posterService } from "../../src/modules/events/poster/service";
import { createEvent, createStructure, resetDb, signUp } from "../../test/helpers";
import { fakePhotoWebp } from "./helpers";
import { demoEventPhotos } from "./photos";
import { posterOf, REPAIR_NO_PHOTO_SLUGS } from "./posters";
import { isSeedEvent } from "./seed-scope";

afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

/** Un compte de la graine (e-mail `@orasso.local`) qui possède une structure. */
async function seedOwner(slug?: string) {
  const u = await signUp(`Orga_${Math.random().toString(36).slice(2, 7)}`);
  await db
    .update(user)
    .set({ email: `${u.pseudo.toLowerCase()}@orasso.local` })
    .where(eq(user.id, u.id));
  const structure = await createStructure(u.id);
  if (slug) await db.execute(sql`update structures set slug = ${slug} where id = ${structure.id}`);
  return { u, structure };
}
const row = async (id: string) =>
  (await db.query.events.findFirst({ where: eq(events.id, id) })) as typeof events.$inferSelect;
const withPoster = (overrides: Partial<typeof events.$inferInsert> = {}) => ({
  posterStyle: "neon" as const,
  posterTitle: "SORTIE",
  posterPostKey: "events/x/poster-post-y0-aa.png",
  posterStoryKey: "events/x/poster-story-y0-aa.png",
  ...overrides,
});

describe("éditions de la structure : le préfixe ne vaut que pour la structure de la graine", () => {
  it("msc-edition-NN : oui pour meditesportcar, non pour une autre structure, même d'un compte de la graine", async () => {
    const msc = await seedOwner("meditesportcar");
    const other = await seedOwner();
    const a = await createEvent(msc.structure.id, { slug: "msc-edition-01", createdBy: msc.u.id });
    const b = await createEvent(other.structure.id, { slug: "msc-edition-02", createdBy: other.u.id });
    const c = await createEvent(msc.structure.id, { slug: "edition-inconnue", createdBy: msc.u.id });
    const seeded = (
      await db.execute<{ id: string }>(sql`select id from events where ${isSeedEvent("events")}`)
    ).rows.map((r) => r.id);
    expect(seeded).toContain(a.id);
    expect(seeded).not.toContain(b.id);
    expect(seeded).not.toContain(c.id);
  });
});

describe("posterOf", () => {
  it("la photo d'un compte (clé hors `seed-`) n'est jamais examinée, même aux octets du dégradé", async () => {
    const { u, structure } = await seedOwner("meditesportcar");
    const key = `${POSTER_PHOTO_PREFIX}envoyee-par-un-compte.webp`;
    await storage.put(key, (await fakePhotoWebp("#b5452a")).data);
    const e = await createEvent(structure.id, { createdBy: u.id, posterPhotoKey: key, ...withPoster() });
    expect(await posterOf(e, await demoEventPhotos())).toBeNull();
    expect((await row(e.id)).posterPhotoKey).toBe(key);
    expect(await storage.get(key)).not.toBeNull();
  });

  it("une photo retirée par un compte reste retirée, sauf sur la liste de réparation", async () => {
    const { u, structure } = await seedOwner("meditesportcar");
    const photos = await demoEventPhotos();
    const retired = await createEvent(structure.id, {
      createdBy: u.id,
      slug: "rassemblement-narbonne",
      ...withPoster(),
    });
    expect(await posterOf(retired, photos)).toBeNull();
    expect((await row(retired.id)).posterPhotoKey).toBeNull();
    const listed = REPAIR_NO_PHOTO_SLUGS[0];
    const repaired = await createEvent(structure.id, { createdBy: u.id, slug: listed, ...withPoster() });
    expect(await posterOf(repaired, photos)).toBe("fixed");
    expect((await row(repaired.id)).posterPhotoKey).toMatch(new RegExp(`^${POSTER_PHOTO_PREFIX}seed-${listed}-`));
  });

  it("l'ancienne photo de la graine est remplacée mais jamais supprimée (une copie peut la référencer)", async () => {
    const { u, structure } = await seedOwner("meditesportcar");
    const old = `${POSTER_PHOTO_PREFIX}seed-rasso-du-lac-2026.webp`;
    await storage.put(old, (await fakePhotoWebp("#b5452a")).data);
    const e = await createEvent(structure.id, {
      createdBy: u.id,
      slug: "rasso-du-lac-2026",
      posterPhotoKey: old,
      ...withPoster(),
    });
    const copy = await createEvent(structure.id, { createdBy: u.id, posterPhotoKey: old, ...withPoster() });
    expect(await posterOf(e, await demoEventPhotos())).toBe("fixed");
    expect((await row(e.id)).posterPhotoKey).not.toBe(old);
    expect((await row(copy.id)).posterPhotoKey).toBe(old);
    expect(await storage.get(old)).not.toBeNull();
  });

  it.each([
    ["le titre d'affiche", { posterTitle: "AUTRE TITRE" }],
    ["la date", { startsAt: new Date(Date.now() + 40 * 86_400_000), endsAt: new Date(Date.now() + 41 * 86_400_000) }],
    ["le titre de l'événement (affiche sans titre propre)", { title: "Autre nom de l'événement" }],
    ["la ville", { city: "Elne" }],
    ["le style", { posterStyle: "swiss" as const }],
  ])(
    "%s change pendant le rendu : rien n'est écrit, aucun rendu laissé, la photo posée reste",
    async (_name, change) => {
      const { u, structure } = await seedOwner("meditesportcar");
      const e = await createEvent(structure.id, { createdBy: u.id });
      let rendered: string[] = [];
      let newPhoto: string | null = null;
      const original = posterService.renderForEvent.bind(posterService);
      vi.spyOn(posterService, "renderForEvent").mockImplementationOnce(async (ev, settings) => {
        newPhoto = settings.photoKey;
        await db.update(events).set(change).where(eq(events.id, e.id));
        const keys = await original(ev, settings);
        rendered = [keys.postKey, keys.storyKey];
        return keys;
      });
      expect(await posterOf(e, await demoEventPhotos())).toBeNull();
      const after = await row(e.id);
      expect([after.posterPostKey, after.posterStoryKey, after.posterPhotoKey]).toEqual([null, null, null]);
      expect(rendered).toHaveLength(2);
      for (const key of rendered) expect(await storage.get(key)).toBeNull();
      // La graine ne supprime jamais un fichier de photo (sa clé peut servir à une copie).
      expect(newPhoto).not.toBeNull();
      expect(await storage.get(newPhoto ?? "")).not.toBeNull();
    },
  );

  it("une clé de photo déjà référencée par une copie reste lisible, que le rendu échoue ou que la garde refuse", async () => {
    const { u, structure } = await seedOwner("meditesportcar");
    const photos = await demoEventPhotos();
    const original = posterService.renderForEvent.bind(posterService);
    for (const mode of ["rendu en échec", "garde refusée"] as const) {
      const e = await createEvent(structure.id, {
        createdBy: u.id,
        slug: `evt-${mode.length}-${Math.random().toString(36).slice(2, 6)}`,
      });
      let key: string | null = null;
      vi.spyOn(posterService, "renderForEvent").mockImplementationOnce(async (ev, settings) => {
        key = settings.photoKey;
        // Une copie d'événement référence déjà ce fichier.
        await createEvent(structure.id, { createdBy: u.id, posterPhotoKey: settings.photoKey, ...withPoster() });
        if (mode === "rendu en échec") throw new Error("rendu impossible");
        await db.update(events).set({ posterTitle: "AUTRE" }).where(eq(events.id, e.id));
        return original(ev, settings);
      });
      if (mode === "rendu en échec") await expect(posterOf(e, photos)).rejects.toThrow("rendu impossible");
      else expect(await posterOf(e, photos)).toBeNull();
      expect(key, mode).not.toBeNull();
      expect(await storage.get(key ?? ""), mode).not.toBeNull();
    }
  });

  it("un rendu qui échoue ne laisse aucune ligne écrite", async () => {
    const { u, structure } = await seedOwner("meditesportcar");
    const e = await createEvent(structure.id, { createdBy: u.id });
    let newPhoto: string | null = null;
    vi.spyOn(posterService, "renderForEvent").mockImplementationOnce(async (_ev, settings) => {
      newPhoto = settings.photoKey;
      throw new Error("rendu impossible");
    });
    await expect(posterOf(e, await demoEventPhotos())).rejects.toThrow("rendu impossible");
    expect((await row(e.id)).posterStyle).toBeNull();
    expect(newPhoto).not.toBeNull();
  });
});
