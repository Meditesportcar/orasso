import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords, expectCutWordsDetected, textLines } from "./cutWords";
import { apiCall, login, SEED_PASSWORD } from "./helpers";

// Lot R7j (D38), côté appli (version web compilée de recette, `APP_URL`) : les souvenirs « il y a un an… ». Le seed `memories`
// pose, le jour où on le lance, un événement et un tampon d'il y a un an pour Damien_66. Vérifie : le bloc « Souvenirs » de
// l'Accueil, la page du souvenir (affiche ou photo masquée, tampon, « En story » (R7f4)), la carte du Fil, un compte sans
// tampon (rien, et « pas disponible »), puis, avec l'horloge simulée (+1 jour), le bloc absent le lendemain.
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
type Today = {
  eventId: string;
  title: string;
  yearsAgo: number;
  photoUrl: string | null;
  car: { label: string; rank: number; total: number } | null;
}[];

/** Le bouton tient dans l'écran (rien ne déborde à droite). */
async function insideViewport(page: Page, testId: string) {
  const box = await page.getByTestId(testId).first().boundingBox();
  const width = page.viewportSize()?.width ?? 384;
  expect(box, testId).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0), `${testId} déborde`).toBeLessThanOrEqual(width);
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", "beton");
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
  return { ctx, page };
}

test("souvenir du jour : bloc de l'Accueil, page, carte du Fil ; rien sans tampon ; absent le lendemain", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const cookie = await login("damien@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: [] });
  const memory = (await apiCall<Today>(cookie, "GET", "/me/memories/today")).data[0]!;
  expect(memory).toBeTruthy();
  expect(memory.photoUrl ?? "").not.toContain("scirocco-plaque-lisible");
  try {
    for (const scale of [1, 1.3]) {
      const { ctx, page } = await open(browser, "damien@orasso.local", scale);
      const home = page.getByTestId("home-memories");
      await expect(home).toBeVisible({ timeout: 30_000 });
      await expect(home).toContainText("Il y a un an, jour pour jour");
      await expect(home).toContainText(`Tu étais là : ${memory.title}`);
      await expect(home.getByTestId("memory-share")).toBeVisible();
      // La carte suit la maquette : le tampon, « Le plateau » en secondaire, la ligne de ma voiture quand elle y était.
      await expect(home.getByTestId("memory-photo-stamp")).toBeVisible();
      await expect(home.getByTestId("home-memory-plateau")).toBeVisible();
      if (memory.car) {
        await expect(home.getByTestId("home-memory-car")).toContainText(`n° ${memory.car.rank} du plateau`);
      }
      // Titre : aucun mot coupé au milieu, police 1 comme 1,3 (le témoin coupé volontairement prouve que le contrôle voit).
      await expectCutWordsDetected(page);
      expect(await cutWords(page, "home-memory-title"), `titre de l'Accueil à la police ${scale}`).toEqual([]);
      await insideViewport(page, "home-memory-plateau");
      // Les libellés des boutons de la carte tiennent sur une ligne ; police agrandie, ils passent l'un sous l'autre.
      for (const id of ["home-memory-open", "home-memory-plateau"]) {
        expect(await textLines(page, id), `${id} à la police ${scale}`).toBe(1);
      }
      if (scale >= 1.15) {
        const open = await page.getByTestId("home-memory-open").first().boundingBox();
        const plateau = await page.getByTestId("home-memory-plateau").first().boundingBox();
        expect((plateau?.y ?? 0) >= (open?.y ?? 0) + (open?.height ?? 0) - 1, "boutons empilés").toBe(true);
      }
      await page.getByTestId("home-memory-open").click();
      await expect(page.getByTestId("memory-title")).toHaveText(`Tu étais là : ${memory.title}`, { timeout: 30_000 });
      await expect(page.getByTestId("memory-stamp")).toBeVisible();
      await expect(page.getByTestId("memory-event")).toBeVisible();
      await expect(page.getByTestId("memory-eyebrow")).toHaveText("Il y a un an, jour pour jour");
      expect(await cutWords(page, "memory-title"), `titre de la page à la police ${scale}`).toEqual([]);
      await insideViewport(page, "memory-event");
      await expect(page.getByTestId("memory-share")).toBeVisible();
      if (scale === 1) {
        await page.goto("/fil");
        await afterOpening(page);
        await expect(page.getByTestId("feed-memory-open").first()).toBeVisible({ timeout: 30_000 });
      }
      await ctx.close();
    }

    // Un compte sans tampon d'il y a un an : ni bloc, ni page.
    const k = await open(browser, "kenji@orasso.local");
    await expect(k.page.getByTestId("home-memories")).toHaveCount(0);
    await k.page.goto(`/souvenir/${memory.eventId}`);
    await afterOpening(k.page);
    await expect(k.page.getByTestId("memory-error")).toContainText("Ce souvenir n'est pas disponible", {
      timeout: 30_000,
    });
    await expect(k.page.getByTestId("memory-title")).toHaveCount(0);
    await k.ctx.close();

    // Le lendemain : le bloc a disparu de l'Accueil.
    expect((await apiCall(cookie, "POST", "/dev/clock/advance", { by: "1d" })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 4_000));
    const next = await open(browser, "damien@orasso.local");
    await expect(next.page.getByTestId("home-memories")).toHaveCount(0);
    await next.ctx.close();
  } finally {
    await apiCall(cookie, "POST", "/dev/clock/reset");
  }
});
