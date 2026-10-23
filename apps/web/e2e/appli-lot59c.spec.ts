import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { checkerPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot 59c, retours de l'APK d'essai, côté appli (version web de recette) : note des captures sous le QR de compte (le
// blocage lui-même n'existe que sur le téléphone), changement de casquette depuis l'Administration (pastille de la
// barre du haut, puis Mon profil), carte de l'Explorer : l'étiquette touchée montre sa fiche, dans l'écran.
// Lancer avec APP_URL=http://localhost:<relais> (Metro, EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SITE_URL et CORS_ORIGINS posés).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-59c-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
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
  await page.waitForURL(/accueil|direct|scanner|candidatures|administration/, { timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens, "pas de vert").toEqual([]);
  expect(a.horizontalScroll, "pas de défilement horizontal").toBe(false);
}

for (const theme of ["beton", "sable"] as Theme[]) {
  test(`QR de compte : la note des captures bloquées est sous le code (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const pseudo = `Qr59_${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    await signUpApi(pseudo, email);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);
    await page.goto("/profil");
    await afterOpening(page);
    await page.getByTestId("profil-account-qr").click();
    const note = page.getByTestId("qr-capture-note");
    await expect(note).toBeVisible({ timeout: 30_000 });
    await expect(note).toContainText("Captures et enregistrement d'écran bloqués sur cet écran");
    await expect(note).toContainText("une à deux minutes");
    await audit(page);
    await shot(page, `qr-compte-note-${theme}`);
    // Lot C1 : une feuille ouverte passe au-dessus de la barre d'onglets, qui se retire (artefact) ; le voile la ferme,
    // la barre revient. Puis : quitter Profil par un onglet et revenir, la feuille reste fermée.
    await expect(page.getByTestId("persona-tabbar")).toHaveCount(0);
    // Le voile, en haut de l’écran (le centre est couvert par la feuille).
    await page
      .getByRole("button", { name: "Fermer", exact: true })
      .first()
      .click({ position: { x: 20, y: 20 } });
    await expect(page.getByTestId("qr-capture-note")).toHaveCount(0);
    await expect(page.getByTestId("persona-tabbar")).toBeVisible();
    await page.getByRole("tab", { name: "Explorer" }).click();
    await page.waitForURL(/explorer/, { timeout: 20_000 });
    await page.getByRole("tab", { name: "Profil" }).click();
    await page.waitForURL(/profil/, { timeout: 20_000 });
    await expect(page.getByTestId("profil-account-qr")).toBeVisible();
    await expect(page.getByTestId("qr-capture-note")).toHaveCount(0);
    await ctx.close();
  });
}

test("Administration : la pastille de la barre ramène à Mon profil, d'où l'on change de casquette", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  for (const theme of ["beton", "sable"] as Theme[]) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await page.goto("/moi");
    await afterOpening(page);
    await page.getByTestId("casquette-admin").click();
    await page.waitForURL(/administration/, { timeout: 20_000 });
    await afterOpening(page);
    await expect(page.getByTestId("topbar-persona")).toBeVisible();
    await shot(page, `admin-accueil-${theme}`);

    // La pastille « A » : Mon profil de la casquette de base, avec la liste des casquettes.
    await page.getByTestId("topbar-persona").click();
    await page.waitForURL(/\/profil/, { timeout: 20_000 });
    await expect(page.getByTestId("casquette-admin")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("casquette-organizer").first()).toBeVisible();
    await audit(page);
    await shot(page, `admin-vers-profil-${theme}`);

    // Une autre casquette, puis retour à l'Administration et de nouveau ailleurs.
    await page.getByTestId("casquette-organizer").first().click();
    await page.waitForURL(/\/direct/, { timeout: 20_000 });
    await page.goto("/moi");
    await afterOpening(page);
    await page.getByTestId("casquette-admin").click();
    await page.waitForURL(/administration/, { timeout: 20_000 });
    await afterOpening(page);
    // Lot 59c : l'entrée visible en bas de l'accueil de l'Administration.
    const row = page.getByTestId("admin-switch-persona");
    await row.scrollIntoViewIfNeeded();
    await expect(row).toContainText("Mon profil et mes casquettes");
    await shot(page, `admin-entree-casquettes-${theme}`);
    await row.click();
    await page.waitForURL(/\/profil/, { timeout: 20_000 });
    await expect(page.getByTestId("casquette-admin")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/administration/);
    await ctx.close();
  }
});

