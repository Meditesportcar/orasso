import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8b1 (D40, maquette R8.1 `pr-profil`, option A « Compact »), côté appli (version web compilée de recette) : le haut du
// Profil (photo, pseudo, grade et département, bio sur une ligne avec « plus », QR et Réglages en icônes, bande de compteurs avec
// « partenaires » en 4e), « Voir mon profil comme les autres » en première ligne de Réglages, onglets soulignés et collants
// (« Garage · N », « Sorties »), « Ajouter un véhicule » en fin de liste et état vide avec le bouton principal, profil d'un
// autre (« Suivre » sur la ligne du grade, « Message » et « Plus »). Lancer avec APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8b1-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function open(browser: Browser, fontScale = 1, theme: "beton" | "sable" = "beton", width = 384) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: APP });
  await ctx.addInitScript(
    ([f, th]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", th as string);
      if (f !== 1) localStorage.setItem("orasso.recette.echellePolice", String(f));
    },
    [fontScale, theme] as const,
  );
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

test("mon profil : haut compact, quatre compteurs avec un partenaire, Garage · N égal aux mini-fiches, ligne d'ajout", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil?onglet=garage");
  await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
  // QR et Réglages en icônes ; « Profil public » a quitté l'en-tête ; la ligne de logos des partenaires aussi.
  await expect(page.getByTestId("profil-account-qr")).toHaveAccessibleName("Mon QR");
  await expect(page.getByTestId("profil-gear")).toHaveAccessibleName("Réglages");
  await expect(page.getByTestId("profil-public")).toHaveCount(0);
  await expect(page.getByTestId("partners-line")).toHaveCount(0);
  // Bande de compteurs : abonnés, abonnements, sorties et « partenaire » (singulier à 1).
  for (const id of ["abonnes", "abonnements", "sorties", "partenaires"]) {
    await expect(page.getByTestId(`profil-count-${id}`), id).toBeVisible();
  }
  await expect(page.getByTestId("profil-count-partenaires")).toContainText("1");
  await expect(page.getByTestId("profil-count-partenaires")).toContainText(/partenaire$/);
  // Onglets : Garage · N, N = nombre de mini-fiches ; la ligne « N véhicules » a disparu ; « Ajouter un véhicule » en fin de liste.
  await expect(selected(page)).toHaveAccessibleName(/^Garage · \d+$/);
  const cards = (await page.getByTestId("garage-mini").count()) + (await page.getByTestId("garage-row").count());
  const label = (await selected(page).getAttribute("aria-label")) ?? "";
  expect(Number(label.replace("Garage · ", ""))).toBe(cards);
  await expect(page.getByTestId("garage-count")).toHaveCount(0);
  await expect(page.getByTestId("garage-add")).toBeVisible();
  await expect(page.getByTestId("garage-empty-add")).toHaveCount(0);
  // Hauteur avant le contenu : du haut de l'en-tête au bas des onglets (cible : environ 214 px, contre 392 à 463).
  const tall = await page.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    const head = q("profil-head");
    const tabs = q("profil-tabs");
    return head && tabs ? Math.round(tabs.bottom - head.top) : -1;
  });
  console.log(`R8b1 hauteur avant le contenu (384 px, police x1) : ${tall} px`);
  expect(tall).toBeGreaterThan(0);
  expect(tall).toBeLessThanOrEqual(260);
  await shot(page, "01-mon-profil-garage");
  // La ligne de fin de liste ouvre l'ajout d'un véhicule.
  await page.getByTestId("garage-add").click();
  await expect(page).toHaveURL(/vehicule\/nouveau/, { timeout: 30_000 });
  await go(page, "/profil");
  // Le compteur « partenaires » ouvre la liste (« Mettre fin » compris).
  await page.getByTestId("profil-count-partenaires").click();
  await expect(page.getByTestId("partner-row").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("partner-end").first()).toBeVisible();
  await shot(page, "02-liste-des-partenaires");
  await page.getByTestId("partners-sheet-close").click();
  // Sorties : la saison, le passeport ; plus de « Ajouter un véhicule ».
  await page.getByTestId("profil-tab-sorties").click();
  await expect(selected(page)).toHaveAccessibleName("Sorties");
  await expect(page.getByTestId("profil-season")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("garage-add")).toHaveCount(0);
  await ctx.close();
});

