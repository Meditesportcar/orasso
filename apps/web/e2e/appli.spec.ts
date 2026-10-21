import { mkdirSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Recette de l'appli dans un navigateur (`expo start --web` derrière `apps/mobile/scripts/web-isolated.mjs`), lot 12 :
// carnet de route, feuille « Ton avis », avis sur la page de l'événement, points de Moi, dans les deux thèmes à 390 px.
// Lancer avec APP_URL=http://localhost:8111 APP_EMAIL=<passionné pointé> APP_EVENT=<slug de l'événement passé>.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-12-captures/appli`;
test.skip(!APP || !process.env.APP_EMAIL, "Appli : lancer avec APP_URL et APP_EMAIL");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("appli : carnet de route, avis, page de l'événement, Moi", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const notes: string[] = [];
  for (const theme of ["sable", "beton"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
    }, theme);
    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(process.env.APP_EMAIL ?? "");
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil/, { timeout: 30_000 });
    await page.goto("/acces");
    // Lot 43 : le carnet de route est le segment « Passées » de Sorties.
    await page.getByText(/^Passées · \d+$/).click();
    await expect(page.getByTestId("ticket-past").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `01-acces-carnet-${theme}`);

    const leave = page.getByRole("button", { name: "Laisser un avis" });
    if (theme === "sable" && (await leave.count()) > 0) {
      await leave.first().click();
      await expect(page.getByRole("button", { name: "Envoyer mon avis" })).toBeVisible();
      await shot(page, `02-feuille-avis-vide-${theme}`);
      await page.getByLabel("2 étoiles sur 3").click();
      await page.getByLabel("Un mot sur l'organisation, l'accueil, l'ambiance").fill("Recette appli : belle soirée.");
      await shot(page, `03-feuille-avis-remplie-${theme}`);
      await page.getByRole("button", { name: "Envoyer mon avis" }).click();
      await expect(page.getByRole("button", { name: "Envoyer mon avis" })).toHaveCount(0, { timeout: 15_000 });
      notes.push("avis envoyé depuis l'appli");
    }
    await expect(page.getByText("Avis donné").first()).toBeVisible();
    await page.getByText("Avis donné").first().scrollIntoViewIfNeeded();
    await shot(page, `04-carnet-avis-donne-${theme}`);

    if (process.env.APP_EVENT) {
      await page.goto(`/e/${process.env.APP_EVENT}`);
      await expect(page.getByText("Avis des participants")).toBeVisible({ timeout: 30_000 });
      await page.getByText("Avis des participants").scrollIntoViewIfNeeded();
      await shot(page, `05-evenement-avis-${theme}`);
    }
    await page.goto("/moi");
    await page.waitForTimeout(1500);
    await shot(page, `06-moi-points-${theme}`);
    notes.push(`${theme} : ${errors.length} erreur(s) console ${errors.slice(0, 3).join(" | ")}`);
    await ctx.close();
  }
  writeFileSync(`${DIR}/notes.txt`, notes.join("\n"));
});
