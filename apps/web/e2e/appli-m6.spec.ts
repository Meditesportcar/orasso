import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot M6, côté appli (version web de recette) : « Ton coin » (France remplie, liste en feuille : recherche, ✕ qui
// n'applique rien, « Valider (n) », favori puis « +n »), « Tes préférences » (première fois après le premier véhicule :
// enregistrées sur le compte, Explorer ensuite ; entrée de Profil › Préférences), affiche à partager (story et post,
// zones masquées en story seulement, zones à flouter acceptées ou refusées par l'API), bandeau d'annonce unique
// (« Retenue ! » moutarde, liste d'attente en sobre, toucher = Sorties où le ticket pulse, disparition après ~4 s),
// signalement d'un événement (motifs propres, « Autre » exige le texte, envoi). Captures : `appli-m6-paires.spec.ts`.
// Lancer avec APP_URL (relais de Metro), l'API lancée sur la base seedée.
const APP = process.env.APP_URL;
const API = `http://localhost:${process.env.API_PORT}`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function open(page: Page, onboarded = true) {
  await page.setViewportSize(MOBILE);
  await page.goto(`${APP}/auth`);
  await page.evaluate((o) => {
    localStorage.clear();
    if (o) localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  }, onboarded);
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function go(page: Page, path: string) {
  await page.goto(`${APP}${path}`);
  await afterOpening(page);
}

async function signIn(page: Page, email: string) {
  await go(page, "/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

async function clean(page: Page) {
  const a = await auditPage(page);
  expect(a.greens, "pas de vert").toEqual([]);
  expect(a.horizontalScroll, "pas de défilement horizontal").toBe(false);
  expect(a.buttonsWithoutIcon, "tout bouton porte une icône").toEqual([]);
  expect(a.primaryButtons, "un seul bouton principal").toBeLessThanOrEqual(1);
}

test("Ton coin : la liste en feuille, ✕ n'applique rien, « Valider (n) », le favori puis « +n »", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, false);
  await page.goto(`${APP}/arrivee`);
  await page.getByRole("button", { name: "Commencer" }).click({ timeout: 30_000 });
  await page.getByTestId("profile-exhibitor").click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForURL(/arrivee\/departement/);
  await page.getByTestId("dept-66").click();
  await page.getByTestId("dept-11").click();
  await expect(page.getByText("Pyrénées-Orientales · favori")).toBeVisible();
  await expect(page.getByText("+1", { exact: true })).toBeVisible();
  await clean(page);

  // La feuille : recherche par nom (sans accents) ou numéro, compteur, choisis en tête.
  await page.getByTestId("department-list-toggle").click();
  const sheet = page.getByTestId("department-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Tes départements")).toBeVisible();
  await expect(page.getByTestId("department-count")).toHaveText("2 choisis");
  await page.getByTestId("department-search").fill("herault");
  await page.getByTestId("deptrow-34").click();
  await expect(page.getByTestId("department-count")).toHaveText("3 choisis");
  // ✕ : rien ne change.
  await page.getByTestId("department-sheet-cancel").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("+1", { exact: true })).toBeVisible();
  // Valider applique.
  await page.getByTestId("department-more").click();
  await page.getByTestId("department-search").fill("34");
  await page.getByTestId("deptrow-34").click();
  await expect(page.getByTestId("department-validate")).toContainText("Valider (3)");
  await page.getByTestId("department-validate").click();
  await expect(page.getByText("+2", { exact: true })).toBeVisible();
  await expect(page.getByText("Pyrénées-Orientales · favori")).toBeVisible();
});

test("Tes préférences : première fois après le premier véhicule, rangées sur le compte, rouvertes depuis Profil", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const email = `prefs_${s}@e2e.orasso.test`;
  const cookie = await signUpApi(`Prefs_${s}`.slice(0, 24), email);
  await addVehicleApi(cookie, randomPlate());
  const before = await apiCall<{ seenAt: string | null }>(cookie, "GET", "/me/preferences");
  expect(before.data.seenAt).toBeNull();

  await open(page);
  await signIn(page, email);
  await go(page, "/preferences?premiere=1");
  await expect(page.getByText("Ce que tu aimes").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Dernière étape · 30 secondes")).toBeVisible();
  await page.getByRole("button", { name: "Rassemblement" }).click();
  await page.getByRole("button", { name: "Nocturne" }).click();
  await page.getByTestId("pref-everywhere").click();
  await page.getByTestId("pref-notify-newEvents").click();
  await clean(page);
  await page.getByTestId("preferences-submit").click();
  await page.waitForURL(/explorer/, { timeout: 30_000 });

  const after = await apiCall<{
    eventFormats: string[];
    seenAt: string | null;
    radiusKm: number | null;
    newEvents: boolean;
  }>(cookie, "GET", "/me/preferences");
  expect(after.data.eventFormats.sort()).toEqual(["gathering", "night"]);
  expect(after.data.seenAt).not.toBeNull();
  // « Partout en France » = pas de limite de distance ; l'interrupteur unique est coupé.
  expect(after.data.radiusKm).toBeNull();
  expect(after.data.newEvents).toBe(false);

  // Ensuite : Profil › Apparence › « Tes préférences » (mode modification).
  await go(page, "/reglages/preferences");
  await page.getByTestId("reglage-tes-preferences").click();
  await page.waitForURL(/\/preferences$/);
  await expect(page.getByTestId("preferences-submit")).toContainText(/Enregistrer/i);
});

