import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { MOBILE, setTheme } from "./helpers";

// Lot 39 : le O vivant et le fond animé « battle ». Recette /_ds (section « olive ») dans les deux thèmes avec l'audit :
// les huit variantes, chargement → garée, onglet central garé / sorti, une meute du fond ; réduction des animations :
// plus rien ne bouge après 200 ms. Côté appli (APP_URL, `expo start --web` derrière le relais) : ouverture en battle
// de 3 s puis l'appli, fondu de 120 ms avec ?reduce=1, aucun avertissement Reanimated, captures de /_ds.
// Prérequis : API et site lancés (base seedée inutile pour /_ds).

const ROOT = process.env.LOT39_CAPTURES ?? "C:/Users/DELL/.claude/relais/orasso/lot-39-captures";
const SITE = `${ROOT}/site`;
const APPLI = `${ROOT}/appli`;
mkdirSync(SITE, { recursive: true });
mkdirSync(APPLI, { recursive: true });
const APP = process.env.APP_URL;

const VARIANTS = ["hero", "load", "pull", "send", "upload", "empty", "stamp", "tab"] as const;

async function phone(browser: Browser, theme: "beton" | "sable", reduced = false) {
  const ctx = await browser.newContext({ viewport: MOBILE, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  return { ctx, page };
}

/** Animations CSS / Web Animations encore en cours dans la section (les terminées sans remplissage n'y sont plus). */
const running = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector("#olive")?.getAnimations({ subtree: true }) ?? [])
      .filter((a) => a.playState === "running" || a.pending)
      .map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? "?"),
  );

test("/_ds « Le O vivant » : huit variantes, deux thèmes, audit sans défaut, captures à 390 px", async ({
  browser,
}) => {
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await phone(browser, theme);
    await page.goto(`/_ds?only=olive&theme=${theme}`);
    await page.waitForLoadState("networkidle");
    const panel = page.locator(`[data-panel="olive-${theme}"]`);
    await expect(panel).toBeVisible();
    for (const id of VARIANTS) await expect(panel.getByTestId(`olive-${id}`), id).toBeVisible();

    // Chargement : la voiture drifte (SMIL le long du tour), « Terminer » la gare dans le O.
    const load = panel.getByTestId("olive-load");
    await expect(load.locator(".o-olive.is-loading animateMotion")).toHaveCount(1);
    await load.getByRole("button", { name: "Terminer" }).click();
    await expect(load.locator(".o-olive")).toHaveClass(/is-parked/, { timeout: 2_000 });
    await load.getByRole("button", { name: "Charger" }).click();
    await expect(load.locator(".o-olive")).toHaveClass(/is-loading/);

    // Onglet central : garée sur Accueil, sortie ailleurs, garée au retour.
    const tab = panel.getByTestId("olive-tab");
    await expect(tab.locator(".o-center-o")).toHaveClass(/is-parked/);
    await tab.getByRole("button", { name: "Explorer" }).click();
    await expect(tab.locator(".o-center-o")).toHaveClass(/is-out/);
    await tab.getByRole("button", { name: "Accueil" }).click();
    await expect(tab.locator(".o-center-o")).toHaveClass(/is-parked/);

    // La battle d'ouverture se termine composée (3 s).
    await expect(panel.locator(".o-opening")).toHaveClass(/is-done/, { timeout: 5_000 });

    // Fond « battle » : une meute arrive (première après 1,2 s), deux ou trois voitures.
    const ground = panel.getByTestId("olive-ground");
    await expect(ground.locator(".o-ground__battle svg")).toHaveCount(1, { timeout: 5_000 });
    const cars = await ground.locator(".o-ground__car").count();
    expect(cars).toBeGreaterThanOrEqual(2);
    expect(cars).toBeLessThanOrEqual(3);
    const opacity = await ground.locator(".o-ground__battle").evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeCloseTo(theme === "beton" ? 0.18 : 0.1, 2);
    await page.waitForTimeout(1_000);
    await ground.screenshot({ path: `${SITE}/fond-battle-${theme}.png` });

    const audit = await auditPage(page);
    expect(audit.primaryButtons, "aucun bouton principal dans la recette").toBeLessThanOrEqual(1);
    expect(audit.buttonsWithoutIcon).toEqual([]);
    expect(audit.greens).toEqual([]);
    expect(audit.truncated).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);
    await page.screenshot({ path: `${SITE}/ds-olive-${theme}.png`, fullPage: true });
    await ctx.close();
  }
});

