import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, createEvent, login, MOBILE, setTheme, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R3d : captures « avant » et « après » des écrans de l'inscription touchés (Béton et Sable, 390 px pour l'appli ;
// 390 et 1 280 px pour le site). PHASE=avant|apres. L'appli se lance avec APP_URL ; le site et l'API sur la base seedée.
const PHASE = process.env.PHASE ?? "apres";
const DIR = `${RELAIS}/lot-r3d-captures/${PHASE}`;
const APP = process.env.APP_URL;
mkdirSync(DIR, { recursive: true });
type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
const DESKTOP = { width: 1280, height: 900 } as const;

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function appArrivee(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/");
  await page.waitForURL(/\/arrivee$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Commencer" }).click();
  await page.waitForURL(/arrivee\/profil/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Tu viens comment ?" }).first()).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

test("appli : profil, Ton coin vide, Qui es-tu ? avec un mot de passe de 9 caractères", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(240_000);
  for (const theme of THEMES) {
    const { ctx, page } = await appArrivee(browser, theme);
    await page.getByTestId("profile-organizer").click();
    await shot(page, `appli-01-profil-${theme}`);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/arrivee\/departement/);
    await expect(page.getByRole("heading", { name: "Ton coin" }).first()).toBeVisible();
    await shot(page, `appli-02-coin-vide-${theme}`);
    await page.getByTestId("dept-66").click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/arrivee\/identite/);
    await page.getByLabel("Pseudo").fill(`Cap_${unique()}`.slice(0, 24));
    await page.getByLabel("Prénom").fill("Julien");
    await page.getByLabel("Nom", { exact: true }).fill("Martí");
    await page.getByLabel("E-mail").fill(`cap_${unique()}@e2e.orasso.test`);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill("123456789");
    await page.getByText("J'accepte les conditions générales d'utilisation d'Orasso").click();
    await page.waitForTimeout(1_000);
    await shot(page, `appli-03-identite-9-caracteres-${theme}`);
    await page.mouse.wheel(0, 2_000);
    await shot(page, `appli-03b-identite-bas-${theme}`);
    await ctx.close();
  }
});

test("site : inscription vide puis refusée (mot de passe de 9 caractères, sans conditions)", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const theme of THEMES) {
    for (const [size, viewport] of [
      ["390", MOBILE],
      ["1280", DESKTOP],
    ] as const) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await page.goto("/inscription");
      await page.waitForLoadState("networkidle");
      await shot(page, `site-01-inscription-${size}-${theme}`);
      await page.getByLabel("Pseudo").fill(`Cap_${unique()}`.slice(0, 24));
      await page.getByLabel("Prénom").fill("Julien");
      await page.getByLabel("Nom", { exact: true }).fill("Martí");
      await page.getByLabel("E-mail").fill(`cap_${unique()}@e2e.orasso.test`);
      await page.getByLabel("Mot de passe", { exact: true }).first().fill("123456789");
      await page.getByRole("button", { name: "Créer mon compte" }).click();
      await page.waitForLoadState("networkidle");
      await shot(page, `site-02-inscription-refusee-${size}-${theme}`, true);
      await ctx.close();
    }
  }
});

test("site : inscription express refusée (mot de passe de 9 caractères, sans conditions)", async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await login("damien@orasso.local");
  const event = await createEvent(owner, { title: `Express capture ${unique()}` });
  for (const theme of THEMES) {
    const invite = await apiCall<{ url: string }>(owner, "POST", `/events/${event.id}/express-invites`, {
      email: `cap_express_${unique()}@e2e.orasso.test`,
    });
    const token = invite.data.url.split("/express/")[1] ?? "";
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await page.goto(`/express/${token}`);
    await page.waitForLoadState("networkidle");
    const form = page.getByTestId("express-form");
    await form.getByLabel("Pseudo").fill(`Exp_${unique()}`.slice(0, 24));
    await form.getByLabel("Mot de passe", { exact: true }).fill("123456789");
    await form.getByLabel("Mot de passe, encore une fois").fill("123456789");
    await form.getByLabel("Prénom").fill("Camille");
    await form.getByLabel("Nom", { exact: true }).fill("Durand");
    await form.getByRole("button", { name: "M'inscrire" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, `site-03-express-refusee-390-${theme}`, true);
    await ctx.close();
  }
});
