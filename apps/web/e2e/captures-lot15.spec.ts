import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login } from "./helpers";

// Captures du lot 15 (compte et sécurité) dans les deux thèmes, au bureau et sur téléphone (390 px), avec le contrôle
// automatique du système de design : `CAPTURES=1 pnpm --filter @orasso/web exec playwright test captures-lot15`.
// Prérequis : base locale avec le seed (noe@orasso.local : adresse à confirmer ; Kenji : lien d'ami).
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-15-captures/site";
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

test("captures du compte et de la sécurité", async ({ browser }) => {
  mkdirSync(DIR, { recursive: true });
  test.setTimeout(600_000);
  const kenji = await login("kenji@orasso.local");
  const token = (await apiCall<{ profile: { inviteToken: string } }>(kenji, "GET", "/me")).data.profile.inviteToken;

  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const pub = await (await context(browser, theme, view)).newPage();
      await pub.goto("/connexion");
      await shot(pub, theme, view.id, "01-connexion");
      await pub.goto("/mot-de-passe-oublie");
      await shot(pub, theme, view.id, "02-mot-de-passe-oublie");
      await pub.getByLabel("E-mail").fill("personne@orasso.test");
      await pub.getByRole("button", { name: "Recevoir le lien" }).click();
      await expect(pub.getByTestId("reset-sent")).toBeVisible();
      await shot(pub, theme, view.id, "03-mot-de-passe-oublie-envoye");
      await pub.goto("/reinitialisation?token=exemple-de-jeton");
      await shot(pub, theme, view.id, "04-reinitialisation");
      await pub.goto("/reinitialisation");
      await shot(pub, theme, view.id, "05-reinitialisation-expiree");
      await pub.goto("/verification-email?token=perime");
      await shot(pub, theme, view.id, "06-verification-email-expiree");
      await pub.goto(`/ami/${token}`);
      await shot(pub, theme, view.id, "07-lien-ami");
      await pub.context().close();

      // Compte dont l'adresse n'est pas confirmée (bandeau), Mon compte, Sécurité.
      const noe = await login("noe@orasso.local");
      const page = await (await context(browser, theme, view, noe)).newPage();
      await page.goto("/app");
      await shot(page, theme, view.id, "08-bandeau-verifie-ton-email");
      await page.goto("/app/moi");
      await shot(page, theme, view.id, "09-mon-compte");
      await page.goto("/app/securite");
      await shot(page, theme, view.id, "10-securite");
      await page.context().close();
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
});
