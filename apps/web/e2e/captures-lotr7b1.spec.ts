import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7b1 : captures « avant » (CAP_PHASE=avant, branche R7a1) et « après » (CAP_PHASE=apres) du Profil, du Garage et du
// Passeport (mon profil, celui d'un autre : public, privé vu d'un inconnu, privé vu d'un abonné), Béton et Sable.
// Appli : 384 px police 1 et 1,3, plus 390 px police 1 ; site : 390 et 1280 px. Lancer avec APP_URL (appli compilée) et/ou
// la recette du site (E2E_BASE_URL), l'API seedée. Aucune plaque lisible : le seed n'a que des photos floutées.
const PHASE = process.env.CAP_PHASE ?? "apres";
const OUT = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7b1-captures/${PHASE}`;
const APP = process.env.APP_URL;
const AFTER = PHASE === "apres";
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
type Who = { email: string };
const KENJI: Who = { email: "kenji@orasso.local" };
const PAUL: Who = { email: "paul.photo@orasso.local" };
const JULIE: Who = { email: "julie@orasso.local" };

async function openApp(browser: Browser, theme: Theme, width: number, fontScale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 1500 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, f]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t as string);
      if (f !== "1") localStorage.setItem("orasso.recette.echellePolice", f as string);
    },
    [theme, String(fontScale)],
  );
  return { ctx, page: await ctx.newPage() };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function shot(page: Page, dir: string, name: string) {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${dir}/${name}.png` });
}

type AppShot = { name: string; who: Who; path: string };
const APP_SHOTS: AppShot[] = [
  { name: "mon-profil", who: KENJI, path: "/profil" },
  { name: "mon-garage", who: KENJI, path: AFTER ? "/profil?onglet=garage" : "/garage" },
  { name: "mon-passeport", who: KENJI, path: AFTER ? "/profil?onglet=sorties" : "/mon-passeport" },
  { name: "visiteur-profil", who: PAUL, path: "/profil" },
  { name: "autre-public", who: KENJI, path: "/u/Lea_11" },
  { name: "autre-prive-inconnu", who: KENJI, path: "/u/Marc_66" },
  { name: "autre-prive-abonne", who: JULIE, path: "/u/Marc_66" },
];
const VARIANTS: [number, number][] = [
  [384, 1],
  [384, 1.3],
  [390, 1],
];

test("appli : captures du profil, Béton et Sable", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(900_000);
  for (const theme of ["beton", "sable"] as const) {
    for (const [width, fs] of VARIANTS) {
      for (const who of [KENJI, PAUL, JULIE]) {
        const { ctx, page } = await openApp(browser, theme, width, fs);
        await signIn(page, who.email);
        await afterOpening(page);
        for (const s of APP_SHOTS.filter((x) => x.who === who)) {
          await page.goto(s.path);
          await afterOpening(page);
          await shot(page, "appli", `${s.name}-${theme}-${width}-f${String(fs).replace(".", "")}`);
        }
        await ctx.close();
      }
    }
  }
});

type SiteShot = { name: string; who: Who; path: string };
const SITE_SHOTS: SiteShot[] = [
  { name: "mon-profil", who: KENJI, path: "/app/moi" },
  { name: "mon-garage", who: KENJI, path: AFTER ? "/app/moi?onglet=garage" : "/app/garage" },
  { name: "mon-passeport", who: KENJI, path: AFTER ? "/app/moi?onglet=sorties" : "/app/passeport" },
  { name: "visiteur-profil", who: PAUL, path: "/app/moi" },
  { name: "autre-public", who: KENJI, path: "/u/Lea_11" },
  { name: "autre-prive-inconnu", who: KENJI, path: "/u/Marc_66" },
  { name: "autre-prive-abonne", who: JULIE, path: "/u/Marc_66" },
];

test("site : captures du profil, Béton et Sable, 390 et 1280 px", async ({ browser }) => {
  test.skip(!process.env.SITE_CAPTURES, "Site : lancer avec SITE_CAPTURES=1");
  test.setTimeout(900_000);
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      for (const who of [KENJI, PAUL, JULIE]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "fr-FR",
          baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`,
        });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, who.email, SEED_PASSWORD, "/app/moi");
        for (const s of SITE_SHOTS.filter((x) => x.who === who)) {
          await page.goto(s.path);
          await page.waitForLoadState("networkidle");
          mkdirSync(`${OUT}/site`, { recursive: true });
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${OUT}/site/${s.name}-${theme}-${width}.png`, fullPage: true });
        }
        await ctx.close();
      }
    }
  }
});
