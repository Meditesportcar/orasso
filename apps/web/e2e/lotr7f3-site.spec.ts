import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, loginInBrowser, setTheme } from "./helpers";
import { r5Crew } from "./lotr5c2-setup";
import { CAPTURES, follow, landscape, storiesOf, storyFile, who } from "./lotr7f3-setup";

// Lot R7f3 (D38), côté site : `/app/story/publier`. Une photo (fichier) paysage est posée sur un fond flouté, ajustée à la
// souris (glissement, − et +, « Remplir », « Rétablir »), la plaque est tracée à la main (pas de détection sur le site) ou
// « Aucune plaque visible » est confirmée (obligatoire : bouton grisé expliqué), puis légende, @identification, public,
// aperçu ; le fichier publié fait 1080 × 1920 (lu par l'API). Vie privée comme dans l'appli : un compte privé ne propose que
// ses abonnés acceptés et grise l'événement ; « Mon crew » = membres seulement. API et site lancés sur la base seedée.
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

async function choose(page: Page) {
  await page.getByTestId("story-file").setInputFiles(landscape());
  await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
}

/** Aucune plaque visible, confirmée. */
async function noPlate(page: Page) {
  await page.getByTestId("story-plate-none").click();
  await page.getByTestId("story-plate-none-yes").click();
  await expect(page.getByTestId("story-plate-blur")).toBeVisible();
}

test("photo paysage : ajustée à la souris, plaque obligatoire, légende, @identification, aperçu, publiée en 1080 × 1920", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const author = await who("SiAuteur");
  const fan = await who("SiAbonne");
  await follow(fan, author);
  await openForm(page, author.email);
  // Rien : pas de photo, « Publier » grisé avec la ligne qui dit pourquoi.
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toHaveText("Choisis une photo.");
  await choose(page);
  await shot(page, "01-photo-posee");

  // Trois états.
  await expect(page.getByTestId("story-fit-badge")).toHaveText("Posée");
  await page.getByTestId("story-fit-zoom-in").click();
  await page.getByTestId("story-fit-zoom-in").click();
  await expect(page.getByTestId("story-fit-badge")).toContainText("Zoom");
  const canvas = page.getByTestId("story-fit-canvas");
  const box = (await canvas.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 5 });
  await page.mouse.up();
  await shot(page, "02-photo-ajustee");
  await page.getByTestId("story-fit-fill").click();
  await expect(page.getByTestId("story-fit-badge")).toHaveText("Remplie");
  await shot(page, "03-photo-remplie");
  await page.getByTestId("story-fit-reset").click();
  await expect(page.getByTestId("story-fit-badge")).toHaveText("Posée");
  await page.getByTestId("story-fit-zoom-in").click();

  // Plaque : sans décision, la ligne dit quoi ; un cadre jamais placé ne compte pas.
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toContainText("plaque");
  await page
    .getByTestId("story-plate")
    .getByRole("button", { name: /Poser un cadre/ })
    .click();
  await expect(page.getByTestId("story-missing")).toContainText("Place le cadre");
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
  await expect(page.getByTestId("story-missing")).toHaveCount(0);
  await expect(page.getByTestId("story-publish-send")).toBeEnabled();
  // Le cadre posé se voit dans l'aperçu (cadre plein, pas de floutage local).
  await expect(page.getByTestId("story-plate-mask")).toHaveCount(1);
  await shot(page, "04-plaque-posee");

  await page.getByTestId("story-caption").fill("Site : prête pour le Lydia");
  await page.getByRole("button", { name: "Identifier", exact: true }).click();
  await page.getByTestId("story-tag-input").fill(fan.pseudo);
  await page.getByTestId("story-tag-result").filter({ hasText: fan.pseudo }).click();
  await expect(page.getByTestId("story-tag-chosen")).toContainText(fan.pseudo);
  await expect(page.getByTestId("story-caption-overlay")).toContainText("Site : prête pour le Lydia");
  await shot(page, "05-details-apercu");
  await page.getByTestId("story-publish-send").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await shot(page, "06-publiee");

  const stories = await storiesOf(fan, author.id);
  expect(stories).toHaveLength(1);
  expect(stories[0]?.tags.map((t) => t.id)).toContain(fan.id);
  const file = await storyFile(fan, stories[0] as { mediaUrl: string });
  expect({ width: file.width, height: file.height }).toEqual({ width: 1080, height: 1920 });
});

