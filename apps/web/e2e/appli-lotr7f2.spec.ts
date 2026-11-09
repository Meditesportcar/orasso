import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { dropMyStories, publishStory, sql, userIdOf } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R7f2 (D38), côté appli (version web compilée de recette, `APP_URL`) : la lecture des stories. La barre du Fil (« Ta story »,
// anneaux clair, brique et fin), la visionneuse (toucher droite / gauche, bandeau « Mon crew », pause à l'appui long, glisser
// vers le bas), la vue enregistrée, la flamme, la réponse (message ou demande), « ⋯ » (signaler, ne plus voir ses stories),
// ma story (vues, supprimer), une story expirée. Les règles de visibilité sont vérifiées par l'API dans `lotr7f2-site`.
// Les gestes au doigt (appui long, glisser) sont rejoués à la souris ; leur ressenti sur le téléphone reste à essayer.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7f2-captures/apres/recette-appli`;
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

/** Les vues du seed remises à zéro : la barre part « non vue ». */
async function resetViews() {
  await sql("delete from story_views");
  await sql("update stories set views_count = 0");
}

/** Largeur (px) de la barre de progression courante. */
async function currentFill(page: Page): Promise<number> {
  const box = await page.getByTestId("story-bar-current").locator("> *").first().boundingBox();
  return box?.width ?? 0;
}

/** Ouvre la visionneuse d'un auteur depuis la barre du Fil. */
async function openFrom(page: Page, pseudo: RegExp | string) {
  await go(page, "/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(typeof pseudo === "string" ? `Voir les stories de ${pseudo}` : pseudo).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
}

/** L'image est lue : la barre se met à avancer. */
async function playing(page: Page) {
  await expect.poll(() => currentFill(page), { timeout: 30_000 }).toBeGreaterThan(1);
}

test("la barre : Ta story, anneaux clair et brique, anneau fin une fois vue ; la vue est enregistrée", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  await dropMyStories(damien);
  const lea = await userIdOf("Lea_11");
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await go(page, "/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  // « Ta story » en premier, avec son « + » (je n'ai pas de story).
  await expect(page.getByTestId("stories-mine")).toContainText("Ta story");
  await expect(page.getByTestId("stories-add")).toBeVisible();
  // Kenji : une story de crew visible de Damien (membre) → anneau brique ; Léa, Théo, Marc : anneau clair.
  await expect(page.getByTestId("stories-ring-crew").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stories-ring-followers").first()).toBeVisible();
  expect(await page.getByTestId("stories-ring-crew").count()).toBe(1);
  expect(await page.getByTestId("stories-ring-followers").count()).toBeGreaterThanOrEqual(3);
  // Un seul néon moutarde : aucun direct dans le seed (R7h), donc aucune étiquette « EN COURS » ici.
  await expect(page.getByTestId("stories-live-label")).toHaveCount(0);
  await shot(page, "barre-fil");

  // Ouvrir la story de Léa : en-tête, une barre, légende ; la vue est enregistrée quand l'image est lue.
  await page.getByLabel("Voir les stories de Lea_11").click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-author")).toHaveText("Lea_11");
  await expect(page.getByTestId("story-when")).toContainText("il y a");
  await expect(page.getByTestId("story-caption")).toContainText("Premier rassemblement de la saison");
  await expect(page.getByTestId("story-sticker-place")).toContainText("Perpignan");
  await expect(page.getByTestId("story-bar-current")).toHaveCount(1);
  await playing(page);
  await shot(page, "visionneuse-photo");
  await expect
    .poll(
      async () =>
        (
          await sql<{ n: number }>(
            "select count(*)::int as n from story_views where viewer_id = (select user_id from profiles where pseudo = 'Damien_66')",
          )
        )[0]?.n,
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(1);
  const leaViews = await sql<{ v: number }>("select views_count as v from stories where author_id = $1", [lea]);
  expect(leaViews[0]?.v).toBe(1);

  // Fermer : retour au Fil, l'anneau de Léa est devenu fin (tout vu).
  await page.getByTestId("story-close").click();
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`stories-author-u:${lea}`).getByTestId("stories-ring-seen")).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, "barre-fil-apres-vue");
  await ctx.close();
});

test("visionneuse : toucher à droite et à gauche, bandeau « Mon crew », pause à l'appui long, glisser vers le bas", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await openFrom(page, /Voir les stories de Kenji_66/);
  // Deux stories de Kenji (abonnés, crew) : deux barres, la première est la courante.
  await expect(page.getByTestId("story-bars").locator("> *")).toHaveCount(2);
  await playing(page);
  const badge = page.getByTestId("story-crew-badge");
  // Les deux stories de Kenji ont la même date dans le seed : l'ordre n'est pas écrit. L'une des deux porte le bandeau.
  const first = (await badge.count()) > 0;
  await page.getByTestId("story-surface").click({ position: { x: 300, y: 420 } });
  await expect(page.getByTestId("story-bar-done")).toHaveCount(1);
  await page.waitForTimeout(600);
  expect((await badge.count()) > 0).toBe(!first);
  if (!first) {
    await expect(badge).toContainText("Mon crew · Roussillon Drift");
    await shot(page, "visionneuse-crew");
  }
  // Toucher à gauche : la précédente.
  await page.getByTestId("story-surface").click({ position: { x: 20, y: 420 } });
  await expect(page.getByTestId("story-bar-done")).toHaveCount(0);
  await page.waitForTimeout(600);
  expect((await badge.count()) > 0).toBe(first);
  if (first) await expect(badge).toContainText("Mon crew · Roussillon Drift");
  // Appui long : la barre s'arrête, on n'avance pas ; relâché, elle repart.
  await playing(page);
  await page.mouse.move(200, 420);
  await page.mouse.down();
  await page.waitForTimeout(600);
  const paused = await currentFill(page);
  await page.waitForTimeout(900);
  expect(Math.abs((await currentFill(page)) - paused)).toBeLessThan(3);
  await page.mouse.up();
  await expect(page.getByTestId("story-crew-badge")).toHaveCount(0);
  await page.waitForTimeout(700);
  expect(await currentFill(page)).toBeGreaterThan(paused + 2);
  // Glisser vers le bas : la visionneuse se ferme, on revient au Fil.
  await page.mouse.move(200, 300);
  await page.mouse.down();
  for (let y = 300; y <= 720; y += 60) await page.mouse.move(200, y);
  await page.mouse.up();
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("flamme, réponse en message, signaler : chaque geste est pris en compte par l'API", async ({ browser }) => {
  test.setTimeout(240_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  // Une seule demande de contact par paire : celle des essais précédents est retirée.
  await sql(
    "delete from contact_requests where from_user_id = (select user_id from profiles where pseudo = 'Damien_66') and to_user_id = (select user_id from profiles where pseudo = 'Lea_11')",
  );
  const leaId = await userIdOf("Lea_11");
  await apiCall(
    damien,
    "DELETE",
    `/stories/${(await sql<{ id: string }>("select id from stories where author_id = $1", [leaId]))[0]?.id}/reaction`,
  );
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await openFrom(page, "Lea_11");
  await playing(page);
  // Flamme : posée tout de suite, confirmée par l'API ; pas de compteur pour moi (il est pour l'auteur seul).
  await expect(page.getByTestId("story-flames-count")).toHaveCount(0);
  await page.getByTestId("story-flame").click();
  await expect
    .poll(
      async () =>
        (await apiCall<{ stories: { reacted: boolean }[] }>(damien, "GET", `/stories/by-author/u:${leaId}`)).data
          .stories[0]?.reacted,
      { timeout: 15_000 },
    )
    .toBe(true);
  await shot(page, "visionneuse-flamme");
  // Répondre : le champ met la story en pause ; l'envoi dit si c'est un message ou une demande.
  await page.getByTestId("story-reply-input").fill("Superbe voiture !");
  const before = await currentFill(page);
  await page.waitForTimeout(900);
  expect(Math.abs((await currentFill(page)) - before)).toBeLessThan(3);
  await shot(page, "visionneuse-repondre");
  await page.getByTestId("story-reply-send").click();
  await expect(page.getByTestId("story-notice")).toContainText(/Message envoyé|Envoyé en demande de message/, {
    timeout: 15_000,
  });
  const sent = await sql<{ n: number }>(
    "select (select count(*) from messages where body = 'Superbe voiture !') + (select count(*) from contact_requests where message = 'Superbe voiture !') as n",
  );
  expect(Number(sent[0]?.n)).toBeGreaterThanOrEqual(1);
  // Signaler : « ⋯ » puis la feuille de signalement de l'appli, cible story.
  await page.getByTestId("story-more").click();
  await expect(page.getByTestId("story-menu-report")).toBeVisible();
  await expect(page.getByTestId("story-menu-mute")).toBeVisible();
  await shot(page, "visionneuse-menu");
  await page.getByTestId("story-menu-report").click();
  await expect(page.getByTestId("report-reason-spam")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("report-reason-spam").click();
  await page.getByTestId("report-send").click();
  await expect(page.getByTestId("report-done")).toBeVisible({ timeout: 15_000 });
  await apiCall(
    damien,
    "DELETE",
    `/stories/${(await sql<{ id: string }>("select id from stories where author_id = $1", [leaId]))[0]?.id}/reaction`,
  );
  await ctx.close();
});

test("« Ne plus voir ses stories » : l'auteur disparaît de la barre, sans qu'il le sache", async ({ browser }) => {
  test.setTimeout(240_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  const theo = await userIdOf("Theo_66");
  await apiCall(damien, "DELETE", `/me/story-mutes/u:${theo}`);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await openFrom(page, "Theo_66");
  await page.getByTestId("story-more").click();
  await page.getByTestId("story-menu-mute").click();
  await expect(page.getByTestId("story-notice")).toContainText("Tu ne verras plus ces stories", { timeout: 15_000 });
  // La visionneuse se referme ; Théo n'est plus dans la barre, ses stories restent sur son profil.
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`stories-author-u:${theo}`)).toHaveCount(0);
  expect(
    (await apiCall<{ stories: unknown[] }>(damien, "GET", `/stories/by-author/u:${theo}`)).data.stories.length,
  ).toBe(1);
  await apiCall(damien, "DELETE", `/me/story-mutes/u:${theo}`);
  await ctx.close();
});

test("ma story : « Ta story » avec mon anneau, vues pour moi seul, supprimer ; une story expirée dit « plus disponible »", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const lea = await login("lea@orasso.local");
  await dropMyStories(damien);
  const id = await publishStory(damien, { caption: "Ma story de recette" });
  await apiCall(lea, "POST", `/stories/${id}/view`);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await go(page, "/fil");
  await expect(page.getByTestId("stories-mine-ring")).toBeVisible({ timeout: 30_000 });
  await shot(page, "barre-fil-ma-story");
  await page.getByTestId("stories-mine-ring").click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  // Pas de champ de réponse ni de flamme pour ma propre story : « Vues · 1 » et le nombre de flammes.
  await expect(page.getByTestId("story-reply-input")).toHaveCount(0);
  await expect(page.getByTestId("story-views")).toContainText("Vues · 1");
  await expect(page.getByTestId("story-flames-count")).toBeVisible();
  await playing(page);
  await page.getByTestId("story-views").click();
  await expect(page.getByTestId("story-viewers")).toContainText("Lea_11", { timeout: 15_000 });
  await shot(page, "visionneuse-mes-vues");
  // Les vues sont pour moi seul : l'API refuse la liste à une autre personne.
  expect((await apiCall(lea, "GET", `/me/stories/${id}/viewers`)).status).toBe(404);
  await page.getByTestId("story-viewers-close").click();
  // Supprimer : confirmation, puis plus de story (retour au « + »).
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("story-more").click();
  await expect(page.getByTestId("story-menu-delete")).toBeVisible();
  await page.getByTestId("story-menu-delete").click();
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stories-mine-ring")).toHaveCount(0);
  await expect(page.getByTestId("stories-add")).toBeVisible();
  expect((await apiCall<{ stories: unknown[] }>(damien, "GET", "/me/stories")).data.stories).toHaveLength(0);

  // Une story expirée : la visionneuse le dit, sans rien montrer.
  const old = await publishStory(damien, { caption: "Déjà finie" });
  await sql("update stories set expires_at = now() - interval '1 minute' where id = $1", [old]);
  const damienId = await userIdOf("Damien_66");
  await go(page, `/story/${encodeURIComponent(`u:${damienId}`)}`);
  await expect(page.getByTestId("story-unavailable")).toContainText("Cette story n'est plus disponible", {
    timeout: 30_000,
  });
  await shot(page, "visionneuse-plus-disponible");
  await sql("delete from stories where id = $1", [old]);
  await ctx.close();
});

test("police agrandie (1,3) à 384 px : la barre et la visionneuse tiennent, noms jamais coupés", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const { ctx, page } = await open(browser, "damien@orasso.local", "sable", { scale: 1.3 });
  await go(page, "/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stories-ring-crew").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "barre-fil-sable-x13");
  await page.getByLabel(/Voir les stories de Kenji_66/).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await playing(page);
  await shot(page, "visionneuse-sable-x13");
  // Aucune scrolling horizontale de la page : l'écran ne déborde pas.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await ctx.close();
});
