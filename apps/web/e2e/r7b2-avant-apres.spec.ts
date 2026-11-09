import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7b2 : captures avant / après des écrans de l'onglet Crew. À lancer sur la branche telle que reçue
// (`CAPTURES_DIR` = …/lot-r7b2-captures/avant) puis après le lot (…/apres). Kenji (chef du crew « Roussillon Drift »),
// Paul (visiteur sans crew : écran sans crew, vitrine d'un non-membre), Théo (membre de deux crews, après seulement).
// Appli à 384 px (police 1 et 1,3, Pixel de Damien) et 390 px (police 1), site à 390 et 1 280 px, Béton et Sable.
// Seulement des captures : les règles se vérifient dans `appli-lotr7b2` et `lotr7b2-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7b2-captures/apres`;
const AFTER = !(process.env.CAPTURES_DIR ?? "").includes("avant");
const SLUG = "roussillon-drift";
const ONLY = process.env.ONLY ?? "";
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, email: string, theme: string, width: number, scale: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
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
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await page.waitForTimeout(1_500);
}

async function tap(page: Page, id: string): Promise<boolean> {
  const el = page.getByTestId(id).first();
  if (!(await el.count())) return false;
  await el.click();
  await page.waitForTimeout(900);
  return true;
}

test("R7b2 : captures avant / après (onglet Crew, appli et site)", async ({ browser }) => {
  test.setTimeout(2_400_000);
  mkdirSync(DIR, { recursive: true });

  if (APP && ONLY !== "site") {
    for (const theme of ["beton", "sable"] as const) {
      for (const [width, scale] of [
        [384, 1],
        [384, 1.3],
        [390, 1],
      ] as const) {
        const tag = `${width}-x${scale}-${theme}`;
        // Kenji, chef : l'onglet Crew (après) ou la page du crew (avant), puis chaque onglet interne.
        let page = await appLogin(browser, "kenji@orasso.local", theme, width, scale);
        await go(page, "/crew");
        await shot(page, `appli-crew-onglet-${tag}`);
        if (!AFTER) await go(page, `/crew/${SLUG}`);
        await shot(page, `appli-crew-fil-${tag}`);
        for (const [name, ids] of [
          ["sorties", ["crew-tab-outings"]],
          ["garage", ["crew-tab-garage"]],
          ["membres", ["crew-tab-members"]],
          ["spots", ["crew-tab-spots"]],
        ] as const) {
          for (const id of ids) if (await tap(page, id)) await shot(page, `appli-crew-${name}-${tag}`);
        }
        // La fiche d'un membre (après : « Voitures »).
        if (AFTER && (await tap(page, "crew-tab-members")) && (await tap(page, "crew-member"))) {
          await shot(page, `appli-crew-fiche-membre-${tag}`);
        }
        await page.context().close();

        // Paul, sans crew : l'onglet, « Rejoindre », la vitrine d'un crew dont il n'est pas membre.
        page = await appLogin(browser, "paul.photo@orasso.local", theme, width, scale);
        await go(page, "/crew");
        await shot(page, `appli-sans-crew-${tag}`);
        await go(page, "/rejoindre-crew");
        await shot(page, `appli-rejoindre-${tag}`);
        await go(page, `/crew/${SLUG}`);
        await shot(page, `appli-vitrine-${tag}`);
        await page.context().close();

        if (AFTER) {
          // Théo, membre de deux crews : le sélecteur ouvert, puis le second crew.
          page = await appLogin(browser, "theo@orasso.local", theme, width, scale);
          await go(page, "/crew");
          await shot(page, `appli-crew-multi-${tag}`);
          if (await tap(page, "crew-selector")) await shot(page, `appli-crew-selecteur-${tag}`);
          await page.context().close();
        }
      }
    }
  }

  for (const theme of ONLY === "app" ? [] : (["beton", "sable"] as const)) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      const kenji: [string, string][] = AFTER
        ? [
            ["crew-fil", "/app/crew"],
            ["crew-sorties", "/app/crew?onglet=sorties"],
            ["crew-membres", "/app/crew?onglet=membres"],
            ["crew-spots", "/app/crew?onglet=spots"],
          ]
        : [
            ["crew-onglet", "/app/crew"],
            ["crews", "/app/crews"],
            ["crew-fil", `/c/${SLUG}`],
            ["crew-sorties", `/c/${SLUG}?onglet=sorties`],
            ["crew-garage", `/c/${SLUG}?onglet=garage`],
            ["crew-membres", `/c/${SLUG}?onglet=membres`],
          ];
      for (const [name, path] of kenji) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await shot(page, `site-${name}-${tag}`);
      }
      await ctx.close();

      const ctxP = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const pageP = await ctxP.newPage();
      await setTheme(pageP, theme);
      await loginInBrowser(pageP, "paul.photo@orasso.local", undefined, "/app");
      for (const [name, path] of [
        ["sans-crew", "/app/crew"],
        ["rejoindre", "/app/crews/rejoindre"],
        ["vitrine", `/c/${SLUG}`],
      ] as const) {
        await pageP.goto(path);
        await pageP.waitForLoadState("networkidle");
        await shot(pageP, `site-${name}-${tag}`);
      }
      await ctxP.close();

      if (AFTER) {
        const ctxT = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const pageT = await ctxT.newPage();
        await setTheme(pageT, theme);
        await loginInBrowser(pageT, "theo@orasso.local", undefined, "/app");
        await pageT.goto("/app/crew");
        await pageT.waitForLoadState("networkidle");
        await shot(pageT, `site-crew-multi-${tag}`);
        await ctxT.close();
      }
    }
  }
});
