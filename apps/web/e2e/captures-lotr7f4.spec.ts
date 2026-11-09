import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7f4 : captures « avant » / « après » des écrans que le lot touche (appli compilée 390 px, site 390 et 1280 px), Béton et
// Sable : la feuille de partage d'une voiture, la fiche d'un événement, le Fil, le souvenir, la visionneuse, le vote.
// CAPTURES_PHASE=avant|apres ; APP_URL = l'appli compilée ; le site sur E2E_BASE_URL ou WEB_PORT. Aucune plaque lisible : seules
// les photos de démonstration du seed.
const APP = process.env.APP_URL;
const PHASE = process.env.CAPTURES_PHASE ?? "avant";
const DIR = `${RELAIS}/lot-r7f4-captures/${PHASE}`.replaceAll("\\", "/");
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000, locale: "fr-FR", timezoneId: "Europe/Paris" });
test.setTimeout(600_000);
mkdirSync(DIR, { recursive: true });

type Ctx = {
  cookie: string;
  vehicleId: string;
  eventSlug: string;
  eventId: string;
  authorKey: string | null;
  memoryEventId: string | null;
};

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function gather(): Promise<Ctx> {
  const cookie = await login("damien@orasso.local");
  const vehicles = (await apiCall<{ items?: { id: string }[] } | { id: string }[]>(cookie, "GET", "/me/vehicles")).data;
  const list = Array.isArray(vehicles) ? vehicles : (vehicles.items ?? []);
  const events = (
    await apiCall<{ items: { id: string; slug: string; title: string }[] }>(cookie, "GET", "/events?q=Lydia")
  ).data;
  const lydia = events.items?.find((e) => e.title.includes("Lydia"));
  const bar = (await apiCall<{ authors: { key: string }[] }>(cookie, "GET", "/stories/bar")).data;
  const memories = (await apiCall<{ eventId: string }[]>(cookie, "GET", "/me/memories/today")).data;
  return {
    cookie,
    vehicleId: (list[0] as { id: string }).id,
    eventSlug: lydia?.slug ?? "",
    eventId: lydia?.id ?? "",
    authorKey: bar.authors?.[0]?.key ?? null,
    memoryEventId: memories?.[0]?.eventId ?? null,
  };
}

async function openApp(browser: Browser, theme: "beton" | "sable", scale: number) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", String(t));
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
  return { ctx, page };
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png` });

for (const theme of ["beton", "sable"] as const) {
  test(`appli ${PHASE} : écrans de partage, ${theme}`, async ({ browser }) => {
    const c = await gather();
    const { ctx, page } = await openApp(browser, theme, 1);
    const go = async (path: string, name: string, wait = 2500) => {
      await page.goto(path);
      await afterOpening(page);
      await page.waitForTimeout(wait);
      await shot(page, `appli-${name}-${theme}`);
    };
    await go(`/vehicule/${c.vehicleId}/partager`, "vehicule-partager", 4000);
    await go(`/e/${c.eventSlug}`, "fiche-evenement");
    await go("/fil", "fil", 4000);
    if (c.memoryEventId) await go(`/souvenir/${c.memoryEventId}`, "souvenir");
    if (c.authorKey) await go(`/story/${encodeURIComponent(c.authorKey)}`, "visionneuse", 4000);
    await go(`/vote/${c.eventId}`, "vote", 3500);
    await ctx.close();
  });
}

for (const [label, width] of [
  ["390", 390],
  ["1280", 1280],
] as const) {
  for (const theme of ["beton", "sable"] as const) {
    test(`site ${PHASE} : écrans de partage, ${label}, ${theme}`, async ({ browser }) => {
      const c = await gather();
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        locale: "fr-FR",
        timezoneId: "Europe/Paris",
      });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local");
      const go = async (path: string, name: string, wait = 2500) => {
        await page.goto(path);
        await page.waitForTimeout(wait);
        await shot(page, `site-${name}-${label}-${theme}`);
      };
      await go(`/app/garage/${c.vehicleId}`, "vehicule");
      await go(`/e/${c.eventSlug}`, "fiche-evenement");
      await go("/app/fil", "fil", 3500);
      if (c.memoryEventId) await go(`/app/souvenir/${c.memoryEventId}`, "souvenir");
      if (c.authorKey) await go(`/app/story/${encodeURIComponent(c.authorKey)}`, "visionneuse", 3500);
      await go(`/app/vote/${c.eventSlug}`, "vote", 3000);
      await ctx.close();
    });
  }
}
