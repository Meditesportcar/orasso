import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, login, MOBILE, setTheme, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R5d (maquette R5.11), côté site : la fiche de l'événement, section « Accès et adresse », « Y aller » avec Google
// Maps et Waze (liens qui s'ouvrent dans un nouvel onglet), pas de distance (le site ne demande jamais la position).
// Béton et Sable, 390 et 1 280 px. `R5D_PHASE=avant` : captures seules.
// Lancer avec l'API et le site sur la base seedée.
const PHASE = process.env.R5D_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5d-captures/site-${PHASE}`;
const AFTER = PHASE !== "avant";
const DESKTOP = { width: 1280, height: 900 } as const;
const SIZES = [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const;

async function eventIn(cookie: string, days: number, title: string) {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(cookie, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(18, 0, 0, 0);
  const created = await apiCall<{ id: string; slug: string }>(cookie, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 5 * 3600_000).toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car"],
    capacity: 40,
    maxVehiclesPerUser: 1,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Départs au pas, aucun burn.",
    description: "Événement de recette du lot R5d (site).",
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  expect((await apiCall(cookie, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return created.data;
}

test("Lot R5d (site) : « Y aller » sous l'adresse, sans distance", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const event = await eventIn(damien, 10, `R5d Site ${unique()}`.slice(0, 34));
  for (const theme of ["beton", "sable"] as const) {
    for (const [label, viewport] of SIZES) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await page.goto(`/e/${event.slug}`);
      const section = page.getByRole("heading", { name: "Accès et adresse" });
      await expect(section).toBeVisible();
      if (AFTER) {
        const go = page.getByTestId("event-go");
        await expect(go).toBeVisible();
        const maps = page.getByTestId("event-go-maps");
        const waze = page.getByTestId("event-go-waze");
        await expect(maps).toHaveAttribute(
          "href",
          /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=42\.6988%2C3\.0334$/,
        );
        await expect(maps).toHaveAttribute("target", "_blank");
        await expect(maps).toHaveAttribute("rel", /noopener/);
        await expect(waze).toHaveAttribute("href", "https://waze.com/ul?ll=42.6988,3.0334&navigate=yes");
        await expect(waze).toHaveAttribute("target", "_blank");
        // Le site ne demande jamais la position : pas de distance, pas de bouton.
        await expect(page.getByTestId("event-distance")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const h = [...document.querySelectorAll("h2")].find((e) => e.textContent === "Accès et adresse");
        h?.scrollIntoView({ block: "start" });
        window.scrollBy(0, -110);
      });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${DIR}/fiche-acces-${theme}-${label}.png` });
      await ctx.close();
    }
  }
});
