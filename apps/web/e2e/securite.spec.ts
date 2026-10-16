import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, unique } from "./helpers";

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
async function mailSent(to: string, subject: string, since: number): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
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
  const kenji = await login("kenji@orasso.local");
  const me = async () =>
    (await apiCall<{ profile: { inviteToken: string; pointsSeason: number } }>(kenji, "GET", "/me")).data.profile;
  const before = await me();
  const s = unique();
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
  // Compte du seed (créé il y a plus de 10 minutes).
  const email = "julie@orasso.local";
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

test("clé d'accès créée sur /app/securite → la double authentification n'est plus exigée", async ({ browser }) => {
  const s = unique();
  const email = `cle-${s}@orasso.test`;
  const { ctx, page } = await newPage(browser);
  await signUpInBrowser(page, `Cle_${s}`.slice(0, 24), email, "motdepasse-e2e-123");
  const cookie = await login(email, "motdepasse-e2e-123");
  const created = await apiCall<{ slug: string }>(cookie, "POST", "/structures", {
    kind: "club",
    name: `Club clé ${s}`,
    departments: ["66"],
  });
  expect(created.status, JSON.stringify(created.data)).toBeLessThan(300);
  expect((await apiCall<{ twoFactorRequired: boolean }>(cookie, "GET", "/me")).data.twoFactorRequired).toBe(true);

  // Authentificateur virtuel de Chrome (Face ID / empreinte simulés).
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto("/app/securite");
  await page.getByLabel("Nom de la clé").fill("Téléphone de test");
  await page.getByRole("button", { name: "Ajouter une clé d'accès" }).click();
  await expect(page.getByTestId("passkey-row")).toHaveCount(1);
  await expect(page.getByTestId("passkey-row")).toContainText("Téléphone de test");
  expect((await apiCall<{ twoFactorRequired: boolean }>(cookie, "GET", "/me")).data.twoFactorRequired).toBe(false);

  // Connexion par la clé, sans mot de passe.
  await page.getByRole("button", { name: "Déconnexion" }).first().click();
  await page.goto("/connexion?retour=/app/moi");
  await page.getByRole("button", { name: "Se connecter avec une clé d'accès" }).click();
  await page.waitForURL(/\/app\/moi/);
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
  await expect(page.getByTestId("public-preview")).toContainText(`Partant_${s}`.slice(0, 24));
  const zone = page.getByTestId("delete-account");
  await zone.getByLabel("Ton mot de passe", { exact: true }).fill("motdepasse-e2e-123");
  await zone.getByText("Je comprends que la suppression est définitive.").click();
  await zone.getByRole("button", { name: "Supprimer mon compte" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  expect(await mailSent(email, "Ton compte Orasso est supprimé", since)).toBe(true);
  const retry = await apiCall(null, "POST", "/auth/sign-in/email", { email, password: "motdepasse-e2e-123" });
  expect(retry.status).toBe(401);
  await ctx.close();
});
