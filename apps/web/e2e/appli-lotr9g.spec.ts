import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9g (section « Photos » de la fiche, album « officiel », reprise d'une photo dans le journal), côté appli (version web compilée de
// recette, `APP_URL`) : Damien (passionné) ouvre la fiche Côte Vermeille : « Photos », « 1 album », « Album officiel », « Voir l'album » ;
// en casquette organisateur : « … » retire puis remet « officiel », puis une photo s'ouvre : « Reprendre dans le journal de l'événement »,
// légende, « Publier », confirmation, et la publication est en tête du journal avec « Photo : Sud Cars » et « repartagée, crédit non
// retirable » ; la même photo une seconde fois : « Déjà reprise dans le journal. » ; Léo (le média) n'a aucune action d'organisateur ; la
// police ×1,3 tient. Photos : celles du seed seulement. La publication créée est retirée à la fin.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9g-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const SLUG = "rassemblement-cote-vermeille-2025";
const DAMIEN = "damien@orasso.local";
const LEO = "leo@orasso.local";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, opts: { theme?: string; scale?: number; width?: number } = {}) {
  const { theme = "beton", scale = 1, width = 390 } = opts;
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
  return { ctx, page };
}

/** Pas d'ancrage du défilement du navigateur (le natif n'en a pas) : un bloc qui arrive au-dessus repousse vraiment la section. */
async function withoutScrollAnchoring(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "* { overflow-anchor: none !important; }";
      document.head.append(style);
    });
  });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function chooseOrganizer(page: Page, name: string) {
  await go(page, "/moi");
  await page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
  await page.waitForURL(/\/direct/, { timeout: 30_000 });
}

