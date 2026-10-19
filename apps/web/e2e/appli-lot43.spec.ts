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

// Lot 43, côté appli (version web de recette) : Sorties en tickets, Accueil par profil (exposant, visiteur, pro,
// prestataire, média), accès flottant dès J-7. Comptes du seed : Kenji (exposant : un ticket par statut, retenue, en
// attente, liste d'attente, place libérée, passées, mission staff), Paul (visiteur : un billet gratuit), garage@ (pro),
// Sofia (prestataire, emplacement B2), Léo (média accrédité). Captures à 390 px dans les deux thèmes.
// Lancer avec APP_URL=http://localhost:8281 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-43-captures/appli";
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

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Règles du système de design à l'écran : un seul néon, un seul bouton principal, pas de vert, pas de défilement horizontal. */
async function checkRules(page: Page, theme: Theme) {
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

    // À venir : retenue (Mon QR), en attente (Réponse de … avant …), liste d'attente (délai), place libérée.
    const tickets = page.getByTestId("ticket-application");
    await expect(tickets.first()).toBeVisible({ timeout: 30_000 });
    expect(await tickets.count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByText("Retenue", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("ticket-qr").first()).toContainText("Mon QR");
    await expect(page.getByText(/^Réponse de .+ avant /).first()).toBeVisible();
    await expect(page.getByText(/Si une place se libère, tu as 24 h pour l'accepter/).first()).toBeVisible();
    await expect(page.getByText("J'accepte la place", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer", exact: true }).first()).toBeVisible();
    // La souche : le jour de la semaine, le quantième et le mois.
    await expect(tickets.first().getByText(/^(DIM|LUN|MAR|MER|JEU|VEN|SAM)$/)).toBeVisible();
    await expect(
      page.getByText("Empêché ? Retire-toi depuis le ticket : ta place part à la liste d'attente."),
    ).toBeVisible();
    await shot(page, `sorties-a-venir-${theme}`);
    // Un seul bouton principal : celui de la première place retenue (la place libérée à accepter en est un autre :
    // l'audit tolère les deux seulement si elles ne se voient pas ensemble ; on regarde la partie haute de l'écran).
    await page.getByText(/^À venir · \d+$/).scrollIntoViewIfNeeded();

    // Staff : la mission, « Je serai là », le rôle donné par la structure.
    await segments.getByText(/^Staff · \d+$/).click();
    await expect(page.getByTestId("ticket-staff").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Rôle donné par .+ pour cet événement$/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Je serai là" }).first()).toBeVisible();
    await expect(page.getByText(/Le mode staff s'ouvre la veille/).first()).toBeVisible();
    await shot(page, `sorties-staff-${theme}`);

    // Passées : pointé, points, avis.
    await segments.getByText(/^Passées · \d+$/).click();
    await expect(page.getByTestId("ticket-past").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Pointé/).first()).toBeVisible();
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
    texts: [/^Salut Kenji$/i, "Mon accès", "Tes autres sorties", "Passeport Orasso"],
    hero: true,
  },
  {
    kind: "visitor",
    email: "paul.photo@orasso.local",
    choose: null,
    texts: [/^Salut /i, "Mon billet", "Billet"],
    hero: true,
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
    hero: false,
  },
  {
    kind: "provider",
    email: "sofia@orasso.local",
    choose: "provider",
    texts: ["Mon accès prestataire", "Emplacement B2", "Message de l'organisateur", "Missions qui t'attendent"],
    hero: true,
  },
  {
    kind: "media",
    email: "leo@orasso.local",
    choose: "media",
    texts: ["Accréditée", "Badge presse", "Mon badge presse", "Consignes de l'organisation"],
    hero: true,
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
      await expect(page.getByRole("heading", { name: "Accueil", exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("home-greeting")).toBeVisible({ timeout: 30_000 });
      for (const text of home.texts) {
        await expect(page.getByText(text).first(), `« ${String(text)} »`).toBeVisible({ timeout: 30_000 });
      }
      if (home.hero) {
        // Le compte à rebours et l'heure sont en contour sur l'affiche (huit copies + le texte).
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
      await page.getByTestId("home-greeting").evaluate((el) => {
        let node: HTMLElement | null = el as HTMLElement;
        while (node && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
        node?.scrollTo(0, node.scrollHeight);
      });
      await shot(page, `accueil-${home.kind}-bas-${theme}`);
      expect(
        errors.filter((e) => !/favicon|WebSocket|ws:\/\/|DevTools|Sentry|expo-notifications|push|401/i.test(e)),
      ).toEqual([]);
      await ctx.close();
    }
  });
}

test("accès flottant : visible dès J-7 sur tous les onglets, absent au-delà, vers le jour J", async ({ browser }) => {
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
    // Explorer, Garage, Profil : la barre est là (une fois, au-dessus de la barre d'onglets).
    for (const [tab, route] of [
      ["Explorer", /\/explorer/],
      ["Garage", /\/garage/],
      ["Profil", /\/profil/],
    ] as const) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(route, { timeout: 30_000 });
      const bar = page.getByTestId("next-access-bar");
      await expect(bar).toHaveCount(1, { timeout: 30_000 });
      await expect(bar).toContainText(near.event.title);
      await expect(bar).toContainText("J-6");
      await expect(bar).toContainText(/^(Dim|Lun|Mar|Mer|Jeu|Ven|Sam)\. \d{1,2} · /);
    }
    await page.getByRole("tab", { name: "Explorer", exact: true }).click();
    await shot(page, `acces-flottant-explorer-${theme}`);
    await page.getByRole("tab", { name: "Garage", exact: true }).click();
    await expect(page.getByTestId("next-access-bar")).toBeVisible();
    await shot(page, `acces-flottant-garage-${theme}`);
    // Sans néon : la barre n'en porte pas (le seul néon de l'écran est celui d'un bouton principal).
    const shadow = await page.getByTestId("next-access-bar").evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toBe("none");
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
  for (const tab of ["Explorer", "Garage", "Sorties"] as const) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("next-access-bar")).toHaveCount(0);
  }
  await ctx.close();
});