test("réduction des animations : plus aucune animation en cours après 200 ms, voiture garée, pas de meute", async ({
  browser,
}) => {
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await phone(browser, theme, true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/_ds?only=olive&theme=${theme}`);
    await page.waitForLoadState("networkidle");
    const panel = page.locator(`[data-panel="olive-${theme}"]`);
    await expect(panel.getByTestId("olive-hero")).toBeVisible();
    await page.waitForTimeout(200);
    expect(await running(page), "animations en cours").toEqual([]);
    // Pas de drift (SMIL), pas de meute, logo composé, voiture garée.
    await expect(panel.locator("animateMotion")).toHaveCount(0);
    await expect(panel.locator(".o-ground__battle svg")).toHaveCount(0);
    await expect(panel.locator(".o-opening")).toHaveClass(/is-done/);
    const park = await panel
      .getByTestId("olive-load")
      .locator(".o-olive__park")
      .evaluate((el) => getComputedStyle(el).transform);
    expect(park === "none" || park === "matrix(1, 0, 0, 1, 0, 0)", `voiture garée (${park})`).toBe(true);
    // Les boutons rejouent sans relancer de mouvement.
    await panel.getByRole("button", { name: "Tamponner" }).click();
    await page.waitForTimeout(200);
    expect(await running(page)).toEqual([]);
    await page.screenshot({ path: `${SITE}/ds-olive-reduit-${theme}.png`, fullPage: true });
    await ctx.close();
  }
});

test.describe("appli dans le navigateur", () => {
  test.skip(!APP, "Appli : lancer avec APP_URL (expo start --web derrière apps/mobile/scripts/web-isolated.mjs)");

  test("ouverture en battle de 3 s puis l'appli ; fondu de 120 ms avec ?reduce=1 ; aucun avertissement Reanimated", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (/reanimated|worklet/i.test(msg.text()) && ["warning", "error"].includes(msg.type()))
        warnings.push(msg.text());
    });
    page.on("pageerror", (err) => warnings.push(err.message));
    await page.goto(`${APP}/welcome`);
    const opening = page.getByTestId("opening-battle");
    await expect(opening).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${APPLI}/ouverture-battle-beton.png` });
    await expect(opening).toHaveCount(0, { timeout: 6_000 });
    await page.screenshot({ path: `${APPLI}/apres-ouverture-beton.png` });

    // Animations réduites : le logo composé apparaît en fondu et l'appli suit presque aussitôt.
    await page.goto(`${APP}/welcome?reduce=1`);
    await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 2_500 });
    expect(warnings, "avertissements Reanimated / erreurs").toEqual([]);
    await ctx.close();
  });

  test("/_ds « Le O vivant » de l'appli : deux thèmes, captures à 390 px", async ({ browser }) => {
    for (const theme of ["beton", "sable"] as const) {
      const ctx = await browser.newContext({ viewport: MOBILE });
      const page = await ctx.newPage();
      const warnings: string[] = [];
      page.on("console", (msg) => {
        if (/reanimated|worklet/i.test(msg.text()) && ["warning", "error"].includes(msg.type()))
          warnings.push(msg.text());
      });
      page.on("pageerror", (err) => warnings.push(err.message));
      await page.goto(`${APP}/_ds?only=olive&theme=${theme}`);
      for (const id of VARIANTS)
        await expect(page.getByTestId(`olive-${id}`).first(), id).toBeVisible({ timeout: 20_000 });
      // Laisser passer l'ouverture (3 s) et une meute du fond.
      await page.waitForTimeout(4_500);
      await page.screenshot({ path: `${APPLI}/ds-olive-${theme}.png`, fullPage: true });
      await page
        .getByTestId("olive-ground")
        .first()
        .screenshot({ path: `${APPLI}/fond-battle-${theme}.png` });
      expect(warnings).toEqual([]);
      await ctx.close();
    }
  });
});
