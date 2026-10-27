import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, type Cookie, MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R6b (D37 : « Suivre » comme sur Instagram ; maquettes R6.1 et R6.2), côté appli (version web compilée) :
//   - suivre un compte public (« Suivre » → « Abonné »), ne plus suivre (confirmation) ;
//   - demander à suivre un compte privé (« Demandé », la ligne du compte privé), la personne accepte dans « Ton réseau »
//     → profil complet et « Abonné » ; refuser une autre demande (sans prévenir) ;
//   - « Suivre en retour » dans la liste des abonnés, l'étiquette « Te suit » ;
//   - passage de privé à public : les demandes en attente sont acceptées ;
//   - messagerie : on écrit directement à qui nous suit, sinon demande de contact.
// Béton et Sable, 390 px, captures des états. Lancer avec APP_URL (appli compilée), API et site seedés.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6b-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

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

type Who = { pseudo: string; email: string; cookie: Cookie; id: string };

async function person(prefix: string, visibility: "public" | "private"): Promise<Who> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility });
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  return { pseudo, email, cookie, id: me.data.user.id };
}

const followButton = (page: Page) => page.getByTestId("follow-button");

for (const theme of ["beton", "sable"] as const) {
  test(`R6b appli (${theme}) : suivre, demander, accepter, refuser, se désabonner, passer public, écrire`, async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    mkdirSync(DIR, { recursive: true });
    const me = await person("R6bMoi", "public");
    const pub = await person("R6bPub", "public");
    const priv = await person("R6bPriv", "private");
    const asker = await person("R6bDem", "public");

    const mine = await open(browser, theme);
    await signIn(mine.page, me.email);

    // 1. Compte public : « Suivre » → « Abonné », puis ne plus suivre avec confirmation.
    await goto(mine.page, `/u/${pub.pseudo}`);
    await expect(followButton(mine.page)).toHaveText(/^Suivre$/i);
    await expect(mine.page.getByTestId("public-counts")).toContainText("abonnés");
    await expect(mine.page.getByTestId("public-counts")).not.toContainText(/\bamis?\b/);
    await shot(mine.page, `01-public-suivre-${theme}`);
    await followButton(mine.page).click();
    await expect(followButton(mine.page)).toHaveText(/Abonné/i);
    await shot(mine.page, `02-public-abonne-${theme}`);
    expect((await apiCall<{ followers: number }>(pub.cookie, "GET", "/me/network")).data.followers).toBe(1);
    await followButton(mine.page).click();
    await expect(mine.page.getByTestId("follow-confirm")).toBeVisible();
    await shot(mine.page, `03-public-confirmation-${theme}`);
    await mine.page.getByTestId("follow-confirm-yes").click();
    await expect(followButton(mine.page)).toHaveText(/^Suivre$/i);
    expect((await apiCall<{ followers: number }>(pub.cookie, "GET", "/me/network")).data.followers).toBe(0);

    // 2. Compte privé : « Demander à suivre » → « Demandé », la ligne réservée aux abonnés.
    await goto(mine.page, `/u/${priv.pseudo}`);
    await expect(followButton(mine.page)).toHaveText(/Demander à suivre/i);
    await expect(mine.page.getByTestId("profile-private-note")).toContainText(
      "Ses photos, ses sorties, son crew et ses réseaux sont pour ses abonnés.",
    );
    await shot(mine.page, `04-prive-demander-${theme}`);
    await followButton(mine.page).click();
    await expect(followButton(mine.page)).toHaveText(/Demandé/i);
    await expect(mine.page.getByTestId("profile-private-note")).toContainText("Ta demande attend sa réponse.");
    await shot(mine.page, `05-prive-demande-${theme}`);

    // 3. La personne privée accepte dans « Ton réseau » ; une autre demande est refusée sans prévenir.
    expect((await apiCall<{ mine: string }>(asker.cookie, "POST", `/users/${priv.pseudo}/follow`)).data.mine).toBe(
      "pending",
    );
    const other = await open(browser, theme);
    await signIn(other.page, priv.email);
    await goto(other.page, "/reseau?liste=demandes");
    await expect(other.page.getByTestId("net-tab-demandes")).toBeVisible();
    await expect(other.page.getByText(me.pseudo)).toBeVisible();
    await shot(other.page, `06-reseau-demandes-${theme}`);
    // Refuser l'autre demande (bouton ✕ à son nom), puis accepter Moi (la seule restante).
    await other.page.getByRole("button", { name: new RegExp(`Refuser la demande de ${asker.pseudo}`) }).click();
    await expect(other.page.getByTestId("net-request-info")).toContainText("La personne n'est pas prévenue");
    await other.page.getByTestId("net-request-accept").first().click();
    await expect(other.page.getByTestId("net-request-info")).toContainText(`${me.pseudo} te suit maintenant.`);
    await shot(other.page, `07-reseau-acceptee-${theme}`);
    expect(
      (await apiCall<{ follow: { mine: string } }>(asker.cookie, "GET", `/users/${priv.pseudo}`)).data.follow.mine,
    ).toBe("none");
    // Moi voit maintenant tout son profil, avec « Abonné ».
    await goto(mine.page, `/u/${priv.pseudo}`);
    await expect(followButton(mine.page)).toHaveText(/Abonné/i);
    await expect(mine.page.getByTestId("profile-private-note")).toHaveCount(0);

    // 4. « Suivre en retour » : la personne privée suit Moi (public : tout de suite) ; Moi voit « Te suit ».
    expect((await apiCall<{ mine: string }>(asker.cookie, "POST", `/users/${me.pseudo}/follow`)).data.mine).toBe(
      "accepted",
    );
    await goto(mine.page, "/reseau?liste=abonnes");
    await expect(mine.page.getByTestId("net-tab-abonnes")).toBeVisible();
    await expect(mine.page.getByTestId("net-follow-back").first()).toHaveText(/Suivre en retour/i);
    await shot(mine.page, `08-reseau-abonnes-${theme}`);
    await mine.page.getByTestId("net-follow-back").first().click();
    await expect(mine.page.getByTestId("net-followed").first()).toBeVisible();
    await goto(mine.page, `/u/${asker.pseudo}`);
    await expect(mine.page.getByTestId("follows-you")).toHaveText(/Te suit/i);
    await expect(followButton(mine.page)).toHaveText(/Abonné/i);

    // 5. Passage de privé à public : les demandes en attente sont acceptées.
    expect((await apiCall<{ mine: string }>(pub.cookie, "POST", `/users/${priv.pseudo}/follow`)).data.mine).toBe(
      "pending",
    );
    expect((await apiCall(priv.cookie, "PATCH", "/me/settings", { visibility: "public" })).status).toBe(200);
    expect(
      (await apiCall<{ follow: { mine: string } }>(pub.cookie, "GET", `/users/${priv.pseudo}`)).data.follow.mine,
    ).toBe("accepted");

    // 6. Messagerie : Moi écrit directement à Dem (qui le suit) ; à Pub (qui ne le suit pas) : demande de contact.
    expect((await apiCall(me.cookie, "POST", "/conversations/direct", { userId: asker.id })).status).toBe(201);
    const refused = await apiCall<{ error: { code: string } }>(me.cookie, "POST", "/conversations/direct", {
      userId: pub.id,
    });
    expect(refused.status).toBe(409);
    expect(refused.data.error.code).toBe("not_friends");
    await goto(mine.page, `/u/${pub.pseudo}`);
    await mine.page.getByTestId("message-open").first().click();
    await expect(mine.page.getByText("Cette personne ne te suit pas")).toBeVisible();
    await shot(mine.page, `09-ecrire-demande-contact-${theme}`);

    // 7. L'onglet Profil : abonnés, abonnements, sorties ; plus de nombre « amis ».
    await goto(mine.page, "/profil");
    await expect(mine.page.getByText(/sorties?/).first()).toBeVisible();
    await expect(mine.page.getByText(/^\d+\s*amis?$/)).toHaveCount(0);
    await shot(mine.page, `10-onglet-profil-${theme}`);

    await other.ctx.close();
    await mine.ctx.close();
  });
}