test("mon profil sans partenaire : trois compteurs ; Réglages › Voir mon profil comme les autres ouvre l'aperçu", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "julie@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("profil-counters")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("profil-count-sorties")).toBeVisible();
  await expect(page.getByTestId("profil-count-partenaires")).toHaveCount(0);
  await shot(page, "03-sans-partenaire");
  await page.getByTestId("profil-gear").click();
  const row = page.getByTestId("reglage-profil-public");
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAccessibleName("Voir mon profil comme les autres");
  // C'est la première ligne de la liste.
  const firstRowId = await page.locator('[data-testid^="reglage-"]').first().getAttribute("data-testid");
  expect(firstRowId).toBe("reglage-profil-public");
  await shot(page, "04-reglages");
  await row.click();
  await expect(page).toHaveURL(/profil-public/, { timeout: 30_000 });
  await expect(page.getByTestId("preview-banner")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("preview-actions")).toBeVisible();
  await shot(page, "05-apercu");
  await ctx.close();
});

test("la bio tient sur une ligne : « plus » la déroule, « moins » la replie ; sans bio, pas de ligne", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const pseudo = `Bio${unique()}`.slice(0, 14);
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", {
    bio: "Passionné de drift et de rassemblement, du circuit au col, toujours partant pour une sortie entre amis le week-end.",
  });
  const { ctx, page } = await open(browser);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(page, "/profil");
  const bio = page.getByTestId("profil-bio");
  await expect(bio).toBeVisible({ timeout: 30_000 });
  const toggle = page.getByTestId("profil-bio-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAccessibleName("plus");
  const closed = (await bio.boundingBox())?.height ?? 0;
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("moins");
  expect((await bio.boundingBox())?.height ?? 0).toBeGreaterThan(closed + 8);
  await shot(page, "06-bio-deroulee");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("plus");
  expect((await bio.boundingBox())?.height ?? 0).toBeLessThanOrEqual(closed + 2);
  // Sans bio : pas de ligne.
  await apiCall(cookie, "PATCH", "/me/profile", { bio: "" });
  await go(page, "/profil");
  await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("profil-bio")).toHaveCount(0);
  await ctx.close();
});

test("une panne de lecture des partenaires n'est jamais « aucun partenaire » : « – » et « Réessayer »", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  let down = true;
  await page.route("**/me/partnerships", async (route) => {
    if (down && route.request().method() === "GET") {
      const res = await route.fetch();
      await route.fulfill({ response: res, status: 500, body: JSON.stringify({ error: { message: "Panne" } }) });
    } else await route.continue();
  });
  await go(page, "/profil");
  const cell = page.getByTestId("profil-count-partenaires");
  await expect(cell).toBeVisible({ timeout: 30_000 });
  await expect(cell).toContainText("–");
  await shot(page, "07-partenaires-panne");
  await cell.click();
  await expect(page.getByTestId("partners-error")).toBeVisible();
  down = false;
  await page.getByTestId("partners-error").getByRole("button").first().click();
  await expect(page.getByTestId("partner-row").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("partners-sheet-close").click();
  await expect(cell).toContainText("1");
  await ctx.close();
});

test("onglets collants : en défilant, la rangée reste sous la barre du haut", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  const before = (await page.getByTestId("profil-tabs").boundingBox())?.y ?? 0;
  await page.mouse.move(190, 500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(600);
  const after = (await page.getByTestId("profil-tabs").boundingBox())?.y ?? 9999;
  console.log(`R8b1 onglets collants : y avant ${Math.round(before)}, après défilement ${Math.round(after)}`);
  // Collée : sous la barre du haut (et non partie avec le défilement).
  expect(after).toBeGreaterThan(40);
  expect(after).toBeLessThan(160);
  await expect(page.getByTestId("profil-tabs")).toBeVisible();
  await shot(page, "08-onglets-collants");
  await ctx.close();
});

