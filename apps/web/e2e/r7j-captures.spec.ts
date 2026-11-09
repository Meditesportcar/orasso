import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7j : captures « avant » / « après » de l'Accueil, du Fil et du passeport (appli et site), et, après, la page du
// souvenir. PHASE=avant|apres. Damien_66 est le compte qui a un souvenir le jour de la capture (seed `memories`), Kenji
// n'en a pas (témoin : rien ne doit bouger pour lui). Appli à 384 px (police 1 et 1,3) et 390 px ; site à 390 et 1 280 px,
// Béton et Sable. Appli : APP_URL (version compilée) ; site : API et site lancés sur la base seedée.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7j-captures/${PHASE}`;
const QUICK = process.env.QUICK === "1";
const EVENT_ID = process.env.MEMORY_EVENT_ID ?? "";
test.use({ actionTimeout: 30_000 });

const ACCOUNTS = (
  [
    ["souv", "damien@orasso.local"],
    ["temoin", "kenji@orasso.local"],
  ] as const
).filter(([who]) => !process.env.WHO || who === process.env.WHO);

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function appLogin(browser: Browser, email: string, theme: string, width: number, scale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 60_000 });
  return { ctx, page };
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
  await page.waitForTimeout(1_500);
  if (await page.getByTestId("whatsnew-dismiss").count()) await page.getByTestId("whatsnew-dismiss").click();
}

const SIZES: readonly (readonly [number, number])[] = QUICK
  ? [[384, 1]]
  : [
      [384, 1],
      [384, 1.3],
      [390, 1],
    ];

for (const theme of QUICK ? (["beton"] as const) : (["beton", "sable"] as const)) {
  test(`R7j appli ${theme}`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    test.setTimeout(1_800_000);
    for (const [width, scale] of SIZES) {
      for (const [who, email] of ACCOUNTS) {
        const { ctx, page } = await appLogin(browser, email, theme, width, scale);
        const tag = `${who}-${width}-x${scale}-${theme}`;
        await go(page, "/accueil");
        await shot(page, `appli-accueil-${tag}`);
        await page.setViewportSize({ width, height: 2600 });
        await page.waitForTimeout(500);
        await shot(page, `appli-accueil-long-${tag}`);
        await page.setViewportSize({ width, height: 844 });
        await go(page, "/fil");
        await shot(page, `appli-fil-${tag}`);
        await go(page, "/passeport");
        await shot(page, `appli-passeport-${tag}`);
        if (PHASE === "apres" && who === "souv" && EVENT_ID) {
          await go(page, `/souvenir/${EVENT_ID}`);
          await shot(page, `appli-souvenir-${tag}`);
        }
        await ctx.close();
      }
    }
  });

  test(`R7j site ${theme}`, async ({ browser }) => {
    test.setTimeout(900_000);
    for (const width of QUICK ? [390] : [390, 1280]) {
      for (const [who, email] of ACCOUNTS) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, email, undefined, "/app");
        const tag = `${who}-${width}-${theme}`;
        const paths: [string, string][] = [
          ["accueil", "/app"],
          ["fil", "/app/fil"],
          ["passeport", "/app/passeport"],
        ];
        if (PHASE === "apres" && who === "souv" && EVENT_ID) paths.push(["souvenir", `/app/souvenir/${EVENT_ID}`]);
        for (const [name, path] of paths) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          if (await page.getByTestId("whatsnew-dismiss").count()) {
            await page.getByTestId("whatsnew-dismiss").click();
            await page.waitForLoadState("networkidle");
          }
          await shot(page, `site-${name}-${tag}`);
          if (name === "accueil" || name === "fil") {
            await page.screenshot({ path: `${DIR}/site-${name}-long-${tag}.png`, fullPage: true });
          }
        }
        await ctx.close();
      }
    }
  });
}
