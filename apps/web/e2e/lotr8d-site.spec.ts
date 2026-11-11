import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8d (D40, maquette R8.5 `e-fiche`), côté site : la fiche du Rassemblement du Lydia montre son journal (l'épinglée en tête,
// « Inscrits prévenus », les deux vues), « Mentions · N » ouvre l'écran à part (La Brasa « Sur place », Kenji_66 « Passionnés » avec
// le tampon), l'organisatrice épingle et masque une mention puis la remet, un passionné ne voit aucun menu, **sans session** la fiche
// ne montre que le journal, l'espace Communication n'a plus « Nouvelle annonce » et « Publier pour cet événement » ouvre « Publier »
// prérempli. Comptes du seed (Sarah_66 organisatrice de Roues Libres 66) ; site et API lancés.
test.use({ actionTimeout: 30_000 });
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8d-captures/apres/recette-site`;
const SLUG = "rassemblement-du-lydia";

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

type Detail = { id: string; structure: { id: string; slug: string }; publications?: { count: number }; mentions?: { count: number } };
const detail = async (cookie: string) => (await apiCall<Detail>(cookie, "GET", `/events/by-slug/${SLUG}`)).data;

test("passionné : le journal (épinglée en tête, inscrits prévenus), les deux vues, aucun menu, « Mentions · N » et son écran", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  const kenji = await login("kenji@orasso.local");
  const ev = await detail(kenji);
  const journal = await apiCall<{ items: { id: string; pinned: boolean }[] }>(kenji, "GET", `/events/${ev.id}/feed-posts`);
  expect(journal.data.items.length).toBeGreaterThanOrEqual(3);
  expect(journal.data.items[0]?.pinned).toBe(true);
  await loginInBrowser(page, "kenji@orasso.local", undefined, `/e/${SLUG}`);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/e/${SLUG}`);
    const section = page.getByTestId("event-journal");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("journal-title")).toHaveText("Publications");
    await expect(page.getByTestId("journal-intro")).toContainText("Le journal de l'événement, dans la durée : seulement celles de");
    await expect(page.getByTestId("journal-intro")).not.toContainText("Épinglée en tête si tu le veux");
    await expect(section.getByTestId("publication-tile")).toHaveCount(journal.data.items.length);
    // L'épinglée est la première vignette ; « Inscrits prévenus » sur une « Info importante » envoyée ; aucun menu.
    await expect(section.getByTestId("publication-tile").first().getByTestId("journal-pinned")).toBeVisible();
    await expect(section.getByTestId("journal-pinned")).toHaveCount(1);
    await expect(section.getByTestId("journal-notified").first()).toBeVisible();
    await expect(section.getByTestId("journal-tile-menu")).toHaveCount(0);
    await shot(page, `fiche-passionne-${width}`);
  }
  // Les deux vues : « Une par une » montre les cartes entières, étiquettes comprises ; sans menu d'organisateur (la carte garde « Signaler »).
  await page.getByRole("button", { name: "Une par une" }).click();
  await expect(page.getByTestId("event-journal").getByTestId("feed-card-feed_post")).toHaveCount(journal.data.items.length);
  await expect(page.getByTestId("event-journal").getByTestId("journal-pinned")).toHaveCount(1);
  await page.getByRole("button", { name: "Grille de deux" }).click();
  // « Mentions · N » : la ligne, puis l'écran à part.
  const n = ev.mentions?.count ?? 0;
  expect(n).toBeGreaterThanOrEqual(1);
  const row = page.getByTestId("event-mentions-row");
  await expect(row).toContainText(`Mentions · ${n}`);
  await expect(row).toContainText("Pros présents et passionnés qui citent l'événement : à part, chez leur auteur");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/app/e/${SLUG}/mentions`));
  const screen = page.getByTestId("event-mentions");
  await expect(screen).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Mentions · ${n}`).first()).toBeVisible();
  await expect(page.getByTestId("mentions-on-site")).toContainText("Sur place");
  await expect(page.getByTestId("mentions-on-site")).toContainText("La Brasa");
  await expect(page.getByTestId("mentions-on-site").getByTestId("mention-her-page")).toBeVisible();
  // Le Lydia n'est pas fini : ses « Passionnés » publics sont masqués ou privés, la rubrique vide n'est pas affichée.
  await expect(page.getByTestId("mentions-fans")).toHaveCount(0);
  await expect(page.getByTestId("mention-menu")).toHaveCount(0);
  await expect(page.getByTestId("mentions-filter-hidden")).toHaveCount(0);
  await shot(page, "mentions-passionne");
  // Retour à la fiche.
  await page.getByRole("link", { name: "Retour à la fiche" }).click();
  await expect(page).toHaveURL(new RegExp(`/e/${SLUG}`));
  // Un événement fini : « Passionnés · j'y étais », Kenji_66 et le tampon « Présent » (présence validée), la note de l'après.
  await page.goto("/app/e/nocturne-de-rentree/mentions");
  await expect(page.getByTestId("event-mentions")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("mentions-fans")).toContainText("Passionnés · j'y étais");
  await expect(page.getByTestId("mentions-fans")).toContainText("Kenji_66");
  await expect(page.getByTestId("mention-present").first()).toHaveText("Présent");
  await expect(page.getByTestId("mentions-fans-note")).toHaveText(
    "Comptes publics seulement. Après l'événement, seulement ceux dont la présence est validée (QR ou GPS).",
  );
  await expect(page.getByTestId("mention-menu")).toHaveCount(0);
  await shot(page, "mentions-apres-evenement");
});

