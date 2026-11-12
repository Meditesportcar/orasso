import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, login, randomPlate, SEED_PASSWORD, seeStepEnd, signUpApi, unique } from "./helpers";
import { checkerPhoto } from "./helpers/lot51";
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

test("mon profil : Publications s'ouvre par défaut (R8b2), Garage, puis Sorties montre ma saison et le passeport", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
  // Lot R8b2 : le profil s'ouvre sur « Publications » ; le Garage est un clic plus loin.
  await expect(selected(page)).toHaveAccessibleName(/^Publications/);
  await page.getByTestId("profil-tab-garage").click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/);
  // Le bouton principal de l'onglet : « Ajouter un véhicule » ; les trois nombres, « Profil public », la roue dentée.
  await expect(page.getByTestId("garage-add")).toBeVisible({ timeout: 30_000 });
  for (const id of ["profil-count-abonnes", "profil-count-abonnements", "profil-count-sorties"]) {
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
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await expect(page).toHaveURL(/profil/);
  await go(page, "/mon-passeport");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  await go(page, "/passeport");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  await go(page, "/profil?onglet=sorties");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  await ctx.close();
});

test("visiteur : le Passeport vit dans Profil › Sorties, sans onglet Garage (lot R8b2 : le profil s'ouvre sur Publications)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "paul.photo@orasso.local");
  await go(page, "/profil");
  await expect(selected(page)).toHaveAccessibleName("Publications", { timeout: 30_000 });
  await expect(page.getByTestId("profil-tab-garage")).toHaveCount(0);
  await page.getByTestId("profil-tab-sorties").click();
  await expect(selected(page)).toHaveAccessibleName("Sorties");
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
  await expect(selected(a.page)).toHaveAccessibleName(/^Garage/);
  await expect(a.page.getByTestId("message-open")).toBeVisible();
  await a.page.getByTestId("profil-tab-sorties").click();
  await expect(selected(a.page)).toHaveAccessibleName("Sorties");
  // Privé, inconnu : nombres, bouton, « Réservé à ses abonnés », ni onglets ni photo.
  await go(a.page, "/u/Marc_66");
  await expect(a.page.getByTestId("public-counts")).toBeVisible({ timeout: 30_000 });
  await expect(a.page.getByTestId("publications-private")).toContainText("Compte privé");
  // Depuis R8b2, la rangée ne garde que « Publications » pour un compte privé vu d'un inconnu (ni Garage ni Sorties).
  await expect(a.page.getByTestId("profil-tab-publications")).toBeVisible();
  await expect(a.page.getByTestId("profil-tab-garage")).toHaveCount(0);
  await expect(a.page.getByTestId("profil-tab-sorties")).toHaveCount(0);
  // Tour 2 (maquette R7.12) : plus de liste « Ses véhicules · marque et modèle » pour un inconnu.
  await expect(a.page.getByTestId("profile-vehicles-private")).toHaveCount(0);
  await expect(a.page.getByText("Ses véhicules", { exact: true })).toHaveCount(0);
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
  // Abonné accepté : l'onglet « Publications » n'a pas de panneau « Compte privé ».
  await b.page.getByTestId("profil-tab-publications").click();
  // L'onglet chargé (liste ou état vide) avant de constater l'absence du panneau « Compte privé ».
  await expect(b.page.getByTestId("publications-tab").or(b.page.getByTestId("publications-empty"))).toBeVisible({
    timeout: 30_000,
  });
  await expect(b.page.getByTestId("publications-private")).toHaveCount(0);
  // Le profil s'ouvre sur « Publications » (R8b2) : la voiture est dans l'onglet « Garage ».
  await b.page.getByTestId("profil-tab-garage").click();
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

// Tour 2, point 1 : à police 1,3, le pseudo rapetisse ; jamais de mot coupé (une seule ligne), pseudo court comme long.
test("police 1,3 à 384 px : le pseudo ne se coupe jamais (Mon profil), court comme long", async ({ browser }) => {
  test.setTimeout(300_000);
  const oneLine = async (page: Page) => {
    const m = await page.getByTestId("profil-pseudo").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { h: el.getBoundingClientRect().height, fs: Number.parseFloat(cs.fontSize), text: el.textContent ?? "" };
    });
    await shot(page, `pseudo-${m.text.length}`);
    expect(m.h, `${m.text} tient sur une ligne (${m.fs}px)`).toBeLessThan(m.fs * 1.6);
  };
  const a = await open(browser, 1.3);
  await signIn(a.page, "kenji@orasso.local");
  await go(a.page, "/profil");
  await expect(a.page.getByTestId("profil-pseudo")).toBeVisible({ timeout: 30_000 });
  await a.page.waitForTimeout(1_500);
  await oneLine(a.page);
  await shot(a.page, "06-pseudo-court-police-13");
  await a.ctx.close();
  const pseudo = `Visiteur_${unique()}`;
  await signUpApi(pseudo);
  const b = await open(browser, 1.3);
  await signIn(b.page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(b.page, "/profil");
  await expect(b.page.getByTestId("profil-pseudo")).toHaveText(pseudo, { timeout: 30_000 });
  await b.page.waitForTimeout(1_500);
  await oneLine(b.page);
  await shot(b.page, "07-pseudo-long-police-13");
  await b.ctx.close();
});

