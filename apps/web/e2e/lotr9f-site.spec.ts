import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD } from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot R9f, partie 2 (identification sur une photo d'album et « Tes photos »), côté site (API et site lancés sur la base seedée, à neuf) :
// Léo (média Sud Cars) ouvre une photo de son album, « Identifier une voiture », choisit la voiture de Damien, la ligne apparaît ; Damien
// voit « Voir mes photos » sur l'album, « Tes photos » (« En story » avec le crédit, « Enregistrer », « … » → « Ce n'est pas ma voiture »,
// Léo prévenu), la fiche de la voiture, la sortie passée ; un visiteur sans session ne voit aucune identification ; 1280 et 390 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9f-captures/apres/recette-site`;
test.describe.configure({ mode: "serial" });
const LEO = "leo@orasso.local";
const DAMIEN = "damien@orasso.local";

type Tag = { id: string; kind: string; vehicle: { id: string; label: string } | null; user: { pseudo: string } | null };
type Album = { id: string; photos: { id: string; tags?: Tag[] }[]; event: { id: string } };

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function scenario() {
  const leo = await login(LEO);
  const damien = await login(DAMIEN);
  const tags = await apiCall<{ items: { albumId: string }[] }>(damien, "GET", "/me/album-tags");
  const albumId = tags.data.items[0]?.albumId as string;
  const album = (await apiCall<Album>(leo, "GET", `/albums/${albumId}`)).data;
  const garage = await apiCall<{ id: string }[]>(damien, "GET", "/me/vehicles");
  const vehicleId = garage.data[0]?.id ?? "";
  const label =
    album.photos.flatMap((p) => p.tags ?? []).find((t) => t.vehicle?.id === vehicleId)?.vehicle?.label ?? "";
  return { leo, damien, albumId, album, vehicleId, label };
}

test("un visiteur sans session ne voit aucune identification, ni pseudo ni nombre", async ({ request, browser }) => {
  const s = await scenario();
  const res = await request.get(`/api/albums/${s.albumId}`);
  expect(res.status()).toBe(401);
  expect(await res.text()).not.toMatch(/Damien_66|Kenji_66|tags/);
  for (const path of [`/api/albums/${s.albumId}/taggable`, `/api/me/albums/${s.albumId}/my-photos`]) {
    expect((await request.get(path)).status()).toBe(401);
  }
  // La page de l'album renvoie à la connexion : aucune identification n'est rendue.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/albums/${s.albumId}`);
  await expect(page.getByTestId("tag-box")).toHaveCount(0);
  await expect(page.getByTestId("identify-banner")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Damien_66");
  await ctx.close();
});

test("Léo identifie la voiture de Damien ; Damien : Tes photos, en story, ce n'est pas ma voiture ; fiche, sortie", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = await scenario();
  expect(s.label).not.toBe("");
  const free = s.album.photos.findIndex((p) => !p.tags || p.tags.length === 0);
  expect(free).toBeGreaterThanOrEqual(0);

  const leoCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const leo = await leoCtx.newPage();
  await loginInBrowser(leo, LEO, undefined, `/albums/${s.albumId}`);
  await expect(leo.getByTestId("identify-banner")).toBeVisible({ timeout: 30_000 });
  await expect(leo.getByTestId("identify-banner-count")).toContainText(/\d+ sur \d+ photos identifiées/);
  await shot(leo, "leo-album-bandeau-1280");
  await leo.getByTestId("media-gallery-photo").nth(free).click();
  await expect(leo.getByTestId("tag-who")).toContainText("média auteur de l'album");
  await expect(leo.getByTestId("tag-empty")).toContainText("Choisis la voiture dans le plateau");
  await shot(leo, "leo-visionneuse-vide-1280");
  await leo.getByTestId("tag-open-picker").click();
  await expect(leo.getByTestId("tag-picker-grid")).toBeVisible();
  await shot(leo, "leo-plateau-a-choisir-1280");
  const tile = leo.getByTestId("tag-pick-car").filter({ hasText: s.label }).first();
  await expect(tile.getByTestId("tag-pick-car-name")).toHaveText(s.label);
  await tile.click();
  await expect(leo.getByTestId("tag-done")).toContainText("Voiture identifiée.");
  await expect(leo.getByTestId("tag-line").first()).toContainText(s.label);
  await expect(leo.getByTestId("tag-line-by").first()).toHaveText("identifiée par toi");
  await shot(leo, "leo-visionneuse-apres-pose-1280");
  // La recherche par pseudo : rien sous deux caractères.
  await leo.getByTestId("tag-open-picker").click();
  await leo.getByTestId("tag-picker-search").fill("K");
  await expect(leo.getByText("Personnes", { exact: true })).toHaveCount(0);
  await leo.getByTestId("tag-picker-search").fill("Ke");
  await leo.getByText("Personnes", { exact: true }).click();
  await expect(leo.getByTestId("tag-pick-person").filter({ hasText: "Kenji_66" })).toBeVisible({ timeout: 30_000 });
  await leoCtx.close();

  const damCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const dam = await damCtx.newPage();
  await loginInBrowser(dam, DAMIEN, undefined, "/app/activite");
  const row = dam.getByTestId("activity-album-tagged").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("activity-album-strip").first()).toBeVisible();
  await expect(row).toContainText("Voir mes photos");
  await shot(dam, "damien-activite-1280");
  await row.click();
  await expect(dam.getByTestId("my-photos")).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("my-photos-headline")).toContainText(`de ta ${s.label}`);
  await expect(dam.getByTestId("my-photos-not-publications")).toContainText("ne deviennent pas tes publications");
  await shot(dam, "damien-tes-photos-1280");

  // « En story » avec le crédit non modifiable (la page est hydratée avant le clic : sans cela, un clic trop tôt n'ouvre rien).
  await dam.waitForLoadState("networkidle");
  await dam.getByTestId("my-photo").first().getByTestId("my-photo-story").click();
  await expect(dam.getByTestId("story-credit")).toHaveText("Photos : Sud Cars");
  await dam.getByTestId("story-publish").click();
  await expect(dam.getByTestId("story-done")).toBeVisible({ timeout: 60_000 });
  await shot(dam, "damien-en-story-1280");
  await dam.keyboard.press("Escape");
  // Déjà en story : la page le dit directement, sans formulaire de public ni de légende.
  const first = dam.getByTestId("my-photo").first();
  await expect(first.getByTestId("my-photo-story-live")).toContainText("Déjà en story · Tout le monde", {
    timeout: 30_000,
  });
  await expect(first.getByTestId("my-photo-story")).toHaveCount(0);
  // Le repartage : la copie de Kenji garde le crédit « Photos : Sud Cars » et la pastille « ajoutée par » (site).
  const [orig] = await sql<{ id: string }>(
    "select id from stories where source_album_photo_id is not null and shared_from_story_id is null order by created_at desc limit 1",
  );
  const kenjiApi = await login("kenji@orasso.local");
  const kenjiMe = await apiCall<{ user: { id: string } }>(kenjiApi, "GET", "/me");
  await sql("insert into story_tags (story_id, target_kind, target_id) values ($1, 'user', $2)", [
    orig?.id,
    kenjiMe.data.user.id,
  ]);
  expect((await apiCall(kenjiApi, "POST", `/stories/${orig?.id}/share-to-mine`, {})).status).toBeLessThan(300);
  const kCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const kp = await kCtx.newPage();
  await loginInBrowser(
    kp,
    "kenji@orasso.local",
    undefined,
    `/app/story/${encodeURIComponent(`u:${kenjiMe.data.user.id}`)}`,
  );
  await expect(kp.getByTestId("story-shared-by")).toBeVisible({ timeout: 30_000 });
  await expect(kp.getByTestId("story-photo-credit")).toHaveText("Photos : Sud Cars");
  await shot(kp, "kenji-copie-credit-1280");
  await kCtx.close();
  await expect(dam.getByTestId("my-photos-contact")).toHaveCount(0);

  // « Enregistrer » : le fichier part (ou inerte avec sa raison).
  if (await dam.getByTestId("my-photo-save-off").count()) {
    await expect(dam.getByTestId("my-photo-save").first()).toBeDisabled();
  } else {
    const download = dam.waitForEvent("download", { timeout: 30_000 });
    await dam.getByTestId("my-photo-save").first().click();
    expect((await download).suggestedFilename()).toMatch(/\.webp$/);
  }

  // « … » → « Ce n'est pas ma voiture » : la ligne disparaît, Léo est prévenu.
  const n = await dam.getByTestId("my-photo").count();
  await dam.getByTestId("my-photo-more").first().click();
  await expect(dam.getByTestId("photo-sheet-not-mine")).toContainText(
    "Sud Cars en est prévenu ; l'identification disparaît",
  );
  await shot(dam, "damien-feuille-1280");
  dam.on("dialog", (d) => void d.accept());
  await dam.getByTestId("photo-sheet-not-mine").click();
  await expect(dam.getByTestId("my-photo")).toHaveCount(n - 1, { timeout: 30_000 });
  const declined = await sql<{ n: string }>(
    "select count(*)::text as n from notifications where type = 'album_tag_declined' and user_id = (select id from \"user\" where email = $1)",
    [LEO],
  );
  expect(Number(declined[0]?.n)).toBeGreaterThanOrEqual(1);

  // La fiche de la voiture et la sortie passée.
  await dam.goto(`/app/garage/${s.vehicleId}`);
  await expect(dam.getByTestId("vehicle-album-mentions")).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("album-mention-title").first()).toContainText("Vu au ");
  await shot(dam, "damien-fiche-voiture-1280");
  await dam.goto("/app/sorties?vue=passes");
  await expect(dam.getByTestId("outing-album-photos").first()).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("album-mention-title").first()).toHaveText("Photos de ma voiture");
  await shot(dam, "damien-sortie-passee-1280");
  await damCtx.close();
});

