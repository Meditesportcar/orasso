import { mkdirSync } from "node:fs";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, SIGNUP_EXTRAS } from "./helpers";

// Appli dans le navigateur (lot 22) : casquette Organisateur. Damien bascule vers MéditeSportCar : le Direct du « Salon
// Argelès » monte en direct quand Julie (mode staff, autre onglet) scanne un QR ; page événement (Incertain → bandeau et
// fil, annonce) ; Boîte (message groupé aux retenus) ; Staff (relance, passage en mode staff) ; création d'une structure.
// Lancer avec APP_URL=http://localhost:<relais> (Metro derrière apps/mobile/scripts/web-isolated.mjs, EXPO_PUBLIC_API_URL,
// EXPO_PUBLIC_SITE_URL et CORS_ORIGINS posés). Captures dans les deux thèmes.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-22-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";

async function openApp(browser: import("@playwright/test").Browser, email: string, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((th) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", th);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function chooseOrganizer(page: Page, name: string) {
  await page.goto("/moi"); // Lot 40 : les casquettes sont dans Mon profil (plus d'avatar en haut).
  await page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

/** Nombre qui précède un libellé dans le bloc des compteurs (« 12 Arrivés »). */
async function counterOf(page: Page, label: string): Promise<number> {
  const text = await page.getByTestId("orga-direct-counters").innerText();
  const m = new RegExp(`(\\d+)\\s*${label}`, "i").exec(text);
  return m ? Number(m[1]) : Number.NaN;
}

async function pickOption(page: Page, label: string, option: RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("menuitem", { name: option }).first().click();
}

test("casquette Organisateur : Direct en direct, Événements, Boîte, Staff", async ({ browser }) => {
  test.setTimeout(480_000);
  mkdirSync(DIR, { recursive: true });
  const shot = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png` });

  const damien = await login("damien@orasso.local");
  const julie = await login("julie@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(damien, "GET", "/me");
  const structure = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("MéditeSportCar"));
  expect(structure).toBeTruthy();
  const events = await apiCall<{ id: string; title: string }[]>(damien, "GET", `/structures/${structure?.id}/events`);
  const salon = events.data.find((e) => e.title === "Salon Argelès");
  const nocturne = events.data.find((e) => e.title.includes("Nocturne de Canet"));
  expect(salon && nocturne).toBeTruthy();
  // Une recette interrompue a pu laisser le Salon en Incertain : on repart du seed (Maintenu).
  await apiCall(damien, "PATCH", `/events/${salon?.id}/outlook`, { outlook: "maintained" });

  // Un pilote retenu et pas encore entré : son QR, lu comme le ferait son téléphone.
  const list = await apiCall<{ applicationId: string; pseudo: string; checkedInAt: string | null }[]>(
    damien,
    "GET",
    `/events/${salon?.id}/checkins`,
  );
  let payload = "";
  for (const item of list.data.filter((i) => !i.checkedInAt && /^Pilote_\d+$/.test(i.pseudo))) {
    const cookie = await login(`pilote${Number(item.pseudo.split("_")[1])}@orasso.local`).catch(() => null);
    if (!cookie) continue;
    const pass = await apiCall<{ payload: string | null }>(cookie, "GET", `/applications/${item.applicationId}/pass`);
    if (pass.status === 200 && pass.data.payload) {
      payload = pass.data.payload;
      break;
    }
  }
  expect(payload).not.toBe("");

  // --- Damien : casquette Organisateur, Direct --------------------------------------------------------------------
  const a = await openApp(browser, "damien@orasso.local", "beton");
  const page = a.page;
  await chooseOrganizer(page, "MéditeSportCar");
  await expect(page.getByTestId("orga-direct-event")).toContainText("Salon Argelès", { timeout: 30_000 });
  await expect(page.getByTestId("orga-direct-counters")).toBeVisible({ timeout: 30_000 });
  const before = await counterOf(page, "arrivés");
  expect(before).not.toBeNaN();
  await shot(page, "01-direct-beton");

  // --- Julie : mode staff dans un autre onglet, un scan arrive ---------------------------------------------------
  const b = await openApp(browser, "julie@orasso.local", "sable");
  await b.page.goto(`/staff/${salon?.id}`);
  await b.page.getByRole("button", { name: "Synchroniser la liste" }).click();
  await expect(b.page.getByTestId("staff-tile-scan")).toBeVisible({ timeout: 30_000 });
  await b.page.getByTestId("staff-tile-scan").click();
  await b.page.waitForTimeout(1500);
  await b.page.evaluate((p) => {
    (globalThis as unknown as { __orassoScan: (x: string) => void }).__orassoScan(p);
  }, payload);
  await b.page.waitForTimeout(2500);
  await b.ctx.close();

  // Le Direct de Damien le montre sans qu'il touche à rien (canal en direct ; à défaut, le rechargement de 60 s).
  await expect.poll(() => counterOf(page, "arrivés"), { timeout: 90_000, intervals: [2_000] }).toBe(before + 1);
  await shot(page, "02-direct-scan-recu-beton");

  // --- Événements -------------------------------------------------------------------------------------------------
  await tab(page, "Événements").click();
  await expect(page.getByTestId("orga-event-row").first()).toBeVisible({ timeout: 20_000 });
  await shot(page, "03-evenements-beton");
  await page.getByTestId("orga-event-row").filter({ hasText: "Salon Argelès" }).click();
  await expect(page.getByTestId("orga-event-head")).toContainText("Salon Argelès", { timeout: 20_000 });
  await shot(page, "04-evenement-beton");

  // Passage en Incertain : confirmation, bandeau et entrée du fil.
  await page.getByTestId("orga-outlook-toggle").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("orga-outlook-banner")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("orga-feed")).toContainText("Incertain", { timeout: 20_000 });
  await shot(page, "05-evenement-incertain-beton");

  // Annonce avec « Prévenir ».
  await page.getByTestId("orga-announcement-new").click();
  const announcement = `Parking B ouvert dès 7 h ${Date.now()}`;
  await page.getByTestId("orga-announcement-body").fill(announcement);
  await shot(page, "06-annonce-feuille-beton");
  await page.getByTestId("orga-announcement-publish").click();
  await expect(page.getByTestId("orga-feed")).toContainText(announcement, { timeout: 20_000 });

  // --- Boîte : message groupé aux retenus ------------------------------------------------------------------------
  await page.getByRole("button", { name: "Boîte", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /Participants/ })).toBeVisible({ timeout: 20_000 });
  await shot(page, "07-boite-participants-beton");
  await page.getByRole("button", { name: "Groupés" }).click();
  await page.getByTestId("orga-group-new").click();
  await pickOption(page, "Événement", /Salon Argelès/);
  await pickOption(page, "Destinataires", /Retenus/);
  const text = `Rendez-vous à l'entrée B ${Date.now()}`;
  await page.getByTestId("orga-group-body").fill(text);
  await expect(page.getByTestId("orga-group-preview")).toContainText(/destinataire/, { timeout: 20_000 });
  await shot(page, "08-message-groupe-feuille-beton");
  await page.getByTestId("orga-group-send").click();
  await expect(page.getByTestId("orga-group-row").first()).toContainText(text, { timeout: 30_000 });
  await shot(page, "09-boite-groupes-beton");
  await page.getByRole("button", { name: /Staff/ }).click();
  await expect(page.getByTestId("orga-staff-chat").first()).toBeVisible({ timeout: 20_000 });
  await shot(page, "10-boite-staff-beton");

  // --- Staff : relance d'un membre sans réponse, puis mode staff ------------------------------------------------
  // Lot 40 : la Boîte est hors de la barre d'onglets ; ✕ ramène aux onglets.
  await page.getByRole("button", { name: "Fermer" }).first().click();
  await tab(page, "Équipe").click();
  await pickOption(page, "Événement", /Nocturne de Canet/);
  // Lot 52 : l'équipe en bulles ; un toucher ouvre la feuille du membre, qui propose « Relancer » (sans réponse, pas le jour J).
  await expect(page.getByTestId("team-bubble").first()).toBeVisible({ timeout: 20_000 });
  await shot(page, "11-staff-beton");
  await page
    .getByRole("button", { name: /^Hugo_66, / })
    .first()
    .click();
  const remind = page.getByTestId("orga-staff-remind");
  await expect(remind).toBeVisible({ timeout: 20_000 });
  // Recette rejouée le même jour : l'API refuse une seconde relance (le bouton reste allumé côté appli).
  await remind.click();
  await expect(page.getByText("Relance envoyée.").or(page.getByText(/déjà été relancée aujourd'hui/))).toBeVisible({
    timeout: 20_000,
  });
  await shot(page, "12-staff-relance-beton");

  await tab(page, "Direct").click();
  await page.getByTestId("orga-direct-staff-mode").click();
  await page.waitForURL(new RegExp(`/staff/${salon?.id}`), { timeout: 20_000 });
  await expect(page.getByText("Mode staff", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Synchroniser la liste" })).toBeVisible({ timeout: 20_000 });
  // Pas de réponse « Je suis là » pour un organisateur (il n'est pas dans le staff de l'événement).
  await expect(page.getByRole("button", { name: "Je suis là" })).toHaveCount(0);
  await shot(page, "13-mode-staff-organisateur-sable");

  // Le staff simple n'a pas accès aux routes de l'organisateur (rien d'une autre structure : refus de l'API).
  const refused = await apiCall(julie, "GET", `/structures/${structure?.id}/group-messages`);
  expect(refused.status).toBe(403);

  // --- Même parcours de lecture dans le thème Sable --------------------------------------------------------------
  await a.ctx.close();
  const s = await openApp(browser, "damien@orasso.local", "sable");
  await chooseOrganizer(s.page, "MéditeSportCar");
  await expect(s.page.getByTestId("orga-direct-event")).toBeVisible({ timeout: 30_000 });
  await shot(s.page, "20-direct-sable");
  await tab(s.page, "Événements").click();
  await expect(s.page.getByTestId("orga-event-row").first()).toBeVisible({ timeout: 20_000 });
  await shot(s.page, "21-evenements-sable");
  await s.page.getByTestId("orga-event-row").filter({ hasText: "Salon Argelès" }).click();
  await expect(s.page.getByTestId("orga-outlook-banner")).toBeVisible({ timeout: 20_000 });
  await shot(s.page, "22-evenement-sable");
  await s.page.getByRole("button", { name: "Boîte", exact: true }).first().click();
  await expect(s.page.getByRole("button", { name: /Participants/ })).toBeVisible({ timeout: 20_000 });
  await shot(s.page, "23-boite-sable");
  await s.page.getByRole("button", { name: "Fermer" }).first().click();
  await tab(s.page, "Équipe").click();
  await expect(s.page.getByTestId("team-bubble").first()).toBeVisible({ timeout: 20_000 });
  await shot(s.page, "24-staff-sable");
  await tab(s.page, "Tri").click();
  await shot(s.page, "25-tri-attente-sable");
  await s.ctx.close();

  // Remise en état du seed : le Salon redevient Maintenu.
  const back = await apiCall(damien, "PATCH", `/events/${salon?.id}/outlook`, { outlook: "maintained" });
  expect(back.status).toBe(200);
});

test("créer une structure depuis Mes casquettes, sans casquette organisateur aucun écran de l'espace", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const email = `orga-${Date.now()}@orasso.test`;
  const signUp = await apiCall<{ user: { id: string } }>(null, "POST", "/auth/sign-up/email", {
    email,
    password: SEED_PASSWORD,
    name: "Orga Test",
    termsAccepted: true,
    ...SIGNUP_EXTRAS,
  });
  expect(signUp.status).toBe(200);
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });

  // Sans casquette Organisateur, l'URL de l'espace ramène au passionné.
  await page.goto("/direct");
  await page.waitForURL(/accueil/, { timeout: 20_000 });

  await page.goto("/moi"); // Lot 40 : les casquettes sont dans Mon profil (plus d'avatar en haut).
  await page.getByTestId("profil-create").click(); // Lot 40 : un seul bouton « Créer », puis la feuille.
  await page.getByTestId("casquette-create-organizer").click();
  await page.waitForURL(/structure\/nouvelle/, { timeout: 20_000 });
  await page.getByTestId("orga-create-name").fill(`Club Test ${Date.now()}`);
  await page.screenshot({ path: `${DIR}/30-creer-structure-beton.png` });
  await page.getByTestId("orga-create-submit").click();
  await expect(page.getByTestId("orga-created")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("orga-created-verify")).toBeVisible();
  await page.screenshot({ path: `${DIR}/31-structure-creee-beton.png` });
  await page.getByTestId("orga-created-open").click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
  await expect(page.getByText("Aucun événement publié à suivre", { exact: false })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${DIR}/32-direct-vide-beton.png` });
  await ctx.close();
});

test("organisateur sans 2FA : écran « Double authentification requise » à la place de chaque onglet", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  // Seulement quand l'API applique la règle (DEV_SKIP_2FA=false) : les comptes du seed n'ont pas de 2FA.
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(damien, "GET", "/me");
  const structure = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("MéditeSportCar"));
  const probe = await apiCall(damien, "GET", `/structures/${structure?.id}/inbox/summary`);
  test.skip(probe.status !== 403, "L'API laisse passer la 2FA (DEV_SKIP_2FA=true) : relancer avec DEV_SKIP_2FA=false");

  const { ctx, page } = await openApp(browser, "damien@orasso.local", "sable");
  await chooseOrganizer(page, "MéditeSportCar");
  await expect(page.getByTestId("orga-two-factor")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("orga-direct-event")).toHaveCount(0);
  await page.screenshot({ path: `${DIR}/40-garde-2fa-direct-sable.png` });
  for (const name of ["Événements", "Boîte", "Staff"]) {
    await tab(page, name).click();
    await expect(page.getByTestId("orga-two-factor").last()).toBeVisible({ timeout: 20_000 });
  }
  await page.screenshot({ path: `${DIR}/41-garde-2fa-staff-sable.png` });
  await ctx.close();
});
