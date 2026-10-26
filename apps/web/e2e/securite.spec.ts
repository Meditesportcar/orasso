import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { apiCall, fillArrivee, login, loginInBrowser, SEED_PASSWORD, signUpApi, unique } from "./helpers";

// Lot 15 : compte et sécurité de bout en bout, avec le transport d'e-mails « journal » (fichiers `.data/mail`).
// Prérequis : API et site lancés sur la base locale avec le seed.
const MAIL_DIR = resolve(import.meta.dirname, "../../..", process.env.DATA_DIR ?? ".data", "mail");
const OTHER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Lot15Test";

/** Lien `path?token=…` du dernier e-mail envoyé à `to` qui en contient un (attend jusqu'à 15 s). */
async function linkFromMail(to: string, path: string, since: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const files = readdirSync(MAIL_DIR)
      .map((name) => ({ name, at: statSync(resolve(MAIL_DIR, name)).mtimeMs }))
      .filter((f) => f.at >= since - 1000)
      .sort((a, b) => b.at - a.at);
    for (const f of files) {
      const html = readFileSync(resolve(MAIL_DIR, f.name), "utf8");
      if (!html.startsWith(`<!-- À : ${to} -->`)) continue;
      const m = new RegExp(`href="(https?://[^"]*${path}\\?token=[^"]+)"`).exec(html);
      if (m?.[1]) return m[1].replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Aucun e-mail ${path} pour ${to}`);
}

/** Un e-mail dont le sujet contient `subject` est-il parti vers `to` depuis `since` ? */
async function mailSent(to: string, subject: string, since: number, tries = 30): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    for (const name of readdirSync(MAIL_DIR)) {
      const file = resolve(MAIL_DIR, name);
      if (statSync(file).mtimeMs < since - 1000) continue;
      const html = readFileSync(file, "utf8");
      if (html.startsWith(`<!-- À : ${to} -->`) && html.includes(subject)) return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function signUpInBrowser(page: Page, pseudo: string, email: string, password: string) {
  await page.goto("/inscription?retour=/app");
  await page.getByLabel("Pseudo").fill(pseudo);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await fillArrivee(page);
  await page.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL((u) => u.pathname === "/app");
}

async function newPage(browser: Browser, userAgent?: string, ip?: string) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent,
    extraHTTPHeaders: ip ? { "x-forwarded-for": ip } : undefined,
  });
  return { ctx, page: await ctx.newPage() };
}

test("inscription → e-mail de vérification → lien → adresse confirmée", async ({ browser }) => {
  const s = unique();
  const email = `verif-${s}@orasso.test`;
  const since = Date.now();
  const { ctx, page } = await newPage(browser);
  await signUpInBrowser(page, `Verif_${s}`.slice(0, 24), email, "motdepasse-e2e-123");
  await expect(page.getByTestId("verify-banner")).toBeVisible();
  const link = await linkFromMail(email, "/verification-email", since);
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.getByTestId("email-verified")).toBeVisible();
  await page.goto("/app");
  await expect(page.getByTestId("verify-banner")).toHaveCount(0);
  await ctx.close();
});

test("lien d'ami → inscription → adresse confirmée → +10 points au parrain", async ({ browser }) => {
  // Parrain neuf à chaque passage (lot 34) : Kenji partage ses points avec d'autres recettes et atteint vite le plafond
  // de 20 parrainages par saison sur une base rejouée sans --reset.
  const s = unique();
  const sponsor = await signUpApi(`Parrain_${s}`.slice(0, 24), `parrain-${s}@orasso.test`);
  const me = async () =>
    (await apiCall<{ profile: { inviteToken: string; pointsSeason: number } }>(sponsor, "GET", "/me")).data.profile;
  const before = await me();
  const email = `filleul-${s}@orasso.test`;
  const { ctx, page } = await newPage(browser);
  await page.goto(`/ami/${before.inviteToken}`);
  await expect(page.getByTestId("ami")).toContainText("t'invite sur Orasso");
  const since = Date.now();
  await signUpInBrowser(page, `Filleul_${s}`.slice(0, 24), email, "motdepasse-e2e-123");
  const link = await linkFromMail(email, "/verification-email", since);
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.getByTestId("email-verified")).toBeVisible();
  expect((await me()).pointsSeason).toBe(before.pointsSeason + 10);
  await ctx.close();
});

test("mot de passe oublié → e-mail → nouveau mot de passe → sessions révoquées, alerte reçue", async ({ browser }) => {
  const s = unique();
  const email = `oubli-${s}@orasso.test`;
  const first = await newPage(browser);
  await signUpInBrowser(first.page, `Oubli_${s}`.slice(0, 24), email, "ancien-mot-de-passe-1");

  const since = Date.now();
  const second = await newPage(browser);
  await second.page.goto("/connexion");
  await second.page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await second.page.getByLabel("E-mail").fill(email);
  await second.page.getByRole("button", { name: "Recevoir le lien" }).click();
  await expect(second.page.getByTestId("reset-sent")).toBeVisible();
  const link = await linkFromMail(email, "/reinitialisation", since);
  await second.page.goto(new URL(link).pathname + new URL(link).search);
  await second.page.getByLabel("Nouveau mot de passe", { exact: true }).fill("nouveau-mot-de-passe-2");
  await second.page.getByLabel("Encore une fois", { exact: true }).fill("nouveau-mot-de-passe-2");
  await second.page.getByRole("button", { name: "Enregistrer" }).click();
  await second.page.waitForURL(/\/connexion\?reinitialise=1/);
  await loginInBrowser(second.page, email, "nouveau-mot-de-passe-2", "/app");
  await expect(second.page).toHaveURL(/\/app$/);

  // L'ancienne session (premier navigateur) est révoquée.
  await first.page.goto("/app/acces");
  await expect(first.page).toHaveURL(/\/connexion/);
  expect(await mailSent(email, "Ton mot de passe a été changé", since)).toBe(true);
  await first.ctx.close();
  await second.ctx.close();
});

test("connexion depuis un autre navigateur → e-mail « nouvelle connexion »", async ({ browser }) => {
  // Compte du seed, vieilli d'un jour (lot 34) : juste après un `db:seed --reset`, il a moins de 10 minutes et la règle
  // « pas d'alerte pour un compte neuf » ne l'alerterait pas.
  const email = "julie@orasso.local";
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query(`update "user" set created_at = now() - interval '1 day' where email = $1`, [email]);
  await db.end();
  const a = await newPage(browser);
  await loginInBrowser(a.page, email, SEED_PASSWORD, "/app");
  const since = Date.now();
  // Adresse au hasard (relayée par le site comme le fait nginx) : appareil jamais vu, même si le test est rejoué.
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7`;
  const b = await newPage(browser, OTHER_UA, ip);
  await loginInBrowser(b.page, email, SEED_PASSWORD, "/app/securite");
  expect(await mailSent(email, "Nouvelle connexion à ton compte", since)).toBe(true);
  await expect(b.page.getByTestId("session-row").first()).toBeVisible();
  await a.ctx.close();
  await b.ctx.close();
});

