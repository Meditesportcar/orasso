import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R6-police (police système agrandie sur le Pixel de Damien) : captures « avant » et « après » des écrans du
// passionné, à 384 px, échelle de police 1,0 et 1,3 (simulée en recette : `apps/mobile/src/lib/fontScaleSim.ts`), Béton
// et Sable. Même liste avant et après : `CAPTURES_DIR` choisit le dossier. Aucune assertion : des photos à comparer
// (à l'échelle 1,0, pixel à pixel). APP_URL (appli compilée) et API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6-police-captures/avant`;
const WIDTH = 384;
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
const SCALES = [1, 1.3];

async function openApp(browser: Browser, theme: Theme, scale: number) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1400 }, baseURL: APP });
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
  return { ctx, page };
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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

/** Chemin, nom, puis l'élément à toucher avant la photo (facultatif) et le nombre d'écrans à faire défiler. */
type Shot = { path: string; name: string; tap?: string; pages?: number };
const SHOTS: Shot[] = [
  { path: "/accueil", name: "accueil", pages: 2 },
  { path: "/explorer", name: "explorer" },
  { path: "/e/cars-and-coffee-plage", name: "fiche-plage", pages: 4 },
  { path: "/e/nocturne-de-canet-2026", name: "fiche-nocturne", pages: 2 },
  { path: "/e/nocturne-de-canet-2026", name: "fiche-nocturne-inviter", tap: "invite-open" },
  { path: "/e/nocturne-de-canet-2026", name: "fiche-nocturne-candidater", tap: "event-primary" },
  { path: "/e/cars-and-coffee-plage", name: "mon-qr", tap: "event-primary" },
  { path: "/e/cars-and-coffee-plage", name: "qui-y-va", tap: "who-goes-people" },
  { path: "/sorties", name: "sorties", pages: 2 },
  { path: "/garage", name: "garage", pages: 2 },
  { path: "/vehicule/nouveau", name: "vehicule-nouveau" },
  { path: "/profil", name: "profil", pages: 2 },
  { path: "/reglages", name: "reglages", pages: 2 },
  { path: "/reseau", name: "reseau" },
  { path: "/u/damien_66", name: "membre-damien" },
  { path: "/crew/roussillon-drift", name: "crew-fil", tap: "crew-tab-feed" },
  { path: "/crew/roussillon-drift", name: "crew-sorties", tap: "crew-tab-outings" },
  { path: "/crew/roussillon-drift", name: "crew-garage", tap: "crew-tab-garage" },
  { path: "/crew/roussillon-drift", name: "crew-membres", tap: "crew-tab-members" },
  { path: "/boite", name: "boite" },
  { path: "/boite", name: "journal", tap: "inbox-journal" },
];

test("R6-police captures : passionné, 384 px, échelle 1,0 et 1,3", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(3_600_000);
  mkdirSync(DIR, { recursive: true });
  const only = process.env.SHOTS ? new Set(process.env.SHOTS.split(",")) : null;
  for (const scale of SCALES) {
    for (const theme of THEMES) {
      const { ctx, page } = await openApp(browser, theme, scale);
      await signIn(page, "kenji@orasso.local");
      for (const shot of SHOTS) {
        if (only && !only.has(shot.name)) continue;
        const tag = `${theme}-x${String(scale).replace(".", "")}`;
        await page.goto(shot.path);
        await afterOpening(page);
        await page.waitForTimeout(2500);
        if (shot.tap) {
          await page
            .getByTestId(shot.tap)
            .first()
            .click()
            .catch(() => undefined);
          await page.waitForTimeout(1500);
        }
        for (let i = 0; i < (shot.pages ?? 1); i++) {
          if (i > 0) {
            await page.mouse.move(WIDTH / 2, 700);
            await page.mouse.wheel(0, 1100);
            await page.waitForTimeout(1200);
          }
          await page.screenshot({ path: `${DIR}/${shot.name}${i ? `-${i + 1}` : ""}-${tag}.png` });
        }
      }
      await ctx.close();
    }
  }
});
