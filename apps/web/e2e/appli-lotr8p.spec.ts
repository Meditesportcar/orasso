import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8p (maquette R8.4), côté appli (version web compilée de recette, `APP_URL`) : l'écran « Publier au Fil ». Au nom de
// qui (seulement avec plus d'une casquette), pour quel événement (liste rendue par l'API, une fiche pro ne rattache pas),
// l'affiche comme visuel sans photo (T1), « Info importante » (motif obligatoire, plafond affiché puis atteint). Comptes du
// seed ; photos du seed. À lancer sur une base fraîche (`seed --reset`) : le plafond de l'info importante est consommé.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8p-captures/apres/recette-appli`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton", width = 390, scale = 1) {
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
  await page.goto("/fil/publier");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string, height = 2600) {
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 390, height });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function addPhoto(page: Page, name = "car-golf-gti.jpg") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo(name)]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
}

const structure = (page: Page) => page.locator('[data-testid^="fil-publish-as-structure:"]').first();
const eventByTitle = (page: Page, title: string) =>
  page.locator('[data-testid^="fil-publish-event-"]').filter({ hasText: title }).first();
const missing = (page: Page) => page.getByTestId("fil-publish-missing");

test("un compte à une seule casquette ne voit pas « Publier en tant que » ; un passionné publie « sera au » avec une photo", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  await expect(page.getByTestId("fil-publish-as")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-gesture")).toContainText("Un seul geste, une seule chose");
  await ctx.close();

  const d = await open(browser, "damien@orasso.local");
  await expect(d.page.getByTestId("fil-publish-as")).toBeVisible();
  await expect(d.page.getByTestId("fil-publish-as-me")).toContainText("Moi · Damien_66");
  // « Moi » : « Rattacher à une sortie », le tampon « Présent » ne se voit pas pour une sortie à venir.
  await expect(d.page.getByTestId("fil-publish-events")).toContainText("Rattacher à une sortie");
  await expect(missing(d.page)).toHaveText("Ajoute au moins une photo.");
  await addPhoto(d.page);
  await eventByTitle(d.page, "Nocturne de Canet").click();
  await expect(d.page.getByTestId("fil-publish-says-phrase")).toContainText("sera au Nocturne de Canet");
  await expect(d.page.getByTestId("fil-publish-stamp")).toHaveCount(0);
  // Le véhicule et le lieu libre : le lieu disparaît dès qu'un événement est choisi.
  await expect(d.page.getByTestId("fil-publish-place")).toHaveCount(0);
  await shot(d.page, "moi-evenement");
  await expect(d.page.getByTestId("fil-publish-send")).toBeEnabled();
  await d.page.getByTestId("fil-publish-send").click();
  await expect(d.page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await d.ctx.close();
});

test("une structure publie « pour le … » sans photo : l'affiche est le visuel ; hors événement, sans photo, c'est bloqué", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await structure(page).click();
  await expect(structure(page)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("fil-publish-events")).toContainText("Rattacher à un événement");
  // Hors événement, sans photo : bloqué avec sa raison ; pas de véhicule pour une structure.
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(missing(page)).toHaveText("Ajoute au moins une photo.");
  await page.getByTestId("fil-publish-caption").fill("Le plan du plateau est en ligne");
  await expect(missing(page)).toHaveText("Ajoute au moins une photo.");
  await expect(page.getByTestId("fil-publish-place")).toBeVisible();
  await shot(page, "structure-hors-evenement-bloque");
  // Un événement qui a une affiche : l'affiche est le visuel, la publication part sans photo.
  await eventByTitle(page, "Expo Rivesaltes").click();
  await expect(page.getByTestId("fil-publish-poster")).toBeVisible();
  await expect(page.getByTestId("fil-publish-poster")).toContainText(
    "Sans photo : l'affiche de l'événement sera le visuel.",
  );
  await expect(page.getByTestId("fil-publish-says-phrase")).toContainText("pour le Expo Rivesaltes");
  await expect(page.getByTestId("fil-publish-says-where")).toContainText("journal");
  await expect(missing(page)).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-send")).toBeEnabled();
  expect(await cutWords(page, "fil-publish-events")).toEqual([]);
  await shot(page, "structure-affiche-visuel");
  // Sans légende : « écris un mot ».
  await page.getByTestId("fil-publish-caption").fill("");
  await expect(missing(page)).toContainText("Sans photo, écris un mot");
  await page.getByTestId("fil-publish-caption").fill("Le plan du plateau est en ligne");
  // Dès qu'une photo est ajoutée, l'affiche disparaît de l'aperçu.
  await addPhoto(page);
  await expect(page.getByTestId("fil-publish-poster")).toHaveCount(0);
  await page.getByTestId("fil-publish-photo-remove").first().click();
  await expect(page.getByTestId("fil-publish-poster")).toBeVisible();
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await ctx.close();
});

