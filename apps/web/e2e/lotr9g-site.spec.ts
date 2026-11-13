import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser } from "./helpers";

// Lot R9g (section « Photos » de la fiche, album « officiel », reprise d'une photo dans le journal), côté site (API et site lancés sur la
// base seedée) : sans session la section se voit (« Photos », « 1 album », « Album officiel », « Voir l'album »), sans aucun « … » ; Damien
// (organisateur) retire puis remet « officiel », reprend une photo dans le journal (« Photo : Sud Cars », « repartagée, crédit non
// retirable »), la même photo une seconde fois est refusée (« Déjà reprise dans le journal. ») ; Léo (le média) n'a aucune action
// d'organisateur. Photos : celles du seed seulement. La publication créée est retirée à la fin (la recette se rejoue).
test.use({ viewport: { width: 1280, height: 900 } });

const SLUG = "rassemblement-cote-vermeille-2025";
const DAMIEN = "damien@orasso.local";
const LEO = "leo@orasso.local";

type Album = { id: string; official: boolean; photosCount: number };
type Post = {
  id: string;
  caption: string | null;
  photos: { credit?: { mediaName: string; albumId: string | null } }[];
};

async function albumOfEvent(cookie: string) {
  const list = await apiCall<{ items: Album[] }>(cookie, "GET", `/events/by-slug/${SLUG}/albums`);
  const album = list.data.items[0];
  if (!album) throw new Error("Album du seed absent");
  return album;
}

test("sans session : la section « Photos » se voit, sans aucune action", async ({ page }) => {
  await page.goto(`/e/${SLUG}`);
  const section = page.getByTestId("event-photos");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading")).toContainText("Photos");
  await expect(page.getByTestId("event-photos-count")).toHaveText("1 album");
  await expect(page.getByTestId("event-photos-official")).toHaveText("Album officiel");
  await expect(page.getByTestId("event-photos-album-title")).toHaveText("Les photos du Rassemblement Côte Vermeille");
  await expect(section).toContainText("Sud Cars · 12 photos");
  await expect(section).toContainText("elles ne sont pas des publications de l'organisateur");
  await expect(page.getByTestId("event-photos-more")).toHaveCount(0);
  await expect(page.getByTestId("event-photos-open")).toHaveAttribute("href", /\/albums\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("event-photos-cover").locator("img").first()).toBeVisible();
});

test("Damien (organisateur) : « … » retire puis remet « officiel »", async ({ page }) => {
  test.setTimeout(180_000);
  await loginInBrowser(page, DAMIEN, undefined, `/e/${SLUG}`);
  await page.waitForLoadState("networkidle");
  const more = page.getByTestId("event-photos-more");
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.getByTestId("event-photos-official-toggle")).toContainText("Retirer « officiel »");
  await page.getByTestId("event-photos-official-toggle").click();
  await expect(page.getByTestId("event-photos-official")).toHaveCount(0);
  await expect(page.getByTestId("event-photos-notice")).toHaveText("« Officiel » retiré");
  await page.getByTestId("event-photos-more").click();
  await expect(page.getByTestId("event-photos-official-toggle")).toContainText("Choisir cet album comme « officiel »");
  await page.getByTestId("event-photos-official-toggle").click();
  await expect(page.getByTestId("event-photos-official")).toHaveText("Album officiel");
});

test("Damien reprend une photo dans le journal : crédit conservé, une seule fois ; Léo n'a aucune action", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const cookie = await login(DAMIEN);
  const album = await albumOfEvent(cookie);
  let postId: string | null = null;
  try {
    await loginInBrowser(page, DAMIEN, undefined, `/albums/${album.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("media-gallery-photo").first().click();
    await expect(page.getByTestId("album-organizer-actions")).toBeVisible();
    await expect(page.getByTestId("album-repost-open")).toHaveText("Reprendre dans le journal de l'événement");
    await page.getByTestId("album-repost-open").click();
    await expect(page.getByTestId("album-repost-caption")).toHaveValue("Photo : Sud Cars");
    await page.getByTestId("album-repost-caption").fill("Merci à Sud Cars pour ce regard sur le plateau.");
    await page.getByTestId("album-repost-publish").click();
    await expect(page.getByTestId("album-repost-done")).toContainText("Repris dans le journal de");
    await expect(page.getByTestId("album-repost-done")).toContainText("crédit Sud Cars conservé");
    // La même photo une seconde fois.
    await page.getByTestId("album-repost-open").click();
    await page.getByTestId("album-repost-publish").click();
    await expect(page.getByTestId("album-organizer-error")).toHaveText("Déjà reprise dans le journal.");

    // La publication est en tête du journal, avec son crédit et son pied.
    const journal = await apiCall<{ items: Post[] }>(cookie, "GET", `/events/${await apiEventId(cookie)}/feed-posts`);
    const reposted = journal.data.items.find((p) => p.caption === "Merci à Sud Cars pour ce regard sur le plateau.");
    expect(reposted?.photos[0]?.credit?.mediaName).toBe("Sud Cars");
    postId = reposted?.id ?? null;
    await page.goto(`/e/${SLUG}`);
    // Grille de deux (vue par défaut) : le crédit est dans la méta texte sous la vignette (jamais une pastille sur la photo).
    await expect(page.getByTestId("publication-tile-credit").first()).toHaveText("Photo : Sud Cars");
    // Sans session : le journal public porte aussi le crédit.
    const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/e/${SLUG}`);
    await expect(visitorPage.getByTestId("journal-public-credit").first()).toHaveText("Photo : Sud Cars");
    await visitor.close();
    // Vue « Une par une » : la photo porte « Photo : <média> » et le pied « repartagée, crédit non retirable ».
    await page.getByRole("button", { name: "Une par une" }).click();
    await expect(page.getByTestId("credit-foot").first()).toContainText("repartagée, crédit non retirable");
    await expect(page.getByTestId("credit-overlay").first()).toHaveText("Photo : Sud Cars");
    await page.getByTestId("credit-album").first().click();
    await expect(page.getByTestId("album-open")).toBeVisible();
  } finally {
    if (postId) await apiCall(cookie, "DELETE", `/me/feed-posts/${postId}`);
  }

  // Léo (le média) : aucune action d'organisateur.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const leo = await ctx.newPage();
  await loginInBrowser(leo, LEO, undefined, `/albums/${album.id}`);
  await leo.waitForLoadState("networkidle");
  await leo.getByTestId("media-gallery-photo").first().click();
  await expect(leo.getByTestId("album-organizer-actions")).toHaveCount(0);
  await ctx.close();
});

async function apiEventId(cookie: string) {
  const event = await apiCall<{ id: string }>(cookie, "GET", `/events/by-slug/${SLUG}`);
  return event.data.id;
}
