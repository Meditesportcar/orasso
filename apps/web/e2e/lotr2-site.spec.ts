import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R2 (maquette « Explorer R2 », validée par Damien le 24/10), côté site (le site raccord) : le même en-tête que
// l'appli dans les trois segments (segment, recherche, trois pastilles qui montrent leur valeur), les feuilles
// (« Où chercher ? », Trier, Filtres, « Quel métier ? », Montrer), la mémorisation du choix, la carte et sa frise des
// dates, les Pros (fiche uniforme, remise, métiers) et Personnes et crews sans annuaire (suggestions publiques,
// recherche, compte privé réduit). Béton et Sable, 390 et 1 280 px. Lancer avec l'API et le site sur la base seedée
// (Kenji_66, grade Route, chef de Roussillon Drift). Pas de date en dur : tout se lit sur la page.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r2-captures/site`;
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

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
}

/** Ouvre une feuille : le clic n'a d'effet qu'une fois la page hydratée, on le répète jusqu'à la fenêtre. */
async function openSheet(page: Page, pill: string, sheet: string) {
  await expect(async () => {
    await page.getByTestId(pill).click();
    await expect(page.getByTestId(sheet)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

const count = (text: string) => Number(/(\d+)/.exec(text)?.[1] ?? "0");

test("site : Explorer R2 (segments, pastilles, feuilles, mémoire, carte, pros, personnes et crews)", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });

  for (const theme of ["beton", "sable"] as const) {
    for (const [size, viewport] of SIZES) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      const tag = `${theme}-${size}`;

      // --- Événements : trois pastilles qui montrent leur valeur ---------------------------------------------------
      await page.goto("/app/explorer?segment=evenements");
      await expect(page.getByTestId("explorer-head")).toBeVisible({ timeout: 30_000 });
      for (const id of ["around-open", "sort-open", "filters-toggle"]) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId("sort-open")).toContainText("Par date");
      await expect(page.getByTestId("events-q")).toHaveAttribute(
        "placeholder",
        "Un événement, un organisateur, une ville",
      );
      // Réglages habituels : pastilles en contour (rien de choisi).
      await expect(page.getByTestId("around-open")).not.toHaveAttribute("data-set", "true");
      await expect(page.getByTestId("sort-open")).not.toHaveAttribute("data-set", "true");
      await expect(page.getByTestId("sort-line")).toContainText("à venir");
      await shot(page, `evenements-liste-${tag}`);
      await audit(page);

      // « Où chercher ? » : Autour de moi (curseur et temps de route), Mon coin, Ailleurs, Partout en France.
      await openSheet(page, "around-open", "where-sheet");
      for (const id of ["around-me", "around-mine", "around-elsewhere", "around-all"])
        await expect(page.getByTestId(id)).toBeVisible();
      await page.getByTestId("around-me").click();
      await expect(page.getByTestId("where-range")).toBeVisible();
      await page.getByTestId("where-range").fill("150");
      await expect(page.getByTestId("where-km")).toContainText("150 km");
      await expect(page.getByTestId("where-road")).toContainText("h de route");
      await shot(page, `evenements-ou-chercher-${tag}`);
      await page.getByTestId("around-elsewhere").click();
      await expect(page.getByTestId("around-dept")).toBeVisible();
      await page.getByTestId("around-dept").selectOption("11");
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/autour=ailleurs/);
      await expect(page.getByTestId("around-open")).toContainText("(11)");
      await expect(page.getByTestId("around-open")).toHaveAttribute("data-set", "true");
      await expect(page.getByTestId("sort-line")).toContainText("(11)");

      // Trier : appliqué au clic.
      await openSheet(page, "sort-open", "sort-sheet");
      for (const id of ["date", "distance", "recent", "seats"])
        await expect(page.getByTestId(`sort-${id}`)).toBeVisible();
      await page.getByTestId("sort-distance").click();
      await page.waitForURL(/tri=distance/);
      await expect(page.getByTestId("sort-open")).toContainText("Par distance");

      // Filtres : Format (Mes préférences / Tous / formats), Quand, Selon mes goûts (compte connecté).
      await openSheet(page, "filters-toggle", "filters-sheet");
      const filters = page.getByTestId("explorer-filters");
      await expect(filters).toContainText("Format");
      await expect(filters).toContainText("Selon mes goûts");
      await shot(page, `evenements-filtres-${tag}`);
      await filters.locator("label.ex-chip", { hasText: /^Ce week-end$/ }).click();
      await page.getByTestId("filters-apply").click();
      await page.waitForURL(/quand=weekend/);
      await expect(page.getByTestId("filters-toggle")).toHaveAttribute("data-set", "true");

      // Mémorisation : revenir sur /app/explorer reprend le choix (cookie de préférence), jamais la position.
      await page.goto("/app");
      await page.goto("/app/explorer");
      await expect(page).toHaveURL(/quand=weekend/);
      await expect(page).toHaveURL(/tri=distance/);
      await expect(page).toHaveURL(/ailleurs=11/);
      await expect(page).not.toHaveURL(/lat=|lng=/);
      await expect(page.getByTestId("around-open")).toContainText("(11)");

      // Revenir sur ses réglages habituels : « Mon coin » remet la pastille en contour.
      await openSheet(page, "around-open", "where-sheet");
      await page.getByTestId("around-mine").click();
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/autour=coin/);
      await expect(page.getByTestId("around-open")).not.toHaveAttribute("data-set", "true");

      // --- Carte : épingles datées en clair, frise des dates, mêmes pastilles sans tri --------------------------------
      await page.goto("/app/explorer?segment=evenements&autour=partout&vue=carte");
      await expect(page.getByTestId("events-map")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("map-dates")).toBeVisible();
      await expect(page.getByTestId("map-day-all")).toContainText("Toutes");
      await expect(page.getByTestId("sort-open")).toHaveCount(0);
      for (const id of ["around-open", "filters-toggle"]) await expect(page.getByTestId(id)).toBeVisible();
      const total = Number(await page.getByTestId("events-map").getAttribute("data-count"));
      expect(total).toBeGreaterThan(0);
      expect(count((await page.getByTestId("map-day-all").textContent()) ?? "")).toBe(total);
      const days = page.locator('[data-testid^="map-day-"]:not([data-testid="map-day-all"])');
      expect(await days.count()).toBeGreaterThan(0);
      const first = days.first();
      const dayCount = count((await first.locator(".o-t-caption").textContent()) ?? ""); // le nombre, pas la date du libellé
      // Choisir une date ne garde que ses épingles (le clic compte une fois la page hydratée).
      await expect(async () => {
        // Un second clic sur la même date la décocherait : on ne clique que si elle n'est pas déjà choisie.
        if ((await first.getAttribute("aria-pressed")) !== "true") await first.click();
        await expect(page.getByTestId("events-map")).toHaveAttribute("data-count", String(dayCount), {
          timeout: 1_000,
        });
      }).toPass({ timeout: 20_000 });
      await shot(page, `carte-${tag}`);
      await page.getByTestId("map-day-all").click();
      await expect(page.getByTestId("events-map")).toHaveAttribute("data-count", String(total));
      // Pas de légende.
      await expect(page.getByTestId("map-legend")).toHaveCount(0);
      await audit(page);

      // --- Pros : lieu commun, métier, fiche uniforme --------------------------------------------------------------
      await page.goto("/app/explorer?segment=pros&autour=partout");
      await expect(page.getByTestId("pros-segment")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("job-open")).toContainText("Métier");
      await expect(page.getByTestId("job-open")).toContainText("Tous");
      await expect(page.getByTestId("pro-sort-open")).toContainText("Par distance");
      await expect(page.getByTestId("events-q")).toHaveAttribute("placeholder", "Un pro, un métier, une ville");
      await expect(page.getByTestId("pros-line")).toContainText("les plus proches d'abord");
      const tiles = page.getByTestId("pro-tile");
      await expect(tiles.first()).toBeVisible();
      // Une ligne de remise sur chaque fiche (compte connecté), et toujours le nom en entier (un titre).
      expect(await page.getByTestId("pro-discount").count()).toBe(await tiles.count());
      await expect(page.getByTestId("pro-discount").first()).toContainText(/Pas encore de remise Orasso|−\d+ %/);
      await shot(page, `pros-liste-${tag}`);
      await audit(page);
      // Quel métier ? : 12 métiers et « Tous les métiers », un seul à la fois, appliqué au clic.
      await openSheet(page, "job-open", "job-sheet");
      await expect(page.getByTestId("job-sheet").locator("ul li")).toHaveCount(13);
      await shot(page, `pros-metier-${tag}`);
      await page.getByTestId("job-detailing").click();
      await page.waitForURL(/metier=detailing/);
      await expect(page.getByTestId("job-open")).toHaveAttribute("data-set", "true");
      await expect(tiles.first()).toBeVisible();
      await openSheet(page, "pro-sort-open", "pro-sort-sheet");
      await page.getByTestId("sort-name").click();
      await page.waitForURL(/tri=name/);
      await expect(page.getByTestId("pro-sort-open")).toContainText("Par nom");
      await page.goto("/app/explorer?segment=pros&autour=partout&vue=carte");
      await expect(page.getByTestId("pros-map")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("pro-sort-open")).toHaveCount(0);
      // Le segment reste gardé.
      await page.goto("/app/explorer?segment=pros");
      await page.goto("/app");
      await page.goto("/app/explorer");
      await expect(page).toHaveURL(/segment=pros/);

      // --- Personnes et crews : aucun annuaire ----------------------------------------------------------------------
      await page.goto("/app/explorer?segment=personnes");
      await expect(page.getByTestId("people-search")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("people-where-open")).toContainText("Mon coin");
      await expect(page.getByTestId("show-open")).toContainText("Montrer");
      await expect(page.getByTestId("show-open")).toContainText("Tout");
      await expect(page.getByTestId("people-filters")).toBeVisible();
      await expect(page.getByTestId("people-q")).toHaveAttribute("placeholder", "Un pseudo, un crew, un modèle…");
      // Sans texte ni filtre : jamais de liste de tout le monde, seulement des suggestions publiques.
      await expect(page.getByTestId("people-results")).toHaveCount(0);
      await expect(page.getByTestId("person-row")).toHaveCount(0);
      await expect(page.getByTestId("people-privacy")).toContainText("comptes publics");
      await expect(page.getByTestId("crew-new")).toHaveAttribute("href", "/app/crews");
      await expect(page.getByText("Amis de tes amis")).toHaveCount(0);
      await expect(page.getByText("Vus aux mêmes sorties")).toHaveCount(0);
      await shot(page, `personnes-${tag}`);
      await audit(page);

      // « Montrer » : appliqué au clic.
      await openSheet(page, "show-open", "show-sheet");
      await page.getByTestId("show-crews").click();
      await page.waitForURL(/montrer=crews/);
      await expect(page.getByTestId("show-open")).toContainText("Crews");
      await expect(page.getByTestId("suggest-same-model")).toHaveCount(0);

      // « Où chercher ? » : des départements seulement, jamais de position.
      await openSheet(page, "people-where-open", "people-where-sheet");
      await expect(page.getByTestId("around-me")).toHaveCount(0);
      await page.getByTestId("around-elsewhere").click();
      await page.getByTestId("around-dept").selectOption("11");
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/lieu=ailleurs/);
      await expect(page.getByTestId("people-where-open")).toContainText("(11)");
      await expect(page).not.toHaveURL(/lat=|lng=/);

      // Filtres : un grade (ne trouve que les comptes publics et les amis), puis les résultats, jamais un annuaire.
      await page.goto("/app/explorer?segment=personnes");
      await openSheet(page, "people-filters", "people-filters-sheet");
      await page
        .getByTestId("people-filters-panel")
        .locator("label.ex-chip", { hasText: /^Route$/ })
        .click();
      await page.getByTestId("people-filters-apply").click();
      await page.waitForURL(/grade=/);
      await expect(page.getByTestId("people-filters")).toHaveAttribute("data-set", "true");
      await expect(page.getByTestId("people-results")).toContainText("Personnes ·");

      // Une recherche : « Personnes · N » puis « Crews · N » ; un compte privé réduit, sans département.
      await page.goto("/app/explorer?segment=personnes");
      await page.getByTestId("people-q").fill("Marc_66");
      await page.getByTestId("search-submit").click();
      await page.waitForURL(/q=Marc_66/);
      const privateRow = page.getByTestId("people-results").getByTestId("person-row").filter({ hasText: "Marc_66" });
      await expect(privateRow).toContainText("Compte privé");
      await expect(privateRow).not.toContainText("Pyrénées-Orientales");
      await expect(page.getByTestId("crew-results")).toContainText("Crews ·");
      await expect(page.getByTestId("people-privacy")).toContainText("compte privé");
      await shot(page, `personnes-recherche-${tag}`);
      await audit(page);

      // Texte trop court : rien n'est cherché.
      await page.goto("/app/explorer?segment=personnes&q=a");
      await expect(page.getByText("Saisis au moins deux caractères.")).toBeVisible();
      await expect(page.getByTestId("person-row")).toHaveCount(0);

      // Un crew : « Roussillon Drift » est le crew de Kenji, il s'ouvre ; on ne propose pas de le rejoindre.
      await page.goto("/app/explorer?segment=personnes&q=drift");
      const crew = page.getByTestId("crew-results").getByTestId("crew-row").filter({ hasText: "Roussillon Drift" });
      await expect(crew).toBeVisible();
      await expect(crew).toContainText("ton crew");
      await expect(crew.getByTestId("crew-join")).toHaveCount(0);

      await ctx.close();
    }
  }
});
