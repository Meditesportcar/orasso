import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { landscape } from "./lotr7f3-setup";
import { RELAIS } from "./relais";

// Lot R9h, partie 1 : le site par casquette. L'acteur est porté par l'espace (T48) : `/orga/:structure` (`s:`), `/pro/:pro` (`p:`),
// `/app/media` (`m:`), `/app/prestataire` (`v:`) ; partout ailleurs, « moi ». Vérifie : le Fil de chaque casquette (« Tu lis en tant
// que », « Abonnements » = ce que la page suit, aucun compte privé), l'en-tête `x-orasso-actor` seulement sur la liste blanche,
// « Publier » au nom de la page (segment « Publication | Story »), un commentaire signé de la page, la barre du haut d'un espace
// (pastille, cloche, bulle), la sous-navigation Média et Prestataire, le passionné inchangé (aucun en-tête), une casquette périmée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9h-captures/apres/recette-site`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function open(page: Page, email: string, to: string) {
  await page.context().clearCookies();
  await loginInBrowser(page, email, undefined, to);
  await page.goto(to);
}

/** Les appels de l'API que la page envoie avec l'en-tête de l'acteur : `METHOD chemin` (sans requête). */
function watchActorRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith("/api/")) return;
    if (r.headers()["x-orasso-actor"]) seen.push(`${r.method()} ${url.pathname.replace("/api", "")}`);
  });
  return seen;
}

const WHITELIST = [
  /^GET \/fil$/,
  /^GET \/fil\/fresh$/,
  /^GET \/stories\/bar$/,
  /^(GET|POST) \/feed-posts\/[^/]+\/comments$/,
  /^GET \/feed-comments\/[^/]+\/replies$/,
  /^GET \/feed-posts\/[^/]+\/mention-suggestions$/,
];

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "aucun défilement horizontal de la page").toBeLessThanOrEqual(1);
}

type Me = { pro: { slug: string; id: string } | null; personas: { kind: string; id: string }[] };
const meOf = async (email: string) => (await apiCall<Me>(await login(email), "GET", "/me")).data;

