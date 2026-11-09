import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { follow, who } from "./lotr7f3-setup";
import { brokenClip, CAPTURES, clip, hevcClip, landscapeClip, longClip, reportedVideoStory } from "./lotr7g-setup";

// Lot R7g (D38, décision de Damien du 09/11 : pas de floutage de plaque pour les vidéos), côté appli (version web compilée de
// recette, `APP_URL`) : une vidéo de la galerie saute « Ajuster » et la plaque, l'aperçu la joue muette, l'envoi dit sa
// progression, la visionneuse la lit (`expo-video` : barre, compteur, son). Une vidéo trop longue, en HEVC ou illisible est
// refusée avec la phrase de l'appli. L'appareil (Vidéo 30 s, compteur), `expo-video` natif, la compression sur le téléphone
// (H.264 720p) et la première image (`expo-video-thumbnails`) ne se vérifient que sur le téléphone : le navigateur n'a ni
// l'un ni l'autre (le sélecteur de fichiers, le lecteur de la balise vidéo et le canevas les remplacent).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR2 ?? `${CAPTURES}/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton", size: { scale?: number; width?: number } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size.width ?? 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, scale]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(scale) > 1) localStorage.setItem("orasso.recette.echellePolice", String(scale));
    },
    [theme, size.scale ?? 1] as const,
  );
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

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Ouvre l'écran et choisit une vidéo dans la « galerie » (sélecteur de fichier du navigateur). */
async function chooseVideo(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await go(page, "/story/publier");
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-video").click();
  await (await chooser).setFiles(file);
}

type StoryRow = { id: string; mediaKind: string; durationMs: number | null; width: number; height: number };
const storiesOfAuthor = async (viewer: { cookie: string }, authorId: string) => {
  const res = await apiCall<{ stories: StoryRow[] }>(viewer.cookie, "GET", `/stories/by-author/u:${authorId}`);
  expect(res.status).toBe(200);
  return res.data.stories;
};

test("galerie → détails (ni « Ajuster » ni plaque) → aperçu muet → publiée → lue par l'abonné (barre, compteur, son)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const author = await who("AvAuteur");
  const fan = await who("AvAbonne");
  await follow(fan, author);
  const { ctx, page } = await open(browser, author.email);
  await go(page, "/story/publier");
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-pick-video")).toBeVisible();
  await shot(page, "01-choix");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-video").click();
  await (await chooser).setFiles(clip());

  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("story-fit")).toHaveCount(0);
  await expect(page.getByTestId("story-plate")).toHaveCount(0);
  await expect(page.getByText("Aucune plaque n'est floutée sur une vidéo.")).toBeVisible();
  await page.getByTestId("story-caption").fill("Mire de 2 secondes");
  await shot(page, "02-details");
  await page.getByTestId("story-to-preview").click();
  await expect(page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-caption-overlay")).toContainText("Mire de 2 secondes");
  await expect(page.locator("video").first()).toBeVisible();
  await shot(page, "03-apercu");
  await page.getByTestId("story-publish").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Publiée telle quelle, sans floutage.")).toBeVisible();
  await shot(page, "04-publiee");
  await ctx.close();

  const [story] = await storiesOfAuthor(fan, author.id);
  expect(story?.mediaKind).toBe("video");
  expect([story?.width, story?.height]).toEqual([720, 1280]);
  expect(story?.durationMs).toBeGreaterThan(1500);

  // L'abonné : la barre du Fil, la visionneuse, la vidéo, le compteur, le son (coupé / remis d'un toucher).
  const viewer = await open(browser, fan.email);
  await go(viewer.page, "/fil");
  await viewer.page.getByLabel(`Voir les stories de ${author.pseudo}`).click();
  await expect(viewer.page.getByTestId("story-video")).toBeVisible({ timeout: 40_000 });
  await expect(viewer.page.getByTestId("story-video-bar")).toBeVisible();
  await viewer.page.waitForSelector("video", { timeout: 40_000 });
  // Tour 2 : la vidéo est mise en pause à 1 s (elle ne finit pas pendant la recette) pour essayer le pas en arrière plus bas.
  await viewer.page.evaluate(() => {
    const v = document.querySelector("video");
    if (v) {
      v.pause();
      v.currentTime = 1;
    }
  });
  const sound = viewer.page.getByTestId("story-video-sound");
  await expect(sound).toHaveAttribute("aria-label", "Couper le son");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-label", "Activer le son");
  await shot(viewer.page, "05-lecture");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-label", "Couper le son");
  await expect(viewer.page.getByTestId("story-video-time")).toContainText("/ 0:0");
  // Tour 2 : reculer sur la première (et seule) vidéo la rejoue depuis le début — le lecteur est remonté, pas seulement la barre.
  await viewer.page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => viewer.page.evaluate(() => document.querySelector("video")?.currentTime ?? 99), { timeout: 15_000 })
    .toBeLessThan(0.8);
  await viewer.ctx.close();
});