// Tour 2, point 5 : « ?onglet= » s'applique à chaque navigation, même avec la valeur déjà lue : Accueil → passeport
// (Sorties) → toucher Garage → retour à l'Accueil → passeport : Sorties de nouveau.
test("?onglet= rebascule à chaque navigation (passeport de l'Accueil → Sorties, deux fois)", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  for (let i = 0; i < 2; i++) {
    await expect(page.getByTestId("home-passport")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("home-passport").click();
    await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
    await page.getByTestId("profil-tab-garage").click();
    await expect(selected(page)).toHaveAccessibleName(/^Garage/);
    await page.getByRole("tab", { name: "Accueil" }).last().click();
  }
  await ctx.close();
});

// Tour 2, point 3 : casquette organisateur active, les anciennes adresses et les retours ouvrent Profil › Garage / Sorties
// de la casquette de base (passionné), sans seconde barre d'onglets empilée.
test("casquette organisateur active : /garage, /mon-passeport et le retour d'un véhicule mènent au Profil de la base", async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "damien@orasso.local");
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").first().click();
  await page.waitForURL(/direct/, { timeout: 30_000 });
  const bars = () => page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Accueil" }) });
  // /garage : on bascule sur le passionné, onglet Garage ; /mon-passeport : onglet Sorties.
  await go(page, "/garage");
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await expect(page.getByTestId("casquette-fan").getByTestId("casquette-active")).toBeVisible();
  await shot(page, "08-organisateur-garage");
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").first().click();
  await page.waitForURL(/direct/, { timeout: 30_000 });
  await go(page, "/mon-passeport");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  await expect(page.getByTestId("casquette-fan").getByTestId("casquette-active")).toBeVisible();
  // Retour d'une fiche véhicule (ouverte à froid, casquette organisateur) : directement au Profil › Garage.
  const cookie = await login("damien@orasso.local");
  const mine = await apiCall<{ id: string; status: string }[]>(cookie, "GET", "/me/vehicles");
  const vehicle = mine.data.find((v) => v.status === "active");
  expect(vehicle, "un véhicule actif pour Damien").toBeTruthy();
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").first().click();
  await page.waitForURL(/direct/, { timeout: 30_000 });
  await go(page, `/vehicule/${vehicle?.id}`);
  await page
    .getByRole("button", { name: /Fermer/ })
    .first()
    .click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await expect(bars()).toHaveCount(1);
  await ctx.close();
});

