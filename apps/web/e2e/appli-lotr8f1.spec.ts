import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8f1 (variante A1 de la maquette R8.2), côté appli (version web compilée de recette, `APP_URL`) : le haut du Fil tient
// sur une seule rangée (le sélecteur « Pour toi · Autour de moi · Abonnements » et le bouton icône « Publier » ont le même
// centre vertical), le bouton s'appelle « Publier » (48 px, sans texte) et ouvre « En story » / « Dans le Fil », changer de
// filtre recharge le Fil, police ×1,3 : aucun mot coupé.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8f1-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: string, width: number, scale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const box = async (page: Page, id: string) => {
  const b = await page.getByTestId(id).first().boundingBox();
  if (!b) throw new Error(`pas de boîte pour ${id}`);
  return b;
};

for (const { width, scale } of [
  { width: 384, scale: 1 },
  { width: 390, scale: 1.3 },
] as const) {
  test(`une seule rangée, bouton « Publier » de 48 px, deux choix (${width} px, police ×${scale})`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await open(browser, "damien@orasso.local", "beton", width, scale);
    const seg = await box(page, "fil-filters");
    const pub = await box(page, "fil-publish-open");
    // Même rangée : les centres verticaux sont les mêmes (par les boîtes englobantes), le bouton est à droite du sélecteur.
    expect(Math.abs(seg.y + seg.height / 2 - (pub.y + pub.height / 2))).toBeLessThanOrEqual(2);
    expect(pub.x).toBeGreaterThanOrEqual(seg.x + seg.width - 1);
    // Carré de 48 px (jeton `touch`), sans texte, nommé « Publier ».
    expect(Math.round(pub.width)).toBe(48);
    expect(Math.round(pub.height)).toBe(48);
    await expect(page.getByTestId("fil-publish-open")).toHaveText("");
    await expect(page.getByRole("button", { name: "Publier", exact: true })).toHaveCount(1);
    // Les trois filtres, aucun mot coupé.
    for (const f of ["for_you", "nearby", "following"]) {
      await expect(page.getByTestId(`fil-filters-${f}`)).toBeVisible();
      expect(await cutWords(page, `fil-filters-${f}`)).toEqual([]);
      // Rien ne déborde du segment (« Abonnements » jamais coupé ni rogné).
      const over = await page
        .getByTestId(`fil-filters-${f}`)
        .evaluate((el) => Math.max(...[el, ...el.querySelectorAll("*")].map((n) => n.scrollWidth - n.clientWidth)));
      expect(over, `libellé ${f} qui déborde`).toBeLessThanOrEqual(0);
    }
    await shot(page, `haut-${width}-x${scale}`);
    await page.getByTestId("fil-publish-open").click();
    await expect(page.getByTestId("fil-publish-choose-story")).toBeVisible();
    await expect(page.getByTestId("fil-publish-choose-post")).toBeVisible();
    await shot(page, `choix-${width}-x${scale}`);
    // « Dans le Fil » ouvre aussi la publication au Fil.
    await page.getByTestId("fil-publish-choose-post").click();
    await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });
}

test("changer de filtre recharge le Fil ; « En story » ouvre la publication d'une story", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local", "sable", 390, 1);
  for (const f of ["nearby", "following", "for_you"]) {
    const loaded = page.waitForResponse((r) => r.url().includes("/api/fil") && r.url().includes(`filter=${f}`));
    await page.getByTestId(`fil-filters-${f}`).click();
    expect((await loaded).ok()).toBe(true);
  }
  await page.getByTestId("fil-publish-open").click();
  await page.getByTestId("fil-publish-choose-story").click();
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});
