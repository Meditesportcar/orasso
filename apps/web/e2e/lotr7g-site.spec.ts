import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, loginInBrowser, setTheme } from "./helpers";
import { follow, who } from "./lotr7f3-setup";
import { brokenClip, CAPTURES, clip, hevcClip, landscapeClip, longClip } from "./lotr7g-setup";

// Lot R7g (D38, décision de Damien du 09/11 : pas de floutage de plaque pour les vidéos), côté site : `/app/story/publier` accepte
// une vidéo (30 s, 60 Mo, H.264 : vérifiés avant l'envoi), l'étape plaque n'existe pas, l'aperçu la joue muette en boucle,
// l'envoi dit sa progression, puis la visionneuse la lit (`<video playsInline>`, muette par défaut, bouton du son, barre,
// compteur). Vignette posée par `<canvas>`. API et site lancés sur la base seedée. Fichiers de démonstration seulement
// (mires de 2 s, aucune plaque, aucune personne).
const DIR = process.env.CAPTURES_DIR2 ?? `${CAPTURES}/recette-site`;
test.use({ viewport: { width: 1280, height: 900 } });

async function shot(page: Page, name: string, fullPage = true) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function openForm(page: Page, email: string, theme: "beton" | "sable" = "beton") {
  await setTheme(page, theme);
  await loginInBrowser(page, email, undefined, "/app/story/publier");
  await expect(page.getByTestId("story-publish")).toBeVisible();
}

type StoryRow = {
  id: string;
  mediaKind: string;
  mediaUrl: string;
  posterUrl: string | null;
  durationMs: number | null;
  width: number;
  height: number;
};
async function storiesOfAuthor(viewer: { cookie: string }, authorId: string) {
  const res = await apiCall<{ stories: StoryRow[] }>(viewer.cookie, "GET", `/stories/by-author/u:${authorId}`);
  expect(res.status).toBe(200);
  return res.data.stories;
}

test("vidéo : choisie, sans étape plaque, aperçu muet, publiée avec sa progression, lue par l'abonné (barre, son, compteur)", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const author = await who("SvAuteur");
  const fan = await who("SvAbonne");
  await follow(fan, author);
  await openForm(page, author.email);
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toHaveText("Choisis une photo.");
  await shot(page, "01-choix");

  await page.getByTestId("story-video-file").setInputFiles(clip());
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
  // Pas d'étape « ajuster » ni « plaque » pour une vidéo : publiée telle quelle.
  await expect(page.getByTestId("story-plate")).toHaveCount(0);
  await expect(page.getByTestId("story-fit")).toHaveCount(0);
  await expect(page.getByTestId("story-video-asis")).toContainText("Aucune plaque n'est floutée");
  await expect(page.getByTestId("story-publish-send")).toBeEnabled();
  await expect(page.getByTestId("story-preview-video")).toBeVisible();
  await page.getByTestId("story-caption").fill("Mire de 2 secondes");
  await expect(page.getByTestId("story-caption-overlay")).toContainText("Mire de 2 secondes");
  await shot(page, "02-apercu-video");

  await page.getByTestId("story-publish-send").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await shot(page, "03-publiee");

  // L'API : une vidéo prête, 720 × 1280, ~2 s, vignette ; l'abonné la voit, un étranger ne la voit pas (compte public : oui).
  const stories = await storiesOfAuthor(fan, author.id);
  expect(stories).toHaveLength(1);
  const story = stories[0] as StoryRow;
  expect(story.mediaKind).toBe("video");
  expect([story.width, story.height]).toEqual([720, 1280]);
  expect(story.durationMs).toBeGreaterThan(1500);
  expect(story.posterUrl).toBeTruthy();
  const range = await fetch(`http://localhost:${process.env.API_PORT ?? 3001}${story.mediaUrl}`, {
    headers: { cookie: fan.cookie, range: "bytes=0-99" },
  });
  expect([range.status, range.headers.get("content-range")?.startsWith("bytes 0-99/")]).toEqual([206, true]);

  // La visionneuse de l'abonné.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const viewer = await ctx.newPage();
  await loginInBrowser(viewer, fan.email, undefined, "/app/fil");
  await viewer.getByLabel(`Voir les stories de ${author.pseudo}`).click();
  await expect(viewer.getByTestId("story-video")).toBeVisible({ timeout: 30_000 });
  await expect(viewer.getByTestId("story-video-bar")).toBeVisible();
  const sound = viewer.getByTestId("story-video-sound");
  // Muette au départ, le son se coupe et se remet d'un toucher.
  await expect(sound).toHaveAttribute("aria-label", "Activer le son");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-label", "Couper le son");
  await expect
    .poll(() => viewer.evaluate(() => (document.querySelector("video") as HTMLVideoElement).muted))
    .toBe(false);
  await sound.click();
  await expect
    .poll(() => viewer.evaluate(() => (document.querySelector("video") as HTMLVideoElement).muted))
    .toBe(true);
  await shot(viewer, "04-lecture", false);
  await expect(viewer.getByTestId("story-video-time")).toContainText("/ 0:0");
  await ctx.close();
});

