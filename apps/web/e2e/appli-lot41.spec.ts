import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, MOBILE, SEED_PASSWORD, unique } from "./helpers";

// Lot 41, côté appli (version web de recette) : le flux d'arrivée. « Tu viens comment ? » (six profils, barre d'onglets
// du profil choisi), « Ton coin » (carte de France : toucher le 66 puis le 11 → puce « 66 · favori » et « +1 », crédit
// CC BY 4.0 sous la carte), « Qui es-tu ? » (pseudo, prénom et nom obligatoires et privés, conditions générales), compte
// créé avec le profil, les départements et le nom, puis tuto de transition. Textes par profil (exposant, pro, média),
// dans les deux thèmes, audit des règles du système, captures à 390 px (exposant et média).
// Lancer avec APP_URL=http://localhost:8261 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API lancée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-41-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");
mkdirSync(DIR, { recursive: true });

type Theme = "beton" | "sable";
type Profile = "exhibitor" | "visitor" | "pro" | "organizer" | "provider" | "media";

const TILES: Record<Profile, [string, string]> = {
  exhibitor: ["Exposant", "J'ai un véhicule à montrer"],
  visitor: ["Visiteur", "Je viens voir les autos"],
  pro: ["Pro de l'auto", "Garage, prépa, detailing"],
  organizer: ["Organisateur", "Asso, club, circuit"],
  provider: ["Prestataire", "Food truck, animation, barbier, stand"],
  media: ["Média", "Photo, vidéo, presse, YouTube…"],
};

/** Textes propres au profil, relevés dans le prototype (`data-for`). */
const TEXTS: Partial<
  Record<Profile, { why: string; hint: string; tag: string; pseudo: string; privacy: string; bar: string[] }>
> = {
  exhibitor: {
    why: "On s'en sert pour te montrer d'abord ce qui se passe près de chez toi, même sans GPS.",
    hint: "Touche les départements où tu sors : le premier choisi est ton favori.",
    tag: "favori",
    pseudo: "C'est lui qu'on voit sur ton profil, au tri et au scan.",
    privacy:
      "Les équipes organisatrices des événements où tu t'inscris et des structures que tu suis peuvent les voir, pour la sécurité.",
    bar: ["Explorer", "Sorties", "Accueil", "Garage", "Profil"],
  },
  pro: {
    why: "On s'en sert pour montrer ta fiche aux passionnés du coin et te signaler les événements proches, même sans GPS.",
    hint: "Touche les départements où tu travailles : le premier choisi est celui de ton atelier.",
    tag: "principal",
    pseudo: "C'est lui qu'on voit sur ton profil.",
    privacy: "Ta fiche montre le nom de ton atelier, jamais le tien.",
    bar: ["Scanner", "Ma fiche", "Accueil", "Stats", "Profil"],
  },
  media: {
    why: "On s'en sert pour te montrer d'abord les événements à couvrir près de chez toi, même sans GPS.",
    hint: "Touche les départements que tu couvres : le premier choisi est ton département principal.",
    tag: "principal",
    pseudo: "C'est lui qu'on voit sur ton profil ; tes demandes portent le nom de ton média.",
    privacy:
      "Les équipes organisatrices des événements où tu interviens et des structures que tu suis peuvent les voir, pour la sécurité.",
    bar: ["Explorer", "Presse", "Accueil", "Contenus", "Profil"],
  },
};

async function fresh(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/auth");
  // Premier lancement : rien d'enregistré (le thème seul est choisi), l'appli ouvre le flux d'arrivée.
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/");
  await page.waitForURL(/arrivee\/profil/, { timeout: 30_000 });
  await skipOpening(page);
  return { ctx, page };
}

/** L'ouverture (battle de 3 s) passe d'un toucher. */
async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function shot(page: Page, name: string, theme: Theme) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

async function expectClean(page: Page) {
  const audit = await auditPage(page);
  expect(audit.greens, "pas de vert").toEqual([]);
  expect(audit.horizontalScroll, "pas de défilement horizontal").toBe(false);
  expect(audit.buttonsWithoutIcon, "tout bouton porte une icône").toEqual([]);
  expect(audit.truncated, "aucun texte tronqué").toEqual([]);
  return audit;
}

