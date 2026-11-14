import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, createEvent, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot B3b (appli) : la carte d'un événement d'une page suivie dit « Événement d'un abonnement · demain », jamais « Nouveauté »
// ni « à l'instant », à 384 px (Pixel 10 Pro XL), police ×1 et ×1,3, Béton et Sable ; le texte de la ligne tient sur l'écran.
// Lancer avec APP_URL (version compilée, scripts/appli-compilee.mjs) ; CAPTURES=1 pour les captures (CAPTURES_DIR).
const APP = process.env.APP_URL;
test.skip(!APP, "Lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "default" });

const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-b3b-captures/appli`;
const SHOTS = Boolean(process.env.CAPTURES);
if (SHOTS) mkdirSync(DIR, { recursive: true });

async function open(browser: Browser, opts: { scale: number; theme: "beton" | "sable"; email: string }) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 900 }, baseURL: APP });
  await ctx.route(/(openfreemap|openstreetmap)\.org/, (route) => route.abort());
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", String(t));
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [opts.theme, opts.scale],
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
  await page.getByLabel("E-mail").fill(opts.email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
  return { ctx, page };
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
};

for (const [scale, theme] of [
  [1, "beton"],
  [1.3, "beton"],
  [1.3, "sable"],
] as const) {
  test(`Fil : carte « Événement d'un abonnement · demain » à 384 px, police ×${scale}, ${theme}`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const damien = await login("damien@orasso.local");
    const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
    const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId ?? "";
    const event = await createEvent(damien, { title: `Sortie B3b ${scale} ${theme} ${Date.now().toString(36)}` });
    const kenji = await login("kenji@orasso.local");
    expect([204, 409]).toContain((await apiCall(kenji, "POST", `/structures/${structureId}/follow`)).status);

    const { ctx, page } = await open(browser, { scale, theme, email: "kenji@orasso.local" });
    try {
      await visit(page, "/fil");
      await page.getByTestId("fil-filters-following").click();
      await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
      const card = page.getByTestId("feed-card-event_recommended").filter({ hasText: event.title });
      await expect(card).toHaveCount(1, { timeout: 30_000 });
      const reason = card.getByTestId("feed-card-reason");
      await expect(reason).toHaveText("Événement d'un abonnement · demain");
      await expect(reason).not.toContainText("Nouveauté");
      await expect(reason).not.toContainText("à l'instant");
      // Aucune carte d'événement du Fil ne dit « à l'instant » (les événements plus lointains disent leur date).
      await expect(
        page
          .getByTestId("feed-card-event_recommended")
          .getByTestId("feed-card-reason")
          .filter({ hasText: "à l'instant" }),
      ).toHaveCount(0);
      await card.scrollIntoViewIfNeeded();
      // La ligne de raison tient dans l'écran de 384 px.
      const box = await reason.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(384);
      await shot(page, `fil-evenement-abonnement-${theme}-384-x${String(scale).replace(".", "")}`);
    } finally {
      await ctx.close();
    }
  });
}
