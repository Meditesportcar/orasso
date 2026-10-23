import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  decideApi,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { auditApp, createEventIn } from "./helpers/lot43";
import { RELAIS } from "./relais";

// Lot 43, côté appli (version web de recette) : Sorties en tickets, Accueil par profil (exposant, visiteur, pro,
// prestataire, média), accès flottant dès J-7. Comptes du seed : Kenji (exposant : un ticket par statut, retenue, en
// attente, liste d'attente, place libérée, passées, mission staff), Paul (visiteur : un billet gratuit), garage@ (pro),
// Sofia (prestataire, emplacement B2), Léo (média accrédité). Captures à 390 px dans les deux thèmes.
// Lancer avec APP_URL=http://localhost:8281 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-43-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  // Poste chargé (plusieurs agents, Metro à froid) : des délais larges pour les chargements de page.
  page.setDefaultNavigationTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
    // Les tuiles « Nouveau » (tuto) ne sont pas l'objet de cette recette : déjà vues.
    for (const p of ["exhibitor", "visitor", "pro", "provider", "media"]) localStorage.setItem(`orasso.tuto_${p}`, "1");
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

/** Passe à une casquette depuis Mon profil. */
async function choose(page: Page, kind: "pro" | "provider" | "media") {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId(`casquette-${kind}`).first().click();
  // Chaque casquette s'ouvre sur son Accueil (lot 43).
  await page.waitForURL(/\/accueil/, { timeout: 60_000 });
}

/** Fait défiler la zone qui défile de l'écran (la plus haute) jusqu'en bas. */
async function scrollToBottom(page: Page) {
  // Molette sur l'écran : la zone qui défile suit, comme au doigt.
  await page.mouse.move(195, 420);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 2500);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Règles du système de design à l'écran : un seul néon, un seul bouton principal, pas de vert, pas de défilement horizontal. */
async function checkRules(page: Page, theme: Theme) {
  // Le temps que l'écran précédent finisse de se retirer (transition entre onglets).
  await page.waitForTimeout(1200);
  const audit = await auditApp(page, theme);
  expect(audit.primaryButtons, `un seul bouton principal : ${audit.primaryLabels.join(" | ")}`).toBeLessThanOrEqual(1);
  expect(audit.neon, `un seul néon hors barres : ${audit.neonLabels.join(" | ")}`).toBeLessThanOrEqual(1);
  expect(audit.buttonsWithoutIcon, "tout bouton porte une icône").toEqual([]);
  expect(audit.greens).toEqual([]);
  expect(audit.horizontalScroll).toBe(false);
  expect(audit.unoutlinedOnPhoto, "texte sur l'affiche en contour").toEqual([]);
}

