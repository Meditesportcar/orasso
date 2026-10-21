import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, loginInBrowser, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Horloge simulée (lot 34a), page /admin/horloge : le super admin avance d'un jour puis d'une heure, le bandeau « Horloge
// simulée » apparaît sur tout le site, un jalon d'événement est proposé, puis « Revenir à l'heure réelle » éteint tout.
// Prérequis : site et API lancés avec DEV_CLOCK=on (et DEV_SKIP_2FA=true) sur la base locale avec le seed.
// Avec CAPTURES=1 : captures de la page, dans les deux thèmes, au bureau et à 390 px, avec le contrôle du design.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-34a-captures`;
const ADMIN = "damien@orasso.local";

test("horloge simulée : avancer, bandeau partout, jalon d'événement, retour à l'heure réelle", async ({ page }) => {
  test.setTimeout(240_000);
  const cookie = await login(ADMIN, SEED_PASSWORD);
  // État de départ propre, quoi qu'ait laissé un essai précédent.
  expect((await apiCall(cookie, "POST", "/dev/clock/reset")).status).toBe(200);
  try {
    await loginInBrowser(page, ADMIN, SEED_PASSWORD, "/admin/horloge");
    await page.goto("/admin/horloge");
    await expect(page.getByRole("heading", { name: "Horloge simulée" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Horloge", exact: true })).toBeVisible();
    await expect(page.getByTestId("clock-offset")).toHaveText("Aucun décalage");
    await expect(page.getByTestId("clock-banner")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Revenir à l'heure réelle" })).toBeDisabled();

    // +1 jour : décalage, bandeau, rattrapages affichés.
    await page.getByRole("button", { name: "Avancer d'un jour" }).click();
    await expect(page.getByTestId("clock-advanced")).toBeVisible();
    await expect(page.getByTestId("clock-offset")).toHaveText("+1 j");
    await expect(page.getByTestId("clock-banner")).toHaveText("Horloge simulée : +1 j");
    await expect(page.getByTestId("clock-advanced")).toContainText("points.sweep");

    // +1 heure : s'ajoute.
    await page.getByRole("button", { name: "Avancer d'une heure" }).click();
    await expect(page.getByTestId("clock-offset")).toHaveText("+1 j 1 h");
    await expect(page.getByTestId("clock-banner")).toHaveText("Horloge simulée : +1 j 1 h");

    // Le bandeau suit sur les autres pages.
    await page.goto("/");
    await expect(page.getByTestId("clock-banner")).toBeVisible();
    await page.goto("/admin/horloge");

    // Les jalons du premier événement sont proposés.
    await expect(page.getByTestId("clock-milestones").locator("li")).toHaveCount(5);

    if (process.env.CAPTURES) {
      mkdirSync(DIR, { recursive: true });
      const audits: Record<string, unknown> = {};
      for (const theme of ["beton", "sable"] as const) {
        for (const view of [
          { id: "bureau", width: 1280, height: 900 },
          { id: "mobile", width: 390, height: 844 },
        ]) {
          await page.context().addCookies([{ name: "orasso-theme", value: theme, url: page.url() }]);
          await page.setViewportSize({ width: view.width, height: view.height });
          await page.reload();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${DIR}/horloge-${theme}-${view.id}.png`, fullPage: true });
          audits[`horloge-${theme}-${view.id}`] = await auditPage(page);
        }
      }
      writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
    }

    // Retour à l'heure réelle.
    await page.getByRole("button", { name: "Revenir à l'heure réelle" }).click();
    await expect(page.getByTestId("clock-reset-done")).toBeVisible();
    await expect(page.getByTestId("clock-offset")).toHaveText("Aucun décalage");
    await expect(page.getByTestId("clock-banner")).toHaveCount(0);
    expect((await apiCall(cookie, "GET", "/dev/clock")).data).toMatchObject({ offsetMs: 0 });

    // Pas de recul : une date passée est refusée avec un message.
    await page.getByLabel("Avancer jusqu'à").fill("2020-01-01T10:00");
    await page.getByRole("button", { name: "Avancer jusqu'à", exact: true }).click();
    await expect(page.getByTestId("clock-error")).toContainText("reculer");
  } finally {
    await apiCall(cookie, "POST", "/dev/clock/reset");
  }
});