test("organisatrice : épingle une autre publication puis rend l'épingle, masque une mention puis la remet", async ({ page }) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  const sarah = await login("sarah@orasso.local");
  const ev = await detail(sarah);
  const before = await apiCall<{ items: { id: string; pinned: boolean }[] }>(sarah, "GET", `/events/${ev.id}/feed-posts`);
  const originalPin = before.data.items.find((p) => p.pinned)?.id ?? null;
  await loginInBrowser(page, "sarah@orasso.local", undefined, `/e/${SLUG}`);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/e/${SLUG}`);
  const section = page.getByTestId("event-journal");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("journal-intro")).toContainText("Épinglée en tête si tu le veux.");
  const menus = section.getByTestId("journal-tile-menu");
  await expect(menus).toHaveCount(before.data.items.length);
  await shot(page, "fiche-organisatrice-menus");
  // Épingler la dernière vignette : elle devient la première, l'ancienne épinglée perd son étiquette.
  await menus.last().click();
  await expect(page.getByTestId("publication-menu-pin")).toHaveText("Épingler en tête");
  await page.getByTestId("publication-menu-pin").click();
  const lastId = before.data.items.at(-1)?.id as string;
  await expect
    .poll(async () => (await apiCall<{ items: { id: string }[] }>(sarah, "GET", `/events/${ev.id}/feed-posts`)).data.items[0]?.id)
    .toBe(lastId);
  await expect(section.getByTestId("journal-pinned")).toHaveCount(1);
  await expect(section.getByTestId("publication-tile").first().getByTestId("journal-pinned")).toBeVisible();
  // Retirer l'épingle.
  await section.getByTestId("journal-tile-menu").first().click();
  await expect(page.getByTestId("publication-menu-pin")).toHaveText("Retirer l'épingle");
  await page.getByTestId("publication-menu-pin").click();
  await expect(section.getByTestId("journal-pinned")).toHaveCount(0);
  // Rétablir l'épinglée d'origine.
  if (originalPin) {
    expect((await apiCall(sarah, "PUT", `/events/${ev.id}/feed-posts/${originalPin}/pin`)).status).toBe(200);
  }

  // Mentions : le « … », « Masquer de la fiche », le filtre « Masquées », « Remettre sur la fiche ».
  await page.goto(`/app/e/${SLUG}/mentions`);
  await expect(page.getByTestId("event-mentions")).toBeVisible({ timeout: 30_000 });
  const visible = await page.getByTestId("mention-menu").count();
  expect(visible).toBeGreaterThanOrEqual(1);
  await page.getByTestId("mention-on-site").first().getByTestId("mention-menu").click();
  await expect(page.getByTestId("mention-menu-hide")).toHaveText("Masquer de la fiche");
  await page.getByTestId("mention-menu-hide").click();
  await expect(page.getByTestId("mention-menu")).toHaveCount(visible - 1);
  await page.getByTestId("mentions-filter-hidden").click();
  // Masquées : celle de Julie_66 (déjà) et La Brasa (à l'instant).
  await expect(page.getByTestId("mention-on-site")).toHaveCount(1);
  await expect(page.getByTestId("mention-fan")).toHaveCount(1);
  await shot(page, "mentions-masquees");
  await page.getByTestId("mention-on-site").first().getByTestId("mention-menu").click();
  await expect(page.getByTestId("mention-menu-hide")).toHaveText("Remettre sur la fiche");
  await page.getByTestId("mention-menu-hide").click();
  await page.getByTestId("mentions-filter-visible").click();
  await expect(page.getByTestId("mention-menu")).toHaveCount(visible);
});

test("sans session : la fiche ne montre que le journal (ni mentions, ni menu, ni lien, ni personne)", async ({ page }) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  const anon = await apiCall<Detail>("", "GET", `/events/by-slug/${SLUG}`);
  expect(anon.data.mentions).toBeUndefined();
  expect(anon.data.publications?.count).toBeGreaterThanOrEqual(3);
  expect((await apiCall("", "GET", `/events/${anon.data.id}/mentions?section=on_site`)).status).toBe(401);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/e/${SLUG}`);
    const section = page.getByTestId("event-journal");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section.getByTestId("publication-tile")).toHaveCount(anon.data.publications?.count ?? 0);
    await expect(section.getByTestId("journal-pinned")).toHaveCount(1);
    await expect(page.getByTestId("event-mentions-row")).toHaveCount(0);
    await expect(section.getByTestId("journal-tile-menu")).toHaveCount(0);
    await expect(section.getByTestId("publications-view-toggle")).toHaveCount(0);
    await expect(section.locator("a.pub-tile__photo")).toHaveCount(0);
    await expect(section.getByTestId("feed-card-feed_post")).toHaveCount(0);
    // Ni pseudo ni identifiant de personne dans la section du journal.
    const html = await section.innerHTML();
    for (const pseudo of ["Sarah_66", "Kenji_66", "Sofia_66"]) expect(html).not.toContain(pseudo);
    await shot(page, `fiche-sans-session-${width}`);
  }
});

