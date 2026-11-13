import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7m1, tour 2, côté site : « Ses partenaires » (6 sur la fiche, le total, « Voir tout » vers `/p/<slug>/partenaires`),
// le formulaire « Proposer un partenariat » ouvert (« Envoyer la proposition » en bouton secondaire : le seul bouton principal
// de la fiche reste « Suivre »). Béton et Sable, 390 et 1280 px. Prérequis : site et API lancés avec le seed (Garage_Port a 3
// partenaires ; la recette en ajoute 4 et les retire).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7m1-captures/apres2/recette-site`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

const added: { cookie: string; id: string }[] = [];
let target = "";

// Une seule mise en place pour les quatre cas (la limite de débit des propositions est de 30 par heure et par pro).
test.beforeAll(async () => {
  const pro = await login("garage@orasso.local");
  const proId = (await apiCall<{ id: string }>(pro, "GET", "/me/pro")).data.id;
  target = `Pt_${unique()}`;
  await signUpApi(target);
  for (let i = 0; i < 4; i++) {
    const pseudo = `Pt_${unique()}`;
    const cookie = await signUpApi(pseudo);
    const sent = await apiCall<{ id: string }>(pro, "POST", `/pros/${proId}/partnerships`, {
      userPseudo: pseudo,
      message: `Partenaire ${i + 1}`,
    });
    expect(sent.status).toBe(201);
    expect((await apiCall(cookie, "POST", `/me/partnerships/${sent.data.id}/accept`)).status).toBe(200);
    added.push({ cookie, id: sent.data.id });
  }
});

test.afterAll(async () => {
  for (const p of added) await apiCall(p.cookie, "POST", `/me/partnerships/${p.id}/end`);
});

for (const theme of ["beton", "sable"] as const) {
  for (const [width, height] of [
    [390, 900],
    [1280, 900],
  ] as const) {
    test(`tour 2 sur le site (${theme}, ${width} px) : Ses partenaires 6 + Voir tout, formulaire ouvert`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const tag = `${theme}-${width}`;

      // Un membre regarde la fiche : 6 partenaires, le total, « Voir tout » → la liste complète.
      {
        const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
        // Vérification R8-V2 : depuis R8g, « Publications » s'ouvre par défaut ; les partenaires sont dans « Présentation ».
        await page.goto("/p/garage-du-port?onglet=presentation");
        const section = page.getByTestId("pro-member-partners");
        await expect(section.getByTestId("pro-member-partner")).toHaveCount(6);
        await expect(section).toContainText("7 passionnés");
        await shot(page, `ses-partenaires-6-${tag}`);
        await page.getByTestId("pro-member-partners-all").click();
        await page.waitForURL(/\/p\/garage-du-port\/partenaires/);
        await expect(page.getByTestId("pro-member-partner")).toHaveCount(7);
        await expect(page.getByTestId("pro-member-partners-page")).toContainText("7 passionnés");
        await shot(page, `voir-tout-${tag}`);
        // Sans compte, la liste complète n'existe pas : retour à la connexion.
        const anon = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
        const anonPage = await anon.newPage();
        await anonPage.goto("/p/garage-du-port/partenaires");
        await expect(anonPage).toHaveURL(/connexion/);
        await anon.close();
        await ctx.close();
      }

      // Le pro ouvre le formulaire sur le profil d'un passionné : « Envoyer la proposition » est secondaire.
      {
        const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, "garage@orasso.local", undefined, "/app");
        await page.goto(`/u/${target}`);
        await page.getByTestId("partnership-propose").locator("summary").click();
        const send = page.getByTestId("partnership-send");
        await expect(send).toBeVisible();
        await expect(send).toHaveClass(/o-button--secondary/);
        await expect(page.locator(".o-button--primary:visible")).toHaveCount(1);
        await shot(page, `proposer-formulaire-ouvert-${tag}`);
        await ctx.close();
      }
    });
  }
}
