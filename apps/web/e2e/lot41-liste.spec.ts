import { expect, test } from "@playwright/test";
import { apiCall, login, MOBILE, SEED_PASSWORD, unique } from "./helpers";

// Lot 41 (correction), site : la liste des départements est le chemin accessible de la carte. Cases de formulaire (rôle,
// état coché, libellé « 66 · Pyrénées-Orientales »), outre-mer compris, premier choisi = favori, 20 au plus, carte hors du
// clavier ; l'inscription marche sans JavaScript (tuile radio, liste en cases). Prérequis : API et site lancés.

test("liste des départements : cases accessibles, outre-mer, premier = favori, 20 au plus", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await page.goto("/inscription");
  await page.waitForLoadState("networkidle");
  // Les tracés de la carte ne prennent pas le focus clavier et ne sont pas des boutons : la liste est le chemin clavier.
  await expect(page.getByTestId("dept-66")).toHaveAttribute("tabindex", "-1");
  await expect(page.getByTestId("france-map")).toHaveAttribute("aria-hidden", "true");
  await page.getByText("Choisir dans une liste").click();
  const reunion = page.getByRole("checkbox", { name: "974 · La Réunion" });
  await expect(reunion).not.toBeChecked();
  await expect(async () => {
    await reunion.check();
    await expect(page.getByTestId("dept-summary")).toContainText("974 · favori", { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("checkbox", { name: "66 · Pyrénées-Orientales" }).check();
  // Premier choisi = favori, l'autre dans « +1 » ; la carte suit.
  await expect(page.getByTestId("dept-summary")).toContainText("974 · favori");
  await expect(page.getByTestId("dept-summary")).toContainText("+1");
  await expect(page.getByTestId("dept-66")).toHaveClass(/is-selected/);
  // 20 au plus : la 21e case est refusée, en français.
  await reunion.uncheck();
  await page.getByRole("checkbox", { name: "66 · Pyrénées-Orientales" }).uncheck();
  const boxes = page.locator('input[name="department"]');
  for (let i = 0; i < 20; i++) await boxes.nth(i).check();
  await boxes.nth(20).click();
  await expect(page.getByTestId("dept-limit")).toHaveText("Tu peux choisir 20 départements au plus.");
  await expect(boxes.nth(20)).not.toBeChecked();
  await ctx.close();
});

test("inscription sans JavaScript : tuile radio, liste en cases, formulaire envoyé, compte créé", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: MOBILE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/inscription");
  const s = unique();
  const email = `nojs_${s}@e2e.orasso.test`;
  await page.getByTestId("profile-media").click();
  await page.getByText("Choisir dans une liste").click();
  await page.getByRole("checkbox", { name: "974 · La Réunion" }).check();
  await page.getByRole("checkbox", { name: "66 · Pyrénées-Orientales" }).check();
  await page.getByLabel("Pseudo").fill(`NoJs_${s}`.slice(0, 24));
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
  await page.getByLabel("Prénom").fill("Julien");
  await page.getByLabel("Nom", { exact: true }).fill("Martí");
  await page.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/inscription"), { timeout: 60_000 });
  const me = await apiCall<{ profile: { mainProfile: string; departments: string[]; firstName: string } }>(
    await login(email),
    "GET",
    "/me",
  );
  // Sans JavaScript, l'ordre est celui de la liste (66 avant 974).
  expect(me.data.profile).toMatchObject({ mainProfile: "media", departments: ["66", "974"], firstName: "Julien" });
  await ctx.close();
});

test("l'API refuse plus de 20 départements (400, message en français)", async () => {
  const many = Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, "0"));
  const res = await apiCall<{ error: { message: string } }>(null, "POST", "/auth/sign-up/email", {
    email: `vingt_${unique()}@e2e.orasso.test`,
    password: SEED_PASSWORD,
    name: `Vg_${unique()}`.slice(0, 24),
    termsAccepted: true,
    mainProfile: "visitor",
    departments: many,
    firstName: "Julien",
    lastName: "Martí",
  });
  expect(res.status).toBe(400);
  expect(res.data.error.message).toBe("Tu peux choisir 20 départements au plus.");
});
