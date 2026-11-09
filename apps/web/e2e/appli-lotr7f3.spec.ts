import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { r5Crew } from "./lotr5c2-setup";
import { CAPTURES, follow, landscape, storiesOf, storyFile, who } from "./lotr7f3-setup";

// Lot R7f3 (D38), côté appli (version web compilée de recette, `APP_URL`) : publier une story. Une photo de galerie
// paysage est posée sur un fond flouté, ajustée (zoom, glissement, « Remplir », « Rétablir »), la plaque est une décision
// obligatoire (bouton grisé expliqué), puis légende, @identification, public et aperçu ; le fichier publié fait 1080 × 1920
// (lu par l'API). Vie privée : un compte privé ne propose que ses abonnés acceptés à l'identification et grise l'autocollant
// d'événement ; une story « Mon crew » n'est vue que par les membres. L'appareil photo et ML Kit ne se vérifient que sur le
// téléphone (le navigateur n'a ni l'un ni l'autre : la galerie et la décision à la main les remplacent).
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

/** Ouvre l'écran, choisit la photo paysage dans la « galerie » (sélecteur de fichier du navigateur). */
async function chooseLandscape(page: Page) {
  await go(page, "/story/publier");
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-gallery").click();
  await (await chooser).setFiles(landscape());
  await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 60_000 });
}

/** « Ajuster » → « Continuer » → plaque : « Aucune plaque visible » confirmée → « Valider ». */
async function passPlate(page: Page) {
  await page.getByTestId("story-fit-continue").click();
  await expect(page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-plate-none").click();
  await page.getByTestId("story-plate-none-yes").click();
  await expect(page.getByTestId("story-plate-validate")).toBeEnabled();
  await page.getByTestId("story-plate-validate").click();
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
}

test("galerie paysage → ajustée → plaque → détails → aperçu → publiée : le fichier fait 1080 × 1920", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const author = await who("StAuteur");
  const fan = await who("StAbonne");
  await follow(fan, author);
  const { ctx, page } = await open(browser, author.email);
  await chooseLandscape(page);

  // Trois états : posée, ajustée, remplie ; « Rétablir » repose la photo entière.
  const stage = page.getByTestId("story-fit-stage");
  await shot(page, "01-ajuster-posee");
  await page.getByTestId("story-fit-zoom-in").click();
  await page.getByTestId("story-fit-zoom-in").click();
  await expect(page.getByTestId("story-fit-reset")).toBeVisible();
  await expect(page.getByTestId("story-fit-fill")).toBeVisible();
  const box = await stage.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 6 });
    await page.mouse.up();
  }
  await shot(page, "02-ajuster-ajustee");
  await page.getByTestId("story-fit-fill").click();
  await expect(page.getByTestId("story-fit-fill")).toHaveCount(0);
  await expect(page.getByTestId("story-fit-note")).toContainText("Remplie");
  await shot(page, "03-ajuster-remplie");
  await page.getByTestId("story-fit-reset").click();
  await expect(page.getByTestId("story-fit-reset")).toHaveCount(0);
  await page.getByTestId("story-fit-zoom-in").click();

  // Plaque : décision obligatoire. Sans elle, « Valider » est grisé et la ligne dit pourquoi.
  await page.getByTestId("story-fit-continue").click();
  await expect(page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-plate-validate")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toContainText("plaque");
  await shot(page, "04-plaque-a-regler");
  await page.getByTestId("story-plate-none").click();
  await expect(page.getByTestId("story-plate-none-confirm")).toBeVisible();
  await page.getByTestId("story-plate-none-yes").click();
  await expect(page.getByTestId("story-plate-validate")).toBeEnabled();
  await shot(page, "05-plaque-aucune");
  await page.getByTestId("story-plate-validate").click();

  // Détails : légende, un abonné identifié, public « Mes abonnés ».
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-caption").fill("Prête pour le Lydia demain");
  await page.getByRole("button", { name: "Identifier", exact: true }).click();
  await page.getByTestId("story-tag-input").fill(fan.pseudo);
  await page.getByTestId("story-tag-result").filter({ hasText: fan.pseudo }).click();
  await expect(page.getByTestId("story-tag-chosen")).toContainText(fan.pseudo);
  await expect(page.getByTestId("story-audience-followers")).toBeVisible();
  await shot(page, "06-details");
  await page.getByTestId("story-to-preview").click();
  await expect(page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-caption-overlay")).toContainText("Prête pour le Lydia demain");
  await shot(page, "07-apercu");
  await page.getByTestId("story-publish").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await shot(page, "08-publiee");

  // L'API : la story est là pour l'abonné, en 1080 × 1920, avec la légende et l'identifié.
  const stories = await storiesOf(fan, author.id);
  expect(stories).toHaveLength(1);
  expect(stories[0]?.caption).toBe("Prête pour le Lydia demain");
  expect(stories[0]?.tags.map((t) => t.id)).toContain(fan.id);
  const file = await storyFile(fan, stories[0] as { mediaUrl: string });
  expect({ width: file.width, height: file.height }).toEqual({ width: 1080, height: 1920 });
  await ctx.close();
});

