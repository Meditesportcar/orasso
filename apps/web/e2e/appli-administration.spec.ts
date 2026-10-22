import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, deliverNow, login, SEED_PASSWORD, samplePhoto, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Administration dans l'appli (lot 35d, décision D20), dans le navigateur. Parcours de la fiche : super admin vérifie une
// structure ; décide d'un signalement puis d'une sanction ; réinitialise la double authentification d'un compte avec
// motif ; planifie une newsletter puis la met en pause ; survole l'espace d'une structure en lecture seule, puis intervient
// sur une demande d'aide ouverte ; le modérateur est limité à sa file ; un passionné ne voit pas l'administration. Puis
// les mêmes écrans en Sable, avec le contrôle des règles du système de design sur chaque capture.
// Lancer avec APP_URL=http://localhost:<relais> (Metro, EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SITE_URL et CORS_ORIGINS posés).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-35d-captures`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function openApp(browser: Browser, email: string, theme: Theme) {
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

/** Ouvre la feuille des casquettes et choisit l'Administration. */
async function chooseAdmin(page: Page) {
  await page.goto("/moi"); // Lot 40 : les casquettes sont dans Mon profil (plus d'avatar en haut).
  await page.getByTestId("casquette-admin").click();
  await page.waitForURL(/administration/, { timeout: 20_000 });
}

/** Ouvre une adresse de l'appli et attend la fin de l'ouverture animée. */
async function go(page: Page, path: string) {
  await page.goto(path);
  await page.waitForTimeout(3500);
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
/** Lot C1 : la barre d'onglets est masquée sur les pages de flux ; on rouvre alors l'onglet par son adresse. */
const tabRoutes: Record<string, string> = {
  Accueil: "/administration",
  Signalements: "/signalements",
  Registres: "/registres",
  Gestion: "/gestion",
  Équipe: "/equipe",
};
async function toTab(page: Page, name: string) {
  if (
    !(await tab(page, name)
      .isVisible()
      .catch(() => false))
  ) {
    await page.goto(tabRoutes[name] ?? "/");
    await expect(tab(page, name)).toBeVisible({ timeout: 30_000 });
  }
  await tab(page, name).click();
}

type Audit = { greens: string[]; truncated: string[]; horizontalScroll: boolean; noIcon: string[] };

/** Règles du système de design vérifiables dans le DOM de l'appli web : pas de vert, rien de tronqué, pas de défilement horizontal. */
async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const isGreen = (color: string) => {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return false;
      const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      if (a < 0.2) return false;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 40 || max !== g) return false;
      let h = 60 * ((b - r) / (max - min)) + 120;
      if (h < 0) h += 360;
      return h > 85 && h < 165;
    };
    const all = [...document.querySelectorAll("body *")].filter(visible);
    const greens = new Set<string>();
    for (const el of all) {
      const s = getComputedStyle(el);
      for (const c of [s.color, s.backgroundColor, s.borderTopColor]) if (isGreen(c)) greens.add(`${el.tagName} ${c}`);
    }
    const label = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    return {
      greens: [...greens].slice(0, 10),
      truncated: all
        .filter((el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        .map(label),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      noIcon: all
        .filter(
          (el) =>
            el.getAttribute("role") === "button" &&
            !el.querySelector("svg") &&
            label(el).length > 0 &&
            getComputedStyle(el).textTransform === "uppercase",
        )
        .map(label),
    };
  });
}

const results: Record<string, Audit> = {};
const shotter = (page: Page) => async (name: string) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  results[name] = await audit(page);
};

/** Envoi multipart (justificatif de vérification) avec le cookie d'un compte. */
async function uploadDocument(cookie: string, structureId: string) {
  const form = new FormData();
  form.set("kind", "identity");
  form.set("file", new File([new Uint8Array(samplePhoto())], "recepisse.png", { type: "image/png" }));
  const res = await fetch(`${API}/api/structures/${structureId}/verification/documents`, {
    method: "POST",
    headers: { cookie, origin: WEB },
    body: form,
  });
  expect(res.status).toBe(201);
}

/** Une structure à vérifier (compte neuf, justificatif joint, demande envoyée). */
async function pendingStructure(label: string) {
  const ownerCookie = await signUpApi(`Orga_${label}`);
  const created = await apiCall<{ id: string }>(ownerCookie, "POST", "/structures", {
    kind: "association",
    name: `Club Admin ${label}`,
    departments: ["66"],
  });
  expect(created.status).toBe(201);
  await uploadDocument(ownerCookie, created.data.id);
  expect(
    (await apiCall(ownerCookie, "POST", `/structures/${created.data.id}/verification/submit`)).status,
  ).toBeLessThan(300);
  return { ownerCookie, id: created.data.id, name: `Club Admin ${label}` };
}

