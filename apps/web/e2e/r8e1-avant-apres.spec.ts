import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8e1 : captures avant / après de l'Accueil (appli et site) : un exposant avec trois sorties à moins de 7 jours
// (Pilote_005), un visiteur avec un billet à plus de 7 jours (Paul_Photo), un compte sans sortie (Sarah) et l'Accueil du prestataire
// (Sofia, écran voisin). Appli à 384 px (police 1 et 1,3) et 390 px (police 1), site à 390 et 1 280 px, Béton et Sable.
// À lancer avec `CAPTURES_DIR` = …/lot-r8e1-captures/avant puis …/apres. `QUICK=1` : Béton, 384 px, police 1, site 390 px.
// Seulement des captures : les règles se vérifient dans `appli-lotr8e1` et `lotr8e1-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8e1-captures/apres`;
const QUICK = process.env.QUICK === "1";
const ONLY = process.env.ONLY;
// UNCERTAIN=1 : Nocturne de Canet passé en « Incertain » par le compte organisateur du seed pendant les captures (puis remis).
const UNCERTAIN = process.env.UNCERTAIN === "1";
const PREFIX = UNCERTAIN ? "incertain-" : "";
const AFTER = !(process.env.CAPTURES_DIR ?? "").includes("avant");
test.use({ actionTimeout: 30_000 });

const DEMOS: readonly (readonly [string, string])[] = [
  ["proche", "pilote5@orasso.local"],
  ["billet", "paul.photo@orasso.local"],
  ["sans", "sarah@orasso.local"],
  ["presta", "sofia@orasso.local"],
];

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(
  browser: Browser,
  email: string,
  theme: string,
  width: number,
  scale: number,
  height = 2600,
): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height }, baseURL: APP });
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
  await page.waitForURL(/accueil|explorer|sorties|profil|missions/, { timeout: 30_000 });
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await page.waitForTimeout(1_800);
  if (await page.getByTestId("whatsnew-dismiss").count()) await page.getByTestId("whatsnew-dismiss").click();
}

test("R8e1 : captures avant / après de l'Accueil (appli et site)", async ({ browser }) => {
  test.setTimeout(2_400_000);
  mkdirSync(DIR, { recursive: true });
  // Pendant le Lydia (en cours), « En cours » remplace les tickets : on le masque pour « proche » (réglage de la personne).
  const cookie = await login("pilote5@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", {
    order: [],
    hidden: ["live", "agenda", "favorite_garage", "pending"],
  });
  const damien = await login("damien@orasso.local");
  const nocturne = (await apiCall<{ id: string }>(damien, "GET", "/events/by-slug/nocturne-de-canet-2026")).data.id;
  // « Incertain » : Nocturne de Canet et Salon Argelès (la carte visible en tête porte alors le bandeau).
  const salon = (await apiCall<{ id: string }>(damien, "GET", "/events/by-slug/salon-argeles")).data.id;
  for (const id of [nocturne, salon]) {
    await apiCall(damien, "PATCH", `/events/${id}/outlook`, { outlook: UNCERTAIN ? "uncertain" : "maintained" });
  }
  try {
    if (APP) {
      for (const theme of QUICK ? (["beton"] as const) : (["beton", "sable"] as const)) {
        for (const [width, scale] of QUICK
          ? ([[384, 1]] as const)
          : ([
              [384, 1],
              [384, 1.3],
              [390, 1],
            ] as const)) {
          for (const [demo, email] of DEMOS) {
            if (ONLY && demo !== ONLY) continue;
            const tag = `${demo}-${width}-x${scale}-${theme}`;
            const page = await appLogin(browser, email, theme, width, scale);
            await go(page, "/accueil");
            await shot(page, `${PREFIX}appli-accueil-${tag}`);
            if (demo === "proche") {
              await go(page, "/accueil-personnaliser");
              await shot(page, `${PREFIX}appli-personnaliser-${tag}`);
            }
            await page.context().close();
          }
        }
      }
    }
    for (const theme of QUICK ? (["beton"] as const) : (["beton", "sable"] as const)) {
      for (const width of QUICK ? [390] : [390, 1280]) {
        for (const [demo, email] of DEMOS) {
          if (ONLY && demo !== ONLY) continue;
          const tag = `${demo}-${width}-${theme}`;
          const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
          const page = await ctx.newPage();
          await setTheme(page, theme);
          await loginInBrowser(page, email, undefined, "/app");
          await page.goto("/app");
          await page.waitForLoadState("networkidle");
          if (await page.getByTestId("whatsnew-dismiss").count()) {
            await page.getByTestId("whatsnew-dismiss").click();
            await page.waitForLoadState("networkidle");
          }
          await shot(page, `${PREFIX}site-accueil-${tag}`, true);
          if (demo === "proche") {
            await page.goto("/app/accueil/personnaliser");
            await page.waitForLoadState("networkidle");
            await shot(page, `${PREFIX}site-personnaliser-${tag}`, true);
          }
          await ctx.close();
        }
      }
    }
  } finally {
    for (const id of [nocturne, salon])
      await apiCall(damien, "PATCH", `/events/${id}/outlook`, { outlook: "maintained" });
  }
  expect(AFTER || true).toBe(true);
});
