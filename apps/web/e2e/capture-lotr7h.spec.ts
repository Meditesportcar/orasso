import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R7h : captures des écrans touchés (appli et site), Béton et Sable, avant et après. Dossier : CAPTURES_DIR
// (`…/lot-r7h-captures/avant` ou `/apres`). Appli : APP_URL (version compilée) ; site : E2E_BASE_URL.
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7h-captures/avant`).replaceAll("\\", "/");
test.use({ actionTimeout: 30_000 });
test.setTimeout(600_000);

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: string, width: number, scale = 1) {
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
  await page.waitForURL(/accueil|moi|direct/, { timeout: 60_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string, full = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
}

const variants = [
  { theme: "beton", width: 384, scale: 1, tag: "384" },
  { theme: "sable", width: 384, scale: 1, tag: "384" },
  { theme: "beton", width: 390, scale: 1, tag: "390" },
  { theme: "sable", width: 384, scale: 1.3, tag: "384x13" },
] as const;

for (const v of variants) {
  test(`appli ${v.theme} ${v.tag} : Accueil en cours, Activité, barre et visionneuse, Direct organisateur`, async ({
    browser,
  }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    await sql("delete from story_views");
    const name = (s: string) => `appli-${s}-${v.theme}-${v.tag}`;
    {
      const { ctx, page } = await open(browser, "damien@orasso.local", v.theme, v.width, v.scale);
      await page.goto("/accueil");
      await afterOpening(page);
      await expect(page.getByTestId("home-live-block")).toBeVisible({ timeout: 40_000 });
      await shot(page, name("accueil-en-cours"), true);
      await page.goto("/activite");
      await afterOpening(page);
      await page.waitForTimeout(1500);
      await shot(page, name("activite"), true);
      await page.goto("/fil");
      await afterOpening(page);
      await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
      await shot(page, name("fil-barre"));
      await page.getByLabel(/Voir les stories de Kenji_66/).click();
      await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      await shot(page, name("visionneuse-kenji"));
      await ctx.close();
    }
    {
      const { ctx, page } = await open(browser, "sarah@orasso.local", v.theme, v.width, v.scale);
      await page.goto("/moi");
      await afterOpening(page);
      await page.getByTestId("casquette-organizer").filter({ hasText: "Roues Libres" }).first().click();
      await page.waitForURL(/\/direct/, { timeout: 60_000 });
      await expect(page.getByTestId("orga-direct-event")).toBeVisible({ timeout: 40_000 });
      await shot(page, name("orga-direct"), true);
      await ctx.close();
    }
  });
}

for (const v of [
  { theme: "beton", width: 390, height: 844, tag: "390" },
  { theme: "sable", width: 390, height: 844, tag: "390" },
  { theme: "beton", width: 1280, height: 900, tag: "1280" },
  { theme: "sable", width: 1280, height: 900, tag: "1280" },
] as const) {
  test(`site ${v.theme} ${v.tag} : accueil en cours, Activité, visionneuse, événement de l'organisateur`, async ({
    browser,
  }) => {
    test.skip(!process.env.E2E_SITE, "Site : lancer avec E2E_SITE=1");
    await sql("delete from story_views");
    const name = (s: string) => `site-${s}-${v.theme}-${v.tag}`;
    const kenji = (await sql<{ id: string }>(`select id from "user" where email = 'kenji@orasso.local'`))[0]?.id ?? "";
    const ev = (await sql<{ id: string }>("select id from events where slug = 'rassemblement-du-lydia'"))[0]?.id ?? "";
    for (const who of ["damien@orasso.local", "sarah@orasso.local"]) {
      if (process.env.ONLY === "orga" && who.startsWith("damien")) continue;
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
      const page = await ctx.newPage();
      await loginInBrowser(page, who, SEED_PASSWORD, "/app");
      await setTheme(page, v.theme);
      if (who.startsWith("damien")) {
        await page.goto("/app");
        await page.waitForLoadState("networkidle");
        await shot(page, name("accueil-en-cours"), true);
        await page.goto("/app/activite");
        await page.waitForLoadState("networkidle");
        await shot(page, name("activite"), true);
        await page.goto("/app/fil");
        await page.waitForLoadState("networkidle");
        await shot(page, name("fil-barre"));
        await page.goto(`/app/story/u:${kenji}`);
        await page.waitForLoadState("networkidle");
        await shot(page, name("visionneuse-kenji"));
      } else {
        await page.goto(`/orga/roues-libres-66/e/${ev}`);
        await page.waitForLoadState("networkidle");
        await shot(page, name("orga-evenement"), true);
      }
      await ctx.close();
    }
  });
}

