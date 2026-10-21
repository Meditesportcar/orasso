import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, samplePhoto, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Rôle boutique et compléments du jour J dans l'appli, dans le navigateur (lot 24) : un passionné demande à devenir
// staff, l'organisateur l'accepte avec le rôle boutique ; dans le mode staff du « Salon Argelès » il scanne un billet
// gratuit (OK puis déjà utilisé), compte 10 visiteurs, envoie une alerte avec position et un incident avec photo en
// mode avion simulé ; au retour du réseau tout part, et l'espace organisateur affiche visiteurs, direct par catégorie,
// alerte avec son lien carte et l'incident avec sa photo.
// Lancer avec APP_URL=http://localhost:<relais> (Metro derrière apps/mobile/scripts/web-isolated.mjs, EXPO_PUBLIC_API_URL,
// EXPO_PUBLIC_SITE_URL et CORS_ORIGINS posés) ; le site et l'API tournent sur la base locale du seed.
const APP = process.env.APP_URL;
const SITE = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-24-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Inject = (x: string) => void;

test("boutique : billet OK puis déjà utilisé, compteur, alerte avec position et incident avec photo hors ligne", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureSlug: string; structureId: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId ?? "";
  expect(structureId).toBeTruthy();

  // 1. Le passionné demande à devenir staff, l'organisateur l'accepte avec le rôle boutique (comme sur le site).
  const pseudo = `Boutique_${unique()}`.slice(0, 24);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const fan = await signUpApi(pseudo);
  expect((await apiCall(fan, "POST", `/structures/${structureId}/staff-requests`, { message: "Dispo" })).status).toBe(
    201,
  );
  const userId = (await apiCall<{ user: { id: string } }>(fan, "GET", "/me")).data.user.id;
  expect((await apiCall(damien, "POST", `/structures/${structureId}/members/${userId}/accept`)).status).toBe(204);
  // Lot 36 : accepter ne donne pas de rôle ; le rôle « Contrôle des billets » (ex-boutique) est donné ensuite.
  expect(
    (await apiCall(damien, "PATCH", `/structures/${structureId}/members/${userId}`, { staffRoles: ["shop"] })).status,
  ).toBe(204);

  const staffEvents = await apiCall<{ event: { id: string; title: string }; roles: string[] }[]>(
    fan,
    "GET",
    "/me/staff-events",
  );
  const salon = staffEvents.data.find((s) => s.event.title.includes("Salon"));
  expect(salon?.roles).toEqual(["shop"]);
  const salonId = salon?.event.id ?? "";

  // Le billet gratuit d'un visiteur (compte neuf : la recette se relance sans dépendre des billets du seed), tel que
  // son téléphone l'affiche.
  const visitor = await signUpApi(`Visiteur_${unique()}`.slice(0, 24));
  const reserved = await apiCall<{ payload: string; status: string }[]>(
    visitor,
    "POST",
    `/events/${salonId}/tickets/reserve`,
    { quantity: 1 },
  );
  expect(reserved.status).toBe(201);
  const ticket = reserved.data[0];
  expect(ticket?.payload).toMatch(/^OB1/);

  const before = await apiCall<{ visitors: number; tickets: { used: number } }>(
    damien,
    "GET",
    `/events/${salonId}/live`,
  );

  // 2. L'appli, en navigateur, avec la géolocalisation autorisée (position de l'alerte).
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: APP,
    geolocation: { latitude: 42.5472, longitude: 3.0431 },
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "sable");
  });
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });

  await page.goto(`/staff/${salonId}`);
  await page.getByRole("button", { name: "Synchroniser la liste" }).click();
  const tile = page.getByTestId("staff-shop-tile");
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/01-staff-tuile-boutique-sable.png` });

  // 3. Boutique : billet OK, puis déjà utilisé, compteur +10.
  await tile.click();
  await expect(page.getByTestId("visitor-counter")).toBeVisible();
  await page.evaluate((p) => {
    (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = true;
    (globalThis as unknown as { __orassoTicketScan: Inject }).__orassoTicketScan(p);
  }, ticket?.payload ?? "");
  await expect(page.getByText("Billet OK").first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${DIR}/02-boutique-billet-ok-sable.png` });
  await page.evaluate(() => {
    (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = false;
  });
  // Le garde anti-rebond relit un QR représenté après 3 s : il est alors « déjà utilisé ».
  await page.waitForTimeout(3500);
  await page.evaluate((p) => {
    (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = true;
    (globalThis as unknown as { __orassoTicketScan: Inject }).__orassoTicketScan(p);
  }, ticket?.payload ?? "");
  await expect(page.getByText("Déjà utilisé").first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${DIR}/03-boutique-billet-deja-utilise-sable.png` });
  await page.evaluate(() => {
    (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = false;
  });
  await page.waitForTimeout(1800);

  // Mode avion simulé : compteur, alerte avec position, incident avec photo.
  await ctx.setOffline(true);
  await page.getByTestId("visitor-plus-10").click();
  await expect(page.getByTestId("visitor-total")).toHaveText("10");
  await page.screenshot({ path: `${DIR}/04-boutique-compteur-hors-ligne-sable.png` });
  // Alerte et main courante restent accessibles en bas de la boutique (docs/02). On ne quitte pas l'écran : sur le web,
  // expo-keep-awake lève une erreur de développement s'il se ferme avant la prise du verrou d'écran.
  await page.getByRole("button", { name: "Alerte", exact: true }).click();
  await page.getByLabel("Ce qui se passe (facultatif)").fill("Bagarre à l'entrée B, besoin de renfort");
  await page.screenshot({ path: `${DIR}/05-alerte-position-sable.png` });
  await page.getByRole("button", { name: "Envoyer l'alerte" }).click();
  await page.getByRole("button", { name: "Main courante" }).click();
  await page.getByLabel("Lieu").fill("Entrée B");
  await page.getByLabel("Ce qui s'est passé").fill("Rétroviseur arraché sur une voiture garée");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("incident-photo-library").click(),
  ]);
  await chooser.setFiles({ name: "incident.png", mimeType: "image/png", buffer: samplePhoto([200, 120, 40]) });
  await expect(page.getByTestId("incident-photo-preview")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${DIR}/06-main-courante-photo-sable.png` });
  await page.getByRole("button", { name: "Enregistrer l'incident" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("visitor-counter")).toContainText("à envoyer", { timeout: 15_000 });
  await page.screenshot({ path: `${DIR}/07-file-hors-ligne-sable.png` });

  // 4. Retour du réseau : tout part ; l'organisateur le voit (API puis site).
  await ctx.setOffline(false);
  await expect
    .poll(
      async () => {
        const live = await apiCall<{ visitors: number; tickets: { used: number } }>(
          damien,
          "GET",
          `/events/${salonId}/live`,
        );
        return `${live.data.visitors - before.data.visitors}/${live.data.tickets.used - before.data.tickets.used}`;
      },
      { timeout: 120_000, intervals: [3_000] },
    )
    .toBe("10/1");
  await expect
    .poll(
      async () => {
        const incidents = await apiCall<{ description: string; hasPhoto: boolean }[]>(
          damien,
          "GET",
          `/events/${salonId}/incidents`,
        );
        return incidents.data.find((i) => i.description.includes("Rétroviseur"))?.hasPhoto ?? false;
      },
      { timeout: 120_000, intervals: [3_000] },
    )
    .toBe(true);
  const alerts = await apiCall<{ message: string; lat: number | null; lng: number | null; distanceM: number | null }[]>(
    damien,
    "GET",
    `/events/${salonId}/alerts`,
  );
  const alert = alerts.data.find((a) => a.message?.includes("Bagarre"));
  expect(alert?.lat).toBeCloseTo(42.5472, 3);
  expect(alert?.distanceM).toBeLessThan(500);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/08-file-envoyee-sable.png` });

  const orgaCtx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    baseURL: SITE,
  });
  const site = await orgaCtx.newPage();
  await loginInBrowser(site, "damien@orasso.local", undefined, `/orga/meditesportcar/e/${salonId}/jour-j`);
  await site.goto(`/orga/meditesportcar/e/${salonId}/jour-j`);
  const counters = site.getByTestId("live-counters");
  await expect(counters).toContainText("visiteurs");
  const after = await apiCall<{ visitors: number; tickets: { sold: number; used: number } }>(
    damien,
    "GET",
    `/events/${salonId}/live`,
  );
  await expect(counters).toContainText(`${after.data.visitors}`);
  await expect(counters).toContainText(`${after.data.tickets.used}/${after.data.tickets.sold}`);
  await expect(
    // (plusieurs relances de la recette peuvent avoir laissé des alertes ouvertes : la première suffit)
    site.getByTestId("field-alert").filter({ hasText: "Bagarre" }).getByTestId("alert-map-link").first(),
  ).toBeVisible();
  const photo = site.getByTestId("incident-photo").first();
  await expect(photo).toBeVisible();
  await expect.poll(async () => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await site.screenshot({ path: `${DIR}/09-site-jour-j-direct-sable.png`, fullPage: true });
  await orgaCtx.close();
  await ctx.close();
});