test("visiteur sans véhicule : pas d'onglet Garage, ouvert sur Sorties ; l'ajout d'un premier véhicule reste possible", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "paul.photo@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("profil-tab-garage")).toHaveCount(0);
  // Lot R8b2 : « Publications » s'ouvre par défaut ; « Sorties » est à côté.
  await expect(selected(page)).toHaveAccessibleName("Publications");
  await page.getByTestId("profil-tab-sorties").click();
  await expect(selected(page)).toHaveAccessibleName("Sorties");
  await expect(page.getByTestId("profil-places")).toBeVisible({ timeout: 30_000 });
  await shot(page, "09-visiteur");
  // L'ajout d'un premier véhicule : la ligne de « Mes casquettes ».
  const quick = page.getByTestId("casquette-quick-vehicle");
  await quick.scrollIntoViewIfNeeded();
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page).toHaveURL(/vehicule\/nouveau/, { timeout: 30_000 });
  await ctx.close();
});

test("lot R8r : visiteur, lecture des véhicules suspendue : « Sorties » s'ouvre tout de suite, « Garage » dit qu'il charge", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "paul.photo@orasso.local");
  // La lecture des véhicules ne répond jamais.
  await ctx.route("**/api/me/vehicles", () => new Promise(() => undefined));
  await go(page, "/profil?onglet=sorties");
  await expect(page.getByTestId("profil-places")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("profil-tab-pending")).toHaveCount(0);
  await go(page, "/profil?onglet=garage");
  await expect(page.getByTestId("profil-tab-pending")).toContainText("Chargement du garage", { timeout: 30_000 });
  await ctx.close();
});

test("garage vide d'un exposant : « Garage · 0 », état vide et son bouton principal, pas de ligne d'ajout", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  // La liste des véhicules arrive vide (la casquette reste celle d'un exposant : elle vient de `GET /me`).
  await page.route("**/me/vehicles", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, body: "[]" });
  });
  await go(page, "/profil?onglet=garage");
  await expect(selected(page)).toHaveAccessibleName("Garage · 0", { timeout: 30_000 });
  await expect(page.getByText("Ton garage est vide")).toBeVisible();
  await expect(page.getByText("Ajoute ta première voiture : marque, photos, plaque floutée.")).toBeVisible();
  await expect(page.getByTestId("garage-empty-add")).toBeVisible();
  await expect(page.getByTestId("garage-add")).toHaveCount(0);
  await shot(page, "10-garage-vide");
  await page.getByTestId("garage-empty-add").click();
  await expect(page).toHaveURL(/vehicule\/nouveau/, { timeout: 30_000 });
  await ctx.close();
});

test("le profil d'un autre : « Suivre » sur la ligne du grade, « Message » et « Plus » en icônes, partenaires en 4e compteur", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/u/Lea_11");
  await expect(page.getByTestId("public-head")).toBeVisible({ timeout: 30_000 });
  const follow = page.getByTestId("follow-button");
  await expect(follow).toBeVisible();
  const box = async (id: string) => (await page.getByTestId(id).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const pseudo = await box("profile-pseudo");
  const counts = await box("public-counts");
  const fol = (await follow.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  // « Suivre » est petit (pas pleine largeur) et se pose entre le pseudo et la bande de compteurs.
  expect(fol.width).toBeLessThan(200);
  expect(fol.y).toBeGreaterThan(pseudo.y);
  expect(fol.y + fol.height).toBeLessThanOrEqual(counts.y + 2);
  await expect(page.getByTestId("message-open")).toHaveAccessibleName("Message");
  await expect(page.getByTestId("profile-more")).toHaveAccessibleName("Plus");
  // Les trois nombres, puis un partenaire : il ouvre sa fiche.
  await expect(page.getByTestId("public-counts")).toContainText("abonné");
  await expect(selected(page)).toHaveAccessibleName(/^Garage · \d+$/);
  await shot(page, "11-profil-autre");
  await page.getByTestId("profile-more").click();
  await expect(page.getByTestId("report-open-profile")).toBeVisible();
  await shot(page, "12-plus");
  // La feuille « Plus » reste ouverte sur ce profil : on rouvre la page avant de toucher le compteur.
  await go(page, "/u/Lea_11");
  await expect(page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  const partner = page.getByTestId("public-count-partners");
  await expect(partner).toBeVisible();
  await partner.click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 30_000 });
  await ctx.close();
});