test("une annonce réservée aux inscrits reste invisible d'un visiteur ; l'organisation la lit", async ({ page }) => {
  test.setTimeout(120_000);
  const text = "Réservé aux exposants : emplacement du camion plateau derrière la scène";
  await page.goto("/e/nocturne-de-canet-2026");
  await expect(page.getByTestId("event-journal")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(text)).toHaveCount(0);
  const damien = await login("damien@orasso.local");
  const list = await apiCall<{ items: { body: string; audience: string }[] }>(damien, "GET", "/events/by-slug/nocturne-de-canet-2026/announcements");
  expect(list.data.items.some((i) => i.body.startsWith(text) && i.audience === "participants")).toBe(true);
});

test("espace Communication : plus de « Nouvelle annonce », « Publier pour cet événement » ouvre « Publier » prérempli", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  const sarah = await login("sarah@orasso.local");
  const ev = await detail(sarah);
  await loginInBrowser(page, "sarah@orasso.local", undefined, "/orga");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/orga/${ev.structure.slug}/communication?e=${ev.id}`);
  await expect(page.getByTestId("publish-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Nouvelle annonce")).toHaveCount(0);
  await expect(page.getByTestId("announcement-panel")).toHaveCount(0);
  await expect(page.getByTestId("orga-write-registered")).toHaveText("Écrire aux inscrits");
  await shot(page, "communication-organisatrice");
  await page.getByTestId("orga-publish-for-event").click();
  await expect(page).toHaveURL(new RegExp(`/app/fil/publier\\?structure=${ev.structure.id}&evenement=${ev.id}`));
  // La structure est déjà choisie comme auteur ; l'événement se pose une fois la liste lue.
  await expect(page.getByText("Roues Libres 66").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Rassemblement du Lydia").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "publier-prerempli");
  // « Écrire aux inscrits » : les messages groupés, l'événement déjà choisi.
  await page.goto(`/orga/${ev.structure.slug}/communication?onglet=messages&e=${ev.id}`);
  await expect(page.locator("select[name=eventId]")).toHaveValue(ev.id, { timeout: 30_000 });
});
