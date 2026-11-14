import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { apiOrLoaderData, ownerMarkers, watchOwnerLeak } from "./ownerLeak";
import { RELAIS } from "./relais";

// Lot R9i, côté site : la conversation de page d'un média (graine : Kenji_66 ↔ « Sud Cars », tenue par Leo_SudCars).
// Kenji_66 : la ligne « Sud Cars » et l'étiquette « Média », la conversation sous le nom de la page, « Lu par Sud Cars »,
// « Voir la page » vers /m/<id>, il écrit ; Leo_SudCars (sans second facteur) : la ligne « Kenji_66 », « Tu réponds en tant
// que Sud Cars » et sa légende, il répond ; retour chez Kenji. « Leo_SudCars » n'apparaît ni dans la page, ni dans le rendu
// serveur, ni dans aucune réponse /api/ reçue par le navigateur de Kenji. Lea_11 (identification retirée) : 403 avec le libellé.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9i-captures/apres/recette-site`;
const OWNER = "Leo_SudCars";
test.use({ actionTimeout: 30_000 });

/**
 * Garde la lecture de chaque réponse reçue (/api/ et données des chargeurs *.data) ; `done()` les attend toutes et ÉCHOUE si un corps attendu
 * reste illisible ou dépasse le délai, puis contrôle l'absence du pseudo, de l'e-mail et de l'identifiant du titulaire (`ownerLeak.ts`).
 */
