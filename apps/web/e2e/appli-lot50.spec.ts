import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  type Cookie,
  createEvent,
  decideApi,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  simulateSettle,
  unique,
} from "./helpers";
import { auditApp } from "./helpers/lot43";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot 50, côté appli (version web de recette) : passeport (les 9 tampons de Kenji sur deux pages, dont 1 rare ; le
// tampon qui tombe au pointage, sur le passeport et sur l'écran jour J), prix du public (vote ouvert avec le
// classement en direct, vote clos, résultats après le règlement), récap (de Béziers Night, acquis ; d'un événement
// fini pas encore réglé, projeté, puis acquis), carte à partager (trois styles, zones masquées par Instagram, les
// trois PNG de la story). Deux thèmes, captures à 390 px.
// Lancer avec APP_URL=http://localhost:8351 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée
// (`DEV_CLOCK` inutile : les dates de l'événement de recette sont reculées en base, puis `simulateSettle`).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-50-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const THEMES: Theme[] =
  process.env.ONLY_THEME === "sable" ? ["sable"] : process.env.ONLY_THEME === "beton" ? ["beton"] : ["beton", "sable"];
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;

const consoleErrors: string[] = [];

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
    for (const p of ["exhibitor", "visitor", "pro", "provider", "media"]) localStorage.setItem(`orasso.tuto_${p}`, "1");
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 }, timeout: 5_000 }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 30_000 });
}

async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 60_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Règles du système de design à l'écran : un seul néon, un seul bouton principal, icônes, pas de vert, pas de défilement horizontal. */
async function checkRules(page: Page, theme: Theme, name: string) {
  await page.waitForTimeout(1200);
  const audit = await auditApp(page, theme);
  expect(
    audit.primaryButtons,
    `${name} : un seul bouton principal : ${audit.primaryLabels.join(" | ")}`,
  ).toBeLessThanOrEqual(1);
  expect(audit.neon, `${name} : un seul néon : ${audit.neonLabels.join(" | ")}`).toBeLessThanOrEqual(1);
  expect(audit.buttonsWithoutIcon, `${name} : tout bouton porte une icône`).toEqual([]);
  expect(audit.greens, `${name} : pas de vert`).toEqual([]);
  expect(audit.horizontalScroll, `${name} : pas de défilement horizontal`).toBe(false);
  expect(audit.unoutlinedOnPhoto, `${name} : texte sur photo en contour`).toEqual([]);
}