for (const theme of ["beton", "sable"] as const) {
  test(`Roues Libres 66 : le Fil en tant que la structure, la barre du haut, Abonnements, commentaire, Publier, story (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    const actorCalls = watchActorRequests(page);
    await open(page, "sarah@orasso.local", "/orga/roues-libres-66/fil");

    // La pastille « Tu lis en tant que », le nom jamais tronqué, « Changer » vers « Mes casquettes ».
    await expect(page.getByTestId("fil-actor")).toContainText("Tu lis en tant que");
    await expect(page.getByTestId("fil-actor-name")).toHaveText("Roues Libres 66");
    await expect(page.getByTestId("fil-actor-change")).toHaveAttribute("href", "/app/moi");
    // La barre latérale : « Le Fil » (actif) après « Événements », « Page » avant « Structure » ; Activité et Messages restent.
    const side = page.getByRole("navigation", { name: "Espace organisateur" });
    await expect(side.getByRole("link", { name: "Le Fil" })).toHaveAttribute("aria-current", "page");
    await expect(side.getByRole("link", { name: "Page" })).toHaveAttribute("href", "/orga/roues-libres-66/page");
    await expect(side.getByRole("link", { name: /^Activité/ })).toBeVisible();
    await expect(side.getByRole("link", { name: "Messages" })).toBeVisible();
    const links = (await side.getByRole("link").allInnerTexts()).map((t) => t.replace(/\s+\d+$/, "").trim());
    expect(links.indexOf("Le Fil")).toBe(links.indexOf("Événements") + 1);
    expect(links.indexOf("Page")).toBe(links.indexOf("Structure") - 1);

    // La barre du haut : la pastille (mène à la Page), la cloche et la bulle de la structure.
    const bar = page.getByTestId("casquette-bar");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("casquette-chip")).toHaveAttribute("href", "/orga/roues-libres-66/page");
    const bell = bar.getByRole("link", { name: /^Activité/ });
    await expect(bell).toHaveAttribute("href", "/orga/roues-libres-66/activite");
    await expect(bar.getByRole("link", { name: /^Messages/ })).toHaveAttribute(
      "href",
      "/orga/roues-libres-66/communication",
    );
    // Le compteur de la cloche est celui de la barre latérale (une seule source).
    const sideCount = (await page.getByTestId("orga-count").first().innerText()).trim();
    await expect(bell).toContainText(sideCount);
    await shot(page, `orga-fil-${theme}`);

    // « Abonnements » : ce que la page suit (La Brasa), jamais un compte privé ; l'en-tête part sur la lecture.
    const read = page.waitForRequest((r) => r.url().includes("/api/fil?") && r.url().includes("filter=following"));
    await page.getByTestId("fil-filters-following").click();
    expect((await (await read).allHeaders())["x-orasso-actor"]).toMatch(/^s:/);
    await expect(page.getByTestId("fil-phrase")).toContainText("Ceux que Roues Libres 66 suit");
    await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
    const privates = (await sql("select p.pseudo from profiles p where p.visibility = 'private'")) as {
      pseudo: string;
    }[];
    const text = await page.getByTestId("fil-list").innerText();
    expect(text).toContain("La Brasa");
    for (const p of privates) expect(text, `compte privé ${p.pseudo}`).not.toContain(p.pseudo);
    await shot(page, `orga-fil-abonnements-${theme}`);

    // Un commentaire posté depuis le Fil de la structure est signé « Roues Libres 66 ».
    await page.getByTestId("feed-post-comment").first().click();
    await expect(page.getByTestId("feed-comments-sheet")).toBeVisible();
    const text1 = `Bravo de la part de la page ${Date.now()}`;
    await page.getByTestId("feed-comment-input").fill(text1);
    await page.getByTestId("feed-comment-send").click();
    const mine = page.getByTestId("feed-comment").filter({ hasText: text1 });
    await expect(mine).toBeVisible({ timeout: 30_000 });
    await expect(mine.locator("b").first()).toHaveText("Roues Libres 66");
    await shot(page, `orga-commentaire-${theme}`);
    // Les suggestions « @ » se lisent avec les droits de la page (R9h, tour 1) : l'en-tête part aussi sur cette lecture.
    const suggest = page.waitForRequest((r) => r.url().includes("/mention-suggestions"));
    await page.getByTestId("feed-comment-input").fill("@");
    expect((await (await suggest).allHeaders())["x-orasso-actor"]).toMatch(/^s:/);
    await page.getByTestId("feed-comment-input").fill("");
    await page.getByTestId("feed-comments-close").click();

    // « Publier » : un seul geste (plus de liste « En story | Dans le Fil »), au nom de la structure, puis le segment « Story ».
    await expect(page.getByTestId("fil-publish-choose-story")).toHaveCount(0);
    await page.getByTestId("fil-publish-open").click();
    await page.waitForURL(/\/app\/fil\/publier\?auteur=s%3A/);
    await expect(page.getByTestId("publish-kind-post")).toHaveAttribute("aria-selected", "true");
    const asStructure = page.locator('[data-testid^="fil-publish-as-structure:"][aria-pressed="true"]');
    await expect(asStructure).toContainText("Roues Libres 66");
    await shot(page, `publier-casquette-${theme}`);
    await page.getByTestId("publish-kind-story").click();
    await page.waitForURL(/\/app\/story\/publier\?auteur=s%3A/);
    await expect(page.getByTestId("publish-kind-story")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("en tant que Roues Libres 66")).toBeVisible();
    // Une page est publique par nature : « Public » seul, jamais un crew.
    await page.getByTestId("story-file").setInputFiles(landscape());
    await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("story-plate-none").click();
    await page.getByTestId("story-plate-none-yes").click();
    await expect(page.getByTestId("story-audience-public")).toBeVisible();
    await expect(page.getByTestId("story-audience-followers")).toHaveCount(0);
    await shot(page, `story-casquette-${theme}`);
    // La story part au nom de la structure : sa barre de stories, lue avec l'acteur, la montre dans `mine`.
    await page.getByTestId("story-publish-send").click();
    await expect(page.getByTestId("story-done-back")).toHaveAttribute("href", "/orga/roues-libres-66/fil", {
      timeout: 60_000,
    });
    const structure = (await sql("select id from structures where slug = 'roues-libres-66'")) as { id: string }[];
    const cookie = await login("sarah@orasso.local");
    const barRes = await fetch(`http://localhost:${process.env.API_PORT ?? 3001}/api/stories/bar`, {
      headers: { cookie, origin: WEB, "x-orasso-actor": `s:${structure[0]?.id}` },
    });
    const body = (await barRes.json()) as { mine: unknown };
    expect(body.mine, "la story est celle de la structure").toBeTruthy();
    await page.goto("/app/story/publier?auteur=s%3A" + structure[0]?.id);
    // Retour « Publication » : la même casquette ; ✕ revient au Fil de la structure.
    await page.getByTestId("publish-kind-post").click();
    await page.waitForURL(/\/app\/fil\/publier\?auteur=s%3A/);
    await page.getByRole("link", { name: "Fermer" }).first().click();
    await page.waitForURL(/\/orga\/roues-libres-66\/fil/);

    // L'en-tête n'est parti que sur la liste blanche (jamais la flamme, les cartes vues, les messages).
    for (const call of actorCalls) {
      expect(
        WHITELIST.some((re) => re.test(call)),
        `appel hors liste blanche : ${call}`,
      ).toBe(true);
    }
    await ctx.close();
  });
}

