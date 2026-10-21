import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { EventWeather } from "@orasso/shared";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, loginInBrowser } from "./helpers";
import { RELAIS } from "./relais";

// Météo (lot 59a). API ET Playwright : WEATHER_PROVIDER=open-meteo et
// METEO_URL=http://127.0.0.1:<METEO_STUB_PORT>/v1/forecast (METEO_STUB_PORT : 18591 par défaut, un port par lot). Cette spec sert le stub et rafraîchit
// réellement le cache de Nocturne ; la météo du Salon Argelès reste celle du seed. Aucun fournisseur Internet.
// Captures dans les deux thèmes, au
// bureau et sur téléphone (390 px) : `CAPTURES=1 pnpm --filter @orasso/web exec playwright test meteo`.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-28-captures`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const NOCTURNE = "nocturne-de-canet-2026";

type EventOrganizerLite = { id: string; outlook: "maintained" | "uncertain"; startsAt: string; endsAt: string };

let stub: Server | undefined;
let unavailable = false;
let calls = 0;
let fixture: unknown;

// Sans le stub déclaré dans l'environnement (API et Playwright), la spec ne sort pas sur le réseau : elle est ignorée.
test.skip(
  !process.env.METEO_URL,
  "Météo : poser WEATHER_PROVIDER=open-meteo et METEO_URL=http://127.0.0.1:<port>/v1/forecast (API et Playwright), METEO_STUB_PORT = ce port",
);
const STUB_PORT = Number(process.env.METEO_STUB_PORT ?? 18591);

test.beforeAll(async () => {
  const endpoint = new URL(process.env.METEO_URL ?? "http://configuration-manquante.invalid");
  expect(endpoint.protocol, "stub HTTP local obligatoire").toBe("http:");
  expect(endpoint.hostname, "METEO_URL doit viser le stub sur 127.0.0.1").toBe("127.0.0.1");
  expect(endpoint.port, "METEO_URL doit porter le port de METEO_STUB_PORT (18591 par défaut)").toBe(String(STUB_PORT));
  const event = await nocturne(await login("damien@orasso.local"));
  // Jours du seed, sans date fixe ; midi UTC évite les changements d'heure pour cette liste calendaire.
  const date = (at: string) => new Date(at).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const first = new Date(`${date(event.startsAt)}T12:00:00Z`);
  const last = date(event.endsAt);
  const days: string[] = [];
  for (let d = first; d.toISOString().slice(0, 10) <= last; d = new Date(d.getTime() + 86_400_000)) {
    days.push(d.toISOString().slice(0, 10));
  }
  fixture = {
    daily: {
      time: days,
      weather_code: days.map(() => 63),
      temperature_2m_max: days.map(() => 18),
      temperature_2m_min: days.map(() => 14),
      precipitation_probability_max: days.map(() => 75),
      precipitation_sum: days.map(() => 6.5),
      wind_speed_10m_max: days.map(() => 38),
    },
    hourly: { time: [] }, // Le résumé journalier suffit ; parser et stockage réels restent exercés.
  };
  stub = createServer((req, res) => {
    if (new URL(req.url ?? "/", endpoint).pathname !== endpoint.pathname) {
      res.writeHead(404).end();
      return;
    }
    calls++;
    res.writeHead(unavailable ? 503 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(unavailable ? { error: "fournisseur indisponible" } : fixture));
  });
  await new Promise<void>((resolve, reject) => {
    stub?.once("error", reject);
    stub?.listen(STUB_PORT, endpoint.hostname, resolve);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!stub?.listening) {
      resolve();
      return;
    }
    stub.close((error) => (error ? reject(error) : resolve()));
  });
});

test.beforeEach(async () => {
  unavailable = false;
  const damien = await login("damien@orasso.local");
  const event = await nocturne(damien);
  const before = calls;
  const result = await apiCall(damien, "POST", `/dev/weather/${event.id}/refresh`);
  expect(result.status, "API lancée avec METEO_URL et WEATHER_PROVIDER=open-meteo").toBe(200);
  expect(result.data).toMatchObject({ refreshed: 1 });
  expect(calls).toBeGreaterThan(before);
});

test.afterEach(() => {
  unavailable = false;
});

async function nocturne(cookie: string) {
  const pub = await apiCall<{ id: string }>(cookie, "GET", `/events/by-slug/${NOCTURNE}`);
  const full = await apiCall<EventOrganizerLite>(cookie, "GET", `/events/${pub.data.id}`);
  return full.data;
}

test("météo : page événement, bandeau « Incertain » de l'équipe organisatrice, carte d'accès, passage en Incertain", async ({
  page,
}) => {
  const damien = await login("damien@orasso.local");
  // État de départ : maintenu (le test change le statut).
  const start = await nocturne(damien);
  if (start.outlook !== "maintained") {
    await apiCall(damien, "PATCH", `/events/${start.id}/outlook`, { outlook: "maintained" });
  }

  // Public : « Météo prévue sur place le jour J » (lot 36) avec l'attribution.
  const api = await apiCall<{ attribution: string; summary: { code: string } } | null>(
    null,
    "GET",
    `/events/by-slug/${NOCTURNE}/weather`,
  );
  expect(api.data).toMatchObject({ attribution: "Météo : Open-Meteo", summary: { code: "rain" } });
  await page.goto(`/e/${NOCTURNE}`);
  const block = page.getByTestId("event-weather");
  await expect(block).toBeVisible();
  await expect(block.getByText("Météo prévue sur place le jour J")).toBeVisible();
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

test("fournisseur en panne : ancienne prévision conservée, page toujours utilisable", async ({ page }) => {
  const damien = await login("damien@orasso.local");
  const event = await nocturne(damien);
  const path = `/events/by-slug/${NOCTURNE}/weather`;
  const before = await apiCall<EventWeather>(null, "GET", path);
  const count = calls;
  unavailable = true;
  const result = await apiCall(damien, "POST", `/dev/weather/${event.id}/refresh`);
  expect(result.status).toBe(200);
  expect(result.data).toEqual({ refreshed: 0, suggested: 0 });
  expect(calls).toBeGreaterThan(count);
  expect((await apiCall<EventWeather>(null, "GET", path)).data).toEqual(before.data);
  await page.goto(`/e/${NOCTURNE}`);
  await expect(page.getByTestId("event-weather")).toBeVisible();
  await expect(page.getByTestId("weather-details")).toContainText("Pluie 75 %");
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
