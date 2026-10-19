import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { accountQr, apiCall, createPublishedPro, SEED_PASSWORD, signUpApi, unique } from "./helpers";

// Parcours 6 (docs/02), côté appli : le pro lit le QR de compte du passionné dans la casquette Pro (version web de
// recette de l'appli, sans caméra : la charge utile est saisie dans le champ « Recette ») → pseudo + grade + remise,
// rien d'autre → la remise est comptée dans les statistiques. Aucun bouton ni lien de paiement dans la casquette.
// Lancer avec APP_URL=http://localhost:8141 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-14-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("appli, casquette Pro : scanner le QR de compte, remise selon le grade, publier, stats, abonnement sans paiement", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const proPseudo = `GarageApp_${s}`;
  const email = `${proPseudo.toLowerCase()}@e2e.orasso.test`;
  const proCookie = await signUpApi(proPseudo);
  const pro = await createPublishedPro(proCookie, `Garage appli ${s}`);
  const fanCookie = await signUpApi(`PassionneApp_${s}`);

  const errors: string[] = [];
  for (const theme of ["sable", "beton"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
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
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil/, { timeout: 30_000 });

    // Moi → Mes casquettes → Pro.
    await page.goto("/moi");
    await expect(page.getByText("Mes casquettes")).toBeVisible({ timeout: 30_000 });
    await shot(page, `01-moi-casquettes-${theme}`);
    await page.getByTestId("casquette-pro").click();
    // Lot 40 : la casquette Pro s'ouvre sur l'Accueil (au centre) ; le Scanner est le premier onglet.
    await page.waitForURL(/\/accueil/);
    await page.getByRole("tab", { name: "Scanner" }).click();
    await page.waitForURL(/\/scanner/);
    await expect(page.getByText("Scanner").first()).toBeVisible();
    await shot(page, `02-scanner-attente-${theme}`);

    // Scan du QR de compte du passionné : pseudo, grade, remise (Rodage −5 %).
    const first = theme === "sable";
    const payload = await accountQr(fanCookie);
    const field = page.getByLabel(/Recette · charge utile/);
    await field.fill(first ? payload : "OA1AAAAAAAAAAA.12345678");
    await field.press("Enter");
    const result = page.getByTestId("pro-scan-result");
    await expect(result).toBeVisible({ timeout: 20_000 });
    if (first) {
      await expect(result).toContainText("PassionneApp");
      await expect(result).toContainText("Rodage");
      await expect(page.getByTestId("pro-scan-discount")).toHaveText("−5 %");
      // « Rien d'autre » : ni e-mail, ni points, ni véhicules.
      await expect(result).not.toContainText("@");
      await shot(page, `03-scan-remise-${theme}`);
      // Le même code lu une seconde fois est refusé (rejeu).
      await field.fill(`${payload} `);
      await field.press("Enter");
      await page.waitForTimeout(500);
    } else {
      await expect(result).toContainText(/Compte inconnu|Refusé/);
      await shot(page, `03-scan-refuse-${theme}`);
    }

    // Fiche, Publier, Stats (onglets de la casquette).
    await page.goto("/fiche");
    await expect(page.getByTestId("pro-subscription")).toHaveText("Gratuit jusqu'au 21 juin 2027");
    await expect(page.getByText("Remises par grade")).toBeVisible();
    const body = (await page.locator("body").textContent()) ?? "";
    expect(body).not.toMatch(/€|\bprix\b|stripe|checkout/i);
    await expect(page.getByRole("button", { name: /payer|acheter|souscrire|s'abonner/i })).toHaveCount(0);
    await shot(page, `04-fiche-${theme}`);

    // Lot 40 : Publier n'est plus un onglet ; on y arrive depuis Ma fiche.
    await page.getByRole("tab", { name: "Ma fiche", exact: true }).click();
    await page.getByTestId("pro-new-post").click();
    await expect(page.getByTestId("pro-posts-counter")).toBeVisible({ timeout: 30_000 });
    if (first) {
      await page.getByLabel("Titre").fill("Offre appli");
      await page.getByLabel("Texte").fill("Nouvelle offre publiée depuis l'appli.");
      await page.getByRole("button", { name: "Publier", exact: true }).click();
      await expect(page.getByText("Publié : tes abonnés la voient sur ta fiche.")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("pro-posts-counter")).toHaveText("1 / 4");
    }
    await shot(page, `05-publier-${theme}`);

    await page.goto("/stats");
    await expect(page.getByText("remises utilisées", { exact: true })).toBeVisible({ timeout: 30_000 });
    await shot(page, `06-stats-${theme}`);
    await ctx.close();
  }

  // La remise lue dans l'appli est comptée dans les statistiques du pro (et le refus ne l'est pas).
  const stats = await apiCall<{ discounts: number; discountsByGrade: Record<string, number> }>(
    proCookie,
    "GET",
    `/pros/${pro.id}/stats?days=7`,
  );
  expect(stats.data.discounts).toBe(1);
  expect(stats.data.discountsByGrade).toEqual({ rodage: 1 });
  expect(errors.filter((e) => !/favicon|manifest/i.test(e)).slice(0, 5)).toEqual([]);
});