test("« Publier » et la story : une clé inconnue est ignorée, la personne publie en son nom", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  for (const auteur of ["s%3A00000000-0000-0000-0000-000000000000", "me", "zz%3Ax"]) {
    await open(page, "sarah@orasso.local", `/app/story/publier?auteur=${auteur}`);
    await page.getByTestId("story-file").setInputFiles(landscape());
    await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("story-plate-none").click();
    await page.getByTestId("story-plate-none-yes").click();
    await expect(page.getByTestId("story-audience-followers")).toBeVisible();
    await expect(page.getByTestId("story-audience-public")).toHaveCount(0);
    await expect(page.getByText(/^en tant que /)).toHaveCount(0);
  }
  await ctx.close();
});

test("Pro : /pro/<slug>/fil, la barre latérale et la barre du haut avec la cloche de la personne", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const pro = (await meOf("garage@orasso.local")).pro;
  expect(pro, "le compte garage@ a une fiche pro (seed)").not.toBeNull();
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  const actorCalls = watchActorRequests(page);
  await open(page, "garage@orasso.local", `/pro/${pro?.slug}/fil`);
  await expect(page.getByTestId("fil-actor-name")).toHaveText(/\S/);
  await expect(page.getByTestId("fil-actor")).toContainText("Tu lis en tant que");
  const side = page.getByRole("navigation", { name: "Espace pro" });
  const links = (await side.getByRole("link").allInnerTexts()).map((t) => t.trim());
  expect(links.slice(0, 4)).toEqual(["Fiche", "Le Fil", "Page", "Publications"]);
  // La cloche et la bulle de la personne.
  const bar = page.getByTestId("casquette-bar");
  await expect(bar.getByRole("link", { name: /^Activité/ })).toHaveAttribute("href", "/app/activite");
  await expect(bar.getByRole("link", { name: /^Messages/ })).toHaveAttribute("href", "/app/messages");
  await expect(page.getByTestId("casquette-chip")).toHaveAttribute("href", `/pro/${pro?.slug}/page`);
  await noHorizontalScroll(page);
  await page.getByTestId("fil-filters-following").click();
  await expect(page.getByTestId("fil-phrase")).toContainText("Ceux que");
  await page.waitForTimeout(800);
  expect(actorCalls.some((c) => c.startsWith("GET /fil"))).toBe(true);
  expect(actorCalls.every((c) => WHITELIST.some((re) => re.test(c)))).toBe(true);
  // « Page » mène quelque part (la Page du propriétaire est celle de la partie 2) : jamais une erreur.
  const res = await page.goto(`/pro/${pro?.slug}/page`);
  expect(res?.status()).toBeLessThan(400);
  await ctx.close();
});

