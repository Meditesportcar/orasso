import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, login, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7m1, côté appli (version web compilée) : les partenariats pro ↔ passionné de bout en bout. Un pro vérifié (Garage_Port,
// du seed) propose depuis le profil d'un passionné neuf (feuille : texte court, véhicule concerné) → « Proposition envoyée » ;
// le passionné la trouve dans Activité › Demandes (texte, voiture) et l'accepte → la ligne « Partenaires » de son profil, « Ses
// partenaires » sur la fiche du pro, « Partenaire : … » servi sur sa voiture → « Mettre fin » (confirmation) → tout disparaît.
// Béton et Sable, 390 px ; captures nommées comme la maquette (pp_feuille, pp_sent, pq_dem, pq_pro, pq_end).
// Lancer avec APP_URL (appli compilée), l'API et le site seedés (le seed « Partenariats » ajoute les partenaires de Garage_Port).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7m1-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function openApp(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1100 }, baseURL: APP });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t as string);
  }, theme);
  return { ctx, page: await ctx.newPage() };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

for (const theme of ["beton", "sable"] as const) {
  test(`partenariat de bout en bout (${theme}) : proposer, demande, accepter, Partenaires, Ses partenaires, mettre fin`, async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const pseudo = `Pt_${unique()}`;
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo);
    const vehicleId = await addVehicleApi(cookie, randomPlate());
    const pro = await login("garage@orasso.local");
    const proId = (await apiCall<{ id: string }>(pro, "GET", "/me/pro")).data.id;

    // 1. Le pro propose depuis le profil du passionné (casquette pro).
    {
      const { ctx, page } = await openApp(browser, theme);
      await signIn(page, "garage@orasso.local");
      await go(page, "/moi");
      await page.getByTestId("casquette-pro").first().click();
      await page.waitForURL(/accueil|fiche|pro/, { timeout: 60_000 });
      await go(page, `/u/${pseudo}`);
      await expect(page.getByTestId("partnership-propose")).toBeVisible();
      await shot(page, "pp_profil", theme);
      await page.getByTestId("partnership-propose").click();
      await expect(page.getByTestId("partnership-send")).toBeVisible();
      // Rien ne part sans texte.
      await expect(page.getByTestId("partnership-send")).toBeDisabled();
      await page.getByTestId("partnership-message").fill("Covering offert, on te suit sur la saison");
      await page.getByTestId(`partnership-vehicle-${vehicleId}`).click();
      await shot(page, "pp_feuille", theme);
      await page.getByTestId("partnership-send").click();
      await expect(page.getByTestId("partnership-pending")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("partnership-propose")).toHaveCount(0);
      await shot(page, "pp_sent", theme);
      await ctx.close();
    }
    const listed = await apiCall<{
      items: { status: string; user: { pseudo: string }; vehicle: { id: string } | null }[];
    }>(pro, "GET", `/pros/${proId}/partnerships`);
    expect(listed.data.items.find((i) => i.user.pseudo === pseudo)).toMatchObject({
      status: "pending",
      vehicle: { id: vehicleId },
    });

    // 2. Le passionné la trouve dans Demandes, avec le texte et la voiture ; il accepte.
    const mine = await openApp(browser, theme);
    await signIn(mine.page, email);
    await go(mine.page, "/activite/demandes");
    const card = mine.page.getByTestId("request-partnership");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("Garage du Port te propose un partenariat");
    await expect(card).toContainText("Covering offert, on te suit sur la saison");
    await expect(mine.page.getByTestId("request-partnership-vehicle")).toContainText("Partenaire : Garage du Port");
    await shot(mine.page, "pq_dem", theme);
    await card.getByRole("button", { name: /Accepter/ }).click();
    await expect(card).toHaveCount(0, { timeout: 20_000 });

    // La voiture porte « Partenaire : Garage du Port » (champ servi à la carte : R7l3 l'affiche).
    const car = await apiCall<{ partner: { name: string; slug: string } | null }>(
      cookie,
      "GET",
      `/me/vehicles/${vehicleId}`,
    );
    expect(car.data.partner).toMatchObject({ name: "Garage du Port", slug: "garage-du-port" });

    // 3. Son profil : la ligne « Partenaires » ; la fiche du pro liste le passionné pour un autre membre.
    await go(mine.page, "/profil");
    // Lot R8b1 : les partenaires sont le 4e compteur de la bande ; il ouvre la liste.
    const cell = mine.page.getByTestId("profil-count-partenaires");
    await expect(cell).toContainText("1", { timeout: 20_000 });
    await cell.click();
    await expect(mine.page.getByTestId("partner-row")).toContainText("Garage du Port");
    await shot(mine.page, "pq_pro", theme);
    {
      const other = await openApp(browser, theme);
      await signIn(other.page, "kenji@orasso.local");
      await go(other.page, "/p/garage-du-port");
      // Depuis R8g, la page s'ouvre sur « Publications » quand le pro en a : « Ses partenaires » est dans « Présentation ».
      await other.page.getByTestId("page-tab-presentation").click({ timeout: 20_000 });
      await expect(other.page.getByTestId("pro-partners")).toContainText(pseudo, { timeout: 20_000 });
      await shot(other.page, "pp_fiche", theme);
      await other.ctx.close();
    }

    // 4. « Mettre fin » : confirmation, puis la ligne disparaît ; la fiche du pro ne le liste plus ; le pro est prévenu.
    await expect(mine.page.getByTestId("partner-row")).toHaveCount(1);
    await mine.page.getByTestId("partner-end").click();
    await expect(mine.page.getByTestId("partnership-end-confirm")).toBeVisible();
    await shot(mine.page, "pq_end", theme);
    await mine.page.getByTestId("partnership-end-confirm").click();
    await expect(mine.page.getByTestId("profil-count-partenaires")).toHaveCount(0, { timeout: 20_000 });
    await mine.ctx.close();

    const after = await apiCall<{ memberPartners: { pseudo: string }[] }>(
      cookie,
      "GET",
      "/pros/by-slug/garage-du-port",
    );
    expect(after.data.memberPartners.map((p) => p.pseudo)).not.toContain(pseudo);
    const gone = await apiCall<{ partner: unknown }>(cookie, "GET", `/me/vehicles/${vehicleId}`);
    expect(gone.data.partner).toBeNull();
    const notes = await apiCall<{ items: { type: string }[] }>(pro, "GET", "/me/notifications");
    expect(JSON.stringify(notes.data)).toContain("partnership_ended");
  });
}
