import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  type Cookie,
  createEvent,
  login,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R8n2 : captures « avant » (R8N2_PHASE=avant, base du lot) et « après » des écrans touchés, appli à 384 et 390 px et
// site à 390 et 1280 px, Béton et Sable : fin d'une candidature, en-tête de la fiche (avec une place, puis sans),
// Réglages > Notifications, fin de l'assistant d'un événement publié. Les écrans neufs (cloche, interrupteur coupé,
// confirmation de l'organisateur) ne se prennent qu'en « après » (ils n'existent pas avant).
// Lancer avec APP_URL (appli compilée), l'API et le site sur la base seedée.
const APP = process.env.APP_URL;
const PHASE = process.env.R8N2_PHASE === "avant" ? "avant" : "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8n2-captures/${PHASE}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });
type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appOpen(browser: Browser, theme: Theme, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function appSignIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

async function appGoto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function person(prefix: string) {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await addVehicleApi(cookie, randomPlate());
  return { pseudo, email, cookie };
}

async function siteContext(browser: Browser, cookie: Cookie, width: number, theme: Theme) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const url = new URL(WEB);
  const cookies: { name: string; value: string; url: string }[] = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

test("appli : captures des écrans de notifications d'un événement", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, { title: `Nocturne R8n2 ${unique()}`.slice(0, 40), admission: "filtered" });
  const outsider = await person("Hors");
  for (const theme of THEMES) {
    for (const width of [384, 390]) {
      const tag = `${theme}-${width}`;
      const who = await person("Nt");
      const { ctx, page } = await appOpen(browser, theme, width);
      await appSignIn(page, who.email);
      // Écran voisin : l'en-tête de la fiche sans place (pas de cloche).
      await appGoto(page, `/e/${event.slug}`);
      await expect(page.getByTestId("event-primary")).toBeVisible({ timeout: 30_000 });
      await shot(page, `01-fiche-sans-place-${tag}`);
      // Écran voisin : la candidature avant sa fin (inchangée).
      await page.getByTestId("event-primary").click();
      await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
      await shot(page, `02-candidature-${tag}`);
      const rules = page.getByTestId("cand-rules");
      if (await rules.isVisible().catch(() => false)) await rules.click();
      const seen = page.getByTestId("arrival-seen");
      if (await seen.isVisible().catch(() => false)) await seen.click();
      await page.getByTestId("cand-send").click();
      await expect(page.getByTestId("cand-done")).toBeVisible({ timeout: 20_000 });
      await shot(page, `03-fin-candidature-${tag}`);
      if (PHASE === "apres") {
        await page.getByTestId("notify-noted").scrollIntoViewIfNeeded();
        await shot(page, `03b-fin-candidature-bas-${tag}`);
        await page.getByTestId("notify-signup-news").click();
        await shot(page, `03c-fin-candidature-coupee-${tag}`);
        await page.getByTestId("notify-noted").click();
        await expect(page.getByTestId("cand-done")).toHaveCount(0, { timeout: 15_000 });
      } else {
        await page.getByTestId("cand-close").click();
      }
      // En-tête de la fiche avec une place.
      await appGoto(page, `/e/${event.slug}`);
      await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
      await shot(page, `04-fiche-avec-place-${tag}`);
      if (PHASE === "apres") {
        await expect(page.getByTestId("notify-bell")).toBeVisible({ timeout: 20_000 });
        await page.getByTestId("notify-bell").click();
        await expect(page.getByTestId("notify-news-switch")).toBeVisible();
        await shot(page, `05-cloche-feuille-coupee-${tag}`);
        await page.getByTestId("notify-news-switch").click();
        await page.waitForTimeout(600);
        await shot(page, `05b-cloche-feuille-activee-${tag}`);
      }
      // Réglages > Notifications.
      await appGoto(page, "/reglages/notifications");
      await expect(page.getByText("Notifications").first()).toBeVisible({ timeout: 20_000 });
      await shot(page, `06-reglages-notifications-${tag}`);
      if (PHASE === "apres") {
        await page.getByTestId("notif-news").click();
        await page.waitForTimeout(800);
        await shot(page, `06b-reglages-nouveautes-coupees-${tag}`);
      }
      await ctx.close();
    }
  }
  // L'outsider n'a pas de place : jamais de cloche.
  const out = await appOpen(browser, "beton", 390);
  await appSignIn(out.page, outsider.email);
  await appGoto(out.page, `/e/${event.slug}`);
  await expect(out.page.getByTestId("event-primary")).toBeVisible({ timeout: 30_000 });
  await expect(out.page.getByTestId("notify-bell")).toHaveCount(0);
  await out.ctx.close();

  // Organisateur : la fin de l'assistant d'un événement publié (avec deux inscrits pour que le nombre soit lu).
  const a = await person("Ins");
  const b = await person("Ins");
  for (const p of [a, b]) {
    const vehicles = await apiCall<{ id: string }[]>(p.cookie, "GET", "/me/vehicles");
    const applied = await apiCall<{ id: string }[]>(p.cookie, "POST", `/events/${event.id}/applications`, {
      vehicleIds: [vehicles.data[0]?.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
    });
    expect(applied.status).toBe(201);
  }
  for (const theme of THEMES) {
    for (const width of [384, 390]) {
      const tag = `${theme}-${width}`;
      const { ctx, page } = await appOpen(browser, theme, width);
      await appSignIn(page, "damien@orasso.local");
      await page.goto("/moi");
      await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
      await page.waitForURL(/\/direct/, { timeout: 20_000 });
      await appGoto(page, `/evenement/${event.id}/modifier?temps=publier`);
      await page.waitForTimeout(3000);
      await expect(page.getByTestId("wizard-save").filter({ visible: true })).toBeVisible({ timeout: 30_000 });
      await shot(page, `07-orga-fin-assistant-${tag}`);
      if (PHASE === "apres") {
        await appGoto(page, `/evenement/${event.id}/modifier?temps=type`);
        const start = page.getByTestId("wizard-start-time").filter({ visible: true });
        await expect(start).toBeVisible({ timeout: 30_000 });
        await start.fill("17:00");
        await start.blur();
        for (let i = 0; i < 9; i++) {
          if (await page.getByTestId("wizard-save").filter({ visible: true }).count()) break;
          const before = (await page.getByTestId("wizard-step").filter({ visible: true }).textContent()) ?? "";
          await page.getByTestId("wizard-next").filter({ visible: true }).click();
          await expect(page.getByTestId("wizard-step").filter({ visible: true })).not.toHaveText(before, {
            timeout: 30_000,
          });
        }
        await expect(page.getByTestId("notify-recipients")).toBeVisible({ timeout: 20_000 });
        await shot(page, `08-orga-confirmation-${tag}`);
      }
      await ctx.close();
    }
  }
});