test("390 px : « Tes photos » et le plateau tiennent sans défilement horizontal", async ({ browser }) => {
  test.setTimeout(180_000);
  const s = await scenario();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, DAMIEN, undefined, `/app/albums/${s.albumId}/mes-photos`);
  await expect(page.getByTestId("my-photos")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "damien-tes-photos-390");
  await page.goto(`/albums/${s.albumId}`);
  await expect(page.getByTestId("album-my-photos-link")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "damien-album-390");
  await ctx.close();
});

test("retrait réussi puis relecture en échec : l'erreur et « Réessayer », pas un faux état vide ; la relecture réussie réconcilie", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const s = await scenario();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, DAMIEN, undefined, `/app/albums/${s.albumId}/mes-photos`);
  await expect(page.getByTestId("my-photo").first()).toBeVisible({ timeout: 30_000 });
  const before = await page.getByTestId("my-photo").count();
  // La relecture qui suit le retrait tombe en panne (le chargement initial et le DELETE passent).
  let fail = true;
  await page.route(`**/api/me/albums/${s.albumId}/my-photos`, (route) =>
    fail
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "boom", message: "Panne de relecture" } }),
        })
      : route.continue(),
  );
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("my-photo-more").first().click();
  await page.getByTestId("photo-sheet-not-mine").click();
  await expect(page.getByTestId("load-error")).toContainText("Panne de relecture", { timeout: 30_000 });
  await expect(page.getByTestId("load-error-retry")).toBeVisible();
  // Jamais le texte « aucune photo » à la place de l'erreur.
  await expect(page.getByText("Aucune photo", { exact: false })).toHaveCount(0);
  fail = false;
  await page.getByTestId("load-error-retry").click();
  await expect(page.getByTestId("load-error")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("my-photo")).toHaveCount(before - 1, { timeout: 30_000 });
  await ctx.close();
});

