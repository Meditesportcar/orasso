import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { addVehicleApi, MOBILE, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot 40, côté appli (version web de recette) : navigation v2. Les six casquettes du seed (exposant Kenji, visiteur
// Paul sans véhicule, organisateur Damien, pro garage@, prestataire Paul, média Léo du lot 45) : chaque onglet de chaque
// barre affiche la barre d'onglets, le logotype et un grand titre sur une ligne, dans les deux thèmes (captures à
// 390 px). Mon profil complet, Boîte hors barre (notifications dedans), anciens chemins (/acces, /moi), glissement entre
// onglets, visiteur → exposant sans redémarrer.
// Lancer avec APP_URL=http://localhost:8251 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-40-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";

/** Les barres (libellé de l'onglet → route attendue dans l'URL, grand titre attendu). */
// Lot C1 (artefact DA v2) : pas de grand titre sur Accueil, Explorer (exposant, visiteur) et Mon profil (null).
// Lot C4b (artefact `s-pro`, `s-vitrine`) : Ma fiche et Ma vitrine n'ont plus de titre d'onglet, leur titre (h1, en-tête
// pour le lecteur d'écran) est le nom de la fiche ; OWN_NAME le fait lire dans la base pour le compte de la casquette.
// Un nom peut passer sur deux lignes à côté du logo (comme « Atelier Têt Detailing » dans l'artefact), jamais coupé.
const OWN_NAME = "nom de la fiche";
const BARS = {
  // Lot R7a1 (D38) : la même barre pour l'exposant et le visiteur (Sorties et Garage sont des pages hors barre).
  fan: [
    ["Explorer", "explorer", null], // Lot C2a : pas de grand titre (artefact).
    ["Le Fil", "fil", null], // Lot R7e2 : le Fil n’a plus de grand titre, ses trois filtres (Pour toi · Autour de moi · Abonnements) en tiennent lieu.
    ["Accueil", "accueil", null], // Lot C2a : la salutation en tient lieu.
    ["Crew", "crew", null], // Lot R7b2 : l’onglet Crew n’a plus de grand titre (ses onglets internes Fil · Sorties · Membres · Spots en tiennent lieu).
    ["Profil", "profil", null],
  ],
  visitor: [
    ["Explorer", "explorer", null],
    ["Le Fil", "fil", null], // Lot R7e2 : le Fil n’a plus de grand titre, ses trois filtres (Pour toi · Autour de moi · Abonnements) en tiennent lieu.
    ["Accueil", "accueil", null],
    ["Crew", "crew", null], // Lot R7b2 : l’onglet Crew n’a plus de grand titre (ses onglets internes Fil · Sorties · Membres · Spots en tiennent lieu).
    ["Profil", "profil", null],
  ],
  // Lot R9n (maquette R9.1) : Le Fil et Page dans chaque groupe ; l'écran d'aujourd'hui est celui de l'onglet Page.
  organizer: [
    ["Événements", "evenements", null],
    ["Tri", "tri", "Tri"],
    ["Direct", "direct", null],
    ["Le Fil", "fil", null],
    // Lot R9b (journal, « la vraie Page au lieu de l'écran provisoire de R9n ») : le titre est le nom de la structure.
    ["Page", "page", OWN_NAME],
  ],
  pro: [
    ["Scanner", "scanner", "Scanner"],
    ["Le Fil", "fil", null],
    ["Accueil", "accueil", null],
    ["Stats", "stats", "Stats"],
    ["Page", "page", OWN_NAME],
  ],
  provider: [
    ["Missions", "missions", "Missions"],
    ["Le Fil", "fil", null],
    ["Accueil", "accueil", null],
    ["Candidatures", "candidatures", "Candidatures"],
    ["Page", "page", OWN_NAME],
  ],
  media: [
    ["Explorer", "explorer", "Explorer"],
    ["Le Fil", "fil", null],
    ["Accueil", "accueil", null],
    ["Presse", "presse", "Accréditations"],
    // Lot R9b : la Page du média (même gabarit que la structure et le pro) a pour titre le nom du média.
    ["Page", "page", OWN_NAME],
  ],
} as const;

type Kind = keyof typeof BARS;

/** Nom de la fiche pro ou de la vitrine du compte qui porte la casquette (titre de Ma fiche et de Ma vitrine). */
async function ownName(kind: Kind): Promise<string> {
  // Lot R9b : la casquette organisateur de Damien est MéditeSportCar ; le média est la page de son titulaire.
  if (kind === "organizer") {
    const [s] = await sql<{ name: string }>("select name from structures where slug = 'meditesportcar'");
    if (!s) throw new Error("Pas de structure meditesportcar");
    return s.name;
  }
  if (kind === "media") {
    const [m] = await sql<{ name: string }>(
      `select m.name from media_profiles m join "user" u on u.id = m.user_id where u.email = $1 and m.deleted_at is null`,
      [ACCOUNTS[kind]],
    );
    if (!m) throw new Error(`Pas de média pour ${ACCOUNTS[kind]}`);
    return m.name;
  }
  const table = kind === "pro" ? "pro_profiles" : "provider_profiles";
  const owner = kind === "pro" ? "owner_user_id" : "user_id";
  const [row] = await sql<{ name: string }>(
    `select p.name from ${table} p join "user" u on u.id = p.${owner} where u.email = $1 and p.deleted_at is null`,
    [ACCOUNTS[kind]],
  );
  if (!row) throw new Error(`Pas de fiche pour ${ACCOUNTS[kind]}`);
  return row.name;
}

/** Qui représente chaque casquette dans le seed. */
const ACCOUNTS: Record<Kind, string> = {
  fan: "kenji@orasso.local",
  visitor: "paul.photo@orasso.local",
  organizer: "damien@orasso.local",
  pro: "garage@orasso.local",
  provider: "paul.photo@orasso.local",
  media: "leo@orasso.local",
};

async function open(browser: Browser, theme: Theme, viewport = MOBILE) {
  const ctx = await browser.newContext({ viewport, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
}

/** Passe à une casquette depuis Mon profil (plus de feuille derrière l'avatar). */
async function choose(page: Page, kind: Kind) {
  if (kind === "fan" || kind === "visitor") return;
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId(`casquette-${kind}`).first().click();
  // Lot 43 : le pro et le prestataire ont leur Accueil, sur lequel leur casquette s'ouvre.
  const landing = { organizer: /\/direct/, pro: /\/accueil/, provider: /\/accueil/, media: /\/accueil/ };
  await page.waitForURL(landing[kind], { timeout: 30_000 });
}

/**
 * La barre d'onglets, le logotype, un grand titre sur une ligne (un nom de fiche peut en prendre deux), jamais coupé ;
 * audit des règles qui valent dans l'appli web.
 */
async function checkTab(page: Page, title: string | null, oneLine = true) {
  await expect(page.getByRole("tablist").last().getByRole("tab")).toHaveCount(5, { timeout: 30_000 });
  await expect(page.getByTestId("topbar-logo").first()).toBeVisible();
  // Lot R7a1 : le passionné a la cloche « Activité » et la bulle « Messages » ; les autres casquettes gardent la Boîte.
  await expect(
    page
      .getByRole("button", { name: "Boîte", exact: true })
      .or(page.getByRole("button", { name: /^Activité/ }))
      .first(),
  ).toBeVisible();
  if (title) {
    const heading = page.getByRole("heading", { name: title, exact: true }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
    const lines = await heading.evaluate((el) => {
      const style = getComputedStyle(el);
      const line = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
      return Math.round(el.getBoundingClientRect().height / line);
    });
    expect(lines, `« ${title} » sur ${oneLine ? "une ligne" : "deux lignes au plus"}`).toBeLessThanOrEqual(
      oneLine ? 1 : 2,
    );
    const cut = await heading.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(cut, `« ${title} » sans points de suspension`).toBe(false);
  }
  const audit = await auditPage(page);
  expect(audit.greens).toEqual([]);
  expect(audit.horizontalScroll).toBe(false);
}

/** Un chargement de page rejoue l'ouverture de l'appli (3 s, lot 38/39) : on attend qu'elle se termine. */
async function afterOpening(page: Page) {
  // Lot 39 : un toucher passe l'ouverture (OpeningBattle) ; sinon elle dure 3 s.
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("les 30 onglets des six casquettes du seed : barre, logotype, grand titre sur une ligne (deux thèmes)", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of ["beton", "sable"] as const) {
    for (const kind of Object.keys(BARS) as Kind[]) {
      const { ctx, page } = await open(browser, theme);
      await signIn(page, ACCOUNTS[kind]);
      await choose(page, kind);
      for (const [label, route, title] of BARS[kind]) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${route}(\\?|$)`), { timeout: 30_000 });
        if (title === OWN_NAME) await checkTab(page, await ownName(kind), false);
        else await checkTab(page, title);
        await shot(page, `${kind}-${route}-${theme}`);
      }
      await ctx.close();
    }
  }
});

test("barre média (lot 45 à venir) : cinq onglets dans /_ds", async ({ browser }) => {
  const { ctx, page } = await open(browser, "beton");
  await page.goto("/_ds");
  for (const label of ["Presse", "Contenus"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  }
  await ctx.close();
});

test("Mon profil, le hub : en-tête, saison, passeport, crew, casquettes, Créer, réglages en tuiles", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, ACCOUNTS.fan);
    // L'ancien chemin `/moi` mène à l'onglet Profil.
    await page.goto("/moi");
    await afterOpening(page);
    await expect(page).toHaveURL(/\/profil/, { timeout: 30_000 });
    await checkTab(page, null);
    // Lot R7b1 : la saison et le passeport sont dans l'onglet Sorties, le crew a son onglet ; le Profil a ses deux onglets.
    for (const id of ["profil-head", "profil-tabs", "profil-count-sorties", "casquette-fan"]) {
      await expect(page.getByTestId(id).first()).toBeVisible();
    }
    await expect(page.getByTestId("casquette-staff")).toBeVisible();
    // Lot R4c (maquette R4.6) : « Mon profil public » et les compteurs montent dans l'en-tête du profil. Lot R6b (D37) :
    // plus d'« amis », le troisième compteur est celui des sorties.
    // Lot R8b1 : « Mon profil public » quitte l'en-tête pour « Voir mon profil comme les autres », première ligne des Réglages.
    await expect(page.getByTestId("profil-count-sorties")).toBeVisible();
    await expect(page.getByTestId("profil-public")).toHaveCount(0);
    await page.screenshot({ path: `${DIR}/profil-hub-${theme}.png`, fullPage: true });
    // Lot M5 (maquette 7.2) : réglages en lignes groupées, « Compte » (e-mail, mot de passe, sanctions) à la place de
    // « Sécurité ». Lot R5b (remarque 6 de Damien) : ils sont derrière la roue dentée de la carte du profil.
    await page.getByTestId("profil-gear").click();
    for (const id of [
      "reglage-profil-public",
      "reglage-notifications",
      "reglage-tes-preferences-tuile",
      "reglage-preferences",
      "reglage-compte",
      "reglage-confidentialite",
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await page.goto("/moi");
    await afterOpening(page);
    // Lot M5 : « Devenir organisateur ou pro » (lien) ouvre la même feuille : structure, fiche pro, prestataire.
    await page.getByTestId("profil-create").click();
    await expect(page.getByTestId("casquette-create-organizer")).toBeVisible();
    await shot(page, `profil-creer-${theme}`);
    await page.keyboard.press("Escape");
    // Mon QR de compte.
    await page.goto("/moi");
    await afterOpening(page);
    await page.getByTestId("profil-account-qr").click();
    await expect(page.getByText("Mon QR de compte").last()).toBeVisible();
    await shot(page, `profil-qr-${theme}`);
    // Apparence (clé de route `preferences`) : thème Béton / Sable / Automatique et « Réduire les animations ».
    await page.goto("/reglages/preferences");
    await afterOpening(page);
    await expect(page.getByText("Automatique", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Réduire les animations", { exact: true })).toBeVisible();
    await shot(page, `reglages-preferences-${theme}`);
    // La cloche, en haut à droite : l'Activité, hors de la barre, ✕ pour revenir.
    await page.goto("/accueil");
    await afterOpening(page);
    await page
      .getByRole("button", { name: /^Activité/ })
      .first()
      .click();
    await page.waitForURL(/\/activite$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Activité", exact: true }).first()).toBeVisible();
    // Pas de barre d'onglets ici (lot R7c2 : plus de segments, la Boîte a disparu).
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await shot(page, `activite-${theme}`);
    // L'ancien onglet Accès mène à Sorties.
    await page.goto("/acces");
    await expect(page).toHaveURL(/\/sorties/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Mes sorties", exact: true })).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  }
});

test("glissement entre onglets : à gauche l'onglet de droite, à droite celui de gauche", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, ACCOUNTS.fan);
  await expect(page).toHaveURL(/\/accueil/);
  await afterOpening(page);
  const drag = async (from: number, to: number) => {
    // Sur le grand titre : pas de carte ni de carrousel sous le doigt (ils gardent leur geste).
    await page.mouse.move(from, 112);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(from + ((to - from) * i) / 12, 112 + i * 0.2);
    await page.mouse.up();
  };
  await drag(320, 60);
  await page.waitForURL(/\/crew/, { timeout: 15_000 });
  await drag(60, 330);
  await page.waitForURL(/\/accueil/, { timeout: 15_000 });
  // Un petit geste ne change rien.
  await drag(200, 160);
  await page.waitForTimeout(800);
  expect(page.url()).toMatch(/\/accueil/);
  await ctx.close();
});

test("un visiteur qui ajoute un véhicule devient exposant, sans redémarrer", async ({ browser }) => {
  test.setTimeout(180_000);
  const pseudo = `Visit40_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const { ctx, page } = await open(browser, "sable");
  await signIn(page, email);
  // Lot R7a1 : la même barre pour le visiteur et l'exposant ; ce qui les distingue est dans le Profil (la ligne « Mon garage »).
  await expect(page.getByRole("tab", { name: "Crew", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Garage", exact: true })).toHaveCount(0);
  await shot(page, "visiteur-accueil-sable");
  await page.getByRole("tab", { name: "Profil", exact: true }).click();
  await expect(page.getByTestId("casquette-visitor")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("casquette-quick-vehicle")).toBeVisible();
  // Lots R8b1 et R8b2 : un visiteur sans véhicule n'a pas d'onglet Garage, le Profil s'ouvre sur Publications (Sorties est un
  // clic plus loin) ; l'ajout d'un premier véhicule passe par la ligne de « Mes casquettes » (vérifiée juste au-dessus).
  await expect(page.getByTestId("profil-tab-garage")).toHaveCount(0);
  await page.getByTestId("profil-tab-sorties").click();
  await expect(page.getByTestId("profil-places")).toBeVisible({ timeout: 30_000 });
  await shot(page, "visiteur-profil-sable");

  await addVehicleApi(cookie, randomPlate());
  // Retour sur un onglet : `GET /me` relu, la casquette de base devient l'exposant (la ligne « Mon garage » du Profil).
  await page.getByRole("tab", { name: "Explorer", exact: true }).click();
  await page.getByRole("tab", { name: "Profil", exact: true }).click();
  // Lot R8b2 : le profil s'ouvre sur « Publications » ; le Garage (apparu avec la voiture) est un clic plus loin.
  await page.getByTestId("profil-tab-garage").click({ timeout: 30_000 });
  await expect(page.getByTestId("garage-add")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Crew", exact: true })).toBeVisible();
  await shot(page, "visiteur-devenu-exposant-sable");
  await ctx.close();
});
