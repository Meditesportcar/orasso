import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7c2 : captures avant / après des écrans de la Boîte, de l'Activité et des Messages. À lancer sur la branche telle
// que reçue (`CAPTURES_DIR` = …/lot-r7c2-captures/avant, `AVANT=1`) puis après le lot (…/apres). Damien_66 (le seed
// « Activité » : horaire modifié, flammes regroupées, identification, trois demandes, une demande de message) et Kenji
// (conversations). Appli à 384 px (police 1 et 1,3, Pixel de Damien) et 390 px, site à 390 et 1 280 px, Béton et Sable.
// Seulement des captures : les règles se vérifient dans `appli-lotr7c2` et `lotr7c2-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7c2-captures/apres`;
const AFTER = process.env.AVANT !== "1";
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
  await page.waitForURL(/accueil|explorer|sorties|profil|evenements|equipe/, { timeout: 30_000 });
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await page.waitForTimeout(1_400);
}

test("R7c2 : captures avant / après (Boîte, Activité, Demandes, Messages, conversation, Journal)", async ({
  browser,
}) => {
  test.setTimeout(2_400_000);
  mkdirSync(DIR, { recursive: true });

  if (APP) {
    for (const theme of ["beton", "sable"] as const) {
      for (const [width, scale] of [
        [384, 1],
        [384, 1.3],
        [390, 1],
      ] as const) {
        const tag = `${width}-x${scale}-${theme}`;
        // Damien_66 : Activité, Demandes, Messages.
        const page = await appLogin(browser, "damien@orasso.local", theme, width, scale);
        if (!AFTER) {
          await go(page, "/boite");
          await shot(page, `appli-boite-tout-${tag}`);
          await page.getByTestId("inbox-messages").click();
          await shot(page, `appli-boite-messages-${tag}`);
          await page.getByTestId("inbox-requests").click();
          await shot(page, `appli-boite-demandes-${tag}`);
        } else {
          await go(page, "/activite");
          await shot(page, `appli-activite-${tag}`);
          await go(page, "/activite/demandes");
          await shot(page, `appli-activite-demandes-${tag}`);
          await go(page, "/messages");
          await shot(page, `appli-messages-${tag}`);
          await go(page, "/messages/demandes");
          await shot(page, `appli-messages-demandes-${tag}`);
        }
        await page.context().close();
        // Kenji : une conversation.
        const k = await appLogin(browser, "kenji@orasso.local", theme, width, scale);
        await go(k, AFTER ? "/messages" : "/boite");
        if (!AFTER) await k.getByTestId("inbox-messages").click();
        await shot(k, `appli-conversations-${tag}`);
        await k.getByTestId("conversation-row").first().click();
        await k.waitForTimeout(1_500);
        await shot(k, `appli-conversation-${tag}`);
        await k.context().close();
      }
    }
  }

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
      const pages = AFTER
        ? ([
            ["activite", "/app/activite"],
            ["activite-demandes", "/app/activite/demandes"],
            ["messages", "/app/messages"],
            ["messages-demandes", "/app/messages/demandes"],
          ] as const)
        : ([
            ["boite", "/app/boite"],
            ["boite-demandes", "/app/boite/demandes"],
            ["journal", "/app/journal"],
          ] as const);
      for (const [name, path] of pages) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await shot(page, `site-${name}-${tag}`);
      }
      await ctx.close();
      // Kenji : une conversation.
      const kctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const kp = await kctx.newPage();
      await setTheme(kp, theme);
      await loginInBrowser(kp, "kenji@orasso.local", undefined, "/app");
      await kp.goto(AFTER ? "/app/messages" : "/app/boite");
      await kp.waitForLoadState("networkidle");
      await shot(kp, `site-conversations-${tag}`);
      const first = kp.locator("a[href*='/app/messages/'], a[href*='/app/boite/']").first();
      if (await first.count()) {
        await first.click();
        await kp.waitForLoadState("networkidle");
        await shot(kp, `site-conversation-${tag}`);
      }
      await kctx.close();
    }
  }
});
