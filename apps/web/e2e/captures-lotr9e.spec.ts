import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme, unique } from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Captures du lot R9e, partie 2 (« après ») : l'appli (`APP_URL`, version compilée) et le site, Béton et Sable. Appli : 390 px police ×1 et 384 px
// police ×1,3 ; site : 390 et 1280 px. Photos de démonstration du seed seulement (aucune plaque lisible). Un album est publié par l'API pour la carte du
// Fil et effacé à la fin. Les paires « maquette | réel » sont assemblées après coup (`outils`).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9e-captures/apres`;
const APP = process.env.APP_URL;
const API = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const NAMES = ["car-golf-gti.jpg", "car-mx5.jpg", "car-supra.jpg"];
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
const THEMES = ["beton", "sable"] as const;
type Theme = (typeof THEMES)[number];
const APP_CONFIGS = [
  { id: "390", width: 390, scale: 1 },
  { id: "384-x13", width: 384, scale: 1.3 },
] as const;

test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function openApp(browser: Browser, email: string, theme: Theme, width: number, scale: number) {
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

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Publie un album de trois photos du seed par l'API (sans plaque), pour la carte du Fil et l'onglet « Albums ». */
async function publishByApi(title: string): Promise<{ id: string; cookie: string }> {
  const cookie = await login("leo@orasso.local");
  const event = await apiCall<{ id: string }>(null, "GET", "/events/by-slug/beziers-night-2026");
  const draft = await apiCall<{ id: string }>(cookie, "POST", "/me/albums", { eventId: event.data.id, title: null });
  expect([200, 201]).toContain(draft.status);
  for (const name of NAMES) {
    const form = new FormData();
    const p = photo(name);
    form.append("purpose", "album_photo");
    form.append("file", new Blob([new Uint8Array(p.buffer)], { type: p.mimeType }), p.name);
    const up = await fetch(`${API}/api/me/uploads`, { method: "POST", headers: { origin: WEB, cookie }, body: form });
    expect(up.status).toBe(201);
    const key = ((await up.json()) as { key: string }).key;
    const add = await apiCall(cookie, "POST", `/me/albums/${draft.data.id}/photos`, {
      uploadKey: key,
      plateDecision: "none",
      clientId: crypto.randomUUID(),
    });
    expect(add.status).toBe(201);
  }
  await apiCall(cookie, "PATCH", `/me/albums/${draft.data.id}`, { title, allowSave: true });
  const done = await apiCall(cookie, "POST", `/me/albums/${draft.data.id}/publish`);
  expect(done.status).toBe(200);
  return { id: draft.data.id, cookie };
}

test("captures de l'appli : trois étapes, album ouvert, onglet Albums, carte du Fil", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(900_000);
  const title = `Béziers Night, la nuit ${unique()}`;
  const album = await publishByApi(title);
  try {
    for (const theme of THEMES) {
      for (const cfg of APP_CONFIGS) {
        const tag = `app-${theme}-${cfg.id}`;
        // Léo : les trois étapes.
        const leo = await openApp(browser, "leo@orasso.local", theme, cfg.width, cfg.scale);
        const page = leo.page;
        await page.goto("/album/nouveau");
        await afterOpening(page);
        await expect(page.getByTestId("album-event").first()).toBeVisible({ timeout: 30_000 });
        await page.getByTestId("album-event").filter({ hasText: "Rassemblement" }).click();
        await shot(page, `${tag}-etape-1`);
        await page.getByTestId("album-step1-continue").click();
        await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3", { timeout: 30_000 });
        // Un brouillon est créé sur l'événement : effacé à la fin de la passe.
        const chooser = page.waitForEvent("filechooser");
        await page.getByTestId("album-pick").click();
        await (await chooser).setFiles(NAMES.map(photo));
        await expect(page.getByTestId("album-tile")).toHaveCount(3, { timeout: 30_000 });
        await shot(page, `${tag}-etape-2`);
        await page.getByTestId("album-tile").first().click();
        await expect(page.getByTestId("album-frame-editor")).toBeVisible({ timeout: 20_000 });
        await page.getByTestId("album-frame-add").click();
        await shot(page, `${tag}-plaque`);
        await page.getByTestId("album-frame-done").click();
        await page.getByTestId("album-blur").click();
        await shot(page, `${tag}-etape-2-floutee`);
        await page.getByTestId("album-step2-continue").click();
        await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 90_000 });
        await page.getByTestId("album-title").fill("Rassemblement, les photos du dimanche");
        await shot(page, `${tag}-etape-3`);
        // L'album publié par l'API : ouvert, puis la Page.
        await page.goto(`/album/${album.id}`);
        await afterOpening(page);
        await expect(page.getByTestId("album-open-title")).toHaveText(title, { timeout: 30_000 });
        await shot(page, `${tag}-album`);
        await page.getByTestId("album-photo").first().click();
        await expect(page.getByTestId("album-viewer")).toBeVisible();
        await shot(page, `${tag}-visionneuse`);
        await page.getByTestId("album-viewer-close").click();
        await page.goto("/moi");
        await afterOpening(page);
        await page.getByTestId("casquette-media").first().click();
        await page.waitForURL((u) => !/\/(moi|profil)(\?|$)/.test(u.pathname), { timeout: 30_000 });
        await page.getByTestId("persona-tabbar").getByRole("tab", { name: "Page", exact: true }).click();
        await page.getByTestId("page-tab-albums").click();
        await expect(page.getByTestId("page-album-new")).toBeVisible({ timeout: 30_000 });
        await shot(page, `${tag}-page-albums`);
        await leo.ctx.close();
        // Le brouillon créé par cette passe est effacé (celui du seed est sur la Nocturne).
        const drafts = await apiCall<{ items: { id: string; event: { slug: string } }[] }>(
          album.cookie,
          "GET",
          "/me/albums?status=draft&limit=100",
        );
        for (const d of drafts.data.items.filter((x) => x.event.slug === "rassemblement-cote-vermeille-2025"))
          await apiCall(album.cookie, "DELETE", `/me/albums/${d.id}`);

        // Damien : la carte « album » du Fil (les cartes déjà vues d'une passe précédente sont oubliées : sinon « Déjà vu »).
        await sql("delete from feed_seen");
        await sql("delete from feed_seen_floor");
        const damien = await openApp(browser, "damien@orasso.local", theme, cfg.width, cfg.scale);
        await damien.page.goto("/fil");
        await afterOpening(damien.page);
        await damien.page.getByRole("tab", { name: "Abonnements", exact: true }).click();
        // Une carte « album » du Fil (la plus haute : celle de cette passe, ou celle du seed).
        const card = damien.page.getByTestId("feed-card-album").first();
        await expect(card).toBeVisible({ timeout: 60_000 });
        await card.scrollIntoViewIfNeeded();
        await shot(damien.page, `${tag}-fil-carte`);
        await damien.ctx.close();
      }
    }
  } finally {
    await apiCall(album.cookie, "DELETE", `/me/albums/${album.id}`);
  }
});

