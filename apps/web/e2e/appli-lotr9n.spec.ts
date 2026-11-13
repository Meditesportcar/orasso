import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { SEED_PASSWORD } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { landscape } from "./lotr7f3-setup";
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

/** Les identifiants des cartes du Fil affiché (`nativeID` `fil-card-<id>`), dans l'ordre ; vide si le Fil est vide. */
async function cardIds(page: Page): Promise<string[]> {
  return page.locator('[id^="fil-card-"]').evaluateAll((els) => els.map((e) => e.id));
}

const tabs = (page: Page) => page.getByTestId("persona-tabbar").getByRole("tab");
const tab = (page: Page, name: string) => page.getByTestId("persona-tabbar").getByRole("tab", { name, exact: true });

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
      // Le centre (le O) est le troisième onglet (l'ordre des libellés ci-dessus) ; il porte le O, pas l'indicateur incliné.
      expect(names[2]?.toLowerCase()).toBe(spec.center.toLowerCase());
      // Police agrandie : aucun libellé de la barre (« Candidatures », « Événements ») n'est coupé ni rogné.
      for (const label of spec.labels) {
        const box = await tab(page, label).boundingBox();
        expect(box, `onglet ${label}`).not.toBeNull();
        // Le libellé tient sur une seule ligne (rectangles de largeur non nulle, comme appli-lotr6police) et aucun mot n'est coupé.
        const fit = await tab(page, label).evaluate((el) => {
          const tops = new Set<number>();
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!(n.textContent ?? "").trim()) continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            for (const q of r.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top));
          }
          return { lines: tops.size };
        });
        expect(fit.lines, `libellé ${label} sur plusieurs lignes`).toBe(1);
      }
      await shot(page, `n-barre-${kind}-${theme}-${width}-x${scale}`);

      // La pastille de la barre du haut : le logo de la casquette, elle ouvre « Mes casquettes ».
      const chip = page.getByTestId("topbar-persona").filter({ visible: true }).first();
      await expect(chip).toBeVisible();
      await chip.click();
      await expect(page.getByTestId("casquettes-intro")).toBeVisible();
      await expect(page.getByTestId("casquettes-me")).toBeVisible();
      // Les lignes de la nouvelle feuille : `casquettes-<rôle>` (pas les `casquette-<rôle>` du Profil).
      await expect(page.getByTestId(spec.testId.replace("casquette-", "casquettes-")).first()).toBeVisible();
      await shot(page, `n-feuille-${kind}-${theme}-${width}-x${scale}`);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page
        .getByRole("button", { name: "Fermer" })
        .filter({ visible: true })
        .last()
        .click({ position: { x: 8, y: 8 } });
      await expect(page.getByTestId("casquettes-intro")).toHaveCount(0, { timeout: 5_000 });

      // Le Fil en casquette : « Tu lis en tant que » + le nom, jamais tronqué.
      await tab(page, "Le Fil").click();
      await page.waitForURL(/\/fil/, { timeout: 15_000 });
      await expectActiveTab(page, "Le Fil");
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
  const personOnline = await cardIds(page);
  await shot(page, "n-fil-passionne-abonnements");

  await wear(page, "casquette-organizer", "Roues Libres 66");
  await tab(page, "Le Fil").click();
  await page.waitForURL(/\/fil/);
  await expect(page.getByTestId("fil-actor")).toContainText("Roues Libres 66", { timeout: 30_000 });
  // L'acteur part en en-tête sur la lecture du Fil.
  // Le filtre « Abonnements » est mémorisé par compte : on passe par un autre filtre pour voir partir la lecture.
  await page.getByTestId("fil-filters-for_you").click();
  await expect(page.getByTestId("fil-actor")).toBeVisible();
  const read = page.waitForRequest((r) => r.url().includes("/api/fil?") && r.url().includes("filter=following"));
  await page.getByTestId("fil-filters-following").click();
  const sent = (await (await read).allHeaders())["x-orasso-actor"];
  expect(sent).toMatch(/^s:/);
  await expect(page.getByTestId("fil-phrase")).toContainText("Ceux que Roues Libres 66 suit");
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty")).first()).toBeVisible({ timeout: 30_000 });
  // La Brasa est suivie par Roues Libres 66 (seed R9a) : ses publications sont là ; aucun compte privé.
  const privates = (await sql("select p.pseudo from profiles p where p.visibility = 'private'")) as {
    pseudo: string;
  }[];
  const casquetteOnline = await cardIds(page);
  expect(casquetteOnline.length, "le Fil de Roues Libres 66 a des cartes (La Brasa, seed R9a)").toBeGreaterThan(0);
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
  // Les identifiants des cartes (jamais le texte : « il y a 59 min » devient « 1 h », l'encart « Tu es à jour »…) : la copie de la
  // casquette est exactement ce que la casquette avait en ligne, et ne reprend rien de la personne.
  const offline = await cardIds(page);
  expect(offline.length).toBeGreaterThan(0);
  expect(offline).toEqual(casquetteOnline);
  expect(casquetteOnline).not.toEqual(personOnline);
  await ctx.setOffline(false);

  // « Changer » → « Moi · Sarah_66 » → le Fil de la personne (sans pastille).
  await page.getByTestId("fil-actor-change").click();
  await expect(page.getByTestId("casquettes-me")).toContainText("Moi · Sarah_66");
  await shot(page, "n-feuille-roues-libres");
  await page.getByTestId("casquettes-me").click();
  await page.waitForURL(/\/fil/, { timeout: 30_000 });
  await expect(page.getByTestId("fil-actor")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Crew", exact: true })).toBeVisible();
  // Sans réseau, la copie de la personne reste la sienne : celle de la casquette ne l'a pas écrasée.
  await page.getByTestId("fil-filters-for_you").click();
  await ctx.setOffline(true);
  await page.getByTestId("fil-filters-following").click();
  await expect(page.getByTestId("fil-offline")).toBeVisible({ timeout: 30_000 });
  // La copie de la personne est la sienne : ses cartes d'avant (si elle en avait), et jamais celles de la casquette.
  const personOffline = await cardIds(page);
  expect(personOffline).toEqual(personOnline);
  expect(personOffline).not.toEqual(offline);
  await ctx.setOffline(false);
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
    await expectActiveTab(page, "Page");
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
  // Une vraie flamme sur une publication du Fil : la requête part, et sans en-tête d'acteur (la flamme reste celle de la personne).
  const fireCall = page.waitForRequest((r) => /\/api\/feed-posts\/[^/]+\/reaction$/.test(new URL(r.url()).pathname), {
    timeout: 30_000,
  });
  const fireDone = page.waitForResponse((r) => /\/api\/feed-posts\/[^/]+\/reaction$/.test(new URL(r.url()).pathname));
  await page.getByTestId("feed-post-fire").first().click();
  const fire = await fireCall;
  expect((await fire.allHeaders())["x-orasso-actor"]).toBeUndefined();
  await fireDone;
  // Le second appui (retire la flamme) attend la réponse du premier : la base de recette reste propre.
  const unfireDone = page.waitForResponse((r) => /\/api\/feed-posts\/[^/]+\/reaction$/.test(new URL(r.url()).pathname));
  await page.getByTestId("feed-post-fire").first().click();
  await unfireDone;
  await page.waitForTimeout(1_000);
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
  // Les cartes vues, la flamme, le profil, les messages : jamais d'en-tête.
  expect(withActor.some((k) => k.includes("/me/") || k.includes("/reaction"))).toBe(false);
  expect(withoutActor.some((k) => k.includes("/reaction"))).toBe(true);
  await ctx.close();
});

