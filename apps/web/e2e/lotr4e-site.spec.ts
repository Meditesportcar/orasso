import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  chooseSitePhoto,
  loginInBrowser,
  randomPlate,
  samplePhoto,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R4e, côté site (raccord de l'appli), décisions de Damien du 24/10 : « Version (facultatif) » dans la fiche
// technique de l'ajout (`/app/garage/nouveau`) et de « Modifier la fiche » (`/app/garage/:id`), le nom « Volkswagen Golf
// Mk4 GTI » entier, la ligne « Version » de la fiche et de la vitrine publique (`/v/:id`), vue par un autre membre ; la
// recherche « golf gti ». Béton et Sable, 390 et 1 280 px. API et site lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4e-captures/apres/site`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`version du véhicule sur le site (${theme}, ${width} px)`, async ({ browser }) => {
      test.setTimeout(240_000);
      const pseudo = `R4eS${unique()}`.slice(0, 20);
      // Version propre au test : la recherche globale est limitée, les Golf R32 des passages précédents la rempliraient.
      const tag = unique().slice(-5).toUpperCase();
      const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
      const cookie = await signUpApi(pseudo, email);
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email, undefined, "/app/garage/nouveau");

      // --- Ajout : la version dans la fiche technique ------------------------------------------------------------------
      await chooseSitePhoto(page, { name: "golf.png", mimeType: "image/png", buffer: samplePhoto([60, 70, 90]) });
      await page.getByTestId("site-no-plate").click();
      await page.getByTestId("site-no-plate-yes").click();
      await page.getByLabel("Numéro de plaque · privé").fill(randomPlate());
      await page.getByLabel("Marque", { exact: true }).selectOption({ label: "Volkswagen" });
      const model = page.getByLabel("Modèle", { exact: true });
      await expect(model.locator("option", { hasText: /^Golf$/ })).toHaveCount(1);
      await model.selectOption({ label: "Golf" });
      const generation = page.getByLabel("Génération", { exact: true });
      const mk4 = generation.locator("option", { hasText: /^Mk4/ });
      await expect(mk4).toHaveCount(1);
      await generation.selectOption((await mk4.getAttribute("value")) as string);
      const version = page.getByLabel("Version (facultatif)");
      await expect(page.getByText("Par exemple CC, SW, GTI, Phase 2")).toBeVisible();
      await version.fill("GTI");
      await page.getByTestId("add-engine-fields").scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-01-ajout-version`);
      const audit = await auditPage(page);
      expect(audit.greens).toEqual([]);
      expect(audit.horizontalScroll).toBe(false);
      await page.getByRole("button", { name: "Envoyer", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.endsWith("/nouveau"), { timeout: 30_000 });
      const mine = await apiCall<{ id: string; label: string; version: string | null }[]>(
        cookie,
        "GET",
        "/me/vehicles",
      );
      const vehicle = mine.data[0];
      expect(vehicle).toMatchObject({ label: "Volkswagen Golf Mk4 GTI", version: "GTI" });

      // --- Page du véhicule : nom entier, ligne « Version », « Modifier la fiche » -------------------------------------
      await page.goto(`/app/garage/${vehicle?.id}`);
      await expect(page.getByTestId("vehicle-name")).toHaveText("Volkswagen Golf Mk4 GTI");
      const fact = page.locator("dt", { hasText: /^Version$/ });
      await expect(fact).toBeVisible();
      await expect(fact.locator("xpath=following-sibling::dd[1]")).toHaveText("GTI");
      await shot(page, `${theme}-${width}-02-vehicule-nom`);
      await fact.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-03-vehicule-fiche`);
      await page.getByText("Modifier la fiche").click();
      const edit = page.getByTestId("vehicle-edit");
      await expect(edit.getByLabel("Version (facultatif)")).toHaveValue("GTI");
      await edit.getByLabel("Version (facultatif)").fill(`R32 ${tag}`);
      await edit.getByLabel("Version (facultatif)").scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-04-modifier-version`);
      await edit.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByTestId("vehicle-name")).toHaveText(`Volkswagen Golf Mk4 R32 ${tag}`);
      expect((await auditPage(page)).horizontalScroll).toBe(false);

      // --- Vitrine publique vue par un autre membre, et sa recherche ----------------------------------------------------
      const otherPseudo = `R4eT${unique()}`.slice(0, 20);
      const otherEmail = `${otherPseudo.toLowerCase()}@e2e.orasso.test`;
      const other = await signUpApi(otherPseudo, otherEmail);
      const found = await apiCall<{ vehicles: { id: string; label: string }[] }>(
        other,
        "GET",
        `/search?q=golf%20r32%20${tag}`,
      );
      expect(found.data.vehicles.map((v) => v.id)).toContain(vehicle?.id);
      const otherCtx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const otherPage = await otherCtx.newPage();
      await setTheme(otherPage, theme);
      await loginInBrowser(otherPage, otherEmail, undefined, `/v/${vehicle?.id}`);
      await otherPage.goto(`/v/${vehicle?.id}`);
      const shown = otherPage.locator("dt", { hasText: /^Version$/ });
      await expect(shown).toBeVisible();
      await expect(shown.locator("xpath=following-sibling::dd[1]")).toHaveText(`R32 ${tag}`);
      await shot(otherPage, `${theme}-${width}-05-vitrine-autre-membre`);
      await otherCtx.close();
      await ctx.close();
    });
  }
}
