import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7d2 : captures avant / après des écrans touchés (fiche pendant l'événement, Jour J, Direct de l'organisateur,
// fiche de l'événement côté organisateur, étape « Lieu »), appli et site, Béton et Sable. Événement en cours « Rassemblement
// du Lydia » du seed (Damien_66 retenu et entré ; Noe_34 visiteur sans voiture, pas encore présent). Aucune assertion de
// contenu : ce sont les photos de contrôle.
//   CAPTURES_DIR=<dossier> APP_URL=http://localhost:<appli compilée> pnpm exec playwright test lotr7d2-captures
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7d2-captures/avant`).replaceAll("\\", "/");
const SLUG = "rassemblement-du-lydia";
test.use({ actionTimeout: 30_000 });
test.setTimeout(900_000);

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

type EventRow = { id: string; structure: { slug: string; id: string } };
async function lydia(): Promise<EventRow> {
  const cookie = await login("damien@orasso.local");
  return (await apiCall<EventRow>(cookie, "GET", `/events/by-slug/${SLUG}`)).data;
}

async function applicationId(email: string): Promise<string> {
  const cookie = await login(email);
  const res = await apiCall<{ id: string; event: { slug: string } }[]>(
    cookie,
    "GET",
    "/me/applications?scope=upcoming",
  );
  return res.data.find((a) => a.event.slug === SLUG)?.id ?? "";
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appContext(browser: Browser, theme: Theme, width: number, scale: number, email: string, height = 860) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    baseURL: APP,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (s > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
      else localStorage.removeItem("orasso.recette.echellePolice");
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|direct/, { timeout: 60_000 });
  return { ctx, page };
}

async function snap(page: Page, path: string, name: string, waitFor?: string) {
  await page.goto(path);
  await afterOpening(page).catch(() => undefined);
  if (waitFor)
    await page
      .getByTestId(waitFor)
      .first()
      .waitFor({ timeout: 45_000 })
      .catch(() => undefined);
  await page.waitForTimeout(2500);
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const VARIANTS: [number, number][] = [
  [390, 1],
  [384, 1.3],
];
const tag = (w: number, s: number, theme: Theme) => `appli-${w}-x${String(s).replace(".", "")}-${theme}`;

test("captures de l'appli : passionné (fiche, Jour J)", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  const appId = await applicationId("damien@orasso.local");
  for (const theme of THEMES) {
    for (const [width, scale] of VARIANTS) {
      const damien = await appContext(browser, theme, width, scale, "damien@orasso.local", 1900);
      await snap(damien.page, `/e/${SLUG}`, `${tag(width, scale, theme)}-fiche-entre`, "event-page");
      await damien.page.setViewportSize({ width, height: 860 });
      await snap(damien.page, `/e/${SLUG}`, `${tag(width, scale, theme)}-fiche-entre-haut`, "event-page");
      await snap(damien.page, `/jour-j/${appId}`, `${tag(width, scale, theme)}-jour-j`, "jourj-entered");
      await damien.ctx.close();
      const noe = await appContext(browser, theme, width, scale, "noe@orasso.local", 1900);
      await snap(noe.page, `/e/${SLUG}`, `${tag(width, scale, theme)}-fiche-visiteur`, "event-page");
      await noe.ctx.close();
    }
  }
});

test("captures de l'appli : organisateur (Direct, fiche, étape Lieu)", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  const ev = await lydia();
  for (const theme of THEMES) {
    for (const [width, scale] of VARIANTS) {
      const sarah = await appContext(browser, theme, width, scale, "sarah@orasso.local", 1500);
      await sarah.page.goto("/moi");
      await afterOpening(sarah.page);
      await sarah.page
        .getByTestId("casquette-organizer")
        .filter({ hasText: "Roues Libres" })
        .first()
        .click()
        .catch(() => undefined);
      await sarah.page.waitForURL(/\/direct/, { timeout: 60_000 }).catch(() => undefined);
      await sarah.page.waitForTimeout(4000);
      await sarah.page.screenshot({ path: `${DIR}/${tag(width, scale, theme)}-direct.png` });
      await snap(sarah.page, `/evenement/${ev.id}`, `${tag(width, scale, theme)}-orga-fiche`);
      await snap(sarah.page, `/evenement/${ev.id}/modifier?temps=lieu`, `${tag(width, scale, theme)}-etape-lieu`);
      await sarah.ctx.close();
    }
  }
});

async function siteContext(browser: Browser, theme: Theme, width: number, email: string) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  await page.goto(`/connexion?retour=${encodeURIComponent("/app")}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}

async function siteSnap(page: Page, path: string, file: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1500);
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${file}.png`, fullPage: true });
}

test("captures du site", async ({ browser }) => {
  const ev = await lydia();
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const damien = await siteContext(browser, theme, width, "damien@orasso.local");
      await siteSnap(damien.page, `/e/${SLUG}`, `site-${width}-${theme}-fiche-entre`);
      await damien.ctx.close();
      const noe = await siteContext(browser, theme, width, "noe@orasso.local");
      await siteSnap(noe.page, `/e/${SLUG}`, `site-${width}-${theme}-fiche-visiteur`);
      await noe.ctx.close();
      const sarah = await siteContext(browser, theme, width, "sarah@orasso.local");
      const base = `/orga/${ev.structure.slug}/e/${ev.id}`;
      await siteSnap(sarah.page, `${base}/jour-j`, `site-${width}-${theme}-orga-jour-j`);
      await siteSnap(sarah.page, base, `site-${width}-${theme}-orga-fiche`);
      await siteSnap(sarah.page, `${base}/modifier?temps=lieu`, `site-${width}-${theme}-etape-lieu`);
      await sarah.ctx.close();
    }
  }
});