let ownerIds: string[] = [];
test.beforeAll(async () => {
  ownerIds = await ownerMarkers();
});
const watchApi = (page: Page) => watchOwnerLeak(page, { markers: ownerIds, match: apiOrLoaderData });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["beton", "sable"] as const) {
  for (const viewport of [MOBILE, { width: 1280, height: 800 }] as const) {
    test(`conversation de page, côté personne puis côté titulaire (${theme}, ${viewport.width} px)`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      // --- Kenji_66 (la personne identifiée).
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      const api = watchApi(page);
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/messages");
      await page.goto("/app/messages");
      const row = page.getByTestId("conversation-row").filter({ hasText: "Sud Cars" });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Média");
      // Le logo de la page (pas seulement son nom) : l'avatar de la ligne porte l'adresse du logo de Sud Cars.
      await expect(row.locator('img[src*="sud-cars-logo"]')).toBeVisible();
      await shot(page, `liste-personne-${theme}-${viewport.width}`);
      await row.click();
      await expect(page.getByTestId("conversation").getByRole("heading", { name: "Sud Cars" })).toBeVisible();
      // La réponse de la page est signée « Sud Cars », lue par « Sud Cars ».
      await expect(page.getByTestId("messages")).toContainText("Oui, je te l'envoie ce soir.");
      await expect(page.getByTestId("messages")).toContainText("Sud Cars");
      await expect(page.getByTestId("read-by")).toHaveText("Lu par Sud Cars");
      const link = page.getByTestId("view-page");
      await expect(link).toHaveText("Voir la page");
      await expect(link).toHaveAttribute("href", /^\/m\/[0-9a-f-]{36}$/);
      await expect(page.locator('a[href^="/u/"]')).toHaveCount(0);
      const note = `Merci, bien reçu (${theme} ${viewport.width})`;
      // Le formulaire est hydraté (sinon la saisie est perdue à l'hydratation).
      await page.waitForLoadState("networkidle");
      await page.locator("#message-body").fill(note);
      await Promise.all([
        page.waitForResponse(
          (r) => /\/conversations\/[^/]+\/messages$/.test(r.url()) && r.request().method() === "POST",
        ),
        page.getByRole("button", { name: "Envoyer", exact: true }).click(),
      ]);
      await expect(page.getByTestId("messages")).toContainText(note);
      await shot(page, `conversation-personne-${theme}-${viewport.width}`);
      // Le rendu serveur : la page et son HTML initial ne disent rien du titulaire.
      const html = await page.content();
      expect(html).not.toContain(OWNER);
      const url = page.url();
      const ssr = await ctx.request.get(url);
      expect(await ssr.text()).not.toContain(OWNER);
      await api.done();
      await ctx.close();

      // --- Leo_SudCars (le titulaire, sans second facteur).
      const ctx2 = await browser.newContext({ viewport });
      const page2 = await ctx2.newPage();
      await setTheme(page2, theme);
      await loginInBrowser(page2, "leo@orasso.local", undefined, "/app/messages");
      await page2.goto("/app/messages");
      const row2 = page2.getByTestId("conversation-row").filter({ hasText: "Kenji_66" });
      await expect(row2).toContainText("Sud Cars");
      await expect(row2).toContainText("Média");
      await shot(page2, `liste-titulaire-${theme}-${viewport.width}`);
      await row2.click();
      await expect(page2.getByTestId("reply-as")).toContainText("Tu réponds en tant que Sud Cars");
      await expect(page2.getByTestId("reply-as").locator('img[src*="sud-cars-logo"]')).toBeVisible();
      await expect(page2.getByTestId("reply-as")).toContainText(
        "Kenji_66 voit le nom et le logo de ta page, jamais ton compte personnel.",
      );
      await expect(page2.getByTestId("messages")).toContainText(note);
      const answer = `Avec plaisir (${theme} ${viewport.width})`;
      await page2.waitForLoadState("networkidle");
      await page2.locator("#message-body").fill(answer);
      await Promise.all([
        page2.waitForResponse(
          (r) => /\/conversations\/[^/]+\/messages$/.test(r.url()) && r.request().method() === "POST",
        ),
        page2.getByRole("button", { name: "Envoyer", exact: true }).click(),
      ]);
      await expect(page2.getByTestId("messages")).toContainText(answer);
      await shot(page2, `conversation-titulaire-${theme}-${viewport.width}`);
      await ctx2.close();

      // --- Retour chez Kenji : la réponse est signée « Sud Cars ».
      const ctx3 = await browser.newContext({ viewport });
      const page3 = await ctx3.newPage();
      const api3 = watchApi(page3);
      await setTheme(page3, theme);
      await loginInBrowser(page3, "kenji@orasso.local", undefined, "/app/messages");
      await page3.goto("/app/messages");
      await page3.getByTestId("conversation-row").filter({ hasText: "Sud Cars" }).click();
      await expect(page3.getByTestId("messages")).toContainText(answer);
      expect(await page3.content()).not.toContain(OWNER);
      await api3.done();
      await ctx3.close();
    });
  }
}

test("Lea_11 (identification retirée) : l'ouverture est refusée avec le libellé, sans rien du titulaire", async () => {
  const lea = await login("lea@orasso.local");
  const kenji = await login("kenji@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string }[] }>(kenji, "GET", "/me");
  const list = await apiCall<{ items: { id: string; kind: string; page: { id: string } | null }[] }>(
    kenji,
    "GET",
    "/me/conversations",
  );
  expect(me.status).toBe(200);
  const conv = list.data.items.find((c) => c.kind === "media");
  expect(conv).toBeDefined();
  const view = await apiCall<{ page: { id: string } }>(kenji, "GET", `/conversations/${conv?.id}`);
  const refused = await apiCall<{ error: { message: string } }>(
    lea,
    "POST",
    `/media/${view.data.page.id}/conversation`,
  );
  expect(refused.status).toBe(403);
  expect(refused.data.error.message).toBe("Tu peux écrire à un média quand il t'a identifié sur un de ses albums.");
  expect(JSON.stringify(refused.data)).not.toContain(OWNER);
});

test("Damien_66 (identifié par sa voiture) : ouverture par un appel d'API dans sa session, puis l'écran", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const kenji = await login("kenji@orasso.local");
  const damien = await login("damien@orasso.local");
  const list = await apiCall<{ items: { id: string; kind: string }[] }>(kenji, "GET", "/me/conversations");
  const media = list.data.items.find((c) => c.kind === "media");
  const view = await apiCall<{ page: { id: string } }>(kenji, "GET", `/conversations/${media?.id}`);
  const opened = await apiCall<{ id: string }>(damien, "POST", `/media/${view.data.page.id}/conversation`);
  expect(opened.status).toBeLessThan(300);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  const api = watchApi(page);
  await loginInBrowser(page, "damien@orasso.local", undefined, `/app/messages/${opened.data.id}`);
  await page.goto(`/app/messages/${opened.data.id}`);
  await expect(page.getByTestId("conversation").getByRole("heading", { name: "Sud Cars" })).toBeVisible();
  await expect(page.getByTestId("view-page")).toBeVisible();
  expect(await page.content()).not.toContain(OWNER);
  await api.done();
  await ctx.close();
});