test("Explorer : l'étiquette touchée sur la carte montre sa fiche, dans l'écran", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const theme of ["beton", "sable"] as Theme[]) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await page.goto("/explorer");
    await afterOpening(page);
    await page.getByText("Plus tard", { exact: true }).click({ timeout: 30_000 });
    await page.getByText("Carte", { exact: true }).click();
    const canvas = page.getByTestId("explorer-map-canvas");
    await expect(canvas).toHaveAttribute("data-map-style", `orasso-${theme}`, { timeout: 45_000 });
    // Carte plus haute : 55 % de l'écran, 30 % laissé à la page (441 px sur 844, tour 2).
    const box = await canvas.boundingBox();
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(435);
    await page.waitForTimeout(2500);
    await canvas.getByTestId("map-marker").first().click();
    const picked = page.getByTestId("map-picked");
    await expect(picked).toBeVisible({ timeout: 15_000 });
    // La page a défilé jusqu'à la fiche : son haut est dans l'écran.
    await expect(picked.getByTestId("event-row").first()).toBeInViewport({ ratio: 0.3, timeout: 5_000 });
    await audit(page);
    await shot(page, `explorer-carte-fiche-${theme}`);
    await ctx.close();
  }
});

/** Angle (degrés) et largeur d'origine (px, avant rotation) d'un élément, lus dans le style calculé. */
async function turn(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => {
      const m = getComputedStyle(el).transform.match(/matrix\(([^,]+),\s*([^,]+)/);
      const angle = m ? (Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI : 0;
      return { angle, width: (el as HTMLElement).offsetWidth };
    });
}

async function dragFrom(page: Page, testId: string, dx: number, dy: number) {
  const b = await page.getByTestId(testId).first().boundingBox();
  if (!b) throw new Error(`${testId} absent`);
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
  await page.mouse.up();
}

test("ajout d'un véhicule : les poignées du cadre tournent et agrandissent (le cadre ne leur prend plus le doigt)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const pseudo = `Rot59_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  await signUpApi(pseudo, email);
  const { ctx, page } = await open(browser, "sable");
  await signIn(page, email);
  await page.goto("/vehicule/nouveau");
  await afterOpening(page);
  const next = () => page.getByTestId("vehicle-step-next").click();
  await page.getByLabel("Marque ou modèle").fill("toyota");
  await page.getByRole("radio", { name: "Toyota", exact: false }).first().click();
  await page.getByRole("radio", { name: "Supra", exact: false }).first().click();
  await page.getByRole("radio", { name: "Mk5", exact: false }).first().click();
  await next();
  await page.getByTestId("vehicle-year-2021").click();
  await next();
  await page.getByRole("checkbox", { name: "Sportive", exact: true }).click();
  await next();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("vehicle-photo-add").click();
  await (await chooser).setFiles({ name: "supra.png", mimeType: "image/png", buffer: checkerPhoto() });
  await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
  await next();
  // Lot M2 : « Envoyer sans flouter » se confirme sur cette photo, montrée dans la confirmation ; puis on revient.
  await page.getByTestId("plate-none").click();
  await expect(page.getByTestId("plate-none-photo")).toBeVisible();
  await shot(page, "plaque-sans-flouter-confirmation-sable");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("plate-none")).toHaveAttribute("aria-checked", "true");
  // Décoché : sans confirmation (on revient à la prudence).
  await page.getByTestId("plate-none").click();
  await expect(page.getByTestId("plate-none")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("plate-none-photo")).toHaveCount(0);
  await page.getByTestId("plate-frame-add").click();
  await expect(page.getByTestId("plate-frame").first()).toBeVisible();
  const before = await turn(page, "plate-frame");
  expect(Math.round(before.angle)).toBe(0);

  // Poignée de rotation tirée vers la droite : le cadre penche, sans se déplacer.
  await dragFrom(page, "plate-frame-rotate", 30, 0);
  const turned = await turn(page, "plate-frame");
  expect(turned.angle).toBeGreaterThan(15);
  expect(turned.angle).toBeLessThan(60);
  // Coin : le cadre s'agrandit.
  await dragFrom(page, "plate-frame-handle", 30, 10);
  expect((await turn(page, "plate-frame")).width).toBeGreaterThan(before.width + 10);
  await shot(page, "plaque-cadre-tourne-sable");

  // Cadre remonté en haut de la photo : la poignée de rotation passe dessous (elle ne sort plus de la photo).
  await dragFrom(page, "plate-frame", 0, -400);
  const frameBox = await page.getByTestId("plate-frame").first().boundingBox();
  const handleBox = await page.getByTestId("plate-frame-rotate").first().boundingBox();
  const editorBox = await page.getByTestId("plate-editor").boundingBox();
  if (!frameBox || !handleBox || !editorBox) throw new Error("cadre, poignée ou photo absent");
  expect(handleBox.y).toBeGreaterThanOrEqual(editorBox.y);
  expect(handleBox.y + handleBox.height / 2).toBeGreaterThan(frameBox.y + frameBox.height / 2);
  await shot(page, "plaque-poignee-dessous-sable");
  await ctx.close();
});