/** Le flux complet pour un profil ; renvoie le pseudo et l'e-mail du compte créé. */
async function runFlow(browser: Browser, profile: Profile, theme: Theme, capture: boolean) {
  const { ctx, page } = await fresh(browser, theme);
  const s = unique();
  const pseudo = `Arr_${profile.slice(0, 3)}_${s}`.slice(0, 24);
  const email = `arr_${profile}_${s}@e2e.orasso.test`;
  const texts = TEXTS[profile];

  // --- 1. Tu viens comment ? ---
  await expect(page.getByRole("heading", { name: "Tu viens comment ?" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("Ton choix règle tes onglets. Tu pourras en cumuler d'autres plus tard, depuis Mon profil."),
  ).toBeVisible();
  for (const [key, [title, subtitle]] of Object.entries(TILES)) {
    const tile = page.getByTestId(`profile-${key}`);
    await expect(tile, title).toBeVisible();
    await expect(tile).toContainText(title);
    await expect(tile).toContainText(subtitle);
  }
  await page.getByTestId(`profile-${profile}`).click();
  await expect(page.getByTestId(`profile-${profile}`)).toHaveAttribute("aria-checked", "true");
  if (texts) {
    for (const label of texts.bar)
      await expect(page.getByTestId("tab-preview").getByText(label, { exact: true })).toBeVisible();
  }
  // La barre d'onglets se dessine sans défiler : elle est dans l'écran de 844 px.
  const preview = await page.getByTestId("tab-preview").boundingBox();
  expect(preview && preview.y + preview.height <= MOBILE.height, "aperçu de la barre visible sans défiler").toBe(true);
  if (capture) await shot(page, `01-profil-${profile}`, theme);
  const a1 = await expectClean(page);
  expect(a1.primaryButtons, "un seul bouton principal").toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Continuer" }).click();

  // --- 2. Ton coin ---
  await page.waitForURL(/arrivee\/departement/);
  await expect(page.getByRole("heading", { name: "Ton coin" }).first()).toBeVisible();
  if (texts) {
    await expect(page.getByText(texts.why, { exact: true })).toBeVisible();
    await expect(page.getByText(`${texts.hint} Touche la carte pour ajouter ou retirer un département.`)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();
  await page.getByTestId("dept-66").click();
  await expect(page.getByText(`66 · ${texts?.tag ?? "favori"}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  await page.getByTestId("dept-11").click();
  await expect(page.getByText("+1", { exact: true })).toBeVisible();
  // Le crédit CC BY 4.0 est sous la carte.
  await expect(page.getByText("Carte : Victor Cazanave, CC BY 4.0")).toBeVisible();
  // Retoucher un département le retire.
  await page.getByTestId("dept-11").click();
  await expect(page.getByText("+1", { exact: true })).toHaveCount(0);
  await page.getByTestId("dept-11").click();
  await expect(page.getByText("+1", { exact: true })).toBeVisible();
  if (capture) await shot(page, `02-departement-${profile}`, theme);
  await expectClean(page);
  await page.getByRole("button", { name: "Continuer" }).click();

  // --- 3. Qui es-tu ? ---
  await page.waitForURL(/arrivee\/identite/);
  await expect(page.getByRole("heading", { name: "Qui es-tu ?" }).first()).toBeVisible();
  await expect(page.getByText("Ton pseudo est public. Ton nom reste dans l'enveloppe.")).toBeVisible();
  if (texts) {
    await expect(page.getByText(texts.pseudo, { exact: true })).toBeVisible();
    await expect(page.getByTestId("name-privacy")).toContainText(texts.privacy);
  }
  await expect(page.getByTestId("name-privacy")).toContainText("Ton nom et ton prénom sont privés");
  const submit = page.getByRole("button", { name: "Voir comment ça marche" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Pseudo").fill(pseudo);
  await page.getByLabel("Prénom").fill("Julien");
  // Sans nom, le bouton reste inactif.
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByText("J'accepte les conditions générales d'utilisation d'Orasso").click();
  await expect(submit, "prénom ou nom manquant : le bouton ne part pas").toBeDisabled();
  await page.getByLabel("Nom", { exact: true }).fill("Martí");
  await expect(submit).toBeEnabled({ timeout: 10_000 });
  if (capture) await shot(page, `03-identite-${profile}`, theme);
  await expectClean(page);
  await submit.click();

  // --- 4. Compte créé, tuto de transition (lot 42) ---
  await page.waitForURL(/arrivee\/tuto/, { timeout: 30_000 });
  const cookie = await login(email);
  const me = await apiCall<{
    profile: { pseudo: string; mainProfile: string; departments: string[]; firstName: string; lastName: string };
  }>(cookie, "GET", "/me");
  expect(me.data.profile).toMatchObject({
    pseudo,
    mainProfile: profile,
    departments: ["66", "11"],
    firstName: "Julien",
    lastName: "Martí",
  });
  // Le tuto du profil (lot 42) s'ouvre : « Passer » mène à l'écran « casquette ».
  await expect(page.getByTestId(`tuto-${profile}`)).toBeVisible();
  await page.getByRole("button", { name: "Passer" }).click();
  // Le profil choisi mène à sa barre : créer sa casquette (ou ajouter sa voiture), « Plus tard » possible (le profil média
  // a son écran de création depuis le lot 55).
  const heading =
    profile === "pro" ? "Crée ta fiche pro" : profile === "media" ? "Crée ton profil média" : "Ajoute ta voiture";
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 30_000 });
  if (capture) await shot(page, `04-casquette-${profile}`, theme);
  await page.getByRole("button", { name: "Plus tard" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/arrivee"), { timeout: 30_000 });
  await expect(page.getByRole("tab")).toHaveCount(5, { timeout: 30_000 });
  // Sans la casquette, la barre est celle du visiteur et l'Accueil porte la carte « Termine ta fiche ».
  if (profile === "pro" || profile === "media") {
    await expect(page.getByTestId(`pending-${profile}`).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`pending-${profile}`).filter({ visible: true })).toContainText("Termine ta fiche");
  }
  await ctx.close();
  return { pseudo, email };
}

test("flux d'arrivée complet, exposant : profil, 66 puis 11, nom obligatoire, compte créé (deux thèmes, captures)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await runFlow(browser, "exhibitor", "beton", true);
  await runFlow(browser, "exhibitor", "sable", true);
});

test("textes propres au profil : pro (atelier) et média (couverture), captures du média", async ({ browser }) => {
  test.setTimeout(300_000);
  await runFlow(browser, "pro", "beton", false);
  await runFlow(browser, "media", "beton", true);
  await runFlow(browser, "media", "sable", true);
});

test("les six profils ont leur tuile, leur barre et leurs textes ; « J'ai déjà un compte » mène à la connexion", async ({
  browser,
}) => {
  const { ctx, page } = await fresh(browser, "beton");
  const bars: Record<Profile, string[]> = {
    exhibitor: ["Explorer", "Sorties", "Accueil", "Garage", "Profil"],
    visitor: ["Explorer", "Sorties", "Accueil", "Passeport", "Profil"],
    pro: ["Scanner", "Ma fiche", "Accueil", "Stats", "Profil"],
    organizer: ["Événements", "Tri", "Direct", "Équipe", "Structure"],
    provider: ["Missions", "Candidatures", "Accueil", "Vitrine", "Profil"],
    media: ["Explorer", "Presse", "Accueil", "Contenus", "Profil"],
  };
  for (const [key, labels] of Object.entries(bars)) {
    await page.getByTestId(`profile-${key}`).click();
    for (const label of labels)
      await expect(page.getByTestId("tab-preview").getByText(label, { exact: true }), `${key} ${label}`).toBeVisible();
  }
  await page.getByRole("button", { name: "J'ai déjà un compte" }).click();
  await page.waitForURL(/\/auth/);
  await expect(page.getByRole("button", { name: "Me connecter" })).toBeVisible();
  await ctx.close();
});

test("l'inscription refuse un compte sans nom ou sans département (API)", async () => {
  const body = {
    email: `sans_nom_${unique()}@e2e.orasso.test`,
    password: SEED_PASSWORD,
    name: `Sn_${unique()}`.slice(0, 24),
    termsAccepted: true,
    mainProfile: "visitor",
    departments: ["66"],
    firstName: "Julien",
    lastName: "Martí",
  };
  const noLast = await apiCall(null, "POST", "/auth/sign-up/email", { ...body, lastName: "" });
  expect(noLast.status).toBe(400);
  const noDept = await apiCall(null, "POST", "/auth/sign-up/email", { ...body, departments: [] });
  expect(noDept.status).toBe(400);
  const ok = await apiCall(null, "POST", "/auth/sign-up/email", body);
  expect(ok.status).toBe(200);
});

test("Mon profil › Préférences : la carte de France remplace la liste (crédit visible, premier = favori)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill("kenji@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  await page.goto("/reglages/preferences");
  await skipOpening(page);
  await expect(page.getByTestId("moi-sector")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("dept-66").first()).toBeVisible();
  await expect(page.getByText("Carte : Victor Cazanave, CC BY 4.0").first()).toBeVisible();
  await page.screenshot({ path: `${DIR}/04-moi-secteur-beton.png` });
  await ctx.close();
});