test("affiche à partager : story et post, zones masquées en story, zones à flouter contrôlées par l'API", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const kenji = await login("kenji@orasso.local");
  const vehicles = await apiCall<{ id: string; status: string }[]>(kenji, "GET", "/me/vehicles");
  const vehicle = vehicles.data.find((v) => v.status === "active");
  await open(page);
  await signIn(page, "kenji@orasso.local");
  await go(page, `/vehicule/${vehicle?.id}/partager`);
  await expect(page.getByText("Affiche à partager", { exact: true })).toBeVisible({ timeout: 30_000 });
  const img = page.getByTestId("share-preview").locator("img");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalHeight), { timeout: 60_000 }).toBe(1920);
  await expect(page.getByTestId("share-safe-toggle")).toBeVisible();
  await expect(page.getByTestId("share-plate-check")).toBeVisible();
  await expect(page.getByTestId("share-story")).toContainText("En story");
  await clean(page);
  await page.getByText("Post 4:5", { exact: true }).click();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalHeight), { timeout: 60_000 }).toBe(1350);
  await expect(page.getByTestId("share-safe-toggle")).toHaveCount(0);
  await expect(page.getByTestId("share-story")).toContainText("En post");
  // Le mot « carte » a disparu de l'écran.
  expect(await page.locator("body").innerText()).not.toMatch(/\bcarte\b/i);

  const ok = await fetch(
    `${API}/api/me/vehicles/${vehicle?.id}/share-image?format=post&style=sand&masks=${encodeURIComponent("0.1,0.2,0.3,0.05")}`,
    { headers: { cookie: kenji } },
  );
  expect(ok.status).toBe(200);
  const bad = await fetch(`${API}/api/me/vehicles/${vehicle?.id}/share-image?format=story&masks=nimporte`, {
    headers: { cookie: kenji },
  });
  expect(bad.status).toBe(400);
});

