import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, loginInBrowser, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { phaseDir, RELAIS } from "./relais";

// Lot R9c : captures « avant » / « après » des écrans que l'étiquette « Offre » touche. PHASE=avant|apres.
// Appli (version compilée, `APP_URL`) : Béton et Sable, 384 et 390 px, police ×1 et ×1,3 (quatre combinaisons) ; site
// (API et site lancés) : 390 et 1280 px. Écrans : « Publier » en fiche pro, la fiche d'un pro (propriétaire, abonné, non abonné,
// sans session), `(pro)/publier` (appli) et `/pro/<fiche>/publications` (site). Après : l'onglet « Offres », l'offre publiée.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = phaseDir(`${RELAIS}/lot-r9c-captures/${PHASE}`, PHASE);
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.use({ actionTimeout: 30_000 });

const COMBOS = [
  { theme: "beton", width: 390, scale: 1 },
  { theme: "sable", width: 390, scale: 1 },
  { theme: "beton", width: 384, scale: 1.3 },
  { theme: "sable", width: 384, scale: 1.3 },
] as const;

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function openApp(browser: Browser, email: string, theme: string, width: number, scale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
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

async function shot(page: Page, name: string, height = 1900) {
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 390, height });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
  await page.waitForTimeout(1500);
}

/** Un compte neuf qui suit (ou non) la fiche : le regard « abonné » et « non abonné ». */
async function visitor(slug: string, follow: boolean) {
  const pseudo = `Vis${follow ? "A" : "N"}${unique()}`.slice(0, 18);
  const cookie = await signUpApi(pseudo);
  const pro = await apiCall<{ id: string }>(cookie, "GET", `/pros/by-slug/${slug}`);
  if (follow) await apiCall(cookie, "POST", `/pros/${pro.data.id}/follow`);
  return { email: `${pseudo.toLowerCase()}@e2e.orasso.test`, proId: pro.data.id };
}

const OWNER = { email: "covering@orasso.local", slug: "atelier-covering-66" };
const GARAGE = { email: "garage@orasso.local", slug: "garage-du-port" };

for (const { theme, width, scale } of COMBOS) {
  const tag = `${theme}-${width}-x${String(scale).replace(".", "")}`;
  test(`appli ${tag}`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    test.setTimeout(480_000);
    const abonne = await visitor(GARAGE.slug, true);
    const nonAbonne = await visitor(GARAGE.slug, false);
    // Le propriétaire (Atelier Covering 66) : « Publier » en fiche pro, sa fiche, l'espace pro.
    {
      const { ctx, page } = await openApp(browser, OWNER.email, theme, width, scale);
      await visit(page, "/fil/publier");
      await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
      await page
        .getByTestId(/fil-publish-as-pro:/)
        .first()
        .click();
      await shot(page, `publier-fiche-pro-${tag}`, 2600);
      await visit(page, `/p/${OWNER.slug}`);
      await shot(page, `fiche-proprietaire-presentation-${tag}`);
      await visit(page, `/p/${OWNER.slug}?onglet=publications`);
      await shot(page, `fiche-proprietaire-publications-${tag}`);
      if (PHASE === "apres") {
        await visit(page, `/p/${OWNER.slug}?onglet=offres`);
        await shot(page, `fiche-proprietaire-offres-${tag}`);
      }
      await ctx.close();
    }
    // Le Garage du Port (une ancienne « offre et actualité ») : le propriétaire, un abonné, un non-abonné.
    for (const [who, email] of [
      ["proprietaire", GARAGE.email],
      ["abonne", abonne.email],
      ["non-abonne", nonAbonne.email],
    ] as const) {
      const { ctx, page } = await openApp(browser, email, theme, width, scale);
      await visit(page, `/p/${GARAGE.slug}`);
      await shot(page, `fiche-garage-${who}-presentation-${tag}`);
      if (PHASE === "apres") {
        await visit(page, `/p/${GARAGE.slug}?onglet=offres`);
        await shot(page, `fiche-garage-${who}-offres-${tag}`);
      }
      await ctx.close();
    }
    // Un visiteur d'Atelier Covering 66 : abonné ou non, le regard sur l'onglet « Offres ».
    if (PHASE === "apres") {
      const { ctx, page } = await openApp(browser, nonAbonne.email, theme, width, scale);
      await visit(page, `/p/${OWNER.slug}?onglet=offres`);
      await shot(page, `fiche-covering-visiteur-offres-${tag}`);
      await ctx.close();
    }
  });
}

/** L'espace pro de l'appli (`(pro)/publier`) : la casquette Pro d'abord (sinon l'écran renvoie à l'accueil). */
async function proSpace(page: Page) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-pro").click();
  await page.waitForURL(/accueil/);
  await visit(page, "/publier");
}

for (const { theme, width, scale } of COMBOS) {
  const tag = `${theme}-${width}-x${String(scale).replace(".", "")}`;
  test(`appli espace pro ${tag}`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    test.setTimeout(240_000);
    for (const [name, email] of [
      ["covering", OWNER.email],
      ["garage", GARAGE.email],
    ] as const) {
      const { ctx, page } = await openApp(browser, email, theme, width, scale);
      await proSpace(page);
      await shot(page, `espace-pro-${name}-${tag}`);
      await ctx.close();
    }
  });
}

