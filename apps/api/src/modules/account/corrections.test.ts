// Lot 36 : corrections des retours de Damien côté API — e-mail « Installe l'appli », badge pro jamais sans SIRET
// contrôlé, adresse pro géocodée à nouveau, adresse obligatoire à la publication, aperçu d'un brouillon.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createPro,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { devices, emailOutbox, events, proProfiles } from "../../db/schema";
import { setGeocodeFetch } from "../../lib/geocode";
import { setRegistryFetch } from "../../lib/registry";
import { APP_INSTALL_DELAY_MS, accountService } from "./service";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let fan: TestUser;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 18, hour: 16, minute: 50 }));
  fan = await signUp("Paul_66");
});

afterEach(() => {
  setRegistryFetch(null);
  setGeocodeFetch(null);
});

const appMails = (userId: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.template, "app_install")))
    .then((rows) => rows.filter((r) => (r.payload as { userId?: string }).userId === userId));

describe("e-mail « Installe l'appli » (point 5)", () => {
  it("planifié une heure après la confirmation de l'adresse, envoyé une seule fois", async () => {
    await accountService.onEmailVerified(fan.id);
    const job = clock.jobs.jobs.find((j) => j.name === "account.app-install");
    expect(job?.data).toEqual({ userId: fan.id });
    expect(job?.startAfter?.getTime()).toBe(clock.now.getTime() + APP_INSTALL_DELAY_MS);
    expect(await accountService.sendAppInstallReminder(fan.id)).toBe(true);
    const mails = await appMails(fan.id);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.subject).toBe("Installe l'appli Orasso");
    // Une seule fois par compte.
    expect(await accountService.sendAppInstallReminder(fan.id)).toBe(false);
  });

  it("rien si l'appli a déjà été ouverte sur un téléphone (appareil Android ou iOS)", async () => {
    await db.insert(devices).values({ userId: fan.id, platform: "android", name: "Pixel" });
    expect(await accountService.sendAppInstallReminder(fan.id)).toBe(false);
    expect(await appMails(fan.id)).toHaveLength(0);
  });

  it("l'appli dans un navigateur ne compte pas", async () => {
    await db.insert(devices).values({ userId: fan.id, platform: "web", name: "Navigateur" });
    expect(await accountService.sendAppInstallReminder(fan.id)).toBe(true);
  });
});

describe("badge « pro vérifié » (point 12)", () => {
  const SIRET = "35600000000048";
  const registry = (status: "A" | "F" | null) =>
    setRegistryFetch((async () =>
      status === null
        ? new Response("{}", { status: 503 })
        : new Response(
            JSON.stringify({
              results: [
                {
                  siren: SIRET.slice(0, 9),
                  nom_complet: "GARAGE DU PORT",
                  etat_administratif: "A",
                  siege: { siret: SIRET, code_postal: "66140", libelle_commune: "CANET", etat_administratif: status },
                  complements: {},
                },
              ],
            }),
          )) as unknown as typeof fetch);

  it("jamais sans SIRET contrôlé dans le registre (le chemin qui avait validé un pro sans SIRET)", async () => {
    const admin = await signUp("Admin_36", { twoFactor: true, role: "super_admin" });
    const owner = await signUp("Garage_36");
    const pro = await createPro(owner.id);
    // Sans SIRET : refusé.
    const noSiret = await call(admin, "POST", `/admin/pros/${pro.id}/verify`, { verified: true, note: "Vu sur place" });
    expect(noSiret.status).toBe(409);
    expect(noSiret.json.error.code).toBe("siret_missing");
    expect((await db.query.proProfiles.findFirst({ where: eq(proProfiles.id, pro.id) }))?.verifiedAt).toBeNull();
    await db.update(proProfiles).set({ siret: SIRET }).where(eq(proProfiles.id, pro.id));
    // Registre injoignable : refusé, rien ne change.
    registry(null);
    expect(
      (await call(admin, "POST", `/admin/pros/${pro.id}/verify`, { verified: true, note: "Contrôle du registre" }))
        .status,
    ).toBe(503);
    // Établissement fermé : refusé.
    registry("F");
    const closed = await call(admin, "POST", `/admin/pros/${pro.id}/verify`, {
      verified: true,
      note: "Contrôle du registre",
    });
    expect(closed.json.error.code).toBe("siret_not_matched");
    // Trouvé et actif : badge posé, contrôle gardé.
    registry("A");
    const ok = await call(admin, "POST", `/admin/pros/${pro.id}/verify`, { verified: true, note: "Contrôlé" });
    expect(ok.status).toBe(200);
    const row = await db.query.proProfiles.findFirst({ where: eq(proProfiles.id, pro.id) });
    expect(row?.verifiedAt).toBeInstanceOf(Date);
    expect(row?.registryCheck?.status).toBe("matched");
    // Retirer le badge ne demande pas de contrôle.
    expect(
      (await call(admin, "POST", `/admin/pros/${pro.id}/verify`, { verified: false, note: "Retrait" })).status,
    ).toBe(200);
  });
});

