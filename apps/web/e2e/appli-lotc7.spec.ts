import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, createPublishedPro, MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot C7 (finitions relevées par les relectures), côté appli (version web compilée) : la battle autour du O de
// l'accueil d'arrivée (traces de pneus, voitures à la taille de l'artefact, fumée ; mouvement réduit : logo composé,
// sans voitures ni traces), l'en-tête de l'Administration à 390 px (la Boîte reste dans l'écran), le SIRET enregistré
// par « Enregistrer » de la fiche pro, les tickets de Presse, Candidatures et Missions au style de l'artefact.
// Lancer avec APP_URL=http://localhost:<port de l'appli> (`node scripts/appli-compilee.mjs`), API seedée.
// Captures à 390 px dans les deux thèmes : `CAPTURES_DIR`, sinon `<relais>/lot-c7-captures/<C7_PHASE>` (avant | apres).
const APP = process.env.APP_URL;
const PHASE = process.env.C7_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-c7-captures/${PHASE}/appli`;
const THEMES = ["beton", "sable"] as const;
type Theme = (typeof THEMES)[number];
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function open(browser: Browser, theme: Theme, reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP, reducedMotion });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click({ position: { x: 40, y: 600 } }).catch(() => {});
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

/** Un SIRET de 14 chiffres valide (clé de Luhn), inconnu du registre. */
function luhnSiret(): string {
  const body = `9${String(Date.now()).slice(-12)}`;
  for (let d = 0; d <= 9; d++) {
    const n = `${body}${d}`;
    const sum = [...n]
      .reverse()
      .map(Number)
      .reduce((s, x, i) => s + (i % 2 ? (x * 2 > 9 ? x * 2 - 9 : x * 2) : x), 0);
    if (sum % 10 === 0) return n;
  }
  return `${body}0`;
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

test("accueil d'arrivée : battle en tandem autour du O, traces et fumée ; mouvement réduit figé", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.evaluate((t) => localStorage.setItem("orasso.theme", t), theme);
    await page.goto("/arrivee");
    await expect(page.getByTestId("arrivee-accueil")).toBeVisible({ timeout: 60_000 });
    // Pendant la battle : des traces de pneus (chemins SVG dessinés) sous les voitures.
    await page.waitForTimeout(900);
    const traced = await page.evaluate(
      () =>
        // Une trace : une ligne brisée de 7 points (« M x y » puis six « L x y »).
        [...document.querySelectorAll('[data-testid="arrivee-accueil"] path')].filter((p) => {
          const TRACE = /^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+){6}$/;
          const d = p.getAttribute("d") ?? "";
          return TRACE.test(d) && Number(p.getAttribute("stroke-opacity") ?? "0") > 0;
        }).length,
    );
    expect(traced).toBeGreaterThan(0);
    await shot(page, `01-arrivee-battle-${theme}`);
    await page.waitForTimeout(2600);
    await shot(page, `02-arrivee-compose-${theme}`);
    await expect(page.getByText("Tout le monde à sa place.")).toBeVisible();
    await ctx.close();
  }
  // Mouvement réduit : le logo composé tout de suite, ni voitures ni traces.
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/arrivee");
  await expect(page.getByTestId("arrivee-accueil")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(400);
  const lines = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="arrivee-accueil"] path')].filter((p) =>
        /^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+){6}$/.test(p.getAttribute("d") ?? ""),
      ).length,
  );
  expect(lines).toBe(0);
  await shot(page, "03-arrivee-reduit-beton");
  await ctx.close();
});

test("administration : la Boîte de l'en-tête reste dans l'écran à 390 px", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await page.goto("/moi");
    await page.getByTestId("casquette-admin").click();
    await page.waitForURL(/administration/, { timeout: 30_000 });
    await page.goto("/signalements");
    await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 15_000 });
    const inbox = page.getByRole("button", { name: "Boîte", exact: true }).first();
    await expect(inbox).toBeVisible({ timeout: 30_000 });
    await shot(page, `04-admin-signalements-${theme}`);
    const box = await inbox.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(MOBILE.width);
    // La pastille garde le rôle dans son libellé accessible.
    await expect(page.getByTestId("topbar-persona")).toHaveAttribute("aria-label", /Administration/);
    await ctx.close();
  }
});

test("fiche pro : « Enregistrer » enregistre aussi le SIRET saisi (contrôle du registre)", async ({ browser }) => {
  test.setTimeout(240_000);
  const s = unique();
  const pseudo = `SiretC7_${s}`;
  const cookie = await signUpApi(pseudo);
  await createPublishedPro(cookie, `Garage C7 ${s}`);
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await page.goto("/moi");
  await page.getByTestId("casquette-pro").click();
  await page.waitForURL(/\/accueil/);
  await page.goto("/fiche");
  await page.getByText("Modifier ma fiche", { exact: true }).click();
  const siret = luhnSiret();
  await page.getByTestId("pro-siret-field").fill(siret);
  await shot(page, "05-fiche-siret-beton");
  await page.getByTestId("pro-form-save").click();
  // Sans « Contrôler » : le registre a été interrogé (trouvé, introuvable ou injoignable, le résultat est gardé).
  await expect
    .poll(
      async () => (await apiCall<{ registryCheck: unknown } | null>(cookie, "GET", "/me/pro")).data?.registryCheck,
      {
        timeout: 30_000,
      },
    )
    .not.toBeNull();
  await expect(page.getByTestId("pro-siret-result").or(page.getByTestId("pro-siret-notice"))).toBeVisible({
    timeout: 20_000,
  });
  await shot(page, "06-fiche-siret-enregistre-beton");
  await ctx.close();
});

async function toPersona(page: Page, kind: "provider" | "media") {
  await page.goto("/moi");
  await page.getByTestId(`casquette-${kind}`).first().click();
  await page.waitForURL(/\/accueil/, { timeout: 60_000 });
}

async function tab(page: Page, label: string) {
  await page.getByRole("tab", { name: label, exact: true }).click();
  await page.waitForTimeout(800);
}

test("tickets de Missions, Candidatures et Presse (gabarit `.tk` de l'artefact)", async ({ browser }) => {
  test.setTimeout(360_000);
  for (const theme of THEMES) {
    const sofia = await open(browser, theme);
    await signIn(sofia.page, "sofia@orasso.local");
    await toPersona(sofia.page, "provider");
    await tab(sofia.page, "Missions");
    await expect(sofia.page.getByTestId("mission-card").first()).toBeVisible({ timeout: 30_000 });
    await shot(sofia.page, `07-missions-${theme}`);
    await tab(sofia.page, "Candidatures");
    await sofia.page.waitForTimeout(1500);
    await shot(sofia.page, `08-candidatures-${theme}`);
    await sofia.ctx.close();

    const leo = await open(browser, theme);
    await signIn(leo.page, "leo@orasso.local");
    await toPersona(leo.page, "media");
    await tab(leo.page, "Presse");
    await leo.page.waitForTimeout(1500);
    await shot(leo.page, `09-presse-${theme}`);
    await tab(leo.page, "Accueil");
    await leo.page.waitForTimeout(1500);
    await shot(leo.page, `10-accueil-media-${theme}`);
    await leo.ctx.close();
  }
});