// Partie 2 : « Tes photos » de Kenji_66 → « Contacter » → la conversation de la page ; puis la feuille d'une photo → « Contacter
// Sud Cars » → la même conversation. Le pseudo du titulaire n'apparaît ni dans une réponse /api/ ni dans le DOM.
for (const theme of ["beton", "sable"] as const) {
  for (const viewport of [MOBILE, { width: 1280, height: 800 }] as const) {
    test(`« Tes photos » : « Contacter » ouvre la conversation de la page (${theme}, ${viewport.width} px)`, async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const kenjiCookie = await login("kenji@orasso.local");
      const tags = await apiCall<{ items: { albumId: string }[] }>(kenjiCookie, "GET", "/me/album-tags");
      const albumId = tags.data.items[0]?.albumId as string;
      expect(albumId).toBeTruthy();
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      const api = watchApi(page);
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, `/app/albums/${albumId}/mes-photos`);
      const contact = page.getByTestId("my-photos-contact");
      await expect(contact).toBeVisible();
      await expect(contact).toContainText("Contacter");
      await page.waitForLoadState("networkidle");
      await shot(page, `tes-photos-contacter-${theme}-${viewport.width}`);
      await contact.click();
      await page.waitForURL(/\/app\/messages\/[0-9a-f-]{36}$/);
      const conversationUrl = page.url();
      await expect(page.getByTestId("conversation").getByRole("heading", { name: "Sud Cars" })).toBeVisible();
      await expect(page.getByTestId("view-page")).toBeVisible();
      await expect(page.locator('img[src*="sud-cars-logo"]').filter({ visible: true }).first()).toBeVisible();

      await page.goto(`/app/albums/${albumId}/mes-photos`);
      await page.waitForLoadState("networkidle");
      await page.getByTestId("my-photo-more").first().click();
      const row = page.getByTestId("photo-sheet-contact");
      await expect(row).toBeVisible();
      await expect(row).toContainText("Contacter Sud Cars");
      await expect(row).toContainText("Un message à propos de cette photo");
      await shot(page, `feuille-contacter-${theme}-${viewport.width}`);
      await page.route("**/api/media/*/conversation", (route) =>
        route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "forbidden",
              message: "Tu peux écrire à un média quand il t'a identifié sur un de ses albums.",
            },
          }),
        }),
      );
      await row.click();
      // Tour 3 : un seul enchaînement par écran, la feuille se ferme au clic ; le refus se dit dans la page.
      await expect(page.getByTestId("photo-sheet")).toHaveCount(0);
      await expect(page.getByTestId("my-photos-error")).toContainText("Tu peux écrire à un média");
      expect(page.url()).not.toMatch(/\/messages\//);
      await page.unroute("**/api/media/*/conversation");
      await page.getByTestId("my-photo-more").first().click();
      await page.getByTestId("photo-sheet-contact").click();
      await page.waitForURL(/\/app\/messages\/[0-9a-f-]{36}$/);
      expect(page.url()).toBe(conversationUrl);
      await api.done();
      expect(await page.content()).not.toContain(OWNER);
      await ctx.close();
    });
  }
}
