import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  deliverNow,
  login,
  loginInBrowser,
  MOBILE,
  randomPlate,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R7c2 (D38), côté site : l'Activité (la cloche) et les Messages (la bulle) remplacent la Boîte. Damien_66 (le seed
// « Activité » du lot R7c1 : horaire modifié du Lydia, cinq flammes regroupées, deux demandes, une demande de message)
// et des comptes neufs. Vérifie : la pastille tombe à l'ouverture, le groupe « et N autres », le bandeau d'horaire, les
// Demandes sans demande de message, l'étiquette « Organisateur », la demande de message acceptée depuis sa page, aucune
// conversation dans l'Activité ni notification dans Messages, une demande qui ne compte qu'une fois, les redirections 302.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7c2-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000, viewport: MOBILE });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

type Summary = {
  unreadMessages: number;
  unseenActivity: number;
  pendingRequests: number;
  requests: { contact: number };
};
const summaryOf = async (page: Page) => (await (await page.request.get("/api/me/inbox/summary")).json()) as Summary;

test("la cloche : Demandes, bandeau d'horaire, groupe « et N autres », la pastille tombe, aucune conversation", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const theme of ["beton", "sable"] as const) {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
    // La pastille 0 → 1 → 0 se vérifie avec des comptes neufs (test suivant) : celle de Damien_66 dépend des recettes passées.
    await page
      .locator("header.o-appbar--tab")
      .getByRole("link", { name: /^Activité/ })
      .click();
    await page.waitForURL((url) => url.pathname === "/app/activite");
    await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
    // Ligne repliée « Demandes · N » (hors demande de message), bandeau d'horaire, groupe regroupé.
    const row = page.getByTestId("activity-requests-row");
    await expect(row).toContainText(/Demandes · \d+/);
    await expect(row).not.toContainText("Demandes de message");
    const band = page.getByTestId("activity-highlight").first();
    await expect(band).toContainText("Changement d'horaire");
    // Le bandeau d'horaire n'est pas répété dans les groupes ; aucune conversation, aucune demande dans la liste.
    await expect(page.locator(".s-convo")).toHaveCount(0);
    await expect(page.getByTestId("activity-row").filter({ hasText: "Demande de contact" })).toHaveCount(0);
    // La pastille « non vus » tombe : la cloche de la barre ne compte plus que les demandes.
    await expect.poll(async () => (await summaryOf(page)).unseenActivity, { timeout: 20_000 }).toBe(0);
    await shot(page, `activite-${theme}-390`);
    // Le groupe « et 4 autres » (cinq flammes) : d'autres recettes ajoutent des événements et des notifications, il peut
    // être passé en page suivante de l'Activité : on le cherche de page en page (« Voir plus »).
    const group = page
      .getByTestId("activity-row")
      .filter({ hasText: /et 4 autres/ })
      .first();
    for (let i = 0; i < 10 && !(await group.isVisible()); i++) {
      const more = page.getByTestId("activity-more");
      if (!(await more.count())) break;
      await more.click();
      await page.waitForLoadState("load");
    }
    await expect(group).toBeVisible();
    await page.goto("/app/activite/demandes");
    await expect(page.getByRole("heading", { name: "Demandes", exact: true })).toBeVisible();
    await expect(page.getByTestId("request-contact")).toHaveCount(0);
    await expect(page.getByTestId("request-staff-invitation").first()).toBeVisible();
    await shot(page, `demandes-${theme}-390`);
    await ctx.close();
  }
});

test("la pastille de la cloche : 0 pour un compte neuf, 1 après un premier abonné, 0 une fois l'Activité ouverte", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Comptes **neufs** tous les deux : un abonné qui suit un compte ayant déjà une notification « te suit » encore ouverte
  // (moins de 24 h) ne fait que la regrouper, et ce regroupement remet `deliveredAt` à jour (notifications/service.ts:177) :
  // la pastille ne passerait pas par 0 → 1. Avec un compte neuf, elle passe bien de 0 à 1.
  const s = unique();
  const target = `Sw7P${s}`;
  const recv = await signUpApi(target);
  expect((await apiCall<Summary>(recv, "GET", "/me/inbox/summary")).data.unseenActivity).toBe(0);
  const fan = await signUpApi(`Sw7F${s}`);
  expect((await apiCall(fan, "POST", `/users/${target}/follow`)).status).toBe(200);
  await expect
    .poll(async () => (await apiCall<Summary>(recv, "GET", "/me/inbox/summary")).data.unseenActivity, {
      timeout: 30_000,
    })
    .toBe(1);

  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, `${target.toLowerCase()}@e2e.orasso.test`, undefined, "/app");
  const bell = page.locator("header.o-appbar--tab").getByRole("link", { name: /^Activité/ });
  await expect(bell.locator(".o-appbar__count")).toHaveText("1");
  await bell.click();
  await page.waitForURL((url) => url.pathname === "/app/activite");
  await expect.poll(async () => (await summaryOf(page)).unseenActivity, { timeout: 20_000 }).toBe(0);
  await ctx.close();
});

