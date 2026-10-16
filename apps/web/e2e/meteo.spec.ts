import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, loginInBrowser } from "./helpers";

// Météo (lot 28). Prérequis : base locale avec le seed (prévisions factices : « Nocturne de Canet » mauvaise,
// « Salon Argelès » bonne) et `WEATHER_PROVIDER=off` (aucun appel à un fournisseur). Captures dans les deux thèmes, au
// bureau et sur téléphone (390 px) : `CAPTURES=1 pnpm --filter @orasso/web exec playwright test meteo`.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-28-captures";
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const NOCTURNE = "nocturne-de-canet-2026";

type EventOrganizerLite = { id: string; outlook: "maintained" | "uncertain" };

async function nocturne(cookie: string) {
  const pub = await apiCall<{ id: string }>(cookie, "GET", `/events/by-slug/${NOCTURNE}`);
  const full = await apiCall<EventOrganizerLite>(cookie, "GET", `/events/${pub.data.id}`);
  return full.data;
}

test("météo : page événement, bandeau « Incertain » de l'organisateur, carte d'accès, passage en Incertain", async ({
  page,
}) => {
  const damien = await login("damien@orasso.local");
  // État de départ : maintenu (le test change le statut).
  const start = await nocturne(damien);
  if (start.outlook !== "maintained") {
    await apiCall(damien, "PATCH", `/events/${start.id}/outlook`, { outlook: "maintained" });
  }

  // Public : « Météo à l'approche » avec l'attribution.
  const api = await apiCall<{ attribution: string; summary: { code: string } } | null>(
    null,
    "GET",
    `/events/by-slug/${NOCTURNE}/weather`,
  );
  expect(api.data).toMatchObject({ attribution: "Météo : Open-Meteo", summary: { code: "rain" } });
  await page.goto(`/e/${NOCTURNE}`);
  const block = page.getByTestId("event-weather");
  await expect(block).toBeVisible();
  await expect(block.getByText("Météo à l'approche")).toBeVisible();
  await expect(block.getByTestId("weather-attribution")).toHaveText("Météo : Open-Meteo");
  await expect(block.getByTestId("weather-details")).toContainText("Pluie 75 %");

  // Carte d'accès : Kenji est retenu au Salon Argelès (aujourd'hui, jour J).
  await loginInBrowser(page, "kenji@orasso.local");
  await expect(page.getByTestId("application-weather").first()).toBeVisible();
  await expect(page.getByTestId("application-weather").first().getByTestId("weather-attribution")).toHaveText(
    "Météo : Open-Meteo",
  );

  // Organisateur : bandeau de suggestion, bouton « Passer en Incertain ».
  await page.context().clearCookies();
  await loginInBrowser(page, "damien@orasso.local", undefined, `/orga/meditesportcar/e/${start.id}`);
  await expect(page.getByTestId("orga-weather")).toBeVisible();
  const suggestion = page.getByTestId("weather-suggestion");
  await expect(suggestion).toContainText("Météo annoncée mauvaise : passer en Incertain");
  await suggestion.getByRole("button", { name: "Passer en Incertain" }).click();
  await expect(page.getByTestId("weather-suggestion")).toHaveCount(0);
  await expect.poll(async () => (await nocturne(damien)).outlook).toBe("uncertain");

  // Remise à l'état de départ.
  await apiCall(damien, "PATCH", `/events/${start.id}/outlook`, { outlook: "maintained" });
});

// --- Captures (CAPTURES=1) ----------------------------------------------------------------------------------------
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;
const audits: Record<string, Audit> = {};

async function context(browser: Browser, theme: string, view: (typeof VIEWS)[number], cookie?: string) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const cookies = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of (cookie ?? "").split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: WEB });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function shot(page: Page, theme: string, view: string, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

test("captures de la météo", async ({ browser }) => {
  test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const kenji = await login("kenji@orasso.local");
  const start = await nocturne(damien);
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const anon = await (await context(browser, theme, view)).newPage();
      await anon.goto(`/e/${NOCTURNE}`);
      await anon.getByTestId("event-weather").scrollIntoViewIfNeeded();
      await shot(anon, theme, view.id, "01-page-evenement-meteo");
      await anon.context().close();

      const orga = await (await context(browser, theme, view, damien)).newPage();
      await orga.goto(`/orga/meditesportcar/e/${start.id}`);
      await orga.getByTestId("orga-weather").scrollIntoViewIfNeeded();
      await shot(orga, theme, view.id, "02-orga-suggestion-incertain");
      await orga.context().close();

      const fan = await (await context(browser, theme, view, kenji)).newPage();
      await fan.goto("/app/acces");
      await fan.getByTestId("application-weather").first().scrollIntoViewIfNeeded();
      await shot(fan, theme, view.id, "03-carte-d-acces-j-1");
      await fan.context().close();
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  // Règles du système de design : pas de vert, rien de tronqué, pas de défilement horizontal, une icône par bouton.
  for (const [name, a] of Object.entries(audits)) {
    expect(a.greens, name).toEqual([]);
    expect(a.truncated, name).toEqual([]);
    expect(a.buttonsWithoutIcon, name).toEqual([]);
    expect(a.horizontalScroll, name).toBe(false);
  }
});
