import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { apiCall, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9b (D40, maquette R9.3 `n-page`), côté appli (version web compilée de recette, `APP_URL`) : la « Page » de chaque casquette
// (en-tête, trois compteurs, chips de gestion, « Publications » ouvert par défaut ou l'onglet d'accueil, « Mentions · N », « Mes
// casquettes » en bas), « Publier » depuis la Page (« Publier en tant que <page> »), la page de La Brasa et celle de Sud Cars vues par un
// visiteur (« Suivre » → « Suivi », compteur +1, « Prestations », « Contenus »), « Suivre » en casquette (c'est la page qui suit, T14),
// la police ×1,3 (onglets et chips tiennent), une carte du Fil d'un média ouvre sa page.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9b-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Kind = "organizer" | "pro" | "provider" | "media";

/** Les quatre casquettes : le compte du seed, le nom de la casquette, ses chips et ses onglets (dans l'ordre). */
const CAS: Record<
  Kind,
  { email: string; testId: string; name: string; gest: string[]; tabs: string[]; label: string; first: string }
> = {
  organizer: {
    email: "damien@orasso.local",
    testId: "casquette-organizer",
    name: "MéditeSportCar",
    gest: ["team", "structure"],
    tabs: ["events", "publications", "mentions"],
    label: "MéditeSportCar",
    first: "events",
  },
  pro: {
    email: "garage@orasso.local",
    testId: "casquette-pro",
    name: "",
    gest: ["fiche", "subscription"],
    tabs: ["publications", "offers", "mentions"],
    label: "Garage du Port",
    first: "offers",
  },
  provider: {
    email: "sofia@orasso.local",
    testId: "casquette-provider",
    name: "La Brasa",
    gest: ["vitrine"],
    tabs: ["publications", "services", "mentions"],
    label: "La Brasa",
    first: "services",
  },
  media: {
    email: "leo@orasso.local",
    testId: "casquette-media",
    name: "Sud Cars",
    gest: ["media"],
    tabs: ["publications", "contents", "mentions"],
    label: "Sud Cars",
    first: "contents",
  },
};

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, opts: { theme?: string; scale?: number; width?: number } = {}) {
  const { theme = "beton", scale = 1, width = 390 } = opts;
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

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Passe à une casquette par la ligne de « Changer de casquette » du Profil (le geste historique). */
async function wear(page: Page, testId: string, hasText?: string) {
  await go(page, "/moi");
  const row = page
    .getByTestId(testId)
    .filter(hasText ? { hasText } : {})
    .first();
  await row.click();
  await page.waitForURL((u) => !/\/(moi|profil)(\?|$)/.test(u.pathname), { timeout: 30_000 });
  await expect(page.getByTestId("persona-tabbar")).toBeVisible({ timeout: 30_000 });
}

const pageTab = (page: Page) => page.getByTestId("persona-tabbar").getByRole("tab", { name: "Page", exact: true });

/** Le nombre d'une case de la bande de compteurs (« 412 abonnés »). */
async function counter(page: Page, key: string): Promise<number> {
  const text = (await page.getByTestId(`page-count-${key}`).first().innerText()).replace(/\s/g, " ");
  const m = /(\d[\d {2}]*)/.exec(text);
  return m ? Number((m[1] ?? "").replace(/\D/g, "")) : Number.NaN;
}

for (const kind of ["organizer", "pro", "provider", "media"] as const) {
  test(`la Page de la casquette ${kind} : en-tête, compteurs, chips, onglets, « Mes casquettes »`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const c = CAS[kind];
    const { ctx, page } = await open(browser, c.email);
    await wear(page, c.testId, c.name || undefined);
    await pageTab(page).click();
    // L'en-tête : le nom (jamais tronqué), le type, trois compteurs (ou moins pour un pro sans partenaire), aucun « Suivre ».
    await expect(page.getByTestId("page-name").first()).toContainText(c.label, { timeout: 30_000 });
    await expect(page.getByTestId("page-type").first()).toBeVisible();
    await expect(page.getByTestId("page-counts").first()).toBeVisible();
    expect(await counter(page, "followers")).toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId("follow")).toHaveCount(0);
    await expect(page.getByTestId("follow-pro")).toHaveCount(0);
    // « QR de la page » et « Réglages » à droite.
    await expect(page.getByTestId("page-qr-open").first()).toBeVisible();
    await expect(page.getByTestId("page-settings").first()).toBeVisible();
    // Les chips de gestion, chacun avec son libellé.
    for (const g of c.gest) await expect(page.getByTestId(`page-gest-${g}`).first()).toBeVisible();
    // Les onglets : ceux de la maquette, « Mentions · N ».
    for (const t of c.tabs) await expect(page.getByTestId(`page-tab-${t}`).first()).toBeVisible();
    await expect(page.getByTestId("page-tab-mentions").first()).toContainText("Mentions");
    await shot(page, `page-${kind}`);
    // « Mentions » s'ouvre (la liste ou l'état vide), puis l'onglet d'accueil de la casquette.
    await page.getByTestId("page-tab-mentions").first().click();
    await expect(
      page.getByTestId("mention-row").or(page.getByText("Personne n'a encore cité cette page.")),
    ).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId(`page-tab-${c.first}`).first().click();
    await shot(page, `page-${kind}-${c.first}`);
    // Un chip ouvre son écran de réglage. Le retour système (Android, `useBackToPage`) ne se joue pas sur le web : à essayer sur le téléphone.
    if (kind === "organizer") {
      await page
        .getByTestId(`page-gest-${c.gest[c.gest.length - 1]}`)
        .first()
        .click();
      await page.waitForURL((u) => !/\/page(\?|$)/.test(u.pathname), { timeout: 30_000 });
      await pageTab(page).click();
      await expect(page.getByTestId("page-gest").first()).toBeVisible({ timeout: 30_000 });
    }
    // « Mes casquettes » (le pied) ouvre la feuille.
    await page.getByTestId("page-row-casquettes").first().scrollIntoViewIfNeeded();
    await page.getByTestId("page-row-casquettes").first().click();
    await expect(page.getByTestId("casquettes-intro")).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });
}