for (const space of [
  {
    name: "Média",
    email: "leo@orasso.local",
    fil: "/app/media/fil",
    home: "/app/media",
    persona: "Sud Cars",
    tabs: ["Explorer", "Le Fil", "Accueil", "Presse", "Page"],
  },
  {
    name: "Prestataire",
    email: "sofia@orasso.local",
    fil: "/app/prestataire/fil",
    home: "/app/prestataire",
    persona: "La Brasa",
    tabs: ["Missions", "Le Fil", "Accueil", "Candidatures", "Page"],
  },
]) {
  test(`${space.name} : la sous-navigation de casquette (cinq onglets, l'actif) et le Fil`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await open(page, space.email, space.fil);
    const tabs = page.getByTestId("casquette-tabs");
    await expect(tabs).toBeVisible();
    expect((await tabs.getByRole("tab").allInnerTexts()).map((t) => t.trim())).toEqual(space.tabs);
    await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Le Fil");
    await expect(page.getByTestId("fil-actor-name")).toHaveText(space.persona);
    await expect(page.getByTestId("stories-mine")).toBeVisible();
    await noHorizontalScroll(page);
    await shot(page, `${space.name}-fil-sous-navigation`);
    // Les anciennes adresses ne bougent pas : l'espace s'ouvre, « Accueil » est l'onglet actif.
    await page.goto(space.home);
    await expect(page.getByTestId("casquette-tabs").getByRole("tab", { selected: true })).toHaveText("Accueil");
    await ctx.close();
  });
}

test("Passionné : /app/fil inchangé, aucun en-tête d'acteur, aucune sous-navigation ni pastille", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  const actorCalls = watchActorRequests(page);
  await open(page, "damien@orasso.local", "/app/fil");
  await expect(page.getByTestId("fil-filters-following")).toBeVisible();
  await expect(page.getByTestId("fil-actor")).toHaveCount(0);
  await expect(page.getByTestId("casquette-tabs")).toHaveCount(0);
  // La liste « En story | Dans le Fil » du passionné est celle d'avant.
  await page.getByTestId("fil-publish-open").click();
  await expect(page.getByTestId("fil-publish-choose-story")).toBeVisible();
  await page.getByTestId("fil-filters-following").click();
  await expect(page.getByTestId("fil-phrase")).toContainText("Ceux que tu suis");
  await page.waitForTimeout(1500);
  expect(actorCalls, "aucune requête du passionné ne porte l'en-tête de l'acteur").toEqual([]);
  // L'écran « Publier » du passionné : le segment « Publication | Story » sans casquette.
  await page.goto("/app/fil/publier");
  await expect(page.getByTestId("publish-kind-post")).toHaveAttribute("aria-selected", "true");
  await ctx.close();
});

test("Casquette périmée : retour à « Moi » avec l'avis, et une page suspendue n'a pas de Fil", async ({ browser }) => {
  test.setTimeout(240_000);
  const before = (await sql(
    "select verification, suspended_reason from structures where slug = 'roues-libres-66'",
  )) as {
    verification: string;
    suspended_reason: string | null;
  }[];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await open(page, "sarah@orasso.local", "/orga/roues-libres-66/fil");
    await expect(page.getByTestId("fil-actor")).toBeVisible();
    // La structure est suspendue pendant que la page est ouverte : la lecture suivante est refusée (403 `persona_forbidden`).
    await sql(
      "update structures set verification = 'suspended', suspended_reason = 'moderation' where slug = 'roues-libres-66'",
    );
    await page.getByTestId("fil-filters-following").click();
    await page.waitForURL(/\/app\/moi\?casquette=indisponible/, { timeout: 30_000 });
    await expect(page.getByTestId("casquette-gone")).toContainText("Cette casquette n'est plus disponible");
    await shot(page, "casquette-perimee");
    // À l'ouverture, une page suspendue n'a pas de Fil (on n'agit jamais au nom d'une page suspendue).
    await page.goto("/orga/roues-libres-66/fil");
    await expect(page.getByTestId("casquette-fil-unavailable")).toBeVisible();
    await expect(page.getByTestId("fil-actor")).toHaveCount(0);
  } finally {
    const was = before[0];
    if (was) {
      await sql(
        `update structures set verification = '${was.verification}', suspended_reason = ${
          was.suspended_reason ? `'${was.suspended_reason}'` : "null"
        } where slug = 'roues-libres-66'`,
      );
    }
    await ctx.close();
  }
});

test("Les adresses « Page » existent (la partie 2 en fait la Page du propriétaire)", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "damien@orasso.local", "/orga/meditesportcar/page");
  await expect(page).toHaveURL(`${WEB}/orga/meditesportcar/structure`);
  await ctx.close();
});
