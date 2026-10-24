import { mkdirSync } from "node:fs";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, MOBILE, SEED_PASSWORD, samplePhoto, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R3a (retours de Damien du 24/10 sur les APK R1 et R2), côté appli (version web compilée) :
//   - (2) le titre de la case d'appel « Ajouter des photos » tient en entier à 390 et à 320 px ;
//   - (3) « Continuer » attend que le bas d'une étape plus haute que l'écran ait été vu : indicateur discret (fondu et
//     petite flèche), toucher la flèche fait descendre, le bouton s'active et le reste en remontant ;
//   - (7) affiche à partager : une plaque « lue » sur les textes d'Orasso (sous la photo) est ignorée, dans les trois
//     styles ; une plaque sur la photo est signalée ;
//   - (8) « La masquer » et « Partager quand même » l'un sous l'autre, pleine largeur, libellés sur une ligne.
// La couleur sans doublon (4) et la lecture de plaque (6) sont couvertes par les tests unitaires (shared, mobile).
// Béton et Sable. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r3a-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme, viewport: { width: number; height: number } = MOBILE) {
  const ctx = await browser.newContext({ viewport, baseURL: APP });
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
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Le texte tient en entier : rien ne dépasse de sa boîte, la boîte est dans l'écran, le texte est complet. */
async function whole(el: Locator, text: string) {
  await expect(el).toBeVisible({ timeout: 30_000 });
  const box = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const lines = [...node.querySelectorAll("*"), node].filter((n) => (n as HTMLElement).scrollWidth !== undefined);
    return {
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
      cut: lines.some((n) => (n as HTMLElement).scrollWidth > (n as HTMLElement).clientWidth + 1),
      left: r.left,
      right: r.right,
      width: window.innerWidth,
    };
  });
  expect(box.text.toLowerCase()).toBe(text.toLowerCase());
  expect(box.cut, `« ${text} » ne dépasse pas`).toBe(false);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.width);
}