test("captures du site : trois étapes, album ouvert, fiche du média, carte du Fil", async ({ browser }) => {
  test.setTimeout(600_000);
  const title = `Béziers Night, la nuit ${unique()}`;
  const album = await publishByApi(title);
  try {
    for (const theme of THEMES) {
      for (const width of [390, 1280]) {
        const tag = `site-${theme}-${width}`;
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "fr-FR",
          timezoneId: "Europe/Paris",
        });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, "leo@orasso.local", undefined, "/app/media/albums/nouveau");
        await page.locator("label.alb-option", { hasText: "Rassemblement" }).locator("input").check();
        await shot(page, `${tag}-etape-1`);
        await page.getByTestId("album-step1-continue").click();
        await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
        await page.getByTestId("album-pick").setInputFiles(NAMES.map(photo));
        await expect(page.getByTestId("album-tile")).toHaveCount(3);
        await shot(page, `${tag}-etape-2`);
        await page.getByTestId("album-mark").first().click();
        await shot(page, `${tag}-plaque`);
        await page.getByTestId("album-blur").click();
        await shot(page, `${tag}-etape-2-floutee`);
        await page.getByTestId("album-step2-continue").click();
        await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 90_000 });
        await page.getByTestId("album-title").fill("Rassemblement, les photos du dimanche");
        await shot(page, `${tag}-etape-3`);
        await page.goto(`/albums/${album.id}`);
        await expect(page.getByTestId("album-open-title")).toHaveText(title);
        await page.waitForLoadState("networkidle");
        await shot(page, `${tag}-album`);
        const mediaId = (await apiCall<{ profile: { id: string } }>(album.cookie, "GET", "/me/media-profile")).data
          .profile.id;
        await page.goto(`/m/${mediaId}`);
        await expect(page.getByTestId("media-public-albums")).toBeVisible();
        await page.waitForLoadState("networkidle");
        await shot(page, `${tag}-fiche-media`);
        await ctx.close();
        const drafts = await apiCall<{ items: { id: string; event: { slug: string } }[] }>(
          album.cookie,
          "GET",
          "/me/albums?status=draft&limit=100",
        );
        for (const d of drafts.data.items.filter((x) => x.event.slug === "rassemblement-cote-vermeille-2025"))
          await apiCall(album.cookie, "DELETE", `/me/albums/${d.id}`);

        const dctx = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "fr-FR",
          timezoneId: "Europe/Paris",
        });
        const dpage = await dctx.newPage();
        await setTheme(dpage, theme);
        await loginInBrowser(dpage, "damien@orasso.local", undefined, "/app/fil");
        await expect(dpage.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
        const card = dpage.getByTestId("feed-card-album").filter({ hasText: title });
        for (let i = 0; i < 12 && !(await card.isVisible().catch(() => false)); i++) {
          await dpage.mouse.wheel(0, 1200);
          const more = dpage.getByTestId("fil-more");
          if (await more.isVisible().catch(() => false)) await more.click();
          await dpage.waitForTimeout(400);
        }
        await expect(card).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        await shot(dpage, `${tag}-fil-carte`);
        await dctx.close();
      }
    }
  } finally {
    await apiCall(album.cookie, "DELETE", `/me/albums/${album.id}`);
  }
});