test("une photo, deux identifications : retrait, relecture en panne (erreur, pas de faux vide), relecture réussie : la photo reste avec l'autre identification", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const KENJI = "kenji@orasso.local";
  const kenji = await login(KENJI);
  const mine = await apiCall<{ items: { albumId: string; photos: { id: string }[] }[] }>(
    kenji,
    "GET",
    "/me/album-tags",
  );
  const albumId = mine.data.items[0]?.albumId as string;
  const photoId = mine.data.items[0]?.photos[0]?.id as string;
  const garage = await apiCall<{ id: string }[]>(kenji, "GET", "/me/vehicles");
  // Léo l'avait identifié par son pseudo (seed) ; il dit « C'est ma voiture » sur la même photo : deux identifications, une seule ligne.
  const posed = await apiCall(kenji, "POST", `/album-photos/${photoId}/tags`, { vehicleId: garage.data[0]?.id });
  expect([200, 201]).toContain(posed.status);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, KENJI, undefined, `/app/albums/${albumId}/mes-photos`);
  await expect(page.getByTestId("my-photo")).toHaveCount(1, { timeout: 30_000 });
  let fail = true;
  await page.route(`**/api/me/albums/${albumId}/my-photos`, (route) =>
    fail
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "boom", message: "Panne de relecture" } }),
        })
      : route.continue(),
  );
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("my-photo-more").first().click();
  await page.getByTestId("photo-sheet-not-mine").click();
  await expect(page.getByTestId("load-error")).toContainText("Panne de relecture", { timeout: 30_000 });
  await expect(page.getByText("Aucune photo", { exact: false })).toHaveCount(0);
  fail = false;
  await page.getByTestId("load-error-retry").click();
  await expect(page.getByTestId("load-error")).toHaveCount(0, { timeout: 30_000 });
  // La photo reste : sa seconde identification (la sienne) est active.
  await expect(page.getByTestId("my-photo")).toHaveCount(1);
  await expect(page.getByTestId("my-photo-by")).toHaveText("Identifiée par toi");
  await ctx.close();
});