test("refus sans décision de plaque : bouton grisé expliqué ; « Aucune plaque visible » se confirme, se défait", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const author = await who("SiPlaque");
  await openForm(page, author.email);
  await choose(page);
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toContainText(
    "Floute la plaque ou confirme qu'aucune plaque n'est visible.",
  );
  await page.getByTestId("story-plate-none").click();
  await expect(page.getByTestId("story-plate-none-confirm")).toBeVisible();
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();
  await page.getByTestId("story-plate-none-yes").click();
  await expect(page.getByTestId("story-publish-send")).toBeEnabled();
  await page.getByTestId("story-plate-blur").click();
  await expect(page.getByTestId("story-publish-send")).toBeDisabled();
});

test("compte privé : seuls mes abonnés acceptés sont proposés à l'identification ; l'événement est grisé avec la raison", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const priv = await who("SiPrive", "private");
  const fan = await who("SiAbo", "private");
  const stranger = await who("SiInconnu");
  await follow(fan, priv);
  await openForm(page, priv.email);
  await choose(page);
  await noPlate(page);
  await page.getByRole("button", { name: "Identifier", exact: true }).click();
  await expect(page.getByText("Seulement tes abonnés acceptés")).toBeVisible();
  await page.getByTestId("story-tag-input").fill(stranger.pseudo);
  await expect(page.getByTestId("story-tag-none")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("story-tag-result")).toHaveCount(0);
  await page.getByTestId("story-tag-input").fill(fan.pseudo);
  await expect(page.getByTestId("story-tag-result").filter({ hasText: fan.pseudo })).toBeVisible({ timeout: 15_000 });
  // Événement : le bouton est grisé, la raison est écrite.
  await expect(page.getByRole("button", { name: "Événement", exact: true })).toBeDisabled();
  await expect(page.getByTestId("story-event-disabled")).toContainText("compte privé");
  await expect(page.getByTestId("story-audience-followers")).toContainText("abonnés acceptés");
  await shot(page, "07-compte-prive");
});

test("« Mon crew » : visible des membres seulement ; la liste des identifiables se limite au crew ; l'événement est grisé", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const crew = await r5Crew(`S3${Date.now().toString(36)}`);
  await openForm(page, crew.chef.email);
  await choose(page);
  await noPlate(page);
  await page.getByTestId("story-audience-crew").click();
  await expect(page.getByTestId("story-event-disabled")).toContainText("crew");
  await page.getByRole("button", { name: "Identifier", exact: true }).click();
  await expect(page.getByText("Seulement les membres de ce crew")).toBeVisible();
  await page.getByTestId("story-tag-input").fill("R5");
  await expect(page.getByTestId("story-tag-result").filter({ hasText: crew.lea.pseudo })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("story-tag-result").filter({ hasText: crew.paul.pseudo })).toHaveCount(0);
  await expect(page.getByTestId("story-tag-result").filter({ hasText: crew.sarah.pseudo })).toHaveCount(0);
  await shot(page, "08-crew");
  await page.getByTestId("story-publish-send").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  const mine = (await storiesOf(crew.lea, crew.chef.id)) as { mediaUrl: string; audience: string }[];
  expect(mine).toHaveLength(1);
  expect(mine[0]?.audience).toBe("crew");
  for (const outsider of [crew.sarah, crew.paul, crew.nina]) {
    expect(await storiesOf(outsider, crew.chef.id)).toEqual([]);
  }
  const url = (mine[0]?.mediaUrl ?? "").replace(/^\/api/, "");
  expect((await apiCall(crew.sarah.cookie, "GET", url)).status).toBe(403);
});

test("« Publier » du Fil : deux lignes, en story et dans le Fil", async ({ page }) => {
  test.setTimeout(120_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, (await who("SiFil")).email, undefined, "/app/fil");
  await page.getByTestId("fil-publish-open").click();
  await expect(page.getByTestId("fil-publish-choose-story")).toBeVisible();
  await expect(page.getByTestId("fil-publish-choose-post")).toBeVisible();
  await shot(page, "09-publier-choix", false);
  await page.getByTestId("fil-publish-choose-story").click();
  await expect(page.getByTestId("story-publish")).toBeVisible();
});

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`captures de contrôle ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      const author = await who("SiCapt");
      await page.setViewportSize({ width, height: 900 });
      await openForm(page, author.email, theme);
      await shot(page, `ps1-choisir-${theme}-${width}`);
      await choose(page);
      await page.getByTestId("story-fit-zoom-in").click();
      await shot(page, `ps0-ajuster-${theme}-${width}`);
      await page
        .getByTestId("story-plate")
        .getByRole("button", { name: /Poser un cadre/ })
        .click();
      await page.getByTestId("story-caption").fill("Prête pour le Lydia demain");
      await shot(page, `ps2-3-plaque-details-apercu-${theme}-${width}`);
    });
  }
}
