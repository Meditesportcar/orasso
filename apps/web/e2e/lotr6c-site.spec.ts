import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  type Cookie,
  createEvent,
  login,
  loginInBrowser,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R6c (maquettes R6.3 à R6.7), côté site, à deux personnes : Kenji invite, Julie reçoit. « Qui y va » et
// « Inviter du monde » sur la fiche, la page « Inviter à … », l'invitation dans le Journal et le bandeau de la fiche,
// couper les invitations, la carte « Invite du monde à venir » après la candidature, et le crew (Julie invite Marc,
// Kenji voit « Invité(e) par Julie… »). Tour 2 : « Tout <crew> », la recherche, l'invitation regroupée (Nina invite
// aussi : mots attribués, couper chacun), et la page « Inviter à … » sans JavaScript. API et site seedés.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6c-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000, viewport: MOBILE });

type Who = { pseudo: string; email: string; cookie: Cookie; id: string };

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

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["beton", "sable"] as const) {
  test(`R6c site (${theme}) : qui y va, inviter, recevoir, couper, carte après candidature, crew`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(DIR, { recursive: true });
    const orga = await login("damien@orasso.local");
    const event = await createEvent(orga, { title: `Nocturne R6c ${unique()}`.slice(0, 40) });
    const kenji = await person("R6sKen");
    const julie = await person("R6sJul");
    const nina = await person("R6sNin");
    const marc = await person("R6sMar");
    await follow(kenji, julie);
    await follow(kenji, nina);
    await follow(julie, kenji);
    await follow(marc, julie);
    await follow(nina, julie);
    await applyApi(nina.cookie, event.id, await addVehicleApi(nina.cookie, randomPlate()));
    const crewRes = await apiCall<{ id: string; slug: string }>(kenji.cookie, "POST", "/crews", {
      name: `R6s ${unique()}`.slice(0, 30),
      department: "66",
    });
    const crew = crewRes.data;
    await apiCall(julie.cookie, "POST", `/crews/${crew.id}/requests`, { message: null });
    await apiCall(kenji.cookie, "POST", `/crews/${crew.id}/requests/${julie.id}/accept`);

    // 1. Kenji : « Qui y va », puis la page « Inviter à … ».
    const kCtx = await browser.newContext({ viewport: MOBILE });
    const k = await kCtx.newPage();
    await setTheme(k, theme);
    await loginInBrowser(k, kenji.email, SEED_PASSWORD, `/e/${event.slug}`);
    await expect(k.getByTestId("who-goes-people")).toContainText(`${nina.pseudo} y va`);
    await shot(k, `01-fiche-qui-y-va-${theme}`);
    await k.getByTestId("invite-open").click();
    await expect(k.getByTestId("invite-form")).toBeVisible();
    await expect(k.getByTestId(`invite-person-${nina.pseudo}`)).toContainText("y va déjà");
    // Tour 2 : « Tout <crew> » coche les membres du crew qu'on peut inviter (Julie).
    await k.getByTestId(`invite-crew-${crew.id}`).click();
    await expect(k.getByTestId(`invite-person-${julie.pseudo}`).locator("input")).toBeChecked();
    await expect(k.getByTestId("invite-send")).toContainText("Inviter 1 personne");
    await k.getByTestId("invite-note").fill("On y va avec le crew, viens !");
    await shot(k, `02-inviter-coche-${theme}`);
    await k.getByTestId("invite-send").click();
    await expect(k.getByTestId("invite-result")).toContainText("1 invitation envoyée");
    await shot(k, `03-inviter-envoye-${theme}`);
    // La recherche (début de pseudo) : seulement Nina.
    await k.getByTestId("invite-search").fill(nina.pseudo.slice(0, 6));
    await k.getByRole("button", { name: "Chercher" }).click();
    await expect(k.locator('[data-testid^="invite-person-"]')).toHaveCount(1);
    await expect(k.getByTestId(`invite-person-${nina.pseudo}`)).toBeVisible();
    await shot(k, `03b-inviter-recherche-${theme}`);
    // Nina invite aussi Julie, avec son mot : une seule notification, regroupée.
    const byNina = await apiCall(nina.cookie, "POST", `/events/${event.id}/peer-invitations`, {
      userIds: [julie.id],
      note: "Viens aussi !",
    });
    expect(byNina.status).toBe(200);

    // Sans JavaScript (une fois) : le bouton n'est pas grisé ; sans personne cochée, la page le dit ; une case suffit.
    if (theme === "beton") {
      const other = await createEvent(orga, { title: `Rasso sans JS ${unique()}`.slice(0, 40) });
      const nojs = await browser.newContext({
        viewport: MOBILE,
        javaScriptEnabled: false,
        storageState: await kCtx.storageState(),
      });
      const p = await nojs.newPage();
      await p.goto(`/e/${other.slug}/inviter`);
      await expect(p.getByTestId("invite-send")).toBeEnabled();
      await p.getByTestId("invite-send").click();
      await expect(p.getByTestId("invite-result")).toContainText("Coche au moins une personne");
      await shot(p, `03c-sans-js-erreur-${theme}`);
      await p.getByTestId(`invite-person-${julie.pseudo}`).locator("input").check();
      await p.getByTestId("invite-note").fill("Sans JavaScript");
      await p.getByTestId("invite-send").click();
      await expect(p.getByTestId("invite-result")).toContainText("1 invitation envoyée");
      await shot(p, `03d-sans-js-envoye-${theme}`);
      await nojs.close();
    }

    // 2. Julie : le Journal, le bandeau, couper.
    const jCtx = await browser.newContext({ viewport: MOBILE });
    const j = await jCtx.newPage();
    await setTheme(j, theme);
    await loginInBrowser(j, julie.email, SEED_PASSWORD, "/app/journal");
    const item = j
      .getByTestId("journal-item")
      .filter({ hasText: `${nina.pseudo} et ${kenji.pseudo} t'invitent à ${event.title}` });
    await expect(item).toBeVisible({ timeout: 20_000 });
    // Tour 2 : chaque mot attribué à son auteur ; le « ⋯ » propose de couper chacun.
    await expect(item).toContainText(`${kenji.pseudo} : « On y va avec le crew, viens ! »`);
    await expect(item).toContainText(`${nina.pseudo} : « Viens aussi ! »`);
    await item.getByTestId("notif-invite-more").click();
    await expect(item.getByTestId("invite-mute")).toHaveCount(2);
    await shot(j, `04-journal-invitation-${theme}`);
    await j.goto(`/e/${event.slug}`);
    const banner = j.getByTestId("invite-banner");
    await expect(banner).toContainText(`${nina.pseudo} et ${kenji.pseudo} t'invitent`);
    await expect(banner).toContainText(`${kenji.pseudo} : « On y va avec le crew, viens ! »`);
    await shot(j, `05-fiche-bandeau-${theme}`);
    await j.getByTestId("invite-banner-more").click();
    await expect(j.getByTestId("invite-menu")).toBeVisible();
    await shot(j, `06-fiche-menu-${theme}`);
    await j.getByTestId("invite-mute").filter({ hasText: kenji.pseudo }).click();
    await expect(j.getByTestId("invite-muted")).toContainText(`Les invitations de ${kenji.pseudo}`);
    // Kenji sort du bandeau ; Nina reste.
    await expect(banner).toContainText(`${nina.pseudo} t'invite`);
    await expect(banner).not.toContainText(kenji.pseudo);
    const mutes = await apiCall<{ userId: string }[]>(julie.cookie, "GET", "/me/invitation-mutes");
    expect(mutes.data.map((m) => m.userId)).toEqual([kenji.id]);
    await apiCall(julie.cookie, "DELETE", `/me/invitation-mutes/${kenji.id}`);

    // 3. Après la candidature : la carte, fermée pour de bon pour cet événement.
    await j.goto(`/app/sorties?candidature=envoyee&e=${event.slug}`);
    await expect(j.getByTestId("after-invite-card")).toBeVisible();
    await shot(j, `07-apres-candidature-${theme}`);
    await j.getByTestId("after-invite-close").click();
    await expect(j.getByTestId("after-invite-card")).toHaveCount(0);
    await j.goto(`/app/sorties?candidature=envoyee&e=${event.slug}`);
    await expect(j.getByTestId("after-invite-card")).toHaveCount(0);

    // 4. Crew : Julie invite Marc ; Marc accepte ; Kenji voit « Invité(e) par Julie ».
    await j.goto(`/c/${crew.slug}?onglet=membres`);
    await j.getByTestId("crew-invite-someone").click();
    await j.getByTestId(`crew-invite-${marc.pseudo}`).click();
    await expect(j.getByTestId("crew-invite-sent")).toContainText(`Invitation envoyée à ${marc.pseudo}`);
    await shot(j, `08-crew-invitation-envoyee-${theme}`);
    expect((await apiCall(marc.cookie, "POST", `/me/crew-invitations/${crew.id}/accept`)).status).toBe(200);
    await k.goto(`/c/${crew.slug}?onglet=membres`);
    await expect(k.getByTestId("request-invited-by").first()).toContainText(`Invité(e) par ${julie.pseudo}`);
    await shot(k, `09-crew-chef-confirme-${theme}`);

    await kCtx.close();
    await jCtx.close();
  });
}
