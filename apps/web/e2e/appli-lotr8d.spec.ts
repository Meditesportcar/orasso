import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8d (D40, maquette R8.5 `e-fiche`), côté appli (version web compilée de recette) : la fiche du Rassemblement du Lydia montre son
// journal (l'épinglée en tête, « Inscrits prévenus », les deux vues), « Mentions · N » ouvre l'écran à part (La Brasa « Sur place »,
// « Sa fiche »), un événement fini montre « Passionnés · j'y étais » avec Kenji_66 et le tampon « Présent », l'organisatrice épingle
// une autre publication puis rend l'épingle et masque une mention puis la remet, un passionné ne voit aucun menu, **sans session** la
// fiche ne montre que le journal, l'écran de l'événement de l'organisatrice n'a plus « Nouvelle annonce » et « Publier pour cet
// événement » ouvre « Publier ». Lancer avec APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8d-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
const SLUG = "rassemblement-du-lydia";

async function open(browser: Browser, fontScale = 1, theme: "beton" | "sable" = "beton", width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: APP });
  await ctx.addInitScript(
    ([f, th]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", th as string);
      if (f !== 1) localStorage.setItem("orasso.recette.echellePolice", String(f));
    },
    [fontScale, theme] as const,
  );
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

/** La casquette Organisateur d'une structure (Mon profil › Casquettes) : l'écran d'un événement de l'organisation l'exige. */
async function chooseOrganizer(page: Page, name: string) {
  await go(page, "/moi");
  await page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
  await page.waitForURL(/\/direct/, { timeout: 30_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

type Detail = {
  id: string;
  structure: { id: string; slug: string };
  publications?: { count: number };
  mentions?: { count: number };
};
const detail = async (cookie: string, slug = SLUG) =>
  (await apiCall<Detail>(cookie, "GET", `/events/by-slug/${slug}`)).data;

/** Rend à la fiche les mentions « Sur place » qu'un essai a masquées (un essai interrompu ne laisse rien derrière lui). */
async function restoreOnSite() {
  const sarah = await login("sarah@orasso.local");
  const ev = await detail(sarah);
  const list = await apiCall<{ items: { hidden: boolean; post: { id: string } }[] }>(
    sarah,
    "GET",
    `/events/${ev.id}/mentions?section=on_site&hidden=1`,
  );
  for (const m of list.data.items.filter((i) => i.hidden)) {
    await apiCall(sarah, "DELETE", `/mentions/e:${ev.id}/${m.post.id}/hidden`);
  }
}
test.beforeAll(restoreOnSite);
test.afterEach(restoreOnSite);

test("passionné : le journal (épinglée en tête, inscrits prévenus), aucun menu, les deux vues, « Mentions · N » et son écran", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const kenji = await login("kenji@orasso.local");
  const ev = await detail(kenji);
  const journal = await apiCall<{ items: { id: string; pinned: boolean }[] }>(
    kenji,
    "GET",
    `/events/${ev.id}/feed-posts`,
  );
  expect(journal.data.items.length).toBeGreaterThanOrEqual(3);
  const n = ev.mentions?.count ?? 0;
  expect(n).toBeGreaterThanOrEqual(1);
  for (const [theme, fontScale] of [
    ["beton", 1],
    ["sable", 1.3],
  ] as const) {
    const { ctx, page } = await open(browser, fontScale, theme);
    await signIn(page, "kenji@orasso.local");
    await go(page, `/e/${SLUG}`);
    const section = page.getByTestId("event-journal");
    await expect(section).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("journal-title")).toHaveText("Publications");
    await expect(page.getByTestId("journal-intro")).toContainText("Le journal de l'événement, dans la durée");
    await expect(page.getByTestId("journal-intro")).not.toContainText("Épinglée en tête si tu le veux");
    await expect(section.getByTestId("publication-tile")).toHaveCount(journal.data.items.length);
    await expect(section.getByTestId("publication-tile").first()).toBeVisible();
    await expect(section.getByTestId("journal-pinned")).toHaveCount(1);
    await expect(section.getByTestId("journal-notified").first()).toBeVisible();
    await expect(section.getByTestId("journal-tile-menu")).toHaveCount(0);
    await section.scrollIntoViewIfNeeded();
    await shot(page, `fiche-passionne-${theme}-x${fontScale}`);
    if (theme === "beton") {
      // Une par une : les cartes entières, étiquettes comprises ; le menu de la carte reste celui d'un passionné (pas d'épingle).
      await page.getByRole("button", { name: "Une par une" }).click();
      await expect(section.getByTestId("feed-card-feed_post")).toHaveCount(journal.data.items.length);
      await expect(section.getByTestId("journal-pinned")).toHaveCount(1);
      await page.getByRole("button", { name: "Grille de deux" }).click();
      // « Mentions · N » : la ligne, puis l'écran à part.
      const row = page.getByTestId("event-mentions-row");
      await row.scrollIntoViewIfNeeded();
      await expect(row).toContainText(`Mentions · ${n}`);
      await expect(row).toContainText("Pros présents et passionnés qui citent l'événement : à part, chez leur auteur");
      await row.click();
      await expect(page.getByTestId("event-mentions")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(`Mentions · ${n}`).first()).toBeAttached();
      await expect(page.getByTestId("mentions-on-site")).toContainText("Sur place");
      await expect(page.getByTestId("mentions-on-site")).toContainText("La Brasa");
      await expect(page.getByTestId("mentions-on-site").getByTestId("mention-her-page")).toBeVisible();
      await expect(page.getByTestId("mentions-fans")).toHaveCount(0);
      await expect(page.getByTestId("mention-menu")).toHaveCount(0);
      await shot(page, "mentions-passionne");
      // Un événement fini : « Passionnés · j'y étais », Kenji_66 et le tampon « Présent ».
      await go(page, "/e/mentions/nocturne-de-rentree");
      await expect(page.getByTestId("mentions-fans")).toContainText("Passionnés · j'y étais", { timeout: 30_000 });
      await expect(page.getByTestId("mentions-fans")).toContainText("Kenji_66");
      await expect(page.getByTestId("mention-present").first()).toContainText("Présent");
      await expect(page.getByTestId("mentions-fans-note")).toContainText(
        "Après l'événement, seulement ceux dont la présence est validée",
      );
      await shot(page, "mentions-apres-evenement");
    }
    await ctx.close();
  }
});

test("organisatrice : épingle une autre publication puis rend l'épingle, masque une mention puis la remet", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sarah = await login("sarah@orasso.local");
  const ev = await detail(sarah);
  const before = await apiCall<{ items: { id: string; pinned: boolean }[] }>(
    sarah,
    "GET",
    `/events/${ev.id}/feed-posts`,
  );
  const originalPin = before.data.items.find((p) => p.pinned)?.id ?? null;
  const { ctx, page } = await open(browser);
  await signIn(page, "sarah@orasso.local");
  await go(page, `/e/${SLUG}`);
  const section = page.getByTestId("event-journal");
  await expect(section).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("journal-intro")).toContainText("Épinglée en tête si tu le veux.");
  const menus = section.getByTestId("journal-tile-menu");
  await expect(menus).toHaveCount(before.data.items.length);
  await section.scrollIntoViewIfNeeded();
  await shot(page, "fiche-organisatrice-menus");
  // Épingler la dernière vignette.
  const lastId = before.data.items.at(-1)?.id as string;
  await menus.last().scrollIntoViewIfNeeded();
  await menus.last().click();
  await expect(page.getByTestId("publication-menu-pin")).toContainText("Épingler en tête");
  await page.getByTestId("publication-menu-pin").click();
  await expect
    .poll(
      async () =>
        (await apiCall<{ items: { id: string }[] }>(sarah, "GET", `/events/${ev.id}/feed-posts`)).data.items[0]?.id,
    )
    .toBe(lastId);
  await expect(section.getByTestId("journal-pinned")).toHaveCount(1);
  // Retirer l'épingle.
  await section.getByTestId("journal-tile-menu").first().click();
  await expect(page.getByTestId("publication-menu-pin")).toContainText("Retirer l'épingle");
  await page.getByTestId("publication-menu-pin").click();
  await expect(section.getByTestId("journal-pinned")).toHaveCount(0);
  if (originalPin) {
    expect((await apiCall(sarah, "PUT", `/events/${ev.id}/feed-posts/${originalPin}/pin`)).status).toBe(200);
  }
  // Mentions : « Masquer de la fiche », le filtre « Masquées », « Remettre sur la fiche ».
  await go(page, `/e/mentions/${SLUG}`);
  await expect(page.getByTestId("event-mentions")).toBeVisible({ timeout: 30_000 });
  const visible = await page.getByTestId("mention-menu").count();
  expect(visible).toBeGreaterThanOrEqual(1);
  await page.getByTestId("mention-on-site").first().getByTestId("mention-menu").click();
  await expect(page.getByTestId("mention-menu-hide")).toContainText("Masquer de la fiche");
  await page.getByTestId("mention-menu-hide").click();
  await expect(page.getByTestId("mention-menu")).toHaveCount(visible - 1);
  await page.getByRole("tab", { name: "Masquées" }).click();
  await expect(page.getByTestId("mention-on-site")).toHaveCount(1);
  await shot(page, "mentions-masquees");
  await page.getByTestId("mention-on-site").first().getByTestId("mention-menu").click();
  await expect(page.getByTestId("mention-menu-hide")).toContainText("Remettre sur la fiche");
  await page.getByTestId("mention-menu-hide").click();
  await page.getByRole("tab", { name: "Sur la fiche" }).click();
  await expect(page.getByTestId("mention-menu")).toHaveCount(visible);
  await ctx.close();
});