/** Authentificateur virtuel de Chrome (Face ID / empreinte simulés) ; renvoie son identifiant. */
async function virtualAuthenticator(ctx: BrowserContext, page: Page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

async function addKey(page: Page, name: string) {
  await page.goto("/app/securite");
  await page.getByLabel("Nom de la clé").fill(name);
  await page.getByRole("button", { name: "Ajouter une clé d'accès" }).click();
}

async function signInWithKey(page: Page, retour: string) {
  // Lot C5 : la déconnexion est dans Profil (`/app/moi`), plus dans l'en-tête.
  await page.goto("/app/moi");
  // Lot R5b : « Se déconnecter » est une ligne de « Réglages » dans /app/moi.
  await page.goto(`/connexion?retour=${retour}`);
  await page.getByRole("button", { name: "Se connecter avec une clé d'accès" }).click();
}

const sessionCookieOf = async (ctx: BrowserContext) =>
  (await ctx.cookies())
    .filter((c) => c.name === "better-auth.session_token")
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

type MeHint = { twoFactorRequired: boolean; twoFactorHint: string | null };

test("clé d'accès : le mot de passe seul ne prouve rien et n'ajoute aucun facteur ; le titulaire, connecté par sa clé, en ajoute une autre", async ({
  browser,
}) => {
  const s = unique();
  const email = `cle-${s}@orasso.test`;
  const { ctx, page } = await newPage(browser);
  await signUpInBrowser(page, `Cle_${s}`.slice(0, 24), email, "motdepasse-e2e-123");
  const cookie = await login(email, "motdepasse-e2e-123");
  const created = await apiCall(cookie, "POST", "/structures", {
    kind: "club",
    name: `Club clé ${s}`,
    departments: ["66"],
  });
  expect(created.status, JSON.stringify(created.data)).toBeLessThan(300);
  const first = await virtualAuthenticator(ctx, page);

  // Premier facteur du compte (aucun encore) : autorisé depuis la session récente (amorçage).
  await addKey(page, "Téléphone");
  await expect(page.getByTestId("passkey-row")).toHaveCount(1);
  // Ajouter un facteur déconnecte les autres appareils : nouvelle session par mot de passe seul.
  expect((await apiCall(cookie, "GET", "/me")).status).toBe(401);
  const password = await login(email, "motdepasse-e2e-123");
  const keyId = (await apiCall<{ id: string }[]>(password, "GET", "/auth/passkey/list-user-passkeys")).data[0]?.id;

  // Mot de passe seul + clé existante : double authentification non prouvée, et aucun facteur ne peut changer.
  expect((await apiCall<MeHint>(password, "GET", "/me")).data).toMatchObject({
    twoFactorRequired: true,
    twoFactorHint: "passkey_sign_in",
  });
  expect((await apiCall(password, "GET", "/auth/passkey/generate-register-options")).status).toBe(403);
  expect((await apiCall(password, "POST", "/auth/passkey/verify-registration", { response: {} })).status).toBe(403);
  expect((await apiCall(password, "POST", "/auth/passkey/delete-passkey", { id: keyId })).status).toBe(403);
  expect((await apiCall(password, "POST", "/auth/two-factor/enable", { password: "motdepasse-e2e-123" })).status).toBe(
    403,
  );
  await page.goto("/app/securite");
  await expect(page.getByTestId("passkey-sign-in-needed")).toBeVisible();

  // Connexion par la clé : la session prouve le second facteur ; le titulaire ajoute une deuxième clé.
  await signInWithKey(page, "/app/securite");
  // Le chemin exact (et non « /app/securite » contenu dans ?retour= de la page de connexion).
  await page.waitForURL((u) => u.pathname === "/app/securite");
  expect((await apiCall<MeHint>(await sessionCookieOf(ctx), "GET", "/me")).data).toMatchObject({
    twoFactorRequired: false,
    twoFactorHint: null,
  });
  await expect(page.getByTestId("passkey-sign-in-needed")).toHaveCount(0);
  // Deuxième appareil (l'authentificateur qui porte déjà la première clé la refuserait en double).
  await first.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first.authenticatorId });
  await virtualAuthenticator(ctx, page);
  await addKey(page, "Ordinateur");
  await expect(page.getByTestId("passkey-row")).toHaveCount(2);
  await ctx.close();
});