test("bandeau d'annonce : « Retenue ! » moutarde puis liste d'attente sobre ; toucher ouvre Sorties", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const s = unique();
  const email = `bandeau_${s}@e2e.orasso.test`;
  const cookie = await signUpApi(`Band_${s}`.slice(0, 24), email);
  const vehicleId = await addVehicleApi(cookie, randomPlate());
  const first = await createEvent(damien, { title: `Bandeau un ${s}` });
  const second = await createEvent(damien, { title: `Bandeau deux ${s}` });
  const a1 = await applyApi(cookie, first.id, vehicleId);
  const a2 = await applyApi(cookie, second.id, vehicleId);
  await open(page);
  await signIn(page, email);
  await go(page, "/sorties");
  await expect(page.getByText(new RegExp(first.title, "i")).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  // Retenue : la décision arrive en direct (canal temps réel), le bandeau moutarde s'affiche, pas de feuille.
  await decideApi(damien, first.id, a1, "accept");
  const good = page.getByTestId("announce-good");
  await expect(good).toBeVisible({ timeout: 30_000 });
  await expect(good).toContainText("Retenue !");
  await expect(good).toContainText(first.title);
  await expect(page.getByText("Voir ma carte d'accès")).toHaveCount(0);
  await expect(page.getByTestId(`ticket-pulse-${a1}`)).toBeAttached();
  // Une image du pouls du ticket, pendant le battement (relecture Opus, point 14).
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${RELAIS}/lot-m6-captures/apres/22-pouls-ticket-beton.png` });
  // Il s'en va tout seul (~4 s).
  await expect(good).toHaveCount(0, { timeout: 10_000 });

  // Liste d'attente : une information, bandeau sobre ; le toucher ouvre Sorties.
  await go(page, "/explorer");
  await decideApi(damien, second.id, a2, "waitlist");
  const info = page.getByTestId("announce-info");
  await expect(info).toBeVisible({ timeout: 30_000 });
  await info.click();
  await page.waitForURL(/sorties/, { timeout: 30_000 });
});

test("signaler un événement : les motifs d'un événement, « Autre » exige le texte, envoi", async ({ page }) => {
  test.setTimeout(240_000);
  const s = unique();
  const email = `sig_${s}@e2e.orasso.test`;
  await signUpApi(`Sig_${s}`.slice(0, 24), email);
  await open(page);
  await signIn(page, email);
  await go(page, "/e/nocturne-de-canet-2026");
  const link = page.getByTestId("report-open-event");
  await link.scrollIntoViewIfNeeded({ timeout: 60_000 });
  await link.click();
  await expect(page.getByText("Signaler cet événement")).toBeVisible();
  for (const label of [
    "Faux événement ou arnaque",
    "Lieu non autorisé",
    "Billetterie ou prix abusifs",
    "Doublon ou spam",
  ])
    await expect(page.getByTestId(/report-reason-/).filter({ hasText: label })).toHaveCount(1);
  // Pas de motif de personne pour un événement.
  await expect(page.getByTestId("report-reason-fake_profile")).toHaveCount(0);
  await expect(page.getByText("Danger immédiat ? Appelle le 17.")).toBeVisible();
  await page.getByTestId("report-reason-other").click();
  await expect(page.getByText("Ce qui s'est passé (obligatoire)", { exact: true })).toBeVisible();
  await page.getByTestId("report-send").click();
  await expect(page.getByText("Précise le motif « Autre » en quelques mots.")).toBeVisible();
  await page.getByTestId("report-reason-unauthorized_place").click();
  await page.getByTestId("report-send").click();
  await expect(page.getByTestId("report-done")).toBeVisible({ timeout: 30_000 });
});

test("tour 2 : une plaque détectée sur l'affiche se masque (rendu relancé), partager attend la vérification", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const kenji = await login("kenji@orasso.local");
  const vehicles = await apiCall<{ id: string; status: string }[]>(kenji, "GET", "/me/vehicles");
  const vehicle = vehicles.data.find((v) => v.status === "active");
  // Détection simulée (recette web seulement) : une plaque lisible sur l'affiche composée.
  await page.addInitScript(() => {
    (window as unknown as { __orassoFakePlates: unknown }).__orassoFakePlates = [{ x: 0.1, y: 0.55, w: 0.3, h: 0.06 }];
  });
  const masked: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/share-image") && r.url().includes("masks=")) masked.push(r.url());
  });
  await open(page);
  await signIn(page, "kenji@orasso.local");
  await go(page, `/vehicule/${vehicle?.id}/partager`);
  await expect(page.getByTestId("share-plate-check")).toContainText("Une plaque semble lisible", { timeout: 60_000 });
  // Le partage normal est retiré ; « La masquer » est le bouton principal, « Partager quand même » est secondaire.
  await expect(page.getByTestId("share-story")).toBeHidden();
  await expect(page.getByTestId("share-anyway")).toBeVisible();
  await clean(page);
  await page.getByTestId("share-plate-mask").click();
  await expect(page.getByTestId("share-plate-check")).toContainText("Plaque masquée sur l'affiche.", {
    timeout: 60_000,
  });
  expect(masked.length, "l'affiche est redemandée avec les zones à flouter").toBeGreaterThan(0);
  await expect(page.getByTestId("share-story")).toBeEnabled();
});

test("tour 2 : les annonces en attente d'un compte ne s'affichent jamais devant le compte suivant", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const s = unique();
  const emailA = `purgea_${s}@e2e.orasso.test`;
  const emailB = `purgeb_${s}@e2e.orasso.test`;
  const cookieA = await signUpApi(`PurgeA_${s}`.slice(0, 24), emailA);
  await signUpApi(`PurgeB_${s}`.slice(0, 24), emailB);
  const vehicleId = await addVehicleApi(cookieA, randomPlate());
  const events = await Promise.all([1, 2, 3].map((n) => createEvent(damien, { title: `Purge ${n} ${s}` })));
  const apps = await Promise.all(events.map((e) => applyApi(cookieA, e.id, vehicleId)));
  await open(page);
  await signIn(page, emailA);
  await go(page, "/sorties");
  await expect(page.getByText(new RegExp(events[0]?.title ?? "", "i")).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  // Trois décisions d'affilée : une annonce s'affiche, les autres attendent leur tour.
  for (const [i, e] of events.entries()) await decideApi(damien, e.id, apps[i] ?? "", i === 0 ? "accept" : "waitlist");
  await expect(page.getByTestId(/announce-/).first()).toBeVisible({ timeout: 30_000 });
  // A se déconnecte depuis Mon profil (sans recharger la page : la file vivrait encore si rien ne la purgeait).
  await page.getByRole("tab", { name: "Profil" }).click();
  await page.getByTestId("profil-sign-out").click();
  await page.waitForURL(/\/auth/, { timeout: 30_000 });
  await page.getByLabel("E-mail").fill(emailB);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
  // Pendant 8 s (deux tours de bandeau), rien du compte A.
  for (let t = 0; t < 8; t++) {
    await expect(page.getByTestId(/announce-/)).toHaveCount(0);
    await page.waitForTimeout(1000);
  }
});