test("« Publier » du Fil : une feuille demande où (en story, dans le Fil)", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await open(browser, (await who("StFil")).email);
  await go(page, "/fil");
  await page.getByTestId("fil-publish-open").click();
  await expect(page.getByTestId("fil-publish-choose-story")).toBeVisible();
  await expect(page.getByTestId("fil-publish-choose-post")).toBeVisible();
  await shot(page, "09-feuille-publier");
  await page.getByTestId("fil-publish-choose-story").click();
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  // Le bouton principal de l'écran est la galerie ; l'appareil n'existe pas dans le navigateur (dit sans bloquer).
  await expect(page.getByTestId("story-pick-gallery")).toBeVisible();
  await expect(page.getByText("L'appareil photo n'est pas disponible ici")).toBeVisible();
  await shot(page, "10-choisir-la-photo");
  await ctx.close();
});

test("refus sans décision de plaque : bouton grisé expliqué, et l'API refuse (400 plate_decision_required)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const author = await who("StPlaque");
  const { ctx, page } = await open(browser, author.email);
  await chooseLandscape(page);
  await page.getByTestId("story-fit-continue").click();
  await expect(page.getByTestId("story-plate-validate")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toContainText("Floute la plaque ou confirme");
  // Un cadre ajouté et jamais placé n'est pas une décision.
  await page.getByTestId("story-plate-add").click();
  await expect(page.getByTestId("story-plate-validate")).toBeDisabled();
  await expect(page.getByTestId("story-missing")).toContainText("Place le cadre");
  await ctx.close();

  // L'API ne se fie pas à l'écran : une story sans décision est refusée, quel que soit le public (crew compris).
  const form = new FormData();
  form.append("purpose", "story");
  form.append("file", new Blob([new Uint8Array(landscape().buffer)], { type: "image/jpeg" }), "p.jpg");
  const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
  const up = await fetch(`${API}/api/me/uploads`, {
    method: "POST",
    headers: { cookie: author.cookie, origin: `http://localhost:${process.env.WEB_PORT ?? 5173}` },
    body: form,
  });
  const { key } = (await up.json()) as { key: string };
  const refused = await apiCall<{ error: { code: string } }>(author.cookie, "POST", "/me/stories", {
    uploadKey: key,
    audience: "followers",
    persona: "fan",
  });
  expect(refused.status).toBe(400);
  expect(refused.data.error.code).toBe("plate_decision_required");
});

test("compte privé : l'identification ne propose que mes abonnés acceptés, l'autocollant d'événement est grisé avec la raison", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const priv = await who("StPrive", "private");
  const fan = await who("StAbo", "private");
  const stranger = await who("StInconnu");
  await follow(fan, priv);
  const { ctx, page } = await open(browser, priv.email);
  await chooseLandscape(page);
  await passPlate(page);

  // Identifier : l'abonné est proposé, l'inconnu ne l'est pas (même pseudo cherché).
  await page.getByRole("button", { name: "Identifier", exact: true }).click();
  await expect(page.getByText("Seulement tes abonnés acceptés")).toBeVisible();
  await page.getByTestId("story-tag-input").fill(stranger.pseudo);
  await expect(page.getByTestId("story-tag-none")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("story-tag-result")).toHaveCount(0);
  await page.getByTestId("story-tag-input").fill(fan.pseudo);
  await expect(page.getByTestId("story-tag-result").filter({ hasText: fan.pseudo })).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("story-tag-result").filter({ hasText: fan.pseudo }).click();
  await expect(page.getByTestId("story-tag-chosen")).toHaveCount(1);

  // L'autocollant d'événement : grisé, avec l'explication.
  await expect(page.getByTestId("story-event-disabled")).toContainText("compte privé");
  await expect(page.getByRole("button", { name: "Événement : indisponible" })).toBeVisible();
  await shot(page, "11-compte-prive-details");
  // « Mes abonnés » : le sous-titre dit « privé ».
  await expect(page.getByTestId("story-audience-followers")).toContainText("abonnés acceptés");
  await ctx.close();

  // L'API, seule juge : un inconnu identifié à la main est écarté, la story part quand même.
  const direct = await apiCall<{ users?: unknown }>(
    priv.cookie,
    "GET",
    `/users/search?q=${stranger.pseudo}&taggableFor=followers`,
  );
  expect((direct.data as { items: unknown[] }).items).toEqual([]);
});

