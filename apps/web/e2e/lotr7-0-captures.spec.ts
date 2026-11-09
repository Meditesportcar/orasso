import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7-0 : captures avant / après des écrans touchés par les sept corrections (événement en cours « Rassemblement du
// Lydia » du seed, Damien_66 retenu et entré). Aucune assertion de contenu : ce sont les photos de contrôle.
//   CAPTURES_DIR=<dossier> APP_URL=http://localhost:<appli compilée> pnpm exec playwright test lotr7-0-captures
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7-0-captures/avant`).replaceAll("\\", "/");
const SLUG = "rassemblement-du-lydia";
test.use({ actionTimeout: 30_000 });
test.setTimeout(600_000);

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function eventId(): Promise<string> {
  const cookie = await login("damien@orasso.local");
  const res = await apiCall<{ id: string }>(cookie, "GET", `/events/by-slug/${SLUG}`);
  return res.data.id;
}

/** L'écran « Mon accès » se rend par l'identifiant de la candidature, pas par celui de l'événement. */
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

async function appContext(browser: Browser, theme: Theme, width: number, scale: number, email = "damien@orasso.local") {
  const ctx = await browser.newContext({
    viewport: { width, height: 860 },
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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 60_000 });
  return { ctx, page };
}

async function snap(page: Page, path: string, name: string, full = false, waitFor?: string) {
  await page.goto(path);
  await afterOpening(page).catch(() => undefined);
  // Jour J, billet, stand : on attend le QR (kit chargé), l'écran « pas encore enregistré » ne prouve rien.
  if (waitFor)
    await page
      .getByTestId(waitFor)
      .first()
      .waitFor({ timeout: 45_000 })
      .catch(() => undefined);
  await page.waitForTimeout(2500);
  mkdirSync(`${DIR}`, { recursive: true });
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
}

test("captures de l'appli", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  const id = await eventId();
  const appId = await applicationId("damien@orasso.local");
  const variants: [number, number][] = [
    [384, 1],
    [390, 1],
    [384, 1.3],
  ];
  for (const theme of THEMES) {
    for (const [width, scale] of variants) {
      const { ctx, page } = await appContext(browser, theme, width, scale);
      const tag = `appli-${width}-x${String(scale).replace(".", "")}-${theme}`;
      for (const [path, name, waitFor] of [
        ["/accueil", "accueil"],
        ["/sorties", "sorties"],
        [`/e/${SLUG}`, "fiche"],
        [`/jour-j/${appId}`, "jour-j", "qr-poster"],
        ["/mon-passeport", "passeport"],
        [`/vote/${id}`, "vote"],
      ] as readonly (readonly [string, string, string?])[]) {
        await snap(page, path, `${tag}-${name}`, false, waitFor);
      }
      await ctx.close();
    }
  }
});

// Billet (billet/[id]), billets, stand du prestataire (stand/[id]) : les écrans dont le QR devient crème en Sable.
test("captures billets et stand", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  const kenji = await login("kenji@orasso.local");
  const tickets = await apiCall<{ id: string }[]>(kenji, "GET", "/me/tickets");
  const sofia = await login("sofia@orasso.local");
  const prov = await apiCall<{ id: string; status: string }[]>(
    sofia,
    "GET",
    "/me/provider-applications?scope=upcoming",
  );
  const standId = prov.data.find((a) => a.status === "accepted")?.id;
  for (const theme of THEMES) {
    for (const [width, scale] of [
      [384, 1],
      [384, 1.3],
    ] as [number, number][]) {
      const tag = `appli-${width}-x${String(scale).replace(".", "")}-${theme}`;
      const k = await appContext(browser, theme, width, scale, "kenji@orasso.local");
      await snap(k.page, "/billets", `${tag}-billets`);
      if (tickets.data[0]) await snap(k.page, `/billet/${tickets.data[0].id}`, `${tag}-billet`, false, "qr-poster");
      await k.ctx.close();
      if (standId) {
        const s = await appContext(browser, theme, width, scale, "sofia@orasso.local");
        await snap(s.page, `/stand/${standId}`, `${tag}-stand`, false, "qr-poster");
        await s.ctx.close();
      }
    }
  }
});

test("captures du site", async ({ browser }) => {
  const id = await eventId();
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        locale: "fr-FR",
        timezoneId: "Europe/Paris",
      });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await page.goto(`/connexion?retour=${encodeURIComponent("/app")}`);
      await page.getByLabel("E-mail").fill("damien@orasso.local");
      await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
      await page.waitForLoadState("networkidle");
      for (const [path, name] of [
        ["/app", "accueil"],
        ["/app/sorties", "sorties"],
        [`/e/${SLUG}`, "fiche"],
        ["/app/passeport", "passeport"],
        [`/app/vote/${SLUG}`, "vote"],
        ["/app/acces", "acces"],
      ] as const) {
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await page.waitForTimeout(1500);
        mkdirSync(`${DIR}`, { recursive: true });
        await page.screenshot({ path: `${DIR}/site-${width}-${theme}-${name}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
  void id;
});