test("vidéo paysage : posée sur sa vignette floutée, à l'affichage seulement (le fichier ne change pas)", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const author = await who("SvPaysage");
  const fan = await who("SvPaysAbo");
  await follow(fan, author);
  await openForm(page, author.email);
  await page.getByTestId("story-video-file").setInputFiles(landscapeClip());
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-testid=story-preview-canvas] .story-video__back")).toHaveCount(1);
  await shot(page, "05-apercu-paysage");
  await page.getByTestId("story-publish-send").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  const [story] = await storiesOfAuthor(fan, author.id);
  expect([story?.width, story?.height]).toEqual([1280, 720]);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const viewer = await ctx.newPage();
  await loginInBrowser(viewer, fan.email, undefined, "/app/fil");
  await viewer.getByLabel(`Voir les stories de ${author.pseudo}`).click();
  await expect(viewer.getByTestId("story-video")).toHaveAttribute("data-layout", "blurred", { timeout: 30_000 });
  await expect(viewer.getByTestId("story-video-poster")).toBeVisible();
  await shot(viewer, "06-lecture-paysage-390", false);
  await ctx.close();
});

test("refus avant l'envoi : trop longue, HEVC, fichier illisible, mots de l'API ; rien n'est publié", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const author = await who("SvRefus");
  await openForm(page, author.email);
  const error = page.getByTestId("story-error");

  await page.getByTestId("story-video-file").setInputFiles(longClip(45));
  await expect(error).toContainText("30 secondes au plus");
  await expect(page.getByTestId("story-details")).toHaveCount(0);
  await shot(page, "07-refus-longue");

  await page.getByTestId("story-video-file").setInputFiles(hevcClip());
  await expect(error).toContainText("H.264");
  await expect(error).toContainText("depuis l'appli");

  await page.getByTestId("story-video-file").setInputFiles(brokenClip());
  await expect(error).toContainText("ne se lit pas");
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();

  const mine = await apiCall<{ stories: unknown[] }>(author.cookie, "GET", "/me/stories");
  expect(mine.data.stories).toHaveLength(0);
});

test("choisir une photo après une vidéo remplace la vidéo : la photo garde sa plaque obligatoire", async ({ page }) => {
  test.setTimeout(180_000);
  const author = await who("SvPhoto");
  await openForm(page, author.email);
  await page.getByTestId("story-video-file").setInputFiles(clip());
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-plate")).toHaveCount(0);
  const { landscape } = await import("./lotr7f3-setup");
  await page.getByTestId("story-file").setInputFiles(landscape());
  await expect(page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-preview-video")).toHaveCount(0);
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toContainText("plaque");
});

test("captures Béton et Sable, 390 et 1280 px : choix, aperçu de la vidéo, lecture", async ({ browser }) => {
  test.setTimeout(420_000);
  const author = await who("SvCapt");
  const fan = await who("SvCaptAb");
  await follow(fan, author);
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await openForm(page, author.email, theme);
      await shot(page, `p-publier-choix-${tag}`);
      await page.getByTestId("story-video-file").setInputFiles(clip());
      await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("story-caption").fill("Départ de la balade");
      await shot(page, `p-publier-video-${tag}`);
      await ctx.close();
    }
  }
  // Une vidéo publiée, vue dans les deux thèmes et les deux largeurs.
  const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page0 = await ctx0.newPage();
  await openForm(page0, author.email);
  await page0.getByTestId("story-video-file").setInputFiles(clip());
  await expect(page0.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
  await page0.getByTestId("story-caption").fill("Départ de la balade");
  await page0.getByTestId("story-publish-send").click();
  await expect(page0.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await ctx0.close();
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, fan.email, undefined, "/app/fil");
      await page.getByLabel(`Voir les stories de ${author.pseudo}`).click();
      await expect(page.getByTestId("story-video")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1_000);
      await shot(page, `p-story-video-${width}-${theme}`, false);
      await ctx.close();
    }
  }
});
