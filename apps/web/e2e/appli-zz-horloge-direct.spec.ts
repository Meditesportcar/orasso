import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { apiCall, login } from "./helpers";
import { open, rules, shot, signIn, THEMES, toOrganizer } from "./helpers/lot52";

// Lot 52, côté appli : le Direct hors événement. Fichier à part, nommé pour passer en dernier de la recette de l'appli :
// il avance l'horloge simulée (DEV_CLOCK=on) de plusieurs jours, ce qui règle le Salon (J+2) et déclenche les tâches
// planifiées ; les autres recettes de l'organisateur ne le supportent pas. Relancer `pnpm db:seed --reset` ensuite.
// Lancer avec APP_URL=http://localhost:<relais> (voir `appli-lot52.spec.ts`).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 20_000 });

test("Direct hors événement : prochain événement, à trier, zones, équipe (horloge avancée, en dernier)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // Le Salon Argelès a lieu « aujourd'hui » dans le seed (début 1 h après le seed) : on avance l'horloge de développement
  // trois jours plus tard à 9 h, calculé d'après la date de ce Salon (jamais de date codée en dur). Ni le Salon, ni la
  // Nocturne (J+2), ni les événements « demain 18 h » que les autres recettes créent ne sont alors le jour même : le Direct
  // montre le prochain événement du seed (Expo Rivesaltes), quels que soient les autres événements créés avant.
  const apiDir = resolve(import.meta.dirname, "../../api");
  const clock = (...args: string[]) =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/dev-clock.ts", ...args], {
      cwd: apiDir,
      stdio: "pipe",
      timeout: 120_000,
    });
  const rows = await apiCall<{ items: { slug: string; startsAt: string }[] }>(
    await login("damien@orasso.local"),
    "GET",
    "/dev/clock/events",
  );
  const salonStart = rows.data.items.find((i) => i.slug === "salon-argeles")?.startsAt;
  expect(salonStart).toBeTruthy();
  const day = new Date(
    `${new Date(salonStart ?? 0).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })}T12:00:00Z`,
  );
  day.setUTCDate(day.getUTCDate() + 3);
  clock("to", `${day.toISOString().slice(0, 10)}T09:00`);
  try {
    for (const theme of THEMES) {
      const { ctx, page } = await open(browser, theme);
      await signIn(page, "damien@orasso.local");
      await toOrganizer(page, "MéditeSportCar");
      const next = page.getByTestId("orga-direct-next");
      await expect(next).toBeVisible({ timeout: 60_000 });
      await expect(next).toContainText("Prochain · ");
      await expect(page.getByTestId("orga-direct-retained")).toContainText("Retenus");
      await expect(page.getByTestId("orga-direct-retained")).toContainText(/Demain|J-\d+/);
      await expect(page.getByTestId("orga-direct-retained")).toContainText("À trier");
      await expect(page.getByTestId("orga-direct-sort")).toBeVisible();
      await expect(next).toContainText("Retenus par zone");
      await expect(page.getByTestId("orga-direct-team")).toContainText("Équipe : ");
      await expect(page.getByTestId("orga-direct-team-see")).toBeVisible();
      await rules(page, theme, "Direct · prochain");
      await shot(page, "direct-prochain", theme);
      // « Trier » ouvre le Tri sur cet événement.
      await page.getByTestId("orga-direct-sort").click();
      await expect(page).toHaveURL(/\/tri/, { timeout: 30_000 });
      await ctx.close();
    }
  } finally {
    clock("reset");
  }
});
