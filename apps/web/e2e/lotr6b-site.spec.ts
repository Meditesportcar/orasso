import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, type Cookie, loginInBrowser, SEED_PASSWORD, setTheme, signUpApi, unique } from "./helpers";
import { privateWithRequests } from "./helpers/lotr6b";
import { RELAIS } from "./relais";

// Lot R6b (D37 : « Suivre » comme sur Instagram ; maquettes R6.1 et R6.2), côté site : les mêmes parcours que l'appli
// (suivre un public, ne plus suivre avec confirmation, demander à un privé, accepter et refuser dans « Ton réseau »,
// « Suivre en retour », « Te suit », trois nombres dans Moi). Béton et Sable, 390 et 1280 px. API et site seedés.
// Tour 2 : « Retirer cet abonné » (menu ⋯ de la ligne, confirmation en place) ; la Boîte au-delà de 30 demandes.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6b-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000 });

type Who = { pseudo: string; email: string; cookie: Cookie; id: string };

async function person(prefix: string, visibility: "public" | "private"): Promise<Who> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility });
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  return { pseudo, email, cookie, id: me.data.user.id };
}

async function open(browser: Browser, theme: "beton" | "sable", width: number, who: Who, retour: string) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  await loginInBrowser(page, who.email, SEED_PASSWORD, retour);
  return { ctx, page };
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`R6b site (${theme}, ${width}) : suivre, demander, accepter, refuser, se désabonner`, async ({ browser }) => {
      test.setTimeout(300_000);
      mkdirSync(DIR, { recursive: true });
      const me = await person("R6sMoi", "public");
      const pub = await person("R6sPub", "public");
      const priv = await person("R6sPriv", "private");
      const asker = await person("R6sDem", "public");
      const tag = `${theme}-${width}`;

      const mine = await open(browser, theme, width, me, `/u/${pub.pseudo}`);
      const page = mine.page;
      // 1. Compte public : « Suivre » → « Abonné » → confirmation → « Ne plus suivre ».
      await page.goto(`/u/${pub.pseudo}`);
      const button = page.getByTestId("follow-button");
      await expect(button).toHaveText(/^\s*Suivre\s*$/i);
      await shot(page, `01-public-suivre-${tag}`);
      await button.click();
      await expect(page.getByTestId("follow-button")).toHaveText(/Abonné/i);
      await page.getByTestId("follow-button").click();
      await expect(page.getByTestId("follow-confirm")).toBeVisible();
      await shot(page, `02-public-confirmation-${tag}`);
      await page.getByTestId("follow-confirm-yes").click();
      await expect(page.getByTestId("follow-button")).toHaveText(/^\s*Suivre\s*$/i);

      // 2. Compte privé : « Demander à suivre » → « Demandé », la ligne réservée aux abonnés.
      await page.goto(`/u/${priv.pseudo}`);
      await expect(page.getByTestId("follow-button")).toHaveText(/Demander à suivre/i);
      await expect(page.getByTestId("profile-private-note")).toContainText("sont pour ses abonnés.");
      await page.getByTestId("follow-button").click();
      await expect(page.getByTestId("follow-button")).toHaveText(/Demandé/i);
      await expect(page.getByTestId("profile-private-note")).toContainText("Ta demande attend sa réponse.");
      await shot(page, `03-prive-demande-${tag}`);

      // 3. La personne privée refuse une demande (sans prévenir) et accepte l'autre.
      await apiCall(asker.cookie, "POST", `/users/${priv.pseudo}/follow`);
      const other = await open(browser, theme, width, priv, "/app/reseau?liste=demandes");
      await other.page.goto("/app/reseau?liste=demandes");
      await expect(other.page.getByTestId("net-request")).toHaveCount(2);
      await shot(other.page, `04-reseau-demandes-${tag}`);
      await other.page.getByRole("button", { name: `Refuser la demande de ${asker.pseudo}` }).click();
      await expect(other.page.getByTestId("net-notice")).toContainText("La personne n'est pas prévenue");
      // La liste se relit après l'action : la demande refusée disparaît.
      await expect(other.page.getByTestId("net-request")).toHaveCount(1);
      await other.page.getByTestId("net-request-accept").click();
      await expect(other.page.getByTestId("net-notice")).toContainText(`${me.pseudo} te suit maintenant.`);
      expect(
        (await apiCall<{ follow: { mine: string } }>(asker.cookie, "GET", `/users/${priv.pseudo}`)).data.follow.mine,
      ).toBe("none");
      await page.goto(`/u/${priv.pseudo}`);
      await expect(page.getByTestId("follow-button")).toHaveText(/Abonné/i);
      await expect(page.getByTestId("profile-private-note")).toHaveCount(0);

      // 4. « Suivre en retour » et « Te suit ».
      await apiCall(asker.cookie, "POST", `/users/${me.pseudo}/follow`);
      await page.goto("/app/reseau?liste=abonnes");
      await expect(page.getByTestId("net-follow-back")).toHaveText(/Suivre en retour/i);
      await shot(page, `05-reseau-abonnes-${tag}`);
      await page.getByTestId("net-follow-back").click();
      await expect(page.getByTestId("net-followed")).toBeVisible();
      await page.goto(`/u/${asker.pseudo}`);
      await expect(page.getByTestId("follows-you")).toHaveText(/Te suit/i);

      // 5. Moi : trois nombres, plus d'« amis ».
      await page.goto("/app/moi");
      await expect(page.getByText(/sorties?/).first()).toBeVisible();
      await expect(page.getByText(/^\d+\s*amis?$/)).toHaveCount(0);
      await shot(page, `06-moi-${tag}`);

      // 6. Tour 2 : la personne privée retire Moi de ses abonnés (menu ⋯, confirmation) ; Moi n'est pas prévenu.
      await other.page.goto("/app/reseau?liste=abonnes");
      const row = other.page.getByTestId("net-person").filter({ hasText: me.pseudo });
      await row.getByTestId("net-person-more").click();
      await expect(row.getByTestId("net-follower-menu")).toBeVisible();
      await shot(other.page, `07-reseau-menu-abonne-${tag}`);
      await row.getByTestId("net-remove").click();
      await expect(row.getByTestId("net-remove-confirm")).toContainText(`Retirer ${me.pseudo} de tes abonnés ?`);
      await shot(other.page, `08-reseau-retirer-confirmation-${tag}`);
      await row.getByTestId("net-remove-yes").click();
      await expect(other.page.getByTestId("net-notice")).toContainText(`${me.pseudo} ne fait plus partie de tes abonnés.`);
      await expect(other.page.getByTestId("net-person").filter({ hasText: me.pseudo })).toHaveCount(0);
      await shot(other.page, `09-reseau-abonne-retire-${tag}`);
      await page.goto(`/u/${priv.pseudo}`);
      await expect(page.getByTestId("follow-button")).toHaveText(/Demander à suivre/i);
      await expect(page.getByTestId("profile-private-note")).toBeVisible();
      await other.ctx.close();
      await mine.ctx.close();
    });
  }
}

test("R6b site (beton, 390) : Boîte, 31 demandes d'abonnement, « Suivants » montre la plus ancienne", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const target = await privateWithRequests("R6sBoite", 31);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await setTheme(page, "beton");
  await loginInBrowser(page, target.email, SEED_PASSWORD, "/app/boite/demandes");
  await page.goto("/app/boite/demandes");
  await expect(page.getByTestId("request-follow")).toHaveCount(30);
  await expect(page.getByText(target.askers[0] as string)).toHaveCount(0);
  await shot(page, "10-boite-31-demandes-beton-390");
  await page.getByTestId("request-follow-more").click();
  await expect(page.getByTestId("request-follow")).toHaveCount(1);
  await expect(page.getByText(target.askers[0] as string)).toBeVisible();
  await expect(page.getByTestId("request-follow-more")).toHaveCount(0);
  await ctx.close();
});