test("un autre compte se connecte dans un autre onglet pendant une relecture retenue : le masquage précède le rechargement, jamais les photos de A sous B, la page finit sous B", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = await scenario();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // Les identités, connues AVANT la connexion de B : les photos de A seul (celles que B ne doit jamais voir), l'identifiant de B.
  const kenjiId =
    (await sql<{ id: string }>('select id from "user" where email = $1', ["kenji@orasso.local"]))[0]?.id ?? "";
  expect(kenjiId).not.toBe("");
  const pathOf = (u: string) => new URL(u, "http://x").pathname;
  const kenjiPhotos = (
    await apiCall<{ photos: { url: string }[] }>(
      await login("kenji@orasso.local"),
      "GET",
      `/me/albums/${s.albumId}/my-photos`,
    )
  ).data.photos.map((p) => pathOf(p.url));
  const damienPhotos = (
    await apiCall<{ photos: { url: string }[] }>(s.damien, "GET", `/me/albums/${s.albumId}/my-photos`)
  ).data.photos.map((p) => pathOf(p.url));
  const aOnly = damienPhotos.filter((p) => !kenjiPhotos.includes(p));
  expect(aOnly.length).toBeGreaterThan(0);
  // L'observateur du DOM (un par document ; les constats survivent au rechargement dans sessionStorage), sur des ÉVÉNEMENTS observables :
  // - « announced » : l'annonce de B a été reçue (même canal que le site) ; sans canal, « no-channel » ;
  // - « stale-seen » : l'écran masqué « Mise à jour… » a été rendu, « stale-delay » : le temps entre l'annonce et ce rendu ;
  // - « leak-added » : un nœud « my-photo » portant une photo de A seul est AJOUTÉ (ou son `src` change) après l'annonce ;
  // - « leak-with-stale » : un « my-photo » est présent alors que l'écran masqué est rendu ; « stale-late » : pas de masquage sous 2 s.
  await page.addInitScript(
    ({ otherId, aOnlyPaths }: { otherId: string; aOnlyPaths: string[] }) => {
      let announcedAt = 0;
      const mark = (k: string, v = "1") => sessionStorage.setItem(k, v);
      if (typeof BroadcastChannel === "undefined") mark("no-channel");
      else {
        new BroadcastChannel("orasso-session").addEventListener("message", (e) => {
          if ((e as MessageEvent).data?.userId !== otherId) return;
          announcedAt = performance.now();
          mark("announced");
          setTimeout(() => {
            if (!sessionStorage.getItem("stale-seen")) mark("stale-late");
          }, 2000);
        });
      }
      const isA = (img: Element) =>
        !!img.closest('[data-testid="my-photo"]') &&
        aOnlyPaths.includes(new URL((img as HTMLImageElement).src, location.href).pathname);
      new MutationObserver((records) => {
        if (document.querySelector('[data-testid="my-photos-stale"]')) {
          if (!sessionStorage.getItem("stale-seen"))
            mark("stale-delay", String(announcedAt ? performance.now() - announcedAt : -1));
          mark("stale-seen");
          if (document.querySelector('[data-testid="my-photo"]')) mark("leak-with-stale");
        }
        if (announcedAt === 0) return;
        for (const r of records) {
          const imgs: Element[] =
            r.type === "attributes"
              ? [r.target as Element]
              : [...r.addedNodes].flatMap((n) => (n instanceof Element ? [n, ...n.querySelectorAll("img")] : []));
          if (imgs.some((i) => i.tagName === "IMG" && isA(i))) mark("leak-added");
        }
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    },
    { otherId: kenjiId, aOnlyPaths: aOnly },
  );
  await loginInBrowser(page, DAMIEN, undefined, `/app/albums/${s.albumId}/mes-photos`);
  await expect(page.getByTestId("my-photo").first()).toBeVisible({ timeout: 30_000 });
  expect(await page.getByTestId("my-photo").count()).toBeGreaterThan(1);
  // La relecture qui suit le retrait est EXPLICITEMENT retenue : demandée par A, lue avec le cookie de A, puis gardée jusqu'à la fin.
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  let fetchedAsA: () => void = () => undefined;
  const fetchedAsAPromise = new Promise<void>((r) => {
    fetchedAsA = r;
  });
  await page.route(`**/api/me/albums/${s.albumId}/my-photos`, async (route) => {
    const response = await route.fetch();
    fetchedAsA();
    await held;
    await route.fulfill({ response });
  });
  const requested = page.waitForRequest(
    (r) => r.method() === "GET" && r.url().includes(`/me/albums/${s.albumId}/my-photos`),
  );
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("my-photo-more").first().click();
  await page.getByTestId("photo-sheet-not-mine").click();
  await requested;
  await fetchedAsAPromise;
  // Un autre onglet du même navigateur : B se connecte (cookie remplacé par l'API, sans annonce de « déconnecté ») et annonce son compte.
  const other = await ctx.newPage();
  const signIn = await ctx.request.post("/api/auth/sign-in/email", {
    data: { email: "kenji@orasso.local", password: SEED_PASSWORD },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(signIn.ok()).toBe(true);
  await other.goto(`/app/albums/${s.albumId}/mes-photos`);
  await expect(other.getByTestId("my-photo")).toHaveCount(1, { timeout: 30_000 });
  // La relecture de A arrive tard : elle ne doit rien afficher.
  release();
  // La première page finit sous B : l'identité des photos est celle de Kenji, aucune de celles de Damien.
  await expect(page.getByTestId("my-photo")).toHaveCount(kenjiPhotos.length, { timeout: 60_000 });
  const finalSrc = (
    await page.locator('[data-testid="my-photo"] img').evaluateAll((l) => l.map((x) => (x as HTMLImageElement).src))
  ).map(pathOf);
  expect([...finalSrc].sort()).toEqual([...kenjiPhotos].sort());
  for (const p of aOnly) expect(finalSrc).not.toContain(p);
  // Le masquage a bien précédé le rechargement.
  expect(await page.evaluate(() => sessionStorage.getItem("stale-seen"))).toBe("1");
  const flag = (k: string) => page.evaluate((key) => sessionStorage.getItem(key), k);
  expect(await flag("no-channel")).toBeNull();
  // L'annonce de B a été reçue par la page de A, le masquage a été rendu, et vite (2 s au plus).
  expect(await flag("announced")).toBe("1");
  expect(await flag("stale-late")).toBeNull();
  const delay = Number(await flag("stale-delay"));
  expect(delay).toBeGreaterThanOrEqual(0);
  expect(delay).toBeLessThan(2000);
  // Aucune photo de A ajoutée après l'annonce, aucune photo présente sous l'écran masqué.
  expect(await flag("leak-added")).toBeNull();
  expect(await flag("leak-with-stale")).toBeNull();
  await ctx.close();
});
