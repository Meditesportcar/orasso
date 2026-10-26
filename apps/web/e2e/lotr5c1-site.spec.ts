import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, loginInBrowser, randomPlate, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R5c1 : le fil du crew sur le site (page du crew, une colonne centrale). Nina publie deux photos (format d'origine,
// « 1 / 2 », image servie au membre), Kenji (chef) donne une flamme, commente, publie un sondage et vote ; Léa, retirée,
// ne voit plus le fil ; Paul, hors du crew, ne le voit pas. Captures Béton et Sable à 390 et 1 280 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5c1-captures/site`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
test.use({ actionTimeout: 30_000 });

const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
const email = (pseudo: string) => `${pseudo.toLowerCase()}@e2e.orasso.test`;

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

test("site R5c1 : publier, flamme, commentaire, sondage, accès retiré, non-membre", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const kenji = `R5sKenji_${s}`.slice(0, 20);
  const nina = `R5sNina_${s}`.slice(0, 20);
  const lea = `R5sLea_${s}`.slice(0, 20);
  const paul = `R5sPaul_${s}`.slice(0, 20);
  const cKenji = await signUpApi(kenji);
  const cNina = await signUpApi(nina);
  const cLea = await signUpApi(lea);
  await signUpApi(paul);
  await addVehicleApi(cNina, randomPlate());
  const created = await apiCall<{ id: string; slug: string }>(cKenji, "POST", "/crews", {
    name: `Fil site ${s}`.slice(0, 40),
    department: "66",
  });
  expect(created.status).toBe(201);
  const crew = created.data;
  for (const c of [cNina, cLea]) {
    await apiCall(c, "POST", `/crews/${crew.id}/requests`, { message: null });
    const id = (await apiCall<{ user: { id: string } }>(c, "GET", "/me")).data.user.id;
    expect((await apiCall(cKenji, "POST", `/crews/${crew.id}/requests/${id}/accept`)).status).toBe(204);
  }

  // 1. Nina publie deux photos (1 280 px, Béton).
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setTheme(page, "beton");
    await loginInBrowser(page, email(nina), undefined, `/c/${crew.slug}`);
    await page.goto(`/c/${crew.slug}`);
    await expect(page.getByTestId("crew-feed")).toBeVisible({ timeout: 30_000 });
    // Les arrivées de Nina et de Léa sont déjà dans le fil (événements automatiques).
    await expect(page.getByTestId("crew-auto")).toHaveCount(2, { timeout: 20_000 });
    await page.getByTestId("crew-feed-publish").click();
    await expect(page.getByTestId("crew-publish")).toBeVisible();
    await expect(page.getByTestId("crew-publish-missing")).toHaveText("Ajoute au moins une photo ou un mot.");
    await page.getByTestId("crew-publish-file").setInputFiles([photo("car-supra.jpg"), photo("moto-ninja.jpg")]);
    await expect(page.getByTestId("crew-publish-photo")).toHaveCount(2);
    await page.getByTestId("crew-publish-text").fill("Sortie du dimanche, qui vient ?");
    await expect(page.getByTestId("crew-publish-visibility")).toContainText("Visible par les 3 membres du crew");
    await shot(page, "01-publier-1280-beton");
    await page.getByTestId("crew-publish-send").click();
    const post = page.getByTestId("crew-post").first();
    await expect(post.getByTestId("crew-post-text")).toHaveText("Sortie du dimanche, qui vient ?", { timeout: 60_000 });
    await expect(post.getByTestId("crew-post-photo-count")).toHaveText("1 / 2");
    // L'image est bien servie au membre (cookie de session), au format d'origine.
    const img = post.locator("img").first();
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 20_000 })
      .toBeGreaterThan(0);
    const [w, h] = await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]);
    expect(w).not.toBe(h);
    // Jamais recadrée (D36) : la photo entière tient dans le cadre (`contain`), elle n'en dépasse pas.
    const fit = await img.evaluate((el: HTMLImageElement) => {
      const frame = el.closest(".cf-photos")?.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { fit: getComputedStyle(el).objectFit, inside: !!frame && box.height <= frame.height + 1 };
    });
    expect(fit).toEqual({ fit: "contain", inside: true });
    await ctx.close();
  }

  // 2. Kenji : flamme, commentaire, sondage, vote ; captures des deux thèmes, 390 et 1 280 px.
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email(kenji), undefined, `/c/${crew.slug}`);
      await page.goto(`/c/${crew.slug}`);
      const card = page.getByTestId("crew-post").filter({ hasText: "Sortie du dimanche" });
      await expect(card).toBeVisible({ timeout: 30_000 });
      if (theme === "beton" && width === 390) {
        await card.getByTestId("crew-post-fire").click();
        await expect(card.getByTestId("crew-post-fire")).toHaveAttribute("aria-pressed", "true");
        await expect(card.getByTestId("crew-post-fire")).toContainText("1");
        await card.getByTestId("crew-post-comments").click();
        await page.getByTestId("crew-comment-input").fill("Moi, avec la GT-R !");
        await page.getByTestId("crew-comment-send").click();
        await expect(page.getByTestId("crew-comment")).toHaveCount(1, { timeout: 20_000 });
        await shot(page, `02-commentaires-${width}-${theme}`);
        await page.keyboard.press("Escape");
        await expect(card.getByTestId("crew-post-comments")).toContainText("1");
        // Sondage.
        await page.getByTestId("crew-feed-publish").click();
        await page.getByRole("button", { name: "Sondage" }).click();
        await expect(page.getByTestId("crew-publish-missing")).toHaveText("Écris la question du sondage.");
        await page.getByTestId("crew-poll-question").fill("On roule où ?");
        await page.getByTestId("crew-poll-answer").nth(0).fill("Les Aspres");
        await page.getByTestId("crew-poll-answer").nth(1).fill("La côte");
        await shot(page, `03-sondage-publier-${width}-${theme}`);
        await page.getByTestId("crew-publish-send").click();
        const poll = page.getByTestId("crew-post").filter({ hasText: "On roule où ?" });
        await expect(poll.getByTestId("crew-poll")).toBeVisible({ timeout: 30_000 });
        await poll.getByTestId("crew-poll-option").first().click();
        await expect(poll).toContainText("Ton choix", { timeout: 20_000 });
        await expect(poll).toContainText("100 %");
      }
      await page.getByTestId("crew-feed").scrollIntoViewIfNeeded();
      await shot(page, `04-fil-${width}-${theme}`, true);
      await ctx.close();
    }
  }

  // 3. Léa retirée, Paul hors du crew : pas de fil.
  const leaId = (await apiCall<{ user: { id: string } }>(cLea, "GET", "/me")).data.user.id;
  expect((await apiCall(cKenji, "DELETE", `/crews/${crew.id}/members/${leaId}`)).status).toBe(204);
  for (const who of [lea, paul]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await setTheme(page, "sable");
    await loginInBrowser(page, email(who), undefined, `/c/${crew.slug}`);
    await page.goto(`/c/${crew.slug}`);
    await expect(page.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("crew-feed")).toHaveCount(0);
    const res = await page.request.get(`/api/crews/${crew.id}/feed`);
    expect(res.status()).toBe(404);
    await ctx.close();
  }

  // 4. D36 (tour 2) : la photo n'est servie par aucune autre graphie de `/api/files`, ni après la dissolution.
  const feed = await apiCall<{ items: { post?: { photos: { url: string }[] } }[] }>(cNina, "GET", `/crews/${crew.id}/feed`);
  const photoUrl = feed.data.items.find((i) => i.post?.photos.length)?.post?.photos[0]?.url ?? "";
  const name = photoUrl.split("/").at(-1);
  expect(name).toMatch(/\.webp$/);
  const nina2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const np = await nina2.newPage();
  await loginInBrowser(np, email(nina), undefined, `/c/${crew.slug}`);
  expect((await np.request.get(photoUrl)).status()).toBe(200);
  for (const variant of [
    `/api/files/private/crew-posts/${name}`,
    `/api/files//private/crew-posts/${name}`,
    `/api/files/%2Fprivate/crew-posts/${name}`,
    `/api/files/./private/crew-posts/${name}`,
  ]) {
    expect((await np.request.get(variant)).status(), variant).toBe(404);
  }
  // Dissous par son chef : plus de fil ni de photo, pour personne.
  expect((await apiCall(cKenji, "DELETE", `/crews/${crew.id}`)).status).toBe(204);
  expect((await np.request.get(`/api/crews/${crew.id}/feed`)).status()).toBe(404);
  expect((await np.request.get(photoUrl)).status()).toBe(404);
  await nina2.close();
});
