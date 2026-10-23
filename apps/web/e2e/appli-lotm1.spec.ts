import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, type Cookie, MOBILE, randomPlate, SEED_PASSWORD, samplePhoto, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot M1, côté appli (version web de recette) : l'ajout de véhicule refait d'après les maquettes 1.1 à 1.9. Ordre de
// Damien (photos → plaque → marque et modèle → fiche technique → catégories → envoi), photos au carré par notre écran
// de recadrage, fiche qui se construit, motorisations du catalogue, nuancier, description, préparation qui coche
// « Préparée », styles cachés ou barrés, envoi compact et succès. Les animations (worklets) se vérifient sur le
// téléphone ; ici, les écrans, les règles et ce que l'API enregistre. Captures Béton et Sable à 390 px.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m1-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

/** Photos de test : celles des maquettes si elles sont là (M1_PHOTOS, dossier), sinon des aplats générés. */
function photos(): { name: string; mimeType: string; buffer: Buffer }[] {
  const dir = process.env.M1_PHOTOS;
  const names = ["supra.jpg", "gt86.jpg"];
  if (dir && names.every((n) => existsSync(`${dir}/${n}`))) {
    return names.map((name) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${dir}/${name}`) }));
  }
  return [
    { name: "a.png", mimeType: "image/png", buffer: samplePhoto([200, 200, 205]) },
    { name: "b.png", mimeType: "image/png", buffer: samplePhoto([40, 60, 120]) },
  ];
}

async function open(browser: Browser, theme: "beton" | "sable") {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const next = (page: Page) => page.getByTestId("vehicle-step-next").click();

for (const theme of ["beton", "sable"] as const) {
  test(`ajout de véhicule refait (${theme}) : ordre, carré, catalogue, nuancier, envoi`, async ({ browser }) => {
    test.setTimeout(300_000);
    const pseudo = `AjoutM1${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie: Cookie = await signUpApi(pseudo, email);
    const { ctx, page } = await open(browser, theme);
    await page.goto("/auth");
    await afterOpening(page);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil/, { timeout: 30_000 });
    await page.goto("/vehicule/nouveau");
    await afterOpening(page);

    // 1. Photos : grande case d'appel, « Continuer » grisé sans photo, ligne des 3 photos conseillées.
    await expect(page.getByTestId("vehicle-photo-call")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vehicle-step-next")).toBeDisabled();
    await expect(page.getByTestId("vehicle-step-why")).toContainText("au moins une photo");
    await expect(page.getByTestId("vehicle-photo-cert")).toContainText("3 photos conseillées");
    await expect(page.getByTestId("vehicle-progress")).toBeVisible();
    await shot(page, `${theme}-01-photos-vide`);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("vehicle-photo-add").click();
    await (await chooser).setFiles(photos());

    // Recadrage carré, photo par photo : cadre fixe, zoom − / +, aperçus.
    await expect(page.getByTestId("square-cropper")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Photo 1 sur 2 · format carré")).toBeVisible();
    await page.getByTestId("crop-zoom-in").click();
    await expect(page.getByTestId("crop-zoom-value")).toHaveText("×1,3");
    const stage = page.getByTestId("crop-stage");
    const box = await stage.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 10, { steps: 6 });
      await page.mouse.up();
    }
    await shot(page, `${theme}-02-recadrage`);
    await page.getByTestId("crop-validate").click();
    await expect(page.getByText("Photo 2 sur 2 · format carré")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("crop-validate").click();
    await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("vehicle-photo-cert")).toContainText("2 sur 3");
    await expect(page.getByTestId("vehicle-live-photos")).toHaveText(/2 photos/i);
    await shot(page, `${theme}-03-photos`);
    await expect(page.getByTestId("vehicle-step-next")).toBeEnabled();
    await next(page);

    // 2. Plaque (logique du lot M2, visuel 1.3 et 1.4) : bandeau d'états, « Continuer » mène à la photo à régler,
    // masque noir, loupe pendant le déplacement, « Aucune plaque » confirmé sur la photo, numéro obligatoire.
    await expect(page.getByText("Étape 2 sur 5 · Plaque")).toBeVisible();
    await expect(page.getByTestId("plate-strip")).toBeVisible();
    await next(page);
    await expect(page.getByTestId("plate-message")).toContainText("Photo 1 : pose le cadre");
    await expect(page.getByTestId("vehicle-step-error")).toHaveCount(0);
    await shot(page, `${theme}-04a-plaque-a-regler`);
    await page.getByTestId("plate-frame-add").click();
    await expect(page.getByTestId("plate-message")).toHaveCount(0);
    await expect(page.getByTestId("plate-badge")).toContainText("Photo 1 · plaque masquée");
    const frame = await page.getByTestId("plate-frame").first().boundingBox();
    if (frame) {
      await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
      await page.mouse.down();
      await page.mouse.move(frame.x + frame.width / 2 - 30, frame.y + frame.height / 2 - 20, { steps: 8 });
      await shot(page, `${theme}-04b-loupe`);
      await page.mouse.up();
    }
    await page.getByTestId("plate-thumb-2").click();
    await page.getByTestId("plate-none").click();
    await expect(page.getByTestId("plate-none-confirm")).toContainText("Aucune plaque visible sur cette photo ?");
    await shot(page, `${theme}-04c-aucune-plaque`);
    await page.getByTestId("plate-none-yes").click();
    await expect(page.getByTestId("plate-none")).toHaveAttribute("aria-checked", "true");
    await next(page);
    await expect(page.getByTestId("vehicle-plate-error")).toContainText("Indique le numéro de plaque");
    const plate = randomPlate();
    await page.getByTestId("vehicle-plate").fill(plate);
    await expect(page.getByTestId("vehicle-plate-error")).toHaveCount(0);
    await page.getByTestId("vehicle-former").click();
    await expect(page.getByTestId("vehicle-former-cert")).toContainText("ne peut pas être certifié");
    await page.getByTestId("vehicle-former").click();
    await shot(page, `${theme}-04-plaque`);
    await next(page);

    // 3. Marque et modèle : types à icônes, recherche, fil d'Ariane, « Continuer » actif seulement au bout du choix.
    await expect(page.getByText("Étape 3 sur 5 · Marque et modèle")).toBeVisible();
    await expect(page.getByTestId("vehicle-step-next")).toBeDisabled();
    await page.getByLabel("Marque ou modèle").fill("toyota");
    await page.getByRole("radio", { name: "Toyota", exact: false }).first().click();
    await page.getByRole("radio", { name: "Supra", exact: false }).first().click();
    await expect(page.getByRole("button", { name: /Marque : Toyota, changer/ })).toBeVisible();
    await expect(page.getByTestId("vehicle-step-next")).toBeDisabled();
    await page.getByRole("radio", { name: "Mk5", exact: false }).first().click();
    await expect(page.getByTestId("vehicle-step-next")).toBeEnabled();
    await expect(page.getByTestId("vehicle-live-name")).toHaveText(/Toyota Supra/i);
    await shot(page, `${theme}-05-marque`);
    await next(page);

    // 4. Fiche technique : motorisation du catalogue (puissance et poids remplis), année, nuancier, description,
    // préparation.
    await expect(page.getByText("Étape 4 sur 5 · Fiche technique")).toBeVisible();
    await page.getByRole("radio", { name: /3\.0 L6 turbo/ }).click();
    await expect(page.getByTestId("vehicle-live-specs")).toContainText("340 ch");
    await page.getByRole("radio", { name: "2021" }).click();
    await shot(page, `${theme}-06-fiche`);
    await page.getByTestId("vehicle-color-family-grey").click();
    await page.getByTestId("vehicle-color-Gris acier").click();
    await expect(page.getByTestId("vehicle-color-name")).toHaveText("Gris acier · métallisée");
    await page.getByTestId("vehicle-colors").scrollIntoViewIfNeeded();
    await shot(page, `${theme}-07-nuancier`);
    await page.getByTestId("vehicle-description").fill("Sortie le dimanche, échappement inox et jantes forgées.");
    await page.getByTestId("vehicle-prep-wheels").click();
    await page.getByTestId("vehicle-prep-exhaust").click();
    await page.getByTestId("vehicle-prep-wheels").scrollIntoViewIfNeeded();
    await shot(page, `${theme}-08-preparation`);
    await next(page);

    // 5. Catégories : origine sous cadenas, « Préparée » cochée d'office, pas de « Moto » pour une voiture.
    await expect(page.getByText("Étape 5 sur 5 · Catégories")).toBeVisible();
    await expect(page.getByTestId("vehicle-origin")).toContainText("Japonaise");
    await expect(page.getByTestId("vehicle-origin")).toContainText("JDM · déduit de Toyota");
    await expect(page.getByRole("checkbox", { name: "Préparée" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("checkbox", { name: /^Moto/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^Utilitaire/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^4x4/ })).toHaveCount(0);
    await expect(page.getByTestId("vehicle-styles-note")).toContainText("Préparée est cochée");
    await expect(page.getByTestId("vehicle-step-next")).toHaveText(/Envoyer/i);
    await shot(page, `${theme}-09-categories`);
    // Envoi ralenti (recette) pour voir l'écran d'envoi : chaque photo attend un peu avant de partir.
    await page.route("**/api/me/vehicles/*/photos", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await next(page);

    // Envoi compact (la voiture drifte autour du O, le pourcentage à côté), jamais « vous pouvez quitter l'écran ».
    await expect(page.getByTestId("vehicle-send-percent")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("vehicle-sending")).toContainText("Envoi des photos");
    await expect(page.getByText(/quitter l'écran/i)).toHaveCount(0);
    await shot(page, `${theme}-10-envoi`);
    await expect(page.getByTestId("vehicle-done-title")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("vehicle-done-title")).toHaveText(/Ta Supra est au garage/i);
    await expect(page.getByTestId("vehicle-done-share")).toHaveText(/Partager son affiche/i);
    await shot(page, `${theme}-11-succes`);

    // Ce que l'API a enregistré : couleur, motorisation, préparation, description, photos carrées.
    const mine = await apiCall<
      {
        color: string | null;
        engine: string | null;
        powerHp: number | null;
        weightKg: number | null;
        preparation: string | null;
        description: string | null;
        categories: { slug: string }[];
        photos: { width: number; height: number }[];
      }[]
    >(cookie, "GET", "/me/vehicles");
    const v = mine.data[0];
    expect(v?.color).toBe("Gris acier");
    expect(v?.engine).toBe("3.0 L6 turbo");
    expect(v?.powerHp).toBe(340);
    expect(v?.weightKg).toBe(1495);
    expect(v?.preparation).toBe("Échappement · Jantes");
    expect(v?.description).toContain("Sortie le dimanche");
    expect(v?.categories.map((c) => c.slug)).toContain("preparee");
    expect(v?.photos).toHaveLength(2);
    for (const p of v?.photos ?? []) expect(p.width).toBe(p.height);
    await ctx.close();
  });
}
