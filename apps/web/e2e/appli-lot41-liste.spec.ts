import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, MOBILE, SEED_PASSWORD, unique } from "./helpers";

// Lot 41 (correction), côté appli (version web de recette) : la liste des départements (« Choisir dans une liste » : cases
// à cocher accessibles, outre-mer compris, premier = favori, 20 au plus), « J'ai déjà un compte » qui garde la
// destination, le profil qui mène à sa casquette (Créer ma fiche pro, carte « Termine ta fiche » dans Mon profil) et
// l'enregistrement du secteur dans Mon profil (deux touchers rapides, le dernier gagne).
// Lancer avec APP_URL=http://localhost:8261.
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");

async function fresh(browser: import("@playwright/test").Browser, path = "/") {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("orasso.theme", "beton");
  });
  await page.goto(path);
  await skipOpening(page);
  return { ctx, page };
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

test("liste des départements : rôle et état, outre-mer, premier = favori, 20 au plus", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await fresh(browser);
  // Lot C3 : le premier lancement ouvre l'accueil (artefact `s-splash`), « Commencer » mène au choix du profil.
  await page.waitForURL(/\/arrivee$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Commencer" }).click();
  await page.waitForURL(/arrivee\/profil/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForURL(/arrivee\/departement/);
  // La carte est décorative pour le lecteur d'écran ; la liste est le chemin accessible.
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  // Lot M6 (maquette 8.2) : la liste s'ouvre en feuille ; rien ne s'applique avant « Valider (n) ».
  await page.getByTestId("department-list-toggle").click();
  const reunion = page.getByRole("checkbox", { name: "974 · La Réunion" });
  await expect(reunion).toHaveAttribute("aria-checked", "false");
  await reunion.click();
  await expect(reunion).toHaveAttribute("aria-checked", "true");
  const pyrenees = page.getByRole("checkbox", { name: "66 · Pyrénées-Orientales" });
  await pyrenees.click();
  await expect(pyrenees).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("department-validate").click();
  // Puce du favori (artefact `.dchip.fav`) : le numéro dans sa pastille, puis le nom et « favori » ; « +1 » à côté.
  await expect(page.getByText("La Réunion · favori")).toBeVisible();
  await expect(page.getByText("+1", { exact: true })).toBeVisible();
  await expect(page.getByTestId("dept-66")).toBeVisible();
  // Retoucher la ligne retire le département ; 20 au plus.
  await page.getByTestId("department-list-toggle").click();
  await pyrenees.click();
  await expect(pyrenees).toHaveAttribute("aria-checked", "false");
  const codes = Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, "0"));
  for (const code of codes) await page.getByTestId(`deptrow-${code}`).click();
  await expect(page.getByTestId("department-limit")).toHaveCount(0);
  await page.getByTestId("deptrow-21").click();
  await expect(page.getByTestId("department-limit")).toHaveText("Tu peux choisir 20 départements au plus.");
  await expect(page.getByTestId("deptrow-21")).toHaveAttribute("aria-checked", "false");
  await ctx.close();
});

test("« J'ai déjà un compte » garde la destination (next)", async ({ browser }) => {
  // Lot C3 : « J'ai déjà un compte » est sur l'accueil (artefact `s-splash`), plus sur « Tu viens comment ? ».
  const { ctx, page } = await fresh(browser, "/arrivee?next=%2Fe%2Fnocturne");
  await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "J'ai déjà un compte" }).click();
  await page.waitForURL(/\/auth/);
  expect(decodeURIComponent(page.url())).toContain("next=/e/nocturne");
  await ctx.close();
});

test("profil pro sans fiche : carte « Termine ta fiche » (Accueil, Mon profil) → écran de création ; Mon profil enregistre le dernier toucher", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const email = `casq_${s}@e2e.orasso.test`;
  const res = await apiCall(null, "POST", "/auth/sign-up/email", {
    email,
    password: SEED_PASSWORD,
    name: `Casq_${s}`.slice(0, 24),
    termsAccepted: true,
    mainProfile: "pro",
    departments: ["66"],
    firstName: "Julien",
    lastName: "Martí",
  });
  expect(res.status).toBe(200);

  const { ctx, page } = await fresh(browser, "/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  // Barre du visiteur. Lot C7 : la carte « Termine ta fiche » a quitté l'Accueil (reconstruit d'après l'artefact au lot
  // C2a) ; elle reste dans Mon profil, vérifiée plus bas.
  await expect(page.getByRole("tab", { name: "Passeport" })).toBeVisible({ timeout: 30_000 });

  // Tes préférences : le coin (trois touchers rapides dans la feuille, le dernier gagne), puis « Enregistrer ».
  await page.goto("/preferences");
  await skipOpening(page);
  await expect(page.getByTestId("pref-departments")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("pref-departments-edit").click();
  for (const code of ["11", "34", "11"]) {
    await page.getByTestId("department-search").fill(code);
    await page.getByTestId(`deptrow-${code}`).click();
  }
  await page.getByTestId("department-validate").click();
  await page.getByTestId("preferences-submit").click();
  const cookie = await login(email);
  await expect
    .poll(async () => (await apiCall<{ departments: string[] }>(cookie, "GET", "/me/settings")).data.departments, {
      timeout: 30_000,
    })
    .toEqual(["66", "34"]);

  await page.goto("/");
  await skipOpening(page);
  await page.getByRole("tab", { name: "Profil" }).click();
  await expect(page.getByTestId("pending-pro").filter({ visible: true }).last()).toContainText("Termine ta fiche", {
    timeout: 30_000,
  });
  await page
    .getByTestId("pending-pro")
    .filter({ visible: true })
    .last()
    .getByRole("button", { name: "Créer ma fiche pro" })
    .click();
  await page.waitForURL(/pro-nouvelle/, { timeout: 30_000 });
  await ctx.close();
});

test("événement partagé → inscription : « J'ai déjà un compte » sur le choix du profil, connexion, retour à l'événement (lot C3)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // « Candidater » sur un événement partagé ouvre /auth?mode=signup&next=… : le choix du profil garde un accès direct à la
  // connexion, avec la destination, pour qui a déjà un compte.
  const { ctx, page } = await fresh(browser, "/auth?mode=signup&next=%2Fe%2Fnocturne-de-canet-2026");
  await page.waitForURL(/arrivee\/profil/, { timeout: 30_000 });
  await page.getByTestId("arrivee-profil-compte").click();
  await page.waitForURL(/\/auth/);
  expect(decodeURIComponent(page.url())).toContain("next=/e/nocturne-de-canet-2026");
  await page.getByLabel("E-mail").fill("kenji@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/\/e\/nocturne-de-canet-2026/, { timeout: 60_000 });
  await ctx.close();
});

test("choix du profil sans destination : pas de lien de connexion (il est sur l'accueil, comme l'artefact)", async ({
  browser,
}) => {
  const { ctx, page } = await fresh(browser, "/arrivee/profil");
  await expect(page.getByRole("heading", { name: "Tu viens comment ?" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("arrivee-profil-compte")).toHaveCount(0);
  await ctx.close();
});