for (const theme of ["beton", "sable"] as const) {
  test(`Damien : la section « Photos » de la fiche, puis l'organisateur (${theme})`, async ({ browser }) => {
    test.setTimeout(420_000);
    const cookie = await login(DAMIEN);
    const events = await apiCall<{ id: string }>(cookie, "GET", `/events/by-slug/${SLUG}`);
    let postId: string | null = null;
    const { ctx, page } = await open(browser, DAMIEN, { theme });
    try {
      // Passionné : la section, sans aucune action de gestion.
      await go(page, `/e/${SLUG}`);
      const section = page.getByTestId("event-photos");
      await section.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await expect(section).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("event-photos-title")).toContainText("Photos");
      await expect(section).toContainText("1 album");
      await expect(page.getByTestId("event-photos-official")).toHaveText("Album officiel");
      await expect(section).toContainText("Sud Cars · 12 photos");
      await expect(page.getByTestId("event-photos-album-title")).toHaveText(
        "Les photos du Rassemblement Côte Vermeille",
      );
      await expect(page.getByTestId("event-photos-more")).toHaveCount(0);
      await expect(page.getByTestId("event-photos-open")).toContainText("Voir l'album");
      await shot(page, `fiche-photos-passionne-${theme}`);

      // Organisateur : le « … » retire puis remet « officiel ».
      await chooseOrganizer(page, "MéditeSportCar");
      await go(page, `/e/${SLUG}`);
      await section.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await page.getByTestId("event-photos-more").click();
      await expect(page.getByTestId("album-sheet-official")).toContainText("Retirer « officiel »");
      await shot(page, `fiche-photos-feuille-${theme}`);
      await page.getByTestId("album-sheet-official").click();
      await expect(page.getByTestId("event-photos-official")).toHaveCount(0, { timeout: 30_000 });
      await page.getByTestId("event-photos-more").click();
      await expect(page.getByTestId("album-sheet-official")).toContainText("Choisir cet album comme « officiel »");
      await page.getByTestId("album-sheet-official").click();
      await expect(page.getByTestId("event-photos-official")).toHaveText("Album officiel", { timeout: 30_000 });

      // L'album ouvert, une photo : les actions de l'organisateur.
      await page.getByTestId("event-photos-open").click();
      await expect(page.getByTestId("album-open")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("album-photo").nth(1).click();
      await expect(page.getByTestId("album-action-repost")).toHaveText("Reprendre dans le journal de l'événement", {
        timeout: 30_000,
      });
      await expect(page.getByTestId("album-action-official")).toContainText("Retirer « officiel »");
      await shot(page, `visionneuse-organisateur-${theme}`);
      await page.getByTestId("album-action-repost").click();
      await expect(page.getByTestId("repost-caption")).toHaveValue("Photo : Sud Cars", { timeout: 30_000 });
      await shot(page, `feuille-reprise-${theme}`);
      await page.getByTestId("repost-caption").fill(`Merci à Sud Cars (${theme}).`);
      await page.getByTestId("repost-publish").click();
      await expect(page.getByTestId("repost-done")).toContainText("crédit Sud Cars conservé", { timeout: 30_000 });
      const journal = await apiCall<{ items: { id: string; caption: string | null }[] }>(
        cookie,
        "GET",
        `/events/${events.data.id}/feed-posts`,
      );
      postId = journal.data.items.find((p) => p.caption === `Merci à Sud Cars (${theme}).`)?.id ?? null;
      expect(postId).not.toBeNull();

      // La même photo une seconde fois.
      await page.getByTestId("repost-see-journal").click();
      await expect(page.getByTestId("event-photos")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("event-photos-open").click();
      await page.getByTestId("album-photo").nth(1).click();
      await page.getByTestId("album-action-repost").click();
      await page.getByTestId("repost-publish").click();
      await expect(page.getByText("Déjà reprise dans le journal.")).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Escape");

      // La publication reprise dans le journal de la fiche.
      await go(page, `/e/${SLUG}`);
      // Grille de deux (vue par défaut) : le crédit est dans la méta texte sous la vignette (jamais une pastille sur la photo).
      await expect(page.getByTestId("publication-tile-credit").first()).toHaveText("Photo : Sud Cars", {
        timeout: 30_000,
      });
      // Sans session : le journal public porte aussi le crédit.
      const visitor = await browser.newContext({ viewport: { width: 390, height: 860 }, baseURL: APP });
      await visitor.addInitScript(() => localStorage.setItem("orasso.onboarded", "1"));
      const visitorPage = await visitor.newPage();
      await go(visitorPage, `/e/${SLUG}`);
      await expect(visitorPage.getByTestId("journal-public-credit").first()).toHaveText("Photo : Sud Cars", {
        timeout: 30_000,
      });
      await visitor.close();
      // Vue « Une par une » : la photo porte « Photo : <média> » et le pied « repartagée, crédit non retirable ».
      await page.getByRole("button", { name: "Une par une" }).click();
      await expect(page.getByTestId("credit-foot").first()).toContainText("repartagée, crédit non retirable", {
        timeout: 30_000,
      });
      await expect(page.getByTestId("credit-overlay").first()).toHaveText("Photo : Sud Cars");
      await page.getByTestId("credit-foot").first().scrollIntoViewIfNeeded();
      await shot(page, `publication-reprise-${theme}`);
      await expect(page.getByTestId("credit-album").first()).toContainText("Voir l'album");
    } finally {
      if (postId) await apiCall(cookie, "DELETE", `/me/feed-posts/${postId}`);
      await ctx.close();
    }
  });
}

test("Léo (le média) : aucune action d'organisateur ; police ×1,3 : la section tient", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, LEO, { scale: 1.3, width: 384 });
  await go(page, `/e/${SLUG}`);
  const section = page.getByTestId("event-photos");
  await section.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("event-photos-more")).toHaveCount(0);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(384);
  await shot(page, "fiche-photos-police-1-3");
  await page.getByTestId("event-photos-open").click();
  await expect(page.getByTestId("album-open")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("album-photo").first().click();
  await expect(page.getByTestId("album-viewer")).toBeVisible();
  await expect(page.getByTestId("album-action-repost")).toHaveCount(0);
  await expect(page.getByTestId("album-action-official")).toHaveCount(0);
  await ctx.close();
});

// --- Tour 2 : le cumul média + organisateur, la panne de lecture, la vue comptée, le lien profond ---------------------------------

