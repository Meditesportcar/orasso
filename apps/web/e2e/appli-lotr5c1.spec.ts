import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, type Cookie, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R5c1 : le fil du crew dans l'appli (version web de recette, `APP_URL`). Nina publie deux photos depuis la galerie
// (format d'origine, « 1 / 2 »), Kenji (chef) donne une flamme, commente, publie un sondage et vote ; Léa, retirée du
// crew, perd tout de suite l'accès (fil et photo) ; Paul, hors du crew, ne voit pas le fil. Captures Béton et Sable à
// 390 px de l'écran « Publier dans le crew », du fil, de la feuille des commentaires et du sondage.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5c1-captures/appli`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, pseudo: string, theme: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(`${pseudo.toLowerCase()}@e2e.orasso.test`);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return { ctx, page };
}

async function openCrew(page: Page, slug: string) {
  await page.goto(`/crew/${slug}`);
  await skipOpening(page);
  await expect(page.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
}

/** Lecture brute d'une adresse de l'API avec un cookie (photo protégée). */
async function rawStatus(cookie: Cookie, path: string) {
  return (await fetch(`${API}${path}`, { headers: { origin: WEB, cookie } })).status;
}

test("appli R5c1 : publier des photos, flamme, commentaire, sondage, accès retiré, non-membre refusé", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const errors: string[] = [];
  const s = unique();
  const kenji = `R5Kenji_${s}`.slice(0, 20);
  const nina = `R5Nina_${s}`.slice(0, 20);
  const lea = `R5Lea_${s}`.slice(0, 20);
  const paul = `R5Paul_${s}`.slice(0, 20);
  const cKenji = await signUpApi(kenji);
  const cNina = await signUpApi(nina);
  const cLea = await signUpApi(lea);
  const cPaul = await signUpApi(paul);
  await addVehicleApi(cNina, randomPlate());
  const created = await apiCall<{ id: string; slug: string }>(cKenji, "POST", "/crews", {
    name: `Fil appli ${s}`.slice(0, 40),
    description: "Glisse et sorties du dimanche.",
    department: "66",
  });
  expect(created.status).toBe(201);
  const crew = created.data;
  for (const c of [cNina, cLea]) {
    await apiCall(c, "POST", `/crews/${crew.id}/requests`, { message: null });
    const id = (await apiCall<{ user: { id: string } }>(c, "GET", "/me")).data.user.id;
    expect((await apiCall(cKenji, "POST", `/crews/${crew.id}/requests/${id}/accept`)).status).toBe(204);
  }

  // 1. Nina publie deux photos depuis la galerie, avec un mot et son véhicule.
  const n = await appLogin(browser, nina, "beton");
  n.page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text().slice(0, 200)} @ ${m.location().url}`);
  });
  await openCrew(n.page, crew.slug);
  await expect(n.page.getByTestId("crew-feed")).toBeVisible({ timeout: 30_000 });
  await n.page.getByTestId("crew-feed-publish").click();
  await expect(n.page.getByTestId("crew-publish")).toBeVisible({ timeout: 30_000 });
  await expect(n.page.getByTestId("crew-publish-missing")).toHaveText("Ajoute au moins une photo ou un mot.");
  const chooser = n.page.waitForEvent("filechooser");
  await n.page.getByTestId("crew-publish-add").click();
  await (await chooser).setFiles([photo("car-subaru-sti.jpg"), photo("moto-r1.jpg")]);
  await expect(n.page.getByTestId("crew-publish-photo")).toHaveCount(2, { timeout: 30_000 });
  await n.page.getByTestId("crew-publish-text").fill("Lavée, prête pour dimanche 🔥");
  await expect(n.page.getByTestId("crew-publish-visibility")).toContainText("Visible par les 3 membres du crew");
  await n.page.getByText("BMW", { exact: false }).first().click();
  await shot(n.page, "01-publier-beton");
  await n.page.getByTestId("crew-publish-send").click();
  await n.page.waitForURL(new RegExp(`/crew/${crew.slug}$`), { timeout: 60_000 });
  const post = n.page.getByTestId("crew-post").first();
  await expect(post.getByTestId("crew-post-text")).toHaveText("Lavée, prête pour dimanche 🔥", { timeout: 30_000 });
  await expect(post.getByTestId("crew-post-photo-count")).toHaveText("1 / 2");
  await expect(post.getByTestId("crew-post-vehicle")).toBeVisible();
  await post.scrollIntoViewIfNeeded();
  await shot(n.page, "02-fil-photo-beton");
  await n.ctx.close();

  const feed = await apiCall<{
    items: { type: string; post?: { id: string; photos: { url: string; width: number; height: number }[] } }[];
  }>(cNina, "GET", `/crews/${crew.id}/feed`);
  const published = feed.data.items.find((i) => i.type === "post")?.post;
  expect(published?.photos).toHaveLength(2);
  // Format d'origine : ni carré ni recadrage (D36).
  for (const p of published?.photos ?? []) expect(p.width).not.toBe(p.height);
  const photoUrl = published?.photos[0]?.url ?? "";

  // 2. Kenji : flamme, commentaire, puis un sondage auquel il vote.
  for (const theme of ["beton", "sable"] as const) {
    const k = await appLogin(browser, kenji, theme);
    k.page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${m.text().slice(0, 200)} @ ${m.location().url}`);
    });
    await openCrew(k.page, crew.slug);
    const card = k.page.getByTestId("crew-post").filter({ hasText: "Lavée" });
    await expect(card).toBeVisible({ timeout: 30_000 });
    if (theme === "beton") {
      await card.getByTestId("crew-post-fire").click();
      // L'état se lit dans le nom accessible (« Retirer ta flamme » une fois donnée).
      await expect(card.getByTestId("crew-post-fire")).toHaveAttribute("aria-label", "Retirer ta flamme, 1 en tout");
      await expect(card.getByTestId("crew-post-fire")).toContainText("1");
      await card.getByTestId("crew-post-comments").click();
      await k.page.getByTestId("crew-comment-input").fill("Superbe, la STI !");
      await k.page.getByTestId("crew-comment-send").click();
      await expect(k.page.getByTestId("crew-comment")).toHaveCount(1, { timeout: 20_000 });
    } else {
      await card.getByTestId("crew-post-comments").click();
      await expect(k.page.getByTestId("crew-comment")).toHaveCount(1, { timeout: 20_000 });
    }
    await shot(k.page, `03-commentaires-${theme}`);
    await k.page.keyboard.press("Escape");
    await k.page.goto(`/crew/publier?crew=${crew.slug}`);
    await expect(k.page.getByTestId("crew-publish")).toBeVisible({ timeout: 30_000 });
    await k.page.getByTestId("crew-publish-mode-poll").click();
    await expect(k.page.getByTestId("crew-publish-missing")).toHaveText("Écris la question du sondage.");
    const question = `On roule où dimanche ${theme} ?`;
    await k.page.getByTestId("crew-poll-question").fill(question);
    const answers = k.page.getByTestId("crew-poll-answer");
    await answers.nth(0).fill("Les Aspres");
    await answers.nth(1).fill("La côte");
    await k.page.getByTestId("crew-poll-add").click();
    await answers.nth(2).fill("Le Canigou");
    await k.page.getByText("Dans 3 jours", { exact: true }).click();
    await shot(k.page, `04-sondage-publier-${theme}`);
    await k.page.getByTestId("crew-publish-send").click();
    await k.page.waitForURL(new RegExp(`/crew/${crew.slug}$`), { timeout: 60_000 });
    const poll = k.page.getByTestId("crew-post").filter({ hasText: question });
    await expect(poll.getByTestId("crew-poll")).toBeVisible({ timeout: 30_000 });
    await poll.getByTestId("crew-poll-option").first().click();
    await expect(poll).toContainText("Ton choix", { timeout: 20_000 });
    await expect(poll).toContainText("100 %");
    await poll.scrollIntoViewIfNeeded();
    await shot(k.page, `05-sondage-vote-${theme}`);
    if (theme === "sable") {
      const card2 = k.page.getByTestId("crew-post").filter({ hasText: "Lavée" });
      await card2.scrollIntoViewIfNeeded();
      await shot(k.page, "02-fil-photo-sable");
    }
    await k.ctx.close();
  }

  // 3. Léa, retirée du crew : plus de fil, plus de photo, tout de suite ; ses publications, elle peut les retirer.
  expect((await apiCall(cLea, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Je pars bientôt" })).status).toBe(
    201,
  );
  expect(await rawStatus(cLea, photoUrl)).toBe(200);
  const leaId = (await apiCall<{ user: { id: string } }>(cLea, "GET", "/me")).data.user.id;
  expect((await apiCall(cKenji, "DELETE", `/crews/${crew.id}/members/${leaId}`)).status).toBe(204);
  expect(await rawStatus(cLea, photoUrl)).toBe(404);
  expect((await apiCall(cLea, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
  const l = await appLogin(browser, lea, "beton");
  await openCrew(l.page, crew.slug);
  await expect(l.page.getByTestId("crew-feed")).toHaveCount(0);
  // Réglages › Confidentialité : « Retirer mes publications des crews que j'ai quittés » (confirmation dans l'écran).
  await l.page.goto("/reglages/confidentialite");
  await skipOpening(l.page);
  await l.page.getByTestId("left-crews-open").click();
  await expect(l.page.getByTestId("left-crews-confirm")).toBeVisible();
  await shot(l.page, "07-crews-quittes-beton");
  await l.page.getByTestId("left-crews-yes").click();
  await expect(l.page.getByText("Retiré : 1 publication et 0 commentaire.")).toBeVisible({ timeout: 20_000 });
  await l.ctx.close();
  const after = await apiCall<{ items: { post?: { text: string } }[] }>(cKenji, "GET", `/crews/${crew.id}/feed`);
  expect(after.data.items.some((i) => i.post?.text === "Je pars bientôt")).toBe(false);

  // 4. Paul, hors du crew : ni fil ni photo.
  expect(await rawStatus(cPaul, photoUrl)).toBe(404);
  expect((await apiCall(cPaul, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
  const p = await appLogin(browser, paul, "sable");
  await openCrew(p.page, crew.slug);
  await expect(p.page.getByTestId("crew-feed")).toHaveCount(0);
  await shot(p.page, "06-non-membre-sable");
  await p.ctx.close();

  expect(errors.filter((e) => !/favicon|Sentry|DevTools/i.test(e))).toEqual([]);
});
