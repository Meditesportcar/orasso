import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, login, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7c2 (D38), côté appli : l'Activité (la cloche) et les Messages (la bulle) remplacent la Boîte. Appli en version web
// de recette (`APP_URL`), Damien_66 (seed « Activité » du lot R7c1) et des comptes neufs. Vérifie : la pastille tombe à
// l'ouverture, le groupe « et N autres », le bandeau d'horaire, les Demandes sans demande de message, la ligne « Demandes de
// message », l'étiquette « Organisateur », la demande de message acceptée, une demande qui ne compte qu'une fois, les
// anciennes adresses de la Boîte qui redirigent.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7c2-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, email: string, theme: string) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 844 }, baseURL: APP });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  const page = await ctx.newPage();
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|evenements|equipe/, { timeout: 30_000 });
  await skipOpening(page);
  return { ctx, page };
}

type Summary = { unseenActivity: number; pendingRequests: number; requests: { contact: number } };

test("la cloche : Demandes, bandeau d'horaire, groupe « et N autres », la pastille tombe, aucune conversation", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await appLogin(browser, "damien@orasso.local", theme);
    // La pastille 0 → 1 → 0 se vérifie avec des comptes neufs (test suivant) : celle de Damien_66 dépend des recettes passées.
    await page
      .getByRole("button", { name: /^Activité/ })
      .first()
      .click();
    await page.waitForURL(/\/activite$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Activité", exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("activity-requests-row")).toContainText(/Demandes · \d+/, { timeout: 30_000 });
    await expect(page.getByTestId("activity-requests-row")).not.toContainText("Demandes de message");
    await expect(page.getByTestId("activity-highlight").first()).toContainText("Changement d'horaire");
    await expect(
      page
        .getByTestId("activity-row")
        .filter({ hasText: /et 4 autres/ })
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId("conversation-row")).toHaveCount(0);
    await expect
      .poll(async () => (await apiCall<Summary>(damien, "GET", "/me/inbox/summary")).data.unseenActivity, {
        timeout: 20_000,
      })
      .toBe(0);
    await shot(page, `activite-${theme}-384`);
    await page.getByTestId("activity-requests-row").click();
    await page.waitForURL(/\/activite\/demandes$/, { timeout: 30_000 });
    await expect(page.getByTestId("request-contact")).toHaveCount(0);
    await expect(page.getByTestId("request-staff-invitation").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `demandes-${theme}-384`);
    await ctx.close();
  }
});

test("la pastille de la cloche : 0 pour un compte neuf, 1 après un premier abonné, 0 une fois l'Activité ouverte", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // Comptes **neufs** tous les deux : un abonné qui suit un compte ayant déjà une notification « te suit » encore ouverte
  // (moins de 24 h) ne fait que la regrouper, et ce regroupement remet `deliveredAt` à jour (notifications/service.ts:177) :
  // la pastille ne passerait pas par 0 → 1. Avec un compte neuf, elle passe bien de 0 à 1.
  const s = unique();
  const target = `Aw7P${s}`;
  const recv = await signUpApi(target);
  expect((await apiCall<Summary>(recv, "GET", "/me/inbox/summary")).data.unseenActivity).toBe(0);
  const fan = await signUpApi(`Aw7F${s}`);
  expect((await apiCall(fan, "POST", `/users/${target}/follow`)).status).toBe(200);
  await expect
    .poll(async () => (await apiCall<Summary>(recv, "GET", "/me/inbox/summary")).data.unseenActivity, {
      timeout: 30_000,
    })
    .toBe(1);
  const { ctx, page } = await appLogin(browser, `${target.toLowerCase()}@e2e.orasso.test`, "beton");
  await page
    .getByRole("button", { name: /^Activité/ })
    .first()
    .click();
  await page.waitForURL(/\/activite$/, { timeout: 30_000 });
  await expect
    .poll(async () => (await apiCall<Summary>(recv, "GET", "/me/inbox/summary")).data.unseenActivity, {
      timeout: 20_000,
    })
    .toBe(0);
  await ctx.close();
});

