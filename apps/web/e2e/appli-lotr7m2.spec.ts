import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { dropMyStories, userIdOf } from "./lotr7f2-setup";
import { landscape } from "./lotr7f3-setup";
import { RELAIS } from "./relais";

// Lot R7m2 (D38), côté appli (version web compilée de recette, `APP_URL`) : « Collaboration commerciale ». Kenji_66 est
// partenaire actif de Garage_Port (seed). (1) Il écrit « @garage-du-port » dans la légende de sa story : la ligne
// « Collaboration commerciale · Garage du Port » apparaît, non décochable ; publiée, le bandeau est dans la visionneuse
// de Damien ; le pro cité (Garage_Port) voit « Repartager dans ma story », la copie garde le bandeau. (2) Mention à la main :
// un passionné sans partenariat pose la ligne lui-même, choisit le pro (sans pro choisi, « Publier » est grisé et dit
// pourquoi). (3) Une publication du Fil qui cite le partenaire : ligne obligatoire, bandeau en tête de la carte.
// Béton et Sable, 390 px. Photos du seed seulement (aucune plaque lisible).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7m2-captures/apres/recette-appli`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
const LINE = "Collaboration commerciale · Garage du Port";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, baseURL: APP });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t as string);
  }, theme);
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

/** Photo paysage de la « galerie » → ajustée → plaque « Aucune plaque visible » → l'étape Détails. */
async function toDetails(page: Page) {
  await go(page, "/story/publier");
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-gallery").click();
  await (await chooser).setFiles(landscape());
  await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("story-fit-continue").click();
  await expect(page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-plate-none").click();
  await page.getByTestId("story-plate-none-yes").click();
  await page.getByTestId("story-plate-validate").click();
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
}

type StoryRow = { id: string; commercialPartner: { name: string; slug: string } | null };
const storiesOf = async (cookie: string, key: string) =>
  (await apiCall<{ stories: StoryRow[] }>(cookie, "GET", `/stories/by-author/${key}`)).data.stories;

for (const theme of ["beton", "sable"] as const) {
  test(`partenaire cité : ligne obligatoire, bandeau, le pro repartage et la copie garde le bandeau (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const kenji = await login("kenji@orasso.local");
    await dropMyStories(kenji);
    const kenjiId = await userIdOf("Kenji_66");
    const proCookie = await login("garage@orasso.local");
    await dropMyStories(proCookie);

    // 1. Kenji publie : la ligne obligatoire, non décochable.
    {
      const { ctx, page } = await open(browser, "kenji@orasso.local", theme);
      await toDetails(page);
      await expect(page.getByTestId("commercial-self")).toBeVisible();
      await page.getByTestId("story-caption").fill("Covering terminé chez @garage-du-port, merci");
      const required = page.getByTestId("commercial-required");
      await expect(required).toBeVisible({ timeout: 30_000 });
      await expect(required).toContainText(LINE);
      await expect(required).toContainText("Obligatoire pour un contenu fait avec ton partenaire");
      await expect(page.getByTestId("commercial-notified")).toContainText("Garage du Port est prévenu");
      // Non décochable : le toucher ne change rien, le seul interrupteur « moi-même » a disparu.
      await required.click({ force: true });
      await expect(required).toBeVisible();
      await expect(page.getByTestId("commercial-self")).toHaveCount(0);
      await shot(page, "pc_pub", theme);
      // La légende change : plus de partenaire cité, la ligne redevient l'interrupteur.
      await page.getByTestId("story-caption").fill("Sans partenaire");
      await expect(page.getByTestId("commercial-self")).toBeVisible();
      await expect(page.getByTestId("commercial-required")).toHaveCount(0);
      await page.getByTestId("story-caption").fill("Covering terminé chez @garage-du-port, merci");
      await expect(page.getByTestId("commercial-required")).toBeVisible();
      await page.getByTestId("story-to-preview").click();
      await expect(page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("story-sticker-commercial")).toContainText(LINE);
      await page.getByTestId("story-publish").click();
      await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
      await ctx.close();
    }
    const [story] = await storiesOf(kenji, `u:${kenjiId}`);
    expect(story?.commercialPartner).toMatchObject({ name: "Garage du Port", slug: "garage-du-port" });

    // 2. Damien la voit : le bandeau, le texte exact ; toucher le bandeau ouvre la fiche du pro.
    {
      const { ctx, page } = await open(browser, "damien@orasso.local", theme);
      await go(page, `/story/u:${kenjiId}`);
      await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      const badge = page.getByTestId("story-commercial");
      await expect(badge).toBeVisible({ timeout: 30_000 });
      await expect(badge).toContainText(LINE);
      await expect(page.getByTestId("story-reshare")).toHaveCount(0);
      await shot(page, "pc_story", theme);
      await badge.click();
      await page.waitForURL(/\/p\/garage-du-port/, { timeout: 30_000 });
      await ctx.close();
    }

    // 3. Le pro cité : « Repartager dans ma story » ; la copie garde le bandeau.
    {
      const { ctx, page } = await open(browser, "garage@orasso.local", theme);
      await go(page, "/activite");
      await expect(page.getByText("Kenji_66 te cite").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, "pc_pro", theme);
      await go(page, `/story/u:${kenjiId}`);
      await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      const reshare = page.getByTestId("story-reshare");
      await expect(reshare).toBeEnabled({ timeout: 30_000 });
      await expect(reshare).toContainText("Repartager dans ma story");
      await shot(page, "pc_pro-visionneuse", theme);
      await reshare.click();
      await expect(page.getByTestId("story-notice")).toBeVisible({ timeout: 30_000 });
      await expect(reshare).toBeDisabled();
      await ctx.close();
    }
    const proId = (await apiCall<{ id: string }>(proCookie, "GET", "/me/pro")).data.id;
    const damien = await login("damien@orasso.local");
    const copies = await storiesOf(damien, `p:${proId}`);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.commercialPartner).toMatchObject({ slug: "garage-du-port" });
    {
      const { ctx, page } = await open(browser, "damien@orasso.local", theme);
      await go(page, `/story/p:${proId}`);
      await expect(page.getByTestId("story-commercial")).toContainText(LINE, { timeout: 30_000 });
      await ctx.close();
    }
    await dropMyStories(kenji);
    await dropMyStories(proCookie);
  });

  test(`mention à la main : un passionné sans partenariat pose la ligne et choisit le pro (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const pseudo = `Cm_${unique()}`;
    const cookie = await signUpApi(pseudo);
    const id = await userIdOf(pseudo);
    const { ctx, page } = await open(browser, `${pseudo.toLowerCase()}@e2e.orasso.test`, theme);
    await toDetails(page);
    await page.getByTestId("story-caption").fill("Une collaboration, sans partenariat");
    const self = page.getByTestId("commercial-self");
    await expect(self).toBeVisible();
    await expect(page.getByTestId("commercial-picker")).toHaveCount(0);
    await self.click();
    await expect(page.getByTestId("commercial-picker")).toBeVisible();
    // Posée sans pro : l'aperçu est grisé et la ligne dit ce qui manque.
    await expect(page.getByTestId("story-missing")).toContainText("Choisis le pro");
    await page.getByTestId("commercial-input").fill("Garage du");
    await page.getByTestId("commercial-result").filter({ hasText: "Garage du Port" }).first().click();
    await expect(page.getByTestId("commercial-picked")).toContainText("Garage du Port");
    await expect(page.getByTestId("story-missing")).toHaveCount(0);
    await shot(page, "pc_pub-manuel", theme);
    // Décocher efface le choix.
    await self.click();
    await expect(page.getByTestId("commercial-picker")).toHaveCount(0);
    await self.click();
    await page.getByTestId("commercial-input").fill("Garage du");
    await page.getByTestId("commercial-result").filter({ hasText: "Garage du Port" }).first().click();
    await page.getByTestId("story-to-preview").click();
    await expect(page.getByTestId("story-sticker-commercial")).toContainText(LINE, { timeout: 30_000 });
    await page.getByTestId("story-publish").click();
    await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
    await ctx.close();
    const [story] = await storiesOf(cookie, `u:${id}`);
    expect(story?.commercialPartner).toMatchObject({ name: "Garage du Port", slug: "garage-du-port" });
  });

  test(`publication du Fil qui cite le partenaire : ligne obligatoire, bandeau en tête de la carte (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, "kenji@orasso.local", theme);
    await go(page, "/fil");
    await page.getByTestId("fil-publish-open").click();
    await page.getByTestId("fil-publish-choose-post").click();
    await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("fil-publish-add").click();
    await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
    await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId("fil-publish-none").click();
    await page.getByTestId("fil-publish-none-yes").click();
    const caption = `Covering satiné ${unique()} chez @garage-du-port`;
    await page.getByTestId("fil-publish-caption").fill(caption);
    await expect(page.getByTestId("commercial-required")).toContainText(LINE, { timeout: 30_000 });
    await expect(page.getByTestId("commercial-notified")).toContainText("Garage du Port est prévenu");
    await shot(page, "pc_pub-fil", theme);
    await page.getByTestId("fil-publish-send").click();
    await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("fil-publish-back").click();
    await page.getByTestId("fil-filters-following").click();
    const card = page.getByTestId("feed-card-feed_post").filter({ hasText: caption }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId("feed-post-commercial")).toContainText(LINE);
    await shot(page, "pc_fil", theme);
    // Le bandeau est AVANT l'en-tête (le pseudo) dans la carte.
    const order = await card.evaluate((el) => {
      const b = el.querySelector('[data-testid="feed-post-commercial"]');
      const h = el.querySelector('[data-testid="feed-card-more"]');
      return b && h ? Boolean(b.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    });
    expect(order).toBe(true);
    await ctx.close();
    // Nettoyage : la publication d'essai est retirée.
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