test("« Info importante » : sans motif bloquée, avec motif envoyée, puis le plafond est affiché et atteint", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await structure(page).click();
  // Pas pour « Moi » ni sans événement : la case n'existe pas.
  await expect(page.getByTestId("fil-publish-important")).toHaveCount(0);
  await eventByTitle(page, "Nocturne de Canet").click();
  await expect(page.getByTestId("fil-publish-important")).toBeVisible();
  await expect(page.getByTestId("fil-publish-important-toggle")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("fil-publish-important-sub")).toContainText(
    "Sans la case : la publication alimente le journal et le résumé du jour, sans notifier.",
  );
  await page.getByTestId("fil-publish-caption").fill("Les portes ouvrent à 17 h");
  await page.getByTestId("fil-publish-important-toggle").click();
  await expect(page.getByTestId("fil-publish-important-sub")).toContainText(
    /inscrits? (sont|est) prévenus? (tout de suite|à 8 h)/,
  );
  await expect(page.getByTestId("fil-publish-important-quota")).toContainText("Encore 1 aujourd'hui, 3 cette semaine");
  // Aucun motif présélectionné : bloquée, avec la ligne qui dit pourquoi.
  await expect(page.getByTestId("fil-publish-important-reasons").getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(missing(page)).toHaveText("Choisis le motif de l'info importante.");
  await shot(page, "info-importante-cochee");
  await page.getByTestId("fil-publish-important-reasons").getByText("Horaires").click();
  await expect(missing(page)).toHaveCount(0);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await ctx.close();

  // Un jour : une seule. Le plafond du jour est atteint pour cet événement : la case est désactivée, la raison écrite.
  const again = await open(browser, "damien@orasso.local");
  await structure(again.page).click();
  await eventByTitle(again.page, "Nocturne de Canet").click();
  await expect(again.page.getByTestId("fil-publish-important-toggle")).toBeDisabled();
  await expect(again.page.getByTestId("fil-publish-important-sub")).toHaveText(
    "Plus d'info importante aujourd'hui pour cet événement.",
  );
  await shot(again.page, "info-importante-plafond");
  // Un autre événement a encore sa place.
  await eventByTitle(again.page, "Expo Rivesaltes").click();
  await expect(again.page.getByTestId("fil-publish-important-toggle")).toBeEnabled();
  await again.ctx.close();
});

test("plafond atteint pendant l'envoi (409) : le plafond réel s'affiche, la case se décoche, rien n'est perdu", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await structure(page).click();
  await eventByTitle(page, "Expo Rivesaltes").click();
  await page.getByTestId("fil-publish-caption").fill("Parking P2 fermé");
  await page.getByTestId("fil-publish-important-toggle").click();
  await page.getByTestId("fil-publish-important-reasons").getByText("Accès").click();
  // L'API dit « plafond atteint » (409) malgré ce que l'écran croyait.
  await page.route("**/api/me/feed-posts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "important_quota", message: "plafond", details: { leftToday: 0, leftWeek: 2 } },
      }),
    });
  });
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByText("Tu as atteint la limite d'infos importantes")).toBeVisible();
  await expect(page.getByTestId("fil-publish-important-toggle")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-important-sub")).toContainText("Plus d'info importante aujourd'hui");
  await expect(page.getByTestId("fil-publish-caption")).toHaveValue("Parking P2 fermé");
  await shot(page, "refus-plafond");
  await ctx.close();
});

test("refus : événement non rattachable (422) recharge la liste ; pas de droit (403) donne le lien vers la sécurité ; sans réseau, le brouillon reste", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
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
  await expect(page.getByTestId("fil-publish-event-none")).toHaveAttribute("aria-checked", "true");
  await shot(page, "refus-non-rattachable");
  await fail(403, "persona_forbidden");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByText("Tu ne peux pas publier au nom de cette page.")).toBeVisible();
  await expect(page.getByTestId("fil-publish-security")).toBeVisible();
  await shot(page, "refus-droits");
  await page.unroute("**/api/me/feed-posts");
  await page.route("**/api/me/feed-posts", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByText("Pas de réseau")).toBeVisible();
  await expect(page.getByTestId("fil-publish-caption")).toHaveValue("Un mot");
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1);
  await shot(page, "refus-sans-reseau");
  await ctx.close();
});

