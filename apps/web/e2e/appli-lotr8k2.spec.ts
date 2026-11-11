import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8k2, côté appli (version web compilée de recette, `APP_URL`) : les commentaires d'une publication du Fil. La carte de
// Kenji_66 montre ses deux derniers commentaires et « Voir les N commentaires » ; la ligne d'actions est flamme · commentaire ·
// partager ; la feuille (réponses repliées, flamme d'un commentaire, « @ », envoi, suppression) ; « Non envoyé » et « Réessayer »
// avec le même `clientId` ; une publication devenue invisible (404) ; signaler ; l'auteur coupe puis rouvre ; une carte qui n'est
// pas une publication n'a pas de bouton « Commenter ». Les mots sont ceux de la maquette R8.3.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8k2-captures/apres/recette-appli`;
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

async function goFil(page: Page) {
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** La carte de la publication commentée de Kenji_66 (celle qui montre ses derniers commentaires). */
async function commentedCard(page: Page): Promise<Locator> {
  const cards = page.getByTestId("feed-card-feed_post").filter({ has: page.getByTestId("feed-post-last-comments") });
  for (let i = 0; i < 14 && (await cards.count()) === 0; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
  }
  const card = cards.first();
  await card.scrollIntoViewIfNeeded();
  return card;
}

const commentRow = (page: Page, text: string) => page.getByTestId("feed-comment").filter({ hasText: text }).first();

test("la carte : flamme · commentaire · partager, deux derniers commentaires, « Voir les N commentaires »", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await goFil(page);
  const card = await commentedCard(page);
  await expect(card.getByTestId("feed-post-last-comment")).toHaveCount(2);
  await expect(card.getByTestId("feed-post-comments-open")).toHaveText(/Voir les \d+ commentaires/);
  // Le nombre de la carte est celui du lien.
  const n = Number((await card.getByTestId("feed-post-comment-count").textContent()) ?? "0");
  expect(n).toBeGreaterThanOrEqual(6);
  await expect(card.getByTestId("feed-post-comments-open")).toHaveText(`Voir les ${n} commentaires`);
  // Ordre : flamme, commentaire, partager ; libellés accessibles « Commenter » et « Partager » ; partager sans texte.
  const fire = await card.getByTestId("feed-post-fire").boundingBox();
  const cm = await card.getByTestId("feed-post-comment").boundingBox();
  const share = await card.getByTestId("feed-post-share").boundingBox();
  expect(fire && cm && share).toBeTruthy();
  expect((fire?.x ?? 0) < (cm?.x ?? 0) && (cm?.x ?? 0) < (share?.x ?? 0)).toBe(true);
  await expect(card.getByRole("button", { name: "Commenter" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Partager" })).toBeVisible();
  await expect(card.getByTestId("feed-post-share")).toHaveText("");
  // Le partage garde son comportement : il ouvre « En story / En message / Vers l'extérieur ».
  await card.getByTestId("feed-post-share").click();
  await expect(page.getByText("Vers l'extérieur").first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.reload();
  await afterOpening(page);
  // Aucune ligne de commentaires hors des publications (événement, voiture, « Sponsorisé »…).
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator(
      '[data-testid^="feed-card-"]:not([data-testid="feed-card-feed_post"]) [data-testid="feed-post-comment"]',
    ),
  ).toHaveCount(0);
  await expect(page.locator('[data-testid="feed-card-sponsored"] [data-testid="feed-post-comments-open"]')).toHaveCount(
    0,
  );
  await ctx.close();
});

test("la feuille : réponses repliées, flamme d'un commentaire, « Répondre », « @ », envoyer puis supprimer", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await goFil(page);
  const card = await commentedCard(page);
  const before = Number((await card.getByTestId("feed-post-comment-count").textContent()) ?? "0");
  await card.getByTestId("feed-post-comments-open").click();
  const sheet = page.getByTestId("feed-comments-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before} commentaires`);
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  await shot(page, "feuille");
  const first = commentRow(page, "On se retrouve au port à 17 h 30 ?");
  await expect(first).toBeVisible();
  // Réponses repliées par défaut ; « Voir la réponse » les déplie, « Masquer » les replie.
  await expect(page.getByTestId("feed-comment-replies")).toHaveCount(0);
  const toggle = page.getByTestId("feed-comment-replies-toggle").first();
  await expect(toggle).toHaveText("Voir la réponse");
  await toggle.click();
  await expect(page.getByTestId("feed-comment-replies")).toContainText("@Kenji_66");
  // Une réponse n'a pas de bouton « Répondre ».
  await expect(page.getByTestId("feed-comment-replies").getByTestId("feed-comment-reply")).toHaveCount(0);
  await shot(page, "feuille-reponse-depliee");
  await expect(toggle).toHaveText("Masquer");
  await toggle.click();
  await expect(page.getByTestId("feed-comment-replies")).toHaveCount(0);
  // La flamme d'un commentaire (libellé « Flamme sur le commentaire ») : +1 puis -1.
  const nina = commentRow(page, "Hâte d'y être");
  const count = nina.getByTestId("feed-comment-fire-count");
  const base = Number((await count.textContent()) ?? "0");
  await nina.getByRole("button", { name: "Flamme sur le commentaire" }).click();
  await expect(count).toHaveText(String(base + 1));
  await nina.getByRole("button", { name: "Flamme sur le commentaire" }).click();
  await expect(count).toHaveText(String(base));
  // « Répondre » : bandeau « Réponse à <pseudo> », champ prérempli de « @<pseudo> », « Annuler la réponse ».
  await first.getByTestId("feed-comment-reply").click();
  await expect(page.getByTestId("feed-comment-replyto")).toContainText("Réponse à Lea_11");
  await expect(page.getByTestId("feed-comment-input")).toHaveValue("@Lea_11 ");
  await expect(page.getByTestId("feed-comment-input")).toHaveAttribute("placeholder", "Ta réponse (300 caractères)");
  await shot(page, "feuille-repondre");
  await page.getByRole("button", { name: "Annuler la réponse" }).click();
  await expect(page.getByTestId("feed-comment-replyto")).toHaveCount(0);
  await expect(page.getByTestId("feed-comment-input")).toHaveAttribute(
    "placeholder",
    "Un commentaire (300 caractères)",
  );
  // « @Le » propose des pseudos avec leur raison ; toucher insère « @pseudo ».
  const input = page.getByTestId("feed-comment-input");
  await input.fill("");
  await input.pressSequentially("@Le", { delay: 90 });
  const suggestions = page.getByTestId("feed-mention-suggestions");
  await expect(suggestions).toBeVisible({ timeout: 15_000 });
  await expect(suggestions).toContainText("Lea_11");
  await expect(suggestions).toContainText(/dans la conversation|tu suis ce compte|te suit|inscrit à l'événement/);
  await shot(page, "feuille-arobase");
  await page.getByTestId("feed-mention-suggestion").filter({ hasText: "Lea_11" }).first().click();
  await expect(input).toHaveValue("@Lea_11 ");
  await input.fill("");
  // Un commentaire : la ligne apparaît, la carte compte un de plus ; puis réponse à Lea_11 ; puis suppression des deux.
  const text = `Recette R8k2 ${unique()}`;
  await input.fill(text);
  await page.getByTestId("feed-comment-send").click();
  await expect(commentRow(page, text)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("feed-comment-pending")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before + 1} commentaires`);
  const mine = commentRow(page, text);
  await mine.getByTestId("feed-comment-more").click();
  await expect(page.getByTestId("feed-comment-report")).toHaveCount(0); // son propre commentaire : pas de « Signaler »
  await shot(page, "menu-commentaire");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("feed-comment-delete").click();
  await expect(commentRow(page, text)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before} commentaires`);
  // Une réponse : le compteur de la carte monte, puis redescend à la suppression.
  await first.getByTestId("feed-comment-reply").click();
  const reply = `Réponse R8k2 ${unique()}`;
  await input.fill(`@Lea_11 ${reply}`);
  await page.getByTestId("feed-comment-send").click();
  await expect(page.getByTestId("feed-comment-replies")).toContainText(reply, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before + 1} commentaires`);
  const replyRow = page.getByTestId("feed-comment-replies").getByTestId("feed-comment").filter({ hasText: reply });
  await replyRow.getByTestId("feed-comment-more").click();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("feed-comment-delete").click();
  await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before} commentaires`, { timeout: 30_000 });
  // La carte, derrière la feuille, tient le même compte.
  await page.getByTestId("feed-comments-close").click();
  await expect(card.getByTestId("feed-post-comment-count")).toHaveText(String(before));
  await ctx.close();
});

test("« Non envoyé » : le texte reste, « Réessayer » renvoie le même clientId", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await goFil(page);
  const card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  const clientIds: string[] = [];
  let fail = true;
  await page.route(/\/feed-posts\/[^/]+\/comments$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    clientIds.push((route.request().postDataJSON() as { clientId: string }).clientId);
    if (fail) return route.abort("failed");
    return route.continue();
  });
  const text = `Hors ligne R8k2 ${unique()}`;
  await page.getByTestId("feed-comment-input").fill(text);
  await page.getByTestId("feed-comment-send").click();
  await expect(page.getByTestId("feed-comment-notsent")).toHaveText("Non envoyé", { timeout: 30_000 });
  await expect(page.getByTestId("feed-comment-pending")).toContainText(text);
  await shot(page, "non-envoye");
  fail = false;
  await page.getByTestId("feed-comment-retry").click();
  await expect(page.getByTestId("feed-comment-pending")).toHaveCount(0, { timeout: 30_000 });
  await expect(commentRow(page, text)).toBeVisible();
  expect(clientIds).toHaveLength(2);
  expect(clientIds[0]).toBe(clientIds[1]);
  // Rien en double : le commentaire n'existe qu'une fois.
  await expect(page.getByTestId("feed-comment").filter({ hasText: text })).toHaveCount(1);
  await commentRow(page, text).getByTestId("feed-comment-more").click();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("feed-comment-delete").click();
  await expect(commentRow(page, text)).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("une publication devenue invisible (404) après une lecture réussie : commentaires vidés, feuille fermée, message bref", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await goFil(page);
  const card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comment").first()).toBeVisible();
  await page.getByTestId("feed-comments-close").click();
  await page.route(/\/feed-posts\/[^/]+\/comments(\?.*)?$/, (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_found", message: "Publication introuvable" } }),
    }),
  );
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-post-gone")).toHaveText("Cette publication n'est plus disponible.", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("feed-comments-sheet")).toBeHidden();
  await expect(page.getByTestId("feed-comment")).toHaveCount(0);
  await expect(page.getByTestId("feed-post-last-comments")).toHaveCount(0);
  await ctx.close();
});

