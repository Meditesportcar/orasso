import { mkdirSync } from "node:fs";
import { proActivityLabels } from "@orasso/shared";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { MOBILE, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R2 (refonte de l'Explorer, maquette « Explorer R2 »), côté appli (version web compilée), connecté en Kenji (seed) :
//   - la bande ORASSO reste en haut de l'Explorer, en liste comme en carte ;
//   - les trois segments (Événements, Pros, Personnes et crews), chacun avec sa recherche et ses trois pastilles ;
//   - les feuilles : Où chercher ? (Mon coin, Ailleurs → un département, Partout en France, retour à Mon coin = pastille
//     en contour, Autour de moi = le curseur de distance), Trier, Filtres, Quel métier ?, Trier les pros, et pour Personnes
//     et crews Où chercher ?, Montrer, Filtres ;
//   - la mémorisation par compte : après un rechargement, le segment, le lieu, le tri et le métier restent ;
//   - Personnes et crews sans annuaire : rien de listé sans recherche hors des suggestions, une recherche (« su »), une
//     phrase claire quand personne ne correspond ;
//   - la carte dans l'onglet : bascule Liste | Carte, frise des dates (une date ne garde que ses épingles et montre une
//     fiche), ni légende ni recherche sur la carte.
// Béton et Sable, 390 px. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r2-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
const JOB = "detailing" as const;

async function open(browser: Browser, theme: Theme) {
  // Pas de permission de position : les réglages habituels sont Mon coin (accordée, ils seraient « À 50 km de moi »).
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

/** La demande de position est un bandeau du corps de l'écran : on la range pour des captures et des mesures nettes. */
async function dismissAsk(page: Page) {
  const later = page.getByText("Plus tard", { exact: true });
  if (await later.isVisible().catch(() => false)) await later.click();
}

const pill = (page: Page, id: string) => page.getByTestId(id);
const fond = (loc: Locator) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
/** Pastille « choisie » (encre) ou « habituelle » (contour) : son fond est celui du segment actif (l'encre) ou non. */
const selected = async (page: Page, id: string) =>
  (await fond(pill(page, id))) === (await fond(page.locator('[data-testid^="segment-"][aria-selected="true"]')));

async function setWhere(page: Page, choice: "mine" | "all" | { dept: string }) {
  await pill(page, "around-open").click();
  await expect(page.getByTestId("around-sheet")).toBeVisible();
  if (choice === "mine") await page.getByTestId("around-mine").click();
  else if (choice === "all") await page.getByTestId("around-all").click();
  else {
    await page.getByTestId("around-elsewhere").click();
    await page.getByTestId("around-find").fill(choice.dept);
    await page.getByRole("radio", { name: new RegExp(`^${choice.dept} · `) }).click();
  }
  await page.getByTestId("where-apply").click();
  await expect(page.getByTestId("around-sheet")).toHaveCount(0);
}

test("Explorer R2 : segments, feuilles, mémorisation, Personnes et crews sans annuaire, carte à frise", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const errors: string[] = [];

  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await signIn(page, "kenji@orasso.local");
    await goto(page, "/explorer");
    await dismissAsk(page);

    // --- Événements : la bande ORASSO en haut, le segment, la recherche, trois pastilles ------------------------------
    await expect(page.getByTestId("topbar-logo").first()).toBeVisible({ timeout: 30_000 });
    for (const id of ["segment-evenements", "segment-pros", "segment-personnes"])
      await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("segment-evenements")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("events-q")).toBeVisible();
    for (const id of ["around-open", "sort-open", "filters-toggle"]) await expect(pill(page, id)).toBeVisible();
    await expect(page.getByTestId("sort-line")).toContainText("à venir", { timeout: 30_000 });
    await expect(page.getByTestId("event-row").first()).toBeVisible({ timeout: 30_000 });
    // Réglages habituels : Mon coin, par date ; tous en contour.
    await expect(pill(page, "around-open")).toContainText("Mon coin");
    await expect(pill(page, "sort-open")).toContainText("Par date");
    expect(await selected(page, "around-open")).toBe(false);
    expect(await selected(page, "sort-open")).toBe(false);
    // Plus de bouton « Ma position », ni de « Revenir à mon coin », ni de feuille « Personnes et crews » (ancien).
    for (const gone of ["gps-button", "around-back", "people-open", "map-legend", "map-q"])
      await expect(page.getByTestId(gone)).toHaveCount(0);
    await audit(page);
    await shot(page, `01-evenements-liste-${theme}`);

    // --- Où chercher ? : Mon coin → Ailleurs (un département) → Partout en France → Mon coin ----------------------------
    await pill(page, "around-open").click();
    await expect(page.getByTestId("around-sheet")).toBeVisible();
    for (const id of ["around-me", "around-mine", "around-elsewhere", "around-all", "where-apply"])
      await expect(page.getByTestId(id)).toBeVisible();
    await shot(page, `02-ou-chercher-${theme}`);
    // Autour de moi : le curseur de distance apparaît ; la position n'est jamais gardée.
    await page.getByTestId("around-me").click();
    await expect(page.getByTestId("where-range")).toBeVisible();
    await expect(page.getByTestId("where-track")).toBeVisible();
    await expect(page.getByTestId("where-km")).toContainText("km");
    await shot(page, `02b-ou-chercher-autour-de-moi-${theme}`);
    await page.getByTestId("around-mine").click();
    await expect(page.getByTestId("where-range")).toHaveCount(0);
    await page.getByTestId("around-elsewhere").click();
    await expect(page.getByTestId("around-departments")).toBeVisible();
    await page.getByTestId("around-find").fill("11");
    await shot(page, `02c-ou-chercher-ailleurs-${theme}`);
    await page.getByRole("radio", { name: /^11 · / }).click();
    await page.getByTestId("where-apply").click();
    await expect(page.getByTestId("around-sheet")).toHaveCount(0);
    await expect(pill(page, "around-open")).toContainText("(11)");
    expect(await selected(page, "around-open")).toBe(true);
    await expect(page.getByTestId("sort-line")).toContainText("(11)", { timeout: 30_000 });
    await setWhere(page, "all");
    await expect(pill(page, "around-open")).toContainText("Partout en France");
    await expect(page.getByTestId("sort-line")).toContainText("partout en France", { timeout: 30_000 });
    // Retour à Mon coin : la pastille repasse en contour.
    await setWhere(page, "mine");
    await expect(pill(page, "around-open")).toContainText("Mon coin");
    expect(await selected(page, "around-open")).toBe(false);
    await expect(page.getByTestId("sort-line")).not.toContainText("partout en France");

    // --- Trier : un toucher suffit, la feuille se ferme ------------------------------------------------------------
    await pill(page, "sort-open").click();
    await expect(page.getByTestId("sort-sheet")).toBeVisible();
    for (const id of ["sort-date", "sort-distance", "sort-recent", "sort-seats"])
      await expect(page.getByTestId(id)).toBeVisible();
    await shot(page, `03-trier-${theme}`);
    await page.getByTestId("sort-distance").click();
    await expect(page.getByTestId("sort-sheet")).toHaveCount(0);
    await expect(pill(page, "sort-open")).toContainText("distance");
    expect(await selected(page, "sort-open")).toBe(true);
    await pill(page, "sort-open").click();
    await page.getByTestId("sort-date").click();
    await expect(pill(page, "sort-open")).toContainText("Par date");
    expect(await selected(page, "sort-open")).toBe(false);

    // --- Filtres : le bouton « Voir N événements », un format, puis tout effacer ------------------------------------------
    await pill(page, "filters-toggle").click();
    await expect(page.getByTestId("explorer-filters")).toBeVisible();
    await expect(page.getByTestId("filters-apply")).toBeVisible();
    await shot(page, `03b-filtres-${theme}`);
    await page.getByTestId("explorer-filters").getByText("Exposition", { exact: true }).click();
    await page.getByTestId("filters-apply").click();
    await expect(page.getByTestId("explorer-filters")).toHaveCount(0);
    await expect(page.getByTestId("event-row").first()).toContainText("Exposition", { timeout: 30_000 });
    for (const row of await page.getByTestId("event-row").allTextContents()) expect(row).toContain("Exposition");
    await pill(page, "filters-toggle").click();
    await page.getByTestId("explorer-filters").getByText("Tous", { exact: true }).click();
    await page.getByTestId("filters-apply").click();
    await expect(page.getByTestId("explorer-filters")).toHaveCount(0);
    // La recherche s'efface avec son ✕.
    await page.getByTestId("events-q").fill("Rivesaltes");
    await expect(page.getByTestId("event-row").filter({ hasText: "Expo Rivesaltes" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("events-q-clear").click();
    await expect(page.getByTestId("events-q")).toHaveValue("");

    // --- Pros : lieu commun, Métier, Trier ; fiches uniformes, un seul métier à la fois -----------------------------
    await page.getByTestId("segment-pros").click();
    await expect(page.getByTestId("segment-pros")).toHaveAttribute("aria-selected", "true");
    for (const id of ["around-open", "job-open", "pro-sort-open"]) await expect(pill(page, id)).toBeVisible();
    await expect(pill(page, "around-open")).toContainText("Mon coin");
    await expect(pill(page, "job-open")).toContainText("Tous");
    await expect(pill(page, "pro-sort-open")).toContainText("distance");
    await expect(page.getByTestId("pros-line")).toContainText("pro", { timeout: 30_000 });
    await expect(page.getByTestId("pro-row").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("topbar-logo").first()).toBeVisible();
    await expect(page.getByTestId("pro-discount").first()).toBeVisible();
    await audit(page);
    await shot(page, `04-pros-liste-${theme}`);
    await pill(page, "job-open").click();
    await expect(page.getByTestId("job-sheet")).toBeVisible();
    await expect(page.getByTestId("job-all")).toBeVisible();
    await shot(page, `05-pros-metier-${theme}`);
    await page.getByTestId(`job-${JOB}`).click();
    await expect(page.getByTestId("job-sheet")).toHaveCount(0);
    await expect(pill(page, "job-open")).toContainText(proActivityLabels[JOB]);
    expect(await selected(page, "job-open")).toBe(true);
    await expect(page.getByTestId("pros-line")).toContainText(proActivityLabels[JOB], { timeout: 30_000 });
    await expect(page.getByTestId("pro-row").first()).toBeVisible({ timeout: 30_000 });
    // « Tous » : le métier s'efface.
    await pill(page, "job-open").click();
    await page.getByTestId("job-all").click();
    await expect(pill(page, "job-open")).toContainText("Tous");
    expect(await selected(page, "job-open")).toBe(false);
    // Trier les pros : par nom, puis par distance.
    await pill(page, "pro-sort-open").click();
    await expect(page.getByTestId("pro-sort-sheet")).toBeVisible();
    await shot(page, `05b-pros-trier-${theme}`);
    await page.getByTestId("pro-sort-name").click();
    await expect(page.getByTestId("pro-sort-sheet")).toHaveCount(0);
    await expect(pill(page, "pro-sort-open")).toContainText("nom");
    await expect(page.getByTestId("pros-line")).toContainText("par nom", { timeout: 30_000 });
    await pill(page, "pro-sort-open").click();
    await page.getByTestId("pro-sort-distance").click();
    await expect(pill(page, "pro-sort-open")).toContainText("distance");
    // Le lieu est commun aux Événements et aux Pros : Ailleurs ici, c'est Ailleurs là-bas.
    await setWhere(page, { dept: "11" });
    await expect(pill(page, "around-open")).toContainText("(11)");
    await page.getByTestId("segment-evenements").click();
    await expect(pill(page, "around-open")).toContainText("(11)");
    await setWhere(page, "mine");

    // --- Personnes et crews : aucun annuaire ---------------------------------------------------------------------------
    await page.getByTestId("segment-personnes").click();
    await expect(page.getByTestId("segment-personnes")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("people-q")).toBeVisible();
    for (const id of ["people-where-open", "show-open", "people-filters"]) await expect(pill(page, id)).toBeVisible();
    await expect(page.getByTestId("people-search")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("people-privacy")).toBeVisible();
    await expect(page.getByTestId("topbar-logo").first()).toBeVisible();
    // Sans recherche : seulement des suggestions courtes (même modèle, crews du coin), jamais une liste de personnes.
    await expect(page.getByTestId("suggest-same-model").or(page.getByTestId("suggest-crews")).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("person-row")).toHaveCount(0);
    await expect(page.getByTestId("people-results")).toHaveCount(0);
    expect(await page.getByTestId("suggested-person").count()).toBeLessThanOrEqual(3);
    await expect(page.getByTestId("list-map-toggle")).toHaveCount(0); // pas de carte pour les personnes
    await audit(page);
    await shot(page, `06-personnes-ouverture-${theme}`);
    // Où chercher ? (départements seulement), Montrer, Filtres.
    await pill(page, "people-where-open").click();
    await expect(page.getByTestId("people-where-sheet")).toBeVisible();
    await expect(page.getByTestId("around-me")).toHaveCount(0); // jamais de position
    await page.getByTestId("people-where-all").click();
    await expect(page.getByTestId("people-where-sheet")).toHaveCount(0);
    await expect(pill(page, "people-where-open")).toContainText("Partout en France");
    await pill(page, "people-where-open").click();
    await page.getByTestId("people-where-mine").click();
    await expect(pill(page, "people-where-open")).toContainText("Mon coin");
    await pill(page, "show-open").click();
    await expect(page.getByTestId("show-sheet")).toBeVisible();
    await page.getByTestId("show-crews").click();
    await expect(page.getByTestId("show-sheet")).toHaveCount(0);
    await expect(pill(page, "show-open")).toContainText("Crews");
    await expect(page.getByTestId("suggested-person")).toHaveCount(0);
    await pill(page, "show-open").click();
    await page.getByTestId("show-all").click();
    await expect(pill(page, "show-open")).toContainText("Tout");
    await pill(page, "people-filters").click();
    await expect(page.getByTestId("people-filters-panel")).toBeVisible();
    await page.getByTestId("sheet-close").click();
    await expect(page.getByTestId("people-filters-panel")).toHaveCount(0);
    // Recherche : « su » (un pseudo ou un modèle du seed), puis une phrase claire quand personne ne correspond.
    await page.getByTestId("people-q").fill("su");
    await expect(page.getByTestId("people-results")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("person-row").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("people-privacy")).toBeVisible();
    await shot(page, `07-personnes-recherche-${theme}`);
    await page.getByTestId("people-q").fill("zzqxw");
    await expect(page.getByText("Personne ne s'appelle", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("person-row")).toHaveCount(0);
    await page.getByTestId("people-q").fill("z");
    await expect(page.getByText("Saisis au moins deux caractères.")).toBeVisible();
    await page.getByTestId("people-q").fill("drift");
    await expect(page.getByTestId("crew-row").filter({ hasText: "Roussillon Drift" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("people-q-clear").click();
    await expect(page.getByTestId("people-results")).toHaveCount(0);
    await expect(page.getByTestId("person-row")).toHaveCount(0);

    // --- La carte, dans l'onglet : bascule, frise des dates, ni légende ni recherche ---------------------------------------
    await page.getByTestId("segment-evenements").click();
    await expect(page.getByTestId("list-map-toggle")).toBeVisible();
    await page.getByTestId("map-toggle").click();
    const map = page.getByTestId("map-screen");
    await expect(map).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("topbar-logo").first()).toBeVisible();
    await expect(page.getByTestId("segment-evenements")).toBeVisible();
    await expect(page.getByTestId("map-dates")).toBeVisible();
    await expect(page.getByTestId("map-day-all")).toBeVisible();
    await expect(page.getByTestId("map-legend")).toHaveCount(0);
    await expect(page.getByTestId("map-q")).toHaveCount(0);
    await expect(page.getByTestId("map-close")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Explorer", exact: true }).last()).toBeVisible();
    const canvas = page.getByTestId("explorer-map-canvas");
    await expect(canvas).toHaveAttribute("data-map-style", new RegExp(`^orasso-${theme}`), { timeout: 45_000 });
    const pins = canvas.locator('[data-testid="map-marker"], [data-testid="map-cluster"]');
    await expect(pins.first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2500);
    const all = await pins.count();
    // Une date : seules ses épingles restent, et la fiche de l'événement se montre.
    const days = page.locator('[data-testid^="map-day-"]:not([data-testid="map-day-all"])');
    expect(await days.count()).toBeGreaterThan(0);
    await days.first().click();
    await expect(days.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("map-picked")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("map-picked").getByTestId("event-row").first()).toBeVisible();
    await expect.poll(async () => await pins.count(), { timeout: 15_000 }).toBeLessThanOrEqual(all);
    await page.waitForTimeout(1500);
    await shot(page, `08-carte-frise-${theme}`);
    await page.getByTestId("map-day-all").click();
    await expect(page.getByTestId("map-day-all")).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("list-toggle").click();
    await expect(page.getByTestId("sort-line")).toBeVisible({ timeout: 30_000 });
    // Les Pros ont leur carte aussi (même bascule) ; Personnes et crews n'en ont pas.
    await page.getByTestId("segment-pros").click();
    await page.getByTestId("map-toggle").click();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("topbar-logo").first()).toBeVisible();
    await page.getByTestId("list-toggle").click();
    await expect(page.getByTestId("pros-line")).toBeVisible({ timeout: 30_000 });

    // --- Mémorisation : segment, lieu, tri et métier restent après un rechargement ---------------------------------------
    await page.getByTestId("segment-evenements").click();
    await setWhere(page, { dept: "11" });
    await pill(page, "sort-open").click();
    await page.getByTestId("sort-recent").click();
    await expect(pill(page, "sort-open")).toContainText("Nouveautés");
    await page.getByTestId("segment-pros").click();
    await pill(page, "job-open").click();
    await page.getByTestId(`job-${JOB}`).click();
    await expect(pill(page, "job-open")).toContainText(proActivityLabels[JOB]);
    await page.waitForTimeout(1500);
    await goto(page, "/explorer");
    await dismissAsk(page);
    await expect(page.getByTestId("segment-pros")).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
    await expect(pill(page, "job-open")).toContainText(proActivityLabels[JOB], { timeout: 30_000 });
    await expect(pill(page, "around-open")).toContainText("(11)");
    await page.getByTestId("segment-evenements").click();
    await expect(pill(page, "sort-open")).toContainText("Nouveautés", { timeout: 30_000 });
    await expect(pill(page, "around-open")).toContainText("(11)");
    // On remet les réglages habituels (le choix est gardé sur l'appareil, par compte).
    await setWhere(page, "mine");
    await pill(page, "sort-open").click();
    await page.getByTestId("sort-date").click();
    await page.getByTestId("segment-pros").click();
    await pill(page, "job-open").click();
    await page.getByTestId("job-all").click();
    await page.getByTestId("segment-evenements").click();
    await expect(pill(page, "around-open")).toContainText("Mon coin");
    await ctx.close();
  }
  expect(errors.filter((e) => !/favicon|Failed to load resource/i.test(e))).toEqual([]);
});

// Lot R2, tour 2 (relectures Opus et Codex) : plus aucun annuaire ; une erreur se dit, jamais une liste vide.
test("Personnes et crews : filtres sans texte = aucune liste ; 503 et 429 = erreur et « Réessayer »", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, "kenji@orasso.local");
  await goto(page, "/explorer");
  await dismissAsk(page);
  await page.getByTestId("segment-personnes").click();
  // Un grade sans texte : aucune personne listée, une phrase le dit.
  await pill(page, "people-filters").click();
  await page.getByTestId("people-filters-panel").getByText("Route", { exact: true }).click();
  await page.getByTestId("people-filters-apply").click();
  await expect(page.getByTestId("people-need-text")).toBeVisible();
  await expect(page.getByTestId("people-results")).toHaveCount(0);
  await expect(page.getByTestId("person-row")).toHaveCount(0);
  // Suggestions en panne (503) : l'erreur et « Réessayer », puis la reprise.
  await page.route("**/api/users/suggestions**", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"indisponible"}' }),
  );
  await page.getByTestId("segment-evenements").click();
  await page.getByTestId("segment-personnes").click();
  await expect(page.getByTestId("load-error")).toBeVisible();
  await page.unroute("**/api/users/suggestions**");
  await page.getByTestId("load-error").getByRole("button").click();
  await expect(page.getByTestId("load-error")).toHaveCount(0);
  // Recherche limitée (429) : l'erreur, pas « Personne ne s'appelle… ».
  await page.route("**/api/users/search**", (r) =>
    r.fulfill({ status: 429, contentType: "application/json", body: '{"error":"trop de recherches"}' }),
  );
  await page.getByTestId("people-q").fill("pilote");
  await expect(page.getByTestId("load-error")).toBeVisible();
  await expect(page.getByText("Personne ne s'appelle", { exact: false })).toHaveCount(0);
  await page.unroute("**/api/users/search**");
  await page.getByTestId("load-error").getByRole("button").click();
  await expect(page.getByTestId("people-results")).toBeVisible();
  // Rien de choisi : la recherche est élargie à toute la France, et l'écran le dit.
  await expect(page.getByTestId("people-broadened")).toBeVisible();
  await ctx.close();
});