test("une fiche pro ne voit pas le bloc des événements ; un prestataire le voit ; photo obligatoire pour une casquette hors événement", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "garage@orasso.local");
  await expect(page.getByTestId("fil-publish-as")).toBeVisible();
  await page.getByTestId("fil-publish-as-pro:" + (await proId(page))).click();
  await expect(page.getByTestId("fil-publish-events")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-place")).toBeVisible();
  await expect(missing(page)).toHaveText("Ajoute au moins une photo.");
  await shot(page, "fiche-pro");
  const provider = page.locator('[data-testid^="fil-publish-as-provider:"]').first();
  await provider.click();
  await expect(page.getByTestId("fil-publish-events")).toBeVisible();
  await expect(page.getByTestId("fil-publish-events")).toContainText("Rattacher à un événement");
  await shot(page, "prestataire");
  await ctx.close();
  const media = await open(browser, "leo@orasso.local");
  await media.page.locator('[data-testid^="fil-publish-as-media:"]').first().click();
  await expect(media.page.getByTestId("fil-publish-events")).toBeVisible();
  await shot(media.page, "media");
  await media.ctx.close();
});

async function proId(page: Page): Promise<string> {
  const id = await page.locator('[data-testid^="fil-publish-as-pro:"]').first().getAttribute("data-testid");
  return (id ?? "").replace("fil-publish-as-pro:", "");
}

test("police ×1,3 à 384 px, Sable : aucun nom d'événement coupé, le bouton « Publier » reste unique", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local", "sable", 384, 1.3);
  await structure(page).click();
  await eventByTitle(page, "Nocturne de Canet").click();
  expect(await cutWords(page, "fil-publish-events")).toEqual([]);
  await expect(page.getByRole("button", { name: "Publier", exact: true })).toHaveCount(1);
  await shot(page, "sable-384-x13");
  await ctx.close();
});

// --- Tour 2 : envoi incertain, liste à rejouer, refus de la liste ---------------------------------------------------------

/** La réponse se perd après que le serveur a validé : la requête part vraiment, puis la connexion tombe. */
async function loseResponses(page: Page) {
  await page.route("**/api/me/feed-posts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });
}

async function myCaptions(): Promise<string[]> {
  const cookie = await login("damien@orasso.local");
  const res = await apiCall<{ items: { caption: string | null }[] }>(cookie, "GET", "/me/feed-posts");
  return res.data.items.map((p) => p.caption ?? "");
}

test("réponse perdue après validation : le formulaire se fige, « Réessayer » renvoie la même publication sans doublon", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await addPhoto(page);
  const caption = `Réessai ${Date.now()}`;
  await page.getByTestId("fil-publish-caption").fill(caption);
  await loseResponses(page);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  await expect(page.getByTestId("fil-publish-caption")).not.toBeEditable();
  await expect(page.getByTestId("fil-publish-send")).toContainText(/Réessayer/i);
  await shot(page, "envoi-incertain");
  await page.unroute("**/api/me/feed-posts");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  expect((await myCaptions()).filter((c) => c === caption)).toHaveLength(1);
  await ctx.close();
});

test("la liste des événements en panne : « Réessayer » ; refus 403 : message, lien sécurité, « Publier » bloqué", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await structure(page).click();
  await expect(page.getByTestId("fil-publish-events")).toContainText("Expo Rivesaltes");
  await page.route("**/api/me/feed-posts/attachable-events**", (route) => route.abort("failed"));
  await page.getByTestId("fil-publish-as-me").click();
  await expect(page.getByTestId("fil-publish-events-retry")).toBeVisible();
  await page.unroute("**/api/me/feed-posts/attachable-events**");
  await page.getByTestId("fil-publish-events-retry").click();
  await expect(page.getByTestId("fil-publish-events")).toContainText("Nocturne de Canet");
  await expect(page.getByTestId("fil-publish-events-retry")).toHaveCount(0);
  // Refus : structure sans second facteur ou suspendue.
  await page.route("**/api/me/feed-posts/attachable-events**", (route) =>
    route.request().url().includes("persona=organizer")
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "two_factor_required", message: "2FA" } }),
        })
      : route.continue(),
  );
  await structure(page).click();
  await expect(page.getByTestId("fil-publish-forbidden")).toBeVisible();
  await expect(page.getByTestId("fil-publish-security")).toBeVisible();
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(missing(page)).toContainText("double authentification");
  await shot(page, "liste-refusee");
  await ctx.close();
});

// --- Tour 3 ------------------------------------------------------------------------------------------------------------