test("autocollant d'événement (compte public) : un événement où j'ai une place ; l'organisateur est identifié donc prévenu", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await chooseLandscape(page);
  await passPlate(page);
  await page.getByRole("button", { name: "Événement", exact: true }).click();
  await expect(page.getByTestId("story-event-panel")).toBeVisible();
  // Damien est retenu au « Rassemblement du Lydia » (seed) : l'autocollant le propose.
  await page
    .getByTestId("story-event-panel")
    .getByRole("button", { name: /Rassemblement du Lydia/ })
    .click();
  await expect(page.getByTestId("story-sticker-event")).toContainText("Rassemblement du Lydia");
  await expect(page.getByTestId("story-event-panel")).toContainText("L'organisateur sera prévenu");
  await shot(page, "12-autocollant-evenement");
  await page.getByTestId("story-to-preview").click();
  await page.getByTestId("story-publish").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await ctx.close();
  // L'API : l'événement est lié et la structure organisatrice est identifiée (c'est elle qui est prévenue).
  const cookie = await login("damien@orasso.local");
  const mine = await apiCall<{ stories: { event: { title: string } | null; tags: { kind: string }[] }[] }>(
    cookie,
    "GET",
    "/me/stories",
  );
  const last = mine.data.stories.find((st) => st.event?.title.includes("Rassemblement du Lydia"));
  expect(last).toBeDefined();
  expect(last?.tags.map((t) => t.kind)).toContain("structure");
});

test("« Mon crew » : la story n'est vue que des membres, jamais d'un non-membre ; l'identification se limite au crew", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const crew = await r5Crew(`F3${Date.now().toString(36)}`);
  const { ctx, page } = await open(browser, crew.chef.email);
  await chooseLandscape(page);
  await passPlate(page);

  // Public : « Mon crew · <nom> » ; l'identification ne propose que les membres ; l'événement est grisé pour un crew.
  const crewOption = page.getByTestId("story-audience-crew");
  await expect(crewOption).toContainText(crew.name);
  await crewOption.click();
  await expect(page.getByTestId("story-event-disabled")).toContainText("crew");
  await page.getByRole("button", { name: "Identifier", exact: true }).click();
  await expect(page.getByText("Seulement les membres de ce crew")).toBeVisible();
  await page.getByTestId("story-tag-input").fill("R5");
  await expect(page.getByTestId("story-tag-result").filter({ hasText: crew.lea.pseudo })).toBeVisible({
    timeout: 15_000,
  });
  // Paul (qui a demandé, pas membre) et Sarah (hors du crew) ne sont pas proposés.
  await expect(page.getByTestId("story-tag-result").filter({ hasText: crew.paul.pseudo })).toHaveCount(0);
  await expect(page.getByTestId("story-tag-result").filter({ hasText: crew.sarah.pseudo })).toHaveCount(0);
  await shot(page, "13-crew-identifier");
  await page.getByTestId("story-to-preview").click();
  await page.getByTestId("story-publish").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  await ctx.close();

  // Membre : la voit. Non-membres (même abonnée de la membre) : rien, sans même savoir qu'il y en a une.
  const mine = (await storiesOf(crew.lea, crew.chef.id)) as { id: string; audience: string; mediaUrl: string }[];
  expect(mine).toHaveLength(1);
  expect(mine[0]?.audience).toBe("crew");
  expect((await storyFile(crew.lea, mine[0] as { mediaUrl: string })).width).toBe(1080);
  for (const outsider of [crew.sarah, crew.paul, crew.nina]) {
    expect(await storiesOf(outsider, crew.chef.id)).toEqual([]);
  }
  const url = (mine[0]?.mediaUrl ?? "").replace(/^\/api/, "");
  expect((await apiCall(crew.sarah.cookie, "GET", url)).status).toBe(403);
});

test("captures de contrôle de l'écran à 384 px et 390 px police 1,3, Béton et Sable", async ({ browser }) => {
  test.setTimeout(300_000);
  const author = await who("StCaptures");
  for (const theme of ["beton", "sable"]) {
    for (const size of [
      { width: 384, scale: 1, tag: "384-f1" },
      { width: 390, scale: 1.3, tag: "390-f13" },
    ]) {
      const { ctx, page } = await open(browser, author.email, theme, size);
      const tag = `${theme}-${size.tag}`;
      await go(page, "/story/publier");
      await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
      await shot(page, `choix-${tag}`);
      const chooser = page.waitForEvent("filechooser");
      await page.getByTestId("story-pick-gallery").click();
      await (await chooser).setFiles(landscape());
      await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 60_000 });
      await shot(page, `ps0-ajuster-posee-${tag}`);
      await page.getByTestId("story-fit-zoom-in").click();
      await page.getByTestId("story-fit-zoom-in").click();
      await shot(page, `ps0-ajuster-ajustee-${tag}`);
      await page.getByTestId("story-fit-fill").click();
      await shot(page, `ps0-ajuster-remplie-${tag}`);
      await page.getByTestId("story-fit-continue").click();
      await expect(page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("story-plate-add").click();
      await shot(page, `ps2-plaque-${tag}`);
      await page.getByTestId("story-plate-none").click();
      await page.getByTestId("story-plate-none-yes").click();
      await page.getByTestId("story-plate-validate").click();
      await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("story-caption").fill("Prête pour le Lydia demain");
      await shot(page, `ps3-details-${tag}`);
      await page.getByTestId("story-to-preview").click();
      await expect(page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
      await shot(page, `ps3-apercu-${tag}`);
      await ctx.close();
    }
  }
});
