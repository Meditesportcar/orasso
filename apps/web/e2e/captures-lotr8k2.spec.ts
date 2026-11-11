import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8k2 : captures de la carte d'une publication du Fil (appli compilée `APP_URL`, site), avant et après. `PHASE=avant`
// ou `apres` (dossier du lot dans le relais). La carte est celle de Kenji_66 (commentée par le seed).
const PHASE = process.env.PHASE ?? "avant";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8k2-captures/${PHASE}`;
const APP = process.env.APP_URL;
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function openApp(browser: Browser, theme: string, width: number, scale: number) {
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
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  return { ctx, page };
}

/** La carte de la publication de Kenji_66 (celle qui porte des commentaires) : défile jusqu'à elle. */
async function kenjiCard(page: Page) {
  const cards = page.getByTestId("feed-card-feed_post").filter({ hasText: "Kenji_66" });
  for (let i = 0; i < 12 && (await cards.count()) === 0; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(500);
  }
  const card = cards.first();
  await card.scrollIntoViewIfNeeded();
  return card;
}

async function shot(page: Page, name: string, card: ReturnType<Page["locator"]>) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(800);
  await card.screenshot({ path: `${DIR}/${name}.png` });
}

for (const theme of ["beton", "sable"]) {
  for (const width of [384, 390]) {
    for (const scale of [1, 1.3]) {
      test(`appli carte ${theme} ${width} x${scale}`, async ({ browser }) => {
        test.skip(!APP, "Appli : lancer avec APP_URL");
        test.setTimeout(240_000);
        const { ctx, page } = await openApp(browser, theme, width, scale);
        const card = await kenjiCard(page);
        await shot(page, `appli-carte-${theme}-${width}-x${String(scale).replace(".", "")}`, card);
        await ctx.close();
      });
    }
  }
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`site carte ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
      await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
      const cards = page.getByTestId("feed-card-feed_post").filter({ hasText: "Kenji_66" });
      for (let i = 0; i < 12 && (await cards.count()) === 0; i++) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(500);
      }
      const card = cards.first();
      await card.scrollIntoViewIfNeeded();
      await shot(page, `site-carte-${theme}-${width}`, card);
    });
  }
}

// --- Après : la feuille et ses états (appli et site). Lancés avec PHASE=apres. ---------------------------------------------------

const STATES = process.env.PHASE === "apres";

/** La carte commentée de Kenji_66 (derniers commentaires visibles) ou celle qui a les commentaires coupés. */
async function cardWith(page: Page, kind: "commented" | "off" | "empty") {
  const all = page.getByTestId("feed-card-feed_post");
  const filter =
    kind === "commented"
      ? all.filter({ has: page.getByTestId("feed-post-last-comments") })
      : kind === "off"
        ? all.filter({ hasText: "Belle journée sur le plateau" })
        : all.filter({ hasNot: page.getByTestId("feed-post-last-comments") });
  for (let i = 0; i < 14 && (await filter.count()) === 0; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
  }
  const card = filter.first();
  await card.scrollIntoViewIfNeeded();
  return card;
}

/** Capture seulement : la réponse du Fil marque la première publication « commentaires coupés » (aucune écriture). */
async function forceOff(page: Page) {
  await page.route(/\/api\/fil\?/, async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const first = (json.items ?? []).find((c: { kind: string }) => c.kind === "feed_post");
    if (first) first.payload.post.commentsOff = true;
    await route.fulfill({ response: res, json });
  });
  await page.reload();
}

async function statesFor(page: Page, tag: string, surface: "appli" | "site") {
  mkdirSync(DIR, { recursive: true });
  const snap = async (name: string) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/${surface}-${name}-${tag}.png` });
  };
  const card = await cardWith(page, "commented");
  await snap("carte-page");
  await card.getByTestId("feed-post-comments-open").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  await snap("feuille");
  await page.getByTestId("feed-comment-replies-toggle").first().click();
  await snap("feuille-reponses");
  await page.getByTestId("feed-comment-replies-toggle").first().click();
  await page.getByTestId("feed-comment-reply").first().click();
  await snap("feuille-repondre");
  await page.getByRole("button", { name: "Annuler la réponse" }).click();
  const input = page.getByTestId("feed-comment-input");
  await input.fill("");
  await input.pressSequentially("@Le", { delay: 90 });
  await expect(page.getByTestId("feed-mention-suggestions")).toBeVisible({ timeout: 15_000 });
  await snap("feuille-arobase");
  await input.fill("");
  await page.getByTestId("feed-comment-more").first().click();
  await snap("menu-commentaire");
}

for (const theme of ["beton", "sable"]) {
  for (const [width, scale] of [
    [384, 1],
    [390, 1.3],
  ] as const) {
    test(`appli états ${theme} ${width} x${scale}`, async ({ browser }) => {
      test.skip(!APP || !STATES, "Appli : APP_URL et PHASE=apres");
      test.setTimeout(300_000);
      const { ctx, page } = await openApp(browser, theme, width, scale);
      await statesFor(page, `${theme}-${width}-x${String(scale).replace(".", "")}`, "appli");
      await ctx.close();
    });
  }
}

test("appli : commentaires coupés, aucun commentaire, erreur", async ({ browser }) => {
  test.skip(!APP || !STATES, "Appli : APP_URL et PHASE=apres");
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const { ctx, page } = await openApp(browser, "beton", 384, 1);
  await forceOff(page);
  await afterOpening(page);
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  const off = page.getByTestId("feed-card-feed_post").first();
  await off.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-off")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/appli-coupes-beton-384-x1.png` });
  await page.getByTestId("feed-comments-close").click();
  // Capture seulement : la lecture rend une page vide, puis une panne ; aucune écriture n'est faite.
  const target = await cardWith(page, "commented");
  const route = /\/feed-posts\/[^/]+\/comments(\?.*)?$/;
  await page.route(route, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  );
  await target.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-empty")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/appli-vide-beton-384-x1.png` });
  await page.getByTestId("feed-comments-close").click();
  await page.unroute(route);
  await page.route(route, (r) => r.fulfill({ status: 500, body: "{}" }));
  await target.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-list")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/appli-erreur-beton-384-x1.png` });
  await ctx.close();
});

test("appli : menu de l'auteur (publication à moi, simulée pour la capture)", async ({ browser }) => {
  test.skip(!APP || !STATES, "Appli : APP_URL et PHASE=apres");
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const { ctx, page } = await openApp(browser, "beton", 384, 1);
  // Capture seulement : la réponse du Fil marque la première publication « à moi » ; aucune écriture n'est faite.
  await page.route(/\/api\/fil\?/, async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const first = (json.items ?? []).find((c: { kind: string }) => c.kind === "feed_post");
    if (first) first.payload.post.mine = true;
    await route.fulfill({ response: res, json });
  });
  await page.reload();
  await afterOpening(page);
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId("feed-card-feed_post").first();
  await card.getByTestId("feed-post-comment").click();
  await page.getByTestId("feed-comments-menu").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/appli-menu-auteur-beton-384-x1.png` });
  await ctx.close();
});

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`site états ${theme} ${width}`, async ({ page }) => {
      test.skip(!STATES, "PHASE=apres");
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
      await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
      await statesFor(page, `${theme}-${width}`, "site");
      if (theme === "beton") {
        await page.getByTestId("feed-comments-close").click();
        await forceOff(page);
        await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
        const off = page.getByTestId("feed-card-feed_post").first();
        await off.getByTestId("feed-post-comment").click();
        await expect(page.getByTestId("feed-comments-off")).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${DIR}/site-coupes-${theme}-${width}.png` });
      }
    });
  }
}
