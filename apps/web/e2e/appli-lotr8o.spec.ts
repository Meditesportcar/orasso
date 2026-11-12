import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { portraitPhoto } from "./publications-helpers";
import { RELAIS } from "./relais";

// Lot R8o (maquette R8.13 `p-collab`), côté appli (version web compilée de recette, `APP_URL`) : « Publier avec… », la demande
// dans l'Activité, la double signature, les deux profils (« Avec … »), « Me retirer », le refus, le pro partenaire
// (« Collaboration commerciale »). Comptes du seed ; photos du seed. Kenji_66 publie, Damien_66 est invité.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8o-captures/apres/recette-appli`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
// Une légende propre à chaque passage : la recette se relance sans repartir d'une base neuve.
const RUN = Date.now().toString(36);
const CAPTION = `Sortie du matin avec Damien ${RUN}`;
const REFUSED = `Une invitation qui sera refusée ${RUN}`;
const REVISION = `Révision faite au port ${RUN}`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: "beton" | "sable" = "beton", width = 390, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t as string);
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

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string, height = 2400) {
  mkdirSync(DIR, { recursive: true });
  const width = page.viewportSize()?.width ?? 390;
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  await page.setViewportSize({ width, height: 900 });
}

async function addPhoto(page: Page, name = "car-golf-gti.jpg") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo(name)]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
}