test("la bulle : conversations seulement, « Demandes de message », étiquette « Organisateur », demande acceptée", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const a = `Sw7A${s}`;
  const c = `Sw7C${s}`;
  const u = `Sw7U${s}`;
  await signUpApi(a);
  const cCookie = await signUpApi(c);
  await signUpApi(u);
  // C (qui ne suit pas A) demande le contact de A.
  expect(
    (await apiCall(cCookie, "POST", "/contact-requests", { pseudo: a, message: "Bonjour, belle voiture !" })).status,
  ).toBeLessThan(300);

  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, `${a.toLowerCase()}@e2e.orasso.test`, undefined, "/app");
  // Une demande ne compte qu'une fois : la bulle (demande de message) a 1, la cloche rien.
  const header = page.locator("header.o-appbar--tab");
  await expect(header.getByRole("link", { name: /^Messages/ }).locator(".o-appbar__count")).toHaveText("1");
  await expect(header.getByRole("link", { name: /^Activité/ }).locator(".o-appbar__count")).toHaveCount(0);
  const sum = await summaryOf(page);
  expect(sum.unseenActivity).toBe(0);
  expect(sum.requests.contact).toBe(1);

  await header.getByRole("link", { name: /^Messages/ }).click();
  await page.waitForURL((url) => url.pathname === "/app/messages");
  await expect(page.getByTestId("message-requests-row")).toContainText("Demandes de message · 1");
  await expect(page.getByTestId("activity-row")).toHaveCount(0);
  await expect(page.getByTestId("journal-item")).toHaveCount(0);
  await shot(page, "messages-vide-390");
  await page.getByTestId("message-requests-row").click();
  await page.waitForURL((url) => url.pathname === "/app/messages/demandes");
  const request = page.getByTestId("request-contact").filter({ hasText: c });
  await expect(request).toContainText("belle voiture");
  await shot(page, "messages-demandes-390");
  await request.getByRole("button", { name: "Accepter" }).click();
  await page.waitForURL(/\/app\/messages\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("messages")).toContainText("Bonjour, belle voiture !");
  await ctx.close();

  // Étiquette « Organisateur » : U écrit à MéditeSportCar depuis la page de la structure.
  const uCtx = await browser.newContext({ viewport: MOBILE });
  const up = await uCtx.newPage();
  await loginInBrowser(up, `${u.toLowerCase()}@e2e.orasso.test`, undefined, "/app");
  await up.goto("/o/meditesportcar");
  await up.getByTestId("contact-organizer").click();
  await up.waitForURL(/\/app\/messages\/[0-9a-f-]{36}$/);
  // Une conversation vide n'est pas listée : U écrit son premier message.
  await up.getByLabel("Écrire un message…").fill("Bonjour, il reste de la place ?");
  await up.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(up.getByTestId("messages")).toContainText("il reste de la place");
  await up.goto("/app/messages");
  const conv = up.getByTestId("conversation-row").first();
  await expect(conv.getByTestId("conversation-tag")).toHaveText("Organisateur");
  await expect(conv).toHaveAttribute("data-kind", "organizer");
  await shot(up, "messages-organisateur-390");
  // La recherche filtre la liste.
  await up.getByTestId("conversation-search").fill("zzz-introuvable");
  await expect(up.getByText("Aucune conversation ne correspond.")).toBeVisible();
  await uCtx.close();
});