test("Story depuis « Publier » : casquette A active, auteur B choisi → la story est au nom de B (tour 1, point 1)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const rows = await sql<{ id: string }>("select id from structures where name = 'MéditeSportCar' limit 1");
  const other = rows[0]?.id;
  expect(other).toBeTruthy();
  const { ctx, page } = await open(browser, "sarah@orasso.local", "beton", 390, 1);
  await wear(page, "casquette-organizer", "Roues Libres 66");
  // Roues Libres 66 est active ; « Publier » est ouvert au nom de MéditeSportCar (`?auteur=s:<id>`).
  await go(page, `/fil/publier?auteur=${encodeURIComponent(`s:${other}`)}`);
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("en tant que MéditeSportCar").first()).toBeVisible();
  await page.getByTestId("fil-publish-kind").getByText("Story").click();
  await page.waitForURL(/\/story\/publier\?auteur=s/, { timeout: 30_000 });
  // L'écran de story dit au nom de qui : MéditeSportCar, jamais la casquette active.
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("en tant que MéditeSportCar").first()).toBeVisible();
  await expect(page.getByText("en tant que Roues Libres 66")).toHaveCount(0);
  // Retour « Publication » : toujours MéditeSportCar.
  await page.getByTestId("story-publish-kind").getByText("Publication").click();
  await page.waitForURL(/\/fil\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByText("en tant que MéditeSportCar").first()).toBeVisible();
  // Et la story est vraiment publiée au nom de B (casquette A active) : l'auteur se lit en base.
  await page.getByTestId("fil-publish-kind").getByText("Story").click();
  await page.waitForURL(/\/story\/publier\?auteur=s/, { timeout: 30_000 });
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  const startedAt = new Date(Date.now() - 2_000);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-gallery").click();
  await (await chooser).setFiles(landscape());
  await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("story-fit-continue").click();
  await expect(page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-plate-none").click();
  await page.getByTestId("story-plate-none-yes").click();
  await page.getByTestId("story-plate-validate").click();
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-to-preview").click();
  await expect(page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-publish").click();
  await expect(page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  // La story cherchée : celle de MéditeSportCar créée depuis le début du pas (jamais « la dernière de la base »).
  const made = await sql<{ id: string; structure_id: string | null }>(
    "select id, structure_id from stories where structure_id = $1 and created_at >= $2 order by created_at desc",
    [other, startedAt.toISOString()],
  );
  try {
    expect(made, "une story au nom de MéditeSportCar, pas de la casquette active").toHaveLength(1);
    // Aucune story de Sarah (le compte) ni de Roues Libres 66 (la casquette active) créée pendant le pas.
    const wrong = await sql<{ id: string }>(
      `select s.id from stories s
        where s.created_at >= $1
          and (s.author_id = (select id from "user" where email = 'sarah@orasso.local')
               or s.structure_id = (select id from structures where slug = 'roues-libres-66'))
          and s.structure_id is distinct from $2`,
      [startedAt.toISOString(), other],
    );
    expect(wrong, "aucune story publiée sous une autre identité").toHaveLength(0);
  } finally {
    // La base de recette reste propre.
    for (const m of made) await sql("delete from stories where id = $1", [m.id]);
  }
  await ctx.close();
});
