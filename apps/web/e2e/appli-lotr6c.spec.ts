import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  type Cookie,
  createEvent,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R6c (maquettes R6.3 à R6.7), côté appli (version web compilée), à deux personnes : Kenji invite, Julie reçoit.
//   - fiche : « Qui y va » (une personne suivie qui y va), « Inviter du monde » ;
//   - feuille d'invitation : crew en tête, « Tout <crew> » coche ses membres, réseau, mot, « Inviter 1 personne », puis
//     « déjà invité(e) par toi », et la recherche ;
//   - Julie : invitée aussi par Nina, l'invitation regroupée dans la Boîte (mots attribués ; « ⋯ » : couper chacun,
//     réglages, signaler), le bandeau sur la fiche, couper Kenji (Nina reste) ;
//   - après sa candidature : la carte « Invite du monde à venir », fermée pour de bon ;
//   - crew : Julie (membre) invite Marc, qui accepte ; Kenji (chef) voit « Invité(e) par Julie… » dans les demandes.
// Béton et Sable, 390 px, captures des états. Lancer avec APP_URL (appli compilée), API et site seedés.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6c-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
type Who = { pseudo: string; email: string; cookie: Cookie; id: string };

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
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

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function person(prefix: string): Promise<Who> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility: "public" });
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  return { pseudo, email, cookie, id: me.data.user.id };
}

const follow = async (a: Who, b: Who) => {
  expect((await apiCall(a.cookie, "POST", `/users/${b.pseudo}/follow`)).status).toBe(200);
};

