import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7m1, tour 2, côté appli (version web compilée) : « Ses partenaires » (6 + le total + « Voir tout »), la ligne
// « Partenaires » en panne (message + « Réessayer », jamais confondue avec « aucun partenaire »), le retrait d'une
// proposition qui échoue (erreur visible, « Réessayer ») et le texte d'une proposition qui survit à un nouveau rendu.
// Béton et Sable, 384 px, police 1 et 1,3 (simulée dans la page, comme appli-lotr6police). Prérequis : APP_URL (appli
// compilée), API et site seedés (Garage_Port a 3 partenaires dans le seed ; la recette en ajoute 4 et les retire).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7m1-captures/apres2/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function openApp(browser: Browser, theme: Theme, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 1100 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t as string);
      if (s !== 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  return { ctx, page: await ctx.newPage() };
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
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

type Member = { pseudo: string; email: string; cookie: string };

async function newMember(): Promise<Member> {
  const pseudo = `Pt_${unique()}`;
  return { pseudo, email: `${pseudo.toLowerCase()}@e2e.orasso.test`, cookie: await signUpApi(pseudo) };
}

for (const theme of ["beton", "sable"] as const) {
  test(`tour 2 (${theme}) : Ses partenaires 6 + Voir tout, ligne en panne, retrait en panne, texte gardé`, async ({
    browser,
  }) => {
    test.setTimeout(600_000);
    const pro = await login("garage@orasso.local");
    const proId = (await apiCall<{ id: string }>(pro, "GET", "/me/pro")).data.id;
    const partners: { member: Member; id: string }[] = [];
    // 4 partenaires de plus : 3 du seed + 4 = 7, donc 6 sur la fiche et « Voir tout ».
    for (let i = 0; i < 4; i++) {
      const member = await newMember();
      const sent = await apiCall<{ id: string }>(pro, "POST", `/pros/${proId}/partnerships`, {
        userPseudo: member.pseudo,
        message: `Partenaire ${i + 1}`,
      });
      expect(sent.status).toBe(201);
      const ok = await apiCall(member.cookie, "POST", `/me/partnerships/${sent.data.id}/accept`);
      expect(ok.status).toBe(200);
      partners.push({ member, id: sent.data.id });
    }
    // Une proposition en attente (retrait), et un passionné sans proposition (texte d'une proposition).
    const waiting = await newMember();
    const waitingSent = await apiCall<{ id: string }>(pro, "POST", `/pros/${proId}/partnerships`, {
      userPseudo: waiting.pseudo,
      message: "En attente",
    });
    expect(waitingSent.status).toBe(201);
    const fresh = await newMember();

    try {
      for (const scale of [1, 1.3] as const) {
        const tag = `${theme}-384-f${String(scale).replace(".", "_")}`;

        // 1. « Ses partenaires » : 6 sur la fiche, le total, « Voir tout » → la liste complète.
        {
          const { ctx, page } = await openApp(browser, theme, scale);
          await signIn(page, "kenji@orasso.local");
          await go(page, "/p/garage-du-port");
          const section = page.getByTestId("pro-partners");
          await expect(section).toBeVisible({ timeout: 20_000 });
          await expect(section.getByTestId("pro-partner")).toHaveCount(6);
          await expect(section).toContainText("7 passionnés");
          await section.scrollIntoViewIfNeeded();
          await shot(page, `ses-partenaires-6-${tag}`);
          await page.getByTestId("pro-partners-all").click();
          // La fiche reste montée sous la liste (pile d'écrans) : au moins les 7 de la liste complète, dont le plus ancien.
          await expect
            .poll(() => page.getByTestId("pro-partner").count(), { timeout: 20_000 })
            .toBeGreaterThanOrEqual(7);
          await shot(page, `voir-tout-${tag}`);
          await ctx.close();
        }

        // 2. La ligne « Partenaires » en panne : message et « Réessayer », puis la ligne revient sans quitter l'écran.
        {
          const first = partners[0];
          if (!first) throw new Error("partenaire absent");
          const { ctx, page } = await openApp(browser, theme, scale);
          let down = true;
          await page.route("**/api/me/partnerships", async (route) => {
            if (down)
              await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: { code: "internal", message: "Panne simulée" } }),
              });
            else await route.continue();
          });
          await signIn(page, first.member.email);
          await go(page, "/profil");
          // Lot R8b1 : la panne se dit sur le 4e compteur (« – », jamais « 0 »), le toucher propose « Réessayer ».
          const cell = page.getByTestId("profil-count-partenaires");
          await expect(cell).toContainText("–", { timeout: 20_000 });
          await cell.click();
          await expect(page.getByTestId("partners-error")).toBeVisible({ timeout: 20_000 });
          await expect(page.getByTestId("partners-error")).toContainText("Réessayer");
          await shot(page, `ligne-en-panne-${tag}`);
          down = false;
          await page
            .getByTestId("partners-error")
            .getByRole("button", { name: /Réessayer/ })
            .click();
          await expect(page.getByTestId("partner-row").first()).toBeVisible({ timeout: 20_000 });
          await expect(page.getByTestId("partners-error")).toHaveCount(0);
          await page.getByTestId("partners-sheet-close").click();
          await expect(cell).not.toContainText("–");
          // Tour 3, copie locale remplie : la panne se dit aussi, les lignes restent, datées, avec « Réessayer ».
          down = true;
          await go(page, "/profil");
          await expect(cell).toContainText("–", { timeout: 20_000 });
          await cell.click();
          await expect(page.getByTestId("partners-error")).toBeVisible({ timeout: 20_000 });
          await expect(page.getByTestId("partners-error")).toContainText("Réessayer");
          await expect(page.getByTestId("partner-row").first()).toBeVisible();
          await expect(page.getByTestId("partners-stale")).toContainText("Données");
          await shot(page, `ligne-en-panne-copie-${tag}`);
          await ctx.close();
        }

        // 2 bis. Tour 3, copie locale vide ({ items: [] }) : sans partenaire, une panne ne disparaît pas en silence.
        {
          const lone = await newMember();
          const { ctx, page } = await openApp(browser, theme, scale);
          let down = false;
          await page.route("**/api/me/partnerships", async (route) => {
            if (down)
              await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: { code: "internal", message: "Panne simulée" } }),
              });
            else await route.continue();
          });
          await signIn(page, lone.email);
          await go(page, "/profil");
          await expect(page.getByTestId("profil-counters")).toBeVisible({ timeout: 20_000 });
          await expect(page.getByTestId("profil-count-partenaires")).toHaveCount(0);
          down = true;
          await go(page, "/profil");
          await expect(page.getByTestId("profil-count-partenaires")).toContainText("–", { timeout: 20_000 });
          await page.getByTestId("profil-count-partenaires").click();
          await expect(page.getByTestId("partners-error")).toBeVisible({ timeout: 20_000 });
          await expect(page.getByTestId("partners-error")).toContainText("Réessayer");
          await expect(page.getByTestId("partner-row")).toHaveCount(0);
          await expect(page.getByTestId("partners-stale")).toHaveCount(0);
          await ctx.close();
        }
      }

      // 3. Côté pro : le retrait d'une proposition échoue → erreur visible, bouton « Réessayer » ; puis il réussit.
      {
        const { ctx, page } = await openApp(browser, theme);
        let down = true;
        await page.route("**/api/pros/*/partnerships/*/end*", async (route) => {
          if (down)
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "internal", message: "Panne simulée" } }),
            });
          else await route.continue();
        });
        await signIn(page, "garage@orasso.local");
        await go(page, "/moi");
        await page.getByTestId("casquette-pro").first().click();
        await page.waitForURL(/accueil|fiche|pro/, { timeout: 60_000 });
        await go(page, "/modifier");
        const section = page.getByTestId("pro-partnerships");
        await expect(section).toBeVisible({ timeout: 30_000 });
        const row = section.getByTestId("partnership-row").filter({ hasText: waiting.pseudo });
        await row.scrollIntoViewIfNeeded();
        await row.getByTestId("partnership-end").click();
        await expect(row.getByTestId("partnership-end-error")).toBeVisible({ timeout: 20_000 });
        await expect(row.getByTestId("partnership-end")).toContainText("Réessayer");
        await shot(page, `retrait-en-panne-${theme}`);
        down = false;
        await row.getByTestId("partnership-end").click();
        await expect(section.getByTestId("partnership-row").filter({ hasText: waiting.pseudo })).toHaveCount(0, {
          timeout: 20_000,
        });
        await ctx.close();
      }

      // 4. Le texte d'une proposition survit à un nouveau rendu de l'écran (retaille de la fenêtre).
      {
        const { ctx, page } = await openApp(browser, theme);
        await signIn(page, "garage@orasso.local");
        await go(page, "/moi");
        await page.getByTestId("casquette-pro").first().click();
        await page.waitForURL(/accueil|fiche|pro/, { timeout: 60_000 });
        await go(page, `/u/${fresh.pseudo}`);
        await page.getByTestId("partnership-propose").click();
        await page.getByTestId("partnership-message").fill("Texte à garder pendant la frappe");
        await shot(page, `proposer-feuille-${theme}`);
        await page.setViewportSize({ width: 380, height: 1000 });
        await page.waitForTimeout(600);
        await page.setViewportSize({ width: 384, height: 1100 });
        await page.waitForTimeout(600);
        await expect(page.getByTestId("partnership-message")).toHaveValue("Texte à garder pendant la frappe");
        await ctx.close();
      }
    } finally {
      // Nettoyage : les partenariats ajoutés prennent fin, la proposition en attente est retirée.
      for (const p of partners) await apiCall(p.member.cookie, "POST", `/me/partnerships/${p.id}/end`);
      await apiCall(pro, "POST", `/pros/${proId}/partnerships/${waitingSent.data.id}/end?expect=pending`);
    }
  });
}
