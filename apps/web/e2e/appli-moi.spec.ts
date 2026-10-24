import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  login,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  unique,
} from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot 16, côté appli (version web de recette) : Moi complet (profil, aperçu public, notifications par type, public /
// privé, secteur, rayon, mot de passe, double authentification, appareils, QR de compte, suppression du compte),
// casquettes (feuille « Mes casquettes », bascule vers (orga) et (pro), appui long, mémorisation) et « Mot de passe
// oublié ». Lancer avec APP_URL=http://localhost:8161 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-16-captures`;
test.skip(!APP, "Appli : lancer avec APP_URL");

/** Code TOTP (RFC 6238, 6 chiffres, 30 s) d'un secret base32. */
function totp(base32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/[=\s]+/g, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 0x0f;
  const n = (((h[o] ?? 0) & 0x7f) << 24) | ((h[o + 1] ?? 0) << 16) | ((h[o + 2] ?? 0) << 8) | (h[o + 3] ?? 0);
  return String(n % 1_000_000).padStart(6, "0");
}

async function openApp(page: Page, theme: "sable" | "beton") {
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
}

async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Lot 40 : l'écran Moi est devenu Mon profil ; ses sections vivent dans les réglages en tuiles (`/reglages/<section>`). */
const SECTION_OF: Record<string, string> = {
  "moi-profile": "profil",
  "moi-public-preview": "profil",
  "notif-family-event": "notifications",
  "visibility-public": "confidentialite",
  "moi-data": "confidentialite",
  "moi-security": "securite",
};

/** Lot M6, tour 2 : le secteur, la distance et les centres d'intérêt sont dans « Tes préférences » (`/preferences`). */
async function openPreferences(page: Page) {
  await page.goto("/preferences");
  await page.getByTestId("pref-departments").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3500);
}

/** Ouvre le réglage qui contient l'élément, le fait défiler (zone qui défile) puis le place en haut pour la capture. */
async function reveal(page: Page, testId: string) {
  const section = SECTION_OF[testId];
  if (section && !page.url().includes(`/reglages/${section}`)) {
    await page.goto(`/reglages/${section}`);
    await page.getByTestId(testId).first().waitFor({ timeout: 30_000 });
    // Un chargement de page rejoue l'ouverture de l'appli (3 s) : on attend qu'elle se termine avant d'appuyer.
    await page.waitForTimeout(3500);
  }
  const el = page.getByTestId(testId).first();
  await el.scrollIntoViewIfNeeded();
  await el.evaluate((node) => node.scrollIntoView({ block: "start" }));
}

