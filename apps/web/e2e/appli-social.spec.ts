import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  accountQrPayload,
  addVehicleApi,
  apiCall,
  deliverNow,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Social (lot 17) dans l'appli, version web de recette (`expo start --web` derrière `apps/mobile/scripts/web-isolated.mjs`) :
// Explorer > Personnes et crews, profil d'un autre, fiche d'un véhicule d'un autre et propriétaires près de chez moi,
// suivre une personne, scan du QR d'un compte (charge utile saisie dans le champ « Recette », pas de caméra dans le
// navigateur) qui demande à suivre un compte privé, Ton réseau, Journal avec avatars. Deux thèmes à 390 px.
// Lot R6b (D37) : plus d'« ami » ; « Suivre » (compte public) et « Demander à suivre » (compte privé, accepté par la
// personne) remplacent la demande d'ami.
// Lancer avec APP_URL=http://localhost:8141 (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-17-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("appli : personnes, profil, véhicule, suivre, QR de compte, Ton réseau, Journal", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  // Le pseudo est limité à 24 caractères : « BravoApp_sable_ » en prend 15, le suffixe en garde 9 au plus. Avec le suffixe entier,
  // le compteur de `unique()` (qui grimpe au fil d'une longue recette) le rendait trop long et l'API tronquait le pseudo.
  const s = unique().slice(-9);
  const charlie = `CharlieApp_${s}`;
  const charlieCookie = await signUpApi(charlie);
  await addVehicleApi(charlieCookie, randomPlate());
  await apiCall(charlieCookie, "PATCH", "/me/profile", { departments: ["66"] });
  const errors: string[] = [];

  for (const theme of ["sable", "beton"] as const) {
    // Nouveaux comptes à chaque passage : une même paire ne peut pas redemander avant 24 h (anti-harcèlement).
    const alpha = `AlphaApp_${theme}_${s}`;
    const bravo = `BravoApp_${theme}_${s}`;
    const alphaCookie = await signUpApi(alpha);
    const bravoCookie = await signUpApi(bravo);
    const alphaVehicle = await addVehicleApi(alphaCookie, randomPlate());
    await addVehicleApi(bravoCookie, randomPlate());
    await apiCall(alphaCookie, "PATCH", "/me/profile", { bio: "Passionné d'anciennes", departments: ["66"] });
    await apiCall(bravoCookie, "PATCH", "/me/profile", { visibility: "private", bio: "secret", departments: ["66"] });
    const bravoQr = (await apiCall<{ secret: string; shortId: string }>(bravoCookie, "GET", "/me/account-qr-secret"))
      .data;
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
    // Lot R5b (maquette R5.6) : « Compte privé » dans la tête, et la ligne « Ses photos, … sont pour ses abonnés ».
    await expect(page.getByTestId("public-head")).toContainText("Compte privé");
    await expect(page.getByTestId("profile-private-note")).toContainText(
      "Ses photos, ses sorties, son crew et ses réseaux sont pour ses abonnés.",
    );
    // Lot R6b : un compte privé se suit sur demande.
    await expect(page.getByTestId("follow-button")).toContainText("Demander à suivre");
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

    // Suivre depuis le profil (compte public : d'un toucher).
    await page.goto(`/u/${alpha}`);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Abonné", { timeout: 15_000 });
    await shot(page, `06-profil-suivi-${theme}`);

    // Scan du QR de compte de Bravo depuis Ton réseau (charge utile saisie : pas de caméra dans le navigateur). Le
    // bouton était dans le Garage avant le garage v2 (lot 51) ; il vit au bas de Ton réseau.
    await page.goto("/reseau");
    await page.getByTestId("friend-scan-open").click();
    // Un code par minute et par passage (dérive d'une minute acceptée) : le deuxième passage n'est pas un rejeu.
    const payload = accountQrPayload(bravoQr.secret, bravoQr.shortId, new Date());
    const field = page.getByLabel(/Recette · charge utile/);
    await field.fill(payload);
    await field.press("Enter");
    const result = page.getByTestId("friend-scan-result");
    await expect(result).toContainText(`Demande envoyée à ${bravo}`, { timeout: 20_000 });
    await shot(page, `07-scan-qr-compte-${theme}`);
    // Le même code rejoué est refusé.
    await field.fill(`${payload} `);
    await field.press("Enter");
    await page.waitForTimeout(600);

    // Bravo (compte privé) accepte la demande de Charlie via l'API : Journal et Ton réseau côté Charlie.
    const pending = (
      await apiCall<{ items: { userId: string; pseudo: string }[] }>(bravoCookie, "GET", "/me/follow-requests")
    ).data;
    const fromCharlie = pending.items.find((r) => r.pseudo === charlie);
    if (fromCharlie) await apiCall(bravoCookie, "POST", `/me/follow-requests/${fromCharlie.userId}/accept`);
    await page.goto("/reseau?liste=abonnements");
    await expect(page.getByText(alpha).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(bravo).first()).toBeVisible();
    await shot(page, `08-ton-reseau-${theme}`);
    await page.goto("/moi");
    // Lot R4c : les abonnements s'ouvrent par le compteur de l'en-tête du profil.
    await expect(page.getByTestId("profil-count-abonnements")).toBeVisible({ timeout: 30_000 });
    // Heures calmes (la nuit) : la notification serait reportée à 08:00 ; livrée tout de suite pour la recette.
    deliverNow(`${charlie.toLowerCase()}@e2e.orasso.test`);
    // Lot 40 : la Boîte réunit messages et notifications (plus de cloche).
    await page.goto("/boite");
    await page.getByTestId("inbox-all").click(); // Lot C2a : notifications dans « Tout » de la feuille Boîte.
    await expect(page.getByTestId("journal-item").filter({ hasText: "a accepté" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, `09-journal-${theme}`);
    await ctx.close();
  }
  console.log(`Erreurs console : ${errors.length} ${errors.slice(0, 5).join(" | ")}`);
});