test("site : captures des écrans de notifications d'un événement", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, {
    title: `Nocturne site R8n2 ${unique()}`.slice(0, 40),
    admission: "filtered",
  });
  const outsider = await person("HorsS");
  const inscrits = [await person("InsS"), await person("InsS")];
  for (const p of inscrits) {
    const vehicles = await apiCall<{ id: string }[]>(p.cookie, "GET", "/me/vehicles");
    await apiCall(p.cookie, "POST", `/events/${event.id}/applications`, {
      vehicleIds: [vehicles.data[0]?.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
    });
  }
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const tag = `site-${theme}-${width}`;
      const who = await person("NtS");
      // Écran voisin : fiche sans place.
      const octx = await siteContext(browser, outsider.cookie, width, theme);
      const op = await octx.newPage();
      await op.goto(`/e/${event.slug}`);
      await expect(op.getByTestId("event-hero")).toBeVisible({ timeout: 30_000 });
      await op.waitForTimeout(800);
      await op.screenshot({ path: `${DIR}/01-fiche-sans-place-${tag}.png` });
      if (PHASE === "apres") await expect(op.getByTestId("notify-bell")).toHaveCount(0);
      await octx.close();

      const ctx = await siteContext(browser, who.cookie, width, theme);
      const page = await ctx.newPage();
      await page.goto(`/e/${event.slug}/candidater`);
      await expect(page.locator('[data-step="1"]')).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Continuer" }).click();
      await expect(page.locator('[data-step="2"]')).toBeVisible();
      await page.getByLabel("J'ai lu le règlement").check();
      const seen = page.getByTestId("arrival-seen");
      if (await seen.isVisible().catch(() => false)) await page.getByLabel("J'ai vu le créneau d'arrivée.").check();
      await page.screenshot({ path: `${DIR}/02-candidature-${tag}.png`, fullPage: true });
      await page.getByRole("button", { name: "Continuer" }).click();
      await expect(page.locator('[data-step="3"]')).toBeVisible();
      await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
      if (PHASE === "apres") {
        await expect(page.getByTestId("cand-done")).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${DIR}/03-fin-candidature-${tag}.png`, fullPage: true });
        await page.getByTestId("notify-signup-news").click();
        await page.screenshot({ path: `${DIR}/03c-fin-candidature-coupee-${tag}.png`, fullPage: true });
        await page.getByTestId("notify-noted").click();
      }
      await page.waitForURL(/\/app\/(acces|sorties)/, { timeout: 30_000 });
      await page.waitForTimeout(800);
      if (PHASE === "avant") await page.screenshot({ path: `${DIR}/03-fin-candidature-${tag}.png`, fullPage: true });
      await page.goto(`/e/${event.slug}`);
      await expect(page.getByTestId("event-hero")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${DIR}/04-fiche-avec-place-${tag}.png` });
      if (PHASE === "apres") {
        await expect(page.getByTestId("notify-bell")).toBeVisible({ timeout: 20_000 });
        await page.getByTestId("notify-bell").click();
        await expect(page.getByTestId("notify-news-switch")).toBeVisible();
        await page.screenshot({ path: `${DIR}/05-cloche-feuille-coupee-${tag}.png` });
        await page.getByTestId("notify-news-switch").click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${DIR}/05b-cloche-feuille-activee-${tag}.png` });
        await page.keyboard.press("Escape");
      }
      await page.goto("/app/moi#notifications");
      await expect(page.getByTestId("notification-settings")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("notification-settings").scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${DIR}/06-reglages-notifications-${tag}.png` });
      await ctx.close();
    }
  }
  // Organisateur : la fin de l'assistant.
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const tag = `site-${theme}-${width}`;
      const ctx = await siteContext(browser, damien, width, theme);
      const page = await ctx.newPage();
      await page.goto(`/orga/meditesportcar/e/${event.id}/modifier?temps=publier`);
      await expect(page.getByTestId("wizard-save")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${DIR}/07-orga-fin-assistant-${tag}.png`, fullPage: true });
      if (PHASE === "apres") {
        await page.goto(`/orga/meditesportcar/e/${event.id}/modifier?temps=type`);
        await page.getByLabel("Début").first().fill("17:00");
        for (let i = 0; i < 9; i++) {
          if (await page.getByTestId("wizard-save").count()) break;
          const before = (await page.getByTestId("wizard-step").textContent()) ?? "";
          await page.getByTestId("wizard-next").click();
          await expect(page.getByTestId("wizard-step")).not.toHaveText(before, { timeout: 30_000 });
        }
        await expect(page.getByTestId("notify-recipients")).toBeVisible({ timeout: 20_000 });
        await page.screenshot({ path: `${DIR}/08-orga-confirmation-${tag}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
});
