import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { addVehicleApi, apiCall, createEvent, login, randomPlate, signUpApi, unique } from "./helpers";

// Crews et inscription en crew (lot 19) sur le site, critère de fin : Kenji crée son crew, Léa demande à le rejoindre,
// Kenji accepte depuis sa Boîte, Léa écrit dans la discussion, Kenji inscrit le crew (Léa + Nina) à un événement, Léa
// confirme sa venue dans Accès (Nina pas encore), l'organisateur voit le crew au tri (« 2/3 ») et filtre sur lui.
// Avec CAPTURES=1 : fiche du crew (chef et visiteur), mes crews, inscription en crew, confirmation de venue, demandes,
// tri, recherche de crews, dans les deux thèmes, au bureau et à 390 px, avec le contrôle du système de design.
// Prérequis : site et API lancés (DEV_SKIP_2FA=true comme le reste de la recette) sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-19-captures/site";
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

test("crews : création, demande acceptée, discussion, inscription en crew, confirmation, crew au tri", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const kenji = `Kenji_${s}`;
  const lea = `Lea_${s}`;
  const nina = `Nina_${s}`;
  const kCookie = await signUpApi(kenji);
  const lCookie = await signUpApi(lea);
  const nCookie = await signUpApi(nina);
  for (const c of [kCookie, lCookie, nCookie]) await addVehicleApi(c, randomPlate());
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer, { title: `Crew E2E ${s}` });

  // Kenji crée son crew depuis « Mes crews ».
  const ctxK = await context(browser, kCookie);
  const pageK = await ctxK.newPage();
  await pageK.goto("/app/crews");
  const crewName = `Drift ${s}`;
  await pageK.getByLabel("Nom du crew").fill(crewName);
  await pageK.getByLabel("Description").fill("Glisse et japonaises.");
  await pageK.getByTestId("crew-create").click();
  await pageK.waitForURL(/\/c\/[a-z0-9-]+$/);
  const crewPath = new URL(pageK.url()).pathname;
  await expect(pageK.getByTestId("crew")).toHaveAttribute("data-state", "leader");

  // Léa trouve la fiche (sans la liste des membres) et demande à rejoindre.
  const ctxL = await context(browser, lCookie);
  const pageL = await ctxL.newPage();
  await pageL.goto(`/app/explorer?segment=personnes&q=${encodeURIComponent(crewName)}`);
  await pageL.getByTestId("crew-results").getByRole("link", { name: crewName }).click();
  await pageL.waitForURL(crewPath);
  await expect(pageL.getByTestId("crew-members")).toHaveCount(0);
  await pageL.getByLabel("Un mot pour le chef (facultatif)").fill("Je peux venir avec ma BMW ?");
  await pageL.getByTestId("crew-request").click();
  await expect(pageL.getByTestId("crew-requested")).toBeVisible();

  // Kenji accepte depuis Boîte > Demandes.
  await pageK.goto("/app/boite/demandes");
  const request = pageK.getByTestId("request-crew-request");
  await expect(request).toContainText(lea);
  await request.getByRole("button", { name: "Accepter" }).click();
  await expect(pageK.getByTestId("request-crew-request")).toHaveCount(0);

  // Nina rejoint par invitation (API), Léa écrit dans la discussion.
  const crew = await apiCall<{ id: string; conversationId: string }>(
    kCookie,
    "GET",
    `/crews/by-slug/${crewPath.slice(3)}`,
  );
  expect((await apiCall(kCookie, "POST", `/crews/${crew.data.id}/invitations`, { pseudo: nina })).status).toBe(201);
  expect((await apiCall(nCookie, "POST", `/me/crew-invitations/${crew.data.id}/accept`)).status).toBe(200);
  await pageL.goto(crewPath);
  await expect(pageL.getByTestId("crew-members")).toBeVisible();
  await pageL.getByTestId("crew-discussion").click();
  await pageL.waitForURL(/\/app\/boite\/[0-9a-f-]{36}$/);
  await expect(pageL.getByTestId("message-system").first()).toBeVisible();
  await pageL.getByLabel("Écrire un message…").fill("On s'inscrit ensemble ?");
  await pageL.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(pageL.getByTestId("messages")).toContainText("On s'inscrit ensemble ?");

  // Kenji inscrit le crew (lui, Léa, Nina) depuis la page de l'événement.
  await pageK.goto(`/e/${event.slug}`);
  await pageK.getByTestId("register-crew").click();
  await pageK.waitForURL(new RegExp(`/e/${event.slug}/crew`));
  for (const pick of await pageK.getByTestId("crew-pick").all()) await pick.locator('input[type="checkbox"]').check();
  await expect(pageK.getByTestId("crew-registration-recap")).toContainText(lea);
  await pageK.getByLabel(/J'ai lu le règlement de l'événement \(pour ma propre/).check();
  await pageK.getByTestId("crew-registration-send").click();
  await expect(pageK.getByTestId("crew-registration-sent")).toBeVisible();
  await expect(pageK.getByTestId("crew-registration-member")).toHaveCount(3);

  // Léa confirme sa venue dans Accès.
  await pageL.goto("/app/acces");
  const card = pageL.getByTestId("crew-confirm");
  await expect(card).toBeVisible();
  await card.getByLabel("J'ai lu le règlement de l'événement").check();
  await card.getByTestId("crew-confirm-btn").click();
  await expect(pageL.getByTestId("acces-ok")).toBeVisible();
  await expect(pageL.locator(`[data-testid="application"][data-status="pending"]`)).toHaveCount(1);

  // L'organisateur voit le crew au tri (2 confirmés sur 3) et filtre sur lui ; Nina n'apparaît pas.
  const ctxO = await context(browser, organizer);
  const pageO = await ctxO.newPage();
  await pageO.goto(`/orga/meditesportcar/e/${event.id}/candidatures?vue=liste&crewId=${crew.data.id}`);
  await expect(pageO.getByTestId("triage-row")).toHaveCount(2);
  await expect(pageO.getByTestId("triage-row-crew").first()).toContainText("2/3");
  await expect(pageO.getByTestId("triage-list")).not.toContainText(nina);
  await pageO.goto(`/orga/meditesportcar/e/${event.id}/candidatures`);
  await expect(pageO.getByTestId("triage-crew")).toContainText(crewName);
  for (const ctx of [ctxK, ctxL, ctxO]) await ctx.close();

  if (process.env.CAPTURES !== "1") return;
  mkdirSync(DIR, { recursive: true });
  const audits: Record<string, Audit> = {};
  const outsider = await signUpApi(`Paul_${s}`);
  const shots: { name: string; cookie: string; path: string }[] = [
    { name: "01-crew-chef", cookie: kCookie, path: crewPath },
    { name: "02-crew-visiteur", cookie: outsider, path: crewPath },
    { name: "03-mes-crews", cookie: kCookie, path: "/app/crews" },
    { name: "04-inscription-crew", cookie: kCookie, path: `/e/${event.slug}/crew` },
    { name: "05-acces-confirmer", cookie: nCookie, path: "/app/acces" },
    { name: "06-explorer-crews", cookie: outsider, path: `/app/explorer?segment=personnes&departement=66` },
    { name: "07-tri-liste-crew", cookie: organizer, path: `/orga/meditesportcar/e/${event.id}/candidatures?vue=liste` },
    { name: "08-garage", cookie: kCookie, path: "/app/garage" },
  ];
  // Une demande en attente pour la capture des Demandes.
  await apiCall(outsider, "POST", `/crews/${crew.data.id}/requests`, { message: "Salut, je roule en S13." });
  shots.push({ name: "09-demandes", cookie: kCookie, path: "/app/boite/demandes" });
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      for (const shot of shots) {
        const ctx = await context(browser, shot.cookie, { theme, width: view.width, height: view.height });
        const page = await ctx.newPage();
        await page.goto(shot.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${DIR}/${shot.name}-${theme}-${view.id}.png`, fullPage: true });
        audits[`${shot.name}-${theme}-${view.id}`] = await auditPage(page);
        await ctx.close();
      }
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  for (const [key, audit] of Object.entries(audits)) {
    expect(audit.buttonsWithoutIcon, key).toEqual([]);
    expect(audit.greens, key).toEqual([]);
    expect(audit.truncated, key).toEqual([]);
    expect(audit.horizontalScroll, key).toBe(false);
    // Le tri garde sa vue liste préexistante (plusieurs boutons de décision) : contrôlé à part.
    if (!key.startsWith("07-")) expect(audit.primaryButtons, key).toBeLessThanOrEqual(1);
  }
});
