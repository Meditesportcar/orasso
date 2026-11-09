import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, unique } from "./helpers";
import { r5Crew } from "./lotr5c2-setup";
import { postText } from "./lotr6a-setup";
import { RELAIS } from "./relais";

// Lot R7e2 (D38), côté appli (version web compilée de recette, `APP_URL`) : le Fil. Trois filtres (mémorisés), cartes par
// genre avec leur raison, menu « ⋯ » (Pourquoi je vois ça, Moins de ce genre + Annuler, Signaler), flamme, publier au Fil
// en 4:5 avec « Aucune plaque visible » (bouton grisé expliqué sans décision de plaque), Mes publications ; et, par l'API,
// la vie privée : la publication d'un compte privé n'est vue que de ses abonnés acceptés, jamais un contenu de crew.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7e2-captures/apres/recette-appli`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton", size: { scale?: number; width?: number } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size.width ?? 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, scale]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(scale) > 1) localStorage.setItem("orasso.recette.echellePolice", String(scale));
    },
    [theme, size.scale ?? 1] as const,
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

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** La liste est chargée (cartes ou état vide), jamais l'attente. */
async function loaded(page: Page) {
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty"))).toBeVisible({ timeout: 30_000 });
}

test("trois filtres, mémorisés ; chaque carte dit sa raison ; la liste ne ressemble jamais à une erreur", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  await go(page, "/fil");
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fil-filters")).toBeVisible();
  await loaded(page);
  // Chaque carte a sa raison en petite ligne et son « ⋯ ».
  const cards = page
    .getByTestId("fil-list")
    .locator('[data-testid^="feed-card-"]:not([data-testid="feed-card-reason"]):not([data-testid="feed-card-more"])');
  expect(await cards.count()).toBeGreaterThan(2);
  expect(await page.getByTestId("feed-card-reason").count()).toBeGreaterThanOrEqual(await cards.count());
  expect(await page.getByTestId("feed-card-more").count()).toBeGreaterThanOrEqual(await cards.count());
  await shot(page, "fil-pour-toi");

  await page.getByTestId("fil-filters-nearby").click();
  await loaded(page);
  await shot(page, "fil-autour-de-moi");

  await page.getByTestId("fil-filters-following").click();
  await loaded(page);
  // Damien suit Kenji_66 : ses publications arrivent dans « Abonnements ».
  await expect(page.getByTestId("fil-list")).toContainText("Kenji_66");
  await shot(page, "fil-abonnements");

  // Le filtre est mémorisé par compte : au retour sur l'onglet, « Abonnements » est encore choisi.
  await go(page, "/fil");
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.entries(localStorage)
            .filter(([k]) => k.includes("fil-filter"))
            .map(([, v]) => v)
            .join(),
        ),
      { timeout: 30_000 },
    )
    .toContain("following");
  await loaded(page);
  expect(errors.filter((e) => !/favicon|manifest|Failed to load resource.*(404|401)/.test(e))).toEqual([]);
  await ctx.close();
});

test("état vide d'« Abonnements » : un compte qui ne suit personne a le bouton vers la recherche, sans annuaire", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { ctx, page } = await open(browser, "paul.photo@orasso.local");
  await go(page, "/fil");
  await page.getByTestId("fil-filters-following").click();
  await loaded(page);
  // Paul ne suit personne (seed) : l'état vide, et le bouton qui ouvre la recherche (deux lettres au moins).
  if (await page.getByTestId("fil-empty").isVisible()) {
    await expect(page.getByTestId("fil-empty")).toContainText("Suis des passionnés pour remplir cet onglet");
    await page.getByTestId("fil-empty-search").click();
    await expect(page.getByRole("tablist", { name: "Que chercher ?" })).toBeVisible({ timeout: 30_000 });
  }
  await ctx.close();
});

