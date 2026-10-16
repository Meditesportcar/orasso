import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { type Audit, auditPage } from "./audit";
import { apiCall, type Cookie, login, samplePhoto, signUpApi, unique } from "./helpers";

// Modération (lot 32) sur le site, critère de fin : trois comptes anciens signalent le profil de X (le troisième par la
// fenêtre « Signaler », avec une capture) → X est suspendu 7 jours, voit le bandeau et le motif, ne peut plus écrire mais
// conteste ; le super admin lève la sanction → X écrit à nouveau. Un message signalé apparaît avec sa conversation
// jointe ; le super admin le retire (« Message retiré par la modération ») ; la modératrice ne voit que la file.
// Avec CAPTURES=1 : fenêtre « Signaler », bandeau, mes sanctions, file et détail, sanctions, dans les deux thèmes, au
// bureau et à 390 px, avec le contrôle du système de design.
// Prérequis : site et API lancés (DEV_SKIP_2FA=true comme le reste de la recette) sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-32-captures/site";
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;
const audits: Record<string, Audit> = {};

async function context(browser: Browser, cookie: Cookie, opts: { theme?: string; width?: number; height?: number } = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 } });
  const cookies = [{ name: "orasso-theme", value: opts.theme ?? "beton", url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: WEB });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function userId(cookie: Cookie): Promise<string> {
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  return me.data.user.id;
}

/** S39 : seuls les comptes de plus de 7 jours comptent pour la suspension automatique. */
async function age(ids: string[]) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`update "user" set created_at = now() - interval '30 days' where id = any($1)`, [ids]);
  } finally {
    await client.end();
  }
}