test("« Publier » depuis la Page : « Publier en tant que <page> » ; un seul bouton principal par onglet", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const c = CAS.provider;
  const { ctx, page } = await open(browser, c.email);
  await wear(page, c.testId, c.name);
  await pageTab(page).click();
  await page.getByTestId("page-tab-publications").first().click();
  // « Publier » (compact, ou celui de l'état vide) : un seul à l'écran.
  await expect(page.getByTestId("publications-publish")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("publications-publish").click();
  await page.waitForURL(/\/fil\/publier/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-as")).toContainText("La Brasa", { timeout: 30_000 });
  await ctx.close();
});

test("le visiteur : La Brasa (« Suivre » → « Suivi », compteur +1, « Prestations ») et Sud Cars (« Contenus »)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sofia = await login("sofia@orasso.local");
  const leo = await login("leo@orasso.local");
  const brasa = (await apiCall<{ personas: { kind: string; id: string }[] }>(sofia, "GET", "/me")).data.personas.find(
    (p) => p.kind === "provider",
  );
  const sud = (await apiCall<{ personas: { kind: string; id: string }[] }>(leo, "GET", "/me")).data.personas.find(
    (p) => p.kind === "media",
  );
  expect(brasa && sud).toBeTruthy();
  const s = unique();
  await signUpApi(`VisR9b_${s}`);
  const { ctx, page } = await open(browser, `VisR9b_${s}`.toLowerCase() + "@e2e.orasso.test");

  await go(page, `/providers/${brasa?.id}`);
  await expect(page.getByTestId("page-name")).toContainText("La Brasa", { timeout: 30_000 });
  await expect(page.getByTestId("page-count-missions")).toBeVisible();
  await expect(page.getByTestId("page-count-organizers")).toBeVisible();
  // Le visiteur n'a pas « QR de la page » ni « Réglages » : seulement « Plus ».
  await expect(page.getByTestId("page-qr-open")).toHaveCount(0);
  await expect(page.getByTestId("page-more")).toBeVisible();
  const before = await counter(page, "followers");
  await page.getByTestId("follow-provider").click();
  await expect(page.getByTestId("follow-provider")).toContainText("Suivi", { timeout: 30_000 });
  await expect.poll(() => counter(page, "followers"), { timeout: 30_000 }).toBe(before + 1);
  await shot(page, "visiteur-prestataire");
  // « Prestations » : la vitrine d'hier ; « Mentions · N ».
  await page.getByTestId("page-tab-services").click();
  await expect(page.getByTestId("page-prestations")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("vitrine-view")).toBeVisible();
  await shot(page, "visiteur-prestataire-prestations");
  await page.getByTestId("page-tab-mentions").click();
  await expect(page.getByTestId("mention-row").or(page.getByText("Personne n'a encore cité cette page."))).toBeVisible({
    timeout: 30_000,
  });
  // Retour (le ✕ de l'écran), puis la page du média.
  await go(page, `/m/${sud?.id}`);
  await expect(page.getByTestId("page-name")).toContainText("Sud Cars", { timeout: 30_000 });
  await expect(page.getByTestId("page-count-accreditations")).toBeVisible();
  await page.getByTestId("page-tab-contents").click();
  await expect(page.getByTestId("page-contents")).toBeVisible({ timeout: 30_000 });
  await shot(page, "visiteur-media-contenus");
  await ctx.close();
});