test("menu « ⋯ » : pourquoi je vois ça, moins de ce genre puis annuler, signaler une publication", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await go(page, "/fil");
  await loaded(page);
  await page.getByTestId("fil-filters-following").click();
  await loaded(page);
  const post = page.getByTestId("feed-card-feed_post").first();
  await expect(post).toBeVisible({ timeout: 30_000 });
  // Pourquoi je vois ça.
  await post.getByTestId("feed-card-more").click();
  await expect(page.getByTestId("feed-menu-why")).toBeVisible();
  await expect(page.getByTestId("feed-menu-less")).toBeVisible();
  await expect(page.getByTestId("feed-menu-report")).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, "menu-trois-lignes");
  await page.getByTestId("feed-menu-why").click();
  await expect(page.getByTestId("feed-why-text")).toContainText(/Tu suis|suit|Orasso/);
  await shot(page, "pourquoi-je-vois-ca");
  await page.getByTestId("feed-why-ok").click();
  await expect(page.getByTestId("feed-why-text")).toHaveCount(0);
  // Moins de ce genre : la carte s'estompe, un « Annuler » apparaît ; le Fil affiché ne bouge pas.
  const before = await page.getByTestId("fil-list").locator('[data-testid="feed-card-more"]').count();
  await post.getByTestId("feed-card-more").click();
  await page.getByTestId("feed-menu-less").click();
  await expect(page.getByTestId("fil-less-note")).toContainText("On t'en montrera moins");
  expect(await page.getByTestId("fil-list").locator('[data-testid="feed-card-more"]').count()).toBe(before);
  await shot(page, "moins-de-ce-genre");
  const less = await apiCall(await login("damien@orasso.local"), "GET", "/me/fil/less");
  expect((less.data as { kinds: string[] }).kinds).toContain("feed_post");
  await page.getByTestId("fil-less-undo").click();
  await expect(page.getByTestId("fil-less-note")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        ((await apiCall(await login("damien@orasso.local"), "GET", "/me/fil/less")).data as { kinds: string[] }).kinds,
    )
    .not.toContain("feed_post");
  // Signaler : la feuille de signalement, motif puis envoi.
  await post.getByTestId("feed-card-more").click();
  await page.getByTestId("feed-menu-report").click();
  await expect(page.getByTestId("report-reason-spam")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("report-reason-spam").click();
  await page.getByTestId("report-send").click();
  await expect(page.getByTestId("report-done")).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});

test("flamme : le compteur bouge, se retire, et la réponse de l'API fait foi", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await go(page, "/fil");
  await page.getByTestId("fil-filters-following").click();
  await loaded(page);
  // Une publication qui n'est pas la mienne.
  const post = page.getByTestId("feed-card-feed_post").first();
  await expect(post).toBeVisible({ timeout: 30_000 });
  const count = post.getByTestId("feed-post-fire-count");
  // Une flamme déjà donnée (essai précédent) : on la retire d'abord.
  if (((await post.getByTestId("feed-post-fire").getAttribute("aria-label")) ?? "").includes("Retirer")) {
    await post.getByTestId("feed-post-fire").click();
    await expect(post.getByTestId("feed-post-fire")).toHaveAttribute("aria-label", /Mettre une flamme/);
  }
  const n0 = Number(await count.innerText());
  const fire = post.getByTestId("feed-post-fire");
  await fire.click();
  await expect(count).toHaveText(String(n0 + 1), { timeout: 15_000 });
  await expect(fire).toHaveAttribute("aria-label", /Retirer ta flamme/);
  await fire.click();
  await expect(count).toHaveText(String(n0), { timeout: 15_000 });
  await ctx.close();
});