describe("adresse d'une fiche pro (point 12)", () => {
  const geocoder = (hit: { lat: number; lng: number } | null) =>
    setGeocodeFetch(
      (async () =>
        new Response(
          JSON.stringify({
            features: hit
              ? [{ geometry: { coordinates: [hit.lng, hit.lat] }, properties: { label: "Adresse", score: 0.9 } }]
              : [],
          }),
        )) as unknown as typeof fetch,
    );

  it("une adresse modifiée est géocodée à nouveau ; introuvable, la position est effacée", async () => {
    const owner = await signUp("Garage_Geo");
    geocoder({ lat: 42.7, lng: 3.03 });
    const created = await call(owner, "POST", "/pros", {
      name: "Garage du Port",
      activities: ["garage"],
      addressLine: "1 quai du Port",
      city: "Canet-en-Roussillon",
    });
    expect(created.json).toMatchObject({ lat: 42.7, lng: 3.03 });
    geocoder({ lat: 42.55, lng: 3.0 });
    const moved = await call(owner, "PATCH", `/pros/${created.json.id}`, {
      addressLine: "5 rue de la Gare",
      city: "Elne",
    });
    expect(moved.json).toMatchObject({ lat: 42.55, lng: 3.0 });
    geocoder(null);
    const lost = await call(owner, "PATCH", `/pros/${created.json.id}`, { addressLine: "Nulle part" });
    expect(lost.json).toMatchObject({ lat: null, lng: null });
  });
});

describe("événement : adresse obligatoire et aperçu du brouillon (point 1)", () => {
  it("un ancien brouillon sans adresse ne se publie pas ; l'équipe voit l'aperçu, le public non", async () => {
    const owner = await signUp("Orga_36", { twoFactor: true });
    const s = await createStructure(owner.id);
    const draft = await createEvent(s.id, { status: "draft", publishedAt: null, addressLine: null, city: null });
    const refused = await call(owner, "POST", `/events/${draft.id}/publish`);
    expect(refused.status).toBe(400);
    expect(refused.json.error.message).toMatch(/adresse/);
    // Aperçu : la page publique d'un brouillon, pour l'équipe seulement.
    expect((await call(owner, "GET", `/events/by-slug/${draft.slug}`)).json).toMatchObject({ status: "draft" });
    expect((await call(fan, "GET", `/events/by-slug/${draft.slug}`)).status).toBe(404);
    expect((await call(null, "GET", `/events/by-slug/${draft.slug}`)).status).toBe(404);
    await db.update(events).set({ addressLine: "1 quai", city: "Canet" }).where(eq(events.id, draft.id));
    expect((await call(owner, "POST", `/events/${draft.id}/publish`)).status).toBe(200);
  });
});