test("en casquette Roues Libres 66, « Suivre » Sud Cars écrit l'abonnement de la structure, pas celui de la personne (T14)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sarah = await login("sarah@orasso.local");
  const leo = await login("leo@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(sarah, "GET", "/me");
  const rl66 = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("Roues Libres"));
  const sud = (await apiCall<{ personas: { kind: string; id: string }[] }>(leo, "GET", "/me")).data.personas.find(
    (p) => p.kind === "media",
  );
  expect(rl66 && sud).toBeTruthy();
  const actor = `s:${rl66?.id}`;
  const read = async (asPage: boolean) => {
    const res = await fetch(`${process.env.API_URL ?? "http://localhost:4881"}/api/media/${sud?.id}`, {
      headers: { origin: "http://localhost:7051", cookie: sarah, ...(asPage ? { "x-orasso-actor": actor } : {}) },
    });
    return (await res.json()) as { isFollowing: boolean; followersCount: number };
  };
  // État de départ : ni la personne ni la page ne suivent Sud Cars.
  await apiCall(sarah, "DELETE", `/me/page-follows/m:${sud?.id}`);
  const before = await read(false);
  expect(before.isFollowing).toBe(false);

  const { ctx, page } = await open(browser, "sarah@orasso.local");
  await wear(page, "casquette-organizer", "Roues Libres 66");
  await go(page, `/m/${sud?.id}`);
  await expect(page.getByTestId("follow-media")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("follow-media")).toContainText("Suivre");
  await page.getByTestId("follow-media").click();
  await expect(page.getByTestId("follow-media")).toContainText("Suivi", { timeout: 30_000 });
  // Le compteur de la page de Sud Cars a bougé d'un ; la personne, elle, ne le suit toujours pas.
  expect((await read(true)).isFollowing).toBe(true);
  expect((await read(false)).isFollowing).toBe(false);
  expect((await read(false)).followersCount).toBe(before.followersCount + 1);
  // Remise en état du seed.
  await page.getByTestId("follow-media").click();
  await expect(page.getByTestId("follow-media")).toContainText("Suivre", { timeout: 30_000 });
  expect((await read(false)).followersCount).toBe(before.followersCount);
  await ctx.close();
});

test("police ×1,3 : les onglets et les chips tiennent, aucun mot coupé, aucune page qui déborde", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  for (const kind of ["organizer", "pro"] as const) {
    const c = CAS[kind];
    const { ctx, page } = await open(browser, c.email, { scale: 1.3, width: 384 });
    await wear(page, c.testId, c.name || undefined);
    await pageTab(page).click();
    await expect(page.getByTestId("page-name").first()).toContainText(c.label, { timeout: 30_000 });
    expect(await cutWords(page, "page-name")).toEqual([]);
    for (const g of c.gest) {
      const chip = page.getByTestId(`page-gest-${g}`).first();
      await expect(chip).toBeVisible();
      const box = await chip.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(384 + 1);
      expect(await cutWords(page, `page-gest-${g}`)).toEqual([]);
    }
    // Chaque onglet est touchable (la rangée défile si besoin) et la page ne déborde pas de l'écran.
    for (const t of c.tabs) {
      const tab = page.getByTestId(`page-tab-${t}`).first();
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(page, `page-${kind}-x13`);
    await ctx.close();
  }
});

