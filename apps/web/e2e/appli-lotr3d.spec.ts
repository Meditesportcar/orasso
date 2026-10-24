import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, MOBILE, SEED_PASSWORD, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R3d (retour réel du 24/10 : un organisateur, sur un Samsung, bloqué à « Qui es-tu ? » devant un bouton grisé),
// côté appli (version web compilée) :
//   - à chaque étape, une ligne sous le bouton dit ce qui manque : un mot de passe de 9 caractères affiche « il en
//     manque 1 », 10 caractères activent le bouton ; des départements vides affichent « Retour à Ton coin » ;
//   - l'arrivée survit à la fermeture de l'appli (ici : un rechargement de la page) : les choix sont gardés et l'on
//     reprend à l'étape, sans le mot de passe ; tout est effacé une fois le compte créé.
// Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API lancée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r3d-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
mkdirSync(DIR, { recursive: true });
type Theme = "beton" | "sable";
const DRAFT_KEY = "orasso.arrivee-draft";

async function fresh(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/");
  await page.waitForURL(/\/arrivee$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Commencer" }).click();
  await page.waitForURL(/arrivee\/profil/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Tu viens comment ?" }).first()).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function expectClean(page: Page) {
  const audit = await auditPage(page);
  expect(audit.greens, "pas de vert").toEqual([]);
  expect(audit.horizontalScroll, "pas de défilement horizontal").toBe(false);
  expect(audit.buttonsWithoutIcon, "tout bouton porte une icône").toEqual([]);
  expect(audit.truncated, "aucun texte tronqué").toEqual([]);
  expect(audit.primaryButtons, "un seul bouton principal").toBeLessThanOrEqual(1);
}

const missing = (page: Page) => page.getByTestId("arrivee-missing").filter({ visible: true });

async function fillIdentity(page: Page, pseudo: string, email: string, password: string) {
  await page.getByLabel("Pseudo").fill(pseudo);
  await page.getByLabel("Prénom").fill("Julien");
  await page.getByLabel("Nom", { exact: true }).fill("Martí");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(password);
  await page.getByText("J'accepte les conditions générales d'utilisation d'Orasso").click();
}

for (const theme of ["beton", "sable"] as const) {
  test(`chaque étape dit ce qui manque ; 9 caractères bloquent, 10 passent (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await fresh(browser, theme);
    // Profil préchoisi : rien ne manque.
    await expect(missing(page)).toHaveCount(0);
    await page.getByTestId("profile-organizer").click();
    await page.getByRole("button", { name: "Continuer" }).click();

    // Ton coin vide : la ligne le dit.
    await page.waitForURL(/arrivee\/departement/);
    await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();
    await expect(missing(page)).toHaveText("Choisis au moins un département.");
    await shot(page, `01-coin-vide-${theme}`);
    await expectClean(page);
    await page.getByTestId("dept-66").click();
    await expect(missing(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Continuer" }).click();

    // Qui es-tu ? : la première chose qui manque, puis le mot de passe de 9 caractères (le cas du 24/10).
    await page.waitForURL(/arrivee\/identite/);
    const submit = page.getByRole("button", { name: "Voir comment ça marche" });
    await expect(submit).toBeDisabled();
    await expect(missing(page)).toHaveText("Choisis un pseudo.");
    const s = unique();
    await fillIdentity(page, `R3d_${s}`.slice(0, 24), `r3d_${s}@e2e.orasso.test`, "123456789");
    await expect(missing(page)).toHaveText("Mot de passe : 10 caractères au moins (il en manque 1).", {
      timeout: 10_000,
    });
    await expect(submit).toBeDisabled();
    await shot(page, `02-identite-9-caracteres-${theme}`);
    await expectClean(page);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill("1234567890");
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await expect(missing(page)).toHaveCount(0);
    // Sans les conditions : la ligne le dit.
    await page.getByText("J'accepte les conditions générales d'utilisation d'Orasso").click();
    await expect(missing(page)).toHaveText("Coche les conditions d'utilisation.");
    await ctx.close();
  });
}

test("tour 2 : la connexion dit ce qui manque ; A commence l'inscription puis se connecte : B, après un redémarrage, ne retrouve rien", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await fresh(browser, theme);
    // A : profil, coin, nom, e-mail, conditions…
    await page.getByTestId("profile-visitor").click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/arrivee\/departement/);
    await page.getByTestId("dept-66").click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/arrivee\/identite/);
    const s = unique();
    await fillIdentity(page, `R3a_${s}`.slice(0, 24), `r3a_${s}@e2e.orasso.test`, "123456789");
    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k) ?? "", DRAFT_KEY), { timeout: 10_000 })
      .toContain(`r3a_${s}`);
    // … puis « J'ai déjà un compte » : la connexion dit ce qui manque, puis A se connecte à son compte.
    await page.goto("/auth");
    const skip = page.getByTestId("opening-skip");
    if (await skip.isVisible({ timeout: 3_000 }).catch(() => false))
      await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
    const signIn = page.getByRole("button", { name: "Me connecter" });
    await expect(missing(page)).toHaveText("Indique ton e-mail.");
    await page.getByLabel("E-mail").fill("kenji@orasso.local");
    // Connexion : seule la présence du mot de passe est exigée (un ancien compte peut en avoir un plus court).
    await expect(signIn).toBeDisabled();
    await expect(missing(page)).toHaveText("Indique ton mot de passe.");
    await page.getByLabel("Mot de passe", { exact: true }).first().fill("123456789");
    await expect(missing(page)).toHaveCount(0);
    await shot(page, `05-connexion-mot-de-passe-${theme}`);
    await expectClean(page);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await expect(missing(page)).toHaveCount(0);
    await signIn.click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30_000 });
    // Le brouillon de l'inscription est effacé à la connexion.
    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY), { timeout: 10_000 })
      .toBeNull();
    // Kenji se déconnecte ; l'appli redémarre ; B commence une inscription : rien de A.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key !== "orasso.theme") localStorage.removeItem(key);
    });
    await page.goto("/");
    await page.waitForURL(/\/arrivee$/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Commencer" }).click();
    await page.waitForURL(/arrivee\/profil/);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/arrivee\/departement/);
    await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();
    await page.getByTestId("dept-11").click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/arrivee\/identite/);
    await expect(page.getByLabel("Pseudo")).toHaveValue("");
    await expect(page.getByLabel("E-mail")).toHaveValue("");
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("");
    await ctx.close();
  }
});

test("départements perdus : la ligne mène à Ton coin ; rechargement : les choix et l'étape sont gardés, jamais le mot de passe ; effacés à la création du compte", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await fresh(browser, "beton");
  await page.getByTestId("profile-organizer").click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForURL(/arrivee\/departement/);
  await page.getByTestId("dept-66").click();
  await page.getByTestId("dept-11").click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForURL(/arrivee\/identite/);
  const s = unique();
  const pseudo = `R3r_${s}`.slice(0, 24);
  const email = `r3r_${s}@e2e.orasso.test`;
  await fillIdentity(page, pseudo, email, "motdepasse-r3d");

  // Le brouillon est gardé sur l'appareil, sans le mot de passe.
  await expect
    .poll(async () => page.evaluate((k) => localStorage.getItem(k) ?? "", DRAFT_KEY), { timeout: 10_000 })
    .toContain(email);
  const stored = await page.evaluate((k) => localStorage.getItem(k) ?? "", DRAFT_KEY);
  expect(stored).not.toContain("motdepasse-r3d");
  expect(JSON.parse(stored)).toMatchObject({
    profile: "organizer",
    departments: ["66", "11"],
    step: "identite",
    identity: { pseudo, firstName: "Julien", lastName: "Martí", email, terms: true },
  });

  // L'appli est fermée (Android en arrière-plan) puis rouverte : on reprend à « Qui es-tu ? », les choix sont là, le
  // mot de passe est à retaper (la ligne le dit).
  await page.goto("/");
  await page.waitForURL(/arrivee\/identite/, { timeout: 30_000 });
  await expect(page.getByLabel("Pseudo")).toHaveValue(pseudo);
  await expect(page.getByLabel("E-mail")).toHaveValue(email);
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Martí");
  await expect(page.getByLabel("Mot de passe", { exact: true }).first()).toHaveValue("");
  await expect(missing(page)).toHaveText("Mot de passe : 10 caractères au moins (il en manque 10).", {
    timeout: 10_000,
  });
  await shot(page, "03-reprise-sans-mot-de-passe-beton");

  // Départements perdus (Ton coin vidé avant la fermeture) : la ligne le dit et « Retour à Ton coin » y mène.
  await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k) ?? "{}");
    d.departments = [];
    localStorage.setItem(k, JSON.stringify(d));
  }, DRAFT_KEY);
  await page.goto("/");
  await page.waitForURL(/arrivee\/identite/, { timeout: 30_000 });
  await expect(page.getByLabel("Pseudo")).toHaveValue(pseudo);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill("motdepasse-r3d");
  await expect(missing(page)).toHaveText("Choisis au moins un département.", { timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Retour à Ton coin" })).toBeVisible();
  await shot(page, "04-departements-perdus-beton");
  await expectClean(page);
  await page.getByRole("link", { name: "Retour à Ton coin" }).click();
  await page.waitForURL(/arrivee\/departement/);
  await page.getByTestId("dept-66").click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForURL(/arrivee\/identite/);
  if (!(await page.getByLabel("Mot de passe", { exact: true }).first().inputValue()))
    await page.getByLabel("Mot de passe", { exact: true }).first().fill("motdepasse-r3d");
  const submit = page.getByRole("button", { name: "Voir comment ça marche" });
  await expect(submit).toBeEnabled({ timeout: 10_000 });
  await submit.click();

  // Compte créé avec les choix ; le brouillon est effacé.
  await page.waitForURL(/arrivee\/tuto/, { timeout: 30_000 });
  await expect
    .poll(async () => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY), { timeout: 10_000 })
    .toBeNull();
  const me = await apiCall<{ profile: { pseudo: string; mainProfile: string; departments: string[] } }>(
    await login(email, "motdepasse-r3d"),
    "GET",
    "/me",
  );
  expect(me.data.profile).toMatchObject({ pseudo, mainProfile: "organizer", departments: ["66"] });
  await ctx.close();
});
