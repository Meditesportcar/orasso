import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8p (maquette R8.4), côté site (`/app/fil/publier`, API et site lancés) : mêmes blocs, mêmes mots, mêmes règles que
// l'appli. À lancer sur une base fraîche (`seed --reset`) : le plafond de l'info importante est consommé.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r8p-captures/apres/recette-site`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.use({ viewport: { width: 1280, height: 900 } });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function openAs(page: Page, email: string) {
  await setTheme(page, "beton");
  await loginInBrowser(page, email, undefined, "/app/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible();
}

async function addPhoto(page: Page) {
  await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
}

const structure = (page: Page) => page.locator('[data-testid^="fil-publish-as-structure:"]').first();
const eventByTitle = (page: Page, title: string) =>
  page.locator('[data-testid^="fil-publish-event-"]').filter({ hasText: title }).first();
const missing = (page: Page) => page.getByTestId("fil-publish-missing");
const pressed = (page: Page, id: string, on: boolean) =>
  expect(page.getByTestId(id)).toHaveAttribute("aria-pressed", String(on));

test("une seule casquette : pas de « Publier en tant que » ; un passionné publie « sera au » avec une photo", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await openAs(page, "kenji@orasso.local");
  await expect(page.getByTestId("fil-publish-as")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-gesture")).toContainText("Un seul geste, une seule chose");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const d = await ctx.newPage();
  await openAs(d, "damien@orasso.local");
  await expect(d.getByTestId("fil-publish-as-me")).toContainText("Moi · Damien_66");
  await expect(missing(d)).toHaveText("Ajoute au moins une photo.");
  await addPhoto(d);
  await eventByTitle(d, "Nocturne de Canet").click();
  await expect(d.getByTestId("fil-publish-says-phrase")).toContainText("sera au Nocturne de Canet");
  await expect(d.getByTestId("fil-publish-stamp")).toHaveCount(0);
  await expect(d.getByTestId("fil-publish-place")).toHaveCount(0);
  await shot(d, "moi-evenement");
  await d.getByTestId("fil-publish-send").click();
  await expect(d.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await ctx.close();
});

test("une structure publie sans photo : l'affiche est le visuel ; hors événement sans photo, bloqué", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openAs(page, "damien@orasso.local");
  await structure(page).click();
  await pressed(page, (await structure(page).getAttribute("data-testid")) ?? "", true);
  await expect(page.getByTestId("fil-publish-events")).toContainText("Rattacher à un événement");
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await page.getByTestId("fil-publish-caption").fill("Le plan du plateau est en ligne");
  await expect(missing(page)).toHaveText("Ajoute au moins une photo.");
  await expect(page.getByTestId("fil-publish-place")).toBeVisible();
  await eventByTitle(page, "Expo Rivesaltes").click();
  await expect(page.getByTestId("fil-publish-poster")).toContainText(
    "Sans photo : l'affiche de l'événement sera le visuel.",
  );
  await expect(page.getByTestId("fil-publish-says-phrase")).toContainText("pour le Expo Rivesaltes");
  await expect(missing(page)).toHaveCount(0);
  expect(await cutWords(page, "fil-publish-events")).toEqual([]);
  await shot(page, "structure-affiche-visuel");
  await page.getByTestId("fil-publish-caption").fill("");
  await expect(missing(page)).toContainText("Sans photo, écris un mot");
  await page.getByTestId("fil-publish-caption").fill("Le plan du plateau est en ligne");
  await addPhoto(page);
  await expect(page.getByTestId("fil-publish-poster")).toHaveCount(0);
  await page.getByTestId("fil-publish-photo-remove").first().click();
  await expect(page.getByTestId("fil-publish-poster")).toBeVisible();
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
});

test("« Info importante » : motif obligatoire, envoyée, puis plafond du jour atteint", async ({ page }) => {
  test.setTimeout(300_000);
  await openAs(page, "damien@orasso.local");
  await structure(page).click();
  await expect(page.getByTestId("fil-publish-important")).toHaveCount(0);
  await eventByTitle(page, "Nocturne de Canet").click();
  await pressed(page, "fil-publish-important-toggle", false);
  await page.getByTestId("fil-publish-caption").fill("Les portes ouvrent à 17 h");
  await page.getByTestId("fil-publish-important-toggle").click();
  await pressed(page, "fil-publish-important-toggle", true);
  await expect(page.getByTestId("fil-publish-important-sub")).toContainText(
    /inscrits? (sont|est) prévenus? (tout de suite|à 8 h)/,
  );
  await expect(page.getByTestId("fil-publish-important-quota")).toContainText("Encore 1 aujourd'hui, 3 cette semaine");
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(missing(page)).toHaveText("Choisis le motif de l'info importante.");
  await shot(page, "info-importante-cochee");
  await page.getByTestId("fil-publish-important-schedule").click();
  await expect(missing(page)).toHaveCount(0);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await page.goto("/app/fil/publier");
  await structure(page).click();
  await eventByTitle(page, "Nocturne de Canet").click();
  await expect(page.getByTestId("fil-publish-important-toggle")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-important-sub")).toHaveText(
    "Plus d'info importante aujourd'hui pour cet événement.",
  );
  await shot(page, "info-importante-plafond");
});

