import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  login,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { creerComptePastilles } from "./r7a1-pastilles";
import { RELAIS } from "./relais";

// Lot R7a1 (D38), côté appli (version web compilée de recette) : la barre Explorer · Le Fil · Accueil · Crew · Profil
// (exposant Kenji et visiteur Paul), Sorties et Garage joignables par leur adresse (en-tête de fiche, sans barre),
// la barre du haut (loupe, cloche « Activité », bulle « Messages », plus de Boîte), le bandeau « où sont passées les
// choses » vu une fois par compte, les onglets Le Fil et Crew (coquilles). Lancer avec APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7a1-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const BAR = ["Explorer", "Le Fil", "Accueil", "Crew", "Profil"];

async function open(browser: Browser, theme: "beton" | "sable" = "beton") {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page: await ctx.newPage() };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function signOut(page: Page) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("profil-gear").click();
  await page.getByTestId("profil-sign-out").click();
  await page.waitForURL(/auth/, { timeout: 30_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

/** Les cinq onglets de la barre, dans l'ordre. */
async function tabNames(page: Page): Promise<string[]> {
  const tabs = page.getByRole("tablist").last().getByRole("tab");
  await expect(tabs).toHaveCount(5, { timeout: 30_000 });
  return tabs.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? el.textContent ?? ""));
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("la barre du passionné : cinq onglets dans l'ordre, exposant et visiteur", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [who, email] of [
    ["exposant", "kenji@orasso.local"],
    ["visiteur", "paul.photo@orasso.local"],
  ] as const) {
    const { ctx, page } = await open(browser);
    await signIn(page, email);
    await afterOpening(page);
    expect(await tabNames(page), who).toEqual(BAR);
    // Sorties, Garage et Passeport ne sont plus des onglets.
    for (const old of ["Sorties", "Garage", "Passeport"]) {
      await expect(page.getByRole("tab", { name: old, exact: true }), `${who} : ${old}`).toHaveCount(0);
    }
    // Chaque onglet ouvre sa page.
    for (const [label, url] of [
      ["Le Fil", /\/fil/],
      ["Crew", /\/crew/],
      ["Explorer", /\/explorer/],
      ["Profil", /\/profil/],
      ["Accueil", /\/accueil/],
    ] as const) {
      await page.getByRole("tab", { name: label, exact: true }).click();
      await page.waitForURL(url, { timeout: 15_000 });
    }
    await ctx.close();
  }
});

test("la barre du haut : loupe, cloche « Activité », bulle « Messages », plus de Boîte", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await afterOpening(page);
  for (const tab of ["Accueil", "Le Fil", "Crew", "Explorer", "Profil"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Rechercher", exact: true }).first(), tab).toBeVisible();
    await expect(page.getByRole("button", { name: /^Activité/ }).first(), tab).toBeVisible();
    await expect(page.getByRole("button", { name: /^Messages/ }).first(), tab).toBeVisible();
    await expect(page.getByRole("button", { name: "Boîte", exact: true }), tab).toHaveCount(0);
  }
  // Les pastilles sont des nombres entiers positifs, un par bouton (jamais « 0 »).
  for (const name of ["Activité", "Messages"]) {
    const text = (
      await page
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .first()
        .innerText()
    ).trim();
    expect(text === "" || /^[1-9]\d*\+?$/.test(text), `pastille ${name} : « ${text} »`).toBe(true);
  }
  await page.getByRole("tab", { name: "Accueil", exact: true }).click();
  // Lot R7c2 : la bulle ouvre Messages, la cloche l'Activité (la Boîte a disparu).
  await page
    .getByRole("button", { name: /^Messages/ })
    .first()
    .click();
  await page.waitForURL(/\/messages$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Messages", exact: true }).first()).toBeVisible();
  await go(page, "/accueil");
  await page
    .getByRole("button", { name: /^Activité/ })
    .first()
    .click();
  await page.waitForURL(/\/activite$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Activité", exact: true }).first()).toBeVisible();
  await ctx.close();
});

test("trois icônes tiennent à 384 px, police 1,3 : la loupe se resserre, jamais les pastilles", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser);
  await ctx.addInitScript(() => localStorage.setItem("orasso.recette.echellePolice", "1.3"));
  await signIn(page, "kenji@orasso.local");
  await page.reload();
  await afterOpening(page);
  const boxes = await Promise.all(
    ["Rechercher", "Activité", "Messages"].map((name) =>
      page
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .first()
        .boundingBox(),
    ),
  );
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(384);
  }
  // Pas de chevauchement entre deux boutons voisins.
  for (let i = 1; i < boxes.length; i++) {
    expect((boxes[i - 1]?.x ?? 0) + (boxes[i - 1]?.width ?? 0)).toBeLessThanOrEqual((boxes[i]?.x ?? 0) + 0.5);
  }
  await shot(page, "barre-haut-384-x1.3");
  await ctx.close();
});

