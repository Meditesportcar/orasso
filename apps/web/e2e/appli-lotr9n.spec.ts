import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R9n (D40, maquette R9.1 `n-barres`, R9.2 `n-fil`, R9.2b `n-publier`), côté appli (version web compilée de recette,
// `APP_URL`) : les quatre barres des casquettes (Le Fil et Page dans chaque groupe), « Tu lis en tant que » et « Changer »,
// la feuille « Mes casquettes », la pastille de la barre du haut, « Publier » en casquette (segment « Publication | Story »),
// les anciennes adresses sous « Page », la copie hors ligne du Fil rangée par acteur, une casquette périmée, le passionné.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9n-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Kind = "organizer" | "pro" | "provider" | "media";

/** Les quatre casquettes : le compte du seed qui la porte, la barre attendue, le nom de la casquette. */
const BARS: Record<Kind, { email: string; labels: string[]; center: string; name: string; testId: string }> = {
  organizer: {
    email: "damien@orasso.local",
    labels: ["Événements", "Tri", "Direct", "Le Fil", "Page"],
    center: "Direct",
    name: "MéditeSportCar",
    testId: "casquette-organizer",
  },
  pro: {
    email: "garage@orasso.local",
    labels: ["Scanner", "Le Fil", "Accueil", "Stats", "Page"],
    center: "Accueil",
    name: "",
    testId: "casquette-pro",
  },
  provider: {
    email: "sofia@orasso.local",
    labels: ["Missions", "Le Fil", "Accueil", "Candidatures", "Page"],
    center: "Accueil",
    name: "La Brasa",
    testId: "casquette-provider",
  },
  media: {
    email: "leo@orasso.local",
    labels: ["Explorer", "Le Fil", "Accueil", "Presse", "Page"],
    center: "Accueil",
    name: "Sud Cars",
    testId: "casquette-media",
  },
};

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
  const row = page.getByTestId(testId).filter(hasText ? { hasText } : {}).first();
  await row.click();
  await page.waitForURL((u) => !/\/(moi|profil)(\?|$)/.test(u.pathname), { timeout: 30_000 });
  await expect(page.getByTestId("persona-tabbar")).toBeVisible({ timeout: 30_000 });
}

const tabs = (page: Page) => page.getByRole("tab");
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

for (const [theme, width, scale] of [
  ["beton", 390, 1],
  ["sable", 384, 1.3],
] as const) {
  for (const kind of ["organizer", "pro", "provider", "media"] as const) {
    test(`la barre ${kind} : cinq onglets, centre, indicateur, Le Fil et Page (${theme} ${width} ×${scale})`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const spec = BARS[kind];
      const { ctx, page } = await open(browser, spec.email, theme, width, scale);
      await wear(page, spec.testId);
      await expect(page.getByTestId("persona-tabbar")).toBeVisible();
      const names = await tabs(page).allInnerTexts();
      // Les libellés de la barre sont en capitales (style) : on compare sans la casse.
      expect(names.map((n) => n.replace(/\s+/g, " ").trim().toLowerCase())).toEqual(
        spec.labels.map((l) => l.toLowerCase()),
      );
      // Le centre (le O) : Direct pour l'organisateur, Accueil pour les trois autres, et il est actif à l'ouverture.
      await expect(tab(page, spec.center)).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("tabbar-indicator")).toBeVisible();
      // Police agrandie : aucun libellé de la barre (« Candidatures », « Événements ») n'est coupé ni rogné.
      for (const label of spec.labels) {
        const box = await tab(page, label).boundingBox();
        expect(box, `onglet ${label}`).not.toBeNull();
        const over = await tab(page, label).evaluate((el) =>
          Math.max(...[el, ...el.querySelectorAll("*")].map((n) => n.scrollWidth - n.clientWidth)),
        );
        expect(over, `libellé ${label} qui déborde`).toBeLessThanOrEqual(1);
      }
      await shot(page, `n-barre-${kind}-${theme}-${width}-x${scale}`);

      // La pastille de la barre du haut : le logo de la casquette, elle ouvre « Mes casquettes ».
      await expect(page.getByTestId("topbar-persona")).toBeVisible();
      await page.getByTestId("topbar-persona").click();
      await expect(page.getByTestId("casquettes-intro")).toBeVisible();
      await expect(page.getByTestId("casquettes-me")).toBeVisible();
      await expect(page.getByTestId(spec.testId).first()).toBeVisible();
      await shot(page, `n-feuille-${kind}-${theme}-${width}-x${scale}`);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.getByRole("button", { name: "Fermer" }).first().click();
      await expect(page.getByTestId("casquettes-intro")).toHaveCount(0, { timeout: 5_000 });

      // Le Fil en casquette : « Tu lis en tant que » + le nom, jamais tronqué.
      await tab(page, "Le Fil").click();
      await page.waitForURL(/\/fil/, { timeout: 15_000 });
      await expect(page.getByTestId("fil-actor")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("fil-actor")).toContainText("Tu lis en tant que");
      if (spec.name) await expect(page.getByTestId("fil-actor-name")).toHaveText(spec.name);
      expect(await cutWords(page, "fil-actor-name")).toEqual([]);
      await expect(page.getByTestId("fil-actor-change")).toBeVisible();
      await shot(page, `n-fil-${kind}-${theme}-${width}-x${scale}`);

      // La Page : l'écran d'aujourd'hui + la ligne « Mes casquettes » en bas.
      await tab(page, "Page").click();
      await page.waitForURL(/\/page/, { timeout: 15_000 });
      await expect(page.getByTestId("page-row-casquettes")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("page-row-casquettes").scrollIntoViewIfNeeded();
      await shot(page, `n-page-${kind}-${theme}-${width}-x${scale}`);
      await ctx.close();
    });
  }
}