test("une carte du Fil d'un média ouvre sa page (`/m/<id>`)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await go(page, "/fil");
  // Damien suit Sud Cars : sa publication est dans « Abonnements ».
  await page.getByRole("tab", { name: "Abonnements", exact: true }).click();
  const card = page.getByTestId("feed-card-feed_post").filter({ hasText: "Sud Cars" }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("link", { name: "Sud Cars" }).first().click();
  await page.waitForURL(/\/m\//, { timeout: 30_000 });
  await expect(page.getByTestId("page-name")).toContainText("Sud Cars", { timeout: 30_000 });
  await ctx.close();
});

test("tour 3 : `/me/pro` en échec → l'erreur et « Réessayer » ; le réessai réussit", async ({ browser }) => {
  test.setTimeout(240_000);
  const c = CAS.pro;
  const { ctx, page } = await open(browser, c.email);
  await ctx.route("**/api/me/pro", (route) => route.abort());
  await wear(page, c.testId);
  await pageTab(page).click();
  await expect(page.getByTestId("page-retry")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("page-name")).toHaveCount(0);
  await ctx.unroute("**/api/me/pro");
  await page.getByTestId("page-retry").click();
  await expect(page.getByTestId("page-name").first()).toContainText(c.label, { timeout: 60_000 });
  await ctx.close();
});

test("tour 3 : A → B réseau coupé, rien de A sous B ; « Suivre » appliqué malgré une relecture en échec", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "sarah@orasso.local");
  await wear(page, "casquette-organizer", "Roues Libres 66");
  await pageTab(page).click();
  await expect(page.getByTestId("page-name").first()).toContainText("Roues Libres 66", { timeout: 60_000 });
  // Réseau coupé, puis passage à l'autre structure par la feuille « Mes casquettes ».
  await ctx.setOffline(true);
  await page.getByTestId("page-row-casquettes").first().scrollIntoViewIfNeeded();
  await page.getByTestId("page-row-casquettes").first().click();
  await page.getByTestId("casquettes-organizer").filter({ hasText: "MéditeSportCar" }).first().click();
  // La Page de B : sans réseau ni cache, l'attente ou l'erreur (jamais la page de A).
  await pageTab(page).click();
  await expect(page.getByTestId("page-retry").or(page.getByTestId("page-loading"))).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("page-name")).toHaveCount(0);
  // Rien de Roues Libres 66 : ni son nom, ni son QR, ni « Publier » à son nom.
  await expect(page.getByText("Roues Libres 66")).toHaveCount(0);
  await expect(page.getByTestId("page-qr-open")).toHaveCount(0);
  await expect(page.getByTestId("publications-publish")).toHaveCount(0);
  await ctx.setOffline(false);
  await ctx.close();

  // « Suivre » : la réponse de l'écriture s'applique même si la relecture échoue.
  const leo = await login("leo@orasso.local");
  const sud = (await apiCall<{ personas: { kind: string; id: string }[] }>(leo, "GET", "/me")).data.personas.find(
    (p) => p.kind === "media",
  );
  const s = unique();
  await signUpApi(`FolR9b_${s}`);
  const v = await open(browser, `${`FolR9b_${s}`.toLowerCase()}@e2e.orasso.test`);
  await go(v.page, `/m/${sud?.id}`);
  await expect(v.page.getByTestId("follow-media")).toBeVisible({ timeout: 30_000 });
  const before = await counter(v.page, "followers");
  await v.ctx.route(`**/api/media/${sud?.id}`, (route) => route.abort());
  await v.page.getByTestId("follow-media").click();
  await expect(v.page.getByTestId("follow-media")).toContainText("Suivi", { timeout: 30_000 });
  await expect.poll(() => counter(v.page, "followers"), { timeout: 30_000 }).toBe(before + 1);
  await v.ctx.close();
});

test("tour 4 : survol d'assistance, la Page porte le nom de la structure et n'offre pas « Publier »", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const ownerCookie = await signUpApi(`AssistR9b_${s}`, `orga-assist-r9b-${s}@e2e.orasso.test`);
  const name = `Club Aide R9b ${s}`;
  const created = await apiCall<{ id: string }>(ownerCookie, "POST", "/structures", {
    kind: "association",
    name,
    departments: ["66"],
  });
  expect(created.status).toBe(201);
  const { ctx, page } = await open(browser, "equipe@orasso.local");
  await go(page, "/moi");
  await page.getByTestId("casquette-admin").click();
  await page.waitForURL(/administration/, { timeout: 30_000 });
  await go(page, "/structures");
  await page.getByTestId("admin-structures-q").fill(name);
  await page.getByTestId("admin-structures-q-go").click();
  const row = page.getByTestId("structure-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("admin-survey").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("assistance-banner")).toBeVisible({ timeout: 30_000 });
  await pageTab(page).click();
  await expect(page.getByTestId("page-name").first()).toContainText(name, { timeout: 60_000 });
  await expect(page.getByTestId("publications-publish")).toHaveCount(0);
  await ctx.close();
});
