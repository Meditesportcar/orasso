import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";

// Lot B2b, côté appli (version web compilée de recette, `APP_URL`) : « Suivre » sur la page d'un prestataire avec deux casquettes du
// même compte (parité du site, R9h partie 2 tour 4). Le compte du garage porte une fiche pro et une vitrine de prestataire : avec la
// casquette de la fiche pro, « Suivre » est proposé sur la vitrine (c'est la fiche qui suit, puis se désabonne) ; avec la casquette
// de la vitrine, la page est la sienne : pas de « Suivre ».
const APP = process.env.APP_URL;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const EMAIL = "garage@orasso.local";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, baseURL: APP });
  await ctx.addInitScript(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

/** Passe à une casquette par la ligne de « Changer de casquette » du Profil. */
async function wear(page: Page, testId: string) {
  await go(page, "/moi");
  await page.getByTestId(testId).first().click();
  await page.waitForURL((u) => !/\/(moi|profil)(\?|$)/.test(u.pathname), { timeout: 30_000 });
  await expect(page.getByTestId("persona-tabbar")).toBeVisible({ timeout: 30_000 });
}

/** L'abonnement de la page `targetKey` lu ou posé au nom d'une casquette (précondition de la recette, état rendu à la fin). */
async function setFollowing(targetKey: string, wanted: boolean, actor: string) {
  const res = await fetch(`${API}/api/me/page-follows/${encodeURIComponent(targetKey)}`, {
    method: wanted ? "PUT" : "DELETE",
    headers: { cookie: await login(EMAIL), origin: WEB, "x-orasso-actor": actor },
  });
  expect(res.status).toBe(200);
}
async function isFollowing(providerId: string, actor: string) {
  const res = await fetch(`${API}/api/providers/${providerId}`, {
    headers: { cookie: await login(EMAIL), origin: WEB, "x-orasso-actor": actor },
  });
  return ((await res.json()) as { isFollowing: boolean }).isFollowing;
}

test("« Suivre » à deux casquettes du même compte : la fiche pro suit sa vitrine puis s'en désabonne ; la vitrine ne se suit pas elle-même", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const me = (await apiCall<{ personas: { kind: string; id: string }[] }>(await login(EMAIL), "GET", "/me")).data;
  const provider = me.personas.find((p) => p.kind === "provider");
  const pro = me.personas.find((p) => p.kind === "pro");
  expect(provider && pro, "le garage a une vitrine et une fiche pro (graine)").toBeTruthy();
  const proKey = `p:${pro?.id}`;
  const ownKey = `v:${provider?.id}`;
  const wasFollowing = await isFollowing(provider?.id ?? "", proKey);
  await setFollowing(ownKey, false, proKey);
  const { ctx, page } = await open(browser);
  try {
    // Casquette = la fiche pro : la vitrine est une autre page, « Suivre » est là.
    await wear(page, "casquette-pro");
    await go(page, `/providers/${provider?.id}`);
    const follow = page.getByTestId("follow-provider");
    await expect(follow).toBeVisible({ timeout: 30_000 });
    await expect(follow).toContainText("Suivre");
    await follow.click();
    await expect(follow).toContainText("Suivi", { timeout: 30_000 });
    await expect.poll(() => isFollowing(provider?.id ?? "", proKey), { timeout: 30_000 }).toBe(true);
    // Se désabonner, au nom de la fiche aussi.
    await follow.click();
    await expect(follow).toContainText("Suivre", { timeout: 30_000 });
    await expect.poll(() => isFollowing(provider?.id ?? "", proKey), { timeout: 30_000 }).toBe(false);
    // Casquette = la vitrine : c'est sa page, pas de « Suivre » (la page visitée est chargée : son nom est là).
    await wear(page, "casquette-provider");
    await go(page, `/providers/${provider?.id}`);
    await expect(page.getByTestId("page-name").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("follow-provider")).toHaveCount(0);
  } finally {
    if (wasFollowing) await setFollowing(ownKey, true, proKey);
    await ctx.close();
  }
});
