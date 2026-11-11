import { expect, type Locator, type Page, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { tabMatchesList } from "./helpers/lotr8x";

// Lot R8x (maquette R8.9, variante A) : le haut compact de l'Explorer (onglets soulignés avec « Événements · N », champ et
// bouton « Filtres » sur une ligne, puces serrées, plus de ligne de décompte) et la carte d'un événement sans vide ni
// chevauchement (jauge et décompte sous l'affiche, « Liste d'attente » à droite du décompte). Appli compilée :
// APP_URL=http://localhost:<port>. Compte de démonstration Kenji ; le Rassemblement du Lydia est complet (seed).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function openExplorer(page: Page, width: number, scale: number, email = "kenji@orasso.local") {
  await page.setViewportSize({ width, height: 860 });
  await page.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", s);
    },
    ["beton", String(scale)] as const,
  );
  await page.goto(`${APP}/auth`);
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page.goto(`${APP}/explorer`);
  await afterOpening(page);
  await page.getByTestId("segment-evenements").click({ timeout: 30_000 });
  await expect(page.getByTestId("event-row").first()).toBeVisible({ timeout: 30_000 });
}

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox();
  if (!b) throw new Error("élément sans boîte");
  return b;
};
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

const tabCount = async (page: Page) =>
  Number(/Événements · (\d+)/.exec(await page.getByTestId("segment-evenements").innerText())?.[1] ?? "NaN");

