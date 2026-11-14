import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, createEvent, login, loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot B3b, côté site (API et site lancés sur la base seedée) :
//  - la carte d'un événement d'une page suivie dit « Événement d'un abonnement · demain » (jamais « Nouveauté », jamais « à l'instant ») ;
//  - la barre de l'espace connecté montre le monogramme sous 290 px, le logotype au-delà, sans défilement horizontal.
// Captures : CAPTURES=1 (CAPTURES_DIR pour le dossier).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-b3b-captures/site`;
const SHOTS = Boolean(process.env.CAPTURES);
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string, fullPage = false) {
  if (!SHOTS) return;
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function loaded(page: Page) {
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty"))).toBeVisible({ timeout: 30_000 });
}

for (const theme of ["beton", "sable"] as const) {
  test(`la carte d'un événement d'une page suivie dit « Événement d'un abonnement · demain » (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const damien = await login("damien@orasso.local");
    const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
    const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId ?? "";
    // Un événement demain 18 h, publié à l'instant : « carte chaude » (la date de la carte est celle du parcours).
    const event = await createEvent(damien, { title: `Sortie B3b ${theme} ${Date.now().toString(36)}` });
    const kenji = await login("kenji@orasso.local");
    const followed = await apiCall(kenji, "POST", `/structures/${structureId}/follow`);
    expect([204, 409]).toContain(followed.status);

    await setTheme(page, theme);
    await page.setViewportSize({ width: 430, height: 900 });
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil?filtre=following");
    await loaded(page);
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
    await shot(page, `fil-evenement-abonnement-${theme}`);
  });
}

for (const [width, theme] of [
  [280, "beton"],
  [280, "sable"],
  [320, "beton"],
] as const) {
  test(`barre de l'espace connecté à ${width} px (${theme}) : ${width < 290 ? "monogramme" : "logotype"}, sans défilement horizontal`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await setTheme(page, theme);
    await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar/page");
    await expect(page.getByTestId("owner-page")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const logo = page.locator(".o-appbar--tab .o-appbar__logo");
    const mark = page.locator(".o-appbar--tab .o-appbar__monogram");
    // Une version de chaque image est affichée (fond sombre) ; l'autre est cachée par le thème.
    const shown = async (loc: ReturnType<Page["locator"]>) =>
      loc.evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length);
    if (width < 290) {
      expect(await shown(mark)).toBe(1);
      expect(await shown(logo)).toBe(0);
      const box = await mark.locator("visible=true").boundingBox();
      expect(Math.round(box?.width ?? 0)).toBe(30);
    } else {
      expect(await shown(logo)).toBe(1);
      expect(await shown(mark)).toBe(0);
      const box = await logo.locator("visible=true").boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(100);
    }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    await shot(page, `barre-${width}-${theme}`);
  });
}