/** Un signalement en attente sur un compte neuf. */
async function pendingReport(label: string) {
  const target = await signUpApi(`Signale_${label}`);
  const targetId = (await apiCall<{ user: { id: string } }>(target, "GET", "/me")).data.user.id;
  const reporter = await signUpApi(`Signaleur_${label}`);
  const sent = await apiCall(reporter, "POST", "/reports", {
    targetType: "profile",
    targetId,
    reason: "spam",
    details: "Publicité répétée (recette 35d).",
  });
  expect(sent.status).toBe(201);
}

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("super admin : structure à vérifier, signalement, sanction, 2FA d'un compte, newsletter, horloge", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const s = unique();
  const damien = await login("damien@orasso.local");

  const { ownerCookie, id: structureId, name } = await pendingStructure(s);
  await pendingReport(s);
  const created = { data: { id: structureId } };
  // Un compte à qui on réinitialisera la double authentification.
  const targetPseudo = `Cible_${s}`;
  await signUpApi(targetPseudo);

  const a = await openApp(browser, "damien@orasso.local", "beton");
  const page = a.page;
  const shot = shotter(page);
  await chooseAdmin(page);

  // --- Accueil : toutes les files, compteurs ---------------------------------------------------------------------
  await expect(page.getByTestId("tile-structuresPending")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tile-reportsPending")).toBeVisible();
  await expect(page.getByTestId("tile-sanctionsContested")).toBeVisible();
  await expect(page.getByTestId("tile-assistanceOpen")).toBeVisible();
  await expect(page.getByTestId("tile-newslettersScheduled")).toBeVisible();
  await shot("01-accueil-beton");

  // --- 1. Vérifier une structure --------------------------------------------------------------------------------
  await page.getByTestId("tile-structuresPending").click();
  const card = page.getByTestId("admin-structure").filter({ hasText: name });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId("admin-document-open").click();
  await shot("02-structure-a-verifier-beton");
  // Un refus sans motif est retenu avant l'appel.
  await card.getByTestId("admin-structure-refuse").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Indique le motif du refus")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await card.getByTestId("admin-structure-verify").click();
  await shot("03-structure-valider-confirmation-beton");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Structure validée.")).toBeVisible({ timeout: 20_000 });
  const pending = await apiCall<{ id: string }[]>(damien, "GET", "/admin/structures?status=pending");
  expect(pending.data.some((r) => r.id === created.data.id)).toBe(false);
  const rest = await apiCall<{ verification: string }>(ownerCookie, "GET", `/structures/${created.data.id}`);
  expect(JSON.stringify(rest.data)).toContain("verified");

  // --- 2. Un signalement : prise en charge, puis une sanction ---------------------------------------------------
  await toTab(page, "Signalements");
  const item = page.getByTestId("report-item").first();
  await expect(item).toBeVisible({ timeout: 30_000 });
  await shot("04-signalements-beton");
  await item.click();
  await expect(page.getByTestId("report-detail")).toBeVisible({ timeout: 30_000 });
  await shot("05-signalement-dossier-beton");
  await page.getByTestId("report-reviewing").click();
  await shot("06-signalement-statut-confirmation-beton");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("C'est fait. L'action est écrite au journal d'administration.")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("combobox", { name: "Sanction" }).click();
  await page.getByRole("menuitem", { name: "Suspension de 7 jours" }).click();
  await page.getByTestId("sanction-submit").click();
  await shot("07-sanction-confirmation-beton");
  await page.getByTestId("admin-reason").fill("Suspension de la recette 35d");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("report-sanction")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("report-sanction")).toContainText("Suspension de 7 jours");
  // On la lève depuis le dossier (confirmation), puis la liste des sanctions la montre levée.
  await page.getByTestId("report-lift").click();
  await shot("08-sanction-lever-confirmation-beton");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("report-sanction")).toContainText("Levée le", { timeout: 20_000 });
  await go(page, "/sanctions");
  await page.getByRole("tab", { name: "Toutes" }).click();
  const sanction = page.getByTestId("sanction").filter({ hasText: "Suspension de 7 jours" }).first();
  await expect(sanction).toBeVisible({ timeout: 30_000 });
  await shot("09-sanctions-beton");

  // --- 3. Réinitialiser la double authentification d'un compte, avec motif -------------------------------------
  await go(page, "/utilisateurs");
  await page.getByTestId("admin-users-q").fill(targetPseudo);
  await page.getByTestId("admin-users-q-go").click();
  const row = page.getByTestId("user-row").filter({ hasText: targetPseudo });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await shot("09-utilisateurs-beton");
  await row.click();
  await expect(page.getByTestId("action-twofactor")).toBeVisible({ timeout: 30_000 });
  await shot("10-utilisateur-fiche-beton");
  await page.getByTestId("admin-twofactor-go").click();
  await shot("11-a5-confirmation-beton");
  // Motif trop court : retenu avant l'appel.
  await page.getByTestId("admin-reason").fill("non");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Indique le motif (5 caractères au moins).")).toBeVisible();
  const reason = `Perte du téléphone, recette ${s}`;
  await page.getByTestId("admin-reason").fill(reason);
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("C'est fait. L'action est écrite au journal d'administration.")).toBeVisible({
    timeout: 20_000,
  });
  const audit1 = await apiCall<{ items: { reason: string | null; action: string }[] }>(
    damien,
    "GET",
    "/admin/audit?limit=20",
  );
  expect(audit1.data.items.some((r) => r.reason === reason)).toBe(true);
  // Aucune action sur son propre compte : le message de l'API (ou de l'appli) s'affiche.
  await go(page, "/utilisateurs");
  await page.getByTestId("admin-users-q").fill("Damien");
  await page.getByTestId("admin-users-q-go").click();
  await page.getByTestId("user-row").filter({ hasText: "damien@orasso.local" }).first().click({ timeout: 30_000 });
  await expect(page.getByText("Action impossible sur ton propre compte.")).toBeVisible({ timeout: 30_000 });

  // --- 4. Newsletter : brouillon, planification, pause, reprise, retour au brouillon, suppression -----------------
  await go(page, "/newsletter");
  await expect(page.getByTestId("newsletter-editor")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("newsletter-new").click();
  const subject = `Newsletter de la recette ${s}`;
  await page.getByTestId("newsletter-subject").fill(subject);
  await page
    .getByTestId("newsletter-body")
    .fill("# Bonjour\n\nCeci est un **essai** de la recette 35d.\n\n- un\n- deux");
  await expect(page.getByTestId("newsletter-preview")).toContainText("essai");
  await page.getByTestId("newsletter-save").click();
  await expect(page.getByText("Brouillon enregistré.")).toBeVisible({ timeout: 20_000 });
  await shot("12-newsletter-brouillon-beton");
  // « Envoyer à N personnes » : la confirmation annonce le nombre, on annule.
  await page.getByTestId("newsletter-send").click();
  await expect(page.getByTestId("orga-confirm")).toContainText(/Envoyer à \d+ personnes?/, { timeout: 20_000 });
  await shot("13-newsletter-envoyer-confirmation-beton");
  await page.getByRole("button", { name: "Annuler" }).click();
  // Une date illisible est retenue ; une date à venir planifie.
  await page.getByTestId("newsletter-at").fill("demain");
  await page.getByTestId("newsletter-schedule").click();
  await expect(page.getByText("Date et heure au format JJ/MM/AAAA HH:MM.")).toBeVisible();
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await page
    .getByTestId("newsletter-at")
    .fill(`${pad(inTwoDays.getDate())}/${pad(inTwoDays.getMonth() + 1)}/${inTwoDays.getFullYear()} 10:00`);
  await page.getByTestId("newsletter-schedule").click();
  await shot("14-newsletter-planifier-confirmation-beton");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Envoi planifié")).toBeVisible({ timeout: 20_000 });
  const listed = await apiCall<{ id: string; subject: string; status: string }[]>(damien, "GET", "/admin/newsletters");
  const mine = listed.data.find((n) => n.subject === subject);
  expect(mine?.status).toBe("scheduled");
  // Pause (confirmée), reprise (confirmée).
  await page.getByTestId("newsletter-pause").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Envoi mis en pause.")).toBeVisible({ timeout: 20_000 });
  expect(
    (await apiCall<{ id: string; status: string }[]>(damien, "GET", "/admin/newsletters")).data.find(
      (n) => n.id === mine?.id,
    )?.status,
  ).toBe("paused");
  await shot("15-newsletter-en-pause-beton");
  await page.getByTestId("newsletter-resume").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Envoi repris.")).toBeVisible({ timeout: 20_000 });
  // Retour au brouillon puis suppression (confirmée) : aucun e-mail n'est parti.
  await page.getByTestId("newsletter-unschedule").click();
  await expect(page.getByText("Retour au brouillon.")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("newsletter-delete").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Brouillon supprimé.")).toBeVisible({ timeout: 20_000 });
  expect(
    (await apiCall<{ id: string }[]>(damien, "GET", "/admin/newsletters")).data.some((n) => n.id === mine?.id),
  ).toBe(false);

  // --- 5. Horloge simulée (DEV_CLOCK) --------------------------------------------------------------------------
  await toTab(page, "Gestion");
  await expect(page.getByTestId("admin-link-horloge")).toBeVisible({ timeout: 30_000 });
  await shot("16-gestion-beton");
  await page.getByTestId("admin-link-horloge").click();
  await expect(page.getByTestId("clock-status")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("clock-1h").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("clock-advanced")).toBeVisible({ timeout: 30_000 });
  await shot("17-horloge-beton");
  await page.getByTestId("clock-reset").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("clock-offset")).toContainText("Aucun décalage", { timeout: 20_000 });
  await a.ctx.close();

  writeFileSync(`${DIR}/audit-super-admin.json`, JSON.stringify(results, null, 2));
});

