import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { accountQr, apiCall, login, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Captures du lot 14 (pros, billets) dans les deux thèmes, au bureau et sur téléphone (390 px), avec le contrôle
// automatique du système de design : `CAPTURES=1 pnpm --filter @orasso/web exec playwright test captures-lot14`.
// Prérequis : base locale avec le seed (pros et événements à billets).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-14-captures/site`;
test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");

const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;
const audits: Record<string, Audit> = {};

async function context(browser: Browser, theme: string, view: (typeof VIEWS)[number], cookie?: string) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of (cookie ?? "").split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function shot(page: Page, theme: string, view: string, name: string, settle = 700) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

test("captures des pros, des billets et des réglages", async ({ browser }) => {
  mkdirSync(DIR, { recursive: true });
  test.setTimeout(900_000);
  const s = unique();
  const damien = await login("damien@orasso.local");
  const garage = await login("garage@orasso.local");
  const covering = await login("covering@orasso.local");
  const garagePro = (await apiCall<{ id: string; slug: string }>(garage, "GET", "/me/pro")).data;
  const coveringPro = (await apiCall<{ id: string }>(covering, "GET", "/me/pro")).data;

  // Chiffres de départ pour les statistiques du Garage du Port : vues, clics, abonnés, remises lues au scan.
  for (let i = 0; i < 14; i++) await apiCall(null, "POST", "/pros/by-slug/garage-du-port/track", { kind: "view" });
  for (let i = 0; i < 4; i++) await apiCall(null, "POST", "/pros/by-slug/garage-du-port/track", { kind: "call" });
  for (let i = 0; i < 6; i++) await apiCall(null, "POST", "/pros/by-slug/garage-du-port/track", { kind: "route" });
  const fans: string[] = [];
  for (let i = 0; i < 3; i++) {
    const cookie = await signUpApi(`Client_${s}${i}`);
    fans.push(cookie);
    await apiCall(garage, "POST", "/account-qr/verify", { payload: await accountQr(cookie) });
  }
  // Une demande de partenariat en attente côté organisateur (le Garage du Port est déjà accepté par le seed).
  await apiCall(covering, "POST", `/pros/${coveringPro.id}/partners`, { structureSlug: "meditesportcar" });

  const caf = await apiCall<{ id: string; slug: string }>(damien, "GET", "/events/by-slug/cars-and-coffee-plage");
  const nuit = await apiCall<{ id: string; slug: string }>(damien, "GET", "/events/by-slug/nuit-des-moteurs");
  // Le visiteur réserve deux billets pour que la page « Mes billets » ait du contenu.
  const visitor = await signUpApi(`Visiteur_${s}`);
  await apiCall(visitor, "POST", `/events/${caf.data.id}/tickets/reserve`, { quantity: 2 });
  const tickets = await apiCall<{ payload: string }[]>(visitor, "GET", "/me/tickets");
  await apiCall(damien, "POST", `/events/${caf.data.id}/tickets/check`, { payload: tickets.data[0]?.payload });
  const newcomer = await signUpApi(`Nouveau_${s}`);

  for (const theme of THEMES) {
    for (const view of VIEWS) {
      // Public.
      const pub = await (await context(browser, theme, view)).newPage();
      await pub.goto("/professionnels");
      await shot(pub, theme, view.id, "01-professionnels");
      await pub.goto("/pros");
      await shot(pub, theme, view.id, "02-annuaire", 2500);
      await pub.goto("/pros?activite=detailing");
      await shot(pub, theme, view.id, "03-annuaire-filtre");
      await pub.goto("/p/garage-du-port");
      await shot(pub, theme, view.id, "04-fiche-publique");
      await pub.goto("/p/detailing-pyrenees");
      await shot(pub, theme, view.id, "05-fiche-zone-intervention");
      await pub.goto("/o/meditesportcar");
      await shot(pub, theme, view.id, "06-structure-partenaires");
      await pub.goto(`/e/${caf.data.slug}`);
      await shot(pub, theme, view.id, "07-evenement-billets-gratuits");
      await pub.goto(`/e/${nuit.data.slug}`);
      await shot(pub, theme, view.id, "08-evenement-billets-payants-bientot");
      await pub.context().close();

      // Passionné : réserver un billet, mes billets, créer ma fiche pro.
      const fanPage = await (await context(browser, theme, view, visitor)).newPage();
      await fanPage.goto(`/e/${caf.data.slug}`);
      await shot(fanPage, theme, view.id, "09-evenement-billets-connecte");
      await fanPage.goto("/app/billets");
      await shot(fanPage, theme, view.id, "10-mes-billets", 1500);
      await fanPage.context().close();
      const newPage = await (await context(browser, theme, view, newcomer)).newPage();
      await newPage.goto("/app/pro/nouvelle");
      await shot(newPage, theme, view.id, "11-creer-fiche-pro");
      await newPage.context().close();

      // Espace pro.
      const proPage = await (await context(browser, theme, view, garage)).newPage();
      await proPage.goto("/pro/garage-du-port");
      await shot(proPage, theme, view.id, "12-espace-pro-fiche");
      await proPage.goto("/pro/garage-du-port/publications");
      await shot(proPage, theme, view.id, "13-espace-pro-publications");
      await proPage.goto("/pro/garage-du-port/statistiques");
      await shot(proPage, theme, view.id, "14-espace-pro-statistiques");
      await proPage.goto("/pro/garage-du-port/abonnement");
      await shot(proPage, theme, view.id, "15-espace-pro-abonnement");
      await proPage.context().close();

      // Organisateur et administration.
      const orga = await (await context(browser, theme, view, damien)).newPage();
      await orga.goto(`/orga/meditesportcar/e/${caf.data.id}`);
      await shot(orga, theme, view.id, "16-orga-billetterie-gratuite");
      await orga.goto(`/orga/meditesportcar/e/${nuit.data.id}`);
      await shot(orga, theme, view.id, "17-orga-billetterie-payante");
      await orga.goto(`/orga/meditesportcar/e/${caf.data.id}/billets`);
      await expect(orga.getByTestId("ticket-list")).toBeVisible();
      await shot(orga, theme, view.id, "18-orga-controle-billets");
      await orga.goto("/orga/meditesportcar/structure");
      await shot(orga, theme, view.id, "19-orga-structure-stripe-partenaires");
      await orga.goto("/admin/reglages");
      await shot(orga, theme, view.id, "20-admin-reglages");
      await orga.context().close();
    }
  }
  void garagePro;
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
});
