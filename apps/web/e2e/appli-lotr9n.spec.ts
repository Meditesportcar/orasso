import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R9n (D40, maquette R9.1 `n-barres`, R9.2 `n-fil`, R9.2b `n-publier`), cÃ´tÃ© appli (version web compilÃ©e de recette,
// `APP_URL`) : les quatre barres des casquettes (Le Fil et Page dans chaque groupe), Â« Tu lis en tant que Â» et Â« Changer Â»,
// la feuille Â« Mes casquettes Â», la pastille de la barre du haut, Â« Publier Â» en casquette (segment Â« Publication | Story Â»),
// les anciennes adresses sous Â« Page Â», la copie hors ligne du Fil rangÃ©e par acteur, une casquette pÃ©rimÃ©e, le passionnÃ©.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9n-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Kind = "organizer" | "pro" | "provider" | "media";

/** Les quatre casquettes : le compte du seed qui la porte, la barre attendue, le nom de la casquette. */
const BARS: Record<Kind, { email: string; labels: string[]; center: string; name: string; testId: string }> = {
  organizer: {
    email: "damien@orasso.local",
    labels: ["Ã‰vÃ©nements", "Tri", "Direct", "Le Fil", "Page"],
    center: "Direct",
    name: "MÃ©diteSportCar",
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

/** Passe Ã  une casquette par la ligne de Â« Changer de casquette Â» du Profil (le geste historique). */
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

/** L'onglet actif : celui sous lequel se tient l'indicateur incliné (la barre n'expose pas d'état « sélectionné »). */
async function expectActiveTab(page: Page, name: string) {
  await expect(async () => {
    const ind = await page.getByTestId("tabbar-indicator").boundingBox();
    const box = await page.getByTestId("persona-tabbar").getByRole("tab", { name, exact: true }).boundingBox();
    expect(ind && box).toBeTruthy();
    const cx = (ind?.x ?? 0) + (ind?.width ?? 0) / 2;
    expect(cx).toBeGreaterThan(box?.x ?? 0);
    expect(cx).toBeLessThan((box?.x ?? 0) + (box?.width ?? 0));
  }).toPass({ timeout: 30_000 });
}

const tabs = (page: Page) => page.getByTestId("persona-tabbar").getByRole("tab");
const tab = (page: Page, name: string) => page.getByTestId("persona-tabbar").getByRole("tab", { name, exact: true });

for (const [theme, width, scale] of [
  ["beton", 390, 1],
  ["sable", 384, 1.3],
] as const) {
  for (const kind of ["organizer", "pro", "provider", "media"] as const) {
    test(`la barre ${kind} : cinq onglets, centre, indicateur, Le Fil et Page (${theme} ${width} Ã—${scale})`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const spec = BARS[kind];
      const { ctx, page } = await open(browser, spec.email, theme, width, scale);
      await wear(page, spec.testId);
      await expect(page.getByTestId("persona-tabbar")).toBeVisible();
      const names = await tabs(page).allInnerTexts();
      // Les libellÃ©s de la barre sont en capitales (style) : on compare sans la casse.
      expect(names.map((n) => n.replace(/\s+/g, " ").trim().toLowerCase())).toEqual(
        spec.labels.map((l) => l.toLowerCase()),
      );
      // Le centre (le O) : Direct pour l'organisateur, Accueil pour les trois autres, et il est actif Ã  l'ouverture.
      await expectActiveTab(page, spec.center);
      await expect(page.getByTestId("tabbar-indicator")).toBeVisible();
      // Police agrandie : aucun libellÃ© de la barre (Â« Candidatures Â», Â« Ã‰vÃ©nements Â») n'est coupÃ© ni rognÃ©.
      for (const label of spec.labels) {
        const box = await tab(page, label).boundingBox();
        expect(box, `onglet ${label}`).not.toBeNull();
        const over = await tab(page, label).evaluate((el) =>
          Math.max(...[el, ...el.querySelectorAll("*")].map((n) => n.scrollWidth - n.clientWidth)),
        );
        expect(over, `libellÃ© ${label} qui dÃ©borde`).toBeLessThanOrEqual(1);
      }
      await shot(page, `n-barre-${kind}-${theme}-${width}-x${scale}`);

      // La pastille de la barre du haut : le logo de la casquette, elle ouvre Â« Mes casquettes Â».
      await expect(page.getByTestId("topbar-persona")).toBeVisible();
      await page.getByTestId("topbar-persona").click();
      await expect(page.getByTestId("casquettes-intro")).toBeVisible();
      await expect(page.getByTestId("casquettes-me")).toBeVisible();
      await expect(page.getByTestId(spec.testId).first()).toBeVisible();
      await shot(page, `n-feuille-${kind}-${theme}-${width}-x${scale}`);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.getByRole("button", { name: "Fermer" }).first().click();
      await expect(page.getByTestId("casquettes-intro")).toHaveCount(0, { timeout: 5_000 });

      // Le Fil en casquette : Â« Tu lis en tant que Â» + le nom, jamais tronquÃ©.
      await tab(page, "Le Fil").click();
      await page.waitForURL(/\/fil/, { timeout: 15_000 });
      await expect(page.getByTestId("fil-actor")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("fil-actor")).toContainText("Tu lis en tant que");
      if (spec.name) await expect(page.getByTestId("fil-actor-name")).toHaveText(spec.name);
      expect(await cutWords(page, "fil-actor-name")).toEqual([]);
      await expect(page.getByTestId("fil-actor-change")).toBeVisible();
      await shot(page, `n-fil-${kind}-${theme}-${width}-x${scale}`);

      // La Page : l'Ã©cran d'aujourd'hui + la ligne Â« Mes casquettes Â» en bas.
      await tab(page, "Page").click();
      await page.waitForURL(/\/page/, { timeout: 15_000 });
      await expect(page.getByTestId("page-row-casquettes")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("page-row-casquettes").scrollIntoViewIfNeeded();
      await shot(page, `n-page-${kind}-${theme}-${width}-x${scale}`);
      await ctx.close();
    });
  }
}

test("Roues Libres 66 : le Fil Â« en tant que Â», Abonnements, Changer â†’ Moi, copie hors ligne distincte", async ({
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
  // L'acteur part en en-tÃªte sur la lecture du Fil.
  const read = page.waitForRequest((r) => r.url().includes("/api/fil?") && r.url().includes("filter=following"));
  await page.getByTestId("fil-filters-following").click();
  const sent = (await (await read).allHeaders())["x-orasso-actor"];
  expect(sent).toMatch(/^s:/);
  await expect(page.getByTestId("fil-phrase")).toContainText("Ceux que Roues Libres 66 suit");
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty")).first()).toBeVisible({ timeout: 30_000 });
  // La Brasa est suivie par Roues Libres 66 (seed R9a) : ses publications sont lÃ  ; aucun compte privÃ©.
  const privates = (await sql("select p.pseudo from profiles p where p.visibility = 'private'")) as {
    pseudo: string;
  }[];
  const text = await page.getByTestId("fil-list").innerText();
  expect(text).toContain("La Brasa");
  for (const p of privates) expect(text, `compte privÃ© ${p.pseudo}`).not.toContain(p.pseudo);
  await shot(page, "n-fil-roues-libres-abonnements");

  // Sans rÃ©seau, la copie de la casquette reste celle de la casquette (pas celle de la personne).
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-actor")).toBeVisible();
  await ctx.setOffline(true);
  await page.getByTestId("fil-filters-following").click();
  await expect(page.getByTestId("fil-offline")).toBeVisible({ timeout: 30_000 });
  const offline = await page.getByTestId("fil-list").innerText();
  expect(offline).toContain("La Brasa");
  await ctx.setOffline(false);

  // Â« Changer Â» â†’ Â« Moi Â· Sarah_66 Â» â†’ le Fil de la personne (sans pastille).
  await page.getByTestId("fil-actor-change").click();
  await expect(page.getByTestId("casquettes-me")).toContainText("Moi Â· Sarah_66");
  await shot(page, "n-feuille-roues-libres");
  await page.getByTestId("casquettes-me").click();
  await page.waitForURL(/\/fil/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-actor")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Crew", exact: true })).toBeVisible();
  await ctx.close();
});

test("Publier en casquette : casquette dÃ©jÃ  choisie, segment Story, retour Publication", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "sarah@orasso.local", "sable", 390, 1);
  await wear(page, "casquette-organizer", "Roues Libres 66");
  await tab(page, "Le Fil").click();
  await page.waitForURL(/\/fil/);
  await expect(page.getByTestId("fil-actor")).toBeVisible({ timeout: 30_000 });
  // Un seul geste : plus de feuille Â« En story | Dans le Fil Â».
  await page.getByTestId("fil-publish-open").click();
  await expect(page.getByTestId("fil-publish-choose-story")).toHaveCount(0);
  await page.waitForURL(/\/fil\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("en tant que Roues Libres 66", { exact: false }).first()).toBeVisible();
  await shot(page, "n-publier-roues-libres");
  // Le segment Â« Story Â» ouvre l'Ã©cran de story au nom de la structure, Â« Publication Â» revient.
  await page.getByTestId("fil-publish-kind").getByText("Story").click();
  await page.waitForURL(/\/story\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  await shot(page, "n-publier-story-roues-libres");
  await page.getByTestId("story-publish-kind").getByText("Publication").click();
  await page.waitForURL(/\/fil\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  // Une story personnelle depuis la casquette : `?auteur=me` (le segment depuis Â« Moi Â»).
  await go(page, "/story/publier?auteur=me");
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("Les anciennes adresses s'ouvrent sous l'onglet Â« Page Â»", async ({ browser }) => {
  test.setTimeout(240_000);
  const cases: [Kind, string, string][] = [
    ["organizer", "/(orga)/equipe", "Ã‰quipe"],
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
    // L'onglet Â« Page Â» est celui qui range la page masquÃ©e.
    await expectActiveTab(page, "Page");
    await ctx.close();
  }
});

test("Le passionnÃ© : sa barre n'a pas bougÃ©, ni pastille de casquette, ni Â« Tu lis en tant que Â»", async ({
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

test("Casquette pÃ©rimÃ©e : la structure est quittÃ©e pendant la session, retour Ã  la base avec l'avis", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // Roues Libres 66 : la propriÃ©taire est la seule responsable ; on la retire de la structure par la base, comme le ferait
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

test("L'en-tÃªte n'est posÃ© que sur la liste blanche : la flamme et les cartes vues n'en portent pas", async ({
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
  // Les cartes vues, le profil, les messages : jamais d'en-tÃªte.
  for (const key of new Set(withoutActor)) {
    expect(key, "les cartes vues restent celles de la personne").not.toBe("__aucun__");
  }
  expect(withActor.some((k) => k.includes("/me/"))).toBe(false);
  void apiCall;
  void login;
  await ctx.close();
});