test("Roues Libres 66 : le Fil « en tant que », Abonnements, Changer → Moi, copie hors ligne distincte", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "sarah@orasso.local", "beton", 390, 1);
  // Le Fil de la personne d'abord (sa copie hors ligne), puis la casquette Roues Libres 66.
  await go(page, "/fil");
  await expect(page.getByTestId("fil-actor")).toHaveCount(0);
  await page.getByTestId("fil-filters-following").click();
  await expect(page.getByTestId("fil-phrase")).toContainText("Ceux que tu suis");
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty")).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "n-fil-passionne-abonnements");

  await wear(page, "casquette-organizer", "Roues Libres 66");
  await tab(page, "Le Fil").click();
  await page.waitForURL(/\/fil/);
  await expect(page.getByTestId("fil-actor")).toContainText("Roues Libres 66", { timeout: 30_000 });
  // L'acteur part en en-tête sur la lecture du Fil.
  const read = page.waitForRequest((r) => r.url().includes("/api/fil?") && r.url().includes("filter=following"));
  await page.getByTestId("fil-filters-following").click();
  const sent = (await read).headers()["x-orasso-actor"];
  expect(sent).toMatch(/^s:/);
  await expect(page.getByTestId("fil-phrase")).toContainText("Ceux que Roues Libres 66 suit");
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty")).first()).toBeVisible({ timeout: 30_000 });
  // La Brasa est suivie par Roues Libres 66 (seed R9a) : ses publications sont là ; aucun compte privé.
  const privates = (await sql("select p.pseudo from profiles p where p.visibility = 'private'")) as { pseudo: string }[];
  const text = await page.getByTestId("fil-list").innerText();
  expect(text).toContain("La Brasa");
  for (const p of privates) expect(text, `compte privé ${p.pseudo}`).not.toContain(p.pseudo);
  await shot(page, "n-fil-roues-libres-abonnements");

  // Sans réseau, la copie de la casquette reste celle de la casquette (pas celle de la personne).
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-actor")).toBeVisible();
  await ctx.setOffline(true);
  await page.getByTestId("fil-filters-following").click();
  await expect(page.getByTestId("fil-offline")).toBeVisible({ timeout: 30_000 });
  const offline = await page.getByTestId("fil-list").innerText();
  expect(offline).toContain("La Brasa");
  await ctx.setOffline(false);

  // « Changer » → « Moi · Sarah_66 » → le Fil de la personne (sans pastille).
  await page.getByTestId("fil-actor-change").click();
  await expect(page.getByTestId("casquettes-me")).toContainText("Moi · Sarah_66");
  await shot(page, "n-feuille-roues-libres");
  await page.getByTestId("casquettes-me").click();
  await page.waitForURL(/\/fil/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-actor")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Crew", exact: true })).toBeVisible();
  await ctx.close();
});