test("la bulle : « Demandes de message », demande acceptée, étiquette « Organisateur », une demande compte une fois", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const a = `Aw7A${s}`;
  const c = `Aw7C${s}`;
  const u = `Aw7U${s}`;
  const aCookie = await signUpApi(a);
  const cCookie = await signUpApi(c);
  await signUpApi(u);
  expect(
    (await apiCall(cCookie, "POST", "/contact-requests", { pseudo: a, message: "Bonjour, belle voiture !" })).status,
  ).toBeLessThan(300);
  // Une demande ne compte qu'une fois : sa notification n'est pas dans les « non vus ».
  const sum = (await apiCall<Summary>(aCookie, "GET", "/me/inbox/summary")).data;
  expect(sum.unseenActivity).toBe(0);
  expect(sum.requests.contact).toBe(1);

  const { ctx, page } = await appLogin(browser, `${a.toLowerCase()}@e2e.orasso.test`, "beton");
  await page
    .getByRole("button", { name: /^Messages/ })
    .first()
    .click();
  await page.waitForURL(/\/messages$/, { timeout: 30_000 });
  await expect(page.getByTestId("messages-requests-row")).toContainText("Demandes de message", { timeout: 30_000 });
  await expect(page.getByTestId("activity-row")).toHaveCount(0);
  await shot(page, "messages-384");
  await page.getByTestId("messages-requests-row").click();
  await page.waitForURL(/\/messages\/demandes$/, { timeout: 30_000 });
  const card = page.getByTestId("request-contact").filter({ hasText: c });
  await expect(card).toContainText("belle voiture", { timeout: 30_000 });
  await shot(page, "messages-demandes-384");
  await card.getByText("Accepter").click();
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByTestId("messages")).toContainText("Bonjour, belle voiture !");
  await ctx.close();

  // U écrit à MéditeSportCar : sa conversation porte l'étiquette « Organisateur ».
  const uCookie = await login(`${u.toLowerCase()}@e2e.orasso.test`);
  const structures = await apiCall<{ id: string }>(uCookie, "GET", "/structures/by-slug/meditesportcar");
  expect(structures.status).toBe(200);
  const sent = await apiCall<{ id: string }>(uCookie, "POST", `/structures/${structures.data.id}/conversation`, {});
  expect(sent.status).toBeLessThan(300);
  // Une conversation vide n'est pas listée : U écrit son premier message.
  const first = await apiCall(uCookie, "POST", `/conversations/${sent.data.id}/messages`, {
    body: "Bonjour, il reste de la place ?",
    clientId: crypto.randomUUID(),
  });
  expect(first.status).toBeLessThan(300);
  const second = await appLogin(browser, `${u.toLowerCase()}@e2e.orasso.test`, "sable");
  await second.page.goto("/messages");
  await skipOpening(second.page);
  const row = second.page.getByTestId("conversation-row").first();
  await expect(row).toContainText("Organisateur", { timeout: 30_000 });
  await shot(second.page, "messages-organisateur-384");
  await second.ctx.close();
});

test("la Boîte redirige : /boite → Activité, /boite?onglet=messages → Messages", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await appLogin(browser, "kenji@orasso.local", "beton");
  await page.goto("/boite");
  await page.waitForURL(/\/activite$/, { timeout: 30_000 });
  await page.goto("/boite?onglet=messages");
  await page.waitForURL(/\/messages$/, { timeout: 30_000 });
  await ctx.close();
});

