import { expect, test } from "@playwright/test";
import { apiCall, createPublishedPro, loginInBrowser, samplePhoto, signUpApi, unique } from "./helpers";

// Lot R9c (offres du pro), côté site : « Publier » avec l'étiquette « Offre » (photo, titre, fin), l'onglet « Offres » de la fiche, la
// publication seule avec son étiquette, « Anciennes offres » déplacées hors de « Présentation », l'espace du pro, sans session.
test.use({ viewport: { width: 1280, height: 900 } });
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

test("le pro publie une offre sur le site : bloc « Étiquette », refus sans titre, « Offres », publication seule", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const proPseudo = `ProS9c_${s}`;
  const proCookie = await signUpApi(proPseudo);
  const pro = await createPublishedPro(proCookie, `Garage S9c ${s}`);
  const fanPseudo = `FanS9c_${s}`;
  const fanCookie = await signUpApi(fanPseudo);
  await apiCall(fanCookie, "POST", `/pros/${pro.id}/follow`);

  await loginInBrowser(page, `${proPseudo.toLowerCase()}@e2e.orasso.test`, undefined, `/pro/${pro.slug}/publications`);
  await expect(page.getByTestId("pro-publish-offer")).toBeVisible();
  await expect(page.getByTestId("offers-empty")).toHaveText("Pas d'offre en cours.");
  await page.getByTestId("pro-publish-offer").click();
  await expect(page.getByTestId("fil-publish-offer-title")).toBeVisible();
  await expect(page.getByTestId("fil-publish-says-tag")).toHaveText(/Offre/);
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-missing")).toHaveText("Ajoute au moins une photo.");
  await page
    .getByTestId("fil-publish-file")
    .setInputFiles([{ name: "o.png", mimeType: "image/png", buffer: samplePhoto([40, 90, 140]) }]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  await expect(page.getByTestId("fil-publish-missing")).toHaveText(
    "Donne un titre à ton offre (2 caractères au moins).",
  );
  await page.getByTestId("fil-publish-offer-title").fill("Polish S9c");
  await expect(page.getByTestId("fil-publish-missing")).toHaveText("Choisis la date de fin de l'offre.");
  await page.getByTestId("fil-publish-offer-start").fill(day(1));
  await page.getByTestId("fil-publish-offer-end").fill(day(10));
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done-offer")).toContainText(`Publié : Garage S9c ${s} · offre du`, {
    timeout: 60_000,
  });

  // Le compteur du mois et la liste des offres de l'espace du pro.
  await page.goto(`/pro/${pro.slug}/publications`);
  await expect(page.getByTestId("posts-counter")).toHaveText("1 / 4 ce mois-ci");
  await expect(page.getByTestId("current-offers")).toContainText("Polish S9c");
  // Sa fiche : « Offres » (bouton du propriétaire), « Publications ».
  await page.goto(`/p/${pro.slug}?onglet=offres`);
  await expect(page.getByTestId("offers-count")).toHaveText("1 offre en cours", { timeout: 30_000 });
  await expect(page.getByTestId("offers-publish")).toBeVisible();
  await expect(page.getByTestId("offer-row")).toContainText("Polish S9c");
  await expect(page.getByTestId("page-tab-offers")).toBeVisible();

  // Un passionné qui suit la fiche : l'offre est dans « Offres », la publication seule porte l'étiquette.
  const fan = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await loginInBrowser(fan, `${fanPseudo.toLowerCase()}@e2e.orasso.test`, undefined, `/p/${pro.slug}?onglet=offres`);
  await expect(fan.getByTestId("offer-row")).toContainText("Polish S9c", { timeout: 30_000 });
  await expect(fan.getByTestId("offers-publish")).toHaveCount(0);
  const list = await apiCall<{ items: { id: string }[] }>(
    fanCookie,
    "GET",
    `/authors/p:${pro.id}/feed-posts?filter=offer`,
  );
  await fan.goto(`/app/publication/${list.data.items[0]?.id}`);
  await expect(fan.getByTestId("feed-post-offer-tag")).toContainText("Offre", { timeout: 30_000 });
  await expect(fan.getByTestId("feed-post-offer-title")).toHaveText("Polish S9c");
  await expect(fan.getByTestId("feed-post-offer-dates")).toContainText("Du");
});

test("une structure ne voit pas « Étiquette » ; « Anciennes offres » selon le regard ; sans session ni onglet ni offre", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible();
  await expect(page.getByTestId("fil-publish-offer")).toHaveCount(0);
  await page.locator('[data-testid^="fil-publish-as-structure:"]').first().click();
  await expect(page.getByTestId("fil-publish-offer")).toHaveCount(0);

  // Atelier Covering 66 : l'offre terminée n'est pas dans « Offres ».
  await page.goto("/p/atelier-covering-66?onglet=offres");
  await expect(page.getByTestId("offers-count")).toHaveText("2 offres en cours", { timeout: 30_000 });
  await expect(page.getByTestId("offer-row")).toHaveCount(2);
  await expect(page.getByText("Covering de saison")).toHaveCount(0);

  // Garage du Port : non abonné → message ; abonné → lisible ; jamais dans « Présentation ».
  const s = unique();
  const non = `NonS9c_${s}`;
  const abo = `AboS9c_${s}`;
  await signUpApi(non);
  const aboCookie = await signUpApi(abo);
  const garage = await apiCall<{ id: string }>(aboCookie, "GET", "/pros/by-slug/garage-du-port");
  await apiCall(aboCookie, "POST", `/pros/${garage.data.id}/follow`);
  const make = async (pseudo: string) => {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await loginInBrowser(p, `${pseudo.toLowerCase()}@e2e.orasso.test`, undefined, "/p/garage-du-port?onglet=offres");
    return p;
  };
  const n = await make(non);
  await expect(n.getByTestId("old-offers-locked")).toContainText("réservée", { timeout: 30_000 });
  const a = await make(abo);
  await expect(a.getByTestId("old-offer")).toContainText("Révision d'automne", { timeout: 30_000 });
  await a.goto("/p/garage-du-port?onglet=presentation");
  await expect(a.getByTestId("pro-posts")).toHaveCount(0);

  // Sans session : ni onglet « Offres », ni offre ; le bloc d'aujourd'hui reste dans « Présentation ».
  const anon = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await anon.goto("/p/garage-du-port");
  await expect(anon.getByTestId("page-tabs").getByRole("tab")).toHaveText(["Présentation"]);
  await expect(anon.getByTestId("page-tab-offers")).toHaveCount(0);
  await expect(anon.getByTestId("pro-posts")).toBeVisible();
  await anon.goto("/p/atelier-covering-66");
  await expect(anon.getByText("Polish complet avant l'hiver")).toHaveCount(0);
});