// Tour 2 : les écrans à comparer à la maquette (`og_men`, `og_add`, `og_mine`, `sk_encours_si_1`), Béton et Sable, 384 police 1
// et 1,3. Une story neuve de Kenji_66 qui identifie la structure : la liste, l'écran d'ajout (avant l'ajout), puis « Ma
// story » et la visionneuse de Damien (après l'ajout par l'API). CAPTURES_DIR = `…/lot-r7h-captures/paires-reel`.
for (const v of [
  { theme: "beton", scale: 1, tag: "384" },
  { theme: "sable", scale: 1, tag: "384" },
  { theme: "beton", scale: 1.3, tag: "384x13" },
  { theme: "sable", scale: 1.3, tag: "384x13" },
] as const) {
  test(`paires maquette ${v.theme} ${v.tag} : Mentions, Ajouter, Ma story, visionneuse avec crédit`, async ({
    browser,
  }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    await sql("delete from stories where shared_from_story_id is not null");
    await sql("update story_tags set removed_at = null");
    await sql("delete from story_views");
    const { apiCall, login } = await import("./helpers");
    const { dropStory, publishStory } = await import("./lotr7f2-setup");
    const structure =
      (await sql<{ id: string }>("select id from structures where slug = 'roues-libres-66'"))[0]?.id ?? "";
    const kenji = await login("kenji@orasso.local");
    const id = await publishStory(kenji, {
      audience: "public",
      caption: "Concours d'élégance à 15 h, on se place",
      tags: [{ kind: "structure", id: structure }],
    });
    const name = (s: string) => `${s}-${v.theme}-${v.tag}`;
    try {
      const sarah = await open(browser, "sarah@orasso.local", v.theme, 384, v.scale);
      await sarah.page.goto("/moi");
      await afterOpening(sarah.page);
      await sarah.page.getByTestId("casquette-organizer").filter({ hasText: "Roues Libres" }).first().click();
      await sarah.page.waitForURL(/\/direct/, { timeout: 60_000 });
      await sarah.page.getByTestId("orga-direct-mentions").click();
      await expect(sarah.page.getByTestId("mention-row").first()).toBeVisible({ timeout: 40_000 });
      await shot(sarah.page, name("og_men"));
      await sarah.page.getByTestId("mention-row").filter({ hasText: "Kenji_66" }).first().click();
      await expect(sarah.page.getByTestId("mention-add")).toBeVisible({ timeout: 30_000 });
      await shot(sarah.page, name("og_add"));
      const cookie = await login("sarah@orasso.local");
      expect((await apiCall(cookie, "POST", `/stories/${id}/share-to-mine`, { asStructureId: structure })).status).toBe(
        201,
      );
      await sarah.page.goto("/story/ma-story");
      await afterOpening(sarah.page);
      await expect(sarah.page.getByTestId("mystory-row").first()).toBeVisible({ timeout: 40_000 });
      await shot(sarah.page, name("og_mine"));
      await sarah.ctx.close();

      await sql("delete from story_views");
      const damien = await open(browser, "damien@orasso.local", v.theme, 384, v.scale);
      await damien.page.goto("/fil");
      await afterOpening(damien.page);
      await damien.page
        .getByTestId(`stories-author-s:${structure}`)
        .getByLabel(/Voir les stories de/)
        .click();
      await expect(damien.page.getByTestId("story-shared-by")).toBeVisible({ timeout: 40_000 });
      await shot(damien.page, name("sk_encours_si_1"));
      await damien.ctx.close();
    } finally {
      await dropStory(kenji, id);
      await sql("delete from stories where shared_from_story_id is not null");
    }
  });
}