test("publier au Fil en 4:5 : bouton grisé expliqué sans décision de plaque, puis « Aucune plaque visible »", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  await go(page, "/fil");
  await page.getByTestId("fil-publish-open").click();
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  // Rien : le bouton est grisé, et la ligne dit pourquoi.
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-missing")).toHaveText("Ajoute au moins une photo.");
  await expect(
    page.getByTestId("fil-publish-format-4_5").or(page.getByTestId("fil-publish-format-portrait_4_5")),
  ).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo("car-golf-gti.jpg"), photo("car-mx5.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(2, { timeout: 60_000 });
  // Sur le web, aucune détection de plaque : la décision reste à prendre, le bouton reste grisé et la ligne dit quelle photo.
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-missing")).toContainText("plaque");
  await shot(page, "publier-plaque-a-regler");
  // Photo 1 : « Aucune plaque visible », confirmé.
  await page.getByTestId("fil-publish-none").click();
  await expect(page.getByTestId("fil-publish-none-confirm")).toBeVisible();
  await page.getByTestId("fil-publish-none-yes").click();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 2");
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  // Photo 2.
  await page.getByTestId("fil-publish-photo").nth(1).click();
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  await expect(page.getByTestId("fil-publish-missing")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-send")).toBeEnabled();
  await page.getByTestId("fil-publish-caption").fill("Prêtes pour dimanche");
  await shot(page, "publier-pret");
  // Le format change : la décision de plaque repart de zéro (les cadres ne vaudraient plus).
  await page.getByTestId("fil-publish-format-square").click();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await page.getByTestId("fil-publish-format-portrait_4_5").click();
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  for (const i of [0, 1]) {
    await page.getByTestId("fil-publish-photo").nth(i).click();
    await page.getByTestId("fil-publish-none").click();
    await page.getByTestId("fil-publish-none-yes").click();
  }
  await expect(page.getByTestId("fil-publish-send")).toBeEnabled();
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await shot(page, "publie");
  // Ma publication revient en tête du Fil, même dans « Abonnements » (l'API n'y met pas mes propres publications).
  await page.getByTestId("fil-publish-back").click();
  await page.getByTestId("fil-filters-following").click();
  const mineCard = page.getByTestId("feed-card-feed_post").first();
  await expect(mineCard).toContainText("Prêtes pour dimanche", { timeout: 30_000 });
  await expect(mineCard).toContainText("Ta publication");
  // La publication est au Fil (4:5, 2 photos) et dans « Mes publications » ; Kenji la voit dans son Fil et la supprime.
  const cookie = await login("kenji@orasso.local");
  const mine = await apiCall<{ items: { id: string; aspect: string; photos: unknown[]; caption: string }[] }>(
    cookie,
    "GET",
    "/me/feed-posts",
  );
  const posted = mine.data.items.find((p) => p.caption === "Prêtes pour dimanche");
  expect(posted?.aspect).toBe("portrait_4_5");
  expect(posted?.photos).toHaveLength(2);
  // Sans recharger la page (la copie gardée en mémoire ne doit pas s'envoler) : « Mes publications », puis retour au Fil.
  await page.evaluate(() => {
    window.history.pushState(null, "", "/fil/mes-publications");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByTestId("fil-mine-post").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "mes-publications");
  page.once("dialog", (d) => void d.accept());
  const total = await page.getByTestId("fil-mine-post").count();
  await page.getByTestId("fil-mine-remove").first().click();
  await expect(page.getByTestId("fil-mine-post")).toHaveCount(total - 1, { timeout: 15_000 });
  // Tour 4 : la publication supprimée ne revient pas en tête du Fil.
  await page.goBack();
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await loaded(page);
  await expect(page.getByTestId("fil-list")).not.toContainText("Prêtes pour dimanche");
  await ctx.close();
});

test("tour 4 : la confirmation « Aucune plaque visible » suit la photo, pas l'index (retirer la photo 1)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  await go(page, "/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo("car-golf-gti.jpg"), photo("car-mx5.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  await page.getByTestId("fil-publish-none").click();
  await expect(page.getByTestId("fil-publish-none-confirm")).toBeVisible();
  await page.getByTestId("fil-publish-photo-remove").first().click();
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1);
  // La confirmation de la photo 1 est fermée ; la photo restante (devenue la première) n'a aucune décision.
  await expect(page.getByTestId("fil-publish-none-confirm")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1");
  await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
  await ctx.close();
});

test("tour 4 : une photo du Fil qui n'arrive pas montre « Réessayer », et revient quand la requête passe", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  // Seule la requête des photos de publication échoue : la liste, elle, charge.
  const photoRoute = /\/feed-posts\/[^/]+\/photos\//;
  await page.route(photoRoute, (route) => route.abort());
  await go(page, "/fil");
  await loaded(page);
  // Les photos ne se chargent que près de l'écran : on amène la première publication à l'écran.
  await page.getByTestId("feed-card-feed_post").first().scrollIntoViewIfNeeded();
  await expect(page.getByTestId("photo-failed").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("photo-retry").first()).toBeVisible();
  await shot(page, "photo-en-panne");
  await page.unroute(photoRoute);
  await page.getByTestId("photo-retry").first().click();
  await expect(page.getByTestId("feed-post-photos").first().locator("img").first()).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("vie privée : la publication d'un compte privé n'apparaît qu'à son abonné accepté ; jamais un contenu de crew", async () => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local"); // abonné accepté de Marc_66 (compte privé)
  const kenji = await login("kenji@orasso.local"); // ne suit pas Marc_66
  const theo = await login("theo@orasso.local"); // demande en attente
  const marc = await login("marc@orasso.local");
  const mine = await apiCall<{ items: { id: string }[] }>(marc, "GET", "/me/feed-posts");
  const marcPost = mine.data.items[0]?.id;
  expect(marcPost).toBeTruthy();

  type Page = { items: { id: string; kind: string; payload: unknown }[]; nextCursor: string | null };
  async function everything(cookie: string, filter: string): Promise<Page["items"]> {
    const out: Page["items"] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 12; i++) {
      const path: string = `/fil?filter=${filter}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await apiCall<Page>(cookie, "GET", path);
      expect(res.status).toBe(200);
      out.push(...res.data.items);
      cursor = res.data.nextCursor;
      if (!cursor) break;
    }
    return out;
  }
  const hasPost = (items: Page["items"]) =>
    items.some((c) => c.kind === "feed_post" && (c.payload as { post: { id: string } }).post.id === marcPost);

  // L'abonné accepté la voit (Abonnements), les autres jamais : ni dans le Fil, ni en direct, ni par sa photo.
  expect(hasPost(await everything(damien, "following"))).toBe(true);
  for (const [name, cookie] of [
    ["Kenji", kenji],
    ["Théo (en attente)", theo],
  ] as const) {
    for (const filter of ["for_you", "nearby", "following"]) {
      expect(hasPost(await everything(cookie, filter)), `${name} / ${filter}`).toBe(false);
    }
    expect((await apiCall(cookie, "GET", `/feed-posts/${marcPost}`)).status, name).toBe(404);
  }
  expect((await apiCall(damien, "GET", `/feed-posts/${marcPost}`)).status).toBe(200);
  // Sans session : ni publication, ni photo (le Fil n'est jamais public).
  expect((await apiCall(null, "GET", "/fil")).status).toBe(401);
  expect((await apiCall(null, "GET", `/feed-posts/${marcPost}`)).status).toBe(401);

  // Jamais un contenu de crew : un crew neuf, une publication de crew, et le Fil de ses membres ne la contient pas.
  const crew = await r5Crew(unique().slice(-6));
  const marker = "SECRET-CREW-R7E2";
  await postText(crew, crew.chef, marker);
  for (const who of [crew.chef.cookie, kenji]) {
    for (const filter of ["for_you", "nearby", "following"]) {
      const text = JSON.stringify(await everything(who, filter));
      expect(text).not.toContain(marker);
      expect(text).not.toContain("crew-posts");
      expect(text).not.toContain("/crews/");
    }
  }
});

test("recadrer au doigt : un glissement déplace le cadre, Valider recadre la photo et remet sa plaque à zéro", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  await go(page, "/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  // Une décision de plaque : « Aucune plaque visible » ; un nouveau cadrage la remet à zéro.
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  await expect(page.getByTestId("fil-publish-missing")).toHaveCount(0);
  const tile = page.getByTestId("fil-publish-photo").first();
  const picture = () =>
    tile.evaluate((el) => {
      const img = el.querySelector("img");
      return (
        (img as HTMLImageElement | null)?.currentSrc ||
        getComputedStyle(el.firstElementChild as Element).backgroundImage
      );
    });
  const before = await picture();
  await page.getByTestId("fil-publish-crop").click();
  const stage = page.getByTestId("crop-stage");
  await expect(stage).toBeVisible();
  await page.waitForTimeout(600);
  const image = stage.locator("img").first();
  const y0 = ((await image.boundingBox()) as { y: number }).y;
  const at = (await stage.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 - 70, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const y1 = ((await image.boundingBox()) as { y: number }).y;
  // Les photos du seed sont en portrait : dans un cadre 4:5 elles ne glissent qu'en hauteur.
  expect(y0 - y1).toBeGreaterThan(20);
  await page.getByTestId("crop-validate").click();
  await expect(page.getByTestId("square-cropper")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-missing")).toContainText("Photo 1", { timeout: 30_000 });
  await expect.poll(picture, { timeout: 30_000 }).not.toBe(before);
  await ctx.close();
});

test("recadrer en 1:1 : le recadreur du Fil s'ouvre en carré sans zoom, Valider recadre et ferme la confirmation de plaque", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const out = process.env.CAPTURES_DIR3 ?? `${RELAIS}/lot-r7e2-captures/apres3`;
  for (const theme of ["beton", "sable"]) {
    const { ctx, page } = await open(browser, "kenji@orasso.local", theme, { width: 384, scale: 1 });
    await go(page, "/fil/publier");
    await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("fil-publish-format-square").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("fil-publish-add").click();
    await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
    await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
    const tile = page.getByTestId("fil-publish-photo").first();
    const picture = () =>
      tile.evaluate((el) => {
        const img = el.querySelector("img");
        return (
          (img as HTMLImageElement | null)?.currentSrc ||
          getComputedStyle(el.firstElementChild as Element).backgroundImage
        );
      });
    const before = await picture();
    // La confirmation « Aucune plaque visible » ouverte : un recadrage la ferme.
    await page.getByTestId("fil-publish-none").click();
    await expect(page.getByTestId("fil-publish-none-confirm")).toBeVisible();
    await page.getByTestId("fil-publish-crop").click();
    const stage = page.getByTestId("crop-stage");
    await expect(stage).toBeVisible();
    // Mode « autre format » : ni zoom ni aperçus, le cadre est carré.
    await expect(page.getByTestId("crop-zoom-in")).toHaveCount(0);
    const box = (await stage.boundingBox()) as { x: number; y: number; width: number; height: number };
    await page.waitForTimeout(600);
    const image = stage.locator("img").first();
    const y0 = ((await image.boundingBox()) as { y: number }).y;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 70, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(y0 - ((await image.boundingBox()) as { y: number }).y).toBeGreaterThan(20);
    await shot2(page, out, `recadrage-1-1-${theme}-384`);
    await page.getByTestId("crop-validate").click();
    await expect(page.getByTestId("square-cropper")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("fil-publish-none-confirm")).toHaveCount(0);
    await expect.poll(picture, { timeout: 30_000 }).not.toBe(before);
    await shot2(page, out, `recadre-1-1-${theme}-384`);
    await ctx.close();
  }
});

async function shot2(page: Page, dir: string, name: string) {
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test("captures Béton et Sable, 384 px, police 1 et 1,3 : Fil, menu, publier, plaque, recadrage, carte d'événement", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  for (const theme of ["beton", "sable"]) {
    // Le Fil d'un compte qui ne suit personne et vient d'arriver : « peu de monde » (maquette fd_few).
    const few = await open(browser, "paul.photo@orasso.local", theme, { width: 384, scale: 1 });
    await go(few.page, "/fil");
    await few.page.getByTestId("fil-filters-for_you").click();
    await loaded(few.page);
    await shot(few.page, `fil-peu-${theme}-384-f1`);
    await few.page.getByTestId("fil-filters-following").click();
    await loaded(few.page);
    await shot(few.page, `fil-abonnements-vide-${theme}-384-f1`);
    await few.ctx.close();
    for (const [width, scale] of [
      [384, 1],
      [384, 1.3],
    ] as const) {
      const { ctx, page } = await open(browser, "damien@orasso.local", theme, { width, scale });
      const tag = `${theme}-${width}-f${String(scale).replace(".", "")}`;
      await go(page, "/fil");
      await page.getByTestId("fil-filters-for_you").click();
      await loaded(page);
      await shot(page, `fil-${tag}`);
      await page.getByTestId("feed-card-more").first().click();
      await page.waitForTimeout(900);
      await shot(page, `fil-menu-${tag}`);
      await page.getByTestId("feed-menu-why").click();
      await shot(page, `fil-pourquoi-${tag}`);
      await page.getByTestId("feed-why-ok").click();
      await go(page, "/fil/publier");
      await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
      const chooser = page.waitForEvent("filechooser");
      await page.getByTestId("fil-publish-add").click();
      await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
      await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
      await shot(page, `publier-${tag}`);
      // Cadre posé (plaque), puis recadrage au doigt.
      await page.getByTestId("fil-publish-frame-add").click();
      await shot(page, `publier-plaque-${tag}`);
      await page.getByTestId("fil-publish-crop").click();
      await expect(page.getByTestId("square-cropper")).toBeVisible();
      await shot(page, `publier-recadrage-${tag}`);
      await page.getByTestId("crop-cancel").click();
      // La carte d'événement du Fil (celle de la maquette).
      await go(page, "/fil");
      await page.getByTestId("fil-filters-for_you").click();
      await loaded(page);
      const eventCard = page.getByTestId("feed-card-event_recommended").first();
      if (await eventCard.count()) {
        await eventCard.scrollIntoViewIfNeeded();
        await shot(page, `fil-carte-evenement-${tag}`);
      }
      await ctx.close();
    }
  }
});
