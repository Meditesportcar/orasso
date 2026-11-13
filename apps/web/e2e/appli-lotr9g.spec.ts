import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9g (section « Photos » de la fiche, album « officiel », reprise d'une photo dans le journal), côté appli (version web compilée de
// recette, `APP_URL`) : Damien (passionné) ouvre la fiche Côte Vermeille : « Photos », « 1 album », « Album officiel », « Voir l'album » ;
// en casquette organisateur : « … » retire puis remet « officiel », puis une photo s'ouvre : « Reprendre dans le journal de l'événement »,
// légende, « Publier », confirmation, et la publication est en tête du journal avec « Photo : Sud Cars » et « repartagée, crédit non
// retirable » ; la même photo une seconde fois : « Déjà reprise dans le journal. » ; Léo (le média) n'a aucune action d'organisateur ; la
// police ×1,3 tient. Photos : celles du seed seulement. La publication créée est retirée à la fin.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9g-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const SLUG = "rassemblement-cote-vermeille-2025";
const DAMIEN = "damien@orasso.local";
const LEO = "leo@orasso.local";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, opts: { theme?: string; scale?: number; width?: number } = {}) {
  const { theme = "beton", scale = 1, width = 390 } = opts;
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function chooseOrganizer(page: Page, name: string) {
  await go(page, "/moi");
  await page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
  await page.waitForURL(/\/direct/, { timeout: 30_000 });
}

for (const theme of ["beton", "sable"] as const) {
  test(`Damien : la section « Photos » de la fiche, puis l'organisateur (${theme})`, async ({ browser }) => {
    test.setTimeout(420_000);
    const cookie = await login(DAMIEN);
    const events = await apiCall<{ id: string }>(cookie, "GET", `/events/by-slug/${SLUG}`);
    let postId: string | null = null;
    const { ctx, page } = await open(browser, DAMIEN, { theme });
    try {
      // Passionné : la section, sans aucune action de gestion.
      await go(page, `/e/${SLUG}`);
      const section = page.getByTestId("event-photos");
      await section.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await expect(section).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("event-photos-title")).toContainText("Photos");
      await expect(section).toContainText("1 album");
      await expect(page.getByTestId("event-photos-official")).toHaveText("Album officiel");
      await expect(section).toContainText("Sud Cars · 12 photos");
      await expect(page.getByTestId("event-photos-album-title")).toHaveText(
        "Les photos du Rassemblement Côte Vermeille",
      );
      await expect(page.getByTestId("event-photos-more")).toHaveCount(0);
      await expect(page.getByTestId("event-photos-open")).toContainText("Voir l'album");
      await shot(page, `fiche-photos-passionne-${theme}`);

      // Organisateur : le « … » retire puis remet « officiel ».
      await chooseOrganizer(page, "MéditeSportCar");
      await go(page, `/e/${SLUG}`);
      await section.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await page.getByTestId("event-photos-more").click();
      await expect(page.getByTestId("album-sheet-official")).toContainText("Retirer « officiel »");
      await shot(page, `fiche-photos-feuille-${theme}`);
      await page.getByTestId("album-sheet-official").click();
      await expect(page.getByTestId("event-photos-official")).toHaveCount(0, { timeout: 30_000 });
      await page.getByTestId("event-photos-more").click();
      await expect(page.getByTestId("album-sheet-official")).toContainText("Choisir cet album comme « officiel »");
      await page.getByTestId("album-sheet-official").click();
      await expect(page.getByTestId("event-photos-official")).toHaveText("Album officiel", { timeout: 30_000 });

      // L'album ouvert, une photo : les actions de l'organisateur.
      await page.getByTestId("event-photos-open").click();
      await expect(page.getByTestId("album-open")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("album-photo").nth(1).click();
      await expect(page.getByTestId("album-action-repost")).toHaveText("Reprendre dans le journal de l'événement", {
        timeout: 30_000,
      });
      await expect(page.getByTestId("album-action-official")).toContainText("Retirer « officiel »");
      await shot(page, `visionneuse-organisateur-${theme}`);
      await page.getByTestId("album-action-repost").click();
      await expect(page.getByTestId("repost-caption")).toHaveValue("Photo : Sud Cars", { timeout: 30_000 });
      await shot(page, `feuille-reprise-${theme}`);
      await page.getByTestId("repost-caption").fill(`Merci à Sud Cars (${theme}).`);
      await page.getByTestId("repost-publish").click();
      await expect(page.getByTestId("repost-done")).toContainText("crédit Sud Cars conservé", { timeout: 30_000 });
      const journal = await apiCall<{ items: { id: string; caption: string | null }[] }>(
        cookie,
        "GET",
        `/events/${events.data.id}/feed-posts`,
      );
      postId = journal.data.items.find((p) => p.caption === `Merci à Sud Cars (${theme}).`)?.id ?? null;
      expect(postId).not.toBeNull();

      // La même photo une seconde fois.
      await page.getByTestId("repost-see-journal").click();
      await expect(page.getByTestId("event-photos")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("event-photos-open").click();
      await page.getByTestId("album-photo").nth(1).click();
      await page.getByTestId("album-action-repost").click();
      await page.getByTestId("repost-publish").click();
      await expect(page.getByText("Déjà reprise dans le journal.")).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Escape");

      // La publication reprise dans le journal de la fiche.
      await go(page, `/e/${SLUG}`);
      await expect(page.getByTestId("credit-foot").first()).toContainText("repartagée, crédit non retirable", {
        timeout: 30_000,
      });
      await expect(page.getByTestId("credit-overlay").first()).toHaveText("Photo : Sud Cars");
      await page.getByTestId("credit-foot").first().scrollIntoViewIfNeeded();
      await shot(page, `publication-reprise-${theme}`);
      await expect(page.getByTestId("credit-album").first()).toContainText("Voir l'album");
    } finally {
      if (postId) await apiCall(cookie, "DELETE", `/me/feed-posts/${postId}`);
      await ctx.close();
    }
  });
}

test("Léo (le média) : aucune action d'organisateur ; police ×1,3 : la section tient", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, LEO, { scale: 1.3, width: 384 });
  await go(page, `/e/${SLUG}`);
  const section = page.getByTestId("event-photos");
  await section.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("event-photos-more")).toHaveCount(0);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(384);
  await shot(page, "fiche-photos-police-1-3");
  await page.getByTestId("event-photos-open").click();
  await expect(page.getByTestId("album-open")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("album-photo").first().click();
  await expect(page.getByTestId("album-viewer")).toBeVisible();
  await expect(page.getByTestId("album-action-repost")).toHaveCount(0);
  await expect(page.getByTestId("album-action-official")).toHaveCount(0);
  await ctx.close();
});