test("le profil d'un inconnu : « Message » ouvre la feuille à l'écran (jamais rognée) et la demande part", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const stranger = `Inconnu_${unique()}`;
  await signUpApi(stranger);
  for (const fontScale of [1, 1.3]) {
    const { ctx, page } = await open(browser, fontScale);
    await signIn(page, "kenji@orasso.local");
    await go(page, `/u/${stranger}`);
    await expect(page.getByTestId("profile-actions")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("message-open").click();
    // La feuille entière est à l'écran : titre, champ, bouton d'envoi.
    const title = page.getByText("Demande de contact", { exact: true }).first();
    await expect(title).toBeInViewport({ ratio: 1, timeout: 20_000 });
    await expect(page.getByText("Une seule demande est possible")).toBeInViewport({ ratio: 1 });
    await shot(page, `05-demande-contact-police-${fontScale}`);
    if (fontScale === 1) {
      // Lot R8b1 : l'icône « Message » du haut du profil porte le même nom accessible que le champ : on vise le champ de saisie.
      await page.getByRole("textbox", { name: "Message" }).fill("Bonjour, belle voiture !");
      await page.getByRole("button", { name: /Envoyer/ }).click();
      await expect(page.getByTestId("contact-sent")).toBeInViewport({ ratio: 1, timeout: 20_000 });
    }
    await ctx.close();
  }
});

// Tour 3, point 2 : une seule barre d'onglets, écrans cachés compris (`[role=tablist]` en CSS compte aussi ceux qui sont
// `display: none`), et le retour arrière ne ramène ni à l'assistant ni à la fiche supprimée.
const allBars = (page: Page) =>
  page.locator('[role="tablist"]').filter({ has: page.locator('[role="tab"]', { hasText: "Accueil" }) });

// L'assistant d'ajout, de la première étape à l'écran « Terminé » (Supra Mk5 avec photo et plaque au hasard).
async function runVehicleWizard(page: Page) {
  await page.waitForURL(/vehicule\/nouveau/, { timeout: 30_000 });
  const next = async () => {
    await seeStepEnd(page);
    await page.getByTestId("vehicle-step-next").click();
  };
  const row = (name: string) => page.getByRole("radio", { name, exact: false }).first();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("vehicle-photo-add").click();
  await (await chooser).setFiles({ name: "supra.png", mimeType: "image/png", buffer: checkerPhoto() });
  await page.getByTestId("crop-validate").click();
  await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
  await next();
  await page.getByTestId("vehicle-plate").fill(randomPlate().replace(/[IOUSW]/g, "A"));
  await next();
  await page.getByTestId("plate-frame-add").click();
  await next();
  await page.getByLabel("Marque ou modèle").fill("toyota");
  await row("Toyota").click();
  await row("Supra").click();
  await row("Mk5").click();
  await next();
  await page.getByTestId("vehicle-engine").fill("3.0 L6 turbo");
  await page.getByTestId("vehicle-year-2021").click();
  await page.getByTestId("vehicle-color-family-white").click();
  await page.getByTestId("vehicle-color-Blanc").click();
  await next();
  await page.getByRole("checkbox", { name: "Sportive", exact: true }).click();
  await next();
  await expect(page.getByTestId("vehicle-done-title")).toBeVisible({ timeout: 60_000 });
}