/** Léo (titulaire du média Sud Cars) devient aussi co-organisateur de la structure de l'événement, le temps d'une recette. */
async function withLeoAsCoOrganizer<T>(run: () => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into structure_members (structure_id, user_id, role, status, joined_at)
         select e.structure_id, u.id, 'co_organizer', 'active', now()
           from events e, "user" u where e.slug = $1 and u.email = $2
         on conflict (structure_id, user_id) do update set role = 'co_organizer', status = 'active'`,
      [SLUG, LEO],
    );
    return await run();
  } finally {
    await client.query(
      `delete from structure_members where user_id = (select id from "user" where email = $2)
         and structure_id = (select structure_id from events where slug = $1)`,
      [SLUG, LEO],
    );
    await client.end();
  }
}

test("Léo, titulaire du média ET organisateur de l'événement : ses droits de titulaire et ceux de l'organisateur", async ({
  browser,
}) => {
  await withLeoAsCoOrganizer(async () => {
    const { ctx, page } = await open(browser, LEO);
    try {
      await chooseOrganizer(page, "MéditeSportCar");
      await go(page, `/e/${SLUG}`);
      await page.getByTestId("event-photos").scrollIntoViewIfNeeded({ timeout: 30_000 });
      await page.getByTestId("event-photos-open").click();
      await expect(page.getByTestId("album-open")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("album-photo").nth(1).click();
      await expect(page.getByTestId("album-viewer")).toBeVisible();
      // Titulaire : retirer la photo ; organisateur : reprendre au journal et « officiel ». Jamais « Signaler » sur ses propres photos.
      await expect(page.getByTestId("album-viewer-remove")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("album-action-repost")).toHaveText("Reprendre dans le journal de l'événement", {
        timeout: 30_000,
      });
      await expect(page.getByTestId("album-action-official")).toBeVisible();
      // Tour 7 : un seul « Identifier une voiture » (celui du rôle R9f), jamais doublé par la casquette d'organisateur.
      await expect(page.getByTestId("album-action-tag-identify")).toHaveCount(1);
      await expect(page.getByTestId("album-viewer-report")).toHaveCount(0);
      await shot(page, "visionneuse-cumul-media-organisateur");
    } finally {
      await ctx.close();
    }
  });
});

// Tour 7 : les droits du compte (co-organisateur) ne suffisent pas, la casquette active compte : en casquette passionné, aucune action d'organisateur.
test("Léo, co-organisateur de l'événement mais en casquette passionné : aucune action d'organisateur dans la visionneuse", async ({
  browser,
}) => {
  await withLeoAsCoOrganizer(async () => {
    const { ctx, page } = await open(browser, LEO);
    try {
      await go(page, `/e/${SLUG}`);
      await page.getByTestId("event-photos").scrollIntoViewIfNeeded({ timeout: 30_000 });
      await page.getByTestId("event-photos-open").click();
      await expect(page.getByTestId("album-open")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("album-photo").nth(1).click();
      await expect(page.getByTestId("album-viewer")).toBeVisible();
      await expect(page.getByTestId("album-viewer-remove")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("album-action-tag-identify")).toHaveCount(1, { timeout: 30_000 });
      await expect(page.getByTestId("album-action-repost")).toHaveCount(0);
      await expect(page.getByTestId("album-action-official")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

test("la liste des albums tombe en panne : « Réessayer » (pas de section qui disparaît), puis la liste se lit", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    let down = true;
    await page.route(`**/api/events/by-slug/${SLUG}/albums*`, (route) =>
      down
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "internal", message: "Erreur du serveur" } }),
          })
        : route.continue(),
    );
    await go(page, `/e/${SLUG}`);
    await expect(page.getByTestId("event-photos-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos-error")).toContainText("Les albums n'ont pas pu être chargés.");
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(0);
    await shot(page, "fiche-photos-panne");
    down = false;
    await page.getByTestId("event-photos-error").getByText("Réessayer").click();
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId("event-photos-error")).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("la liste suit le retour sur la fiche (actualisation) et la vue est comptée à l'ouverture d'un album depuis la fiche", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    let reads = 0;
    page.on("request", (r) => {
      if (r.method() === "GET" && new RegExp(`/api/events/by-slug/${SLUG}/albums`).test(r.url())) reads += 1;
    });
    await go(page, `/e/${SLUG}`);
    await page.getByTestId("event-photos").scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(1, { timeout: 30_000 });
    const before = reads;
    const view = page.waitForRequest(
      (r) => r.method() === "POST" && /\/api\/media-contents\/[0-9a-f-]{36}\/view/.test(r.url()),
      {
        timeout: 30_000,
      },
    );
    await page.getByTestId("event-photos-open").click();
    await view;
    await expect(page.getByTestId("album-open")).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await expect(page.getByTestId("event-photos")).toBeVisible({ timeout: 30_000 });
    // Le retour sur la fiche relit la liste (comme le journal et la fiche).
    await expect.poll(() => reads, { timeout: 30_000 }).toBeGreaterThan(before);
  } finally {
    await ctx.close();
  }
});

test("lien profond « Photos » : la section est posée en haut de la page, dans le repère du contenu", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    await go(page, `/e/${SLUG}?section=photos`);
    const section = page.getByTestId("event-photos");
    await expect(section).toBeVisible({ timeout: 30_000 });
    // Le temps de se stabiliser (blocs du dessus qui se chargent), puis une seule fois au bon endroit.
    await expect
      .poll(async () => (await section.boundingBox())?.y ?? Number.NaN, { timeout: 30_000 })
      .toBeLessThan(160);
    const box = await section.boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(-4);
    await shot(page, "fiche-lien-profond-photos");
  } finally {
    await ctx.close();
  }
});

test("51 albums : « 51 albums », 50 affichés, « Voir plus d'albums » ajoute le 51e", async ({ browser }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into event_albums (event_id, media_profile_id, author_id, title, status, published_at, photos_count)
         select a.event_id, a.media_profile_id, a.author_id, 'Extra ' || g, 'published',
                a.published_at - (g || ' minutes')::interval, 0
           from event_albums a, generate_series(1, 50) g
          where a.event_id = (select id from events where slug = $1) and a.official_at is not null`,
      [SLUG],
    );
    const { ctx, page } = await open(browser, DAMIEN);
    try {
      await go(page, `/e/${SLUG}`);
      await page.getByTestId("event-photos").scrollIntoViewIfNeeded({ timeout: 30_000 });
      await expect(page.getByTestId("event-photos-title")).toContainText("51 albums", { timeout: 30_000 });
      await expect(page.getByTestId("event-photos-album-title")).toHaveCount(50);
      await page.getByTestId("event-photos-more-albums").scrollIntoViewIfNeeded();
      await page.getByTestId("event-photos-more-albums").click();
      await expect(page.getByTestId("event-photos-album-title")).toHaveCount(51, { timeout: 30_000 });
      await expect(page.getByTestId("event-photos-more-albums")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  } finally {
    await client.query(
      "delete from event_albums where title like 'Extra %' and event_id = (select id from events where slug = $1)",
      [SLUG],
    );
    await client.end();
  }
});

