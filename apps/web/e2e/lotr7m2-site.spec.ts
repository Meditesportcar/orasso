import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme, signUpApi, unique } from "./helpers";
import { dropMyStories, userIdOf } from "./lotr7f2-setup";
import { landscape } from "./lotr7f3-setup";
import { RELAIS } from "./relais";

// Lot R7m2 (D38), côté site : « Collaboration commerciale », mêmes règles et mêmes mots que l'appli. Kenji_66 est partenaire
// actif de Garage_Port (seed). (1) Légende « @garage-du-port » : la ligne obligatoire (non décochable) dans `/app/story/publier`,
// la pastille sur l'aperçu ; publiée, le bandeau est dans la visionneuse de Damien ; le pro cité repartage et la copie garde le
// bandeau. (2) Mention à la main (compte sans partenariat) : interrupteur, choix du pro, « Publier » grisé sans pro. (3) Publication
// du Fil : ligne obligatoire, bandeau en tête de la carte. Béton et Sable, 390 et 1280 px. Photos du seed seulement.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r7m2-captures/apres/recette-site`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
const LINE = "Collaboration commerciale · Garage du Port";

type Theme = "beton" | "sable";

async function shot(page: Page, name: string, fullPage = true) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function noPlate(page: Page) {
  await page.getByTestId("story-plate-none").click();
  await page.getByTestId("story-plate-none-yes").click();
  await expect(page.getByTestId("story-plate-blur")).toBeVisible();
}

async function openForm(page: Page, email: string, theme: Theme, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await setTheme(page, theme);
  await loginInBrowser(page, email, undefined, "/app/story/publier");
  await expect(page.getByTestId("story-publish")).toBeVisible();
  await page.getByTestId("story-file").setInputFiles(landscape());
  await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
  await noPlate(page);
}