test("Sorties et Garage : joignables par leur adresse, en-tête de fiche, sans barre d'onglets", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await afterOpening(page);

  await go(page, "/sorties");
  await expect(page.getByRole("heading", { name: "Mes sorties", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("persona-tabbar")).toHaveCount(0);
  await expect(page.getByTestId("appbar-close").first()).toBeVisible();
  await shot(page, "sorties-page");

  // Lot R7b1 : le Garage est l'onglet interne du Profil ; `/garage` y mène (le bandeau « où sont passées les choses » marche).
  await go(page, "/garage");
  await expect(page.getByTestId("profil-tab-garage")).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await page.waitForURL(/\/profil/, { timeout: 15_000 });

  // Depuis l'Accueil : « Tu es staff » ouvre Sorties, le ✕ ramène à l'Accueil.
  await go(page, "/accueil");
  const nudge = page.getByTestId("home-staff-nudge");
  if (await nudge.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await nudge.click();
    await page.waitForURL(/\/sorties/, { timeout: 15_000 });
    await page.getByTestId("appbar-close").first().click();
    await page.waitForURL(/\/accueil/, { timeout: 15_000 });
  }
  // L'ancienne adresse d'onglet `/acces` mène à la page Sorties ; `/passeport` à celle du passeport.
  await go(page, "/acces");
  await page.waitForURL(/\/sorties/, { timeout: 30_000 });
  await go(page, "/passeport");
  await page.waitForURL(/\/profil/, { timeout: 30_000 });
  await expect(page.getByTestId("profil-tab-sorties")).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await ctx.close();
});

test("Sorties → événement → « Ma candidature » → Sorties : pas d'empilement, le ✕ ramène à l'écran d'origine", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const orga = await login("damien@orasso.local");
  const event = await createEvent(orga, { title: `Boucle R7a1 ${unique()}`.slice(0, 40), admission: "filtered" });
  const pseudo = `Boucle${unique()}`.slice(0, 20);
  const cookie = await signUpApi(pseudo);
  await applyApi(cookie, event.id, await addVehicleApi(cookie, randomPlate()));
  const { ctx, page } = await open(browser);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await afterOpening(page);
  // Origine : le Profil, onglet Sorties (le nombre « sorties »), puis « Voir mes places » (R7b1).
  await go(page, "/profil");
  await page.getByTestId("profil-count-sorties").click();
  await page.getByTestId("profil-places").click();
  await page.waitForURL(/\/sorties/, { timeout: 15_000 });
  // Sorties → l'événement (le titre du ticket) → « Ma candidature » → retour à Sorties, une seule fois dans la pile.
  await page.getByTestId("ticket-application").first().getByText(event.title).first().click();
  await page.waitForURL(/\/e\//, { timeout: 15_000 });
  await page.getByTestId("event-primary").click();
  await page.waitForURL(/\/sorties/, { timeout: 15_000 });
  await expect(page.getByTestId("ticket-application").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "boucle-sorties-retour");
  // Le ✕ ramène au Profil (écran d'origine), pas à l'événement ni à une seconde page Sorties.
  await page.getByTestId("appbar-close").first().click();
  await page.waitForURL(/\/profil/, { timeout: 15_000 });
  await expect(page.getByTestId("profil-count-sorties")).toBeVisible();
  await ctx.close();
});

test("Le Fil (coquille) et Crew : avec un crew, sans crew", async ({ browser }) => {
  test.setTimeout(300_000);
  // Kenji (chef de Roussillon Drift) : Le Fil montre le Journal sous son titre ; Crew ouvre la page de son crew.
  const k = await open(browser);
  await signIn(k.page, "kenji@orasso.local");
  await afterOpening(k.page);
  await k.page.getByRole("tab", { name: "Le Fil", exact: true }).click();
  // Lot R7e2 : Le Fil n'est plus le Journal : publier, trois filtres, cartes.
  await expect(k.page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await expect(k.page.getByTestId("fil-filters")).toBeVisible();
  await expect(k.page.getByTestId("journal-item")).toHaveCount(0);
  await shot(k.page, "fil-kenji");
  await k.page.getByRole("tab", { name: "Crew", exact: true }).click();
  // Lot R7b2 : l'onglet montre le crew lui-même (nom, onglets internes), plus la coquille « Ouvrir mon crew ».
  await expect(k.page.getByTestId("crew-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(k.page.getByTestId("crew-tab-none")).toHaveCount(0);
  await shot(k.page, "crew-kenji");
  await k.ctx.close();

  // Sarah (sans crew) : « Rejoindre un crew » et « Créer un crew », un seul bouton principal.
  const s = await open(browser);
  await signIn(s.page, "sarah@orasso.local");
  await afterOpening(s.page);
  await s.page.getByRole("tab", { name: "Crew", exact: true }).click();
  await expect(s.page.getByTestId("crew-tab-none")).toBeVisible({ timeout: 30_000 });
  await expect(s.page.getByTestId("crew-tab-join")).toContainText("Rejoindre un crew");
  await expect(s.page.getByTestId("crew-tab-create")).toContainText("Créer un crew");
  await shot(s.page, "crew-sarah");
  await s.page.getByTestId("crew-tab-create").click();
  await s.page.waitForURL(/\/crew\/nouveau/, { timeout: 15_000 });
  await go(s.page, "/crew");
  await s.page.getByTestId("crew-tab-join").click();
  await s.page.waitForURL(/\/rejoindre-crew/, { timeout: 15_000 });
  await s.ctx.close();
});

test("le bandeau « où sont passées les choses » : vu une fois par compte, jamais deux", async ({ browser }) => {
  test.setTimeout(420_000);
  const { ctx, page } = await open(browser);
  const banner = page.getByTestId("whatsnew-banner");

  await signIn(page, "kenji@orasso.local");
  await afterOpening(page);
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText("Orasso se range autrement");
  await expect(banner).toContainText("Mon garage");
  await expect(banner).toContainText("Rien n'est perdu");
  // Sous le bonjour (maquette R7.1), ✕ nommé « Fermer l'explication ».
  const hello = await page.getByTestId("home-greeting").boundingBox();
  const box = await banner.boundingBox();
  expect((box?.y ?? 0) - ((hello?.y ?? 0) + (hello?.height ?? 0))).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId("whatsnew-dismiss")).toHaveAccessibleName("Fermer l'explication");
  await shot(page, "bandeau-kenji");
  await page.getByTestId("whatsnew-dismiss").click();
  await expect(banner).toHaveCount(0);
  // Une autre visite de l'Accueil, et un rechargement : plus jamais.
  await page.reload();
  await afterOpening(page);
  await page.waitForTimeout(1_500);
  await expect(banner).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("whatsnew")));
  expect(keys.length).toBe(1);

  // Un autre compte sur le même téléphone le voit à son tour…
  await signOut(page);
  await signIn(page, "lea@orasso.local");
  await afterOpening(page);
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("whatsnew-dismiss").click();
  await expect(banner).toHaveCount(0);
  // … et le premier ne le revoit pas.
  await signOut(page);
  await signIn(page, "kenji@orasso.local");
  await afterOpening(page);
  await page.waitForTimeout(1_500);
  await expect(banner).toHaveCount(0);
  await ctx.close();
});

test("le visiteur : bandeau sans le Garage, pas de ligne « Mon garage » dans son Profil (ses archives restent joignables)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const pseudo = `Visiteur_${unique()}`;
  await signUpApi(pseudo);
  const { ctx, page } = await open(browser);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await afterOpening(page);
  const banner = page.getByTestId("whatsnew-banner");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText("Orasso se range autrement");
  await expect(banner).not.toContainText("garage");
  await shot(page, "bandeau-visiteur");
  await go(page, "/profil");
  await expect(page.getByTestId("profil-garage")).toHaveCount(0);
  await ctx.close();
});