test("sans session : la fiche ne montre que le journal (ni mentions, ni menu, ni vignette qui ouvre)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const anon = await apiCall<Detail>("", "GET", `/events/by-slug/${SLUG}`);
  expect(anon.data.mentions).toBeUndefined();
  const { ctx, page } = await open(browser);
  await go(page, `/e/${SLUG}`);
  const section = page.getByTestId("event-journal");
  await expect(section).toBeVisible({ timeout: 60_000 });
  await expect(section.getByTestId("publication-tile")).toHaveCount(anon.data.publications?.count ?? 0);
  await expect(section.getByTestId("journal-pinned")).toHaveCount(1);
  await expect(page.getByTestId("event-mentions-row")).toHaveCount(0);
  await expect(section.getByTestId("journal-tile-menu")).toHaveCount(0);
  await expect(section.getByTestId("publications-view-toggle")).toHaveCount(0);
  await section.scrollIntoViewIfNeeded();
  await shot(page, "fiche-sans-session");
  await ctx.close();
});

test("l'organisatrice : plus de « Nouvelle annonce », « Publier pour cet événement » ouvre « Publier » prérempli", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const ev = await detail(damien, "nocturne-de-canet-2026");
  const { ctx, page } = await open(browser);
  await signIn(page, "damien@orasso.local");
  await chooseOrganizer(page, "MéditeSportCar");
  await go(page, `/evenement/${ev.id}`);
  await expect(page.getByTestId("orga-publish-for-event")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Nouvelle annonce")).toHaveCount(0);
  await expect(page.getByTestId("orga-announcement-new")).toHaveCount(0);
  await expect(page.getByTestId("orga-write-registered")).toContainText("Écrire aux inscrits");
  await shot(page, "evenement-organisatrice");
  await page.getByTestId("orga-publish-for-event").click();
  await expect(page).toHaveURL(/fil\/publier/);
  // L'événement est déjà posé (son affiche fait le visuel d'une publication sans photo) et la structure déjà choisie.
  await expect(page.getByText("Sans photo : l'affiche de l'événement sera le visuel.")).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, "publier-prerempli");
  await ctx.close();
});

test("l'organisateur d'une fiche sans publication voit l'invitation « Publier pour cet événement » ; un passionné rien", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const ev = await detail(damien, "msc-edition-27");
  expect(ev.publications?.count ?? 0).toBe(0);
  const { ctx, page } = await open(browser);
  await signIn(page, "damien@orasso.local");
  await go(page, "/e/msc-edition-27");
  await expect(page.getByTestId("journal-invite")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("journal-publish")).toContainText("Publier pour cet événement");
  await page.getByTestId("journal-invite").scrollIntoViewIfNeeded();
  await shot(page, "fiche-invitation-organisateur");
  await ctx.close();
  const fan = await open(browser);
  await signIn(fan.page, "kenji@orasso.local");
  await go(fan.page, "/e/msc-edition-27");
  await expect(fan.page.getByTestId("event-journal")).toHaveCount(0);
  await expect(fan.page.getByTestId("journal-invite")).toHaveCount(0);
  await fan.ctx.close();
});
