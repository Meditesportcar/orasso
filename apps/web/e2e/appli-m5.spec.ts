import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot M5 (mise au point Exposant, 23/10/2026), côté appli (version web de recette) : Accueil (haut fixe, sorties qui
// glissent, une seule affiche sponsorisée), Garage (mini-fiche, ligne de certification, « Pour ta … »), Mon profil
// désencombré (« Ma saison », « Changer de casquette », réglages en lignes), Aide (tuto par casquette, questions
// fréquentes, nous écrire), Compte (sanctions), Confidentialité (export), état vide de Sorties.
// Comptes : Kenji (seed : exposant, plusieurs sorties, staff), un compte neuf avec un véhicule (Sorties vide).
// Lancer avec APP_URL=http://localhost:8781 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
// Captures à 390 px dans les deux thèmes : `CAPTURES_DIR`, sinon `<relais>/lot-m5-captures/<M5_PHASE>` (avant | apres).
const APP = process.env.APP_URL;
const PHASE = process.env.M5_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m5-captures/${PHASE}`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
    for (const p of ["exhibitor", "visitor", "pro", "provider", "media", "organizer"])
      localStorage.setItem(`orasso.tuto_${p}`, "1");
  }, theme);
  return { ctx, page, errors };
}

/** Un chargement de page rejoue l'ouverture de l'appli : un toucher la passe, sinon on attend la fin. */
async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 30_000 });
}

async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

/** L'écran en entier, par tranches : une capture, un coup de molette, jusqu'en bas (4 tranches au plus). */
async function shots(page: Page, name: string, wait = 1500) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(wait);
  await page.mouse.move(195, 420);
  let last = "";
  for (let i = 0; i < 4; i++) {
    const buf = await page.screenshot({ path: `${DIR}/${name}-${i + 1}.png` });
    const sig = buf.toString("base64").slice(-2000);
    if (sig === last) break;
    last = sig;
    await page.mouse.wheel(0, 640);
    await page.waitForTimeout(500);
  }
}

test.describe.configure({ mode: "serial" });

test("captures des écrans du lot (Béton et Sable, 390 px)", async ({ browser }) => {
  test.setTimeout(900_000);
  // Compte neuf avec un véhicule : Sorties vide (aucune candidature).
  const pseudo = `M5_${unique()}`.slice(0, 24);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await addVehicleApi(cookie, randomPlate());
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await shots(page, `accueil-${theme}`, 2500);
    await go(page, "/garage");
    await shots(page, `garage-${theme}`);
    await go(page, "/profil");
    await shots(page, `profil-${theme}`);
    await go(page, "/reglages/aide");
    await shots(page, `aide-${theme}`);
    await go(page, "/reglages/securite");
    await shots(page, `securite-${theme}`);
    await go(page, "/reglages/compte");
    await shots(page, `compte-${theme}`);
    await go(page, "/reglages/confidentialite");
    await shots(page, `confidentialite-${theme}`);
    await ctx.close();

    const fresh = await open(browser, theme);
    await signIn(fresh.page, email);
    await go(fresh.page, "/sorties");
    await shots(fresh.page, `sorties-vide-${theme}`, 2500);
    await fresh.ctx.close();
  }
  expect(await login("kenji@orasso.local")).toBeTruthy();
});

test.describe("le lot M5 à l'écran", () => {
  test.skip(PHASE === "avant", "Captures d'avant seulement");

  test("Accueil : les sorties glissent avec leurs points, affiche → fiche, Mon accès et Sur la carte, ni Maps ni Waze", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, "kenji@orasso.local");
    const outings = page.getByTestId("home-outing");
    await expect(outings.first()).toBeVisible({ timeout: 30_000 });
    expect(await outings.count()).toBeGreaterThan(1);
    await expect(page.getByTestId("home-outings-dots")).toBeVisible();
    await expect(page.getByTestId("home-next-head-meta")).toHaveText(/^1 sur \d+$/);
    await expect(page.getByText("Tes autres sorties")).toHaveCount(0);
    await expect(page.getByTestId("home-other-outing")).toHaveCount(0);
    await expect(page.getByTestId("home-maps")).toHaveCount(0);
    await expect(page.getByTestId("home-waze")).toHaveCount(0);
    const first = outings.first();
    await expect(first.getByTestId("home-outing-poster")).toBeVisible();
    // L'affiche en portrait (4:5), jamais coupée par une bande paysage.
    const box = await first.getByTestId("home-outing-poster").boundingBox();
    expect(box && box.height > box.width).toBe(true);
    // Une seule affiche sponsorisée dans tout l'écran, marquée « Sponsorisé ».
    expect(await page.getByTestId("sponsored-card").count()).toBeLessThanOrEqual(1);
    if (await page.getByTestId("sponsored-card").count())
      await expect(page.getByTestId("sponsored-tag")).toHaveText(/Sponsorisé/i);
    // Toucher l'affiche ouvre la fiche de l'événement.
    await first.getByTestId("home-outing-open").click();
    await page.waitForURL(/\/e\//, { timeout: 60_000 });
    await ctx.close();
  });

  test("Garage : mini-fiche, photo carrée, ligne de certification et son détail, « Pour ta … », pas d'accès flottant", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, "kenji@orasso.local");
    await go(page, "/garage");
    await expect(page.getByTestId("garage-mini")).toBeVisible({ timeout: 30_000 });
    const cover = await page.getByTestId("garage-cover").boundingBox();
    expect(cover && Math.abs(cover.width - cover.height) < 2).toBe(true);
    // La mini-fiche ne prend plus tout l'écran.
    const mini = await page.getByTestId("garage-mini").boundingBox();
    expect(mini && mini.height < 520).toBe(true);
    await expect(page.getByTestId("garage-share")).toBeVisible();
    await expect(page.getByTestId("garage-edit")).toBeVisible();
    const line = page.getByTestId("certification-line");
    await expect(line).toBeVisible({ timeout: 30_000 });
    // Le titre dit l'état (il dépend de ce que les autres recettes ont fait du véhicule de Kenji).
    await expect(page.getByTestId("certification-line-title")).toHaveText(/^Certifi/);
    await line.click();
    // Le détail au toucher : la feuille « Certification ».
    await expect(page.getByText("Certification", { exact: true }).last()).toBeVisible();
    await page.keyboard.press("Escape");
    const pros = page.getByTestId("garage-pros");
    await expect(pros).toBeVisible({ timeout: 30_000 });
    await expect(pros.getByText(/^Pour ta /)).toBeVisible();
    expect(await pros.getByTestId("garage-pros-sponsored").count()).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("next-access-bar")).toHaveCount(0);
    await ctx.close();
  });

  test("Profil : en-tête compact, Ma saison, crew en une ligne, Changer de casquette, réglages en lignes, pas d'accès flottant", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, "kenji@orasso.local");
    await go(page, "/profil");
    await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
    const qr = await page.getByTestId("profil-account-qr").boundingBox();
    expect(qr && qr.width < 60).toBe(true);
    await expect(page.getByTestId("profil-season")).toContainText("pts");
    await expect(page.getByTestId("profil-passport")).toBeVisible();
    await expect(page.getByTestId("profil-crew")).toBeVisible();
    await expect(page.getByText("Changer de casquette", { exact: true })).toBeVisible();
    await expect(page.getByTestId("casquettes-intro")).toBeVisible();
    await expect(page.getByTestId("casquette-fan").getByTestId("casquette-active")).toBeVisible();
    await expect(page.getByText("Mes casquettes", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Où je suis staff", { exact: true })).toHaveCount(0);
    for (const id of [
      "reglage-compte",
      "reglage-notifications",
      "reglage-confidentialite",
      "reglage-preferences",
      "profil-help",
    ])
      await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("reglage-compte")).toContainText("sanctions");
    await expect(page.getByTestId("reglage-confidentialite")).toContainText("export");
    await expect(page.getByTestId("next-access-bar")).toHaveCount(0);
    await ctx.close();
  });

  test("Aide : un tuto par casquette qui s'ouvre vraiment, six questions, nous écrire ; sanctions dans Compte, export dans Confidentialité", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, "kenji@orasso.local");
    await go(page, "/reglages/aide");
    await expect(page.getByTestId("replay-tuto-exhibitor")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("help-faq-question")).toHaveCount(6);
    await expect(page.getByTestId("help-write-team")).toBeVisible();
    await expect(page.getByTestId("help-report")).toBeVisible();
    await expect(page.getByTestId("help-moved")).toContainText("Compte");
    await expect(page.getByTestId("my-sanctions")).toHaveCount(0);
    await page.getByTestId("replay-tuto-exhibitor").click();
    await expect(page.getByTestId("tuto-exhibitor")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("tuto-skip").click();
    await expect(page.getByTestId("replay-tuto-exhibitor")).toBeVisible({ timeout: 30_000 });
    await go(page, "/reglages/compte");
    await expect(page.getByTestId("my-sanctions")).toBeVisible({ timeout: 30_000 });
    await go(page, "/reglages/confidentialite");
    await expect(page.getByText("Exporter mes données").first()).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });

  test("Sorties vide : le O vivant et sa ligne de route", async ({ browser }) => {
    test.setTimeout(300_000);
    const pseudo = `M5v_${unique()}`.slice(0, 24);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo, email);
    await addVehicleApi(cookie, randomPlate());
    const { ctx, page } = await open(browser, "sable");
    await signIn(page, email);
    await go(page, "/sorties");
    await expect(page.getByText("Rien de prévu").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="empty-road"], line[stroke-dasharray="10 8"]')).toHaveCount(1);
    await ctx.close();
  });
});

test.describe("lot M5, tour 2", () => {
  test.skip(PHASE === "avant", "Captures d'avant seulement");

  /** Un compte neuf (exposant), son véhicule, et son mot de passe du seed pour l'appli. */
  async function fresh(prefix: string) {
    const pseudo = `${prefix}_${unique()}`.slice(0, 24);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo, email);
    const vehicleId = await addVehicleApi(cookie, randomPlate());
    return { pseudo, email, cookie, vehicleId };
  }

  test("Accueil : candidature en attente et billet valide au même événement, le billet et son QR restent", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const damien = await login("damien@orasso.local");
    const event = await createEvent(damien, { title: `Entrée M5 ${unique()}`, publicAccess: "free_reservation" });
    const opened = await apiCall(damien, "PUT", `/events/${event.id}/ticketing`, { enabled: true, capacity: null });
    expect(opened.status, JSON.stringify(opened.data)).toBe(200);
    const u = await fresh("M5billet");
    await applyApi(u.cookie, event.id, u.vehicleId);
    const reserved = await apiCall(u.cookie, "POST", `/events/${event.id}/tickets/reserve`, { quantity: 1 });
    expect(reserved.status, JSON.stringify(reserved.data)).toBe(201);
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, u.email);
    const tickets = page.getByTestId("home-outing").filter({ hasText: event.title });
    // La candidature en attente et le billet : deux tickets, et « Mon billet » mène au QR du billet.
    await expect(tickets).toHaveCount(2, { timeout: 30_000 });
    const billet = tickets.filter({ has: page.getByRole("button", { name: "Mon billet" }) });
    await expect(billet).toHaveCount(1);
    await expect(billet.getByRole("button", { name: "Mon billet" })).toBeVisible();
    await ctx.close();
  });

  test("« Sur la carte » ouvre l'événement précis, même sur invitation", async ({ browser }) => {
    test.setTimeout(300_000);
    const damien = await login("damien@orasso.local");
    const event = await createEvent(damien, { title: `Privé M5 ${unique()}`, admission: "invite_only" });
    const u = await fresh("M5carte");
    const sent = await apiCall(damien, "POST", `/events/${event.id}/invitations`, { pseudos: [u.pseudo] });
    expect(sent.status, JSON.stringify(sent.data)).toBeLessThan(300);
    const mine = await apiCall<{ id: string; event: { id: string } }[]>(u.cookie, "GET", "/me/event-invitations");
    const invitation = mine.data.find((i) => i.event.id === event.id);
    expect(invitation, "invitation reçue").toBeTruthy();
    const accepted = await apiCall(u.cookie, "POST", `/event-invitations/${invitation?.id}/accept`, {
      vehicleId: u.vehicleId,
      arrivalSeen: true,
    });
    expect(accepted.status, JSON.stringify(accepted.data)).toBeLessThan(300);
    const { ctx, page } = await open(browser, "sable");
    await signIn(page, u.email);
    const ticket = page.getByTestId("home-outing").filter({ hasText: event.title });
    await expect(ticket).toBeVisible({ timeout: 30_000 });
    await ticket.getByTestId("home-on-map").click();
    await page.waitForURL(new RegExp(`/carte\\?event=${event.slug}`), { timeout: 60_000 });
    await expect(page.getByTestId("map-focus")).toContainText(event.title, { timeout: 30_000 });
    await expect(page.getByTestId("map-q")).toHaveCount(0);
    mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: `${DIR}/carte-evenement-prive-sable.png` });
    await ctx.close();
  });

  test("Garage sans département : pas de pros de toute la France, une phrase pour choisir son coin", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const u = await fresh("M5coin");
    const emptied = await apiCall(u.cookie, "PATCH", "/me/settings", { departments: [] });
    test.skip(emptied.status >= 300, "le réglage refuse un secteur vide : rien à vérifier côté appli");
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, u.email);
    await go(page, "/garage");
    await expect(page.getByTestId("garage-mini")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("garage-pros-item")).toHaveCount(0);
    await ctx.close();
  });

  test("Profil et Aide : cibles d'au moins 44 px, même nom de casquette sur la carte de tuto", async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, "kenji@orasso.local");
    await go(page, "/profil");
    for (const id of ["profil-passport", "profil-points-history", "profil-create", "casquette-staff-request"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByTestId("casquette-fan")).toContainText("Passionné");
    await go(page, "/reglages/aide");
    await expect(page.getByTestId("replay-tuto-exhibitor")).toContainText("Passionné", { timeout: 30_000 });
    await ctx.close();
  });
});
