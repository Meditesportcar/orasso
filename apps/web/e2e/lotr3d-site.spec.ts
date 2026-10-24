import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, createEvent, fillArrivee, login, MOBILE, setTheme, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R3d (retour réel du 24/10), côté site : l'inscription et l'inscription express suivent la même règle que l'appli.
// À l'envoi, chaque champ dit ce qui manque (mot de passe : « il en manque N »), la première chose est redite sous le
// bouton (sur téléphone, le champ est souvent hors de l'écran), et la case des conditions reste cochée. Béton et Sable,
// 390 et 1 280 px. Lancer avec l'API et le site sur la base seedée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r3d-captures/site`;
mkdirSync(DIR, { recursive: true });
const DESKTOP = { width: 1280, height: 900 } as const;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
}

for (const theme of ["beton", "sable"] as const) {
  for (const [size, viewport] of [
    ["390", MOBILE],
    ["1280", DESKTOP],
  ] as const) {
    test(`inscription : 9 caractères refusés avec « il en manque 1 », redit sous le bouton (${theme}, ${size})`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await page.goto("/inscription");
      await page.waitForLoadState("networkidle");
      await fillArrivee(page);
      const s = unique();
      await page.getByLabel("Pseudo").fill(`R3s_${s}`.slice(0, 24));
      await page.getByLabel("E-mail").fill(`r3s_${s}@e2e.orasso.test`);
      await page.getByLabel("Mot de passe", { exact: true }).first().fill("123456789");
      await page.getByText("J'accepte les conditions générales d'utilisation d'Orasso").click();
      await page.getByRole("button", { name: "Créer mon compte" }).click();
      const expected = "Mot de passe : 10 caractères au moins (il en manque 1).";
      await expect(page.getByTestId("signup-missing")).toHaveText(expected);
      await expect(page.locator(".o-field__error", { hasText: expected })).toBeVisible();
      // La case des conditions reste cochée.
      await expect(page.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso")).toBeChecked();
      await page.getByTestId("signup-missing").scrollIntoViewIfNeeded();
      await shot(page, `01-inscription-9-caracteres-${size}-${theme}`);
      await audit(page);

      // 10 caractères : le compte est créé.
      await page.getByLabel("Mot de passe", { exact: true }).first().fill("1234567890");
      await page.getByRole("button", { name: "Créer mon compte" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/inscription"), { timeout: 30_000 });
      await ctx.close();
    });
  }
}

test("inscription : sans département, la ligne sous le bouton le dit d'abord", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await page.goto("/inscription");
  await page.waitForLoadState("networkidle");
  const s = unique();
  await page.getByLabel("Pseudo").fill(`R3d_${s}`.slice(0, 24));
  await page.getByLabel("Prénom").fill("Julien");
  await page.getByLabel("Nom", { exact: true }).fill("Martí");
  await page.getByLabel("E-mail").fill(`r3d_${s}@e2e.orasso.test`);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill("1234567890");
  await page.getByText("J'accepte les conditions générales d'utilisation d'Orasso").click();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByTestId("signup-missing")).toHaveText("Choisis au moins un département.");
  await ctx.close();
});

for (const theme of ["beton", "sable"] as const) {
  test(`inscription express : 9 caractères refusés avec « il en manque 1 », redit sous le bouton (${theme})`, async ({
    browser,
  }) => {
    const owner = await login("damien@orasso.local");
    const event = await createEvent(owner, { title: `Express R3d ${unique()}` });
    const invite = await apiCall<{ url: string }>(owner, "POST", `/events/${event.id}/express-invites`, {
      email: `r3d_express_${unique()}@e2e.orasso.test`,
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
    const expected = "Mot de passe : 10 caractères au moins (il en manque 1).";
    await expect(page.getByTestId("signup-missing")).toHaveText(expected);
    await expect(page.locator(".o-field__error", { hasText: expected })).toBeVisible();
    await page.getByTestId("signup-missing").scrollIntoViewIfNeeded();
    await shot(page, `02-express-9-caracteres-390-${theme}`);
    await audit(page);
    await ctx.close();
  });
}