for (const width of [390, 1280]) {
  test(`site ${width}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const abonne = await visitor(GARAGE.slug, true);
    const nonAbonne = await visitor(GARAGE.slug, false);
    const make = async (email: string | null) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      if (email) await loginInBrowser(page, email, SEED_PASSWORD, "/app/accueil");
      return { ctx, page };
    };
    const slug = async (page: Page, path: string, name: string) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await shot(page, `${name}-${width}`, width > 700 ? 1500 : 2200);
    };
    {
      const { ctx, page } = await make(null);
      await slug(page, `/p/${GARAGE.slug}`, "site-fiche-garage-sans-session");
      await slug(page, `/p/${OWNER.slug}`, "site-fiche-covering-sans-session");
      await ctx.close();
    }
    for (const [who, email] of [
      ["proprietaire", GARAGE.email],
      ["abonne", abonne.email],
      ["non-abonne", nonAbonne.email],
    ] as const) {
      const { ctx, page } = await make(email);
      await slug(page, `/p/${GARAGE.slug}`, `site-fiche-garage-${who}`);
      if (PHASE === "apres") await slug(page, `/p/${GARAGE.slug}?onglet=offres`, `site-fiche-garage-${who}-offres`);
      await ctx.close();
    }
    {
      const { ctx, page } = await make(OWNER.email);
      await slug(page, `/p/${OWNER.slug}`, "site-fiche-covering-proprietaire");
      await slug(page, `/p/${OWNER.slug}?onglet=publications`, "site-fiche-covering-proprietaire-publications");
      if (PHASE === "apres")
        await slug(page, `/p/${OWNER.slug}?onglet=offres`, "site-fiche-covering-proprietaire-offres");
      await page.goto("/app/fil/publier");
      await page.waitForLoadState("networkidle");
      const as = page.getByTestId(/fil-publish-as-pro:/).first();
      if (await as.isVisible().catch(() => false)) await as.click();
      await shot(page, `site-publier-fiche-pro-${width}`, 2600);
      await page.goto(`/pro/${OWNER.slug}/publications`);
      await page.waitForLoadState("networkidle");
      await shot(page, `site-espace-pro-publications-${width}`, 1800);
      await ctx.close();
    }
  });
}

/** Tour 2 : « Publier » avec l'étiquette « Offre » choisie (titre, dates, étiquette dans « Ce que verront les autres »), un refus, la carte, la publication seule, l'offre terminée. */
async function coveringPosts(): Promise<{ proId: string; current: string; ended: string }> {
  const { login } = await import("./helpers");
  const cookie = await login(OWNER.email);
  const pro = await apiCall<{ id: string }>(cookie, "GET", `/pros/by-slug/${OWNER.slug}`);
  const list = await apiCall<{ items: { id: string; offer: { state: string } | null }[] }>(
    cookie,
    "GET",
    `/authors/p:${pro.data.id}/feed-posts`,
  );
  const of = (state: string) => list.data.items.find((p) => p.offer?.state === state)?.id ?? "";
  return { proId: pro.data.id, current: of("current"), ended: of("ended") };
}

for (const { theme, width, scale } of COMBOS) {
  const tag = `${theme}-${width}-x${String(scale).replace(".", "")}`;
  test(`appli offre ${tag}`, async ({ browser }) => {
    test.skip(!APP || PHASE !== "apres", "Appli, après");
    test.setTimeout(300_000);
    const ids = await coveringPosts();
    const { ctx, page } = await openApp(browser, OWNER.email, theme, width, scale);
    await visit(page, `/fil/publier?fiche=${ids.proId}&etiquette=offre`);
    await expect(page.getByTestId("fil-publish-offer")).toBeVisible({ timeout: 30_000 });
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("fil-publish-add").click();
    await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
    await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId("fil-publish-photo").first().click();
    await page.getByTestId("fil-publish-none").click();
    await page.getByTestId("fil-publish-none-yes").click();
    await shot(page, `publier-offre-refus-sans-titre-${tag}`, 3000);
    await page.getByTestId("fil-publish-offer-title").fill("Polish complet avant l'hiver");
    await page.getByTestId("fil-publish-offer-edit").click();
    await page
      .getByTestId("fil-publish-offer-start")
      .fill(new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
    await page
      .getByTestId("fil-publish-offer-end")
      .fill(new Date(Date.now() + 20 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
    await shot(page, `publier-offre-complete-${tag}`, 3000);
    await visit(page, `/publication/${ids.current}`);
    await shot(page, `publication-offre-en-cours-${tag}`, 1400);
    await visit(page, `/publication/${ids.ended}`);
    await shot(page, `publication-offre-terminee-${tag}`, 1400);
    await visit(page, `/p/${OWNER.slug}?onglet=offres`);
    await shot(page, `fiche-onglets-offres-${tag}`, 1000);
    await ctx.close();
  });
}

test("site offre", async ({ browser }) => {
  test.skip(PHASE !== "apres", "Après");
  test.setTimeout(300_000);
  const ids = await coveringPosts();
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await loginInBrowser(page, OWNER.email, SEED_PASSWORD, "/app/accueil");
    for (const [name, path] of [
      ["publication-offre-en-cours", `/app/publication/${ids.current}`],
      ["publication-offre-terminee", `/app/publication/${ids.ended}`],
      ["fiche-onglets-offres", `/p/${OWNER.slug}?onglet=offres`],
      ["publier-offre", `/app/fil/publier?fiche=${ids.proId}&etiquette=offre`],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await shot(page, `site-${name}-${width}`, width > 700 ? 1500 : 2400);
    }
    await ctx.close();
  }
});
