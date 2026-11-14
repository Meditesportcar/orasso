import { expect, test } from "@playwright/test";
import pg from "pg";
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

// --- Tour 2 : cumul média + organisateur, vue comptée, plus de 50 albums -------------------------------------------------------------

/** Exécute `run` avec, au besoin, des lignes ajoutées à la base seedée ; `cleanup` les retire toujours. */
async function withDb<T>(setup: string[], cleanup: string[], params: unknown[], run: () => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const sql of setup) await client.query(sql, params);
    return await run();
  } finally {
    for (const sql of cleanup) await client.query(sql, params);
    await client.end();
  }
}

test("Léo, titulaire du média ET co-organisateur : retirer la photo, reprendre au journal et « officiel » ensemble", async ({
  browser,
}) => {
  const cookie = await login(DAMIEN);
  const album = await albumOfEvent(cookie);
  await withDb(
    [
      `insert into structure_members (structure_id, user_id, role, status, joined_at)
         select e.structure_id, u.id, 'co_organizer', 'active', now()
           from events e, "user" u where e.slug = $1 and u.email = $2
         on conflict (structure_id, user_id) do update set role = 'co_organizer', status = 'active'`,
    ],
    [
      `delete from structure_members where user_id = (select id from "user" where email = $2)
         and structure_id = (select structure_id from events where slug = $1)`,
    ],
    [SLUG, LEO],
    async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      try {
        await loginInBrowser(page, LEO, undefined, `/albums/${album.id}`);
        await page.waitForLoadState("networkidle");
        await page.getByTestId("media-gallery-photo").first().click();
        await expect(page.getByTestId("album-photo-remove")).toBeVisible();
        await expect(page.getByTestId("album-organizer-actions")).toBeVisible();
        await expect(page.getByTestId("album-repost-open")).toHaveText("Reprendre dans le journal de l'événement");
      } finally {
        await ctx.close();
      }
    },
  );
});

test("sans session, ouvrir un album depuis la fiche ne compte aucune vue", async ({ page }) => {
  const views: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/media-contents\/.+\/view/.test(r.url())) views.push(r.url());
  });
  await page.goto(`/e/${SLUG}`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("event-photos-open").click();
  // La navigation finie (l'album, ou la connexion qu'il demande), puis un laps où une vue serait partie : aucune requête de vue.
  await page.waitForURL((url) => !url.pathname.startsWith("/e/"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);
  expect(views).toEqual([]);
});

test("avec une session, la vue est comptée à l'ouverture depuis la fiche", async ({ page }) => {
  await loginInBrowser(page, DAMIEN, undefined, `/e/${SLUG}`);
  await page.waitForLoadState("networkidle");
  const view = page.waitForRequest((r) => r.method() === "POST" && /\/api\/media-contents\/.+\/view/.test(r.url()), {
    timeout: 30_000,
  });
  await page.getByTestId("event-photos-open").click();
  await view;
});

test("51 albums : « 51 albums », 50 affichés, « Voir plus d'albums » ajoute le 51e", async ({ page }) => {
  await withDb(
    [
      `insert into event_albums (event_id, media_profile_id, author_id, title, status, published_at, photos_count)
         select a.event_id, a.media_profile_id, a.author_id, 'Extra ' || g, 'published',
                a.published_at - (g || ' minutes')::interval, 0
           from event_albums a, generate_series(1, 50) g
          where a.event_id = (select id from events where slug = $1) and a.official_at is not null`,
    ],
    [`delete from event_albums where title like 'Extra %' and event_id = (select id from events where slug = $1)`],
    [SLUG],
    async () => {
      await page.goto(`/e/${SLUG}`);
      await expect(page.getByTestId("event-photos-count")).toHaveText("51 albums");
      await expect(page.getByTestId("event-photos-album")).toHaveCount(50);
      await page.getByTestId("event-photos-more-albums").click();
      await expect(page.getByTestId("event-photos-album")).toHaveCount(51, { timeout: 30_000 });
      await expect(page.getByTestId("event-photos-more-albums")).toHaveCount(0);
    },
  );
});

test("une page suivante partie avant une actualisation est ignorée (51 albums, Damien actualise pendant « Voir plus »)", async ({
  page,
}) => {
  await withDb(
    [
      `insert into event_albums (event_id, media_profile_id, author_id, title, status, published_at, photos_count)
         select a.event_id, a.media_profile_id, a.author_id, 'Extra ' || g, 'published',
                a.published_at - (g || ' minutes')::interval, 0
           from event_albums a, generate_series(1, 50) g
          where a.event_id = (select id from events where slug = $1) and a.official_at is not null`,
    ],
    [`delete from event_albums where title like 'Extra %' and event_id = (select id from events where slug = $1)`],
    [SLUG],
    async () => {
      await loginInBrowser(page, DAMIEN, undefined, `/e/${SLUG}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("event-photos-album")).toHaveCount(50);
      // La page suivante est retenue (mise en scène) jusqu'à ce que l'actualisation soit **rendue** ; alors seulement on la relâche.
      let releaseStale: () => void = () => {};
      const staleGate = new Promise<void>((resolve) => {
        releaseStale = resolve;
      });
      await page.route("**/api/public/events/by-slug/*/albums?*cursor=*", async (route) => {
        await staleGate;
        await route.continue();
      });
      const stale = page.waitForResponse((r) => /albums?.*cursor=/.test(r.url()), { timeout: 30_000 });
      await page.getByTestId("event-photos-more-albums").click();
      await page.getByTestId("event-photos-more").first().click();
      await page.getByTestId("event-photos-official-toggle").click();
      await expect(page.getByTestId("event-photos-notice")).toHaveText("« Officiel » retiré");
      // L'actualisation est rendue : l'album n'est plus officiel dans la liste relue.
      await expect(page.getByTestId("event-photos-official")).toHaveCount(0);
      await expect(page.getByTestId("event-photos-album")).toHaveCount(50);
      releaseStale();
      const response = await stale;
      await response.finished();
      // Le navigateur a rendu la réponse ancienne (deux images plus tard) : elle n'a pas réinjecté son album dans la liste actualisée.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))),
      );
      await expect(page.getByTestId("event-photos-album")).toHaveCount(50);
      await expect(page.getByTestId("event-photos-more-albums")).toBeEnabled();
      await page.unroute("**/api/public/events/by-slug/*/albums?*cursor=*");
      await page.getByTestId("event-photos-more").first().click();
      await page.getByTestId("event-photos-official-toggle").click();
      await expect(page.getByTestId("event-photos-official")).toHaveText("Album officiel");
    },
  );
});
