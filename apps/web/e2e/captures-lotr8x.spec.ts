import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8x : captures « avant » / « après » du haut de l'Explorer, de la carte d'événement et de leurs voisins
// (carte, fiche d'un événement, Explorer en vue Carte, Fil, média, événements de l'organisateur ; site : Explorer,
// /evenements, accueil public, page d'une structure). PHASE=avant|apres. Appli : APP_URL (version compilée) ; site :
// API et site lancés sur la base seedée.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8x-captures/${PHASE}`;
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: string, width: number, scale: number) {
  const ctx = await browser.newContext({
    viewport: { width, height: 860 },
    baseURL: APP,
    permissions: ["geolocation"],
    geolocation: { latitude: 42.7, longitude: 2.9 },
  });
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
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Une capture qui ne fait pas échouer la série : le nom de l'étape manquante est écrit à côté. */
async function soft(name: string, step: () => Promise<void>) {
  try {
    await step();
  } catch (e) {
    mkdirSync(DIR, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${DIR}/${name}.MANQUE.txt`, String(e).slice(0, 600));
  }
}

const SIZES = [
  { w: 384, s: 1 },
  { w: 384, s: 1.3 },
  { w: 390, s: 1 },
  { w: 390, s: 1.3 },
] as const;

for (const theme of ["beton", "sable"]) {
  for (const { w, s } of SIZES) {
    test(`appli explorer ${theme} ${w} police ${s}`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(300_000);
      const { ctx, page } = await open(browser, "kenji@orasso.local", theme, w, s);
      const tag = `${theme}-${w}-f${String(s).replace(".", "")}`;
      await page.goto("/explorer");
      await afterOpening(page);
      await page
        .getByTestId("segment-evenements")
        .click({ timeout: 30_000 })
        .catch(() => undefined);
      await page.getByTestId("events-q").waitFor({ timeout: 30_000 });
      await page.waitForTimeout(2500);
      await shot(page, `explorer-evenements-${tag}`);
      // Un événement complet (le Rassemblement du Lydia) : la carte entière, pour la puce « Liste d'attente ».
      await soft(`explorer-complet-${tag}`, async () => {
        await page.getByTestId("around-open").click();
        await page.getByTestId("around-all").click();
        await page.getByTestId("where-apply").click();
        const card = page.getByTestId("event-row").filter({ hasText: "Lydia" }).first();
        await card.scrollIntoViewIfNeeded({ timeout: 15_000 });
        await shot(page, `explorer-complet-${tag}`);
      });
      // Filtres actifs.
      await soft(`explorer-filtres-${tag}`, async () => {
        await page.evaluate(() => document.querySelector("[data-testid=explorer-body]")?.scrollTo(0, 0));
        await page.getByTestId("filters-toggle").click();
        await page.getByTestId("explorer-filters").getByText("Mes affinités", { exact: true }).click();
        await page.getByTestId("filters-apply").click();
        await shot(page, `explorer-filtres-${tag}`);
      });
      await soft(`explorer-pros-${tag}`, async () => {
        await page.getByTestId("segment-pros").click();
        await page.waitForTimeout(2000);
        await shot(page, `explorer-pros-${tag}`);
      });
      await soft(`explorer-personnes-${tag}`, async () => {
        await page.getByTestId("segment-personnes").click();
        await page.waitForTimeout(2000);
        await shot(page, `explorer-personnes-${tag}`);
      });
      await ctx.close();
    });
  }

  // Voisins : une seule taille (390, police 1) par thème.
  test(`appli voisins ${theme}`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, "kenji@orasso.local", theme, 390, 1);
    await soft(`voisin-carte-${theme}`, async () => {
      await page.goto("/carte");
      await afterOpening(page);
      await shot(page, `voisin-carte-${theme}`);
    });
    await soft(`voisin-fiche-${theme}`, async () => {
      await page.goto("/e/rassemblement-du-lydia");
      await afterOpening(page);
      await shot(page, `voisin-fiche-evenement-${theme}`);
    });
    await soft(`voisin-explorer-carte-${theme}`, async () => {
      await page.goto("/explorer");
      await afterOpening(page);
      await page.getByTestId("map-toggle").click({ timeout: 30_000 });
      await page.waitForTimeout(4000);
      await shot(page, `voisin-explorer-vue-carte-${theme}`);
    });
    await soft(`voisin-fil-${theme}`, async () => {
      await page.goto("/fil");
      await afterOpening(page);
      await shot(page, `voisin-fil-${theme}`);
    });
    await ctx.close();
  });
  test(`appli voisin media ${theme}`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, "paul.photo@orasso.local", theme, 390, 1);
    await soft(`voisin-media-${theme}`, async () => {
      await page.goto("/explorer");
      await afterOpening(page);
      await shot(page, `voisin-media-explorer-${theme}`);
    });
    await ctx.close();
  });
  test(`appli voisin organisateur ${theme}`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, "damien@orasso.local", theme, 390, 1);
    await soft(`voisin-orga-${theme}`, async () => {
      await page.goto("/evenements");
      await afterOpening(page);
      await shot(page, `voisin-orga-evenements-${theme}`);
    });
    await ctx.close();
  });

  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme as "beton" | "sable");
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/explorer");
      await page.waitForTimeout(1500);
      await shot(page, `site-explorer-${theme}-${width}`);
      await soft(`site-explorer-pros-${theme}-${width}`, async () => {
        await page.goto("/app/explorer?segment=pros");
        await shot(page, `site-explorer-pros-${theme}-${width}`);
      });
      await soft(`site-explorer-personnes-${theme}-${width}`, async () => {
        await page.goto("/app/explorer?segment=personnes");
        await shot(page, `site-explorer-personnes-${theme}-${width}`);
      });
      await soft(`site-evenements-${theme}-${width}`, async () => {
        await page.goto("/evenements");
        await shot(page, `site-evenements-${theme}-${width}`);
      });
      await soft(`site-accueil-${theme}-${width}`, async () => {
        await page.goto("/");
        await shot(page, `site-accueil-public-${theme}-${width}`);
      });
      await soft(`site-structure-${theme}-${width}`, async () => {
        await page.goto("/o/club-audois-passion");
        await shot(page, `site-structure-${theme}-${width}`);
      });
    });
  }
}