test("clé sans vérification de l'utilisateur : connexion refusée avec un message clair", async ({ browser }) => {
  const s = unique();
  const email = `cle-uv-${s}@orasso.test`;
  const { ctx, page } = await newPage(browser);
  await signUpInBrowser(page, `CleUv_${s}`.slice(0, 24), email, "motdepasse-e2e-123");
  await virtualAuthenticator(ctx, page);
  await addKey(page, "Clé de sécurité");
  await expect(page.getByTestId("passkey-row")).toHaveCount(1);
  // Réponse d'une clé qui n'a pas vérifié l'utilisateur (simple présence, comme une clé de sécurité sans code) : le
  // bit UV des données d'authentificateur est mis à 0 en route vers l'API, qui doit refuser.
  await page.route("**/api/auth/passkey/verify-authentication", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      response?: { response?: { authenticatorData?: string } };
    };
    const data = body.response?.response?.authenticatorData;
    if (data && body.response?.response) {
      const bytes = Buffer.from(data, "base64url");
      bytes[32] = (bytes[32] ?? 0) & ~0x04;
      body.response.response.authenticatorData = bytes.toString("base64url");
    }
    await route.continue({ postData: JSON.stringify(body) });
  });
  await signInWithKey(page, "/app");
  await expect(page.getByRole("alert")).toContainText("Ta clé doit demander ton code ou ton empreinte");
  await expect(page).toHaveURL(/\/connexion/);
  await ctx.close();
});

test("suppression du compte depuis /app/moi → anonymisé, connexion impossible, e-mail de confirmation", async ({
  browser,
}) => {
  const s = unique();
  const email = `partant-${s}@orasso.test`;
  const { ctx, page } = await newPage(browser);
  await signUpInBrowser(page, `Partant_${s}`.slice(0, 24), email, "motdepasse-e2e-123");
  const since = Date.now();
  await page.goto("/app/moi");
  // Lot R5b : la carte du profil en tête de /app/moi (l'aperçu est sur /app/profil-public).
  const zone = page.getByTestId("delete-account");
  await zone.getByLabel("Ton mot de passe", { exact: true }).fill("motdepasse-e2e-123");
  await zone.getByText("Je comprends que la suppression est définitive.").click();
  await zone.getByRole("button", { name: "Supprimer mon compte" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  // L'e-mail de confirmation est parti avant l'anonymisation (vérifié par les tests de l'API) ; ensuite, plus aucune
  // copie du transport « journal » ne garde l'adresse supprimée.
  expect(await mailSent(email, "Ton compte Orasso est supprimé", since, 2)).toBe(false);
  // Plus de session dans ce navigateur.
  await page.goto("/app/acces");
  await expect(page).toHaveURL(/\/connexion/);
  const retry = await apiCall(null, "POST", "/auth/sign-in/email", { email, password: "motdepasse-e2e-123" });
  expect(retry.status).toBe(401);
  await ctx.close();
});