test("vidéo trop longue, en HEVC ou illisible : refusée avec la phrase de l'appli, rien n'est publié", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const author = await who("AvRefus");
  const { ctx, page } = await open(browser, author.email);
  await chooseVideo(page, longClip(45));
  await expect(page.getByText("Une story vidéo dure 30 secondes au plus.")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("story-details")).toHaveCount(0);
  await shot(page, "06-refus-longue");

  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-video").click();
  await (await chooser).setFiles(hevcClip());
  await expect(page.getByText(/n'est pas en H\.264/)).toBeVisible({ timeout: 40_000 });

  const chooser2 = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-video").click();
  await (await chooser2).setFiles(brokenClip());
  await expect(page.getByText("Cette vidéo ne se lit pas. Choisis-en une autre.")).toBeVisible({ timeout: 40_000 });
  await ctx.close();
  const mine = await apiCall<{ stories: unknown[] }>(author.cookie, "GET", "/me/stories");
  expect(mine.data.stories).toHaveLength(0);
});

test("vidéo paysage : posée sur sa vignette floutée à l'aperçu et à la lecture", async ({ browser }) => {
  test.setTimeout(300_000);
  const author = await who("AvPays");
  const fan = await who("AvPaysAb");
  await follow(fan, author);
  const { ctx, page } = await open(browser, author.email);
  await chooseVideo(page, landscapeClip());
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("story-to-preview").click();
  await expect(page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
  await shot(page, "07-apercu-paysage");
  await page.getByTestId("story-publish").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await ctx.close();
  const [story] = await storiesOfAuthor(fan, author.id);
  expect([story?.width, story?.height]).toEqual([1280, 720]);
  const viewer = await open(browser, fan.email);
  await go(viewer.page, "/fil");
  await viewer.page.getByLabel(`Voir les stories de ${author.pseudo}`).click();
  await expect(viewer.page.getByTestId("story-video-poster")).toBeVisible({ timeout: 40_000 });
  await shot(viewer.page, "08-lecture-paysage");
  await viewer.ctx.close();
});

test("captures Béton et Sable (384 px police 1 et 1,3, 390 px) : choix, aperçu, lecture", async ({ browser }) => {
  test.setTimeout(900_000);
  const author = await who("AvCapt");
  const fan = await who("AvCaptAb");
  await follow(fan, author);
  // Une vidéo publiée pour la lecture.
  const first = await open(browser, author.email);
  await chooseVideo(first.page, clip());
  await expect(first.page.getByTestId("story-details")).toBeVisible({ timeout: 60_000 });
  await first.page.getByTestId("story-caption").fill("Départ de la balade");
  await first.page.getByTestId("story-to-preview").click();
  await expect(first.page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
  await first.page.getByTestId("story-publish").click();
  await expect(first.page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await first.ctx.close();

  for (const theme of ["beton", "sable"] as const) {
    for (const [width, scale] of [
      [384, 1],
      [384, 1.3],
      [390, 1],
    ] as const) {
      const tag = `${width}-x${scale}-${theme}`;
      const a = await open(browser, author.email, theme, { width, scale });
      await chooseVideo(a.page, clip());
      await expect(a.page.getByTestId("story-details")).toBeVisible({ timeout: 60_000 });
      await a.page.getByTestId("story-caption").fill("Départ de la balade");
      await shot(a.page, `ps_4_md_video-details-${tag}`);
      await a.page.getByTestId("story-to-preview").click();
      await expect(a.page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
      await shot(a.page, `ps_4_md_video-apercu-${tag}`);
      await a.ctx.close();

      const b = await open(browser, fan.email, theme, { width, scale });
      await go(b.page, "/story/publier");
      await expect(b.page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
      await shot(b.page, `choix-${tag}`);
      await go(b.page, "/fil");
      await b.page.getByLabel(`Voir les stories de ${author.pseudo}`).click();
      await expect(b.page.getByTestId("story-video")).toBeVisible({ timeout: 40_000 });
      await b.page.waitForTimeout(1_000);
      await shot(b.page, `sk_video-${tag}`);
      await b.ctx.close();
    }
  }
});

test("modération : une vidéo signalée qui ne se lit pas le dit, « Réessayer » la relit une fois le réseau revenu", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { author, storyId } = await reportedVideoStory("SvModo");
  const modo = await login("moderatrice@orasso.local");
  const list = await apiCall<{ items: { id: string; targetId: string }[] }>(
    modo,
    "GET",
    "/admin/reports?status=pending",
  );
  expect(list.status).toBe(200);
  const report = list.data.items.find((r) => r.targetId === storyId);
  expect(report, `signalement de ${author.pseudo}`).toBeDefined();

  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("moderatrice@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 60_000 });

  // Casquette Administration (elle survit au rechargement), puis le dossier du signalement.
  await go(page, "/moi");
  await page.getByTestId("casquette-admin").click();
  await page.waitForURL(/administration/, { timeout: 20_000 });
  const MEDIA = "**/api/admin/reports/*/media/*.mp4";
  await page.route(MEDIA, (route) => route.abort("connectionfailed"));
  await go(page, `/signalement/${report?.id}`);
  await expect(page.getByTestId("report-video-failed")).toContainText("La vidéo n'a pas pu être lue", {
    timeout: 30_000,
  });
  await shot(page, "modo-video-echec");
  // Le réseau revient : « Réessayer » relit la vidéo, le message disparaît et le lecteur est là.
  await page.unroute(MEDIA);
  await page.getByTestId("report-video-retry").click();
  await expect(page.getByTestId("report-video-failed")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("report-video")).toBeVisible({ timeout: 30_000 });
  await shot(page, "modo-video-relue");
  await ctx.close();
});
