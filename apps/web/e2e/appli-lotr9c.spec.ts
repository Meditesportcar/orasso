import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, createPublishedPro, SEED_PASSWORD, signUpApi, unique } from "./helpers";

// Lot R9c (offres du pro), côté appli (version compilée, `APP_URL`) : le pro publie une offre (photo, titre, dates) par « Publier » ;
// elle est dans « Offres » et « Publications » de sa fiche et lisible d'un passionné avec l'étiquette ; sans photo « Publier » est
// bloqué avec sa raison ; une structure ne voit pas le bloc « Étiquette » ; l'offre terminée du seed n'est pas dans « Offres » mais
// reste dans « Publications » ; « Anciennes offres » (abonné, non-abonné, absentes de « Présentation ») ; sans session, ni onglet ni offre.
const APP = process.env.APP_URL;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function open(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, baseURL: APP });
  await ctx.addInitScript(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  return { ctx, page: await ctx.newPage() };
}
async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}
async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}
async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}
const addPhoto = async (page: Page) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-photo").first().click();
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
};
const dayFrom = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

test("le pro publie une offre et la retrouve dans « Offres », « Publications » et chez un passionné", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const proCookie = await signUpApi(`ProR9c_${s}`);
  const pro = await createPublishedPro(proCookie, `Garage R9c ${s}`);
  const fanCookie = await signUpApi(`FanR9c_${s}`);
  await apiCall(fanCookie, "POST", `/pros/${pro.id}/follow`);

  const owner = await open(browser);
  await signIn(owner.page, `ProR9c_${s}`.toLowerCase() + "@e2e.orasso.test");
  const page = owner.page;
  await go(page, `/fil/publier?fiche=${pro.id}&etiquette=offre`);
  await expect(page.getByTestId("fil-publish-offer")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-offer-title")).toBeVisible();
  await expect(page.getByTestId("fil-publish-says-tag")).toHaveText("Offre");
  // Sans photo : « Publier » est bloqué, la ligne le dit.
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-missing")).toHaveText("Ajoute au moins une photo.");
  await addPhoto(page);
  await expect(page.getByTestId("fil-publish-missing")).toHaveText(
    "Donne un titre à ton offre (2 caractères au moins).",
  );
  await page.getByTestId("fil-publish-offer-title").fill("Polish complet R9c");
  await expect(page.getByTestId("fil-publish-missing")).toHaveText("Choisis la date de fin de l'offre.");
  await page.getByTestId("fil-publish-offer-edit").click();
  await page.getByTestId("fil-publish-offer-end").fill(dayFrom(20));
  await expect(page.getByTestId("fil-publish-send")).toBeEnabled();
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("fil-publish-done-offer")).toContainText(`Publié : Garage R9c ${s} · offre jusqu'au`);

  // Sa fiche : l'onglet « Offres » (compteur, bouton) et « Publications ».
  await go(page, `/p/${pro.slug}?onglet=offres`);
  await expect(page.getByTestId("offers-count")).toHaveText("1 offre en cours", { timeout: 30_000 });
  await expect(page.getByTestId("offers-publish")).toBeVisible();
  await expect(page.getByTestId("offer-row")).toContainText("Polish complet R9c");
  await expect(page.getByTestId("offer-row")).toContainText("Jusqu'au");
  await go(page, `/p/${pro.slug}?onglet=publications`);
  await expect(page.getByTestId("publications-grid").or(page.getByTestId("publications-one-by-one"))).toBeVisible({
    timeout: 30_000,
  });
  await owner.ctx.close();

  // Un passionné qui suit la fiche : la publication seule porte l'étiquette, le titre et les dates.
  const list = await apiCall<{ items: { id: string }[] }>(
    fanCookie,
    "GET",
    `/authors/p:${pro.id}/feed-posts?filter=offer`,
  );
  expect(list.data.items).toHaveLength(1);
  const fan = await open(browser);
  await signIn(fan.page, `FanR9c_${s}`.toLowerCase() + "@e2e.orasso.test");
  await go(fan.page, `/publication/${list.data.items[0]?.id}`);
  await expect(fan.page.getByTestId("feed-post-offer-tag")).toContainText("Offre", { timeout: 30_000 });
  await expect(fan.page.getByTestId("feed-post-offer-title")).toHaveText("Polish complet R9c");
  await expect(fan.page.getByTestId("feed-post-offer-dates")).toContainText("Jusqu'au");
  await fan.ctx.close();
});

