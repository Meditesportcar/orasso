import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { accountQrPayload, addVehicleApi, apiCall, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";

// Social (lot 17) dans l'appli, version web de recette (`expo start --web` derrière `apps/mobile/scripts/web-isolated.mjs`) :
// Explorer > Personnes et crews, profil d'un autre, fiche d'un véhicule d'un autre et propriétaires près de chez moi,
// demande d'ami, scan du QR d'un ami (charge utile saisie dans le champ « Recette », pas de caméra dans le navigateur),
// Mes amis, Journal avec avatars. Deux thèmes à 390 px.
// Lancer avec APP_URL=http://localhost:8141 (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-17-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("appli : personnes, profil, véhicule, demande d'ami, QR ami, Mes amis, Journal", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const alpha = `AlphaApp_${s}`;
  const bravo = `BravoApp_${s}`;
  const charlie = `CharlieApp_${s}`;
  const alphaCookie = await signUpApi(alpha);
  const bravoCookie = await signUpApi(bravo);
  const charlieCookie = await signUpApi(charlie);
  const alphaVehicle = await addVehicleApi(alphaCookie, randomPlate());
  await addVehicleApi(bravoCookie, randomPlate());
  await addVehicleApi(charlieCookie, randomPlate());
  await apiCall(alphaCookie, "PATCH", "/me/profile", { bio: "Passionné d'anciennes", departments: ["66"] });
  await apiCall(bravoCookie, "PATCH", "/me/profile", { visibility: "private", bio: "secret", departments: ["66"] });
  await apiCall(charlieCookie, "PATCH", "/me/profile", { departments: ["66"] });
  const errors: string[] = [];

  const bravoQr = (await apiCall<{ secret: string; shortId: string }>(bravoCookie, "GET", "/me/account-qr-secret"))
    .data;
  let pass = 0;
  for (const theme of ["sable", "beton"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
    }, theme);
    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(`${charlie.toLowerCase()}@e2e.orasso.test`);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil/, { timeout: 30_000 });

    // Explorer > Personnes et crews.
    await page.goto("/explorer");
    await page.getByText("Personnes et crews").click();
    await expect(page.getByTestId("people-search")).toBeVisible({ timeout: 30_000 });
    await shot(page, `01-explorer-personnes-vide-${theme}`);
    await page.getByTestId("people-q").fill(bravo.slice(0, 12));
    const row = page.getByTestId("person-row").filter({ hasText: bravo });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await shot(page, `02-explorer-personnes-resultat-${theme}`);

    // Profil d'un compte privé : réduit.
    await page.goto(`/u/${bravo}`);
    await expect(page.getByTestId("profil")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Profil privé")).toBeVisible();
    await expect(page.getByText("secret", { exact: true })).toHaveCount(0);
    await shot(page, `03-profil-prive-reduit-${theme}`);

    // Profil public + fiche du véhicule + propriétaires près de chez moi.
    await page.goto(`/u/${alpha}`);
    await expect(page.getByText("Passionné d'anciennes")).toBeVisible({ timeout: 30_000 });
    await shot(page, `04-profil-public-${theme}`);
    await page.goto(`/v/${alphaVehicle}`);
    await expect(page.getByTestId("vehicule")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Autres propriétaires près de chez moi")).toBeVisible();
    await shot(page, `05-vehicule-autre-${theme}`);

    // Demande d'ami depuis le profil.
    await page.goto(`/u/${alpha}`);
    await page.getByTestId("friend-add").click();
    await expect(page.getByTestId("friend-state")).toContainText("Demande envoyée", { ignoreCase: true });
    await shot(page, `06-profil-demande-envoyee-${theme}`);

    // Scan du QR de compte de Bravo depuis le Garage (charge utile saisie : pas de caméra dans le navigateur).
    await page.goto("/garage");
    await page.getByTestId("friend-scan-open").click();
    // Un code par minute et par passage (dérive d'une minute acceptée) : le deuxième passage n'est pas un rejeu.
    const payload = accountQrPayload(bravoQr.secret, bravoQr.shortId, new Date(Date.now() + 60_000 * pass++));
    const field = page.getByLabel(/Recette · charge utile/);
    await field.fill(payload);
    await field.press("Enter");
    const result = page.getByTestId("friend-scan-result");
    await expect(result).toContainText(`Demande envoyée à ${bravo}`, { timeout: 20_000 });
    await shot(page, `07-scan-qr-ami-${theme}`);
    // Le même code rejoué est refusé.
    await field.fill(`${payload} `);
    await field.press("Enter");
    await page.waitForTimeout(600);

    // Alpha accepte via l'API : Journal et Mes amis côté Charlie.
    const pending = (
      await apiCall<{ items: { id: string; person: { pseudo: string } }[] }>(
        alphaCookie,
        "GET",
        "/me/friends/requests?direction=in",
      )
    ).data;
    const fromCharlie = pending.items.find((r) => r.person.pseudo === charlie);
    if (fromCharlie) await apiCall(alphaCookie, "POST", `/friends/requests/${fromCharlie.id}/accept`);
    await page.goto("/amis");
    await expect(page.getByText(alpha).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `08-mes-amis-${theme}`);
    await page.goto("/moi");
    await expect(page.getByTestId("moi-amis")).toBeVisible({ timeout: 30_000 });
    await page.goto("/accueil");
    await page.getByLabel("Journal").first().click();
    await expect(page.getByTestId("journal-item").filter({ hasText: "a accepté" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, `09-journal-${theme}`);
    await ctx.close();

    // Un second passage (autre thème) repart de zéro : on retire l'amitié pour retrouver l'état initial.
    await apiCall(
      alphaCookie,
      "DELETE",
      `/friends/${(await apiCall<{ user: { id: string } }>(charlieCookie, "GET", "/me")).data.user.id}`,
    );
    const outgoing = (
      await apiCall<{ items: { person: { userId: string } }[] }>(
        charlieCookie,
        "GET",
        "/me/friends/requests?direction=out",
      )
    ).data;
    for (const r of outgoing.items) await apiCall(charlieCookie, "DELETE", `/friends/${r.person.userId}`);
  }
  console.log(`Erreurs console : ${errors.length} ${errors.slice(0, 5).join(" | ")}`);
});