test("la Boîte et le Journal redirigent (302) vers l'Activité et les Messages", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  const id = "123e4567-e89b-42d3-a456-426614174000";
  for (const [from, to] of [
    ["/app/boite", "/app/messages"],
    ["/app/boite/demandes", "/app/activite/demandes"],
    [`/app/boite/${id}`, `/app/messages/${id}`],
    ["/app/journal", "/app/activite"],
  ] as const) {
    const res = await page.request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(302);
    expect(new URL(res.headers().location ?? "", "http://x").pathname, from).toBe(to);
  }
  await page.goto("/app/boite");
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  await ctx.close();
});

test("l'Activité à 1 280 px : une colonne lisible, Béton et Sable", async ({ browser }) => {
  for (const theme of ["beton", "sable"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app/activite");
    await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
    await shot(page, `activite-${theme}-1280`);
    await page.goto("/app/messages");
    await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
    await shot(page, `messages-${theme}-1280`);
    await ctx.close();
  }
});

test("Demandes du site (tour 2) : toutes les sortes, invitation de passionné et transfert de plaque, compteur = cartes", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const meP = `Sw7M${s}`;
  const kenjiP = `Sw7K${s}`;
  const leaP = `Sw7L${s}`;
  const cP = `Sw7D${s}`;
  const orga = await login("damien@orasso.local");
  const event = await createEvent(orga, { title: `Rasso Tour2 ${s}`.slice(0, 40) });
  const me = await signUpApi(meP);
  const kenji = await signUpApi(kenjiP);
  const lea = await signUpApi(leaP);
  const other = await signUpApi(cP);
  const idOf = async (cookie: string) => (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data.user.id;
  const meId = await idOf(me);
  // Kenji invite « moi » à l'événement (passionnés qui se suivent), Léa saisit la plaque de « moi », C demande le contact.
  expect((await apiCall(me, "POST", `/users/${kenjiP}/follow`)).status).toBe(200);
  expect((await apiCall(kenji, "POST", `/users/${meP}/follow`)).status).toBe(200);
  const invite = await apiCall(kenji, "POST", `/events/${event.id}/peer-invitations`, {
    userIds: [meId],
    note: "Viens, on y va ensemble !",
  });
  expect(invite.status).toBe(200);
  const plate = randomPlate();
  await addVehicleApi(me, plate);
  // Une plaque déjà prise : le véhicule de Léa est créé en attente, la demande de transfert part chez « moi » (ancien propriétaire).
  await addVehicleApi(lea, plate);
  expect(
    (await apiCall(other, "POST", "/contact-requests", { pseudo: meP, message: "Bonjour, belle voiture !" })).status,
  ).toBeLessThan(300);
  // Tour 3, ce que l'ancienne page montrait : le véhicule d'un demandeur d'abonnement (compte privé) et les fonctions d'une
  // invitation de staff.
  const veP = `Sw7E${s}`;
  const ve = await signUpApi(veP);
  await addVehicleApi(ve, randomPlate());
  expect((await apiCall(me, "PATCH", "/me/profile", { departments: ["66"], visibility: "private" })).status).toBe(200);
  expect((await apiCall(ve, "POST", `/users/${meP}/follow`)).status).toBe(200);
  const orgaMe = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(orga, "GET", "/me");
  const sid = orgaMe.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  expect(
    (
      await apiCall(orga, "POST", `/structures/${sid}/members`, {
        pseudo: meP,
        role: "staff",
        staffRoles: ["scan", "placement"],
      })
    ).status,
  ).toBeLessThan(300);

  for (const theme of ["beton", "sable"] as const) {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, `${meP.toLowerCase()}@e2e.orasso.test`, undefined, "/app/activite/demandes");
    await page.goto("/app/activite/demandes");
    // L'invitation d'un passionné et le transfert de plaque sont là, avec leurs actions.
    const peer = page.getByTestId("request-event-invitation-peer");
    await expect(peer).toContainText(`${kenjiP} t'invite`);
    await expect(peer).toContainText("Viens, on y va ensemble !");
    const transfer = page.getByTestId("request-plate-transfer");
    await expect(transfer).toContainText("Demande de transfert de plaque");
    // Le véhicule principal du demandeur (marque et modèle, jamais la plaque) et les fonctions proposées au staff.
    const follow = page.getByTestId("request-follow").filter({ hasText: veP });
    await expect(follow).toContainText("BMW");
    await expect(follow).not.toContainText(/[A-Z]{2}-d{3}-[A-Z]{2}/);
    await expect(page.getByTestId("request-staff-invitation")).toContainText("Accueil et scan · Placement");
    // Le compteur de l'en-tête est le nombre de cartes (et celui du résumé, hors demande de message).
    const sum = await summaryOf(page);
    expect(sum.requests.contact).toBe(1);
    const cards = await page.getByTestId("request-list").locator("> li").count();
    expect(cards).toBe(sum.pendingRequests - sum.requests.contact);
    await expect(page.getByTestId("requests-count")).toContainText(`${cards} en attente de ta réponse`);
    // Ancien lien d'une demande de message : une ligne mène à Messages.
    const toMessages = page.getByTestId("requests-messages-row");
    await expect(toMessages).toContainText("Demandes de message · 1");
    await shot(page, `demandes-toutes-${theme}-390`);
    if (theme === "sable") {
      await toMessages.click();
      await page.waitForURL((url) => url.pathname === "/app/messages");
      await page.goto("/app/activite/demandes");
      // Confirmer le transfert : la carte part, le compteur baisse d'une demande.
      await page
        .getByTestId("request-plate-transfer")
        .getByRole("button", { name: "Je confirme le transfert" })
        .click();
      await expect(page.getByTestId("request-plate-transfer")).toHaveCount(0);
      await expect
        .poll(async () => (await summaryOf(page)).pendingRequests, { timeout: 20_000 })
        .toBe(sum.pendingRequests - 1);
    }
    await ctx.close();
  }
});

