import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, login } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7l1 : les réglages de l'administration portent trois champs « Points · 1er / 2e / 3e d'un vote » à la place de
// « Prix du public (gagnant) ». Régler le 1er à 20 points, l'enregistrer, le lire dans l'API, le remettre à 15. Avec
// CAPTURES=1 : l'écran dans les deux thèmes, bureau (1280) et 390 px.
// Prérequis : site et API lancés (DEV_SKIP_2FA=true) sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7l1-captures/apres`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;

test("réglages : le podium des votes remplace le prix du public", async ({ browser }) => {
  const damien = await login("damien@orasso.local");
  const open = async (theme: "beton" | "sable", width: number, height: number) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const cookies: { name: string; value: string; url: string }[] = [{ name: "orasso-theme", value: theme, url: WEB }];
    for (const pair of damien.split("; ").filter(Boolean)) {
      const i = pair.indexOf("=");
      cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: WEB });
    }
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    await page.goto(`${WEB}/admin/reglages`);
    return { ctx, page };
  };

  const { ctx, page } = await open("beton", 1280, 900);
  const form = page.getByTestId("admin-points");
  await expect(form.getByLabel("Points · 1er d'un vote")).toHaveValue("15");
  await expect(form.getByLabel("Points · 2e d'un vote")).toHaveValue("10");
  await expect(form.getByLabel("Points · 3e d'un vote")).toHaveValue("5");
  await expect(form.getByText("Prix du public")).toHaveCount(0);

  await form.getByLabel("Points · 1er d'un vote").fill("20");
  await form.getByRole("button", { name: "Enregistrer le barème" }).click();
  await expect(page.getByTestId("settings-done")).toBeVisible();
  const read = async () =>
    (await apiCall<{ entries: { key: string; value: number }[] }>(damien, "GET", "/admin/settings")).data.entries.find(
      (e) => e.key === "points.vote_first",
    )?.value;
  expect(await read()).toBe(20);
  // Remis à 15 : la recette reste rejouable.
  await apiCall(damien, "PUT", "/admin/settings/points.vote_first", { value: 15 });
  expect(await read()).toBe(15);
  // Une valeur hors barème est refusée par l'API.
  expect((await apiCall(damien, "PUT", "/admin/settings/points.vote_second", { value: -1 })).status).toBe(400);
  await ctx.close();

  if (process.env.CAPTURES === "1") {
    mkdirSync(DIR, { recursive: true });
    for (const theme of ["beton", "sable"] as const) {
      for (const view of VIEWS) {
        const shot = await open(theme, view.width, view.height);
        await shot.page.waitForTimeout(800);
        await shot.page.screenshot({ path: `${DIR}/admin-reglages-${theme}-${view.id}.png`, fullPage: true });
        await shot.ctx.close();
      }
    }
  }
});
