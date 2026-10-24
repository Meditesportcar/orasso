import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { r1Events } from "./helpers/lotr1";
import { RELAIS } from "./relais";

// Lot R1 (retours de Damien du 24/10), côté site (le site raccord) : « Médite » trouve les événements de MéditeSportCar,
// un événement terminé n'est plus dans l'Explorer (liste et carte), le choix de l'Explorer reste (cookie de
// préférence : une arrivée sans réglage le reprend ; jamais la position) et plus de stations à l'Accueil.
// Béton et Sable, 390 et 1 280 px. Lancer avec l'API et le site sur la base seedée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r1-captures/site`;
const DESKTOP = { width: 1280, height: 900 } as const;
const SIZES = [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

test("site : « Médite », événements terminés, choix gardé, plus de stations", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const { over, running } = await r1Events(damien);

  for (const theme of ["beton", "sable"] as const) {
    for (const [size, viewport] of SIZES) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");

      // « Médite » (organisateur), sans accents ni casse.
      const tiles = page.getByTestId("event-tile");
      for (const q of ["Médite", "medite"]) {
        await page.goto(`/app/explorer?segment=evenements&q=${encodeURIComponent(q)}`);
        await expect(tiles.first()).toBeVisible();
        for (const text of await tiles.allTextContents()) expect(text, `q=${q}`).toContain("MéditeSportCar");
      }
      await shot(page, `explorer-medite-${theme}-${size}`);

      // Terminé il y a une heure : plus là, ni en liste ni sur la carte ; en cours (plusieurs jours) : là.
      await page.goto(`/app/explorer?segment=evenements&q=${encodeURIComponent(over.title)}`);
      await expect(page.getByText(over.title)).toHaveCount(0);
      await page.goto(`/app/explorer?segment=evenements&vue=carte&q=${encodeURIComponent(over.title)}`);
      await expect(page.getByText(over.title)).toHaveCount(0);
      await page.goto(`/app/explorer?segment=evenements&q=${encodeURIComponent(running.title)}`);
      await expect(tiles.filter({ hasText: running.title })).toHaveCount(1);

      // Le choix reste : une arrivée sans réglage reprend le dernier (tri, « Où chercher ? », filtres).
      // (Lot R2 : « Ailleurs » et le tri « Places restantes », lus dans les pastilles.)
      await page.goto("/app/explorer?segment=evenements&tri=seats&autour=ailleurs&ailleurs=11");
      await expect(page.getByTestId("sort-open")).toContainText("Places restantes");
      await page.goto("/app");
      await page.goto("/app/explorer");
      await expect(page).toHaveURL(/tri=seats/);
      await expect(page).toHaveURL(/autour=ailleurs/);
      await expect(page).toHaveURL(/ailleurs=11/);
      await expect(page.getByTestId("sort-open")).toContainText("Places restantes");
      await expect(page.getByTestId("around-open")).toContainText("(11)");
      await shot(page, `explorer-choix-garde-${theme}-${size}`);
      const audit = await auditPage(page);
      expect(audit.greens).toEqual([]);
      expect(audit.horizontalScroll).toBe(false);

      // « Autour de moi » : le mode reste, jamais la position.
      await page.goto("/app/explorer?segment=evenements&autour=moi&lat=42.7&lng=2.9&tri=distance");
      const kept = (await ctx.cookies()).find((c) => c.name === "orasso-explorer")?.value ?? "";
      expect(decodeURIComponent(kept)).toContain("autour=moi");
      expect(decodeURIComponent(kept)).not.toMatch(/lat|lng|42\.7|2\.9/);
      await page.goto("/app/explorer");
      await expect(page).toHaveURL(/autour=moi/);
      await expect(page).not.toHaveURL(/lat=|lng=/);

      // Une recherche du haut (texte seul) ne change pas le choix ; « Réinitialiser » le remet à zéro.
      await page.goto("/app/explorer?q=Rivesaltes");
      await page.goto("/app/explorer");
      await expect(page).toHaveURL(/autour=moi/);
      await page.goto("/app/explorer?segment=evenements");
      await page.goto("/app/explorer");
      await expect(page).toHaveURL(/\/app\/explorer\?segment=evenements$/);

      // Tour 2 : pas de dates absolues dans le choix gardé (« À partir du » d'aujourd'hui).
      const today = new Date().toISOString().slice(0, 10);
      await page.goto(`/app/explorer?segment=evenements&tri=date&du=${today}`);
      await page.goto("/app/explorer");
      await expect(page).toHaveURL(/tri=date/);
      await expect(page).not.toHaveURL(/du=/);

      // Accueil : ni lavage ni carburant (blocs et réglages).
      await page.goto("/app");
      await expect(page.getByTestId("widget-favorite_garage")).toBeVisible();
      await expect(page.getByTestId("widget-wash")).toHaveCount(0);
      await expect(page.getByTestId("widget-fuel")).toHaveCount(0);
      await expect(page.getByTestId("reorder-wash")).toHaveCount(0);
      await expect(page.getByTestId("reorder-fuel")).toHaveCount(0);
      await shot(page, `accueil-sans-stations-${theme}-${size}`);

      // La déconnexion oublie le choix.
      await page.goto("/app/explorer?segment=pros");
      expect((await ctx.cookies()).find((c) => c.name === "orasso-explorer")).toBeDefined();
      await page.goto("/app/moi");
      await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
      await expect.poll(async () => (await ctx.cookies()).find((c) => c.name === "orasso-explorer")).toBeUndefined();
      await ctx.close();
    }
  }
});

test("site, tour 2 : le choix appartient au compte ; « Tous les formats » se restaure tel quel", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const kenji = await login("kenji@orasso.local");
  const before = await apiCall<{ eventFormats: string[] }>(kenji, "GET", "/me/preferences");
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  try {
    // Préférences restrictives (expositions seulement) : sans `format`, l'Explorer ne montre que des expositions.
    expect((await apiCall(kenji, "PATCH", "/me/preferences", { eventFormats: ["exhibition"] })).status).toBe(200);
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
    const tiles = page.getByTestId("event-tile");
    await page.goto("/app/explorer?segment=evenements&autour=partout&tri=date");
    await expect(tiles.first()).toBeVisible();
    const filtered = await tiles.count();
    // « Tous les formats » choisi : plus d'événements ; après un tour ailleurs, il revient tel quel.
    await page.goto("/app/explorer?segment=evenements&autour=partout&tri=date&format=all");
    await expect(tiles.first()).toBeVisible();
    const all = await tiles.count();
    expect(all).toBeGreaterThan(filtered);
    await page.goto("/app");
    await page.goto("/app/explorer");
    await expect(page).toHaveURL(/format=all/);
    await expect(tiles).toHaveCount(all);

    // Session de Kenji expirée (cookies de session effacés, celui du choix gardé), Damien se connecte sans déconnexion :
    // le choix de Kenji ne s'applique pas et s'efface.
    const keep = (await ctx.cookies()).filter((c) => c.name === "orasso-explorer");
    expect(keep).toHaveLength(1);
    await ctx.clearCookies();
    await ctx.addCookies(keep);
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
    await page.goto("/app/explorer");
    await expect(page).toHaveURL(/\/app\/explorer$/);
    await expect.poll(async () => (await ctx.cookies()).find((c) => c.name === "orasso-explorer")).toBeUndefined();
  } finally {
    await apiCall(kenji, "PATCH", "/me/preferences", { eventFormats: before.data.eventFormats });
    await ctx.close();
  }
});