for (const [width, scale] of [
  [390, 1],
  [384, 1.3],
] as const) {
  test(`appli Explorer R8x : haut compact et carte (${width} px, police x${scale})`, async ({ page }) => {
    test.setTimeout(240_000);
    await openExplorer(page, width, scale);

    // --- Trois onglets soulignés, « Événements · N » = les cartes de la liste ---------------------------------------
    await expect(page.getByTestId("explorer-segments")).toBeVisible();
    for (const id of ["evenements", "pros", "personnes"]) await expect(page.getByTestId(`segment-${id}`)).toBeVisible();
    await expect(page.getByTestId("segment-evenements")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("segment-evenements")).toContainText(/Événements · \d+/, { timeout: 30_000 });
    // La ligne de décompte a disparu (le nombre est dans l'onglet, la distance dans la pastille).
    await expect(page.getByTestId("sort-line")).toHaveCount(0);
    const rows = page.getByTestId("event-row");
    const more = await page.getByText("Voir plus", { exact: false }).count();
    const n = await tabCount(page);
    if (more === 0) expect(await rows.count()).toBe(n);
    else expect(n).toBeGreaterThanOrEqual(await rows.count());
    await expect(page.getByTestId("around-open")).not.toContainText("de moi");

    // --- Champ et bouton « Filtres » sur une ligne, au-dessus des puces ---------------------------------------------
    const field = await box(page.getByTestId("events-q"));
    const filters = await box(page.getByRole("button", { name: "Filtres", exact: true }));
    expect(Math.abs(filters.y + filters.height / 2 - (field.y + field.height / 2))).toBeLessThan(12);
    expect(filters.x).toBeGreaterThan(field.x + field.width - 4);
    const pill = await box(page.getByTestId("around-open"));
    expect(pill.y).toBeGreaterThan(field.y + field.height - 1);
    await expect(page.getByTestId("events-q")).toHaveAttribute("placeholder", "Événement, organisateur, ville");

    // --- Aucun mot coupé dans les onglets (police agrandie comprise) ------------------------------------------------
    const cut = await page.evaluate(() => {
      const out: string[] = [];
      for (const id of ["evenements", "pros", "personnes"]) {
        const tab = document.querySelector(`[data-testid=segment-${id}]`);
        const leaf = tab && [...tab.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent);
        if (!tab || !leaf) continue;
        const style = getComputedStyle(leaf);
        const probe = document.createElement("span");
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${style.font}`;
        document.body.appendChild(probe);
        const room = leaf.getBoundingClientRect().width;
        for (const word of (leaf.textContent ?? "").split(/\s+/)) {
          probe.textContent = word;
          if (probe.getBoundingClientRect().width > room + 1) out.push(`${id}:${word}`);
        }
        probe.remove();
      }
      return out;
    });
    expect(cut).toEqual([]);

    // --- Le bouton « Filtres » ouvre la feuille ----------------------------------------------------------------------
    await page.getByRole("button", { name: "Filtres", exact: true }).click();
    await expect(page.getByTestId("explorer-filters")).toBeVisible();
    await page.getByTestId("sheet-close").click();

    // --- La recherche réduit la liste, le nombre de l'onglet suit ---------------------------------------------------
    await page.getByTestId("events-q").fill("Lydia");
    await expect(rows).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId("segment-evenements")).toContainText("Événements · 1", { timeout: 30_000 });

    // --- Événement complet : « Liste d'attente » dans la ligne du décompte, sans rien recouvrir ---------------------
    const card = rows.first();
    await expect(card.getByTestId("event-waitlist")).toBeVisible();
    await expect(card.getByTestId("event-waitlist")).toContainText("Liste d'attente");
    await expect(card.getByTestId("event-seats")).toHaveText("Complet");
    const wait = await box(card.getByTestId("event-waitlist"));
    const seats = await box(card.getByTestId("event-seats"));
    const cardBox = await box(card);
    expect(wait.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(wait.x + wait.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    expect(wait.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(wait.y + wait.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
    expect(overlap(wait, seats)).toBe(false);
    for (const id of ["event-when", "event-km", "poster-minimal"]) {
      const other = card.getByTestId(id);
      if (await other.count()) expect(overlap(wait, await box(other.first()))).toBe(false);
    }
    // Le titre n'est recouvert par rien.
    const title = await box(card.getByText("Rassemblement du Lydia", { exact: false }).first());
    expect(overlap(wait, title)).toBe(false);
    if (scale === 1) expect(Math.abs(wait.y + wait.height / 2 - (seats.y + seats.height / 2))).toBeLessThan(16);
    // Un événement qui n'est pas complet n'a pas la puce.
    await page.getByTestId("events-q").fill("Salon Argel");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-waitlist")).toHaveCount(0);
  });
}

test("appli Explorer R8x : Pros et Personnes et crews gardent leur contenu, sous les mêmes onglets", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openExplorer(page, 390, 1);
  await page.getByTestId("segment-pros").click();
  await expect(page.getByTestId("segment-pros")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("job-open")).toBeVisible();
  await expect(page.getByTestId("pro-sort-open")).toBeVisible();
  await expect(page.getByTestId("events-q")).toHaveAttribute("placeholder", "Un pro, un métier, une ville");
  await page.getByTestId("segment-personnes").click();
  await expect(page.getByTestId("people-q")).toBeVisible();
  await page.getByRole("button", { name: "Filtres", exact: true }).click();
  await expect(page.getByTestId("people-filters-panel")).toBeVisible();
  await page.getByTestId("sheet-close").click();
});

test("appli Explorer R8x : le nombre de l'onglet suit la requête, en liste, en carte et depuis les Pros", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openExplorer(page, 390, 1);
  const tab = page.getByTestId("segment-evenements");
  await tabMatchesList(page);
  // Liste -> carte -> recherche : le nombre et la carte parlent du même résultat.
  await page.getByTestId("map-toggle").click();
  await page.getByTestId("events-q").fill("Lydia");
  await expect(tab).toContainText("Événements · 1", { timeout: 30_000 });
  await expect(page.getByTestId("map-day-all")).toContainText("1 événement", { timeout: 30_000 });
  await page.getByTestId("list-toggle").click();
  await expect(page.getByTestId("event-row")).toHaveCount(1, { timeout: 30_000 });
  await expect(tab).toContainText("Événements · 1");
  await page.getByTestId("events-q").fill("");
  await tabMatchesList(page);
  const before = Number(/Événements · (\d+)/.exec(await tab.innerText())?.[1]);
  // Depuis les Pros, un changement de lieu change le nombre de l'onglet (jamais l'ancien nombre).
  await page.getByTestId("segment-pros").click();
  await page.getByTestId("around-open").click();
  await page.getByTestId("around-all").click();
  await page.getByTestId("where-apply").click();
  await expect
    .poll(async () => Number(/Événements · (\d+)/.exec(await tab.innerText())?.[1] ?? "NaN"), { timeout: 30_000 })
    .not.toBe(before);
  await page.getByTestId("segment-evenements").click();
  await tabMatchesList(page);
});

for (const [width, scale] of [
  [390, 1],
  [390, 1.3],
] as const) {
  test(`appli Explorer R8x : 20 départements, la pastille « Mon coin » tient dans l'écran (${width} px, x${scale})`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const pseudo = `Coin20_${unique()}`;
    const cookie = await signUpApi(pseudo);
    const depts = Array.from({ length: 20 }, (_, i) => String(i < 19 ? i + 1 : 21).padStart(2, "0"));
    await apiCall(cookie, "PATCH", "/me/profile", { departments: depts });
    const put = await apiCall(cookie, "PATCH", "/me/preferences", { departments: depts });
    expect(put.status, JSON.stringify(put.data).slice(0, 300)).toBe(200);
    await openExplorer(page, width, scale, `${pseudo.toLowerCase()}@e2e.orasso.test`);
    const pill = page.getByTestId("around-open");
    await expect(pill).toContainText("20 départements", { timeout: 30_000 });
    const b = await pill.boundingBox();
    if (!b) throw new Error("pastille sans boîte");
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
    // Rien ne fait défiler la page à l'horizontale.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
