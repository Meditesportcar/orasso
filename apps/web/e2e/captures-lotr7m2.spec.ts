import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";
import { landscape } from "./lotr7f3-setup";
import { dropMyStories, publishStory, sql, userIdOf } from "./lotr7f2-setup";

// Lot R7m2 : captures « avant » / « après » des écrans touchés par « Collaboration commerciale » : publier une story (étape
// Détails) et une publication du Fil, la visionneuse (auteur partenaire et pro cité), la carte du Fil, l'Activité du pro, la
// fiche du pro. PHASE=avant|apres. Appli : APP_URL (version compilée, 384 px police 1 et 390 px police 1,3) ; site : 390 et
// 1280 px. Données (comptes du seed : Kenji_66 est partenaire de Garage_Port) posées par l'API ; photos du seed seulement.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7m2-captures/${PHASE}`;
const CAPTION = "Covering satiné chez @garage-du-port, merci pour le travail";
const POST_CAPTION = "Covering satiné terminé hier chez @garage-du-port";
test.use({ actionTimeout: 30_000 });

let data: Promise<{ kenjiId: string }> | null = null;
/** Une story publique de Kenji (qui cite son partenaire) et une de ses publications du Fil, mises à jour. */
function ensureData() {
  data ??= (async () => {
    const kenji = await login("kenji@orasso.local");
    await dropMyStories(kenji);
    await publishStory(kenji, { caption: CAPTION, audience: "public" });
    const kenjiId = await userIdOf("Kenji_66");
    // La publication du Fil : on cite le pro dans la légende d'une publication du seed (la mention est posée comme l'API le fait).
    const [pro] = await sql<{ id: string }>("select id from pro_profiles where slug = 'garage-du-port'");
    await sql(
      `update feed_posts set caption = $2, commercial_partner_id = $3
       where id = (select id from feed_posts where author_id = $1 and deleted_at is null order by created_at desc limit 1)`,
      [kenjiId, POST_CAPTION, PHASE === "apres" ? (pro?.id ?? null) : null],
    );
    return { kenjiId };
  })();
  return data;
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: string, width: number, scale: number) {
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

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const SIZES = [
  { w: 384, s: 1 },
  { w: 390, s: 1.3 },
] as const;

for (const theme of ["beton", "sable"] as const) {
  for (const { w, s } of SIZES) {
    test(`appli ${theme} ${w} police ${s}`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(300_000);
      const { kenjiId } = await ensureData();
      const tag = `${theme}-${w}-f${String(s).replace(".", "")}`;

      // Kenji : l'étape Détails d'une story qui cite son partenaire, puis sa visionneuse et la carte du Fil.
      const k = await open(browser, "kenji@orasso.local", theme, w, s);
      await k.page.goto("/story/publier");
      await afterOpening(k.page);
      const chooser = k.page.waitForEvent("filechooser");
      await k.page.getByTestId("story-pick-gallery").click();
      await (await chooser).setFiles(landscape());
      await expect(k.page.getByTestId("story-fit")).toBeVisible({ timeout: 60_000 });
      await k.page.getByTestId("story-fit-continue").click();
      await expect(k.page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
      await k.page.getByTestId("story-plate-none").click();
      await k.page.getByTestId("story-plate-none-yes").click();
      await k.page.getByTestId("story-plate-validate").click();
      await expect(k.page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
      await k.page.getByTestId("story-caption").fill(CAPTION);
      await expect(k.page.getByTestId("story-caption")).toHaveValue(CAPTION);
      if (PHASE === "apres") await expect(k.page.getByTestId("commercial-required")).toBeVisible({ timeout: 30_000 });
      await shot(k.page, `publier-details-${tag}`);
      await k.page.getByTestId("story-caption").fill("Sans partenaire cité");
      if (PHASE === "apres") await expect(k.page.getByTestId("commercial-self")).toBeVisible();
      await shot(k.page, `publier-details-manuel-${tag}`);

      await k.page.goto("/fil");
      await afterOpening(k.page);
      const card = k.page.getByTestId("feed-card-feed_post").filter({ hasText: "garage-du-port" }).first();
      await card.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await shot(k.page, `fil-carte-${tag}`);
      await k.ctx.close();

      // Damien regarde la story de Kenji.
      const d = await open(browser, "damien@orasso.local", theme, w, s);
      await d.page.goto(`/story/u:${kenjiId}`);
      await afterOpening(d.page);
      await expect(d.page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      if (PHASE === "apres") await expect(d.page.getByTestId("story-commercial")).toBeVisible();
      await shot(d.page, `visionneuse-${tag}`);
      await d.ctx.close();

      // Le pro (Garage_Port) : sa visionneuse (« Repartager dans ma story »), son Activité, sa fiche.
      const p = await open(browser, "garage@orasso.local", theme, w, s);
      await p.page.goto(`/story/u:${kenjiId}`);
      await afterOpening(p.page);
      await expect(p.page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      if (PHASE === "apres") await expect(p.page.getByTestId("story-reshare")).toBeVisible({ timeout: 30_000 });
      await shot(p.page, `pro-visionneuse-${tag}`);
      await p.page.goto("/activite");
      await afterOpening(p.page);
      await shot(p.page, `pro-activite-${tag}`);
      await p.page.goto("/p/garage-du-port");
      await afterOpening(p.page);
      await shot(p.page, `fiche-pro-${tag}`);
      await p.ctx.close();
    });
  }
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      const { kenjiId } = await ensureData();
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/story/publier");
      await page.getByTestId("story-file").setInputFiles(landscape());
      await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("story-plate-none").click();
      await page.getByTestId("story-plate-none-yes").click();
      await expect(page.getByTestId("story-plate-blur")).toBeVisible();
      await page.getByTestId("story-caption").fill(CAPTION);
      if (PHASE === "apres") await expect(page.getByTestId("commercial-required")).toBeVisible({ timeout: 30_000 });
      await shot(page, `site-publier-details-${theme}-${width}`, true);
      await page.getByTestId("story-caption").fill("Sans partenaire cité");
      if (PHASE === "apres") await expect(page.getByTestId("commercial-self")).toBeVisible();
      await shot(page, `site-publier-details-manuel-${theme}-${width}`, true);

      await page.goto("/app/fil");
      const card = page.getByTestId("feed-card-feed_post").filter({ hasText: "garage-du-port" }).first();
      await card.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await shot(page, `site-fil-carte-${theme}-${width}`);

      await apiCall(null, "POST", "/auth/sign-out");
      await page.context().clearCookies();
      await loginInBrowser(page, "damien@orasso.local", undefined, `/app/story/u:${kenjiId}`);
      await expect(page.getByTestId("story-viewer-root")).toBeVisible({ timeout: 30_000 });
      if (PHASE === "apres") await expect(page.getByTestId("story-commercial")).toBeVisible();
      await shot(page, `site-visionneuse-${theme}-${width}`);

      await page.context().clearCookies();
      await loginInBrowser(page, "garage@orasso.local", undefined, `/app/story/u:${kenjiId}`);
      await expect(page.getByTestId("story-viewer-root")).toBeVisible({ timeout: 30_000 });
      if (PHASE === "apres") await expect(page.getByTestId("story-reshare")).toBeVisible({ timeout: 30_000 });
      await shot(page, `site-pro-visionneuse-${theme}-${width}`);
      await page.goto("/app/activite");
      await shot(page, `site-pro-activite-${theme}-${width}`);
      await page.goto("/p/garage-du-port");
      await shot(page, `site-fiche-pro-${theme}-${width}`, true);
    });
  }
}