test("Demandes (tour 2) : ligne « Demandes de message » vers Messages, demandes envoyées dans Demandes de message", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const a = `Aw7R${s}`;
  const b = `Aw7S${s}`;
  const c = `Aw7T${s}`;
  const d = `Aw7V${s}`;
  const aCookie = await signUpApi(a);
  const bCookie = await signUpApi(b);
  const cCookie = await signUpApi(c);
  await signUpApi(d);
  // C demande le contact de A (demande de message) ; A demande celui de D (demande envoyée) ; B suit A (la demande
  // d'abonnement n'existe que pour un compte privé : A devient privé).
  await apiCall(aCookie, "PATCH", "/me/profile", { departments: ["66"], visibility: "private" });
  await addVehicleApi(bCookie, randomPlate());
  expect((await apiCall(bCookie, "POST", `/users/${a}/follow`)).status).toBe(200);
  // Tour 3, ce que l'ancienne page montrait : le véhicule du demandeur, les fonctions d'une invitation de staff.
  const orga = await login("damien@orasso.local");
  const orgaMe = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(orga, "GET", "/me");
  const sid = orgaMe.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  expect(
    (
      await apiCall(orga, "POST", `/structures/${sid}/members`, {
        pseudo: a,
        role: "staff",
        staffRoles: ["scan", "placement"],
      })
    ).status,
  ).toBeLessThan(300);
  expect(
    (await apiCall(cCookie, "POST", "/contact-requests", { pseudo: a, message: "Bonjour, belle voiture !" })).status,
  ).toBeLessThan(300);
  expect((await apiCall(aCookie, "POST", "/contact-requests", { pseudo: d, message: "Salut D" })).status).toBeLessThan(
    300,
  );

  const { ctx, page } = await appLogin(browser, `${a.toLowerCase()}@e2e.orasso.test`, "sable");
  await page.goto("/activite/demandes");
  await skipOpening(page);
  await expect(page.getByTestId("request-follow").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("request-follow").first()).toContainText("BMW");
  await expect(page.getByTestId("request-staff-invitation").first()).toContainText("Accueil et scan · Placement");
  const row = page.getByTestId("requests-messages-row");
  await expect(row).toContainText("Demandes de message · 1", { timeout: 30_000 });
  await shot(page, "demandes-ligne-messages-384");
  await row.click();
  await page.waitForURL(/\/messages$/, { timeout: 30_000 });
  await page.goto("/messages/demandes");
  await expect(page.getByTestId("request-contact").filter({ hasText: c })).toBeVisible({ timeout: 30_000 });
  // Parité avec le site : la demande envoyée à D est listée dessous.
  const sent = page.getByTestId("contact-requests-sent");
  await expect(sent).toContainText(d);
  await expect(sent).toContainText("Demandes de contact envoyées");
  await shot(page, "messages-demandes-envoyees-384");
  await ctx.close();
});

test("« Vu » (tour 2) : une notification reçue pendant la consultation d'une fiche n'est pas vue avant le retour", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const a = `Aw7X${s}`;
  const b = `Aw7Y${s}`;
  const c = `Aw7Z${s}`;
  const aCookie = await signUpApi(a);
  const bCookie = await signUpApi(b);
  const cCookie = await signUpApi(c);
  expect((await apiCall(bCookie, "POST", `/users/${a}/follow`)).status).toBe(200);
  const unseen = async () => (await apiCall<Summary>(aCookie, "GET", "/me/inbox/summary")).data.unseenActivity;
  await expect.poll(unseen, { timeout: 20_000 }).toBe(1);

  const { ctx, page } = await appLogin(browser, `${a.toLowerCase()}@e2e.orasso.test`, "beton");
  await page.goto("/activite");
  await skipOpening(page);
  // Activité devant, liste lue : « vu ».
  await expect.poll(unseen, { timeout: 30_000 }).toBe(0);
  // Une fiche s'ouvre par-dessus (le profil de B), puis C suit A pendant ce temps : la notification arrive, pas de « vu ».
  await page.getByTestId("activity-row").first().click();
  await page.waitForURL(/\/u\//, { timeout: 30_000 });
  expect((await apiCall(cCookie, "POST", `/users/${a}/follow`)).status).toBe(200);
  await expect.poll(unseen, { timeout: 20_000 }).toBe(1);
  await page.waitForTimeout(4_000);
  expect(await unseen()).toBe(1);
  // Retour sur l'Activité : la liste est relue, puis « vu ».
  await page.goBack();
  await page.waitForURL(/\/activite$/, { timeout: 30_000 });
  await expect.poll(unseen, { timeout: 30_000 }).toBe(0);
  await ctx.close();
});
