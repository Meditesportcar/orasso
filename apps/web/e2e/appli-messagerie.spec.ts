import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, signUpApi, unique } from "./helpers";

// Messagerie et Boîte (lot 18) : l'appli en version web de recette (`expo start --web` derrière
// `apps/mobile/scripts/web-isolated.mjs`) face au site. A (appli) écrit à son ami B (site) : B reçoit sans recharger,
// A voit « Lu par B » ; B répond, A reçoit en direct par le WebSocket de l'appli (jeton porté par le sous-protocole
// dans un navigateur) ; Boîte (segments, Demandes : demande de contact acceptée), feuille « Demande de contact » d'un
// non-ami. Deux thèmes à 390 px. Lancer avec APP_URL=http://localhost:8191 (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-18-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function siteContext(browser: Browser, cookie: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const url = new URL(WEB);
  await ctx.addCookies(
    cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf("=");
        return { name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` };
      }),
  );
  return ctx;
}

async function appLogin(browser: Browser, pseudo: string, theme: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(`${pseudo.toLowerCase()}@e2e.orasso.test`);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

test("appli : conversation en direct avec le site, lu par, Boîte, demandes, demande de contact", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const errors: string[] = [];

  for (const theme of ["sable", "beton"] as const) {
    const a = `AppA_${theme}_${s}`;
    const b = `SiteB_${theme}_${s}`;
    const c = `AppC_${theme}_${s}`;
    const aCookie = await signUpApi(a);
    const bCookie = await signUpApi(b);
    const cCookie = await signUpApi(c);
    const r = await apiCall<{ id: string }>(aCookie, "POST", "/friends/requests", { pseudo: b });
    await apiCall(bCookie, "POST", `/friends/requests/${r.data.id}/accept`);

    const { ctx, page } = await appLogin(browser, a, theme);
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });

    // Profil de B → Message → conversation.
    await page.goto(`/u/${b}`);
    await page.getByTestId("message-open").click();
    await page.waitForURL(/\/boite\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const id = new URL(page.url()).pathname.split("/").pop() ?? "";

    // B ouvre la conversation sur le site.
    const siteCtx = await siteContext(browser, bCookie);
    const site = await siteCtx.newPage();
    await site.goto(`${WEB}/app/boite/${id}`);
    await expect(site.getByRole("heading", { name: a })).toBeVisible();
    await site.waitForTimeout(1500);

    // A écrit depuis l'appli : B reçoit sans recharger ; B lit, A voit « Lu par B ».
    await page.getByLabel("Écrire un message…").fill("Salut depuis l'appli !");
    await page.getByTestId("message-send").click();
    await expect(site.getByTestId("messages")).toContainText("Salut depuis l'appli !", { timeout: 20_000 });
    await expect(page.getByTestId("read-by")).toContainText(`Lu par ${b}`, { timeout: 20_000 });

    // B répond depuis le site : A reçoit en direct (WebSocket de l'appli).
    await site.getByLabel("Écrire un message…").fill("Bien reçu, à samedi");
    await site.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(page.getByTestId("messages")).toContainText("Bien reçu, à samedi", { timeout: 20_000 });
    await shot(page, `03-conversation-${theme}`);

    // Appui long sur un message reçu : Signaler visible et désactivé (lot 32).
    await page.getByText("Bien reçu, à samedi").click({ delay: 900 });
    await page.waitForTimeout(400);
    await shot(page, `04-appui-long-${theme}`);
    await page.keyboard.press("Escape");

    // C (non ami) demande le contact de A ; A l'accepte dans Boîte > Demandes.
    await apiCall(cCookie, "POST", "/contact-requests", { pseudo: a, message: "Bonjour, ta voiture est superbe !" });
    // L'onglet Boîte (l'adresse `/boite` existe aussi dans les casquettes Organisateur et Prestataire).
    await page.goto("/accueil");
    await page.getByRole("tab", { name: "Boîte" }).click();
    await expect(page.getByTestId("conversation-row").filter({ hasText: b })).toBeVisible({ timeout: 30_000 });
    await shot(page, `01-boite-messages-${theme}`);
    await page.getByLabel("Demandes").click();
    const card = page.getByTestId("request-contact").filter({ hasText: c });
    await expect(card).toContainText("ta voiture est superbe", { timeout: 30_000 });
    await shot(page, `02-boite-demandes-${theme}`);
    await card.getByText("Accepter").click();
    await page.waitForURL(/\/boite\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByTestId("messages")).toContainText("Bonjour, ta voiture est superbe !");

    // Profil d'un non-ami : Message ouvre la feuille « Demande de contact ».
    const d = `AppD_${theme}_${s}`;
    await signUpApi(d);
    await page.goto(`/u/${d}`);
    await page.getByTestId("message-open").click();
    await expect(page.getByText("Une seule demande est possible")).toBeVisible({ timeout: 20_000 });
    await shot(page, `05-demande-de-contact-${theme}`);

    await siteCtx.close();
    await ctx.close();
  }
  console.log(`Erreurs console : ${errors.length} ${errors.slice(0, 5).join(" | ")}`);
});
