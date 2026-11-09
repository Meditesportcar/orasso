import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme } from "./helpers";
import { castBy, closeVote, openedHandVote, voteSeenBy } from "./helpers/lotr7l3";
import { RELAIS } from "./relais";

// Lot R7l3, site : voter (la liste des votes, la grille d'un concours, le classement après la voix, le trophée). Mêmes règles
// que l'appli (elles sont dans l'API) : classement absent avant la voix et présent après, grille à 4 colonnes à 1280 px, qui n'est
// pas entré ne peut pas voter, clôture → visible pour qui n'a pas voté, trophée de Kenji (Béziers Night) sur la fiche du
// véhicule, aucune plaque lisible. API et site lancés sur la base seedée (événement en cours « Rassemblement du Lydia »).
test.use({ locale: "fr-FR", timezoneId: "Europe/Paris" });
test.setTimeout(300_000);

const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7l3-captures/apres/recette-site`).replaceAll("\\", "/");
const STAMP = Date.now().toString(36);
// Thème des captures : R7L3_THEME=beton|sable (Sable par défaut).
const THEME = (process.env.R7L3_THEME ?? "sable") as "beton" | "sable";
const PLATE = /\b[A-Z]{2}[- ]?\d{3}[- ]?[A-Z]{2}\b/;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}-${THEME}.png`, fullPage: true });
}

/**
 * Choisit une carte de la grille. Un toucher avant l'hydratation de la page est perdu : on le répète jusqu'à ce que « Voter pour … »
 * confirme que la carte est prise (tour 3).
 */