/** Ouvre le passeport de Kenji par la tuile de Mon profil (casquette exposant : l'écran, pas l'onglet). */
async function openPassportFromProfile(page: Page) {
  await page.getByRole("tab", { name: "Profil", exact: true }).click();
  await expect(page.getByTestId("profil-passport")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("profil-passport").click();
  await expect(page).toHaveURL(/mon-passeport/, { timeout: 30_000 });
}

/** Un événement de recette avec des pilotes retenus (et pointés plus loin par l'organisateur). */
type Pilot = { pseudo: string; cookie: Cookie; applicationId: string };
async function pilotAt(eventId: string, damien: Cookie, pseudo: string): Promise<Pilot> {
  const cookie = await signUpApi(pseudo);
  const vehicleId = await addVehicleApi(cookie, randomPlate());
  const applicationId = await applyApi(cookie, eventId, vehicleId);
  await decideApi(damien, eventId, applicationId, "accept");
  return { pseudo, cookie, applicationId };
}

async function kenjiAt(eventId: string, damien: Cookie) {
  const cookie = await login("kenji@orasso.local");
  const vehicles = await apiCall<{ id: string; status: string }[]>(cookie, "GET", "/me/vehicles");
  const vehicle = vehicles.data.find((v) => v.status === "active");
  expect(vehicle, "véhicule actif de Kenji").toBeTruthy();
  const applicationId = await applyApi(cookie, eventId, vehicle?.id ?? "");
  await decideApi(damien, eventId, applicationId, "accept");
  return { cookie, applicationId, vehicleId: vehicle?.id ?? "" };
}

async function checkIn(damien: Cookie, eventId: string, applicationId: string) {
  const res = await apiCall(damien, "POST", `/events/${eventId}/checkins`, { applicationId, method: "manual" });
  expect(res.status, `pointage : ${JSON.stringify(res.data)}`).toBe(201);
}

test("passeport de Kenji : 9 tampons dont 1 rare, deux pages, la légende (deux thèmes)", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await openPassportFromProfile(page);
    await expect(page.getByRole("heading", { name: "Passeport", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("9 tampons · 1 rare", { exact: true })).toBeVisible();
    await expect(page.getByTestId("passport-book")).toBeVisible();
    // Huit tampons sur la première page, un sur la seconde ; le carnet s'ouvre sur la dernière.
    await expect(page.getByTestId("passport-page")).toHaveText("Page 2 sur 2");
    expect(await page.locator('[data-testid^="stamp-"]').count()).toBe(9);
    expect(await page.getByTestId("passport-page-1").locator('[data-testid^="stamp-"]').count()).toBe(8);
    expect(await page.getByTestId("passport-page-2").locator('[data-testid^="stamp-"]').count()).toBe(1);
    await shot(page, `passeport-page-2-${theme}`);
    await checkRules(page, theme, `passeport page 2 ${theme}`);
    // La page 1 : on y va par les points sous le carnet.
    await page.getByRole("tab", { name: "Page 1 sur 2" }).click();
    await expect(page.getByTestId("passport-page")).toHaveText("Page 1 sur 2");
    await shot(page, `passeport-page-1-${theme}`);
    // Les quatre notes.
    for (const lead of ["La forme", "L'encre", "L'usure", "Les rares"]) {
      await expect(page.getByTestId("passport-legend").getByText(lead, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Deux pages ne se ressemblent jamais.")).toBeVisible();
    await page.getByTestId("passport-legend").scrollIntoViewIfNeeded();
    await shot(page, `passeport-legende-${theme}`);
    await ctx.close();
  }
});

test("visiteur sans tampon : l'onglet Passeport et son état vide", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "beton");
  await page.goto("/");
  const pseudo = `Visiteur_${unique()}`;
  const cookie = await apiCall(null, "POST", "/auth/sign-up/email", {
    email: `${pseudo.toLowerCase()}@e2e.orasso.test`,
    password: SEED_PASSWORD,
    name: pseudo,
    termsAccepted: true,
    mainProfile: "visitor",
    departments: ["66"],
    firstName: "Recette",
    lastName: "E2E",
  });
  expect(cookie.status).toBe(200);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await page.getByRole("tab", { name: "Passeport", exact: true }).click();
  await expect(page).toHaveURL(/passeport/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Passeport", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Ton premier tampon t'attend", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Pas encore de tampon. Le premier tombe à ton premier pointage.")).toBeVisible();
  await shot(page, "passeport-vide-beton");
  await ctx.close();
});

test("le tampon tombe au pointage : sur le passeport, puis sur l'écran jour J", async ({ browser }) => {
  test.setTimeout(900_000);
  const damien = await login("damien@orasso.local");
  const s = unique();
  for (const theme of THEMES) {
    const event = await createEvent(damien, { title: `Tampon ${theme} ${s}` });
    const kenji = await kenjiAt(event.id, damien);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");

    // 1. Sur le passeport : le tampon tombe en plein écran, puis rejoint sa page.
    await openPassportFromProfile(page);
    await expect(page.getByTestId("passport-book")).toBeVisible({ timeout: 30_000 });
    const before = await page.locator('[data-testid^="stamp-"]').count();
    await page.waitForTimeout(1500);
    await checkIn(damien, event.id, kenji.applicationId);
    const drop = page.getByTestId("stamp-arrival");
    await expect(drop).toBeVisible({ timeout: 30_000 });
    await expect(drop).toContainText("Nouveau tampon");
    await expect(drop).toContainText(event.title);
    await page.waitForTimeout(700);
    await shot(page, `tampon-tombe-${theme}`);
    await checkRules(page, theme, `chute du tampon ${theme}`);
    await expect(drop).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => page.locator('[data-testid^="stamp-"]').count(), { timeout: 30_000 }).toBe(before + 1);
    await shot(page, `tampon-pose-${theme}`);

    // L'écran jour J dans un contexte à neuf (le passeport garde son canal ouvert ; une page qui a reçu le tampon et
    // la suivante dans le même contexte se sont figées, une fois, sous la charge de la machine).
    await ctx.close();
    const { ctx: ctxJ, page: jourJ } = await open(browser, theme);
    await signIn(jourJ, "kenji@orasso.local");
    const second = await createEvent(damien, { title: `Tampon J ${theme} ${s}` });
    const again = await kenjiAt(second.id, damien);
    await goto(jourJ, `/jour-j/${again.applicationId}`);
    await expect(jourJ.getByTestId("qr-countdown").or(jourJ.getByText("Ton QR est prêt"))).toBeVisible({
      timeout: 60_000,
    });
    await jourJ.waitForTimeout(1500);
    await checkIn(damien, second.id, again.applicationId);
    await expect(jourJ.getByTestId("stamp-arrival")).toBeVisible({ timeout: 30_000 });
    await shot(jourJ, `tampon-tombe-jour-j-${theme}`);
    await expect(jourJ.getByTestId("stamp-arrival")).toHaveCount(0, { timeout: 15_000 });
    // Pointé (l'écran relit son kit au chargement) : le bouton du prix du public, en secondaire (le QR reste l'élément principal du jour J).
    await ctxJ.close();
    const { ctx: ctxR, page: reloaded } = await open(browser, theme);
    await signIn(reloaded, "kenji@orasso.local");
    await goto(reloaded, `/jour-j/${again.applicationId}`);
    await expect(reloaded.getByTestId("jourj-vote")).toBeVisible({ timeout: 30_000 });
    await shot(reloaded, `jour-j-vote-${theme}`);
    await checkRules(reloaded, theme, `jour J avec le bouton de vote ${theme}`);
    await ctxR.close();
  }
});

test("prix du public : vote ouvert, classement en direct, vote clos, résultats ; récap projeté puis acquis", async ({
  browser,
}) => {
  test.setTimeout(1_500_000);
  const damien = await login("damien@orasso.local");
  const s = unique();
  const event = await createEvent(damien, { title: `Nocturne vote ${s}` });
  const kenji = await kenjiAt(event.id, damien);
  const p1 = await pilotAt(event.id, damien, `Alpha_${s}`);
  const p2 = await pilotAt(event.id, damien, `Bravo_${s}`);
  const p3 = await pilotAt(event.id, damien, `Charlie_${s}`);
  const outsider = await signUpApi(`Dehors_${s}`);
  for (const p of [kenji, p1, p2, p3]) await checkIn(damien, event.id, p.applicationId);
  const board = async () =>
    (
      await apiCall<{ total: number; entries: { applicationId: string; votes: number }[] }>(
        kenji.cookie,
        "GET",
        `/events/${event.id}/audience-prize`,
      )
    ).data;
  expect((await board()).entries.length).toBe(4);

  for (const [round, theme] of THEMES.entries()) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    // Entrée par l'onglet Passeport (« Prix du public » : le vote en cours pour un véhicule pointé).
    await goto(page, "/mon-passeport");
    const link = page.getByTestId("passport-vote").filter({ hasText: event.title });
    await expect(link).toBeVisible({ timeout: 60_000 });
    await shot(page, `passeport-prix-du-public-${theme}`);
    await checkRules(page, theme, `passeport avec le vote ${theme}`);
    await link.click();
    await expect(page).toHaveURL(/vote\//, { timeout: 30_000 });
    // Entrée par le jour J de Kenji (le bouton du prix du public), puis l'écran.
    await goto(page, `/jour-j/${kenji.applicationId}`);
    await expect(page.getByTestId("jourj-vote")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("jourj-vote").click();
    await expect(page).toHaveURL(/vote\//, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Prix du public", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Une voix, une seule", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Pointage à \d+ h/)).toBeVisible();
    await expect(page.getByText("Pas pour toi-même. Le gagnant reçoit le badge et 50 points.")).toBeVisible();
    // Quatre voitures : la mienne grisée « C'est toi », trois à choisir.
    await expect(page.getByTestId("vote-card")).toHaveCount(3, { timeout: 30_000 });
    await expect(page.getByTestId("vote-card-own")).toContainText("C'est toi");
    await shot(page, `vote-ouvert-${theme}`);
    await checkRules(page, theme, `vote ouvert ${theme}`);

    // Un vote, puis on change d'avis : une seule voix de Kenji dans le classement.
    await page.getByTestId("vote-card").filter({ hasText: p2.pseudo }).click();
    await expect(page.getByTestId("vote-saved")).toContainText("Vote enregistré · tu peux le changer jusqu'à");
    await page.getByTestId("vote-card").filter({ hasText: p1.pseudo }).click();
    await expect.poll(async () => (await board()).total, { timeout: 30_000 }).toBe(round === 0 ? 1 : 3);
    // Le classement bouge en direct : deux voix de plus par l'API, sans recharger.
    await apiCall(p2.cookie, "PUT", `/events/${event.id}/audience-prize/vote`, { applicationId: p1.applicationId });
    await apiCall(p3.cookie, "PUT", `/events/${event.id}/audience-prize/vote`, { applicationId: p1.applicationId });
    await expect(page.getByTestId("vote-live")).toHaveText("En direct · 3 votes", { timeout: 30_000 });
    await expect(page.getByTestId("vote-board-row").first()).toContainText(p1.pseudo);
    await page.getByTestId("vote-board").scrollIntoViewIfNeeded();
    await shot(page, `vote-classement-${theme}`);
    await checkRules(page, theme, `vote classement ${theme}`);
    // Pas pour soi-même : refusé par l'API.
    const own = await apiCall(kenji.cookie, "PUT", `/events/${event.id}/audience-prize/vote`, {
      applicationId: kenji.applicationId,
    });
    expect(own.status).toBe(400);
    await ctx.close();

    if (theme === "beton") {
      // Pas pointé : le texte de la règle, sans grille.
      const { ctx: c2, page: p } = await open(browser, "beton");
      await signIn(p, `dehors_${s}@e2e.orasso.test`);
      await goto(p, `/vote/${event.id}?titre=${encodeURIComponent(event.title)}`);
      await expect(p.getByText("Votent les personnes pointées, les billets scannés et le staff présent.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(p.getByTestId("vote-card")).toHaveCount(0);
      await shot(p, "vote-pas-pointe-beton");
      await c2.close();
    }
    // Les votes de la boucle suivante repartent de ceux de Kenji : on lui remet sa voix sur Alpha (inchangée).
  }
  expect(outsider).toBeTruthy();

  // L'événement est fini, pas encore réglé : vote clos, récap projeté (points prévus).
  await sql(
    `update events set starts_at = now() - interval '7 hours', ends_at = now() - interval '2 hours' where id = $1`,
    [event.id],
  );
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await goto(page, `/vote/${event.id}?titre=${encodeURIComponent(event.title)}`);
    await expect(page.getByText("Le vote est clos : le résultat arrive deux jours après l'événement.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("vote-card")).toHaveCount(0);
    await expect(page.getByTestId("vote-board")).toBeVisible();
    await shot(page, `vote-clos-${theme}`);
    await checkRules(page, theme, `vote clos ${theme}`);

    await goto(page, `/recap/${event.id}`);
    await expect(page.getByRole("heading", { name: "Récap", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`Ta sortie : ${event.title}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("recap-vehicles")).toContainText("4");
    await expect(page.getByTestId("recap-evening")).toBeVisible();
    await expect(page.getByTestId("recap-points")).toContainText("Points prévus : acquis au règlement");
    await expect(page.getByTestId("recap-stamp-line")).toContainText("Nouveau tampon");
    await expect(page.getByTestId("recap-review-line")).toContainText("Ton avis compte jusqu'à");
    await expect(page.getByTestId("recap-share")).toContainText("Partager");
    await expect(page.getByTestId("recap-review")).toContainText("Donner mon avis");
    await shot(page, `recap-projete-${theme}`);
    await checkRules(page, theme, `récap projeté ${theme}`);
    await ctx.close();
  }

  // J+2 : le règlement. Le même écran affiche les points acquis, et le prix du public est décerné à Alpha.
  simulateSettle(event.slug);
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await goto(page, `/recap/${event.id}`);
    await expect(page.getByTestId("recap-points")).toContainText("Points acquis.", { timeout: 30_000 });
    await shot(page, `recap-acquis-${theme}`);
    await goto(page, `/vote/${event.id}?titre=${encodeURIComponent(event.title)}`);
    await expect(page.getByText("Résultats", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Gagnant", { exact: true })).toBeVisible();
    await shot(page, `vote-resultats-${theme}`);
    await checkRules(page, theme, `vote résultats ${theme}`);
    await ctx.close();
  }
  // Le gagnant voit le badge « Prix du public » sur la carte de son véhicule, au garage.
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, `alpha_${s}@e2e.orasso.test`);
  await goto(page, "/garage");
  await expect(page.getByTestId("garage-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Prix du public", { exact: true }).first()).toBeVisible();
  await shot(page, "garage-badge-prix-du-public-beton");
  await ctx.close();
});

test("récap de Béziers Night (seed) : par les Sorties, points acquis, tampon dessiné (deux thèmes)", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    // Les récaps prêts, dans l'onglet Passeport.
    await goto(page, "/mon-passeport");
    await expect(page.getByTestId("passport-recap").filter({ hasText: "Béziers Night" })).toBeVisible({
      timeout: 60_000,
    });
    await shot(page, `passeport-recaps-${theme}`);
    await goto(page, "/sorties");
    await expect(page).toHaveURL(/sorties/, { timeout: 30_000 });
    await page.getByText(/^Passées · \d+$/).click();
    const row = page.getByTestId("ticket-past").filter({ hasText: "Béziers Night" });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText("Prix du public : 4e sur 71");
    await row.getByTestId("ticket-recap").click();
    await expect(page).toHaveURL(/recap\//, { timeout: 30_000 });
    await expect(page.getByText("Ta sortie : Béziers Night")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("recap-vehicles")).toContainText("71");
    await expect(page.getByTestId("recap-rank")).toContainText("4e");
    await expect(page.getByTestId("recap-rank")).toContainText("sur 71");
    await expect(page.getByTestId("recap-stamp")).toBeVisible();
    await expect(page.getByTestId("recap-points")).toContainText("Points acquis.");
    await shot(page, `recap-beziers-${theme}`);
    await checkRules(page, theme, `récap Béziers ${theme}`);
    // Prix du public figé : « Résultats », Kenji 4e.
    const eventId = (await sql<{ id: string }>("select id from events where slug = 'beziers-night-2026'"))[0]?.id;
    await goto(page, `/vote/${eventId}?titre=B%C3%A9ziers%20Night`);
    await expect(page.getByText("Résultats", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vote-my-rank")).toContainText("4e sur 71");
    await shot(page, `vote-resultats-beziers-${theme}`);
    await ctx.close();
  }
});

test("carte à partager : trois styles, zones masquées par Instagram, les trois PNG de la story", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await goto(page, "/garage");
    await expect(page.getByTestId("garage-card").first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("garage-share").first().click();
    await expect(page.getByText("Carte à partager", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Format story, signée Orasso/)).toBeVisible();
    for (const [label, file] of [
      ["Nuit", "nuit"],
      ["Sable", "sable"],
      ["Néon", "neon"],
    ] as const) {
      await page.getByText(label, { exact: true }).click();
      const img = page.getByTestId("share-preview").locator("img");
      await expect(img).toBeVisible({ timeout: 60_000 });
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalHeight), { timeout: 60_000 }).toBe(1920);
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1080);
      await shot(page, `partage-${file}-${theme}`);
    }
    // Les zones masquées : deux bandes (haut 14 %, bas 20 %), étiquetées.
    await page.getByTestId("share-safe-toggle").click();
    await expect(page.getByTestId("share-safe").getByText("Masqué par Instagram")).toHaveCount(2);
    await expect(page.getByText("Cacher les zones masquées")).toBeVisible();
    await shot(page, `partage-zones-${theme}`);
    await expect(page.getByTestId("share-story")).toContainText("En story");
    await checkRules(page, theme, `feuille de partage ${theme}`);
    await expect(page.getByTestId("share-post")).toContainText("Image");
    await ctx.close();
  }
  // Les trois PNG de la story, pleine taille (rendus par l'API pour le véhicule de Kenji).
  const kenji = await login("kenji@orasso.local");
  const vehicles = await apiCall<{ id: string; status: string }[]>(kenji, "GET", "/me/vehicles");
  const vehicle = vehicles.data.find((v) => v.status === "active");
  for (const [style, file] of [
    ["night", "nuit"],
    ["sand", "sable"],
    ["neon", "neon"],
  ] as const) {
    const res = await fetch(`${API}/api/me/vehicles/${vehicle?.id}/share-image?format=story&style=${style}`, {
      headers: { cookie: kenji },
    });
    expect(res.status).toBe(200);
    writeFileSync(`${DIR}/story-${file}.png`, Buffer.from(await res.arrayBuffer()));
  }
});

test.afterAll(() => {
  // Erreurs de console : informatif (le point « cannot create file » vient de la recette web des lots précédents).
  const real = consoleErrors.filter((e) => !/cannot create file|favicon|404|Failed to load resource/i.test(e));
  expect(real.slice(0, 5)).toEqual([]);
});
