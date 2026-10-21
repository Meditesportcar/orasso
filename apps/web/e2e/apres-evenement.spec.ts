import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Browser, expect, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  deliverNow,
  login,
  randomPlate,
  signUpApi,
  simulateSettle,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Après l'événement et badge de structure (lot 27) sur le site, critère de fin : un événement réglé (J+2) → bilan
// (présents, absents, taux), note interne écrite au tri, remerciement envoyé aux présents (une seule fois) avec le
// lien d'avis de chacun, avis laissé par ce lien, export CSV tracé avec motif (sans la note interne) ; badges des
// structures : liste de l'équipe, suspension levée, bandeau « Structure suspendue » / « Badge expire dans 5 jours ».
// Avec CAPTURES=1 : écrans (Sable imposé), bureau et 390 px, avec le contrôle du système de design.
// Les rappels J−30 / J−7 / J−1, la suspension, le rafraîchissement du bilan à J+8 et la levée sont vérifiés à l'heure
// simulée par les tests de l'API (`after-event.test.ts`).
// Prérequis : site et API lancés (DEV_SKIP_2FA=true comme le reste de la recette) sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-27-captures/site`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;

async function context(browser: Browser, cookie: string | null, opts: { width?: number; height?: number } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 },
    acceptDownloads: true,
  });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: "sable", url: WEB }];
  for (const pair of (cookie ?? "").split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

test("après l'événement : bilan, note interne, remerciement, avis par le lien, export tracé, badges", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, { title: `Après ${s}` });
  const base = `/orga/meditesportcar/e/${event.id}`;

  // Deux retenus : Présent (entre) et Absent (ne vient pas).
  const present = { pseudo: `Present_${s}`, cookie: "", applicationId: "" };
  const absent = { pseudo: `Absent_${s}`, cookie: "", applicationId: "" };
  for (const p of [present, absent]) {
    p.cookie = await signUpApi(p.pseudo);
    const vehicleId = await addVehicleApi(p.cookie, randomPlate());
    p.applicationId = await applyApi(p.cookie, event.id, vehicleId);
    await decideApi(damien, event.id, p.applicationId, "accept");
  }
  const entry = await apiCall(damien, "POST", `/events/${event.id}/checkins`, {
    applicationId: present.applicationId,
    method: "manual",
  });
  expect(entry.status).toBe(201);

  const ctxD = await context(browser, damien);
  const page = await ctxD.newPage();

  // 1. Note interne écrite depuis la liste des candidatures (visible de la structure seulement).
  await page.goto(`${base}/candidatures?vue=liste`);
  await page.waitForLoadState("networkidle");
  const row = page.getByTestId("triage-row").filter({ hasText: present.pseudo });
  await row.getByTestId("triage-row-notes").locator("summary").click();
  const noteText = `Super participant ${s}, à réinviter`;
  await row.getByLabel("Ajouter une note").fill(noteText);
  await row.getByRole("button", { name: "Enregistrer la note" }).click();
  await expect(row.getByTestId("structure-note")).toContainText(noteText);

  // 2. J+2 : les points sont réglés, le bilan est calculé.
  simulateSettle(event.slug);
  await page.goto(`${base}/apres`);
  await expect(page.getByRole("heading", { name: event.title })).toBeVisible();
  const counters = page.getByTestId("ae-counters");
  await expect(counters).toContainText("Retenus");
  await expect(counters).toContainText("Présents");
  await expect(counters).toContainText("50 %");
  await expect(page.getByTestId("ae-report")).toContainText("Bilan provisoire");

  // 3. Remerciement : confirmation, puis « envoyé le … » ; une seule fois.
  await expect(page.getByTestId("ae-thanks-preview")).toContainText("/app/sorties?avis=");
  await page.getByTestId("ae-thanks-send").click();
  await expect(page.getByTestId("ae-thanks")).toContainText("Il ne part qu'une fois");
  await page.getByTestId("ae-thanks-confirm").click();
  await expect(page.getByTestId("ae-thanks-sent")).toContainText("Remerciement envoyé le");
  await page.reload();
  await expect(page.getByTestId("ae-thanks-sent")).toBeVisible();
  const again = await apiCall(damien, "POST", `/events/${event.id}/thanks`, {});
  expect(again.status).toBe(409);

  // 4. Le présent reçoit son lien d'avis dans la Boîte et laisse son avis par ce lien ; l'absent ne reçoit rien.
  deliverNow(`${present.pseudo.toLowerCase()}@e2e.orasso.test`);
  await expect
    .poll(
      async () =>
        (await apiCall<{ items: { id: string }[] }>(present.cookie, "GET", "/me/conversations")).data.items.length,
      { timeout: 30_000 },
    )
    .toBe(1);
  expect((await apiCall<{ items: unknown[] }>(absent.cookie, "GET", "/me/conversations")).data.items).toHaveLength(0);
  const conversations = await apiCall<{ items: { id: string }[] }>(present.cookie, "GET", "/me/conversations");
  const messages = await apiCall<{ items: { body: string }[] }>(
    present.cookie,
    "GET",
    `/conversations/${conversations.data.items[0]?.id}/messages`,
  );
  const link = `/app/sorties?avis=${present.applicationId}`;
  expect(messages.data.items.map((m) => m.body).join("\n")).toContain(link);

  const ctxP = await context(browser, present.cookie);
  const pageP = await ctxP.newPage();
  await pageP.goto(link);
  await expect(pageP.locator('[data-focused="true"]')).toHaveCount(1);
  await pageP
    .getByTestId("review-form")
    .getByRole("button", { name: /3 étoile|★/ })
    .first()
    .click();
  await pageP.getByTestId("review-form").locator("textarea").fill(`Belle soirée ${s}`);
  await pageP.getByRole("button", { name: "Envoyer mon avis" }).click();
  await expect(pageP.getByTestId("review-given")).toContainText(`Belle soirée ${s}`);
  // Le lien d'une autre personne ne donne rien.
  const ctxA = await context(browser, absent.cookie);
  const pageA = await ctxA.newPage();
  await pageA.goto(link);
  await expect(pageA.getByTestId("avis-invalid")).toBeVisible();
  await ctxA.close();

  // 5. Export : motif obligatoire, fichier marqué, sans la note interne ; tracé au journal d'administration.
  await page.goto(`${base}/apres`);
  const exportButton = page.getByTestId("ae-export-button");
  await expect(exportButton).toBeDisabled();
  await page.getByLabel("Motif de l'export").fill("Demande de la gendarmerie");
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  const path = await download.path();
  const csv = readFileSync(path, "utf8");
  expect(download.suggestedFilename()).toMatch(/^orasso-.*-participants-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain(present.pseudo);
  expect(csv).toContain("motif : Demande de la gendarmerie");
  expect(csv).not.toContain(noteText);
  await expect(page.getByTestId("ae-export-done")).toBeVisible();
  const audit = await apiCall<{ items: { action: string; reason: string | null }[] }>(
    damien,
    "GET",
    "/admin/audit?limit=50",
  );
  expect(
    audit.data.items.some((i) => i.action === "participants.export" && i.reason === "Demande de la gendarmerie"),
  ).toBe(true);

  // 6. La note est visible au tri, jamais du participant.
  await page.goto(`${base}/candidatures?vue=liste`);
  await page
    .getByTestId("triage-row")
    .filter({ hasText: present.pseudo })
    .getByTestId("triage-row-notes")
    .locator("summary")
    .click();
  await expect(page.getByTestId("structure-note")).toContainText(noteText);
  await pageP.goto("/app/acces?vue=passes");
  await expect(pageP.locator("body")).not.toContainText(noteText);
  // L'onglet Prestataires du tri charge aussi les notes (fiche prestataire).
  await page.goto(`${base}/candidatures?onglet=prestataires`);
  await expect(page.getByRole("heading", { name: "Prestataires" })).toBeVisible();

  // 7. Badges des structures (équipe) : à renouveler, suspendues ; la suspension se lève avec un motif.
  await page.goto("/admin/badges");
  await expect(page.getByTestId("badge-row").filter({ hasText: "Écurie du Canigou" })).toContainText("Dans 5 jours");
  await page.goto("/admin/badges?filtre=suspended");
  const tramontane = page.getByTestId("badge-row").filter({ hasText: "Tramontane Auto Club" });
  await expect(tramontane).toContainText("Badge non renouvelé");
  const presTram = await login("pres_tramontane@orasso.local");
  const ctxT = await context(browser, presTram);
  const pageT = await ctxT.newPage();
  await pageT.goto("/orga/tramontane-auto");
  await expect(pageT.getByTestId("orga-suspended")).toContainText("Structure suspendue");
  await tramontane.getByLabel("Motif").fill("Cotisation reçue, badge à renouveler");
  await tramontane.getByRole("button", { name: "Lever la suspension" }).click();
  await expect(page.getByTestId("badges-done")).toBeVisible();
  await expect(page.getByTestId("badge-row").filter({ hasText: "Tramontane Auto Club" })).toHaveCount(0);
  await pageT.goto("/orga/tramontane-auto");
  await expect(pageT.getByTestId("orga-suspended")).toHaveCount(0);
  await ctxT.close();
  // Bandeau « Badge expire dans N jours » de l'Écurie du Canigou.
  const presCanigou = await login("pres_canigou@orasso.local");
  const ctxC = await context(browser, presCanigou);
  const pageC = await ctxC.newPage();
  await pageC.goto("/orga/ecurie-du-canigou");
  await expect(pageC.getByTestId("orga-badge-expiring")).toContainText("expire dans 5 jours");
  await ctxC.close();

  for (const ctx of [ctxD, ctxP]) await ctx.close();

  if (process.env.CAPTURES !== "1") return;
  mkdirSync(DIR, { recursive: true });
  const audits: Record<string, Audit> = {};
  const shots: [string, string, string][] = [
    ["01-apres-evenement", `${base}/apres`, damien],
    ["02-liste-notes", `${base}/candidatures?vue=liste`, damien],
    ["03-admin-badges", "/admin/badges", damien],
    ["04-bandeau-badge", "/orga/ecurie-du-canigou", presCanigou],
    ["05-avis-par-le-lien", link, present.cookie],
  ];
  for (const view of VIEWS) {
    for (const [name, path, cookie] of shots) {
      const ctx = await context(browser, cookie, { width: view.width, height: view.height });
      const p = await ctx.newPage();
      await p.goto(path);
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${DIR}/${name}-sable-${view.id}.png`, fullPage: true });
      audits[`${name}-sable-${view.id}`] = await auditPage(p);
      await ctx.close();
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  for (const [key, a] of Object.entries(audits)) {
    expect(a.buttonsWithoutIcon, key).toEqual([]);
    expect(a.greens, key).toEqual([]);
    expect(a.truncated, key).toEqual([]);
    expect(a.horizontalScroll, key).toBe(false);
    expect(a.primaryButtons, key).toBeLessThanOrEqual(1);
  }
});