test("sans session, ouvrir un album depuis la fiche ne compte aucune vue", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, baseURL: APP });
  await ctx.addInitScript(() => localStorage.setItem("orasso.onboarded", "1"));
  const page = await ctx.newPage();
  try {
    const views: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/media-contents\/.+\/view/.test(r.url())) views.push(r.url());
    });
    await go(page, `/e/${SLUG}`);
    await page.getByTestId("event-photos").scrollIntoViewIfNeeded({ timeout: 30_000 });
    await page.getByTestId("event-photos-open").click();
    // L'album sans session demande la connexion : la navigation finie (album ou connexion), puis un laps où une vue serait partie.
    await page.waitForURL((url) => !url.pathname.startsWith("/e/"), { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_500);
    expect(views).toEqual([]);
  } finally {
    await ctx.close();
  }
});

// --- Tour 3 -------------------------------------------------------------------------------------------------------------------

test("liste vide réussie, puis actualisation en panne : le message et « Réessayer » (jamais une section qui disparaît), puis la reprise", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    let phase: "empty" | "down" | "ok" = "empty";
    await page.route(`**/api/events/by-slug/${SLUG}/albums*`, (route) =>
      phase === "empty"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: [], nextCursor: null, total: 0 }),
          })
        : phase === "down"
          ? route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "internal", message: "Erreur du serveur" } }),
            })
          : route.continue(),
    );
    // Retour sur la fiche depuis le plateau : la liste est relue (comme le journal).
    const leaveAndComeBack = async () => {
      await page.getByTestId("lineup-block").getByText("Voir le plateau", { exact: false }).first().click();
      await page.waitForURL(/plateau/, { timeout: 30_000 });
      await page.goBack();
      await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
    };
    await go(page, `/e/${SLUG}`);
    await expect(page.getByTestId("lineup-block")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos")).toHaveCount(0);
    phase = "down";
    await leaveAndComeBack();
    await expect(page.getByTestId("event-photos-error")).toBeVisible({ timeout: 30_000 });
    phase = "ok";
    await page.getByTestId("event-photos-error").getByText("Réessayer").click();
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(1, { timeout: 30_000 });
    // Des albums déjà lus restent affichés quand l'actualisation échoue, avec le message.
    phase = "down";
    await leaveAndComeBack();
    await expect(page.getByTestId("event-photos-refresh-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(1);
    phase = "ok";
    await page.getByTestId("event-photos-refresh-error").getByText("Réessayer").click();
    await expect(page.getByTestId("event-photos-refresh-error")).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await ctx.close();
  }
});

