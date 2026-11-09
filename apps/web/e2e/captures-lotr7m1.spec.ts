import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7m1 : captures « avant » (CAP_PHASE=avant, branche telle que reçue) et « après » (CAP_PHASE=apres) des écrans que
// touchent les partenariats : fiche d'un pro (vue d'un passionné, vue de son titulaire), profil d'un membre vu par un pro,
// mon profil, Demandes, voiture (la mienne, celle d'un autre). Béton et Sable. Appli : 384 px police 1 et 1,3, plus 390 px ;
// site : 390 et 1280 px. Lancer avec APP_URL (appli compilée) et/ou SITE_CAPTURES=1, l'API et le site seedés.
const PHASE = process.env.CAP_PHASE ?? "apres";
const OUT = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7m1-captures/${PHASE}`;
const APP = process.env.APP_URL;
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const KENJI = "kenji@orasso.local";
const DAMIEN = "damien@orasso.local";
const PRO = "garage@orasso.local";

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

async function vehicleOf(email: string): Promise<string> {
  const cookie = await login(email);
  const r = await apiCall<{ id: string }[]>(cookie, "GET", "/me/vehicles");
  const first = r.data[0];
  if (!first) throw new Error(`Aucun véhicule pour ${email}`);
  return first.id;
}

const VARIANTS: [number, number][] = [
  [384, 1],
  [384, 1.3],
  [390, 1],
];

test("appli : captures des partenariats, Béton et Sable", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(1_800_000);
  const damienCar = await vehicleOf(DAMIEN);
  for (const theme of ["beton", "sable"] as const) {
    for (const [width, fs] of VARIANTS) {
      const tag = `${theme}-${width}-f${String(fs).replace(".", "")}`;
      {
        const { ctx, page } = await openApp(browser, theme, width, fs);
        await signIn(page, KENJI);
        for (const [name, path] of [
          ["fiche-pro-passionne", "/p/garage-du-port"],
          ["mon-profil", "/profil"],
          ["voiture-d-un-autre", `/v/${damienCar}`],
        ] as const) {
          await page.goto(path);
          await afterOpening(page);
          await shot(page, "appli", `${name}-${tag}`);
        }
        await ctx.close();
      }
      {
        const { ctx, page } = await openApp(browser, theme, width, fs);
        await signIn(page, DAMIEN);
        for (const [name, path] of [
          ["demandes", "/activite/demandes"],
          ["ma-voiture", `/vehicule/${damienCar}`],
        ] as const) {
          await page.goto(path);
          await afterOpening(page);
          await shot(page, "appli", `${name}-${tag}`);
        }
        await ctx.close();
      }
      {
        const { ctx, page } = await openApp(browser, theme, width, fs);
        await signIn(page, PRO);
        await page.goto("/moi");
        await afterOpening(page);
        await page.getByTestId("casquette-pro").first().click();
        await page.waitForURL(/accueil|fiche|pro/, { timeout: 60_000 });
        await page.goto("/u/Kenji_66");
        await afterOpening(page);
        await shot(page, "appli", `profil-membre-vu-par-pro-${tag}`);
        await page.goto("/fiche");
        await afterOpening(page);
        await shot(page, "appli", `ma-fiche-pro-${tag}`);
        await ctx.close();
      }
    }
  }
});

test("site : captures des partenariats, Béton et Sable, 390 et 1280 px", async ({ browser }) => {
  test.skip(!process.env.SITE_CAPTURES, "Site : lancer avec SITE_CAPTURES=1");
  test.setTimeout(1_800_000);
  const damienCar = await vehicleOf(DAMIEN);
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const plan: [string, string, [string, string][]][] = [
        [
          KENJI,
          "/app/moi",
          [
            ["fiche-pro-passionne", "/p/garage-du-port"],
            ["mon-profil", "/app/moi"],
            ["voiture-d-un-autre", `/v/${damienCar}`],
          ],
        ],
        [
          DAMIEN,
          "/app/moi",
          [
            ["demandes", "/app/activite/demandes"],
            ["ma-voiture", `/app/garage/${damienCar}`],
          ],
        ],
        [
          PRO,
          "/pro/garage-du-port",
          [
            ["profil-membre-vu-par-pro", "/u/Kenji_66"],
            ["ma-fiche-pro", "/pro/garage-du-port"],
          ],
        ],
      ];
      for (const [who, retour, shots] of plan) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "fr-FR",
          baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`,
        });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, who, SEED_PASSWORD, retour);
        for (const [name, path] of shots) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          mkdirSync(`${OUT}/site`, { recursive: true });
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${OUT}/site/${name}-${theme}-${width}.png`, fullPage: true });
        }
        await ctx.close();
      }
    }
  }
});