async function shot(page: Page, name: string) {
  if (!process.env.CAPTURES) return;
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const theme = (await page.context().cookies()).find((c) => c.name === "orasso-theme")?.value ?? "beton";
  const view = (page.viewportSize()?.width ?? 1280) < 600 ? "mobile" : "bureau";
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

test("modération : suspension automatique, bandeau, contestation, levée ; message signalé retiré ; file de la modératrice", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const [xCookie, aCookie, bCookie, cCookie] = await Promise.all(
    [`Xav_${s}`, `Ana_${s}`, `Bea_${s}`, `Cyr_${s}`].map((p) => signUpApi(p)),
  );
  const ids = await Promise.all([xCookie, aCookie, bCookie, cCookie].map(userId));
  const [xId, , , cId] = ids as [string, string, string, string];
  await age(ids.slice(1));
  for (const cookie of [aCookie, bCookie]) {
    const r = await apiCall(cookie, "POST", "/reports", { targetType: "profile", targetId: xId, reason: "harassment" });
    expect(r.status).toBe(201);
  }

  // Le troisième signale par la fenêtre du site, avec une capture.
  const ctxC = await context(browser, cCookie);
  const pageC = await ctxC.newPage();
  await pageC.goto(`/u/Xav_${s}`);
  await pageC.waitForLoadState("networkidle"); // fenêtre ouverte par React : attendre l'hydratation
  await pageC.getByTestId("report-open").first().click();
  const dialog = pageC.getByTestId("report-dialog");
  await expect(dialog).toBeVisible();
  await shot(pageC, "signaler-profil");
  await dialog.getByLabel("Motif").selectOption("insult");
  await dialog.getByLabel("Détails").fill("Insultes répétées après la sortie de dimanche.");
  await dialog.getByLabel("Capture d'écran").setInputFiles({
    name: "capture.png",
    mimeType: "image/png",
    buffer: samplePhoto([90, 90, 90]),
  });
  await dialog.getByTestId("report-send").click();
  await expect(dialog.getByTestId("report-done")).toBeVisible();

  // X : bandeau « Compte suspendu », écriture refusée, contestation.
  const ctxX = await context(browser, xCookie);
  const pageX = await ctxX.newPage();
  await pageX.goto("/app");
  await expect(pageX.getByTestId("suspended-banner")).toContainText("Compte suspendu jusqu'au");
  await expect(pageX.getByTestId("suspended-banner")).toContainText("Harcèlement");
  expect((await apiCall(xCookie, "PATCH", "/me/profile", { bio: "Pendant" })).status).toBe(403);
  await pageX.getByTestId("suspended-contest").click();
  await pageX.waitForURL("**/app/sanctions");
  await shot(pageX, "mes-sanctions");
  await pageX.getByLabel("Ton explication").fill("Je ne connais pas ces personnes.");
  await pageX.getByTestId("contest-send").click();
  await expect(pageX.getByTestId("contest-sent")).toBeVisible();

  // La modératrice (seed) : seule la file des signalements, le signalement de C avec sa capture.
  const modo = await login("moderatrice@orasso.local");
  const ctxM = await context(browser, modo);
  const pageM = await ctxM.newPage();
  await pageM.goto("/admin");
  await pageM.waitForURL("**/admin/signalements");
  await expect(pageM.getByRole("navigation", { name: "Administration" }).getByRole("link")).toHaveText([
    "Signalements",
    /Mon compte/,
  ]);
  await pageM.getByTestId("report-item").filter({ hasText: `Xav_${s}` }).first().click();
  await expect(pageM.getByTestId("report-detail")).toBeVisible();
  await shot(pageM, "file-signalements");

  // Le super admin lève la sanction contestée : X écrit à nouveau.
  const damien = await login("damien@orasso.local");
  const ctxD = await context(browser, damien);
  const pageD = await ctxD.newPage();
  await pageD.goto("/admin/sanctions");
  const card = pageD.getByTestId("sanction").filter({ hasText: `Xav_${s}` });
  await expect(card.getByTestId("contest-message")).toContainText("Je ne connais pas ces personnes.");
  await shot(pageD, "sanctions");
  await card.getByRole("button", { name: "Lever la sanction" }).click();
  await expect(pageD.getByTestId("sanction").filter({ hasText: `Xav_${s}` })).toHaveCount(0);
  expect((await apiCall(xCookie, "PATCH", "/me/profile", { bio: "Libre" })).status).toBe(200);

  // Message signalé : A et C deviennent amis, C écrit, A signale depuis la conversation.
  const req = await apiCall<{ id: string }>(aCookie, "POST", "/friends/requests", { pseudo: `Cyr_${s}` });
  await apiCall(cCookie, "POST", `/friends/requests/${req.data.id}/accept`);
  const conv = await apiCall<{ id: string }>(aCookie, "POST", "/conversations/direct", { userId: cId });
  for (const body of ["Salut", "Tu es nul", "Vraiment nul"]) {
    await apiCall(cCookie, "POST", `/conversations/${conv.data.id}/messages`, { clientId: crypto.randomUUID(), body });
  }
  const ctxA = await context(browser, aCookie);
  const pageA = await ctxA.newPage();
  await pageA.goto(`/app/boite/${conv.data.id}`);
  await pageA.waitForLoadState("networkidle");
  const insult = pageA.getByTestId("message").filter({ hasText: "Tu es nul" });
  await insult.getByTestId("report-open").click();
  const mdialog = insult.getByTestId("report-dialog");
  await expect(mdialog).toContainText("5 messages avant et après");
  await mdialog.getByLabel("Motif").selectOption("insult");
  await mdialog.getByTestId("report-send").click();
  await expect(mdialog.getByTestId("report-done")).toBeVisible();

  await pageD.goto("/admin/signalements?statut=pending");
  await pageD.getByTestId("report-item").filter({ hasText: "Message" }).first().click();
  await expect(pageD.getByTestId("report-context")).toContainText("Tu es nul");
  await shot(pageD, "detail-message");
  await pageD.getByLabel("Retirer le contenu").check();
  await pageD.getByTestId("sanction-submit").click();
  await expect(pageD.getByTestId("report-detail")).toContainText("Traité : mesure prise");
  await pageA.reload();
  await expect(pageA.getByTestId("message").filter({ hasText: "Message retiré par la modération" })).toHaveCount(1);
  if (process.env.CAPTURES) writeFileSync(`${DIR}/audit-parcours.json`, JSON.stringify(audits, null, 2));
});

test("captures du lot 32 dans les deux thèmes et à 390 px", async ({ browser }) => {
  test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const pilote = await login("pilote12@orasso.local").catch(() => null);
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const ctx = await context(browser, damien, { theme, width: view.width, height: view.height });
      const page = await ctx.newPage();
      await page.goto("/admin/signalements?statut=pending");
      const first = page.getByTestId("report-item").first();
      if (await first.count()) await first.click();
      await shot(page, "admin-signalements");
      await page.goto("/admin/sanctions");
      await shot(page, "admin-sanctions");
      await page.goto("/u/Kenji_66");
      await page.waitForLoadState("networkidle");
      await page.getByTestId("report-open").first().click();
      await shot(page, "dialog-signaler");
      await ctx.close();
      if (pilote) {
        const px = await context(browser, pilote, { theme, width: view.width, height: view.height });
        const pp = await px.newPage();
        await pp.goto("/app");
        await shot(pp, "bandeau-suspendu");
        await pp.goto("/app/sanctions");
        await shot(pp, "app-sanctions");
        await px.close();
      }
    }
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
});