test("Kenji_66 t'invite : la page Demandes de Damien_66 (seed) montre l'invitation, compteur = cartes", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/activite/demandes");
  await page.goto("/app/activite/demandes");
  await expect(
    page.getByTestId("request-event-invitation-peer").filter({ hasText: "Kenji_66 t'invite" }),
  ).toBeVisible();
  const sum = await summaryOf(page);
  const cards = await page.getByTestId("request-list").locator("> li").count();
  expect(cards).toBe(sum.pendingRequests - sum.requests.contact);
  await shot(page, "demandes-kenji-invite-390");
  await ctx.close();
});

test("« Voir la fiche » et les lignes : « lu » est posé avant de naviguer (le bandeau disparaît au retour)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // Rejouable (tour 3) : un compte neuf avec **son propre** bandeau d'horaire (candidature retenue, puis nouvelle heure de
  // l'événement), pour ne plus consommer celui de Damien_66.
  const s = unique();
  const who = `Sw7V${s}`;
  const email = `${who.toLowerCase()}@e2e.orasso.test`;
  const orga = await login("damien@orasso.local");
  const event = await createEvent(orga, { title: `Rasso Horaire ${s}`.slice(0, 40) });
  const guest = await signUpApi(who);
  const applicationId = await applyApi(guest, event.id, await addVehicleApi(guest, randomPlate()));
  await decideApi(orga, event.id, applicationId, "accept");
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(19, 0, 0, 0);
  const moved = await apiCall(orga, "PATCH", `/events/${event.id}`, {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 5 * 3600 * 1000).toISOString(),
  });
  expect(moved.status).toBe(200);
  deliverNow(email);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, email, undefined, "/app/activite");
  await page.goto("/app/activite");
  const unreadBefore = await page.getByTestId("activity-unread").count();
  const band = page.getByTestId("activity-highlight");
  await expect(band).toHaveCount(1);
  await expect(band.first()).toContainText(event.title);
  // Tour 2 : le clic marque d'abord les identifiants du bandeau lus, puis suit le lien.
  await page.getByTestId("activity-highlight-open").first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/app/activite"));
  await page.goto("/app/activite");
  await expect(page.getByTestId("activity-highlight")).toHaveCount(0);
  // Une ligne avec un lien : « lu » aussi avant de naviguer.
  const before = await page.getByTestId("activity-unread").count();
  expect(before).toBeLessThanOrEqual(unreadBefore);
  const link = page.locator("a.act-row__link:has([data-testid=activity-unread])").first();
  if (await link.count()) {
    await link.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/app/activite"));
    await page.goto("/app/activite");
    await expect(page.getByTestId("activity-unread")).toHaveCount(before - 1);
  }
  await ctx.close();
});