test("une structure ne voit pas le bloc « Étiquette » ; l'espace du pro propose les deux boutons", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "damien@orasso.local");
  await go(page, "/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-offer")).toHaveCount(0);
  await page.locator('[data-testid^="fil-publish-as-structure:"]').first().click();
  await expect(page.getByTestId("fil-publish-offer")).toHaveCount(0);
  await ctx.close();

  const pro = await open(browser);
  await signIn(pro.page, "covering@orasso.local");
  await go(pro.page, "/moi");
  await pro.page.getByTestId("casquette-pro").click();
  await pro.page.waitForURL(/accueil/);
  await go(pro.page, "/publier");
  await expect(pro.page.getByTestId("pro-posts-counter")).toBeVisible({ timeout: 30_000 });
  await expect(pro.page.getByTestId("pro-publish-offer")).toBeVisible();
  await expect(pro.page.getByTestId("pro-publish")).toBeVisible();
  await expect(pro.page.getByTestId("offer-row")).toHaveCount(2);
  await expect(pro.page.getByText("Covering de saison")).toHaveCount(0);
  await pro.ctx.close();
});

test("l'offre terminée du seed n'est pas dans « Offres » mais reste dans « Publications » ; « Anciennes offres » selon le regard", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const abo = `AboR9c_${s}`;
  const non = `NonR9c_${s}`;
  const aboCookie = await signUpApi(abo);
  await signUpApi(non);
  const garage = await apiCall<{ id: string }>(aboCookie, "GET", "/pros/by-slug/garage-du-port");
  await apiCall(aboCookie, "POST", `/pros/${garage.data.id}/follow`);

  // Atelier Covering 66 : deux offres en cours, la terminée est dans « Publications ».
  const a = await open(browser);
  await signIn(a.page, `${non}`.toLowerCase() + "@e2e.orasso.test");
  await go(a.page, "/p/atelier-covering-66?onglet=offres");
  await expect(a.page.getByTestId("offers-count")).toHaveText("2 offres en cours", { timeout: 30_000 });
  await expect(a.page.getByTestId("offer-row")).toHaveCount(2);
  await expect(a.page.getByText("Covering de saison")).toHaveCount(0);
  await expect(a.page.getByTestId("offers-publish")).toHaveCount(0);
  const posts = await apiCall<{ items: { offer: { state: string } | null }[] }>(
    aboCookie,
    "GET",
    "/authors/p:" +
      (await apiCall<{ id: string }>(aboCookie, "GET", "/pros/by-slug/atelier-covering-66")).data.id +
      "/feed-posts",
  );
  expect(posts.data.items.some((p) => p.offer?.state === "ended")).toBe(true);
  // Garage du Port, non abonné : le message, rien de « Présentation ».
  await go(a.page, "/p/garage-du-port?onglet=offres");
  await expect(a.page.getByTestId("old-offers-locked")).toContainText("réservée", { timeout: 30_000 });
  await go(a.page, "/p/garage-du-port?onglet=presentation");
  await expect(a.page.getByText("Révision d'automne")).toHaveCount(0);
  await a.ctx.close();

  // Abonné : « Anciennes offres » lisibles, absentes de « Présentation ».
  const b = await open(browser);
  await signIn(b.page, abo.toLowerCase() + "@e2e.orasso.test");
  await go(b.page, "/p/garage-du-port?onglet=offres");
  await expect(b.page.getByTestId("old-offer")).toContainText("Révision d'automne", { timeout: 30_000 });
  await expect(b.page.getByTestId("offers-empty")).toHaveText("Pas d'offre en cours.");
  await go(b.page, "/p/garage-du-port?onglet=presentation");
  await expect(b.page.getByTestId("pro-presentation")).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByText("Révision d'automne")).toHaveCount(0);
  await b.ctx.close();
});

test("sans session : ni onglet « Offres » ni offre ; le compteur « offres en cours » n'est servi qu'avec une session", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser);
  await go(page, "/p/atelier-covering-66");
  await expect(page.getByTestId("page-tabs").getByRole("tab")).toHaveText(["Présentation"], { timeout: 30_000 });
  await expect(page.getByTestId("page-tab-offers")).toHaveCount(0);
  await expect(page.getByText("Polish complet avant l'hiver")).toHaveCount(0);
  await expect(page.getByText("offres en cours")).toHaveCount(0);
  await ctx.close();
  const cookie = await signUpApi(`CptR9c_${unique()}`);
  const withSession = await apiCall<{ offers?: { current: number } }>(
    cookie,
    "GET",
    "/pros/by-slug/atelier-covering-66",
  );
  expect(withSession.data.offers).toEqual({ current: 2 });
});