async function pickCard(page: Page, which: "first" | "last") {
  const cards = page.locator('[data-testid="vote-candidate"]:not([disabled])');
  await expect(async () => {
    await (which === "first" ? cards.first() : cards.last()).click();
    await expect(page.getByTestId("vote-cta")).toContainText(/Voter pour/, { timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
}

test("la liste, le vote dans le concours, classement absent avant la voix et présent après, une voix modifiable", async ({
  page,
}) => {
  const v = await openedHandVote(`Recette R7l3 site concours ${STAMP}`);
  const before = await voteSeenBy("kenji@orasso.local", v.eventId, v.voteId);
  expect(before.ranking).toBeNull();
  try {
    await setTheme(page, THEME);
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");

    // La liste des votes.
    await page.goto(`/app/votes/${v.slug}`);
    await expect(page.getByTestId("votes-list")).toBeVisible();
    await expect(page.getByTestId(`votes-chip-${v.voteId}`)).toContainText(/Voter/i);
    expect(await page.getByTestId("votes-list").innerText()).not.toMatch(PLATE);
    await shot(page, "liste");

    // Le vote : la grille, sa voiture grisée, aucune voiture pas encore entrée touchable, pas de classement.
    await page.getByTestId(`votes-row-${v.voteId}`).getByRole("link").click();
    await expect(page.getByTestId("vote-grid")).toBeVisible();
    await expect(page.locator('[data-own="true"]')).toHaveCount(1);
    await expect(page.locator('[data-own="true"]')).toBeDisabled();
    if (v.waiting) {
      await expect(page.getByTestId("vote-candidate-waiting")).toHaveCount(1);
      await expect(page.getByTestId("vote-candidate-waiting")).toBeDisabled();
    }
    await expect(page.getByTestId("vote-ranking-hidden")).toContainText(/après ton vote/i);
    await expect(page.getByTestId("vote-ranking")).toHaveCount(0);
    await shot(page, "vote-avant");

    // Le geste en deux temps (parité avec l'appli) : toucher une voiture la choisit sans voter ; « Voter pour … » vote.
    await expect(page.getByTestId("vote-cta")).toBeDisabled();
    await pickCard(page, "first");
    await expect(page.getByTestId("vote-saved")).toHaveCount(0);
    expect((await voteSeenBy("kenji@orasso.local", v.eventId, v.voteId)).myVote).toBeFalsy();
    await page.getByTestId("vote-cta").click();
    await expect(page.getByTestId("vote-saved")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vote-ranking")).toBeVisible();
    await expect(page.getByTestId("vote-ranking-hidden")).toHaveCount(0);
    expect(await page.getByTestId("vote-ranking").innerText()).not.toMatch(PLATE);
    const after = await voteSeenBy("kenji@orasso.local", v.eventId, v.voteId);
    expect(after.ranking).not.toBeNull();
    await shot(page, "vote-apres");

    // Une voix modifiable, par le même geste en deux temps : « Changer mon vote » rouvre la grille.
    await expect(page.getByTestId("vote-candidate")).toHaveCount(0);
    await page.getByTestId("vote-change").click();
    await pickCard(page, "last");
    await page.getByTestId("vote-cta").click();
    await expect(page.getByTestId("vote-saved")).toBeVisible({ timeout: 30_000 });
    const changed = await voteSeenBy("kenji@orasso.local", v.eventId, v.voteId);
    expect(changed.myVote).not.toBe(after.myVote);
  } finally {
    await closeVote(v.eventId, v.voteId).catch(() => undefined);
  }
});

test("grille à 4 colonnes à 1280 px, 2 colonnes à 390 px", async ({ browser }) => {
  const v = await openedHandVote(`Recette R7l3 site colonnes ${STAMP}`);
  try {
    for (const [width, columns] of [
      [1280, 4],
      [390, 2],
    ] as const) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR" });
      const page = await ctx.newPage();
      await setTheme(page, "beton");
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      await page.goto(`/app/vote/${v.slug}?vote=${v.voteId}`);
      await expect(page.getByTestId("vote-grid")).toBeVisible();
      const count = await page
        .getByTestId("vote-grid")
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      expect(count).toBe(columns);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await shot(page, `vote-grille-${width}`);
      await ctx.close();
    }
  } finally {
    await closeVote(v.eventId, v.voteId).catch(() => undefined);
  }
});

test("qui n'est pas entré ne peut pas voter ; à la clôture, le classement est visible pour qui n'a pas voté", async ({
  page,
}) => {
  const v = await openedHandVote(`Recette R7l3 site clôture ${STAMP}`);
  const visitor = "paul.photo@orasso.local";
  const cookie = await login(visitor);
  const refused = await apiCall(cookie, "PUT", `/events/${v.eventId}/votes/${v.voteId}/vote`, {
    applicationId: v.entered.find((c) => !c.own)?.applicationId,
  });
  expect([403, 409]).toContain(refused.status);
  await setTheme(page, THEME);
  await loginInBrowser(page, visitor, undefined, "/app");
  await page.goto(`/app/vote/${v.slug}?vote=${v.voteId}`);
  await expect(page.getByTestId("vote-grid")).toBeVisible();
  await expect(page.getByTestId("vote-reason")).toContainText(/Valide ta présence|Entre sur l'événement/);
  await expect(page.getByTestId("vote-candidate-off").first()).toBeDisabled();
  await expect(page.getByTestId("vote-candidate")).toHaveCount(0);
  await expect(page.getByTestId("vote-ranking-hidden")).toContainText(/à la clôture/i);
  await expect(page.getByTestId("vote-ranking")).toHaveCount(0);
  await shot(page, "vote-visiteur");
  for (const voter of ["damien@orasso.local", "kenji@orasso.local", "lea@orasso.local"]) {
    const target = v.entered.find((c) => !c.own && !c.pseudo.toLowerCase().startsWith(voter.split("@")[0] ?? ""));
    if (target) await castBy(voter, v.eventId, v.voteId, target.applicationId);
  }
  await closeVote(v.eventId, v.voteId);
  await page.reload();
  await expect(page.getByTestId("vote-ranking")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("vote-ranking-hidden")).toHaveCount(0);
  await shot(page, "vote-clos");
  await page.goto(`/app/votes/${v.slug}`);
  await expect(page.getByTestId(`votes-detail-${v.voteId}`)).toContainText(/Clos/);
});

test("trophée de Kenji (Béziers Night) sur la fiche du garage et sur la fiche publique, sans plaque lisible", async ({
  page,
  browser,
}) => {
  const cookie = await login("kenji@orasso.local");
  const mine = await apiCall<{ id: string; trophies: { voteTitle: string }[] }[]>(cookie, "GET", "/me/vehicles");
  const supra = mine.data.find((x) => x.trophies.length > 0);
  expect(supra, "Le seed doit donner un trophée à Kenji (Béziers Night)").toBeTruthy();
  await setTheme(page, THEME);
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await page.goto(`/app/garage/${supra?.id}`);
  await expect(page.getByTestId("vehicle-trophies")).toBeVisible();
  await expect(page.getByTestId("vehicle-trophy").first()).toContainText("Béziers Night");
  expect(await page.getByTestId("vehicle-trophies").innerText()).not.toMatch(PLATE);
  await shot(page, "garage-trophee");
  // Fiche publique, vue par un autre compte.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: "fr-FR" });
  const other = await ctx.newPage();
  await setTheme(other, THEME);
  await loginInBrowser(other, "damien@orasso.local", undefined, "/app");
  await other.goto(`/v/${supra?.id}`);
  await expect(other.getByTestId("vehicle-trophies")).toBeVisible();
  await expect(other.getByTestId("vehicle-trophy").first()).toContainText("Béziers Night");
  expect(await other.getByTestId("vehicle-trophies").innerText()).not.toMatch(PLATE);
  await shot(other, "vehicule-public-trophee");
  await ctx.close();
});

test("la fiche de l'événement mène à la liste des votes", async ({ page }) => {
  await setTheme(page, THEME);
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto("/e/rassemblement-du-lydia");
  const votes = page.getByTestId("event-votes");
  await expect(votes).toBeVisible();
  await votes.click();
  await expect(page).toHaveURL(/\/app\/votes\/rassemblement-du-lydia/);
  await expect(page.getByTestId("votes-list")).toBeVisible();
});