for (const theme of THEMES) {
  test(`ajout de véhicule (${theme}) : titre entier à 390 et 320 px, « Continuer » après avoir vu le bas de l'étape`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const pseudo = `AjoutR3a${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    await signUpApi(pseudo, email);
    const { ctx, page } = await open(browser, theme, { width: 390, height: 600 });
    await signIn(page, email);
    await page.goto("/vehicule/nouveau");
    await afterOpening(page);

    // (3) Une étape plus haute que l'écran (écran bas, ouvert d'emblée : à 844 px, l'étape vide tient et serait vue).
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("vehicle-photo-add").click();
    await (await chooser).setFiles([
      { name: "a.png", mimeType: "image/png", buffer: samplePhoto([200, 200, 205]) },
      { name: "b.png", mimeType: "image/png", buffer: samplePhoto([40, 60, 120]) },
      { name: "c.png", mimeType: "image/png", buffer: samplePhoto([150, 40, 40]) },
    ]);
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId("crop-validate")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("crop-validate").click();
    }
    await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
    const nextButton = page.getByTestId("vehicle-step-next");
    const hint = page.getByTestId("flow-end-hint");
    await expect(hint).toBeVisible({ timeout: 10_000 });
    await expect(nextButton).toBeDisabled();
    await shot(page, `${theme}-03-etape-longue-bloquee`);
    // Toucher la flèche fait descendre ; en bas, le bouton s'active et l'indicateur disparaît.
    await page.getByTestId("flow-end-arrow").click();
    await expect(nextButton).toBeEnabled({ timeout: 10_000 });
    await expect(hint).toHaveCount(0);
    await shot(page, `${theme}-04-etape-vue`);
    // Retour en haut : toujours actif.
    await page.mouse.move(195, 300);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("vehicle-photo-cert")).toBeInViewport();
    await expect(nextButton).toBeEnabled();
    // Étape suivante puis retour : l'étape des photos reste débloquée.
    await nextButton.click();
    await expect(page.getByText("Étape 2 sur 5 · Plaque")).toBeVisible();
    await page.getByTestId("vehicle-step-back").click();
    await expect(page.getByText("Étape 1 sur 5 · Photos")).toBeVisible();
    await expect(nextButton).toBeEnabled();
    // (2) Le titre de la case d'appel, entier, à 390 puis à 320 px.
    // Retour au premier état : sans photo, la case d'appel.
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("photo-remove").first().click();
      await page.getByTestId("orga-confirm").click();
      await expect(page.getByTestId("orga-confirm")).toHaveCount(0);
    }
    await page.setViewportSize(MOBILE);
    const title = page.getByTestId("vehicle-photo-call-title");
    await whole(title, "Ajouter des photos");
    await shot(page, `${theme}-01-titre-390`);
    await page.setViewportSize({ width: 320, height: 700 });
    await whole(title, "Ajouter des photos");
    await whole(page.getByTestId("vehicle-step-title"), "Ses photos");
    await shot(page, `${theme}-02-titre-320`);

    await ctx.close();
  });
}

for (const theme of THEMES) {
  test(`affiche à partager (${theme}) : la vérification ignore les textes d'Orasso, boutons l'un sous l'autre`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const kenji = await login("kenji@orasso.local");
    const vehicles = await apiCall<{ id: string; status: string }[]>(kenji, "GET", "/me/vehicles");
    const vehicle = vehicles.data.find((v) => v.status === "active");
    const { ctx, page } = await open(browser, theme);
    // (7) Une « plaque » lue sous la photo (le nom, les chiffres, le pied d'Orasso) : ignorée.
    await page.addInitScript(() => {
      (window as unknown as { __orassoFakePlates: unknown }).__orassoFakePlates = [
        { x: 0.06, y: 0.62, w: 0.5, h: 0.05 },
        { x: 0.3, y: 0.88, w: 0.3, h: 0.03 },
      ];
    });
    await signIn(page, "kenji@orasso.local");
    await page.goto(`/vehicule/${vehicle?.id}/partager`);
    await afterOpening(page);
    for (const style of ["Nuit", "Sable", "Néon"]) {
      await page.getByTestId("share-styles").getByText(style, { exact: true }).click();
      await expect(page.getByTestId("share-plate-check")).toContainText("rien de lisible", { timeout: 60_000 });
      await expect(page.getByTestId("share-story")).toBeEnabled();
      await shot(page, `${theme}-05-affiche-textes-ignores-${style}`);
    }
    // Story et post : même règle.
    await page.getByTestId("share-formats").getByText("Post 4:5", { exact: true }).click();
    await expect(page.getByTestId("share-plate-check")).toContainText("rien de lisible", { timeout: 60_000 });
    await ctx.close();

    // Une plaque sur la photo : signalée, dans les trois styles ; (8) les deux boutons l'un sous l'autre.
    const second = await open(browser, theme);
    await second.page.addInitScript(() => {
      (window as unknown as { __orassoFakePlates: unknown }).__orassoFakePlates = [{ x: 0.1, y: 0.3, w: 0.3, h: 0.06 }];
    });
    const p = second.page;
    await signIn(p, "kenji@orasso.local");
    await p.goto(`/vehicule/${vehicle?.id}/partager`);
    await afterOpening(p);
    for (const style of ["Nuit", "Sable", "Néon"]) {
      await p.getByTestId("share-styles").getByText(style, { exact: true }).click();
      await expect(p.getByTestId("share-plate-check")).toContainText("Une plaque semble lisible", { timeout: 60_000 });
      const mask = await p.getByTestId("share-plate-mask").boundingBox();
      const anyway = await p.getByTestId("share-anyway").boundingBox();
      expect(mask && anyway, "les deux boutons sont là").toBeTruthy();
      if (mask && anyway) {
        expect(mask.y + mask.height, "« La masquer » au-dessus").toBeLessThanOrEqual(anyway.y + 1);
        expect(Math.abs(mask.width - anyway.width), "même largeur").toBeLessThan(2);
        expect(mask.width, "pleine largeur").toBeGreaterThan(300);
        // Une seule ligne : la hauteur d'un bouton.
        expect(mask.height).toBeLessThan(70);
      }
      await whole(p.getByTestId("share-plate-mask"), "La masquer");
      const a = await auditPage(p);
      expect(a.horizontalScroll, "pas de défilement horizontal").toBe(false);
      expect(a.buttonsWithoutIcon, "tout bouton porte une icône").toEqual([]);
      await shot(p, `${theme}-06-affiche-plaque-${style}`);
    }
    // À 320 px, rien ne s'écrase non plus.
    await p.setViewportSize({ width: 320, height: 700 });
    await whole(p.getByTestId("share-plate-mask"), "La masquer");
    await whole(p.getByTestId("share-anyway"), "Partager quand même");
    await shot(p, `${theme}-07-affiche-plaque-320`);
    await second.ctx.close();
  });
}