for (const theme of ["beton", "sable"] as const) {
  test(`R6c appli (${theme}) : qui y va, inviter, recevoir, couper, carte après candidature, inviter dans le crew`, async ({
    browser,
  }) => {
    test.setTimeout(480_000);
    mkdirSync(DIR, { recursive: true });
    const orga = await login("damien@orasso.local");
    const event = await createEvent(orga, { title: `Nocturne R6c ${unique()}`.slice(0, 40) });
    const kenji = await person("R6cKen");
    const julie = await person("R6cJul");
    const nina = await person("R6cNin");
    const marc = await person("R6cMar");
    await follow(kenji, julie);
    await follow(kenji, nina);
    await follow(julie, kenji);
    await follow(marc, julie);
    await follow(nina, julie);
    // Nina y va : Kenji la suit, elle apparaît dans « Qui y va ».
    const ninaCar = await addVehicleApi(nina.cookie, randomPlate());
    await applyApi(nina.cookie, event.id, ninaCar);
    // Crew de Kenji, Julie membre.
    const crewRes = await apiCall<{ id: string; slug: string }>(kenji.cookie, "POST", "/crews", {
      name: `R6c ${unique()}`.slice(0, 30),
      department: "66",
    });
    expect(crewRes.status).toBe(201);
    const crew = crewRes.data;
    expect((await apiCall(julie.cookie, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await apiCall(kenji.cookie, "POST", `/crews/${crew.id}/requests/${julie.id}/accept`)).status).toBe(204);

    // 1. Kenji : « Qui y va » et « Inviter du monde ».
    const k = await open(browser, theme);
    await signIn(k.page, kenji.email);
    await goto(k.page, `/e/${event.slug}`);
    await expect(k.page.getByTestId("who-goes-people")).toContainText(`${nina.pseudo} y va`);
    await k.page.getByTestId("who-goes").scrollIntoViewIfNeeded();
    await shot(k.page, `01-fiche-qui-y-va-${theme}`);
    await k.page.getByTestId("invite-open").click();
    await expect(k.page.getByTestId("invite-sheet")).toBeVisible();
    await expect(k.page.getByTestId(`invite-person-${julie.pseudo}`)).toContainText("ton crew");
    await expect(k.page.getByTestId(`invite-person-${nina.pseudo}`)).toContainText("y va déjà");
    await expect(k.page.getByTestId("invite-why")).toContainText("Coche au moins une personne");
    await shot(k.page, `02-feuille-inviter-${theme}`);
    // Tour 2 : « Tout <crew> » coche les membres du crew qu'on peut inviter (Julie).
    await k.page.getByTestId(`invite-crew-${crew.id}`).click();
    await expect(k.page.getByTestId("invite-send")).toContainText("Inviter 1 personne");
    await k.page.getByTestId("invite-note").fill("On y va avec le crew, viens !");
    await shot(k.page, `03-feuille-cochee-${theme}`);
    await k.page.getByTestId("invite-send").click();
    await expect(k.page.getByTestId("invite-result")).toContainText("1 invitation envoyée");
    await expect(k.page.getByTestId(`invite-person-${julie.pseudo}`)).toContainText("déjà invité(e) par toi");
    await shot(k.page, `04-feuille-envoyee-${theme}`);
    // La recherche (début de pseudo) : seulement Nina.
    await k.page.getByTestId("invite-search").fill(nina.pseudo.slice(0, 6));
    await expect(k.page.locator('[data-testid^="invite-person-"]')).toHaveCount(1);
    await expect(k.page.getByTestId(`invite-person-${nina.pseudo}`)).toBeVisible();
    await shot(k.page, `04b-feuille-recherche-${theme}`);
    // Nina invite aussi Julie, avec son mot : une seule notification, regroupée.
    const byNina = await apiCall(nina.cookie, "POST", `/events/${event.id}/peer-invitations`, {
      userIds: [julie.id],
      note: "Viens aussi !",
    });
    expect(byNina.status).toBe(200);

    // 2. Julie : l'invitation dans la Boîte, puis le bandeau sur la fiche ; elle coupe les invitations de Kenji.
    const j = await open(browser, theme);
    await signIn(j.page, julie.email);
    await goto(j.page, "/boite");
    const notif = j.page
      .getByTestId("journal-item")
      .filter({ hasText: `${nina.pseudo} et ${kenji.pseudo} t'invitent à ${event.title}` });
    await expect(notif).toBeVisible({ timeout: 20_000 });
    // Tour 2 : chaque mot attribué à son auteur.
    await expect(notif).toContainText(`${kenji.pseudo} : « On y va avec le crew, viens ! »`);
    await expect(notif).toContainText(`${nina.pseudo} : « Viens aussi ! »`);
    await shot(j.page, `05-boite-invitation-${theme}`);
    await notif.getByTestId("notif-invite-more").click();
    const boxMenu = j.page.getByTestId("invite-menu").first();
    await expect(boxMenu).toBeVisible();
    // Le « ⋯ » propose de couper chacun des auteurs.
    await expect(boxMenu.getByTestId("invite-mute")).toHaveCount(2);
    await shot(j.page, `06-boite-menu-${theme}`);
    await goto(j.page, `/e/${event.slug}`);
    const banner = j.page.getByTestId("invite-banner");
    await expect(banner).toContainText(`${nina.pseudo} et ${kenji.pseudo} t'invitent`);
    await expect(banner).toContainText(`${kenji.pseudo} : « On y va avec le crew, viens ! »`);
    await shot(j.page, `07-fiche-bandeau-${theme}`);
    await j.page.getByTestId("invite-banner-more").click();
    await j.page.getByTestId("invite-mute").filter({ hasText: kenji.pseudo }).click();
    await expect(j.page.getByTestId("invite-menu-message")).toContainText(`Les invitations de ${kenji.pseudo}`);
    await shot(j.page, `08-coupee-${theme}`);
    // Kenji sort du bandeau ; Nina reste.
    await goto(j.page, `/e/${event.slug}`);
    await expect(banner).toContainText(`${nina.pseudo} t'invite`);
    await expect(banner).not.toContainText(kenji.pseudo);
    const mutes = await apiCall<{ userId: string }[]>(julie.cookie, "GET", "/me/invitation-mutes");
    expect(mutes.data.map((m) => m.userId)).toEqual([kenji.id]);
    // Rétablie pour la suite (l'API du lot est testée à part).
    await apiCall(julie.cookie, "DELETE", `/me/invitation-mutes/${kenji.id}`);

    // 3. Julie candidate : la carte « Invite du monde à venir », fermée pour de bon.
    await addVehicleApi(julie.cookie, randomPlate());
    await goto(j.page, `/e/${event.slug}`);
    await j.page.getByTestId("event-primary").click();
    await expect(j.page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
    const rules = j.page.getByTestId("cand-rules");
    if (await rules.isVisible().catch(() => false)) await rules.click();
    const seen = j.page.getByTestId("arrival-seen");
    if (await seen.isVisible().catch(() => false)) await seen.click();
    await j.page.getByTestId("cand-send").click();
    await expect(j.page.getByTestId("cand-done")).toBeVisible({ timeout: 20_000 });
    await expect(j.page.getByTestId("after-invite-card")).toBeVisible({ timeout: 15_000 });
    await shot(j.page, `09-apres-candidature-${theme}`);
    await j.page.getByTestId("after-invite-close").click();
    await expect(j.page.getByTestId("after-invite-card")).toHaveCount(0);

    // 4. Crew : Julie (membre) invite Marc ; Marc accepte ; Kenji (chef) confirme « Invité(e) par Julie ».
    await goto(j.page, `/crew/${crew.slug}`);
    await j.page.getByTestId("crew-tab-members").click();
    await j.page.getByTestId("crew-invite-someone").click();
    await expect(j.page.getByTestId(`crew-invite-row-${marc.pseudo}`)).toContainText("te suit");
    await shot(j.page, `10-crew-feuille-${theme}`);
    await j.page.getByTestId(`crew-invite-${marc.pseudo}`).click();
    await expect(j.page.getByText(`Invitation envoyée à ${marc.pseudo}`)).toBeVisible();
    await shot(j.page, `11-crew-envoyee-${theme}`);
    expect((await apiCall(marc.cookie, "POST", `/me/crew-invitations/${crew.id}/accept`)).status).toBe(200);
    await goto(k.page, `/crew/${crew.slug}`);
    await k.page.getByTestId("crew-tab-members").click();
    await expect(k.page.getByTestId("request-invited-by")).toContainText(`Invité(e) par ${julie.pseudo}`);
    await shot(k.page, `12-crew-chef-confirme-${theme}`);
    await k.page.getByTestId("crew-request-accept").click();
    await expect(k.page.getByTestId("request-invited-by")).toHaveCount(0);

    await k.ctx.close();
    await j.ctx.close();
  });
}