type StoryRow = { id: string; commercialPartner: { name: string; slug: string } | null };
const storiesOf = async (cookie: string, key: string) =>
  (await apiCall<{ stories: StoryRow[] }>(cookie, "GET", `/stories/by-author/${key}`)).data.stories;

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`partenaire cité : ligne obligatoire, bandeau, le pro repartage (${theme} ${width})`, async ({ page }) => {
      test.setTimeout(300_000);
      const kenji = await login("kenji@orasso.local");
      await dropMyStories(kenji);
      const kenjiId = await userIdOf("Kenji_66");
      const proCookie = await login("garage@orasso.local");
      await dropMyStories(proCookie);

      await openForm(page, "kenji@orasso.local", theme, width);
      await expect(page.getByTestId("commercial-self")).toBeVisible();
      await page.getByTestId("story-caption").fill("Covering terminé chez @garage-du-port, merci");
      const required = page.getByTestId("commercial-required");
      await expect(required).toContainText(LINE, { timeout: 30_000 });
      await expect(required).toContainText("Obligatoire pour un contenu fait avec ton partenaire");
      await expect(page.getByTestId("commercial-notified")).toContainText("Garage du Port est prévenu");
      await expect(page.getByTestId("commercial-self")).toHaveCount(0);
      await expect(page.getByTestId("story-sticker-commercial")).toContainText(LINE);
      await shot(page, `pc_pub-${theme}-${width}`);
      await page.getByTestId("story-publish-send").click();
      await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
      const [story] = await storiesOf(kenji, `u:${kenjiId}`);
      expect(story?.commercialPartner).toMatchObject({ name: "Garage du Port", slug: "garage-du-port" });

      // Damien : le bandeau, texte exact ; le pro n'a pas de bouton pour Damien.
      await page.context().clearCookies();
      await loginInBrowser(page, "damien@orasso.local", undefined, `/app/story/u:${kenjiId}`);
      await expect(page.getByTestId("story-viewer-root")).toBeVisible({ timeout: 30_000 });
      const badge = page.getByTestId("story-commercial");
      await expect(badge).toContainText(LINE, { timeout: 30_000 });
      await expect(badge).toHaveAttribute("href", "/p/garage-du-port");
      await expect(page.getByTestId("story-reshare")).toHaveCount(0);
      await shot(page, `pc_story-${theme}-${width}`, false);

      // Le pro cité : « Repartager dans ma story » ; la copie garde le bandeau.
      await page.context().clearCookies();
      await loginInBrowser(page, "garage@orasso.local", undefined, "/app/activite");
      await expect(page.getByText("Kenji_66 te cite").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, `pc_pro-${theme}-${width}`, false);
      await page.goto(`/app/story/u:${kenjiId}`);
      const reshare = page.getByTestId("story-reshare");
      await expect(reshare).toContainText("Repartager dans ma story", { timeout: 30_000 });
      await shot(page, `pc_pro-visionneuse-${theme}-${width}`, false);
      await reshare.click();
      await expect(reshare).toBeDisabled({ timeout: 30_000 });
      const proId = (await apiCall<{ id: string }>(proCookie, "GET", "/me/pro")).data.id;
      const damien = await login("damien@orasso.local");
      const copies = await storiesOf(damien, `p:${proId}`);
      expect(copies).toHaveLength(1);
      expect(copies[0]?.commercialPartner).toMatchObject({ slug: "garage-du-port" });
      await page.goto(`/app/story/p:${proId}`);
      await expect(page.getByTestId("story-commercial")).toContainText(LINE, { timeout: 30_000 });
      await dropMyStories(kenji);
      await dropMyStories(proCookie);
    });
  }

  test(`mention à la main : interrupteur, choix du pro, « Publier » grisé sans pro (${theme})`, async ({ page }) => {
    test.setTimeout(300_000);
    const pseudo = `CmS_${unique()}`;
    const cookie = await signUpApi(pseudo);
    const id = await userIdOf(pseudo);
    await openForm(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, theme, 390);
    await page.getByTestId("story-caption").fill("Une collaboration, sans partenariat");
    await expect(page.getByTestId("commercial-picker")).toHaveCount(0);
    await page.getByTestId("commercial-self").click();
    await expect(page.getByTestId("commercial-picker")).toBeVisible();
    await expect(page.getByTestId("story-publish-send")).toBeDisabled();
    await expect(page.getByTestId("story-missing")).toContainText("Choisis le pro");
    await page.getByTestId("commercial-input").fill("Garage du");
    await page.getByTestId("commercial-result").filter({ hasText: "Garage du Port" }).first().click();
    await expect(page.getByTestId("commercial-picked")).toContainText("Garage du Port");
    await expect(page.getByTestId("story-publish-send")).toBeEnabled();
    await expect(page.getByTestId("story-sticker-commercial")).toContainText(LINE);
    await shot(page, `pc_pub-manuel-${theme}-390`);
    // Décocher efface le choix et libère « Publier ».
    await page.getByTestId("commercial-self").click();
    await expect(page.getByTestId("story-sticker-commercial")).toHaveCount(0);
    await expect(page.getByTestId("story-publish-send")).toBeEnabled();
    await page.getByTestId("commercial-self").click();
    await page.getByTestId("commercial-input").fill("Garage du");
    await page.getByTestId("commercial-result").filter({ hasText: "Garage du Port" }).first().click();
    await page.getByTestId("story-publish-send").click();
    await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
    const [story] = await storiesOf(cookie, `u:${id}`);
    expect(story?.commercialPartner).toMatchObject({ slug: "garage-du-port" });
  });

  test(`publication du Fil qui cite le partenaire : ligne obligatoire, bandeau en tête de la carte (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 900 });
    await setTheme(page, theme);
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil/publier");
    await expect(page.getByTestId("fil-publish")).toBeVisible();
    await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
    await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId("fil-publish-none").click();
    await page.getByTestId("fil-publish-none-yes").click();
    const caption = `Covering satiné ${unique()} chez @garage-du-port`;
    await page.getByTestId("fil-publish-caption").fill(caption);
    await expect(page.getByTestId("commercial-required")).toContainText(LINE, { timeout: 30_000 });
    await shot(page, `pc_pub-fil-${theme}-390`);
    await page.getByTestId("fil-publish-send").click();
    await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
    await page.goto("/app/fil");
    const card = page.getByTestId("feed-card-feed_post").filter({ hasText: caption }).first();
    await expect(card.getByTestId("feed-post-commercial")).toContainText(LINE, { timeout: 30_000 });
    await expect(card.getByTestId("feed-post-commercial")).toHaveAttribute("href", "/p/garage-du-port");
    await shot(page, `pc_fil-${theme}-390`, false);
    // Le bandeau est AVANT l'en-tête dans la carte.
    const before = await card.evaluate((el) => {
      const b = el.querySelector('[data-testid="feed-post-commercial"]');
      const h = el.querySelector("header");
      return b && h ? Boolean(b.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    });
    expect(before).toBe(true);
    // Jamais retirée : 409 ; puis la publication d'essai est retirée.
    const kenji = await login("kenji@orasso.local");
    const mine = await apiCall<{ items: { id: string; caption: string }[] }>(kenji, "GET", "/me/feed-posts");
    const made = mine.data.items.find((p) => p.caption === caption);
    expect(made).toBeTruthy();
    expect((await apiCall(kenji, "PATCH", `/me/feed-posts/${made?.id}`, { commercialPartnerId: null })).status).toBe(
      409,
    );
    await apiCall(kenji, "DELETE", `/me/feed-posts/${made?.id}`);
  });
}