test("les pastilles (lot R7c2) : une demande de message seule fait monter la bulle, pas la cloche ; une conversation non lue s'y ajoute", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const compte = await creerComptePastilles();
  const { ctx, page } = await open(browser);
  await signIn(page, compte.email);
  await afterOpening(page);
  // Demande de message seule : la bulle annonce 1, la cloche rien (une demande ne compte qu'une fois).
  await expect(page.getByRole("button", { name: "Messages, 1 non lu", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Activité", exact: true }).first()).toBeVisible();
  await shot(page, "pastilles-demande-seule");
  // Une conversation non lue de plus : la bulle annonce 2.
  await compte.ajouterConversationNonLue();
  await page.reload();
  await afterOpening(page);
  await expect(page.getByRole("button", { name: "Messages, 2 non lus", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, "pastilles-conversation");
  await ctx.close();
});

test("Le Fil ne marque rien comme lu, et se met à jour à la notification reçue", async ({ browser }) => {
  test.setTimeout(240_000);
  const compte = await creerComptePastilles();
  const cookie = await login(compte.email);
  const unread = async () =>
    (await apiCall<{ counts: { unreadNotifications: number } }>(cookie, "GET", "/me")).data.counts.unreadNotifications;
  await compte.ajouterNotificationNonLue();
  const { ctx, page } = await open(browser);
  await signIn(page, compte.email);
  await afterOpening(page);
  const before = await unread();
  expect(before).toBeGreaterThan(0);
  await page.getByRole("tab", { name: "Le Fil", exact: true }).click();
  // Lot R7e2 : le Journal n'est plus dans Le Fil (ses notifications sont dans la cloche) ; l'onglet ne marque rien comme lu.
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("journal-item")).toHaveCount(0);
  await page.waitForTimeout(3_000);
  expect(await unread()).toBe(before);
  // Une notification arrive pendant que Le Fil est ouvert : rien n'est marqué comme lu non plus.
  await compte.ajouterNotificationNonLue();
  await page.waitForTimeout(2_000);
  expect(await unread()).toBe(before + 1);
  await ctx.close();
});
