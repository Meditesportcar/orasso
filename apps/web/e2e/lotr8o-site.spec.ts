import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8o (maquette R8.13 `p-collab`), côté site (API et site lancés) : mêmes blocs, mêmes mots, mêmes règles que l'appli. Kenji_66
// publie avec Damien_66 ; rien chez Damien tant qu'il n'a pas accepté ; la demande, l'acceptation, la carte signée des deux, les
// deux profils (« Avec … »), « Me retirer » ; un refus ; un pro partenaire. Comptes et photos du seed.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r8o-captures/apres/recette-site`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
// Une légende propre à chaque passage : la recette se relance sans repartir d'une base neuve.
const RUN = Date.now().toString(36);
const CAPTION = `Sortie du matin avec Damien (site) ${RUN}`;
const REFUSED = `Une invitation qui sera refusée (site) ${RUN}`;
const REVISION = `Révision faite au port (site) ${RUN}`;
test.use({ viewport: { width: 1280, height: 900 } });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function openAs(page: Page, email: string, retour = "/app/fil/publier") {
  await setTheme(page, "beton");
  await loginInBrowser(page, email, undefined, retour);
}

async function addPhoto(page: Page, name = "car-golf-gti.jpg") {
  await page.getByTestId("fil-publish-file").setInputFiles([photo(name)]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
}

const count = async (cookie: string, pseudo: string) =>
  (await apiCall<{ publications?: { count: number } | null }>(cookie, "GET", `/users/${pseudo}`)).data.publications
    ?.count ?? 0;

test("Kenji publie avec Damien : rien chez Damien, la demande, l'acceptation, la carte signée, les deux profils, « Me retirer »", async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  const damienCookie = await login("damien@orasso.local");
  const before = await count(damienCookie, "Damien_66");

  // 1. Kenji : la ligne « Publier avec… », la recherche, le choix, le bandeau, l'envoi.
  await openAs(page, "kenji@orasso.local");
  await expect(page.getByTestId("fil-publish")).toBeVisible();
  await expect(page.getByTestId("coauthor-toggle")).toContainText("Publier avec…");
  await expect(page.getByTestId("coauthor-sub")).toHaveText(
    "Inviter un co-auteur : une personne, une structure, un pro, un média.",
  );
  await addPhoto(page);
  await page.getByTestId("fil-publish-caption").fill(CAPTION);
  await page.getByTestId("coauthor-toggle").click();
  await page.getByTestId("coauthor-input").fill("D");
  await expect(page.getByTestId("coauthor-result")).toHaveCount(0);
  await page.getByTestId("coauthor-input").fill("Damien");
  await expect(page.getByTestId("coauthor-result").first()).toContainText("Damien_66", { timeout: 20_000 });
  await shot(page, "pub-recherche");
  await page.getByTestId("coauthor-result").first().click();
  await expect(page.getByTestId("coauthor-sub")).toHaveText(
    "Damien_66 · invité : tant qu'il n'a pas accepté, la publication est seulement chez toi.",
  );
  await expect(page.getByTestId("coauthor-banner")).toContainText("Tant que Damien_66 n'a pas accepté,");
  await shot(page, "pub-choisi");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("fil-publish-invited")).toHaveText(
    "Invitation envoyée à Damien_66 ; publié chez toi en attendant",
  );

  // 2. Rien chez Damien tant qu'il n'a pas accepté ; la demande est dans son Activité.
  expect(await count(damienCookie, "Damien_66")).toBe(before);
  const kenjiCookie = await login("kenji@orasso.local");
  const mine = await apiCall<{ items: { id: string; caption: string }[] }>(kenjiCookie, "GET", "/me/feed-posts");
  const post = mine.data.items.find((p) => p.caption === CAPTION);
  expect(post).toBeDefined();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const d = await ctx.newPage();
  await openAs(d, "damien@orasso.local", "/app/activite/demandes");
  const request = d.getByTestId("request-coauthor").filter({ hasText: CAPTION });
  await expect(request).toBeVisible();
  await expect(request).toContainText("Kenji_66 te propose de publier avec lui");
  await expect(request.getByTestId("request-coauthor-caption")).toHaveText(CAPTION);
  await shot(d, "dem");

  // 3. Il accepte : la confirmation de la maquette.
  await request.getByRole("button", { name: "Accepter" }).click();
  await expect(d.getByTestId("request-notice")).toHaveText(
    "Acceptée : elle apparaît sur vos deux profils, signée des deux",
  );
  expect(await count(damienCookie, "Damien_66")).toBe(before + 1);

  // 4. La carte du Fil : signée des deux, une seule fois.
  await d.goto("/app/fil");
  await d.getByRole("tab", { name: /Abonnements/ }).click();
  const card = d.getByTestId("feed-card-feed_post").filter({ hasText: CAPTION });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card.getByTestId("feed-card-signature")).toHaveText("Kenji_66 et Damien_66");
  await expect(card.getByTestId("feed-card-reason")).toHaveText(/^Collaboration · /);
  await shot(d, "fil");

  // 5. Les deux profils : « Avec … ».
  await d.goto("/app/moi?onglet=publications");
  await expect(d.getByTestId("publication-tile-with").filter({ hasText: "Avec Kenji_66" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await shot(d, "prof-damien");
  await page.goto("/app/moi?onglet=publications");
  await expect(page.getByTestId("publication-tile-with").filter({ hasText: "Avec Damien_66" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await shot(page, "prof-kenji");

  // 6. « Me retirer de la publication » : elle reste chez Kenji_66, qui seul la supprime.
  await d.goto(`/app/publication/${post?.id}`);
  await d.getByTestId("feed-card-more").click();
  await expect(d.getByTestId("publication-menu-remove")).toHaveCount(0);
  await expect(d.getByTestId("publication-menu-withdraw")).toContainText("Me retirer de la publication");
  await shot(d, "ret");
  d.once("dialog", (dialog) => void dialog.accept());
  await d.getByTestId("publication-menu-withdraw").click();
  await expect(d.getByTestId("publication-menu-done")).toHaveText("Tu n'es plus co-auteur : elle reste chez Kenji_66");
  expect(await count(damienCookie, "Damien_66")).toBe(before);
  expect((await apiCall(damienCookie, "DELETE", `/me/feed-posts/${post?.id}`)).status).toBe(404);
  await ctx.close();
});

test("un refus laisse la publication chez son auteur, qui le lit sur sa publication", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const kenjiCookie = await login("kenji@orasso.local");
  const damienCookie = await login("damien@orasso.local");
  const damienId = (await apiCall<{ user: { id: string } }>(damienCookie, "GET", "/me")).data.user.id;
  const { portraitPhoto } = await import("./publications-helpers");
  const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
  const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new Blob([new Uint8Array(portraitPhoto([90, 60, 140]))], { type: "image/png" }), "photo.png");
  const up = await fetch(`${API}/api/me/uploads`, {
    method: "POST",
    headers: { origin: WEB, cookie: kenjiCookie },
    body: form,
  });
  const { key } = (await up.json()) as { key: string };
  const made = await apiCall<{ id: string }>(kenjiCookie, "POST", "/me/feed-posts", {
    caption: REFUSED,
    aspect: "portrait_4_5",
    clientId: crypto.randomUUID(),
    photos: [{ uploadKey: key, noPlateConfirmed: true }],
    coAuthor: { kind: "user", id: damienId },
  });
  expect(made.status).toBe(201);
  await openAs(page, "damien@orasso.local", "/app/activite/demandes");
  const request = page.getByTestId("request-coauthor").filter({ hasText: REFUSED });
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "Refuser" }).click();
  await expect(page.getByTestId("request-notice")).toHaveText("Refusée : Kenji_66 garde sa publication");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const k = await ctx.newPage();
  await openAs(k, "kenji@orasso.local", `/app/publication/${made.data.id}`);
  await expect(k.getByTestId("feed-card-invite")).toHaveText("Invitation refusée");
  await expect(k.getByTestId("feed-card-signature")).toHaveCount(0);
  await ctx.close();
});

