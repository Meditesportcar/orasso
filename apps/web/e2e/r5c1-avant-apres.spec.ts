import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  type Cookie,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R5c1 : paires de captures avant / après de la page du crew (appli à 390 et 384 px, site à 390 et 1 280 px, Béton
// et Sable), à lancer sur `vague-r5` (255a366e) puis sur la branche, avec `CAPTURES_DIR` différent. Le chef d'un crew de
// deux membres ; quand l'API du fil existe (après), le crew a une publication à deux photos, un texte et un sondage.
// Seulement des captures : les règles sont vérifiées par `appli-lotr5c1` et `lotr5c1-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5c1-captures/apres`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
test.use({ actionTimeout: 30_000 });

/** Envoi d'une photo d'essai du seed (`purpose=crew_post`) ; `null` si l'API ne connaît pas encore cet usage. */
async function uploadSeedPhoto(cookie: Cookie, name: string): Promise<string | null> {
  const form = new FormData();
  form.set("purpose", "crew_post");
  form.set("file", new Blob([new Uint8Array(readFileSync(`${PHOTOS}/${name}`))], { type: "image/jpeg" }), name);
  const res = await fetch(`${API}/api/me/uploads`, { method: "POST", headers: { origin: WEB, cookie }, body: form });
  if (res.status !== 201) return null;
  return ((await res.json()) as { key: string }).key;
}

async function appPage(browser: Browser, theme: string, width: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return page;
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

test("R5c1 : captures avant / après de la page du crew (appli et site)", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const chef = `R5Chef_${s}`.slice(0, 20);
  const nina = `R5Nina_${s}`.slice(0, 20);
  const cChef = await signUpApi(chef);
  const cNina = await signUpApi(nina);
  for (const c of [cChef, cNina]) await addVehicleApi(c, randomPlate());
  const created = await apiCall<{ id: string; slug: string }>(cChef, "POST", "/crews", {
    name: `Roussillon ${s}`.slice(0, 40),
    description: "Glisse, japonaises et sorties du dimanche entre Perpignan et la côte.",
    department: "66",
  });
  expect(created.status).toBe(201);
  const crew = created.data;
  await apiCall(cNina, "POST", `/crews/${crew.id}/requests`, { message: "Je roule en STI." });
  const ninaId = (await apiCall<{ user: { id: string } }>(cNina, "GET", "/me")).data.user.id;
  expect((await apiCall(cChef, "POST", `/crews/${crew.id}/requests/${ninaId}/accept`)).status).toBe(204);

  // Après : un sondage, un texte, une publication à deux photos (avec la flamme du chef).
  const k1 = await uploadSeedPhoto(cNina, "car-subaru-sti.jpg");
  const k2 = await uploadSeedPhoto(cNina, "car-supra.jpg");
  if (k1 && k2) {
    await apiCall(cChef, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "On roule où dimanche ?", options: ["Les Aspres", "La côte", "Le Canigou"], endsAt: null },
    });
    await apiCall(cChef, "POST", `/crews/${crew.id}/posts`, {
      kind: "text",
      text: "Bienvenue à Nina dans le crew. Prochaine balade bientôt !",
    });
    const photo = await apiCall<{ id: string }>(cNina, "POST", `/crews/${crew.id}/posts`, {
      kind: "photo",
      text: "Lavée, prête pour mercredi à Canet 🔥",
      photoKeys: [k1, k2],
    });
    if (photo.status === 201) await apiCall(cChef, "PUT", `/crews/${crew.id}/posts/${photo.data.id}/reaction`);
  }

  if (APP) {
    for (const width of [390, 384]) {
      for (const theme of ["beton", "sable"]) {
        const page = await appPage(browser, theme, width);
        await page.goto("/auth");
        await skipOpening(page);
        await page.getByLabel("E-mail").fill(`${chef.toLowerCase()}@e2e.orasso.test`);
        await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
        await page.getByRole("button", { name: "Me connecter" }).click();
        await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
        await page.goto(`/crew/${crew.slug}`);
        await skipOpening(page);
        await expect(page.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${DIR}/appli-crew-${width}-${theme}-1.png` });
        const feed = page.getByTestId("crew-feed");
        if (await feed.count()) {
          await feed.scrollIntoViewIfNeeded();
          await page.waitForTimeout(1500);
          await page.screenshot({ path: `${DIR}/appli-crew-${width}-${theme}-2-fil.png` });
          await page.mouse.move(width / 2, 500);
          await page.mouse.wheel(0, 700);
          await page.waitForTimeout(1500);
          await page.screenshot({ path: `${DIR}/appli-crew-${width}-${theme}-3-fil.png` });
        } else {
          await page.mouse.move(width / 2, 500);
          await page.mouse.wheel(0, 700);
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${DIR}/appli-crew-${width}-${theme}-2.png` });
        }
        await page.context().close();
      }
    }
  }

  for (const width of [390, 1280]) {
    for (const theme of ["beton", "sable"] as const) {
      const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, `${chef.toLowerCase()}@e2e.orasso.test`, undefined, `/c/${crew.slug}`);
      await page.goto(`/c/${crew.slug}`);
      await expect(page.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${DIR}/site-crew-${width}-${theme}.png`, fullPage: true });
      await ctx.close();
    }
  }
});
