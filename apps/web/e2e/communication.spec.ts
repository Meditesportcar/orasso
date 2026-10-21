import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  login,
  randomPlate,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Communication de l'organisateur (lot 20) sur le site, critère de fin : Damien publie une annonce avec « prévenir les
// inscrits » depuis /orga/meditesportcar/communication, elle apparaît sur la page publique sans compte ; il envoie les
// consignes (visibles sur la carte d'accès du retenu) et un message groupé aux retenus (reçu dans la Boîte, « 1
// destinataire » dans l'historique) ; les discussions du staff s'ouvrent. Avec CAPTURES=1 : onglets de l'espace
// (Sable imposé) et page publique (deux thèmes), au bureau et à 390 px, avec le contrôle du système de design.
// Prérequis : site et API lancés (DEV_SKIP_2FA=true comme le reste de la recette) sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-20-captures/site`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;

async function context(
  browser: Browser,
  cookie: string | null,
  opts: { theme?: string; width?: number; height?: number } = {},
) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: opts.theme ?? "beton", url: WEB }];
  for (const pair of (cookie ?? "").split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

test("communication : annonce publique, consignes, message groupé, discussions du staff", async ({ browser }) => {
  test.setTimeout(300_000);
  const s = unique();
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, { title: `Communication ${s}` });
  const pseudo = `Retenu_${s}`;
  const participant = await signUpApi(pseudo);
  const vehicleId = await addVehicleApi(participant, randomPlate());
  const applicationId = await applyApi(participant, event.id, vehicleId);
  await decideApi(damien, event.id, applicationId, "accept");

  const ctxD = await context(browser, damien, { theme: "beton" });
  const page = await ctxD.newPage();
  const base = "/orga/meditesportcar/communication";

  // 1. Annonce avec « prévenir les inscrits ».
  await page.goto(`${base}?e=${event.id}`);
  await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();
  const announcement = `Musique coupée à 22 h ${s}`;
  await page.getByLabel("Texte de l'annonce").fill(announcement);
  await page.getByText("Prévenir les inscrits (notification)").click();
  await page.getByTestId("publish-announcement").click();
  await expect(page.getByTestId("comm-ok")).toContainText("Annonce publiée");
  await expect(page.getByTestId("orga-feed")).toContainText(announcement);
  // La notification `event_announcement` est vérifiée par les tests de l'API (heure fixée) : ici, le soir, les heures
  // calmes la retiennent jusqu'à 08:00 et le Journal ne la montre pas encore.

  // 2. Page publique, sans compte : le fil montre l'annonce.
  const anon = await context(browser, null);
  const pub = await anon.newPage();
  await pub.goto(`/e/${event.slug}`);
  await expect(pub.getByTestId("event-feed")).toContainText(announcement);

  // 3. Consignes envoyées aux retenus : sur la carte d'accès du retenu.
  const instructions = `Arrivée par l'entrée nord ${s}`;
  await page.getByLabel("Consignes", { exact: true }).fill(instructions);
  await page.getByTestId("send-instructions").click();
  await expect(page.getByTestId("comm-ok")).toContainText("Consignes envoyées");
  const ctxP = await context(browser, participant);
  const pageP = await ctxP.newPage();
  await pageP.goto("/app/acces");
  await expect(pageP.getByTestId("application-instructions")).toContainText(instructions);
  await expect(pageP.getByTestId("application-announcement")).toContainText(announcement);

  // 4. Message groupé aux retenus : nombre de destinataires, envoi en tâche, reçu dans la Boîte.
  await page.goto(`${base}?onglet=messages`);
  await page.getByLabel("Événement").selectOption(event.id);
  await expect(page.getByTestId("group-preview")).toContainText("1 destinataire");
  const body = `Bonjour {{pseudo}}, accueil à 18 h 30 ${s}`;
  await page.getByLabel("Message", { exact: true }).fill(body);
  await page.getByTestId("send-group").click();
  await expect(page.getByTestId("comm-ok")).toContainText("1 destinataire");
  await expect
    .poll(
      async () =>
        (await apiCall<{ items: { title: string }[] }>(participant, "GET", "/me/conversations")).data.items.length,
      { timeout: 30_000 },
    )
    .toBe(1);
  await pageP.goto("/app/boite");
  await pageP.getByTestId("conversation-row").first().click();
  await expect(pageP.getByTestId("messages")).toContainText(`Bonjour ${pseudo}, accueil à 18 h 30 ${s}`);
  await page.goto(`${base}?onglet=messages`);
  await expect(page.getByTestId("group-history").getByTestId("group-stats").first()).toContainText("1 destinataire");

  // 5. Modèles : les modèles Orasso sont proposés en lecture seule.
  await page.goto(`${base}?onglet=modeles`);
  await expect(page.getByTestId("template").filter({ hasText: "Remerciement" })).toContainText("Lecture seule");

  // 6. Messages des participants : la réponse du retenu arrive ici.
  await pageP.getByLabel("Écrire un message…").fill("Merci, à samedi !");
  await pageP.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(pageP.getByTestId("messages")).toContainText("Merci, à samedi !");
  await page.goto(`${base}?onglet=participants`);
  await expect(page.getByTestId("participants")).toContainText(pseudo);

  // 7. Discussions du staff : permanente et par événement (fermeture à J+1 affichée).
  await page.goto(`${base}?onglet=staff`);
  await expect(page.getByTestId("staff-permanent")).toBeVisible();
  await expect(page.getByTestId("staff-events")).toContainText(event.title);
  await expect(page.getByTestId("staff-events")).toContainText("Fermera le");
  await page.getByTestId("staff-permanent").getByRole("link").click();
  await page.waitForURL(/\/communication\/conversation\/[0-9a-f-]{36}$/);
  await page.getByLabel("Écrire un message…").fill(`Briefing à 18 h ${s}`);
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText(`Briefing à 18 h ${s}`);
  for (const ctx of [ctxD, anon, ctxP]) await ctx.close();

  if (process.env.CAPTURES !== "1") return;
  mkdirSync(DIR, { recursive: true });
  const audits: Record<string, Audit> = {};
  const shots: [string, string, string | null][] = [
    ["01-consignes", `${base}?e=${event.id}`, damien],
    ["02-messages", `${base}?onglet=messages`, damien],
    ["03-modeles", `${base}?onglet=modeles`, damien],
    ["04-participants", `${base}?onglet=participants`, damien],
    ["05-staff", `${base}?onglet=staff`, damien],
    ["06-evenement-public", `/e/${event.slug}#fil`, null],
    ["07-acces-retenu", "/app/acces", participant],
  ];
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      for (const [name, path, cookie] of shots) {
        // L'espace organisateur impose le Sable : une seule série suffit.
        if (theme === "beton" && path.startsWith("/orga/")) continue;
        const ctx = await context(browser, cookie, { theme, width: view.width, height: view.height });
        const p = await ctx.newPage();
        await p.goto(path);
        await p.waitForLoadState("networkidle");
        await p.waitForTimeout(600);
        await p.screenshot({ path: `${DIR}/${name}-${theme}-${view.id}.png`, fullPage: true });
        audits[`${name}-${theme}-${view.id}`] = await auditPage(p);
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
    expect(audit.primaryButtons, key).toBeLessThanOrEqual(1);
  }
});