test("lien profond « Photos » : le plateau, lu en retard, repousse la section ; la page s'y reporte quand même", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    await withoutScrollAnchoring(page);
    // La réponse du plateau est retenue 2,5 s (mise en scène), puis la section doit être posée en haut une fois le plateau affiché.
    await page.route(`**/api/events/*/lineup*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      await route.continue();
    });
    await go(page, `/e/${SLUG}?section=photos`);
    await expect(page.getByTestId("lineup-block")).toBeVisible({ timeout: 30_000 });
    const section = page.getByTestId("event-photos");
    await expect
      .poll(async () => (await section.boundingBox())?.y ?? Number.NaN, { timeout: 30_000 })
      .toBeLessThan(160);
  } finally {
    await ctx.close();
  }
});

test("lien profond « Photos » : fiche retardée puis plateau retardé ; l'attente du plateau part de la lecture de l'événement", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    await withoutScrollAnchoring(page);
    // La fiche arrive après 3 s, puis le plateau après 2,5 s de plus (mises en scène) : plus de 4 s après l'ouverture de l'écran.
    await page.route(
      (url) => url.pathname.endsWith(`/api/events/by-slug/${SLUG}`),
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue();
      },
    );
    await page.route(`**/api/events/*/lineup*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      await route.continue();
    });
    await go(page, `/e/${SLUG}?section=photos`);
    await expect(page.getByTestId("lineup-block")).toBeVisible({ timeout: 30_000 });
    const section = page.getByTestId("event-photos");
    await expect
      .poll(async () => (await section.boundingBox())?.y ?? Number.NaN, { timeout: 30_000 })
      .toBeLessThan(160);
  } finally {
    await ctx.close();
  }
});

test("liste non vide, puis actualisation en 404 (événement devenu invisible) : la section disparaît", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    let gone = false;
    await page.route(`**/api/events/by-slug/${SLUG}/albums*`, (route) =>
      gone
        ? route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "not_found", message: "Événement introuvable" } }),
          })
        : route.continue(),
    );
    await go(page, `/e/${SLUG}`);
    await expect(page.getByTestId("lineup-block")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(1, { timeout: 30_000 });
    gone = true;
    // Retour sur la fiche depuis le plateau : la liste est relue, elle répond 404.
    await page.getByTestId("lineup-block").getByText("Voir le plateau", { exact: false }).first().click();
    await page.waitForURL(/plateau/, { timeout: 30_000 });
    await page.goBack();
    await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(0);
    await expect(page.getByTestId("event-photos-refresh-error")).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("liste non vide, 404, puis panne (500), puis lecture réussie : les albums n'ont pas réapparu pendant la panne", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, DAMIEN);
  try {
    let mode: "ok" | "404" | "500" = "ok";
    await page.route(`**/api/events/by-slug/${SLUG}/albums*`, (route) =>
      mode === "404"
        ? route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "not_found", message: "Événement introuvable" } }),
          })
        : mode === "500"
          ? route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "internal", message: "Erreur" } }),
            })
          : route.continue(),
    );
    const refresh = async () => {
      // Aller au plateau puis revenir : la fiche est relue au retour.
      await page.getByTestId("lineup-block").getByText("Voir le plateau", { exact: false }).first().click();
      await page.waitForURL(/plateau/, { timeout: 30_000 });
      await page.goBack();
      await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
    };
    await go(page, `/e/${SLUG}`);
    await expect(page.getByTestId("lineup-block")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(1, { timeout: 30_000 });
    mode = "404";
    await refresh();
    await expect(page.getByTestId("event-photos")).toHaveCount(0, { timeout: 30_000 });
    mode = "500";
    await refresh();
    // La panne n'est pas un 404 : l'erreur s'affiche, mais les albums refusés par l'API ne reviennent pas.
    await expect(page.getByTestId("event-photos-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(0);
    mode = "ok";
    await refresh();
    await expect(page.getByTestId("event-photos-album-title")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId("event-photos-error")).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
