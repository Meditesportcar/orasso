import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, signUpApi, unique } from "./helpers";

// Recherche de premier niveau et Explorer (lot 29) dans l'appli, version web de recette (`expo start --web`) :
// recherche depuis la barre du haut (« Supra », « Rivesaltes »), Explorer (affinités, filtres en feuille, position,
// carte → repli liste avec message sur le web, Pros), pages d'une structure et d'un pro, lien depuis la page d'un
// événement. La carte MapLibre native se vérifie sur l'APK (épingles, fiche au toucher).
// Lancer avec APP_URL=http://localhost:<port de Metro> (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-29-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("appli : recherche, Explorer, structure, pro", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const pseudo = `ExploApp_${s}`;
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"] });
  const club = await apiCall<{ id: string }>(cookie, "GET", "/structures/by-slug/club-audois-passion");
  await apiCall(cookie, "POST", `/structures/${club.data.id}/follow`);
  const errors: string[] = [];

  for (const theme of ["sable", "beton"] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      baseURL: APP,
      permissions: ["geolocation"],
      geolocation: { latitude: 43.6047, longitude: 1.4442 },
    });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
    }, theme);
    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(`${pseudo.toLowerCase()}@e2e.orasso.test`);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil/, { timeout: 30_000 });

    // --- Recherche de premier niveau, depuis la barre du haut ---------------------------------------------------
    await page.getByLabel("Rechercher").first().click();
    await expect(page).toHaveURL(/recherche/, { timeout: 30_000 });
    await shot(page, `01-recherche-vide-${theme}`);
    await page.getByTestId("search-q").fill("Supra");
    await expect(page.getByTestId("vehicle-hit").first()).toContainText("Toyota Supra", { timeout: 30_000 });
    await expect(page.getByText("Kenji_66").first()).toBeVisible();
    await shot(page, `02-recherche-supra-${theme}`);
    await page.getByTestId("search-q").fill("Rivesaltes");
    await expect(page.getByTestId("event-row").filter({ hasText: "Expo Rivesaltes" })).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, `03-recherche-rivesaltes-${theme}`);
    // « Voir tout » : plus de cinq événements pour « de ».
    await page.getByTestId("search-q").fill("de");
    await page.getByTestId("see-all-evenements").click({ timeout: 30_000 });
    await expect(page.getByTestId("events-q")).toHaveValue("de", { timeout: 30_000 });

    // --- Explorer : affinités ----------------------------------------------------------------------------------
    await page.goto("/explorer");
    const rows = page.getByTestId("event-row");
    await expect(rows.first()).toContainText("Rassemblement de Narbonne", { timeout: 30_000 });
    await expect(rows.first()).toContainText("Organisateur suivi");
    await shot(page, `04-explorer-affinites-${theme}`);

    // Par date : plus de pastille d'affinité en tête.
    await page.getByText("Date", { exact: true }).click();
    await expect(rows.first()).not.toContainText("Organisateur suivi", { timeout: 30_000 });

    // Filtre en feuille : département 11.
    await page.getByTestId("open-filters").click();
    await page.getByRole("combobox", { name: "Département" }).click();
    await page.getByRole("menuitem", { name: "11", exact: true }).click();
    await shot(page, `05-explorer-filtres-${theme}`);
    await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(rows.first()).toContainText(/Narbonne|Carcassonne/, { timeout: 30_000 });
    for (const text of await rows.allTextContents()) expect(text).not.toContain("Rivesaltes");
    await shot(page, `06-explorer-aude-${theme}`);

    // Carte : sur le web, la liste reste avec un message (le rendu natif se vérifie sur l'APK).
    await page.getByText("Carte", { exact: true }).click();
    await expect(page.getByText("La carte est disponible dans l'appli sur téléphone")).toBeVisible();
    await expect(rows.first()).toBeVisible();
    await shot(page, `07-explorer-carte-repli-${theme}`);
    await page.getByText("Liste", { exact: true }).click();

    // Position facultative : jamais enregistrée.
    await page.getByRole("button", { name: /Utiliser ma position/i }).click();
    await expect(page.getByText(/non enregistrée/)).toBeVisible({ timeout: 30_000 });
    await page.getByText("Distance", { exact: true }).click();
    await expect(rows.first()).toContainText(/à \d+(,\d)? km|Toulouse|Narbonne/, { timeout: 30_000 });
    const me = await apiCall<{ profile: { departments: string[] } }>(cookie, "GET", "/me");
    expect(me.data.profile.departments).toEqual(["66"]);

    // --- Pros ---------------------------------------------------------------------------------------------------
    await page.getByText("Pros", { exact: true }).first().click();
    await page.getByTestId("pros-q").fill("detailing");
    const pros = page.getByTestId("pro-row");
    await expect(pros.filter({ hasText: "Detailing Hérault" })).toBeVisible({ timeout: 30_000 });
    await shot(page, `08-explorer-pros-${theme}`);

    // --- Pages atteintes ------------------------------------------------------------------------------------------
    await page.goto("/o/club-audois-passion");
    await expect(page.getByTestId("structure-head")).toContainText("Club Audois Passion", { timeout: 30_000 });
    await expect(page.getByTestId("follow")).toContainText(/Suivi/i);
    await expect(page.getByTestId("event-row").first()).toContainText("Narbonne");
    await shot(page, `09-structure-${theme}`);
    await page.goto("/p/detailing-herault");
    await expect(page.getByTestId("pro-head")).toContainText("Detailing Hérault", { timeout: 30_000 });
    await expect(page.getByTestId("follow-pro")).toBeVisible();
    await shot(page, `10-pro-${theme}`);
    await page.goto("/e/expo-rivesaltes-2026");
    await page.getByTestId("event-organizer").click({ timeout: 30_000 });
    await expect(page.getByTestId("structure-head")).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  }
  console.log(`Erreurs console : ${errors.length} ${errors.slice(0, 5).join(" | ")}`);
});