test("Sorties de Kenji : trois segments, un ticket par statut (deux thèmes)", async ({ browser }) => {
  test.setTimeout(480_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    const { ctx, page, errors } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await page.getByRole("tab", { name: "Sorties", exact: true }).click();
    await expect(page).toHaveURL(/\/sorties/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Mes sorties", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Saison \d{4}$/)).toBeVisible();

    // Les trois segments, avec leur compte.
    const segments = page.getByTestId("sorties-segments");
    await expect(segments.getByText(/^À venir · \d+$/)).toBeVisible();
    await expect(segments.getByText(/^Staff · \d+$/)).toBeVisible();
    await expect(segments.getByText(/^Passées · \d+$/)).toBeVisible();

    // À venir : retenue (Mon QR), en attente (« En attente de la réponse de … »), liste d'attente (délai), place libérée.
    const tickets = page.getByTestId("ticket-application");
    await expect(tickets.first()).toBeVisible({ timeout: 30_000 });
    expect(await tickets.count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByText("Retenue", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("ticket-qr").first()).toContainText("Mon QR");
    await expect(page.getByText(/^En attente de la réponse de /).first()).toBeVisible();
    await expect(page.getByText(/Si une place se libère, tu as 24 h pour l'accepter/).first()).toBeVisible();
    await expect(page.getByText("J'accepte la place", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer", exact: true }).first()).toBeVisible();
    // La souche : le jour de la semaine, le quantième et le mois.
    await expect(tickets.first().getByText(/^(Dim|Lun|Mar|Mer|Jeu|Ven|Sam)\.$/)).toBeVisible(); // Lot C2a : « Sam. » (artefact)
    await expect(
      page.getByText("Empêché ? Retire-toi depuis le ticket : ta place part à la liste d'attente."),
    ).toBeVisible();
    await shot(page, `sorties-a-venir-${theme}`);
    // Un seul bouton principal : la place libérée à accepter (elle expire) ; « Mon QR » et « Mon billet » passent en second.
    await checkRules(page, theme);
    await expect(page.getByTestId("ticket-qr").first()).toBeVisible();

    // Staff : la mission, « Je serai là », le rôle donné par la structure.
    await segments.getByText(/^Staff · \d+$/).click();
    await expect(page.getByTestId("ticket-staff").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Rôle donné par .+ pour cet événement$/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Je serai là" }).first()).toBeVisible();
    await expect(page.getByText(/Le mode staff s'ouvre la veille/).first()).toBeVisible();
    await checkRules(page, theme);
    await shot(page, `sorties-staff-${theme}`);

    // Passées : pointé, points, avis.
    await segments.getByText(/^Passées · \d+$/).click();
    await expect(page.getByTestId("ticket-past").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Pointé/).first()).toBeVisible();
    await checkRules(page, theme);
    await shot(page, `sorties-passees-${theme}`);

    expect(
      errors.filter((e) => !/favicon|WebSocket|ws:\/\/|DevTools|Sentry|expo-notifications|push|401/i.test(e)),
    ).toEqual([]);
    await ctx.close();
  }
});

test("Sorties : un billet gratuit (visiteur) se montre et se rend ; vide = le O vivant", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "paul.photo@orasso.local");
    await page.getByRole("tab", { name: "Sorties", exact: true }).click();
    await expect(page).toHaveURL(/\/sorties/, { timeout: 30_000 });
    const ticket = page.getByTestId("ticket-public").first();
    await expect(ticket).toBeVisible({ timeout: 30_000 });
    await expect(ticket.getByText("Billet", { exact: true })).toBeVisible();
    await expect(page.getByTestId("my-tickets")).toContainText("Mon billet");
    await expect(page.getByText("Un empêchement ? Rends ton billet depuis le ticket")).toBeVisible();
    // Pas de segment Staff pour un visiteur.
    await expect(page.getByTestId("sorties-segments").getByText(/^Staff/)).toHaveCount(0);
    await shot(page, `sorties-visiteur-${theme}`);
    // Lot C2a : « Mon billet » ouvre la variante visiteur de `s-qr` (Entrée · Public), plus la liste `/billets`.
    await page.getByTestId("my-tickets").first().click();
    await expect(page).toHaveURL(/\/billet\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByTestId("qr-holder-value")).toHaveText("Public", { timeout: 30_000 });
    await shot(page, `billet-visiteur-${theme}`);
    await ctx.close();
  }
  // Un compte neuf : rien de prévu, l'état vide du O vivant et un seul bouton principal.
  const cookie = await signUpApi(`Vide_${unique()}`.slice(0, 24));
  expect(cookie).toBeTruthy();
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, `${(await apiCall<{ user: { email: string } }>(cookie, "GET", "/me")).data.user.email}`);
  await page.getByRole("tab", { name: "Sorties", exact: true }).click();
  await expect(page.getByText("Rien de prévu", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Explorer les événements" })).toBeVisible();
  await shot(page, "sorties-vide-beton");
  await ctx.close();
});

const HOMES = [
  {
    kind: "exhibitor",
    email: "kenji@orasso.local",
    choose: null,
    // Lot M5 : « Ta prochaine sortie » (tickets qui glissent) remplace la carte et « Tes autres sorties ».
    texts: [/^Salut Kenji$/i, "Ta prochaine sortie", "Mon accès", "Passeport Orasso"],
    hero: "ticket",
  },
  {
    kind: "visitor",
    email: "paul.photo@orasso.local",
    choose: null,
    texts: [/^Salut /i, "Mon billet", "Billet"],
    hero: "ticket",
  },
  {
    kind: "pro",
    email: "garage@orasso.local",
    choose: "pro",
    texts: [
      "Remises cette semaine",
      "Vues de ta fiche",
      "Scanner un QR de compte",
      "Événements près de l'atelier",
      "Passionnés du coin",
      "Derniers scans",
    ],
    hero: null,
  },
  {
    kind: "provider",
    email: "sofia@orasso.local",
    choose: "provider",
    texts: ["Mon accès prestataire", "Emplacement B2", "Message de l'organisateur", "Missions qui t'attendent"],
    hero: "poster",
  },
  {
    kind: "media",
    email: "leo@orasso.local",
    choose: "media",
    texts: ["Accréditée", "Badge presse", "Mon badge presse", "Consignes de l'organisation"],
    hero: "poster",
  },
] as const;

for (const home of HOMES) {
  test(`Accueil ${home.kind} (deux thèmes)`, async ({ browser }) => {
    test.setTimeout(300_000);
    mkdirSync(DIR, { recursive: true });
    for (const theme of THEMES) {
      const { ctx, page, errors } = await open(browser, theme);
      await signIn(page, home.email);
      if (home.choose) {
        await choose(page, home.choose);
      }
      await expect(page.getByTestId("home-greeting")).toBeVisible({ timeout: 30_000 });
      // Lot C1 (artefact DA v2) : plus de grand titre « Accueil », la salutation en tient lieu.
      await expect(page.getByRole("heading", { name: "Accueil", exact: true })).toHaveCount(0);
      for (const text of home.texts) {
        await expect(page.getByText(text).first(), `« ${String(text)} »`).toBeVisible({ timeout: 30_000 });
      }
      if (home.hero === "ticket") {
        // Lot M5 (maquette 6.1) : le ticket de la prochaine sortie, affiche en portrait, « Sur la carte » à côté du
        // geste ; ni Maps ni Waze (correction de Damien).
        await expect(page.getByTestId("home-outing").first()).toBeVisible();
        await expect(page.getByTestId("home-countdown").first()).toContainText(/J-\d+|Demain|Aujourd'hui|J\+\d+/);
        await expect(page.getByTestId("home-on-map").first()).toBeVisible();
        await expect(page.getByTestId("home-maps")).toHaveCount(0);
        await expect(page.getByTestId("home-waze")).toHaveCount(0);
      }
      if (home.hero === "poster") {
        // Le compte à rebours et l'heure sont cernés sur la photo (huit copies + le texte), en haut à droite (lot C1).
        await expect(page.getByTestId("home-hero-art")).toBeVisible();
        await expect(page.getByTestId("home-countdown")).toContainText(/J-\d+|Demain|Aujourd'hui|J\+\d+/);
        await expect(page.getByTestId("home-hour")).toContainText(/· (ouverture|installation)/);
        await expect(page.getByTestId("home-hero").getByText("Structure validée · organisateur")).toBeVisible();
        for (const label of ["Maps", "Waze", "Sur la carte"]) {
          await expect(page.getByTestId("home-hero").getByRole("button", { name: label })).toBeVisible();
        }
      }
      await checkRules(page, theme);
      await shot(page, `accueil-${home.kind}-${theme}`);
      // Bas de l'écran.
      await scrollToBottom(page);
      await shot(page, `accueil-${home.kind}-bas-${theme}`);
      expect(
        errors.filter((e) => !/favicon|WebSocket|ws:\/\/|DevTools|Sentry|expo-notifications|push|401/i.test(e)),
      ).toEqual([]);
      await ctx.close();
    }
  });
}

test("accès flottant : visible dès J-7 sur Explorer, jamais sur Accueil, Sorties, Garage ni Profil, vers le jour J", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const make = async (days: number, label: string) => {
    const s = unique();
    const cookie = await signUpApi(`${label}_${s}`.slice(0, 24));
    const event = await createEventIn(damien, days, `Accès ${label} ${s}`);
    const applicationId = await applyApi(cookie, event.id, await addVehicleApi(cookie, randomPlate()));
    await decideApi(damien, event.id, applicationId, "accept");
    const me = await apiCall<{ user: { email: string } }>(cookie, "GET", "/me");
    return { email: me.data.user.email, event, applicationId };
  };
  const near = await make(6, "SixJours");
  const far = await make(9, "NeufJours");

  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, near.email);
    // Explorer : la barre est là (une fois, au-dessus de la barre d'onglets). Lot M5 : plus au Garage ni au Profil.
    for (const [tab, route] of [["Explorer", /\/explorer/]] as const) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(route, { timeout: 30_000 });
      const bar = page.getByTestId("next-access-bar");
      await expect(bar).toHaveCount(1, { timeout: 30_000 });
      await expect(bar).toContainText(near.event.title);
      await expect(bar).toContainText("J-6");
      // Lot C1 : la carte `.near` de l'artefact (« J-6 / sam. », titre, « Retenue · Sam. 24 · 18 h 30 », « QR »).
      await expect(bar).toContainText(/(Dim|Lun|Mar|Mer|Jeu|Ven|Sam)\. \d{1,2} · /);
      await expect(bar).toContainText("QR");
    }
    await page.getByRole("tab", { name: "Explorer", exact: true }).click();
    await shot(page, `acces-flottant-explorer-${theme}`);
    await expect(page.getByTestId("next-access-bar")).toBeVisible();
    // Sans néon (le seul néon de l'écran est celui d'un bouton principal) : l'ombre portée --shadow-lg de l'artefact,
    // sans halo moutarde.
    const shadow = await page.getByTestId("next-access-bar").evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toContain("233, 184, 36");
    // Masquée sur Accueil et Sorties (`.app.no-near` de l'artefact), et depuis le lot M5 sur Garage et Profil.
    for (const tab of ["Accueil", "Sorties", "Garage", "Profil"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByTestId("next-access-bar")).toHaveCount(0);
    }
    await page.getByRole("tab", { name: "Explorer", exact: true }).click();
    // Elle mène à l'écran du jour J de la candidature.
    await page.getByTestId("next-access-bar").click();
    await expect(page).toHaveURL(new RegExp(`/jour-j/${near.applicationId}`), { timeout: 30_000 });
    // Sur l'écran du jour J : plus de barre d'onglets, donc plus d'accès flottant.
    await expect(page.getByTestId("next-access-bar")).toBeHidden();
    await ctx.close();
  }

  // À J-9 : rien ne flotte.
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, far.email);
  const proof = { Garage: "Mon garage", Sorties: "Mes sorties" } as const;
  for (const tab of ["Explorer", "Garage", "Sorties"] as const) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    // D'abord la preuve que l'écran et ses données sont là, ensuite l'absence de la barre. Lot C1 : Explorer n'a plus de
    // grand titre (artefact), son en-tête de recherche en tient lieu.
    if (tab === "Explorer") await expect(page.getByTestId("explorer-head")).toBeVisible({ timeout: 60_000 });
    else await expect(page.getByRole("heading", { name: proof[tab], exact: true })).toBeVisible({ timeout: 60_000 });
    if (tab === "Sorties")
      await expect(page.getByTestId("ticket-application").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.getByTestId("next-access-bar")).toHaveCount(0);
  }
  await ctx.close();
});