test("mode assistance : survoler en lecture seule, demander l'aide, intervenir", async ({ browser }) => {
  test.setTimeout(600_000);
  const s = unique();
  const equipe = await login("equipe@orasso.local");
  // Une structure neuve, sans demande d'aide ouverte.
  const ownerEmail = `orga-assist-${s}@e2e.orasso.test`;
  const ownerCookie = await signUpApi(`Assist_${s}`, ownerEmail);
  const name = `Club Aide ${s}`;
  const created = await apiCall<{ id: string }>(ownerCookie, "POST", "/structures", {
    kind: "association",
    name,
    departments: ["66"],
  });
  expect(created.status).toBe(201);
  const sid = created.data.id;

  const admin = await openApp(browser, "equipe@orasso.local", "beton");
  const page = admin.page;
  const shot = shotter(page);
  await chooseAdmin(page);
  // Registre des structures → « Survoler l'espace ».
  await go(page, "/structures");
  await page.getByTestId("admin-structures-q").fill(name);
  await page.getByTestId("admin-structures-q-go").click();
  const row = page.getByTestId("structure-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await shot("20-structures-registre-beton");
  await row.getByTestId("admin-survey").click();
  await shot("21-survoler-confirmation-beton");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("assistance-banner")).toContainText("Mode assistance · lecture seule", {
    timeout: 30_000,
  });
  await shot("22-survol-bandeau-lecture-seule-beton");
  // Écrire sans demande ouverte : l'API refuse, l'appli affiche son message sans planter.
  await toTab(page, "Équipe");
  await page.getByTestId("team-nav-bans").click();
  await expect(page.getByTestId("assistance-banner")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("bans-pseudo").fill("Pilote_001");
  await page.getByTestId("bans-add").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText(/Mode assistance : lecture seule/).first()).toBeVisible({ timeout: 20_000 });
  await shot("23-survol-ecriture-refusee-beton");

  // L'organisateur demande l'aide d'Orasso depuis l'appli (avec un message trop court d'abord).
  const org = await openApp(browser, ownerEmail, "beton");
  await org.page.goto("/moi"); // Lot 40 : les casquettes sont dans Mon profil (plus d'avatar en haut).
  await org.page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
  await org.page.waitForURL(/\/direct/, { timeout: 20_000 });
  await go(org.page, "/structure");
  // Lot 52 : « Demander l'aide d'Orasso » est une tuile de l'onglet Structure.
  await org.page.getByTestId("tile-help").click();
  await expect(org.page.getByTestId("assistance-panel")).toBeVisible({ timeout: 30_000 });
  await org.page.getByTestId("assistance-message").fill("court");
  await org.page.getByTestId("assistance-ask").click();
  await expect(org.page.getByText("Explique en quelques mots ce dont tu as besoin")).toBeVisible();
  await org.page.getByTestId("assistance-message").fill("Aide pour paramétrer notre premier événement.");
  await org.page.getByTestId("assistance-ask").click();
  await org.page.getByTestId("orga-confirm").click();
  await expect(org.page.getByText("Demande envoyée : l'équipe Orasso est prévenue.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(org.page.getByTestId("assistance-own-close")).toBeVisible();
  const own = shotter(org.page);
  await own("25-demande-aide-en-cours-beton");
  const state = await apiCall<{ current: { id: string } | null }>(ownerCookie, "GET", `/structures/${sid}/assistance`);
  expect(state.data.current).not.toBeNull();

  // Le lien profond : la demande arrive au Journal de l'équipe et ouvre la file des demandes d'aide.
  deliverNow("equipe@orasso.local");
  await toTab(page, "Équipe");
  await page.goto("/boite"); // Lot 40 : la Boîte réunit messages et notifications (plus de cloche).
  await page.getByTestId("inbox-journal").click();
  await page
    .getByTestId("journal-item")
    .filter({ hasText: `Demande d'aide · ${name}` })
    .first()
    .click();
  await expect(page).toHaveURL(/assistance/, { timeout: 20_000 });
  await expect(page.getByTestId("assistance-row").filter({ hasText: name })).toBeVisible({ timeout: 30_000 });
  await shot("26-demandes-aide-beton");

  // Retour au survol : le bandeau annonce l'intervention, l'écriture passe et le journal la porte.
  await page.getByTestId("assistance-row").filter({ hasText: name }).getByTestId("admin-survey").click();
  await page.getByTestId("orga-confirm").click();
  await toTab(page, "Équipe");
  await page.getByTestId("team-nav-bans").click();
  await expect(page.getByTestId("assistance-banner")).toContainText("Intervention en cours", { timeout: 30_000 });
  await shot("27-survol-bandeau-intervention-beton");
  await page.getByTestId("bans-pseudo").fill("Pilote_001");
  await page.getByTestId("bans-add").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Personne bannie.")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("bans-row").filter({ hasText: "Pilote_001" }).getByTestId("bans-lift").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Bannissement levé.")).toBeVisible({ timeout: 20_000 });
  const traced = await apiCall<{ items: { action: string; assistanceRequestId: string | null }[] }>(
    equipe,
    "GET",
    "/admin/audit?limit=30",
  );
  expect(traced.data.items.some((r) => r.assistanceRequestId !== null)).toBe(true);

  // Quitter l'espace : retour à l'Administration.
  await page.getByTestId("assistance-leave").click();
  await page.waitForURL(/administration/, { timeout: 20_000 });

  // L'organisateur ferme la demande (confirmée) ; l'écriture est de nouveau refusée.
  await org.page.getByTestId("assistance-own-close").click();
  await org.page.getByTestId("orga-confirm").click();
  await expect(org.page.getByText("Demande fermée.")).toBeVisible({ timeout: 20_000 });
  const after = await apiCall<{ current: unknown }>(ownerCookie, "GET", `/structures/${sid}/assistance`);
  expect(after.data.current).toBeNull();
  await org.ctx.close();
  await admin.ctx.close();
});

