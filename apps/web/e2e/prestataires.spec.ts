import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, createEvent, login, loginInBrowser, samplePhoto, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot 21 : prestataires. Parcours (Léa crée son profil, candidate, l'organisateur la retient dans l'onglet
// « Prestataires », elle apparaît sur la page de l'événement) et captures dans les deux thèmes, au bureau et sur
// téléphone (`CAPTURES=1`). Prérequis : site et API lancés sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-21-captures/site`;
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

async function shot(page: Page, theme: string, view: string, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

test("un food truck candidate, l'équipe organisatrice le retient, il apparaît sur la page de l'événement", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer, { title: `Prestataires ${unique()}`, capacity: 1 });
  // Types attendus : food truck et photographe (l'événement est « plein » dès qu'un véhicule est retenu : capacité 1).
  const patched = await apiCall(organizer, "PATCH", `/events/${event.id}`, {
    vendorTypes: ["Food truck", "Photographe"],
  });
  expect(patched.status).toBe(200);

  // 1. Léa crée son profil sur le site, ajoute une photo et candidate.
  const name = `Caravane ${unique()}`;
  const lea = `lea.${unique()}@e2e.orasso.test`;
  await signUpApi("Lea_Truck", lea);
  await loginInBrowser(page, lea, undefined, "/app/prestataire");
  await expect(page.getByTestId("provider-space")).toBeVisible();
  await page.getByLabel("Nom affiché").fill(name);
  await page.getByLabel("Présentation").fill("Burgers maison");
  await page.getByRole("button", { name: "Créer mon profil" }).click();
  await expect(page.getByTestId("provider-feedback")).toContainText("Profil enregistré");
  await expect(page.getByTestId("provider-issue")).toContainText("photo");
  await page.getByLabel("Ajouter une photo").setInputFiles({
    name: "stand.png",
    mimeType: "image/png",
    buffer: samplePhoto([212, 160, 23]),
  });
  await page.getByTestId("provider-space").getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByTestId("provider-photos")).toBeVisible();
  await page.goto(`/app/prestataire?evenement=${event.slug}`);
  const card = page.locator(`[data-testid="open-event"][data-slug="${event.slug}"]`);
  await expect(card).toBeVisible();
  await card.getByLabel("J'ai lu et j'accepte le règlement de l'événement").check();
  await card.getByRole("button", { name: "Candidater" }).click();
  await expect(page.getByTestId("provider-feedback")).toContainText("Candidature envoyée");
  await expect(page.getByTestId("provider-application")).toHaveAttribute("data-status", "pending");

  // 2. L'organisateur la trouve dans l'onglet « Prestataires » (pas dans la file des véhicules) et la retient.
  const orga = await browser.newPage();
  await loginInBrowser(orga, "damien@orasso.local", undefined, `/orga/meditesportcar/e/${event.id}/candidatures`);
  await expect(orga.getByTestId("triage-empty")).toBeVisible();
  await orga.goto(`/orga/meditesportcar/e/${event.id}/candidatures?onglet=prestataires`);
  const pCard = orga.locator('[data-testid="provider-card"]', { hasText: name });
  await expect(pCard).toBeVisible();
  await expect(pCard.getByTestId("provider-contact")).not.toBeEmpty();
  await pCard.getByRole("button", { name: "Retenir" }).click();
  await expect(orga.getByTestId("provider-message")).toContainText("retenu");

  // 3. Visible sur la page publique, avec son type (lot R4b : dans « Sur place » du plateau).
  await page.goto(`/e/${event.slug}`);
  const present = page.getByTestId("lineup-pro").filter({ hasText: name });
  await expect(present).toBeVisible();
  await expect(present).toContainText("Food truck");

  // 4. Un photographe retenu est accrédité « Média officiel ».
  const paulCookie = await signUpApi("Paul_Photo", `paul.${unique()}@e2e.orasso.test`);
  const profile = await apiCall(paulCookie, "PUT", "/me/provider-profile", {
    type: "photographer",
    name: `Paul Photo ${unique()}`,
    instagram: "@paul.photo",
  });
  expect(profile.status).toBe(200);
  const applied = await apiCall<{ id: string }>(paulCookie, "POST", `/events/${event.id}/provider-applications`, {
    rulesAccepted: true,
    message: null,
  });
  expect(applied.status).toBe(201);
  await orga.goto(`/orga/meditesportcar/e/${event.id}/candidatures?onglet=prestataires`);
  const photographer = orga.locator('[data-testid="provider-card"]', { hasText: "Paul Photo" });
  await photographer.getByRole("button", { name: "Retenir" }).click();
  await expect(orga.getByTestId("provider-message")).toContainText("retenu");
  await orga.getByRole("button", { name: "Retenus", exact: false }).click();
  await orga
    .locator('[data-testid="provider-card"]', { hasText: "Paul Photo" })
    .getByRole("button", { name: "Média officiel" })
    .click();
  await expect(orga.getByTestId("provider-message")).toContainText("accrédité");
  await page.goto(`/e/${event.slug}`);
  await expect(page.getByTestId("lineup-pro").filter({ hasText: "Paul Photo" })).toContainText("Média officiel");
  await orga.close();
});

test("paiement sur place : « Entrée payante · paiement sur place » sur la page de l'événement", async ({ page }) => {
  test.setTimeout(120_000);
  const title = `Course de côte ${unique()}`;
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer, { title, publicAccess: "free" });
  const patched = await apiCall(organizer, "PATCH", `/events/${event.id}`, {
    publicAccess: "paid_external",
    externalTicketUrl: null,
  });
  expect(patched.status).toBe(200);
  await page.goto(`/e/${event.slug}`);
  await expect(page.getByTestId("on-site-payment")).toContainText("Entrée payante · paiement sur place");
});

test("captures du lot 21", async ({ browser }) => {
  test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const lea = await login("lea@orasso.local");
  const damien = await login("damien@orasso.local");
  const nocturne = (await apiCall<{ id: string }>(damien, "GET", "/events/by-slug/nocturne-de-canet-2026")).data;
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const user = await (await context(browser, theme, view, lea)).newPage();
      await user.goto("/app/prestataire");
      await shot(user, theme, view.id, "01-espace-prestataire");
      await user.context().close();

      const orga = await (await context(browser, theme, view, damien)).newPage();
      await orga.goto(`/orga/meditesportcar/e/${nocturne.id}/candidatures?onglet=prestataires`);
      await shot(orga, theme, view.id, "02-onglet-prestataires");
      await orga.context().close();

      const pub = await (await context(browser, theme, view)).newPage();
      await pub.goto("/e/nocturne-de-canet-2026");
      await shot(pub, theme, view.id, "03-prestataires-presents");
      await pub.context().close();
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
});
