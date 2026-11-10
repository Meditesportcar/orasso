import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8f1 (variante A1 de la maquette R8.2), côté site (`/app/fil`, API et site lancés) : les trois filtres et le bouton
// icône « Publier » sur une seule rangée (même centre vertical), bouton de 48 px nommé « Publier » qui ouvre les deux choix
// sous la rangée sans décaler le Fil, changer de filtre recharge le Fil. À 390 et 1280 px.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r8f1-captures/apres/recette-site`;

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

for (const width of [390, 1280]) {
  test(`une seule rangée, bouton « Publier » de 48 px, deux choix sans décaler le Fil (${width} px)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await setTheme(page, "beton");
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
    await expect(page.getByTestId("fil-publish-open")).toBeVisible();
    await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty"))).toBeVisible({ timeout: 30_000 });
    const seg = await box(page, "fil-filters");
    const pub = await box(page, "fil-publish-open");
    expect(Math.abs(seg.y + seg.height / 2 - (pub.y + pub.height / 2))).toBeLessThanOrEqual(2);
    expect(pub.x).toBeGreaterThanOrEqual(seg.x + seg.width - 1);
    expect(Math.round(pub.width)).toBe(48);
    expect(Math.round(pub.height)).toBe(48);
    await expect(page.getByTestId("fil-publish-open")).toHaveAttribute("aria-label", "Publier");
    await expect(page.getByRole("tablist", { name: "Filtres du Fil" })).toBeVisible();
    for (const f of ["for_you", "nearby", "following"]) {
      expect(await cutWords(page, `fil-filters-${f}`)).toEqual([]);
      // Le libellé tient dans son segment : rien ne déborde (« Abonnements » à 390 px).
      const over = await page.getByTestId(`fil-filters-${f}`).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `libellé ${f} qui déborde`).toBeLessThanOrEqual(0);
    }
    await shot(page, `haut-${width}`);
    // Les choix s'ouvrent sous la rangée, alignés à droite, sans décaler le Fil.
    const list = page.getByTestId("fil-list").or(page.getByTestId("fil-empty"));
    const before = (await list.first().boundingBox())?.y;
    await page.getByTestId("fil-publish-open").click();
    const story = page.getByTestId("fil-publish-choose-story");
    await expect(story).toBeVisible();
    await expect(page.getByTestId("fil-publish-choose-post")).toBeVisible();
    expect((await list.first().boundingBox())?.y).toBe(before);
    const sb = await story.boundingBox();
    expect(sb?.y ?? 0).toBeGreaterThanOrEqual(seg.y + seg.height);
    expect((sb?.x ?? 0) + (sb?.width ?? 0)).toBeLessThanOrEqual(pub.x + pub.width + 1);
    await shot(page, `choix-${width}`);
    await story.click();
    await expect(page.getByTestId("story-publish")).toBeVisible();
  });
}

test("changer de filtre recharge le Fil", async ({ page }) => {
  test.setTimeout(180_000);
  await setTheme(page, "sable");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil");
  await expect(page.getByTestId("fil-publish-open")).toBeVisible();
  for (const f of ["nearby", "following", "for_you"]) {
    const loaded = page.waitForResponse((r) => r.url().includes("/api/fil") && r.url().includes(`filter=${f}`));
    await page.getByTestId(`fil-filters-${f}`).click();
    expect((await loaded).ok()).toBe(true);
    await expect(page.getByTestId(`fil-filters-${f}`)).toHaveAttribute("aria-selected", "true");
  }
});

test("la liste des choix se ferme au clic ailleurs, à Échap et au changement de filtre", async ({ page }) => {
  test.setTimeout(180_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
  const story = page.getByTestId("fil-publish-choose-story");
  const open = page.getByTestId("fil-publish-open");
  await open.click();
  await expect(story).toBeVisible();
  await page.mouse.click(5, 450);
  await expect(story).toBeHidden();
  await open.click();
  await expect(story).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(story).toBeHidden();
  await open.click();
  await expect(story).toBeVisible();
  await page.getByTestId("fil-filters-nearby").click();
  await expect(story).toBeHidden();
  // Un second clic sur le bouton referme aussi la liste.
  await open.click();
  await expect(story).toBeVisible();
  await open.click();
  await expect(story).toBeHidden();
});

test("les liens à texte de la classe .fil-publish gardent leur texte entier dans leur fond (état vide de Mes publications)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await setTheme(page, "beton");
  await loginInBrowser(page, "paul.photo@orasso.local", undefined, "/app/fil/mes-publications");
  const link = page.getByTestId("fil-mine-empty").locator("a.fil-publish");
  await expect(link).toBeVisible();
  await expect(link).toHaveText("Publier");
  const b = await link.boundingBox();
  expect(b?.height ?? 0).toBeGreaterThanOrEqual(50);
  expect(b?.width ?? 0).toBeGreaterThan(60);
  expect(await link.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});
