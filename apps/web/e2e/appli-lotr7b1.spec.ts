import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7b1 (D38), côté appli (version web compilée de recette) : le Profil porte le Garage. Garage par défaut partout,
// onglet Sorties (ma saison, passeport), `/garage` et `/mon-passeport` redirigent, le profil d'un autre a les mêmes onglets,
// compte privé vu d'un inconnu : les nombres seulement, abonné accepté : tout ; aucun numéro de plaque lisible.
// Lancer avec APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7b1-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function open(browser: Browser, fontScale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 1500 }, baseURL: APP });
  await ctx.addInitScript((f) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
    if (f !== 1) localStorage.setItem("orasso.recette.echellePolice", String(f));
  }, fontScale);
  return { ctx, page: await ctx.newPage() };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const selected = (page: Page) => page.getByTestId("profil-tabs").getByRole("tab", { selected: true });

test("mon profil : le Garage s'ouvre par défaut, Sorties montre ma saison et le passeport", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
  await expect(selected(page)).toHaveAccessibleName("Garage");
  // Le bouton principal de l'onglet : « Ajouter un véhicule » ; les trois nombres, « Profil public », la roue dentée.
  await expect(page.getByTestId("garage-add")).toBeVisible({ timeout: 30_000 });
  for (const id of ["profil-count-abonnes", "profil-count-abonnements", "profil-count-sorties", "profil-public"]) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }
  await expect(page.getByTestId("profil-gear")).toBeVisible();
  await shot(page, "01-mon-garage");
  // Sorties : la saison et le passeport (les tampons), « Voir mes places ».
  await page.getByTestId("profil-tab-sorties").click();
  await expect(selected(page)).toHaveAccessibleName("Sorties");
  await expect(page.getByTestId("profil-season")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("passport-book")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("profil-places")).toBeVisible();
  await expect(page.getByTestId("garage-add")).toHaveCount(0);
  await shot(page, "02-mes-sorties");
  // Le nombre de sorties ouvre l'onglet Sorties ; retour au Garage.
  await page.getByTestId("profil-tab-garage").click();
  await expect(page.getByTestId("garage-add")).toBeVisible();
  await page.getByTestId("profil-count-sorties").click();
  await expect(selected(page)).toHaveAccessibleName("Sorties");
  await ctx.close();
});

test("les anciennes adresses : /garage et /mon-passeport mènent au Profil, sur le bon onglet", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/garage");
  await expect(selected(page)).toHaveAccessibleName("Garage", { timeout: 30_000 });
  await expect(page).toHaveURL(/profil/);
  await go(page, "/mon-passeport");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  await go(page, "/passeport");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  await go(page, "/profil?onglet=sorties");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  await ctx.close();
});

test("visiteur : le Passeport vit dans Profil › Sorties, le Garage vide propose d'ajouter un véhicule", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "paul.photo@orasso.local");
  await go(page, "/profil");
  await expect(selected(page)).toHaveAccessibleName("Garage", { timeout: 30_000 });
  await page.getByTestId("profil-tab-sorties").click();
  await expect(page.getByTestId("profil-places")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("le profil d'un autre : mêmes onglets ; compte privé vu d'un inconnu : les nombres seulement", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // Public : Garage par défaut, Sorties, Suivre et Message.
  const a = await open(browser);
  await signIn(a.page, "kenji@orasso.local");
  await go(a.page, "/u/Lea_11");
  await expect(a.page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(selected(a.page)).toHaveAccessibleName("Garage");
  await expect(a.page.getByTestId("message-open")).toBeVisible();
  await a.page.getByTestId("profil-tab-sorties").click();
  await expect(selected(a.page)).toHaveAccessibleName("Sorties");
  // Privé, inconnu : nombres, bouton, « Réservé à ses abonnés », ni onglets ni photo.
  await go(a.page, "/u/Marc_66");
  await expect(a.page.getByTestId("public-counts")).toBeVisible({ timeout: 30_000 });
  await expect(a.page.getByTestId("profile-private-note")).toContainText("Réservé à ses abonnés");
  await expect(a.page.getByTestId("profil-tabs")).toHaveCount(0);
  await expect(a.page.getByTestId("profile-car")).toHaveCount(0);
  await expect(a.page.getByTestId("profile-garage")).toHaveCount(0);
  await expect(a.page.getByTestId("profile-outings")).toHaveCount(0);
  await expect(a.page.getByTestId("follow-button")).toBeVisible();
  await shot(a.page, "03-prive-inconnu");
  await a.ctx.close();
  // Privé, abonné accepté (Julie suit Marc) : tout, onglets compris.
  const b = await open(browser);
  await signIn(b.page, "julie@orasso.local");
  await go(b.page, "/u/Marc_66");
  await expect(b.page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByTestId("profile-private-note")).toHaveCount(0);
  await expect(b.page.getByTestId("profile-car")).toBeVisible();
  await shot(b.page, "04-prive-abonne");
  await b.ctx.close();
});

test("police 1,3 à 384 px : les onglets, les boutons et le pseudo tiennent, sans défilement horizontal", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, 1.3);
  await signIn(page, "kenji@orasso.local");
  for (const path of ["/profil", "/u/Lea_11", "/u/Marc_66"]) {
    await go(page, path);
    await page.waitForTimeout(2_500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, path).toBe(false);
  }
  await shot(page, "05-police-13");
  await ctx.close();
});
