import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, type Cookie, createEvent, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7-fix-invite, côté appli (version web compilée, 384 px comme le Pixel de Damien) : le « ⋯ » de la carte d'invitation
// de passionnés sur les Demandes de l'Activité coupe les invitations de chacun. Kenji et Nina invitent Julie. `R7FIX_AVANT=1` :
// captures de la carte seule (état « avant »). Lancer avec APP_URL (appli compilée), API et site seedés.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7fix-captures/apres`;
const AVANT = process.env.R7FIX_AVANT === "1";
const PIXEL = { width: 384, height: 844 };
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Who = { pseudo: string; email: string; cookie: Cookie; id: string };

async function person(prefix: string): Promise<Who> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility: "public" });
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  return { pseudo, email, cookie, id: me.data.user.id };
}

async function open(browser: Browser, theme: string) {
  const ctx = await browser.newContext({ viewport: PIXEL, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

for (const theme of ["beton", "sable"] as const) {
  test(`R7-fix-invite appli (${theme}) : le « ⋯ » de la carte des Demandes coupe chaque inviteur`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const orga = await login("damien@orasso.local");
    const event = await createEvent(orga, { title: `Nocturne R7fix ${unique()}`.slice(0, 40) });
    const kenji = await person("R7aKen");
    const julie = await person("R7aJul");
    const nina = await person("R7aNin");
    for (const [a, b] of [
      [kenji, julie],
      [nina, julie],
      [julie, kenji],
      [julie, nina],
    ] as const)
      expect((await apiCall(a.cookie, "POST", `/users/${b.pseudo}/follow`)).status).toBe(200);
    for (const [from, note] of [
      [kenji, "On y va, viens !"],
      [nina, "Viens aussi !"],
    ] as const)
      expect(
        (await apiCall(from.cookie, "POST", `/events/${event.id}/peer-invitations`, { userIds: [julie.id], note }))
          .status,
      ).toBe(200);

    const { ctx, page } = await open(browser, theme);
    await page.goto("/auth");
    await afterOpening(page);
    await page.getByLabel("E-mail").fill(julie.email);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
    await page.goto("/activite/demandes");
    await afterOpening(page);
    const card = page.getByTestId("request-event-invitation-peer").filter({ hasText: event.title });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("t'invitent");
    await shot(page, `appli-demandes-invitation-${theme}-384`);
    if (!AVANT) {
      await card.getByTestId("request-invite-more").click();
      await expect(page.getByTestId("invite-mute")).toHaveCount(2);
      await shot(page, `appli-demandes-invitation-menu-${theme}-384`);
      await page.getByTestId("invite-mute").filter({ hasText: kenji.pseudo }).click();
      await expect(page.getByTestId("invite-menu-message")).toContainText(`Les invitations de ${kenji.pseudo}`);
      const mutes = await apiCall<{ userId: string }[]>(julie.cookie, "GET", "/me/invitation-mutes");
      expect(mutes.data.map((m) => m.userId)).toEqual([kenji.id]);
      await shot(page, `appli-demandes-invitation-coupee-${theme}-384`);
    }
    await ctx.close();
  });
}

// Tour 2 (relecture Codex 1) : la réponse de la coupure arrive APRÈS la fermeture de la feuille : la liste des Demandes se
// relit quand même (carte et compteur à jour), sans attendre une nouvelle fermeture.
test("R7-fix-invite appli : la coupure qui répond après la fermeture de la feuille relit les Demandes", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const orga = await login("damien@orasso.local");
  const event = await createEvent(orga, { title: `Nocturne R7fix ${unique()}`.slice(0, 40) });
  const kenji = await person("R7tKen");
  const julie = await person("R7tJul");
  const nina = await person("R7tNin");
  for (const [a, b] of [
    [kenji, julie],
    [nina, julie],
    [julie, kenji],
    [julie, nina],
  ] as const)
    expect((await apiCall(a.cookie, "POST", `/users/${b.pseudo}/follow`)).status).toBe(200);
  for (const from of [kenji, nina])
    expect(
      (await apiCall(from.cookie, "POST", `/events/${event.id}/peer-invitations`, { userIds: [julie.id] })).status,
    ).toBe(200);

  const { ctx, page } = await open(browser, "beton");
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(julie.email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  await page.goto("/activite/demandes");
  await afterOpening(page);
  const card = page.getByTestId("request-event-invitation-peer").filter({ hasText: event.title });
  await expect(card).toContainText(kenji.pseudo, { timeout: 20_000 });
  await card.getByTestId("request-invite-more").click();
  await expect(page.getByTestId("invite-mute")).toHaveCount(2);
  // La coupure ne répond qu'au bout de 4 s ; on referme la feuille avant.
  await page.route("**/me/invitation-mutes", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    return route.continue();
  });
  await page.getByTestId("invite-mute").filter({ hasText: kenji.pseudo }).click();
  await page.getByLabel("Fermer", { exact: true }).last().click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("invite-menu")).toHaveCount(0);
  // La carte se met à jour toute seule, sans rouvrir ni refermer la feuille.
  await expect(card).not.toContainText(kenji.pseudo, { timeout: 20_000 });
  await expect(card).toContainText(`${nina.pseudo} t'invite`);
  const mutes = await apiCall<{ userId: string }[]>(julie.cookie, "GET", "/me/invitation-mutes");
  expect(mutes.data.map((m) => m.userId)).toEqual([kenji.id]);
  await ctx.close();
});

// Tour 2 (point 6) : la feuille du « ⋯ » avec la police du téléphone agrandie à 1,3 (simulée dans la page : contrôle web).
for (const theme of ["beton", "sable"] as const) {
  test(`R7-fix-invite appli (${theme}) : la feuille du « ⋯ » à police 1,3`, async ({ browser }) => {
    test.setTimeout(240_000);
    const orga = await login("damien@orasso.local");
    const event = await createEvent(orga, { title: `Nocturne R7fix ${unique()}`.slice(0, 40) });
    const kenji = await person("R7pKen");
    const julie = await person("R7pJul");
    const nina = await person("R7pNin");
    for (const [a, b] of [
      [kenji, julie],
      [nina, julie],
      [julie, kenji],
      [julie, nina],
    ] as const)
      expect((await apiCall(a.cookie, "POST", `/users/${b.pseudo}/follow`)).status).toBe(200);
    for (const from of [kenji, nina])
      expect(
        (
          await apiCall(from.cookie, "POST", `/events/${event.id}/peer-invitations`, {
            userIds: [julie.id],
            note: "Viens !",
          })
        ).status,
      ).toBe(200);
    const { ctx, page } = await open(browser, theme);
    await page.addInitScript(() => localStorage.setItem("orasso.recette.echellePolice", "1.3"));
    await page.goto("/auth");
    await afterOpening(page);
    await page.getByLabel("E-mail").fill(julie.email);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
    await page.goto("/activite/demandes");
    await afterOpening(page);
    const card = page.getByTestId("request-event-invitation-peer").filter({ hasText: event.title });
    await expect(card).toContainText(kenji.pseudo, { timeout: 20_000 });
    await card.getByTestId("request-invite-more").click();
    await expect(page.getByTestId("invite-mute")).toHaveCount(2);
    await shot(page, `appli-demandes-invitation-menu-police13-${theme}-384`);
    await ctx.close();
  });
}
