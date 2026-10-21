import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot 15 : connexion à l'appli d'un compte qui a la double authentification (navigateur, recette web) — mot de passe,
// puis étape « code » (code de secours ici), session qui prouve le second facteur. Deux thèmes à 390 px.
// Lancer avec APP_URL=http://localhost:8151 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-15-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

/** Code TOTP (RFC 6238, 6 chiffres, 30 s) d'un secret base32 d'URI otpauth. */
function totp(base32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 0x0f;
  const n = (((h[o] ?? 0) & 0x7f) << 24) | ((h[o + 1] ?? 0) << 16) | ((h[o + 2] ?? 0) << 8) | (h[o + 3] ?? 0);
  return String(n % 1_000_000).padStart(6, "0");
}

test("appli : connexion avec double authentification (code de secours), session qui la prouve", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const pseudo = `Orga2fa_${s}`.slice(0, 24);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  // Organisateur (propriétaire d'une structure) : la double authentification est exigée.
  expect(
    (await apiCall(cookie, "POST", "/structures", { kind: "club", name: `Club 2FA ${s}`, departments: ["66"] })).status,
  ).toBeLessThan(300);
  const enabled = await apiCall<{ totpURI: string; backupCodes: string[] }>(cookie, "POST", "/auth/two-factor/enable", {
    password: SEED_PASSWORD,
  });
  expect(enabled.status).toBe(200);
  const secret = new URL(enabled.data.totpURI).searchParams.get("secret") ?? "";
  expect((await apiCall(cookie, "POST", "/auth/two-factor/verify-totp", { code: totp(secret) })).status).toBe(200);

  for (const [i, theme] of (["sable", "beton"] as const).entries()) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
    }, theme);
    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await expect(page.getByTestId("two-factor-step")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/10-code-double-authentification-${theme}.png` });
    // Mauvais code : message clair, on reste sur l'étape.
    await page.getByLabel("Code à 6 chiffres").fill("000000");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("alert")).toContainText(/incorrect/i);
    // Code de secours.
    await page.getByRole("button", { name: "Utiliser un code de secours" }).click();
    await page.getByLabel("Code de secours").fill(enabled.data.backupCodes[i] ?? "");
    await page.getByRole("button", { name: "Valider" }).click();
    await page.waitForURL(/accueil/, { timeout: 30_000 });
    const token = await page.evaluate(() => localStorage.getItem("orasso.session-token"));
    expect(token).toBeTruthy();
    const res = await fetch(`http://localhost:${process.env.API_PORT ?? 3001}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    // Organisateur connecté avec le code : la session prouve la double authentification.
    expect(((await res.json()) as { twoFactorRequired: boolean }).twoFactorRequired).toBe(false);
    await ctx.close();
  }
});
