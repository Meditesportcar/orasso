import { expect, type Locator, test } from "@playwright/test";
import { apiCall, loginInBrowser, MOBILE, SEED_PASSWORD, setTheme, signUpApi, unique } from "./helpers";

// Lot R8x (maquette R8.9, variante A), côté site : le haut compact de l'Explorer (onglets soulignés avec « Événements · N »,
// champ et bouton « Filtres » sur une ligne, puces serrées, plus de ligne de décompte) et la carte d'un événement (jauge
// et décompte, « Liste d'attente » à droite du décompte, rien en absolu). 390 et 1 280 px, Béton et Sable. Lancer avec
// l'API et le site sur la base seedée (Kenji ; le Rassemblement du Lydia est complet).
const DESKTOP = { width: 1280, height: 900 } as const;
test.use({ actionTimeout: 30_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox();
  if (!b) throw new Error("élément sans boîte");
  return b;
};
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

for (const [size, viewport] of [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const) {
  for (const theme of ["beton", "sable"] as const) {
    test(`site Explorer R8x : haut compact et carte (${theme}, ${size} px)`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize(viewport);
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      await page.goto("/app/explorer?segment=evenements&autour=partout");
      await expect(page.getByTestId("explorer-head")).toBeVisible({ timeout: 30_000 });

      // --- Onglets soulignés, « Événements · N » égal au nombre de cartes ---------------------------------------
      const tabs = page.getByTestId("explorer-segments");
      await expect(tabs).toHaveAttribute("role", "tablist");
      for (const id of ["evenements", "pros", "personnes"])
        await expect(page.getByTestId(`segment-${id}`)).toBeVisible();
      await expect(page.getByTestId("segment-evenements")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("segment-pros")).toHaveAttribute("aria-selected", "false");
      const tiles = page.getByTestId("event-tile");
      const label = await page.getByTestId("segment-evenements").innerText();
      const n = Number(/Événements · (\d+)/.exec(label)?.[1] ?? "NaN");
      expect(Number.isNaN(n)).toBe(false);
      if ((await page.getByRole("link", { name: "Voir plus" }).count()) === 0) expect(await tiles.count()).toBe(n);
      else expect(n).toBeGreaterThanOrEqual(await tiles.count());
      // Plus de ligne de décompte (le tri reste sur sa pastille).
      await expect(page.getByTestId("sort-line")).toHaveCount(0);
      await expect(page.getByTestId("sort-open")).toBeVisible();
      await expect(page.getByTestId("events-q")).toHaveAttribute("placeholder", "Événement, organisateur, ville");

      // --- Champ et bouton « Filtres » sur une ligne -------------------------------------------------------------
      const field = await box(page.getByTestId("events-q"));
      const filters = await box(page.getByTestId("filters-toggle"));
      expect(Math.abs(filters.y + filters.height / 2 - (field.y + field.height / 2))).toBeLessThan(14);
      expect(filters.x).toBeGreaterThan(field.x + field.width - 4);
      await expect(page.getByTestId("filters-toggle")).toHaveAttribute("aria-label", "Filtres");
      const pill = await box(page.getByTestId("around-open"));
      expect(pill.y).toBeGreaterThan(field.y + field.height - 1);
      expect(pill.height).toBeLessThanOrEqual(34);
      // Pas de défilement horizontal de la page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      // L'icône ouvre la feuille des filtres (la page est hydratée au bout de quelques clics).
      await expect(async () => {
        await page.getByTestId("filters-toggle").click();
        await expect(page.getByTestId("explorer-filters")).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
      await page.getByTestId("filters-sheet-close").click();

      // --- Événement complet : « Liste d'attente » à droite du décompte, rien par-dessus -------------------------
      const lydia = tiles.filter({ hasText: "Rassemblement du Lydia" }).first();
      await lydia.scrollIntoViewIfNeeded();
      await expect(lydia.getByTestId("event-waitlist")).toContainText("Liste d'attente");
      await expect(lydia.getByTestId("event-seats")).toHaveText("Complet");
      const wait = await box(lydia.getByTestId("event-waitlist"));
      const seats = await box(lydia.getByTestId("event-seats"));
      const tile = await box(lydia);
      expect(wait.x).toBeGreaterThanOrEqual(tile.x);
      expect(wait.x + wait.width).toBeLessThanOrEqual(tile.x + tile.width + 1);
      expect(overlap(wait, seats)).toBe(false);
      expect(wait.x).toBeGreaterThan(seats.x);
      for (const sel of [".w-card__title", ".w-card__org", ".w-card__format", ".w-card__poster"]) {
        const other = lydia.locator(sel).first();
        if (await other.count()) expect(overlap(wait, await box(other))).toBe(false);
      }
      // Un événement qui n'est pas complet n'a pas la puce.
      const open = tiles.filter({ hasNotText: "Rassemblement du Lydia" }).first();
      await expect(open.getByTestId("event-seats")).not.toContainText("Complet");
    });
  }
}

test("site Explorer R8x : Pros et Personnes et crews gardent leur contenu sous les mêmes onglets", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(MOBILE);
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await page.goto("/app/explorer?segment=pros");
  await expect(page.getByTestId("segment-pros")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("job-open")).toBeVisible();
  await expect(page.getByTestId("pro-sort-open")).toBeVisible();
  await page.goto("/app/explorer?segment=personnes");
  await expect(page.getByTestId("segment-personnes")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("people-filters")).toHaveAttribute("aria-label", "Filtres");
  await expect(page.getByTestId("people-q")).toBeVisible();
});

for (const [size, viewport] of [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const) {
  test(`site Explorer R8x : 20 départements, la pastille « Mon coin » ne fait pas déborder (${size} px)`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const pseudo = `Coin20_${unique()}`;
    const cookie = await signUpApi(pseudo);
    await apiCall(cookie, "PATCH", "/me/profile", {
      departments: Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0")),
    });
    await page.setViewportSize(viewport);
    await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, "/app");
    await page.goto("/app/explorer?segment=evenements");
    const pill = page.getByTestId("around-open");
    await expect(pill).toContainText("20 départements", { timeout: 30_000 });
    const b = await box(pill);
    expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test("site Explorer R8x : le décompte « Complet » suit le reste de places (journées limitées, capacité générale absente)", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await page.goto("/app/explorer?segment=evenements&autour=partout");
  const seats = page.getByTestId("event-seats");
  await expect(seats.first()).toBeVisible({ timeout: 30_000 });
  // Jamais « Complet · N exposants » sur le site (N n'est pas un effectif fiable) ; la puce suit « Complet ».
  for (const text of await seats.allInnerTexts()) expect(text).not.toMatch(/Complet ·/);
  const tiles = page.getByTestId("event-tile");
  for (let i = 0; i < (await tiles.count()); i++) {
    const t = tiles.nth(i);
    const complet = (await t.getByTestId("event-seats").innerText()) === "Complet";
    expect(await t.getByTestId("event-waitlist").count()).toBe(complet ? 1 : 0);
  }
});