/** Sans réponse : la requête n'atteint jamais le serveur (rien n'est créé). */
async function dropRequests(page: Page) {
  await page.route("**/api/me/feed-posts", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
}

test("« Modifier » vérifie d'abord : publiée, « Ta publication est en ligne », rien à renvoyer", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await addPhoto(page);
  const stamp = Date.now();
  await page.getByTestId("fil-publish-caption").fill(`Publiée ${stamp}`);
  await loseResponses(page);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  await page.unroute("**/api/me/feed-posts");
  await page.getByTestId("fil-publish-uncertain-edit").click();
  await expect(page.getByTestId("fil-publish-done")).toContainText("Ta publication est en ligne.");
  expect((await myCaptions()).filter((c) => c === `Publiée ${stamp}`)).toHaveLength(1);
  await ctx.close();
});

test("« Modifier » vérifie d'abord : absente, nouvel identifiant et saisie gardée, sans message d'incertitude ; vérification impossible, reste incertain", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await addPhoto(page);
  const stamp = Date.now();
  await page.getByTestId("fil-publish-caption").fill(`Absente ${stamp}`);
  await dropRequests(page);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  // La vérification ne peut pas aboutir (réseau) : le formulaire reste figé.
  await page.route("**/api/me/feed-posts/by-client/**", (route) => route.abort("failed"));
  await page.getByTestId("fil-publish-uncertain-edit").click();
  await expect(page.getByText("Impossible de vérifier l'envoi")).toBeVisible();
  await expect(page.getByTestId("fil-publish-caption")).not.toBeEditable();
  await page.unroute("**/api/me/feed-posts/by-client/**");
  await page.getByTestId("fil-publish-uncertain-edit").click();
  await expect(page.getByTestId("fil-publish-caption")).toBeEditable();
  await expect(page.getByTestId("fil-publish-caption")).toHaveValue(`Absente ${stamp}`);
  await expect(page.getByText("peut-être")).toHaveCount(0);
  await page.unroute("**/api/me/feed-posts");
  await page.getByTestId("fil-publish-caption").fill(`Corrigée ${stamp}`);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  const captions = await myCaptions();
  expect(captions).toContain(`Corrigée ${stamp}`);
  expect(captions).not.toContain(`Absente ${stamp}`);
  await ctx.close();
});

for (const [status, code] of [
  [409, "important_quota"],
  [422, "event_not_attachable"],
  [403, "persona_forbidden"],
] as const) {
  test(`réseau perdu puis ${status} ${code} : l'envoi n'est plus incertain, on corrige et on renvoie`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, "damien@orasso.local");
    await addPhoto(page);
    await page.getByTestId("fil-publish-caption").fill("Un mot");
    await dropRequests(page);
    await page.getByTestId("fil-publish-send").click();
    await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
    await page.unroute("**/api/me/feed-posts");
    await page.route("**/api/me/feed-posts", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({ error: { code, message: code, details: { leftToday: 0, leftWeek: 2 } } }),
          })
        : route.continue(),
    );
    await page.getByTestId("fil-publish-send").click();
    await expect(page.getByTestId("fil-publish-uncertain")).toHaveCount(0);
    await expect(page.getByTestId("fil-publish-caption")).toBeEditable();
    await expect(page.getByTestId("fil-publish-send")).toContainText(/Publier/i);
    await ctx.close();
  });
}

test("un 429 pendant l'incertitude ne libère pas le formulaire", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await addPhoto(page);
  await page.getByTestId("fil-publish-caption").fill("Un mot");
  await dropRequests(page);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  await page.unroute("**/api/me/feed-posts");
  await page.route("**/api/me/feed-posts", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "rate_limited", message: "429" } }),
        })
      : route.continue(),
  );
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  await expect(page.getByTestId("fil-publish-caption")).not.toBeEditable();
  await ctx.close();
});

test("la réponse d'envoi de A, arrivée après la connexion de B, n'écrit rien dans le Fil de B", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await addPhoto(page);
  const secret = `Secret de A ${Date.now()}`;
  await page.getByTestId("fil-publish-caption").fill(secret);
  // La réponse du POST est retardée : A est déconnecté et B connecté (sans recharger l'appli) avant son arrivée.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/me/feed-posts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const real = await route.fetch();
    await held;
    await route.fulfill({ response: real });
  });
  await page.getByTestId("fil-publish-send").click();
  const spa = (path: string) =>
    page.evaluate((to) => {
      window.history.pushState({}, "", to);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
  await spa("/moi");
  await page.getByTestId("profil-gear").click();
  await page.getByTestId("profil-sign-out").click();
  await page.waitForURL(/auth/, { timeout: 30_000 });
  await page.getByLabel("E-mail").fill("kenji@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await spa("/fil");
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  release();
  await page.waitForTimeout(3_000);
  // Le Fil de B (sans recharger : l'état global de l'appli est celui qu'on vérifie) ne montre pas le texte de A.
  await spa("/accueil");
  await spa("/fil");
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(secret)).toHaveCount(0);
  await ctx.close();
});
