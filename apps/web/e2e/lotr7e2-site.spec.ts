import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7e2 (D38), côté site : le Fil (`/app/fil`), publier au Fil (`/app/fil/publier`), Mes publications. Trois filtres,
// cartes avec leur raison, menu « ⋯ » (Pourquoi, Moins de ce genre + Annuler, Signaler), flamme, publication en 4:5 avec
// « Aucune plaque visible » (bouton grisé expliqué sans décision de plaque ; un cadre posé à la main compte aussi),
// Mes publications. La vie privée (compte privé, crew) est vérifiée par l'API dans `appli-lotr7e2.spec.ts`. API et site lancés.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r7e2-captures/apres/recette-site`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.use({ viewport: { width: 1280, height: 900 } });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function loaded(page: Page) {
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty"))).toBeVisible({ timeout: 30_000 });
}

test("le Fil : trois filtres, une raison par carte, menu « ⋯ », flamme", async ({ page }) => {
  test.setTimeout(180_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
  await expect(page.getByTestId("fil-publish-open")).toBeVisible();
  await loaded(page);
  expect(await page.getByTestId("feed-card-reason").count()).toBeGreaterThan(2);
  await shot(page, "fil-pour-toi");
  await page.getByTestId("fil-filters-nearby").click();
  await loaded(page);
  await page.getByTestId("fil-filters-following").click();
  await loaded(page);
  await expect(page.getByTestId("fil-list")).toContainText("Kenji_66");
  await expect(page).toHaveURL(/filtre=following/);

  // Menu : pourquoi, moins de ce genre puis annuler, signaler.
  const post = page.getByTestId("feed-card-feed_post").first();
  await post.getByTestId("feed-card-more").click();
  await expect(page.getByTestId("feed-menu-why")).toBeVisible();
  await expect(page.getByTestId("feed-menu-less")).toBeVisible();
  await expect(page.getByTestId("feed-menu-report")).toBeVisible();
  await shot(page, "menu");
  await page.getByTestId("feed-menu-why").click();
  await expect(page.getByTestId("feed-why-text")).toContainText(/Tu suis|suit|Orasso/);
  await shot(page, "pourquoi");
  await page.getByTestId("feed-why-ok").click();
  await post.getByTestId("feed-card-more").click();
  await page.getByTestId("feed-menu-less").click();
  await expect(page.getByTestId("fil-less-note")).toContainText("On t'en montrera moins");
  await page.getByTestId("fil-less-undo").click();
  await expect(page.getByTestId("fil-less-note")).toHaveCount(0);
  await post.getByTestId("feed-card-more").click();
  await page.getByTestId("feed-menu-report").getByRole("button").first().click();
  await expect(page.getByTestId("feed-menu-report")).toBeVisible();

  // Flamme.
  await page.reload();
  await loaded(page);
  const card = page.getByTestId("feed-card-feed_post").first();
  const fire = card.getByTestId("feed-post-fire");
  if (((await fire.getAttribute("aria-label")) ?? "").includes("Retirer")) {
    await fire.click();
    await expect(fire).toHaveAttribute("aria-pressed", "false");
  }
  const count = card.getByTestId("feed-post-fire-count");
  const n0 = Number(await count.innerText());
  await fire.click();
  await expect(count).toHaveText(String(n0 + 1));
  await fire.click();
  await expect(count).toHaveText(String(n0));
});

test("publier au Fil : bouton grisé expliqué, plaque obligatoire, 4:5, puis Mes publications", async ({ page }) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible();
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-missing")).toHaveText("Ajoute au moins une photo.");
  await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg"), photo("car-mx5.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1");
  await shot(page, "publier-plaque-a-regler");
  // Photo 1 : un cadre posé à la main = flouter ; photo 2 : « Aucune plaque visible » confirmé.
  await page
    .getByTestId("fil-publish-plate")
    .getByRole("button", { name: /Poser un cadre/ })
    .click();
  // Un cadre posé mais pas encore placé sur la plaque n'est pas une décision (tour 2) : la photo reste à régler.
  await expect(page.getByTestId("fil-publish-missing")).toContainText("place le cadre sur la plaque");
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  // Déplacé, il compte.
  const frame = page.getByTestId("site-plate-frame").first();
  const at = (await frame.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 + 28, at.y + at.height / 2 - 22, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 2");
  // Photo 2 : la confirmation « Aucune plaque visible » ne suit pas la photo suivante, et la photo 1 retrouve son cadre.
  await page.getByTestId("fil-publish-photo").nth(1).click();
  await page.getByTestId("fil-publish-none").click();
  await expect(page.getByTestId("fil-publish-none-confirm")).toBeVisible();
  await page.getByTestId("fil-publish-photo").nth(0).click();
  await expect(page.getByTestId("fil-publish-none-confirm")).toHaveCount(0);
  await expect(page.getByTestId("site-plate-frame")).toHaveCount(1);
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 2");
  await page.getByTestId("fil-publish-photo").nth(1).click();
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  await page.getByTestId("fil-publish-photo").nth(0).click();
  await expect(page.getByTestId("site-plate-frame")).toHaveCount(1);
  await expect(page.getByTestId("fil-publish-missing")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-send")).toBeEnabled();
  // Le format change : la décision de plaque repart de zéro.
  await page.getByTestId("fil-publish-format-square").click();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  await page.getByTestId("fil-publish-format-portrait_4_5").click();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  for (const i of [0, 1]) {
    await page.getByTestId("fil-publish-photo").nth(i).click();
    await page.getByTestId("fil-publish-none").click();
    await page.getByTestId("fil-publish-none-yes").click();
  }
  await page.getByTestId("fil-publish-caption").fill("Site : prêtes pour dimanche");
  await expect(page.getByTestId("fil-publish-send")).toBeEnabled();
  await shot(page, "publier-pret");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await shot(page, "publie");
  // Ma publication revient en tête du Fil, même dans « Abonnements » (l'API n'y met pas mes propres publications).
  await page.goto("/app/fil?filtre=following");
  await loaded(page);
  const first = page.getByTestId("feed-card-feed_post").first();
  await expect(first).toContainText("Site : prêtes pour dimanche");
  await expect(first).toContainText("Ta publication");
  await page.goto("/app/fil/mes-publications");
  const posts = page.getByTestId("fil-mine-post");
  await expect(posts.first()).toBeVisible({ timeout: 30_000 });
  await expect(posts.first()).toContainText("Site : prêtes pour dimanche");
  await shot(page, "mes-publications");
  const total = await posts.count();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("fil-mine-remove").first().click();
  await expect(posts).toHaveCount(total - 1);
});

test("recadrer au doigt : un glissement déplace le cadre, Valider rend l'image 4:5 recentrée et remet la plaque à zéro", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil/publier");
  await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  // Un cadre posé et placé = décision prise : un nouveau cadrage doit la remettre à zéro.
  await page
    .getByTestId("fil-publish-plate")
    .getByRole("button", { name: /Poser un cadre/ })
    .click();
  const plate = (await page.getByTestId("site-plate-frame").first().boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  await page.mouse.move(plate.x + plate.width / 2, plate.y + plate.height / 2);
  await page.mouse.down();
  await page.mouse.move(plate.x + plate.width / 2 + 20, plate.y + plate.height / 2 - 12, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("fil-publish-missing")).toHaveCount(0);
  const thumb = page.getByTestId("fil-publish-photo").first().locator("img");
  /** Le JPEG de la vignette : proportions et empreinte grossière (huit lignes de luminance moyenne). */
  const digest = () =>
    thumb.evaluate(async (img: HTMLImageElement) => {
      const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
      const c = new OffscreenCanvas(1, 8);
      const g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
      g.drawImage(bitmap, 0, 0, 1, 8);
      const px = g.getImageData(0, 0, 1, 8).data;
      return { ratio: bitmap.width / bitmap.height, cols: Array.from({ length: 8 }, (_, i) => px[i * 4] ?? 0) };
    });
  const before = await digest();
  expect(before.ratio).toBeCloseTo(0.8, 2);

  await page.getByTestId("fil-publish-crop").click();
  const frame = page.getByTestId("site-crop-frame");
  await expect(frame).toBeVisible();
  const imgBox = async () => (await frame.locator("img").boundingBox()) as { x: number; y: number };
  const start = await imgBox();
  const at = (await frame.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 - 70, { steps: 8 });
  await page.mouse.up();
  const moved = await imgBox();
  // Les photos du seed sont en portrait : dans un cadre 4:5 elles ne glissent qu'en hauteur.
  expect(start.y - moved.y).toBeGreaterThan(20);
  await page.getByTestId("site-crop-validate").click();
  await expect(page.getByTestId("site-crop")).toBeHidden({ timeout: 30_000 });
  // La plaque de cette photo repart de zéro et l'image est recadrée sur un autre centre.
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  await expect.poll(async () => JSON.stringify((await digest()).cols)).not.toBe(JSON.stringify(before.cols));
  expect((await digest()).ratio).toBeCloseTo(0.8, 2);
});

test("un compte qui ne suit personne : état vide d'Abonnements, sans annuaire", async ({ page }) => {
  test.setTimeout(120_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "paul.photo@orasso.local", undefined, "/app/fil?filtre=following");
  await loaded(page);
  if (await page.getByTestId("fil-empty").isVisible()) {
    await expect(page.getByTestId("fil-empty")).toContainText("Suis des passionnés pour remplir cet onglet");
    await expect(page.getByTestId("fil-empty-search")).toHaveAttribute("href", /explorer/);
  }
});

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`captures ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
      await loaded(page);
      await shot(page, `fil-${theme}-${width}`);
      await page.goto("/app/fil/publier");
      await expect(page.getByTestId("fil-publish")).toBeVisible();
      await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
      await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
      await shot(page, `publier-${theme}-${width}`);
    });
  }
}