test("modérateur limité à sa file ; un passionné ne voit pas l'administration", async ({ browser }) => {
  test.setTimeout(300_000);
  await pendingReport(unique());
  const moderator = await login("moderatrice@orasso.local");
  // L'API ne lui ouvre que les signalements.
  expect((await apiCall(moderator, "GET", "/admin/overview")).status).toBe(403);
  expect((await apiCall(moderator, "GET", "/admin/users")).status).toBe(403);
  expect((await apiCall(moderator, "GET", "/admin/sanctions")).status).toBe(403);
  expect((await apiCall(moderator, "GET", "/admin/reports")).status).toBe(200);

  const m = await openApp(browser, "moderatrice@orasso.local", "beton");
  const shot = shotter(m.page);
  await m.page.goto("/moi"); // Lot 40 : les casquettes sont dans Mon profil (plus d'avatar en haut).
  await expect(m.page.getByTestId("casquette-admin")).toContainText("Modération");
  await m.page.getByTestId("casquette-admin").click();
  await m.page.waitForURL(/administration/, { timeout: 20_000 });
  await expect(m.page.getByTestId("tile-reportsPending")).toBeVisible({ timeout: 30_000 });
  await expect(m.page.getByTestId("tile-structuresPending")).toHaveCount(0);
  await expect(m.page.getByTestId("tile-sanctionsContested")).toHaveCount(0);
  await expect(tab(m.page, "Registres")).toHaveCount(0);
  await expect(tab(m.page, "Gestion")).toHaveCount(0);
  await shot("30-moderateur-accueil-beton");
  // Une page du super admin ouverte à la main : message clair, aucune donnée.
  await go(m.page, "/utilisateurs");
  await expect(m.page.getByText("Cette page est réservée au super administrateur.")).toBeVisible({ timeout: 30_000 });
  await expect(m.page.getByTestId("user-row")).toHaveCount(0);
  // Sa file : le dossier d'un signalement et les gestes que l'API lui accorde.
  await go(m.page, "/signalements");
  await expect(m.page.getByTestId("report-item").first()).toBeVisible({ timeout: 30_000 });
  await shot("31-moderateur-signalements-beton");
  // Le lien profond de l'alerte prioritaire (suspension automatique) mène à la file.
  deliverNow("moderatrice@orasso.local");
  await go(m.page, "/administration");
  await m.page.goto("/boite"); // Lot 40 : la Boîte réunit messages et notifications (plus de cloche).
  await m.page.getByTestId("inbox-journal").click();
  await m.page.getByTestId("journal-item").filter({ hasText: "Alerte prioritaire" }).first().click();
  await expect(m.page).toHaveURL(/signalements/, { timeout: 20_000 });
  await m.ctx.close();

  // Un passionné : pas de casquette Administration, et l'API refuse.
  const kenji = await login("kenji@orasso.local");
  expect((await apiCall(kenji, "GET", "/admin/overview")).status).toBe(403);
  const fan = await openApp(browser, "kenji@orasso.local", "beton");
  // Lot 40 : les casquettes sont dans Mon profil.
  await fan.page.goto("/moi");
  await expect(fan.page.getByTestId(/^casquette-(fan|visitor)$/)).toBeVisible({ timeout: 30_000 });
  await expect(fan.page.getByTestId("casquette-admin")).toHaveCount(0);
  await go(fan.page, "/administration");
  await expect(fan.page.getByTestId("tile-structuresPending")).toHaveCount(0);
  await fan.ctx.close();
});

