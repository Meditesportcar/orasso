import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { MOBILE, setTheme } from "./helpers";

// Lot 44, côté site : les trois cartes (liste des événements, liste des pros, page d'un événement) au style Orasso,
// qui suivent le thème (Béton, Sable) ; glyphes Archivo étroit servis par le site ; repli raster quand OpenFreeMap ne
// répond pas (source coupée par Playwright). Captures à 390 px dans le relais.
// Prérequis : API et site lancés sur la base seedée ; accès à tiles.openfreemap.org.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-44-captures/site";
const THEMES = ["beton", "sable"] as const;

/** La carte est rendue (canvas MapLibre) avec le style attendu. */
async function mapReady(page: Page, testId: string, style: string) {
  const map = page.getByTestId(testId);
  await map.scrollIntoViewIfNeeded();
  await expect(map).toHaveAttribute("data-map-style", style, { timeout: 30_000 });
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
  return map;
}

/** Audit du système ; les marqueurs de carte (étiquettes datées, pastilles) sont des boutons sans pictogramme. */
async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.neonAccent).toBeLessThanOrEqual(1);
}

test("les trois cartes du site suivent le thème, glyphes du site, marqueurs v2", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    const glyphs: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/map-fonts/")) glyphs.push(`${r.status()} ${decodeURIComponent(r.url())}`);
    });

    await page.goto("/evenements");
    const events = await mapReady(page, "events-map", `orasso-${theme}`);
    await expect(events.locator('[data-testid="map-marker"], [data-testid="map-cluster"]').first()).toBeVisible();
    await expect(events).toContainText("OpenFreeMap");
    await expect.poll(() => glyphs.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(glyphs.every((g) => g.startsWith("200") && g.includes("/map-fonts/Archivo Narrow/"))).toBe(true);
    await page.waitForTimeout(1500);
    await audit(page);
    await events.screenshot({ path: `${DIR}/carte-evenements-${theme}.png` });

    await page.goto("/pros");
    const pros = await mapReady(page, "pros-map", `orasso-${theme}`);
    await page.waitForTimeout(1500);
    await audit(page);
    await pros.screenshot({ path: `${DIR}/carte-pros-${theme}.png` });

    await page.goto("/e/nocturne-de-canet-2026");
    const one = await mapReady(page, "event-map", `orasso-${theme}`);
    await expect(one.locator('[data-testid="map-marker"]')).toHaveCount(1);
    await page.waitForTimeout(1500);
    await audit(page);
    await one.screenshot({ path: `${DIR}/carte-evenement-${theme}.png` });
    await ctx.close();
  }
});

test("repli : OpenFreeMap coupé → tuiles raster OpenStreetMap", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await setTheme(page, "sable");
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("[carte]")) warnings.push(m.text());
  });
  await page.goto("/evenements");
  await mapReady(page, "events-map", "orasso-sable-raster");
  expect(warnings.join(" ")).toContain("repli raster OSM");
  await page.getByTestId("events-map").screenshot({ path: `${DIR}/carte-repli-raster-sable.png` });
  await ctx.close();
});