test("un envoi en échec survit au changement de filtre : même clientId à la reprise, aucun doublon", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await goFil(page);
  let card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  const clientIds: string[] = [];
  let fail = true;
  await page.route(/\/feed-posts\/[^/]+\/comments(\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    clientIds.push((route.request().postDataJSON() as { clientId: string }).clientId);
    if (fail) return route.abort("failed");
    return route.continue();
  });
  const text = `Filtre R8k2 ${unique()}`;
  await page.getByTestId("feed-comment-input").fill(`${text} brouillon`);
  await page.getByTestId("feed-comment-send").click();
  await expect(page.getByTestId("feed-comment-notsent")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("feed-comment-input").fill("suite du brouillon");
  await page.getByTestId("feed-comments-close").click();
  // Changer de filtre démonte les cartes : l'envoi en échec et le brouillon restent (par compte et par publication).
  await page.getByTestId("fil-filters-nearby").click();
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comment-pending")).toContainText(text, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comment-input")).toHaveValue("suite du brouillon");
  fail = false;
  await page.getByTestId("feed-comment-retry").click();
  await expect(page.getByTestId("feed-comment-pending")).toHaveCount(0, { timeout: 30_000 });
  expect(clientIds).toHaveLength(2);
  expect(clientIds[0]).toBe(clientIds[1]);
  await expect(page.getByTestId("feed-comment").filter({ hasText: text })).toHaveCount(1);
  await commentRow(page, text).getByTestId("feed-comment-more").click();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("feed-comment-delete").click();
  await expect(commentRow(page, text)).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("un 404 de commentaire n'est pas une publication disparue : seule la ligne part, la feuille reste", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const lea = await login("lea@orasso.local");
  const damien = await login("damien@orasso.local");
  const fil = await apiCall<{ items: { kind: string; payload: { post: { id: string; commentsCount: number } } }[] }>(
    damien,
    "GET",
    "/fil?filter=for_you",
  );
  const postId = fil.data.items.find((c) => c.kind === "feed_post" && c.payload.post.commentsCount > 3)?.payload.post
    .id;
  expect(postId).toBeTruthy();
  const make = async (cookie: string, text: string, parentId?: string) => {
    const r = await apiCall<{ id: string }>(cookie, "POST", `/feed-posts/${postId}/comments`, {
      text,
      parentId,
      clientId: crypto.randomUUID(),
    });
    expect(r.status).toBe(201);
    return r.data.id;
  };
  const stamp = unique();
  const parentP = await make(lea, `Parent P ${stamp}`);
  const parentC = await make(lea, `Parent C ${stamp}`);
  await make(lea, `Réponse de C ${stamp}`, parentC);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await goFil(page);
  const card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  const loadAll = async () => {
    for (let n = 0; n < 10 && (await page.getByTestId("feed-comments-more").count()) > 0; n++)
      await page.getByTestId("feed-comments-more").click();
  };
  await loadAll();
  await expect(commentRow(page, `Parent P ${stamp}`)).toBeVisible({ timeout: 30_000 });
  // 1. Supprimer un commentaire déjà retiré : seule la ligne part.
  const mine = `À moi ${stamp}`;
  await page.getByTestId("feed-comment-input").fill(mine);
  await page.getByTestId("feed-comment-send").click();
  await expect(commentRow(page, mine)).toBeVisible({ timeout: 30_000 });
  await commentRow(page, mine).getByTestId("feed-comment-more").click();
  // Le retrait par un autre chemin (API) arrive avant la confirmation.
  const list = await apiCall<{ items: { id: string; text: string }[]; nextCursor: string | null }>(
    damien,
    "GET",
    `/feed-posts/${postId}/comments`,
  );
  let found = list.data.items.find((c) => c.text === mine)?.id;
  let cursor = list.data.nextCursor;
  while (!found && cursor) {
    const more = await apiCall<{ items: { id: string; text: string }[]; nextCursor: string | null }>(
      damien,
      "GET",
      `/feed-posts/${postId}/comments?cursor=${encodeURIComponent(cursor)}`,
    );
    found = more.data.items.find((c) => c.text === mine)?.id;
    cursor = more.data.nextCursor;
  }
  expect(found).toBeTruthy();
  await apiCall(damien, "DELETE", `/feed-comments/${found}`);
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("feed-comment-delete").click();
  await expect(commentRow(page, mine)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comments-sheet")).toBeVisible();
  await expect(page.getByTestId("feed-post-gone")).toHaveCount(0);
  // 2. Répondre à un commentaire que son auteur vient de supprimer : message bref, le texte reste, la feuille aussi.
  await commentRow(page, `Parent P ${stamp}`).getByTestId("feed-comment-reply").click();
  await apiCall(lea, "DELETE", `/feed-comments/${parentP}`);
  const reply = `Réponse perdue ${stamp}`;
  await page.getByTestId("feed-comment-input").fill(`@Lea_11 ${reply}`);
  await page.getByTestId("feed-comment-send").click();
  await expect(page.getByTestId("feed-comment-pending")).toContainText(reply, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comment-notsent")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("feed-comments-sheet")).toBeVisible();
  await expect(page.getByTestId("feed-post-gone")).toHaveCount(0);
  // 3. Déplier les réponses d'un parent supprimé : la ligne part, jamais « plus disponible ».
  const rowC = commentRow(page, `Parent C ${stamp}`);
  await expect(rowC).toBeVisible();
  await apiCall(lea, "DELETE", `/feed-comments/${parentC}`);
  await page.getByTestId("feed-comment-replies-toggle").last().click();
  await expect(commentRow(page, `Parent C ${stamp}`)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comments-sheet")).toBeVisible();
  await expect(page.getByTestId("feed-post-gone")).toHaveCount(0);
  await expect(page.getByTestId("feed-comment-input")).toBeVisible();
  await ctx.close();
});

test("un compte qui ne voit pas la publication n'obtient rien ; un autre compte signale un commentaire", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // Par l'API : la publication d'un compte privé n'est pas lisible par qui ne la voit pas (404, rien de révélé).
  const marc = await login("marc@orasso.local");
  const theo = await login("theo@orasso.local"); // demande en attente chez Marc_66 (compte privé)
  const mine = await apiCall<{ items: { id: string }[] }>(marc, "GET", "/me/feed-posts");
  const marcPost = mine.data.items[0]?.id;
  expect(marcPost).toBeTruthy();
  expect((await apiCall(theo, "GET", `/feed-posts/${marcPost}/comments`)).status).toBe(404);
  expect(
    (await apiCall(theo, "POST", `/feed-posts/${marcPost}/comments`, { text: "Salut", clientId: crypto.randomUUID() }))
      .status,
  ).toBe(404);
  // Theo signale un commentaire de Lea_11 : la feuille de signalement existante, cible « commentaire du Fil ».
  const { ctx, page } = await open(browser, "theo@orasso.local");
  await goFil(page);
  const card = await commentedCard(page);
  await card.getByTestId("feed-post-comments-open").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  const lea = commentRow(page, "On se retrouve au port à 17 h 30 ?");
  await lea.getByTestId("feed-comment-more").click();
  await expect(page.getByTestId("feed-comment-delete")).toHaveCount(0); // ni l'auteur du commentaire ni de la publication
  await page.getByTestId("feed-comment-report").click();
  await page.getByTestId("report-reason-insult").click();
  await page.getByTestId("report-send").click();
  await expect(page.getByTestId("report-done")).toBeVisible({ timeout: 30_000 });
  await shot(page, "signaler");
  await ctx.close();
});

test("l'auteur coupe puis rouvre les commentaires ; le bouton « Commenter » reste, les anciens restent lisibles", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("fil-publish-open").click();
  await page.getByTestId("fil-publish-choose-post").click();
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  const caption = `Commentaires R8k2 ${unique()}`;
  await page.getByTestId("fil-publish-caption").fill(caption);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("fil-publish-back").click();
  await page.getByTestId("fil-filters-following").click();
  const mineCard = page.getByTestId("feed-card-feed_post").filter({ hasText: caption }).first();
  await expect(mineCard).toBeVisible({ timeout: 30_000 });
  // Un commentaire d'une autre personne, par l'API, pour avoir un ancien à relire.
  const postId = (
    await apiCall<{ items: { id: string; caption: string }[] }>(
      await login("kenji@orasso.local"),
      "GET",
      "/me/feed-posts",
    )
  ).data.items.find((p) => p.caption === caption)?.id;
  expect(postId).toBeTruthy();
  const lea = await login("lea@orasso.local");
  const old = `Ancien R8k2 ${unique()}`;
  expect(
    (await apiCall(lea, "POST", `/feed-posts/${postId}/comments`, { text: old, clientId: crypto.randomUUID() })).status,
  ).toBe(201);
  await mineCard.getByTestId("feed-post-comment").click();
  await expect(commentRow(page, old)).toBeVisible({ timeout: 30_000 });
  // L'auteur peut supprimer n'importe quel commentaire (pas signaler le sien).
  await commentRow(page, old).getByTestId("feed-comment-more").click();
  await expect(page.getByTestId("feed-comment-delete")).toBeVisible();
  await page.getByTestId("feed-comment-menu-close").click();
  // « … » de la feuille : « Couper les commentaires ».
  await page.getByTestId("feed-comments-menu").click();
  await shot(page, "menu-auteur");
  await page.getByTestId("feed-comments-toggle-off").click();
  await expect(page.getByTestId("feed-comments-off")).toHaveText("Les commentaires sont coupés.");
  await expect(page.getByTestId("feed-comment-input")).toHaveCount(0);
  await shot(page, "commentaires-coupes");
  // Un autre compte ne peut plus commenter (409) ; les anciens restent lisibles.
  expect(
    (await apiCall(lea, "POST", `/feed-posts/${postId}/comments`, { text: "Trop tard", clientId: crypto.randomUUID() }))
      .status,
  ).toBe(409);
  expect((await apiCall(lea, "GET", `/feed-posts/${postId}/comments`)).status).toBe(200);
  // Le bouton « Commenter » reste, et ouvre la lecture.
  await page.getByTestId("feed-comments-close").click();
  await expect(mineCard.getByRole("button", { name: "Commenter" })).toBeVisible();
  await mineCard.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-off")).toBeVisible();
  // Rouvrir.
  await page.getByTestId("feed-comments-menu").click();
  await page.getByTestId("feed-comments-toggle-off").click();
  await expect(page.getByTestId("feed-comment-input")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("feed-comments-off")).toHaveCount(0);
  await apiCall(await login("kenji@orasso.local"), "DELETE", `/me/feed-posts/${postId}`);
  await ctx.close();
});