test("un pro partenaire : la phrase de la mention, puis « Collaboration commerciale » sur la publication", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openAs(page, "kenji@orasso.local");
  await addPhoto(page, "car-gtr.jpg");
  await page.getByTestId("fil-publish-caption").fill(REVISION);
  await page.getByTestId("coauthor-toggle").click();
  await page.getByTestId("coauthor-kind-pro").click();
  await page.getByTestId("coauthor-input").fill("Garage");
  await expect(page.getByTestId("coauthor-result").first()).toContainText("Pro partenaire", { timeout: 20_000 });
  await page.getByTestId("coauthor-result").first().click();
  await expect(page.getByTestId("coauthor-sub")).toContainText("pro partenaire · invité");
  await expect(page.getByTestId("coauthor-partner")).toContainText("est un pro partenaire");
  await shot(page, "pub-pro");
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  const kenjiCookie = await login("kenji@orasso.local");
  const mine = await apiCall<{ items: { id: string; caption: string }[] }>(kenjiCookie, "GET", "/me/feed-posts");
  const post = mine.data.items.find((p) => p.caption === REVISION);
  await page.goto(`/app/publication/${post?.id}`);
  await expect(page.getByTestId("feed-post-commercial")).toContainText("Collaboration commerciale");
});

test("la demande d'une page que Damien gère s'écrit « avec <page> »", async ({ page }) => {
  test.setTimeout(180_000);
  // Lot R9d (journal, T26 et décision du point 9 du tour 1) : une invitation adressée à une structure se traite dans les demandes
  // de la structure (`/orga/<slug>/activite?vue=demandes`), plus dans la liste personnelle (comme `appli-lotr8o`).
  await openAs(page, "damien@orasso.local", "/orga/meditesportcar/activite?vue=demandes");
  const request = page.getByTestId("sact-request-coauthor").filter({ hasText: "avec MéditeSportCar" });
  await expect(request).toBeVisible();
  await expect(request).toContainText("Kenji_66 te propose de publier avec MéditeSportCar");
});

test("une seule invitation à publier : la ligne « Demandes · 1 » de l'Activité se montre et ouvre l'invitation", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pseudo = `Solo_${unique()}`;
  const cookie = await signUpApi(pseudo);
  const soloId = (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data.user.id;
  const kenji = await login("kenji@orasso.local");
  const { portraitPhoto } = await import("./publications-helpers");
  const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
  const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new Blob([new Uint8Array(portraitPhoto([30, 120, 90]))], { type: "image/png" }), "photo.png");
  const up = await fetch(`${API}/api/me/uploads`, {
    method: "POST",
    headers: { origin: WEB, cookie: kenji },
    body: form,
  });
  const { key } = (await up.json()) as { key: string };
  const made = await apiCall(kenji, "POST", "/me/feed-posts", {
    caption: `Invitation seule (site) ${RUN}`,
    aspect: "portrait_4_5",
    clientId: crypto.randomUUID(),
    photos: [{ uploadKey: key, noPlateConfirmed: true }],
    coAuthor: { kind: "user", id: soloId },
  });
  expect(made.status).toBe(201);
  await openAs(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, "/app/activite");
  const row = page.getByTestId("activity-requests-row");
  await expect(row).toBeVisible();
  await expect(row).toContainText("Demandes · 1");
  await row.click();
  await expect(page.getByTestId("request-coauthor")).toHaveCount(1);
});