test("les mêmes écrans dans le thème Sable (contrôle du système de design)", async ({ browser }) => {
  test.setTimeout(600_000);
  await pendingStructure(unique());
  await pendingReport(unique());
  const b = await openApp(browser, "damien@orasso.local", "sable");
  const shot = shotter(b.page);
  await chooseAdmin(b.page);
  await expect(b.page.getByTestId("tile-reportsPending")).toBeVisible({ timeout: 30_000 });
  await shot("40-accueil-sable");
  const screens: [string, string, string][] = [
    ["/verification", "admin-structure", "41-verification-sable"],
    ["/signalements", "report-item", "42-signalements-sable"],
    ["/sanctions", "sanction", "43-sanctions-sable"],
    ["/utilisateurs", "user-row", "44-utilisateurs-sable"],
    ["/structures", "structure-row", "45-structures-sable"],
    ["/vehicules", "make-form", "46-vehicules-sable"],
    ["/journal", "audit-row", "47-journal-sable"],
    ["/parametres", "admin-points", "48-reglages-sable"],
    ["/newsletter", "newsletter-editor", "49-newsletter-sable"],
    ["/sponsorises", "placement-form", "50-sponsorises-sable"],
    ["/horloge", "clock-status", "51-horloge-sable"],
    ["/gestion", "admin-link-newsletter", "52-gestion-sable"],
    ["/registres", "admin-link-utilisateurs", "53-registres-sable"],
  ];
  for (const [path, testId, name] of screens) {
    await go(b.page, path);
    if (path === "/sanctions") await b.page.getByRole("tab", { name: "Toutes" }).click();
    await expect(b.page.getByTestId(testId).first()).toBeVisible({ timeout: 30_000 });
    await shot(name);
  }
  // Un dossier de signalement et une fiche d'utilisateur, en Sable.
  await go(b.page, "/signalements");
  await b.page.getByTestId("report-item").first().click();
  await expect(b.page.getByTestId("report-detail")).toBeVisible({ timeout: 30_000 });
  await shot("54-signalement-dossier-sable");
  await go(b.page, "/utilisateurs");
  await b.page.getByTestId("user-row").first().click();
  await expect(b.page.getByTestId("action-twofactor").or(b.page.getByText("Action impossible"))).toBeVisible({
    timeout: 30_000,
  });
  await shot("55-utilisateur-sable");
  await b.ctx.close();

  writeFileSync(`${DIR}/audit-sable.json`, JSON.stringify(results, null, 2));
  for (const [name, r] of Object.entries(results)) {
    expect(r.greens, `${name} : pas de vert`).toEqual([]);
    expect(r.truncated, `${name} : rien de tronqué`).toEqual([]);
    expect(r.horizontalScroll, `${name} : pas de défilement horizontal`).toBe(false);
    expect(r.noIcon, `${name} : aucun bouton sans icône`).toEqual([]);
  }
});
