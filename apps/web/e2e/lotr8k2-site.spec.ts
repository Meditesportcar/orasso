import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8k2, côté site (`/app/fil`, API et site lancés) : les commentaires d'une publication du Fil, mêmes parcours et mêmes mots que
// l'appli. La carte de Kenji_66 montre ses deux derniers commentaires ; flamme · commentaire · partager ; la feuille (dialogue, plein
// écran à 390 px) : réponses repliées, flamme d'un commentaire, « @ », envoi puis suppression ; « Non envoyé » et « Réessayer » avec le
// même `clientId` ; publication devenue invisible (404) ; signaler ; l'auteur coupe puis rouvre.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r8k2-captures/apres/recette-site`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function goFil(page: Page, email: string, width: number, theme: "beton" | "sable" = "beton") {
  await page.setViewportSize({ width, height: 900 });
  await setTheme(page, theme);
  await loginInBrowser(page, email, undefined, "/app/fil");
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
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

for (const width of [390, 1280]) {
  test(`la carte : flamme · commentaire · partager, deux derniers commentaires (${width} px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await goFil(page, "damien@orasso.local", width);
    const card = await commentedCard(page);
    await expect(card.getByTestId("feed-post-last-comment")).toHaveCount(2);
    const n = Number((await card.getByTestId("feed-post-comment-count").textContent()) ?? "0");
    expect(n).toBeGreaterThanOrEqual(6);
    await expect(card.getByTestId("feed-post-comments-open")).toHaveText(`Voir les ${n} commentaires`);
    const fire = await card.getByTestId("feed-post-fire").boundingBox();
    const cm = await card.getByTestId("feed-post-comment").boundingBox();
    const share = await card.getByTestId("feed-post-share").boundingBox();
    expect((fire?.x ?? 0) < (cm?.x ?? 0) && (cm?.x ?? 0) < (share?.x ?? 0)).toBe(true);
    await expect(card.getByRole("button", { name: "Commenter" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Partager" })).toBeVisible();
    await expect(card.getByTestId("feed-post-share")).toHaveText("");
    await card.getByTestId("feed-post-share").click();
    await expect(card.getByTestId("share-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    // Aucune ligne de commentaires hors des publications.
    await expect(
      page.locator(
        '[data-testid^="feed-card-"]:not([data-testid="feed-card-feed_post"]) [data-testid="feed-post-comment"]',
      ),
    ).toHaveCount(0);
    await shot(page, `carte-${width}`);
  });
}

for (const width of [390, 1280]) {
  test(`la feuille : réponses repliées, flamme, « Répondre », « @ », envoyer, supprimer (${width} px)`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await goFil(page, "damien@orasso.local", width);
    const card = await commentedCard(page);
    const before = Number((await card.getByTestId("feed-post-comment-count").textContent()) ?? "0");
    await card.getByTestId("feed-post-comments-open").click();
    await expect(page.getByTestId("feed-comments-sheet")).toBeVisible();
    await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before} commentaires`);
    await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
    if (width === 390) {
      // Plein écran à 390 px.
      const box = await page.getByTestId("feed-comments-sheet").boundingBox();
      expect(Math.round(box?.width ?? 0)).toBe(390);
    }
    await shot(page, `feuille-${width}`);
    const first = commentRow(page, "On se retrouve au port à 17 h 30 ?");
    await expect(first).toBeVisible();
    await expect(page.getByTestId("feed-comment-replies")).toHaveCount(0);
    const toggle = page.getByTestId("feed-comment-replies-toggle").first();
    await expect(toggle).toHaveText("Voir la réponse");
    await toggle.click();
    await expect(page.getByTestId("feed-comment-replies")).toContainText("@Kenji_66");
    await expect(page.getByTestId("feed-comment-replies").getByTestId("feed-comment-reply")).toHaveCount(0);
    await shot(page, `feuille-reponse-depliee-${width}`);
    await expect(toggle).toHaveText("Masquer");
    await toggle.click();
    await expect(page.getByTestId("feed-comment-replies")).toHaveCount(0);
    const nina = commentRow(page, "Hâte d'y être");
    const count = nina.getByTestId("feed-comment-fire-count");
    const base = Number((await count.textContent()) ?? "0");
    await nina.getByRole("button", { name: "Flamme sur le commentaire" }).click();
    await expect(count).toHaveText(String(base + 1));
    await nina.getByRole("button", { name: "Flamme sur le commentaire" }).click();
    await expect(count).toHaveText(String(base));
    await first.getByTestId("feed-comment-reply").click();
    await expect(page.getByTestId("feed-comment-replyto")).toContainText("Réponse à Lea_11");
    await expect(page.getByTestId("feed-comment-input")).toHaveValue("@Lea_11 ");
    await shot(page, `feuille-repondre-${width}`);
    await page.getByRole("button", { name: "Annuler la réponse" }).click();
    await expect(page.getByTestId("feed-comment-replyto")).toHaveCount(0);
    const input = page.getByTestId("feed-comment-input");
    await input.fill("");
    await input.pressSequentially("@Le", { delay: 90 });
    const suggestions = page.getByTestId("feed-mention-suggestions");
    await expect(suggestions).toBeVisible({ timeout: 15_000 });
    await expect(suggestions).toContainText("Lea_11");
    await shot(page, `feuille-arobase-${width}`);
    await page.getByTestId("feed-mention-suggestion").filter({ hasText: "Lea_11" }).first().click();
    await expect(input).toHaveValue("@Lea_11 ");
    await input.fill("");
    const text = `Recette R8k2 ${unique()}`;
    await input.fill(text);
    await page.getByTestId("feed-comment-send").click();
    await expect(commentRow(page, text)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("feed-comment-pending")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before + 1} commentaires`);
    const mine = commentRow(page, text);
    await mine.getByTestId("feed-comment-more").click();
    await expect(page.getByTestId("feed-comment-report")).toHaveCount(0);
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("feed-comment-delete").click();
    await expect(commentRow(page, text)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("feed-comments-title")).toHaveText(`${before} commentaires`);
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
    await page.getByTestId("feed-comments-close").click();
    await expect(card.getByTestId("feed-post-comment-count")).toHaveText(String(before));
  });
}

test("« Non envoyé » : le texte reste, « Réessayer » renvoie le même clientId", async ({ page }) => {
  test.setTimeout(240_000);
  await goFil(page, "damien@orasso.local", 390);
  const card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  const clientIds: string[] = [];
  let fail = true;
  await page.route(/\/api\/feed-posts\/[^/]+\/comments$/, async (route) => {
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
  await shot(page, "non-envoye-390");
  fail = false;
  await page.getByTestId("feed-comment-retry").click();
  await expect(page.getByTestId("feed-comment-pending")).toHaveCount(0, { timeout: 30_000 });
  await expect(commentRow(page, text)).toBeVisible();
  expect(clientIds).toHaveLength(2);
  expect(clientIds[0]).toBe(clientIds[1]);
  await expect(page.getByTestId("feed-comment").filter({ hasText: text })).toHaveCount(1);
  await commentRow(page, text).getByTestId("feed-comment-more").click();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("feed-comment-delete").click();
  await expect(commentRow(page, text)).toHaveCount(0, { timeout: 30_000 });
});

test("une publication devenue invisible (404) après une lecture réussie : commentaires vidés, feuille fermée, message bref", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await goFil(page, "damien@orasso.local", 390);
  const card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("feed-comment").first()).toBeVisible();
  await page.getByTestId("feed-comments-close").click();
  await page.route(/\/api\/feed-posts\/[^/]+\/comments(\?.*)?$/, (route) =>
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
});

test("un envoi en échec survit au changement de filtre : même clientId à la reprise, aucun doublon", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await goFil(page, "damien@orasso.local", 390);
  let card = await commentedCard(page);
  await card.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  const clientIds: string[] = [];
  let fail = true;
  await page.route(/\/api\/feed-posts\/[^/]+\/comments(\?.*)?$/, async (route) => {
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
});

test("un 404 de commentaire n'est pas une publication disparue : seule la ligne part, la feuille reste", async ({
  page,
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
  await goFil(page, "damien@orasso.local", 390);
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
  // Plus aucune requête de commentaires ou de réponses ensuite : pas de boucle réseau après la disparition du parent.
  let calls = 0;
  page.on("request", (r) => {
    if (/\/feed-(posts|comments)\/[^?]*(comments|replies)/.test(r.url())) calls += 1;
  });
  await page.waitForTimeout(1500);
  const settled = calls;
  await page.waitForTimeout(2500);
  expect(calls).toBe(settled);
  await expect(page.getByTestId("feed-comments-sheet")).toBeVisible();
  await expect(page.getByTestId("feed-post-gone")).toHaveCount(0);
  await expect(page.getByTestId("feed-comment-input")).toBeVisible();
});

test("un compte qui ne voit pas la publication n'obtient rien ; un autre compte signale un commentaire", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const marc = await login("marc@orasso.local");
  const theo = await login("theo@orasso.local");
  const mine = await apiCall<{ items: { id: string }[] }>(marc, "GET", "/me/feed-posts");
  const marcPost = mine.data.items[0]?.id;
  expect(marcPost).toBeTruthy();
  expect((await apiCall(theo, "GET", `/feed-posts/${marcPost}/comments`)).status).toBe(404);
  expect(
    (await apiCall(theo, "POST", `/feed-posts/${marcPost}/comments`, { text: "Salut", clientId: crypto.randomUUID() }))
      .status,
  ).toBe(404);
  await goFil(page, "theo@orasso.local", 390);
  const card = await commentedCard(page);
  await card.getByTestId("feed-post-comments-open").click();
  await expect(page.getByTestId("feed-comments-waiting")).toHaveCount(0, { timeout: 30_000 });
  const lea = commentRow(page, "On se retrouve au port à 17 h 30 ?");
  await lea.getByTestId("feed-comment-more").click();
  await expect(page.getByTestId("feed-comment-delete")).toHaveCount(0);
  await shot(page, "menu-commentaire-390");
  await page.getByTestId("feed-comment-report").getByTestId("report-open").click();
  await expect(page.getByTestId("report-dialog")).toBeVisible();
  await page.locator('[data-testid="report-dialog"] input[name="reason"][value="insult"]').check();
  await page.locator('[data-testid="report-dialog"] button[type="submit"]').click();
  await expect(page.getByTestId("report-done")).toBeVisible({ timeout: 30_000 });
});

test("l'auteur coupe puis rouvre les commentaires ; le bouton « Commenter » reste, les anciens restent lisibles", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible();
  await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  const caption = `Commentaires R8k2 ${unique()}`;
  await page.getByTestId("fil-publish-caption").fill(caption);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await page.goto("/app/fil");
  const mineCard = page.getByTestId("feed-card-feed_post").filter({ hasText: caption }).first();
  await expect(mineCard).toBeVisible({ timeout: 30_000 });
  const kenji = await login("kenji@orasso.local");
  const postId = (
    await apiCall<{ items: { id: string; caption: string }[] }>(kenji, "GET", "/me/feed-posts")
  ).data.items.find((p) => p.caption === caption)?.id;
  expect(postId).toBeTruthy();
  const lea = await login("lea@orasso.local");
  const old = `Ancien R8k2 ${unique()}`;
  expect(
    (await apiCall(lea, "POST", `/feed-posts/${postId}/comments`, { text: old, clientId: crypto.randomUUID() })).status,
  ).toBe(201);
  await mineCard.getByTestId("feed-post-comment").click();
  await expect(commentRow(page, old)).toBeVisible({ timeout: 30_000 });
  // L'auteur de la publication peut supprimer le commentaire d'un autre (pas le signaler comme le sien).
  await commentRow(page, old).getByTestId("feed-comment-more").click();
  await expect(page.getByTestId("feed-comment-delete")).toBeVisible();
  await commentRow(page, old).getByTestId("feed-comment-more").click();
  await page.getByTestId("feed-comments-menu").click();
  await shot(page, "menu-auteur-390");
  await page.getByTestId("feed-comments-toggle-off").click();
  await expect(page.getByTestId("feed-comments-off")).toHaveText("Les commentaires sont coupés.");
  await expect(page.getByTestId("feed-comment-input")).toHaveCount(0);
  await expect(commentRow(page, old)).toBeVisible();
  await shot(page, "commentaires-coupes-390");
  expect(
    (await apiCall(lea, "POST", `/feed-posts/${postId}/comments`, { text: "Trop tard", clientId: crypto.randomUUID() }))
      .status,
  ).toBe(409);
  await page.getByTestId("feed-comments-close").click();
  await expect(mineCard.getByRole("button", { name: "Commenter" })).toBeVisible();
  await mineCard.getByTestId("feed-post-comment").click();
  await expect(page.getByTestId("feed-comments-off")).toBeVisible();
  await page.getByTestId("feed-comments-menu").click();
  await page.getByTestId("feed-comments-toggle-off").click();
  await expect(page.getByTestId("feed-comment-input")).toBeVisible({ timeout: 30_000 });
  await apiCall(kenji, "DELETE", `/me/feed-posts/${postId}`);
});