test("Moi : profil, aperçu public, notifications, public / privé, secteur, rayon, sécurité", async ({ browser }) => {
  test.setTimeout(420_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const pseudo = `MoiApp_${s}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const errors: string[] = [];

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  await openApp(page, "sable");
  await signIn(page, email);
  // Compte tout neuf : adresse non confirmée, bandeau avec « Renvoyer » en tête de Mon profil (lot 40).
  await page.goto("/moi");
  await expect(page.getByTestId("email-banner")).toBeVisible({ timeout: 30_000 });
  await page.goto("/reglages/profil");
  await expect(page.getByTestId("moi-profile")).toBeVisible({ timeout: 30_000 });
  await shot(page, "01-moi-profil-sable");

  // Profil : pseudo (disponibilité), description, photo → visibles dans /me/public-preview.
  const newPseudo = `${pseudo}_b`.slice(0, 24);
  await page.getByLabel("Pseudo", { exact: true }).fill(newPseudo);
  await expect(page.getByText("Ce pseudo est libre.")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Description").fill("Passionné de youngtimers, balades du dimanche.");
  await page.getByRole("button", { name: "Enregistrer le profil" }).click();
  await expect(page.getByTestId("moi-profile-message")).toHaveText("Profil enregistré.", { timeout: 20_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Changer la photo" }).click();
  await (await chooser).setFiles({ name: "avatar.png", mimeType: "image/png", buffer: samplePhoto() });
  await expect(page.getByTestId("moi-profile-message")).toHaveText("Photo enregistrée.", { timeout: 30_000 });
  const preview = await apiCall<{ pseudo: string; bio: string | null; avatarUrl: string | null }>(
    cookie,
    "GET",
    "/me/public-preview",
  );
  expect(preview.data.pseudo).toBe(newPseudo);
  expect(preview.data.bio).toBe("Passionné de youngtimers, balades du dimanche.");
  expect(preview.data.avatarUrl).toBeTruthy();
  await expect(page.getByTestId("moi-public-preview")).toContainText(newPseudo);

  // Notifications : couper un type → muted_types à jour.
  await reveal(page, "notif-family-event");
  await shot(page, "02-moi-notifications-sable");
  await page.getByTestId("notif-types-event").click();
  const family = page.getByTestId("notif-family-event");
  await family.getByRole("checkbox").nth(1).click();
  await expect
    .poll(async () => (await apiCall<{ mutedTypes: string[] }>(cookie, "GET", "/me/settings")).data.mutedTypes.length)
    .toBe(1);
  await shot(page, "03-moi-type-coupe-sable");
  // Une famille entière coupée.
  await family.getByRole("checkbox").first().click();
  await expect
    .poll(
      async () =>
        (await apiCall<{ notificationPrefs: Record<string, boolean> }>(cookie, "GET", "/me/settings")).data
          .notificationPrefs.event,
    )
    .toBe(false);

  // Compte privé → aperçu réduit (ni description, ni secteur).
  await openPreferences(page);
  await page.getByTestId("pref-departments-edit").click();
  await page.getByTestId("department-search").fill("11");
  await page.getByTestId("deptrow-11").click();
  await page.getByTestId("department-validate").click();
  await page.getByTestId("preferences-submit").click();
  await expect
    .poll(async () => (await apiCall<{ departments: string[] }>(cookie, "GET", "/me/settings")).data.departments)
    .toContain("11");
  await reveal(page, "visibility-public");
  await shot(page, "04-moi-public-prive-sable");
  await page.getByTestId("visibility-private").click();
  await expect
    .poll(async () => (await apiCall<{ visibility: string }>(cookie, "GET", "/me/settings")).data.visibility)
    .toBe("private");
  const reduced = await apiCall<{ bio: string | null; departments: string[] | null }>(
    cookie,
    "GET",
    "/me/public-preview",
  );
  expect(reduced.data.bio).toBeNull();
  expect(reduced.data.departments).toBeNull();
  // Retour en public pour la suite.
  await page.getByTestId("visibility-public").click();
  await expect
    .poll(async () => (await apiCall<{ visibility: string }>(cookie, "GET", "/me/settings")).data.visibility)
    .toBe("public");

  // Rayon : un appui au milieu du curseur.
  await openPreferences(page);
  const slider = page.getByRole("slider", { name: "Distance habituelle" });
  const box = await slider.boundingBox();
  if (!box) throw new Error("curseur introuvable");
  await page.mouse.click(box.x + box.width * 0.5, box.y + 20);
  await shot(page, "05-moi-secteur-sable");
  await page.getByTestId("preferences-submit").click();
  await expect
    .poll(async () => (await apiCall<{ radiusKm: number }>(cookie, "GET", "/me/settings")).data.radiusKm, {
      timeout: 15_000,
    })
    .toBeGreaterThan(90);

  // Sécurité : appareils (cet appareil), secret du QR, mot de passe, double authentification.
  await reveal(page, "moi-security");
  await shot(page, "06-moi-securite-sable");
  await page.getByRole("button", { name: "Voir mes appareils" }).click();
  await expect(page.getByTestId("session-row").first()).toBeVisible({ timeout: 15_000 });
  await shot(page, "07-appareils-sable");
  await page.getByRole("button", { name: "Fermer" }).last().click();

  await page.getByRole("button", { name: "Régénérer le secret du QR" }).click();
  await page.getByRole("button", { name: "Régénérer le secret", exact: true }).click();
  await expect(page.getByTestId("qr-rotated")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Fermer" }).last().click();

  // Double authentification : mot de passe → QR et clé → codes de secours → code → activée.
  await page.getByRole("button", { name: "Activer la double authentification" }).first().click();
  await page.getByRole("button", { name: "Activer la double authentification" }).last().click();
  await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("totp-secret")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("backup-codes")).toBeVisible();
  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s+/g, "");
  expect(secret.length).toBeGreaterThanOrEqual(16);
  await shot(page, "08-double-authentification-sable");
  await page.getByLabel("Code à 6 chiffres").fill(totp(secret));
  await page.getByRole("button", { name: "Activer", exact: true }).click();
  await expect(page.getByTestId("two-factor-done")).toContainText("activée", { timeout: 20_000 });
  await page.getByRole("button", { name: "Fermer" }).last().click();
  await expect(page.getByText("Activée", { exact: true })).toBeVisible();

  // Changer le mot de passe (les autres sessions sont révoquées : on se reconnecte à l'API ensuite).
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await page.getByLabel("Mot de passe actuel").fill(SEED_PASSWORD);
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("nouveau-mdp-2026");
  await page.getByLabel("Nouveau mot de passe, encore une fois").fill("nouveau-mdp-2026");
  await page.getByRole("button", { name: "Changer le mot de passe" }).last().click();
  await expect(page.getByTestId("password-changed")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Fermer" }).last().click();

  // « Renvoyer » l'e-mail de confirmation.
  await page.getByTestId("email-banner").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Renvoyer", exact: true }).click();
  await expect(page.getByTestId("email-banner")).toContainText("vient de partir", { timeout: 15_000 });

  expect(errors.filter((e) => !/favicon|Failed to load resource|ERR_BLOCKED|net::/i.test(e))).toEqual([]);
  await ctx.close();

  // Deuxième passage dans l'autre thème : captures seulement.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page2 = await ctx2.newPage();
  await openApp(page2, "beton");
  await page2.goto("/auth");
  await page2.getByLabel("E-mail").fill(email);
  await page2.getByLabel("Mot de passe", { exact: true }).first().fill("nouveau-mdp-2026");
  await page2.getByRole("button", { name: "Me connecter" }).click();
  await expect(page2.getByTestId("two-factor-step")).toBeVisible({ timeout: 30_000 });
  await page2.getByLabel("Code à 6 chiffres").fill(totp(secret, Date.now() + 30_000));
  await page2.getByRole("button", { name: "Valider" }).click();
  await page2.waitForURL(/accueil/, { timeout: 30_000 });
  await page2.goto("/reglages/profil");
  await expect(page2.getByTestId("moi-profile")).toBeVisible({ timeout: 30_000 });
  await shot(page2, "01-moi-profil-beton");
  await reveal(page2, "notif-family-event");
  await shot(page2, "02-moi-notifications-beton");
  await reveal(page2, "visibility-public");
  await shot(page2, "04-moi-public-prive-beton");
  await openPreferences(page2);
  await shot(page2, "05-moi-secteur-beton");
  await reveal(page2, "moi-security");
  await shot(page2, "06-moi-securite-beton");
  await ctx2.close();
  // Le compte garde sa double authentification : on contrôle par l'API (mot de passe changé, 2FA demandée).
  const relog = await apiCall<{ twoFactorRedirect?: boolean }>(null, "POST", "/auth/sign-in/email", {
    email,
    password: "nouveau-mdp-2026",
  });
  expect(relog.data.twoFactorRedirect).toBe(true);
  void login;
});

test("Moi : supprimer mon compte → écran de connexion, GET /me en 401", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const pseudo = `SupprApp_${s}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  expect((await apiCall(cookie, "GET", "/me")).status).toBe(200);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await openApp(page, "sable");
  await signIn(page, email);
  await page.goto("/reglages/confidentialite");
  await expect(page.getByTestId("moi-data")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  await page.getByLabel("Ton mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("checkbox", { name: /suppression est définitive/ }).click();
  await page.getByRole("button", { name: "Supprimer mon compte" }).last().click();
  await expect(page.getByTestId("delete-error")).toBeVisible({ timeout: 20_000 });
  await shot(page, "09-supprimer-compte-sable");
  await page.getByLabel("Ton mot de passe").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Supprimer mon compte" }).last().click();
  await page.waitForURL(/\/auth/, { timeout: 30_000 });
  expect((await apiCall(cookie, "GET", "/me")).status).toBe(401);
  await ctx.close();
});

test("Casquettes : feuille Mes casquettes, bascule vers (orga) et (pro), appui long, mémorisation", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  // Sarah_66 (seed) : co-organisatrice de MéditeSportCar (candidatures à trier) et propriétaire de Roues Libres 66.
  // Lot C7 : la recette ne dépend plus de l'ordre (`appli-tri` vide le tri) : une candidature en attente est déposée
  // ici sur un événement publié de la structure de Sarah dont les candidatures sont ouvertes.
  const upcoming = await sql<{ id: string }>(
    `select e.id from events e
       join structure_members m on m.structure_id = e.structure_id
       join "user" u on u.id = m.user_id
     where u.email = 'sarah@orasso.local' and e.status = 'published' and e.starts_at > now()
     order by e.starts_at limit 10`,
  );
  const applicant = await signUpApi(`TriC7_${unique()}`);
  const vehicle = await addVehicleApi(applicant, randomPlate());
  let applied = false;
  for (const e of upcoming) {
    if (applied) break;
    applied = await applyApi(applicant, e.id, vehicle).then(
      () => true,
      () => false,
    );
  }
  expect(applied, "une candidature à trier chez Sarah").toBe(true);
  const sarah = await login("sarah@orasso.local");
  const me = await apiCall<{ personas: { kind: string; label: string; badge: number }[] }>(sarah, "GET", "/me");
  // Lot 40 : Sarah n'a pas de véhicule actif, sa casquette de base est le visiteur.
  expect(me.data.personas.map((p) => p.kind)).toEqual(["visitor", "organizer", "organizer"]);
  expect(me.data.personas.some((p) => p.badge > 0)).toBe(true);

  for (const theme of ["sable", "beton"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
    const page = await ctx.newPage();
    await openApp(page, theme);
    await signIn(page, "sarah@orasso.local");
    await shot(page, `10-accueil-pastille-${theme}`);

    // Lot 40 : les casquettes sont dans Mon profil ; la structure à trier porte ses candidatures « à trier ».
    await page.goto("/moi");
    await expect(page.getByTestId("casquette-organizer")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId(/^casquette-(fan|visitor)$/)).toContainText(/Actif|Active/);
    await expect(page.getByText(/\d+ candidatures? à trier/).first()).toBeVisible();
    await shot(page, `11-mes-casquettes-${theme}`);

    // Bascule vers la casquette Organisateur : le Direct (lot 22), barre à cinq onglets, casquette mémorisée.
    await page.getByTestId("casquette-organizer").first().click();
    await page.waitForURL(/direct/, { timeout: 15_000 });
    await expect(
      page.getByTestId("orga-direct-event").or(page.getByText("Aucun événement publié à suivre")),
    ).toBeVisible({ timeout: 20_000 });
    for (const label of ["Événements", "Tri", "Direct", "Équipe", "Structure"]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }
    await shot(page, `12-casquette-organisateur-${theme}`);
    await page.getByRole("tab", { name: "Équipe" }).click();
    await page.waitForURL(/equipe/, { timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole("tab", { name: "Direct" })).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toMatch(/equipe|direct/);

    // Appui long sur le logotype : retour à la casquette de base (barre à cinq autres onglets).
    await page.getByTestId("topbar-logo").hover();
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await page.waitForURL(/accueil/, { timeout: 15_000 });
    await expect(page.getByRole("tab", { name: "Profil" })).toBeVisible();
    await ctx.close();
  }

  // Casquette Pro (fiche pro du seed) : rangée dans (pro), même mécanisme ; l'Accueil est au centre.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await openApp(page, "sable");
  await signIn(page, "garage@orasso.local");
  await page.goto("/moi");
  await page.getByTestId("casquette-pro").click();
  // Lot 43 : la casquette Pro s'ouvre sur son Accueil ; le Scanner est un onglet de sa barre.
  await page.waitForURL(/accueil/, { timeout: 15_000 });
  await page.getByRole("tab", { name: "Scanner" }).click();
  await page.waitForURL(/scanner/, { timeout: 15_000 });
  await expect(page.getByRole("tab", { name: "Scanner" })).toBeVisible();
  await shot(page, "13-casquette-pro-sable");
  await ctx.close();
});

test("Écran d'auth : « Mot de passe oublié »", async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(DIR, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await openApp(page, "sable");
  await page.goto("/auth");
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await page.getByLabel("E-mail").last().fill("lea@orasso.local");
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByTestId("reset-sent")).toContainText("Un e-mail t'a été envoyé", { timeout: 20_000 });
  await shot(page, "14-mot-de-passe-oublie-sable");
  await ctx.close();
});
