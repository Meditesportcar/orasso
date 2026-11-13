import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9d, côté site : l'Activité de la structure (la cloche de l'organisateur) et les Messages (la bulle). Damien_66 est
// propriétaire de MéditeSportCar (seed « Activité de la structure » : deux candidatures à trier sur la Nocturne, une mention
// de Kenji_66, un commentaire de Lea_11, la demande de collaboration de Kenji_66, une demande de staff). Vérifie : la page
// `/orga/<structure>/activite` (chips, « Demandes · N », lignes), le filtre « À trier », la pastille de la barre latérale,
// « Messages » (titre, « Nouveau message » et ses deux lignes), la cloche personnelle sans rien de la structure.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9d-captures/apres/recette-site`;
const SLUG = "meditesportcar";
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["beton", "sable"] as const) {
  for (const viewport of [MOBILE, { width: 1280, height: 800 }] as const) {
    test(`Activité de la structure et Messages (${theme}, ${viewport.width} px)`, async ({ browser }) => {
      test.setTimeout(180_000);
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, `/orga/${SLUG}/activite`);
      await page.goto(`/orga/${SLUG}/activite`);
      await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
      // Les cinq chips, dans l'ordre de la maquette.
      const chips = page.locator("nav.sact__chips a");
      await expect(chips).toHaveText(["Tout", "À trier", "Mentions", "Commentaires", "Collaborations"]);
      // La ligne « Demandes · N » (staff et collaboration) et la ligne « candidatures à trier ».
      await expect(page.getByTestId("sact-requests-row")).toContainText(/Demandes · \d+/);
      await expect(
        page
          .getByTestId("activity-row")
          .filter({ hasText: /candidatures? à trier/ })
          .first(),
      ).toBeVisible();
      await shot(page, `activite-${theme}-${viewport.width}`);

      // Le filtre « À trier » ne garde que les candidatures.
      await page.getByTestId("sact-chip-triage").click();
      await page.waitForURL((url) => url.searchParams.get("filtre") === "triage");
      const rows = page.getByTestId("activity-row");
      await expect(rows.first()).toContainText(/à trier/);
      await expect(rows.filter({ hasNotText: /à trier/ })).toHaveCount(0);

      // La ligne mène au tri de l'événement.
      await rows.first().locator("a").click();
      await page.waitForURL(/\/orga\/meditesportcar\/e\/[^/]+\/candidatures/);

      // Messages : le titre, « Nouveau message » et ses deux lignes.
      await page.goto(`/orga/${SLUG}/communication`);
      await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Nouveau message" }).click();
      await expect(page.getByTestId("comm-new-group")).toContainText("Message groupé");
      await expect(page.getByTestId("comm-new-staff")).toContainText("Discussion de staff");
      await shot(page, `messages-${theme}-${viewport.width}`);

      // La cloche personnelle ne montre rien de la structure.
      await page.goto("/app/activite");
      await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
      await expect(page.getByText(/candidatures? à trier/)).toHaveCount(0);
      await ctx.close();
    });
  }
}