test("refus : 422 recharge la liste, 403 donne le lien vers la sécurité, sans réseau le brouillon reste", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openAs(page, "damien@orasso.local");
  await addPhoto(page);
  await page.getByTestId("fil-publish-caption").fill("Un mot");
  const fail = async (status: number, code: string) => {
    await page.unroute("**/api/me/feed-posts");
    await page.route("**/api/me/feed-posts", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({ error: { code, message: code } }),
          })
        : route.continue(),
    );
  };
  await eventByTitle(page, "Nocturne de Canet").click();
  await fail(422, "event_not_attachable");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByText("Ta liste d'événements a été mise à jour")).toBeVisible();
  await pressed(page, "fil-publish-event-none", true);
  await fail(403, "persona_forbidden");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByText("Tu ne peux pas publier au nom de cette page.")).toBeVisible();
  await expect(page.getByTestId("fil-publish-security")).toBeVisible();
  await page.unroute("**/api/me/feed-posts");
  await page.route("**/api/me/feed-posts", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByText("Pas de réseau")).toBeVisible();
  await expect(page.getByTestId("fil-publish-caption")).toHaveValue("Un mot");
});

test("une fiche pro ne voit pas le bloc des événements ; prestataire et média le voient ; à 390 px", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openAs(page, "garage@orasso.local");
  await page.locator('[data-testid^="fil-publish-as-pro:"]').first().click();
  await expect(page.getByTestId("fil-publish-events")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-place")).toBeVisible();
  await expect(missing(page)).toHaveText("Ajoute au moins une photo.");
  await shot(page, "fiche-pro-390");
  await page.locator('[data-testid^="fil-publish-as-provider:"]').first().click();
  await expect(page.getByTestId("fil-publish-events")).toBeVisible();
  await shot(page, "prestataire-390");
});

// --- Tour 2 ------------------------------------------------------------------------------------------------------------

test("site : réponse perdue après validation, le formulaire se fige ; « Modifier » donne un nouvel identifiant", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openAs(page, "damien@orasso.local");
  await addPhoto(page);
  const stamp = Date.now();
  await page.getByTestId("fil-publish-caption").fill(`Avant ${stamp}`);
  await page.route("**/api/me/feed-posts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  await expect(page.getByTestId("fil-publish-caption")).toBeDisabled();
  await page.unroute("**/api/me/feed-posts");
  await page.getByTestId("fil-publish-uncertain-edit").click();
  await expect(page.getByText("a peut-être été publiée")).toBeVisible();
  await page.getByTestId("fil-publish-caption").fill(`Après ${stamp}`);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  const res = await page.evaluate(async () => (await fetch("/api/me/feed-posts")).json());
  const captions = (res.items as { caption: string | null }[]).map((p) => p.caption);
  expect(captions).toContain(`Avant ${stamp}`);
  expect(captions).toContain(`Après ${stamp}`);
});

test("site : « Réessayer » sans doublon après une réponse perdue", async ({ page }) => {
  test.setTimeout(240_000);
  await openAs(page, "damien@orasso.local");
  await addPhoto(page);
  const caption = `Réessai ${Date.now()}`;
  await page.getByTestId("fil-publish-caption").fill(caption);
  await page.route("**/api/me/feed-posts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  await page.unroute("**/api/me/feed-posts");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  const res = await page.evaluate(async () => (await fetch("/api/me/feed-posts")).json());
  expect((res.items as { caption: string | null }[]).filter((p) => p.caption === caption)).toHaveLength(1);
});

test("site : liste relue au retour sur l'onglet, « Réessayer » après une panne, refus 403 bloque « Publier »", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openAs(page, "damien@orasso.local");
  await structure(page).click();
  await expect(page.getByTestId("fil-publish-events")).toContainText("Expo Rivesaltes");
  await eventByTitle(page, "Expo Rivesaltes").click();
  await page.route("**/api/me/feed-posts/attachable-events**", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({
      response: res,
      json: { items: json.items.filter((e: { title: string }) => e.title !== "Expo Rivesaltes") },
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("fil-publish-events")).not.toContainText("Expo Rivesaltes");
  await expect(page.getByTestId("fil-publish-poster")).toHaveCount(0);
  await page.unroute("**/api/me/feed-posts/attachable-events**");
  await page.route("**/api/me/feed-posts/attachable-events**", (route) => route.abort("failed"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("fil-publish-events-retry")).toBeVisible();
  await page.unroute("**/api/me/feed-posts/attachable-events**");
  await page.getByTestId("fil-publish-events-retry").click();
  await expect(page.getByTestId("fil-publish-events")).toContainText("Expo Rivesaltes");
  await page.route("**/api/me/feed-posts/attachable-events**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "persona_forbidden", message: "non" } }),
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("fil-publish-forbidden")).toBeVisible();
  await expect(page.getByTestId("fil-publish-security")).toBeVisible();
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
});
