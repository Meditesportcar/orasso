import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, samplePhoto, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Messagerie et Boîte (lot 18) sur le site, critère de fin : A écrit à B, qui le suit, B voit le message arriver sans
// recharger, A voit « Lu par B » ; image visible des deux, adresse privée refusée sans session ; C (qui ne le suit pas) envoie
// une demande de contact, la seconde est refusée, A accepte → conversation ; une personne contacte MéditeSportCar et
// Damien répond depuis /app/boite. Avec CAPTURES=1 : Boîte, Demandes, conversation dans les deux thèmes, au bureau et
// à 390 px, avec le contrôle automatique du système de design.
// Prérequis : site et API lancés (DEV_SKIP_2FA=true comme le reste de la recette) sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-18-captures/site`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;

async function context(
  browser: Browser,
  cookie: string,
  opts: { theme?: string; width?: number; height?: number } = {},
) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: opts.theme ?? "beton", url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

// Lot R6b (D37) : plus d'amitié ; A et B se suivent (chacun écrit directement à qui le suit). Un compte privé répond « pending » : la cible accepte alors la demande.
async function befriend(a: string, aCookie: string, b: string, bCookie: string) {
  const idOf = async (cookie: string) => (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data.user.id;
  const [aId, bId] = [await idOf(aCookie), await idOf(bCookie)];
  const pairs = [
    [aCookie, b, bCookie, aId],
    [bCookie, a, aCookie, bId],
  ] as const;
  for (const [cookie, target, targetCookie, myId] of pairs) {
    const r = await apiCall<{ mine: string }>(cookie, "POST", `/users/${target}/follow`);
    expect(r.status).toBeLessThan(300);
    if (r.data.mine === "pending") {
      expect((await apiCall(targetCookie, "POST", `/me/follow-requests/${myId}/accept`)).status).toBeLessThan(300);
    }
  }
}

async function send(page: Page, text: string) {
  await page.getByLabel("Écrire un message…").fill(text);
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
}

test("messagerie : abonnés en direct, lu par, image privée, demande de contact, organisateur joignable", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const a = `Alma_${s}`;
  const b = `Basile_${s}`;
  const c = `Cyril_${s}`;
  const u = `Ugo_${s}`;
  const aCookie = await signUpApi(a);
  const bCookie = await signUpApi(b);
  const cCookie = await signUpApi(c);
  const uCookie = await signUpApi(u);
  await befriend(a, aCookie, b, bCookie);

  // A écrit à B, qui le suit depuis son profil.
  const ctxA = await context(browser, aCookie);
  const pageA = await ctxA.newPage();
  await pageA.goto(`/u/${b}`);
  await pageA.getByTestId("message-open").click();
  await pageA.waitForURL(/\/app\/boite\/[0-9a-f-]{36}$/);
  const conversationUrl = new URL(pageA.url()).pathname;
  await expect(pageA.getByRole("heading", { name: b })).toBeVisible();

  // B ouvre la conversation (vide pour l'instant) : le message arrive sans recharger.
  const ctxB = await context(browser, bCookie);
  const pageB = await ctxB.newPage();
  await pageB.goto(conversationUrl);
  await expect(pageB.getByRole("heading", { name: a })).toBeVisible();
  await pageB.waitForTimeout(1500);
  await send(pageA, "Salut Basile, tu viens samedi ?");
  await expect(pageB.getByTestId("messages")).toContainText("Salut Basile, tu viens samedi ?", { timeout: 15_000 });
  // B a la page ouverte : lecture confirmée, A voit « Lu par B » sans recharger.
  await expect(pageA.getByTestId("read-by")).toContainText(`Lu par ${b}`, { timeout: 15_000 });

  // Image : visible des deux ; l'adresse privée est refusée sans session et jamais servie par /api/files.
  await pageA.getByTestId("message-file").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: samplePhoto(),
  });
  const imageB = pageB.getByTestId("messages").locator('img[alt="Photo"]');
  await expect(imageB).toBeVisible({ timeout: 20_000 });
  await expect(pageA.getByTestId("messages").locator('img[alt="Photo"]')).toBeVisible();
  const src = await imageB.getAttribute("src");
  expect(src).toMatch(/^\/api\/conversations\/[0-9a-f-]{36}\/images\/[0-9a-f-]{36}\.webp$/);
  expect((await fetch(`${WEB}${src}`)).status).toBe(401);
  expect((await fetch(`${WEB}${src}`, { headers: { cookie: cCookie } })).status).toBe(403);
  const ok = await pageB.request.get(src ?? "");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/webp");
  const name = src?.split("/").pop() ?? "";
  expect((await fetch(`${WEB}/api/files/private/messages/${name}`, { headers: { cookie: aCookie } })).status).toBe(404);

  // C (qui ne le suit pas) : demande de contact, une seule possible.
  const ctxC = await context(browser, cCookie);
  const pageC = await ctxC.newPage();
  await pageC.goto(`/u/${a}`);
  await pageC.getByTestId("message-open").click();
  await expect(pageC.getByTestId("contact-form")).toBeVisible();
  await pageC.getByLabel("Message", { exact: true }).fill("Bonjour Alma, ta voiture est-elle à vendre ?");
  await pageC.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(pageC.getByTestId("contact-sent")).toContainText(`Demande de contact envoyée à ${a}`);
  await pageC.getByTestId("message-open").click();
  await pageC.getByLabel("Message", { exact: true }).fill("Je relance");
  await pageC.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(pageC.getByRole("alert")).toContainText("Une seule demande de contact est possible");

  // A : Boîte > Demandes, accepte → conversation avec le message de C.
  await pageA.goto("/app/boite/demandes");
  const request = pageA.getByTestId("request-contact").filter({ hasText: c });
  await expect(request).toContainText("ta voiture est-elle à vendre");
  await request.getByRole("button", { name: "Accepter" }).click();
  await pageA.waitForURL(/\/app\/boite\/[0-9a-f-]{36}$/);
  await expect(pageA.getByTestId("messages")).toContainText("Bonjour Alma, ta voiture est-elle à vendre ?");
  await send(pageA, "Non, désolée !");
  await expect(pageA.getByTestId("messages")).toContainText("Non, désolée !");

  // U contacte MéditeSportCar ; Damien (organisateur) répond depuis /app/boite.
  const ctxU = await context(browser, uCookie);
  const pageU = await ctxU.newPage();
  await pageU.goto("/o/meditesportcar");
  await pageU.getByTestId("contact-organizer").click();
  await pageU.waitForURL(/\/app\/boite\/[0-9a-f-]{36}$/);
  await expect(pageU.getByRole("heading", { name: "MéditeSportCar" })).toBeVisible();
  await send(pageU, "Bonjour, il reste de la place pour la Nocturne ?");
  await expect(pageU.getByTestId("messages")).toContainText("il reste de la place");

  const damien = await login("damien@orasso.local");
  const ctxD = await context(browser, damien);
  const pageD = await ctxD.newPage();
  await pageD.goto("/app/boite");
  const row = pageD.getByTestId("conversation-row").filter({ hasText: u });
  await expect(row).toBeVisible();
  await expect(row).toContainText("MéditeSportCar");
  await row.click();
  await pageD.waitForURL(/\/app\/boite\/[0-9a-f-]{36}$/);
  await send(pageD, "Bonjour Ugo, oui : candidate vite !");
  await expect(pageU.getByTestId("messages")).toContainText("Bonjour Ugo, oui : candidate vite !", { timeout: 15_000 });
  await expect(pageU.getByTestId("messages")).toContainText("MéditeSportCar · par Damien_66");
  await expect(pageD.getByTestId("read-by")).toContainText(`Lu par ${u}`, { timeout: 15_000 });

  // Pastille de la Boîte : C a la réponse d'Alma non lue.
  // Lot C5 : la Boîte est en haut à droite (compteur de l'AppBar), plus dans la barre d'onglets.
  await pageC.goto("/app/sorties");
  await expect(pageC.getByRole("link", { name: "Boîte" }).locator(".o-appbar__count")).toBeVisible();
  const summary = await apiCall<{ unreadMessages: number }>(cCookie, "GET", "/me/inbox/summary");
  expect(summary.data.unreadMessages).toBe(1);
  for (const ctx of [ctxA, ctxB, ctxC, ctxU, ctxD]) await ctx.close();

  if (process.env.CAPTURES !== "1") return;
  mkdirSync(DIR, { recursive: true });
  const audits: Record<string, Audit> = {};
  // Une demande de contact en attente pour la capture de Demandes.
  const d = `Dora_${s}`;
  const dCookie = await signUpApi(d);
  await apiCall(dCookie, "POST", "/contact-requests", { pseudo: a, message: "Bonjour, on se croise à Canet ?" });
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const ctx = await context(browser, aCookie, { theme, width: view.width, height: view.height });
      const page = await ctx.newPage();
      for (const [shotName, path] of [
        ["01-boite", "/app/boite"],
        ["02-demandes", "/app/boite/demandes"],
        ["03-conversation", conversationUrl],
      ] as const) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${DIR}/${shotName}-${theme}-${view.id}.png`, fullPage: true });
        audits[`${shotName}-${theme}-${view.id}`] = await auditPage(page);
      }
      await ctx.close();
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  for (const [key, audit] of Object.entries(audits)) {
    expect(audit.buttonsWithoutIcon, key).toEqual([]);
    expect(audit.greens, key).toEqual([]);
    expect(audit.truncated, key).toEqual([]);
    expect(audit.horizontalScroll, key).toBe(false);
    expect(audit.primaryButtons, key).toBeLessThanOrEqual(1);
  }
});