test("Publier en casquette : casquette déjà choisie, segment Story, retour Publication", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "sarah@orasso.local", "sable", 390, 1);
  await wear(page, "casquette-organizer", "Roues Libres 66");
  await tab(page, "Le Fil").click();
  await page.waitForURL(/\/fil/);
  await expect(page.getByTestId("fil-actor")).toBeVisible({ timeout: 30_000 });
  // Un seul geste : plus de feuille « En story | Dans le Fil ».
  await page.getByTestId("fil-publish-open").click();
  await expect(page.getByTestId("fil-publish-choose-story")).toHaveCount(0);
  await page.waitForURL(/\/fil\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("en tant que Roues Libres 66", { exact: false }).first()).toBeVisible();
  await shot(page, "n-publier-roues-libres");
  // Le segment « Story » ouvre l'écran de story au nom de la structure, « Publication » revient.
  await page.getByTestId("fil-publish-kind").getByText("Story").click();
  await page.waitForURL(/\/story\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  await shot(page, "n-publier-story-roues-libres");
  await page.getByTestId("story-publish-kind").getByText("Publication").click();
  await page.waitForURL(/\/fil\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  // Une story personnelle depuis la casquette : `?auteur=me` (le segment depuis « Moi »).
  await go(page, "/story/publier?auteur=me");
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("Les anciennes adresses s'ouvrent sous l'onglet « Page »", async ({ browser }) => {
  test.setTimeout(240_000);
  const cases: [Kind, string, string][] = [
    ["organizer", "/(orga)/equipe", "Équipe"],
    ["organizer", "/(orga)/structure", "Ma structure"],
    ["pro", "/(pro)/fiche", ""],
    ["provider", "/(provider)/vitrine", ""],
    ["media", "/(media)/contenus", "Contenus"],
  ];
  for (const [kind, path] of cases.map(([k, p]) => [k, p] as const)) {
    const spec = BARS[kind];
    const { ctx, page } = await open(browser, spec.email, "beton", 390, 1);
    await wear(page, spec.testId);
    await page.goto(path);
    await afterOpening(page);
    await expect(page.getByTestId("persona-tabbar")).toBeVisible({ timeout: 30_000 });
    // L'onglet « Page » est celui qui range la page masquée.
    await expect(tab(page, "Page")).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
    await ctx.close();
  }
});

test("Le passionné : sa barre n'a pas bougé, ni pastille de casquette, ni « Tu lis en tant que »", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local", "beton", 390, 1);
  const names = (await tabs(page).allInnerTexts()).map((n) => n.replace(/\s+/g, " ").trim());
  expect(names.map((n) => n.toLowerCase())).toEqual(["explorer", "le fil", "accueil", "crew", "profil"]);
  await expect(page.getByTestId("topbar-persona")).toHaveCount(0);
  await tab(page, "Le Fil").click();
  await page.waitForURL(/\/fil/);
  await expect(page.getByTestId("fil-actor")).toHaveCount(0);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await shot(page, "n-fil-passionne");
  await page.getByTestId("fil-publish-open").click();
  await page.waitForURL(/\/fil\/publier/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-kind")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fil-publish-choose-story")).toHaveCount(0);
  await ctx.close();
});

test("Casquette périmée : la structure est quittée pendant la session, retour à la base avec l'avis", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // Roues Libres 66 : la propriétaire est la seule responsable ; on la retire de la structure par la base, comme le ferait
  // l'API de test, puis on relit le Fil en casquette.
  const { ctx, page } = await open(browser, "sarah@orasso.local", "beton", 390, 1);
  await wear(page, "casquette-organizer", "Roues Libres 66");
  await tab(page, "Le Fil").click();
  await page.waitForURL(/\/fil/);
  await expect(page.getByTestId("fil-actor")).toBeVisible({ timeout: 30_000 });
  await sql(
    `update structure_members set status = 'removed'
       where structure_id = (select id from structures where slug = 'roues-libres-66')`,
  );
  try {
    await page.getByTestId("fil-filters-following").click();
    // L'API refuse l'acteur (403 persona_forbidden) : l'avis, puis la casquette de base.
    await expect(page.getByText("Cette casquette n'est plus disponible")).toBeVisible({ timeout: 30_000 });
    await page.waitForURL(/accueil|fil|profil/, { timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "Crew", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fil-actor")).toHaveCount(0);
    await shot(page, "n-casquette-perimee");
  } finally {
    await sql(
      `update structure_members set status = 'active'
         where structure_id = (select id from structures where slug = 'roues-libres-66')`,
    );
  }
  await ctx.close();
});

test("L'en-tête n'est posé que sur la liste blanche : la flamme et les cartes vues n'en portent pas", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "sarah@orasso.local", "beton", 390, 1);
  const withActor: string[] = [];
  const withoutActor: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith("/api/")) return;
    const key = `${r.method()} ${url.pathname.replace(/[0-9a-f-]{36}/g, ":id")}`;
    if (r.headers()["x-orasso-actor"]) withActor.push(key);
    else withoutActor.push(key);
  });
  await wear(page, "casquette-organizer", "Roues Libres 66");
  await tab(page, "Le Fil").click();
  await page.waitForURL(/\/fil/);
  await expect(page.getByTestId("fil-actor")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
  const allowed = [
    /^GET \/api\/fil$/,
    /^GET \/api\/fil\/fresh$/,
    /^GET \/api\/stories\/bar$/,
    /^GET \/api\/feed-posts\/:id\/comments$/,
    /^POST \/api\/feed-posts\/:id\/comments$/,
    /^GET \/api\/structures\/by-slug\/[^/]+$/,
    /^GET \/api\/pros\/by-slug\/[^/]+$/,
    /^GET \/api\/providers\/:id$/,
    /^GET \/api\/users\/[^/]+$/,
    /^(POST|DELETE) \/api\/(structures|pros|users)\/[^/]+\/follow$/,
  ];
  for (const key of new Set(withActor)) {
    expect(
      allowed.some((re) => re.test(key)),
      `appel avec acteur hors liste blanche : ${key}`,
    ).toBe(true);
  }
  expect(withActor.length).toBeGreaterThan(0);
  // Les cartes vues, le profil, les messages : jamais d'en-tête.
  for (const key of new Set(withoutActor)) {
    expect(key, "les cartes vues restent celles de la personne").not.toBe("__aucun__");
  }
  expect(withActor.some((k) => k.includes("/me/"))).toBe(false);
  void apiCall;
  void login;
  await ctx.close();
});