test("un compte privé vu d'un inconnu : les nombres, le panneau « Compte privé » (lot R8b2), « Publications » seul ; demande en attente", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const pseudo = `Vis${unique()}`.slice(0, 14);
  const cookie = await signUpApi(pseudo);
  await addVehicleApi(cookie, randomPlate());
  const { ctx, page } = await open(browser);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(page, "/u/Marc_66");
  await expect(page.getByTestId("public-counts")).toBeVisible({ timeout: 30_000 });
  // Lot R8b2 : plus de note « Réservé à ses abonnés » : l'onglet « Publications » (le seul) montre le panneau « Compte privé ».
  await expect(page.getByTestId("publications-private")).toContainText("Compte privé");
  await expect(page.getByTestId("profil-tabs").getByRole("tab")).toHaveText(["Publications"]);
  await expect(page.getByTestId("profile-private-note")).toHaveCount(0);
  await expect(page.getByTestId("follow-button")).toBeVisible();
  await shot(page, "13-prive-inconnu");
  // Demander à suivre : la demande attend sa réponse.
  await page.getByTestId("follow-button").click();
  await expect(page.getByTestId("follow-button")).toContainText("Demandé", { timeout: 30_000 });
  await page.reload();
  await afterOpening(page);
  await expect(page.getByTestId("publications-private-ask")).toHaveText("Demande envoyée à Marc_66", {
    timeout: 30_000,
  });
  await shot(page, "14-prive-attente");
  await ctx.close();
});

test("tour 2 : le dernier véhicule archivé rend visiteur, mais « Garage » garde le lien vers les archivés", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const pseudo = `Arc${unique()}`.slice(0, 14);
  const cookie = await signUpApi(pseudo);
  const vehicleId = await addVehicleApi(cookie, randomPlate());
  const { ctx, page } = await open(browser);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  // L'archivage réel du dernier véhicule actif : la casquette passe à « visiteur » (API).
  const res = await apiCall(cookie, "PATCH", `/me/vehicles/${vehicleId}`, { status: "sold", statusNote: null });
  expect(res.status).toBe(200);
  await go(page, "/profil");
  await expect(page.getByTestId("profil-tab-garage")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("profil-tab-garage").click();
  await expect(page.getByTestId("garage-empty-add")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("garage-archived").click();
  await expect(page).toHaveURL(/vehicules-archives/, { timeout: 30_000 });
  await expect(page.getByTestId("archived-vehicle").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "15-archives-visiteur");
  await ctx.close();
});

test("tour 2 : lecture des véhicules en panne sur Sorties, réseau rétabli, ouverture de Garage : « Réessayer » puis la liste", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  let down = true;
  await page.route("**/me/vehicles", async (route) => {
    if (down && route.request().method() === "GET") {
      const res = await route.fetch();
      await route.fulfill({ response: res, status: 500, body: JSON.stringify({ error: { message: "Panne" } }) });
    } else await route.continue();
  });
  await go(page, "/profil?onglet=sorties");
  await expect(selected(page)).toHaveAccessibleName("Sorties", { timeout: 30_000 });
  down = false;
  await page.getByTestId("profil-tab-garage").click();
  // Relancée à l'ouverture : la liste revient sans faux « Ton garage est vide ».
  await expect(page.getByTestId("garage-mini")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Ton garage est vide")).toHaveCount(0);
  await ctx.close();
});

test("tour 2 : mon profil ouvert par son lien, partenaires en panne : « – » et « Réessayer », jamais un profil sans partenaire", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await page.route("**/me/partnerships", async (route) => {
    if (route.request().method() === "GET") {
      const res = await route.fetch();
      await route.fulfill({ response: res, status: 500, body: JSON.stringify({ error: { message: "Panne" } }) });
    } else await route.continue();
  });
  await go(page, "/u/Kenji_66");
  const cell = page.getByTestId("public-count-partners");
  await expect(cell).toBeVisible({ timeout: 30_000 });
  await expect(cell).toContainText("–");
  await cell.click();
  await expect(page.getByTestId("partners-error")).toContainText("Réessayer", { timeout: 20_000 });
  await ctx.close();
});