/** Publie avec un co-auteur par l'API (comme le ferait l'écran) ; rend l'identifiant de la publication. */
async function publishWith(cookie: string, caption: string, coAuthor: { kind: string; id: string }): Promise<string> {
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new Blob([new Uint8Array(portraitPhoto([60, 90, 140]))], { type: "image/png" }), "photo.png");
  const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
  const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const up = await fetch(`${API}/api/me/uploads`, { method: "POST", headers: { origin: WEB, cookie }, body: form });
  const { key } = (await up.json()) as { key: string };
  const res = await apiCall<{ id: string }>(cookie, "POST", "/me/feed-posts", {
    caption,
    aspect: "portrait_4_5",
    clientId: crypto.randomUUID(),
    photos: [{ uploadKey: key, noPlateConfirmed: true }],
    coAuthor,
  });
  if (res.status !== 201) throw new Error(`publication : ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.id;
}

const me = async (cookie: string) => (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data.user.id;
const count = async (cookie: string, pseudo: string) =>
  (await apiCall<{ publications?: { count: number } | null }>(cookie, "GET", `/users/${pseudo}`)).data.publications
    ?.count ?? 0;

test("Kenji publie avec Damien : rien chez Damien, la demande, l'acceptation, la carte signée, les deux profils, « Me retirer »", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const damienCookie = await login("damien@orasso.local");
  const before = await count(damienCookie, "Damien_66");

  // 1. Kenji : « Publier avec… » (la ligne, la recherche, le choix, le bandeau), puis l'envoi.
  const k = await open(browser, "kenji@orasso.local");
  await go(k.page, "/fil/publier");
  await expect(k.page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  await expect(k.page.getByTestId("coauthor-toggle")).toContainText("Publier avec…");
  await expect(k.page.getByTestId("coauthor-sub")).toHaveText(
    "Inviter un co-auteur : une personne, une structure, un pro, un média.",
  );
  await addPhoto(k.page);
  await k.page.getByTestId("fil-publish-caption").fill(CAPTION);
  await k.page.getByTestId("coauthor-toggle").click();
  await expect(k.page.getByTestId("coauthor-picker")).toBeVisible();
  // Moins de deux lettres : rien. Puis le nom : Damien_66 apparaît ; un compte privé non suivi jamais (Marc_66).
  await k.page.getByTestId("coauthor-input").fill("D");
  await expect(k.page.getByTestId("coauthor-result")).toHaveCount(0);
  await k.page.getByTestId("coauthor-input").fill("Damien");
  await expect(k.page.getByTestId("coauthor-result").first()).toContainText("Damien_66", { timeout: 20_000 });
  await shot(k.page, "pub-recherche");
  await k.page.getByTestId("coauthor-result").first().click();
  await expect(k.page.getByTestId("coauthor-sub")).toHaveText(
    "Damien_66 · invité : tant qu'il n'a pas accepté, la publication est seulement chez toi.",
  );
  await expect(k.page.getByTestId("coauthor-banner")).toContainText("Tant que Damien_66 n'a pas accepté,");
  await expect(k.page.getByTestId("coauthor-banner")).toContainText("seul toi la supprimes");
  await shot(k.page, "pub-choisi");
  await k.page.getByTestId("fil-publish-send").click();
  await expect(k.page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await expect(k.page.getByTestId("fil-publish-invited")).toHaveText(
    "Invitation envoyée à Damien_66 ; publié chez toi en attendant",
  );
  await shot(k.page, "pub-envoye");

  // 2. En attente : rien chez Damien (compteur, liste), mais la demande est dans son Activité.
  expect(await count(damienCookie, "Damien_66")).toBe(before);
  const kenjiCookie = await login("kenji@orasso.local");
  const mine = await apiCall<{ items: { id: string; caption: string }[] }>(kenjiCookie, "GET", "/me/feed-posts");
  const post = mine.data.items.find((p) => p.caption === CAPTION);
  expect(post).toBeDefined();
  const d = await open(browser, "damien@orasso.local");
  await go(d.page, "/activite/demandes");
  const request = d.page.getByTestId("request-coauthor").filter({ hasText: CAPTION });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await expect(request).toContainText("Kenji_66 te propose de publier avec lui");
  await expect(request.getByTestId("request-coauthor-caption")).toHaveText(CAPTION);
  await shot(d.page, "dem");

  // 3. Il accepte : la confirmation de la maquette, puis la demande part de la liste.
  await request.getByRole("button", { name: "Accepter" }).click();
  await expect(d.page.getByTestId("request-coauthor-confirm")).toHaveText(
    "Acceptée : elle apparaît sur vos deux profils, signée des deux",
  );
  await expect(d.page.getByTestId("request-coauthor").filter({ hasText: CAPTION })).toHaveCount(0, {
    timeout: 15_000,
  });
  expect(await count(damienCookie, "Damien_66")).toBe(before + 1);

  // 4. La carte du Fil est signée des deux, une seule fois ; « Collaboration · il y a … ».
  await go(d.page, "/fil");
  await d.page.getByTestId("fil-filters-following").click();
  await expect(d.page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  const card = d.page.getByTestId("feed-card-feed_post").filter({ hasText: CAPTION });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card.getByTestId("feed-card-signature")).toHaveText("Kenji_66 et Damien_66");
  await expect(card.getByTestId("feed-card-reason")).toHaveText(/^Collaboration · /);
  await shot(d.page, "fil");

  // 5. Les deux profils : l'étiquette « Avec … » sur la vignette.
  await go(d.page, "/profil");
  await expect(d.page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  await expect(d.page.getByTestId("publication-tile-with").filter({ hasText: "Avec Kenji_66" })).toHaveCount(1);
  await shot(d.page, "prof-damien");
  await go(k.page, "/profil");
  await expect(k.page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  await expect(k.page.getByTestId("publication-tile-with").filter({ hasText: "Avec Damien_66" })).toHaveCount(1);
  await shot(k.page, "prof-kenji");

  // 6. « Me retirer de la publication » (confirmé) : elle reste chez Kenji_66, qui seul la supprime.
  await go(d.page, `/publication/${post?.id}`);
  await expect(d.page.getByTestId("feed-card-feed_post")).toBeVisible({ timeout: 30_000 });
  await d.page.getByTestId("feed-card-more").click();
  await expect(d.page.getByTestId("publication-menu-remove")).toHaveCount(0);
  await expect(d.page.getByTestId("publication-menu-withdraw")).toContainText("Me retirer de la publication");
  await shot(d.page, "ret");
  d.page.once("dialog", (dialog) => void dialog.accept());
  await d.page.getByTestId("publication-menu-withdraw").click();
  await expect(d.page.getByTestId("publication-menu-done")).toHaveText(
    "Tu n'es plus co-auteur : elle reste chez Kenji_66",
  );
  expect(await count(damienCookie, "Damien_66")).toBe(before);
  const afterWithdraw = await apiCall<{ coAuthor: unknown; coAuthorInvite: { status: string } | null }>(
    kenjiCookie,
    "GET",
    `/feed-posts/${post?.id}`,
  );
  expect(afterWithdraw.data.coAuthor).toBeNull();
  expect(afterWithdraw.data.coAuthorInvite?.status).toBe("withdrawn");
  // Il ne supprime pas : l'API répond 404 à Damien.
  expect((await apiCall(damienCookie, "DELETE", `/me/feed-posts/${post?.id}`)).status).toBe(404);
  await d.ctx.close();
  await k.ctx.close();
});

test("un refus laisse la publication chez son auteur, qui le lit sur sa publication", async ({ browser }) => {
  test.setTimeout(240_000);
  const kenjiCookie = await login("kenji@orasso.local");
  const damienId = await me(await login("damien@orasso.local"));
  const id = await publishWith(kenjiCookie, REFUSED, { kind: "user", id: damienId });
  const d = await open(browser, "damien@orasso.local");
  await go(d.page, "/activite/demandes");
  const request = d.page.getByTestId("request-coauthor").filter({ hasText: REFUSED });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await request.getByRole("button", { name: "Refuser" }).click();
  await expect(d.page.getByTestId("request-coauthor-confirm")).toHaveText("Refusée : Kenji_66 garde sa publication");
  await d.ctx.close();
  const k = await open(browser, "kenji@orasso.local");
  await go(k.page, `/publication/${id}`);
  await expect(k.page.getByTestId("feed-card-invite")).toHaveText("Invitation refusée", { timeout: 30_000 });
  await expect(k.page.getByTestId("feed-card-signature")).toHaveCount(0);
  await k.ctx.close();
});

test("un pro partenaire : la phrase de la mention, puis « Collaboration commerciale » sur la publication, tout de suite", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const k = await open(browser, "kenji@orasso.local");
  await go(k.page, "/fil/publier");
  await expect(k.page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  await addPhoto(k.page, "car-gtr.jpg");
  await k.page.getByTestId("fil-publish-caption").fill(REVISION);
  await k.page.getByTestId("coauthor-toggle").click();
  await k.page.getByRole("radio", { name: "Un pro", exact: true }).click();
  await k.page.getByTestId("coauthor-input").fill("Garage");
  await expect(k.page.getByTestId("coauthor-result").first()).toContainText("Pro partenaire", { timeout: 20_000 });
  await k.page.getByTestId("coauthor-result").first().click();
  await expect(k.page.getByTestId("coauthor-sub")).toContainText("pro partenaire · invité");
  await expect(
    k.page.getByText("est un pro partenaire : la mention « Collaboration commerciale » s'applique"),
  ).toBeVisible();
  await shot(k.page, "pub-pro");
  await k.page.getByTestId("fil-publish-send").click();
  await expect(k.page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  const kenjiCookie = await login("kenji@orasso.local");
  const mine = await apiCall<{ items: { id: string; caption: string }[] }>(kenjiCookie, "GET", "/me/feed-posts");
  const post = mine.data.items.find((p) => p.caption === REVISION);
  await go(k.page, `/publication/${post?.id}`);
  await expect(k.page.getByTestId("feed-post-commercial")).toBeVisible({ timeout: 30_000 });
  await expect(k.page.getByTestId("feed-post-commercial")).toContainText("Collaboration commerciale");
  await k.ctx.close();
});

test("l'invitation de l'Activité : une page que Damien gère reçoit sa demande (MéditeSportCar), « avec <page> »", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const d = await open(browser, "damien@orasso.local");
  await go(d.page, "/activite/demandes");
  const request = d.page.getByTestId("request-coauthor").filter({ hasText: "avec MéditeSportCar" });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await expect(request).toContainText("Kenji_66 te propose de publier avec MéditeSportCar");
  await d.ctx.close();
});

test("sans recharger : accepter met la publication sur mon onglet « Publications » au retour ; « Me retirer » puis retour la retire", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const kenjiCookie = await login("kenji@orasso.local");
  const damienCookie = await login("damien@orasso.local");
  const damienId = await me(damienCookie);
  const caption = `Navigation sans rechargement ${RUN}`;
  const id = await publishWith(kenjiCookie, caption, { kind: "user", id: damienId });
  const d = await open(browser, "damien@orasso.local");
  await go(d.page, "/profil");
  await expect(d.page.getByTestId("publications-grid").or(d.page.getByTestId("publications-empty"))).toBeVisible({
    timeout: 30_000,
  });
  const withKenji = d.page.getByTestId("publication-tile-with").filter({ hasText: "Avec Kenji_66" });
  const before = await withKenji.count();
  // Navigation dans l'appli (aucun rechargement) : l'Activité, les Demandes, « Accepter », puis retour au profil.
  await d.page.getByText("Accueil", { exact: true }).last().click();
  await d.page
    .getByRole("button", { name: /^Activité/ })
    .first()
    .click();
  await d.page
    .getByRole("link", { name: /Demandes/ })
    .first()
    .click();
  const request = d.page.getByTestId("request-coauthor").filter({ hasText: caption });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await request.getByRole("button", { name: "Accepter" }).click();
  await expect(d.page.getByTestId("request-coauthor-confirm")).toBeVisible();
  await d.page.goBack();
  await d.page.goBack();
  await d.page.getByText("Profil", { exact: true }).last().click();
  await expect(d.page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  await expect(withKenji).toHaveCount(before + 1, { timeout: 30_000 });
  // « Me retirer » puis retour immédiat : elle n'est plus sur mon profil.
  await d.page.getByTestId("publication-tile-open").first().click();
  await expect(d.page.getByTestId("feed-card-feed_post")).toBeVisible({ timeout: 30_000 });
  await d.page.getByTestId("feed-card-more").click();
  d.page.once("dialog", (dialog) => void dialog.accept());
  await d.page.getByTestId("publication-menu-withdraw").click();
  await expect(d.page.getByTestId("publication-menu-done")).toBeVisible();
  await d.page.goBack();
  await expect(d.page.getByTestId("publications-grid").or(d.page.getByTestId("publications-empty"))).toBeVisible({
    timeout: 30_000,
  });
  await expect(withKenji).toHaveCount(before, { timeout: 30_000 });
  expect(id).toBeTruthy();
  await d.ctx.close();
});

test("une seule invitation à publier : la ligne « Demandes · 1 » de l'Activité se montre et ouvre l'invitation", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const pseudo = `Solo_${unique()}`;
  const cookie = await signUpApi(pseudo);
  const soloId = await me(cookie);
  await publishWith(await login("kenji@orasso.local"), `Invitation seule ${RUN}`, { kind: "user", id: soloId });
  const s = await open(browser, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(s.page, "/activite");
  const row = s.page.getByTestId("activity-requests-row");
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("Demandes · 1");
  await row.click();
  await expect(s.page.getByTestId("request-coauthor")).toHaveCount(1, { timeout: 30_000 });
  await s.ctx.close();
});