test("Garage › Ajouter un véhicule › Terminé : une seule barre d'onglets, le retour ne rouvre pas l'assistant", async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const pseudo = `Barre_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await addVehicleApi(cookie, randomPlate().replace(/[IOUSW]/g, "A"));
  const { ctx, page } = await open(browser);
  await signIn(page, email);
  await go(page, "/profil");
  // Lot R8b2 : le profil s'ouvre sur « Publications » ; le Garage est un clic plus loin.
  await expect(selected(page)).toHaveAccessibleName(/^Publications/, { timeout: 30_000 });
  await page.getByTestId("profil-tab-garage").click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await page.getByTestId("garage-add").click();
  await runVehicleWizard(page);
  await page.getByTestId("vehicle-done-garage").click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/vehicule\/nouveau/);
  await expect(allBars(page)).toHaveCount(1);
  await shot(page, "09-apres-ajout-garage");
  await page.goBack();
  await expect(page).not.toHaveURL(/vehicule\/nouveau/);
  await expect(page.getByTestId("vehicle-done-title")).toHaveCount(0);
  await expect(allBars(page)).toHaveCount(1);
  await ctx.close();
});

test("Garage › fiche du véhicule › Supprimer : une seule barre d'onglets, le retour ne rouvre pas la fiche", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const pseudo = `Suppr_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await addVehicleApi(cookie, randomPlate().replace(/[IOUSW]/g, "A"));
  await addVehicleApi(cookie, randomPlate().replace(/[IOUSW]/g, "A"));
  const { ctx, page } = await open(browser);
  await signIn(page, email);
  await go(page, "/profil");
  // Lot R8b2 : le profil s'ouvre sur « Publications » ; le Garage est un clic plus loin.
  await expect(selected(page)).toHaveAccessibleName(/^Publications/, { timeout: 30_000 });
  await page.getByTestId("profil-tab-garage").click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  // Depuis la carte du Garage (la fiche s'empile sur la barre), pas à froid.
  await page.getByTestId("garage-card").first().click();
  await page.waitForURL(/\/vehicule\//, { timeout: 30_000 });
  const gone = page.url().split("/vehicule/")[1]?.split(/[?#/]/)[0] ?? "";
  expect(gone).not.toBe("");
  await page.getByTestId("vehicle-menu").click({ timeout: 30_000 });
  await page.getByTestId("vehicle-delete").click();
  await page.getByTestId("orga-confirm").click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await expect(allBars(page)).toHaveCount(1);
  await page.goBack();
  await expect(page).not.toHaveURL(new RegExp(`vehicule/${gone}`));
  await expect(allBars(page)).toHaveCount(1);
  const left = await apiCall<{ id: string }[]>(cookie, "GET", "/me/vehicles");
  expect(left.data.map((v) => v.id)).not.toContain(gone);
  await ctx.close();
});

// Tour 4, point 2 : le même parcours depuis la casquette organisateur (la barre de l'organisateur n'a pas d'onglet Profil :
// l'assistant et la fiche s'ouvrent à froid, puis tout passe par les boutons de l'appli).
test("casquette organisateur : ajout puis « Retour au garage », suppression depuis la fiche, une seule barre d'onglets", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const cookie = await login("damien@orasso.local");
  const before = await apiCall<{ id: string }[]>(cookie, "GET", "/me/vehicles");
  const { ctx, page } = await open(browser);
  await signIn(page, "damien@orasso.local");
  const asOrganizer = async () => {
    await page.goto("/moi");
    await afterOpening(page);
    await page.getByTestId("casquette-organizer").first().click();
    await page.waitForURL(/direct/, { timeout: 30_000 });
  };

  // Ajout : « Retour au garage » ouvre Profil › Garage de la base, une seule barre, le retour ne rouvre pas l'assistant.
  await asOrganizer();
  await go(page, "/vehicule/nouveau");
  await runVehicleWizard(page);
  await page.getByTestId("vehicle-done-garage").click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/vehicule\/nouveau/);
  await expect(allBars(page)).toHaveCount(1);
  await shot(page, "10-organisateur-apres-ajout-garage");
  await page.goBack();
  await expect(page).not.toHaveURL(/vehicule\/nouveau/);
  await expect(page.getByTestId("vehicle-done-title")).toHaveCount(0);
  await expect(allBars(page)).toHaveCount(1);

  // Suppression depuis la fiche du véhicule ajouté (casquette organisateur de nouveau active).
  const after = await apiCall<{ id: string }[]>(cookie, "GET", "/me/vehicles");
  const known = new Set(before.data.map((v) => v.id));
  const added = after.data.find((v) => !known.has(v.id));
  expect(added, "le véhicule ajouté par l'assistant").toBeTruthy();
  await asOrganizer();
  await go(page, `/vehicule/${added?.id}`);
  await page.getByTestId("vehicle-menu").click({ timeout: 30_000 });
  await page.getByTestId("vehicle-delete").click();
  await page.getByTestId("orga-confirm").click();
  await expect(selected(page)).toHaveAccessibleName(/^Garage/, { timeout: 30_000 });
  await expect(allBars(page)).toHaveCount(1);
  await page.goBack();
  await expect(page).not.toHaveURL(new RegExp(`vehicule/${added?.id}`));
  await expect(allBars(page)).toHaveCount(1);
  const left = await apiCall<{ id: string }[]>(cookie, "GET", "/me/vehicles");
  expect(left.data.map((v) => v.id)).not.toContain(added?.id);
  await ctx.close();
});
