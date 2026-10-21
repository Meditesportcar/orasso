import { expect, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  createEvent,
  decideApi,
  fillArrivee,
  login,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  simulateSettle,
  unique,
} from "./helpers";

// Parcours n° 1 de bout en bout : visiteur → inscription → véhicule → candidature → l'organisateur retient au clavier
// → QR dans « Accès » → le staff pointe (à la main et par plaque) → J+2 simulé → points dans le carnet de route.
test("parcours passionné, tri, pointage et points", async ({ browser }) => {
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer);
  // Lot 47 : créneau d'arrivée des exposants (17 h 30 – 18 h 15, strict) : la case « J'ai vu » est demandée.
  const slot = await apiCall(organizer, "PATCH", `/events/${event.id}`, {
    arrivals: { exhibitors: { from: "17:30", to: "18:15", strict: true, note: "Entrée côté port." }, public: null },
  });
  expect(slot.status).toBe(200);
  const suffix = unique();
  const pseudo = `Pilote_${suffix}`;
  const plate = randomPlate();

  // --- 1. Visiteur : page événement, sans compte ---
  const fan = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await fan.newPage();
  await page.goto(`/e/${event.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(event.title);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /E2E/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /og-image\.png$/);
  await expect(page.getByText("Inscriptions ouvertes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Réserver" })).toHaveCount(0);

  // --- 2. Candidater sans compte → inscription → retour exactement là ---
  await page.getByRole("link", { name: "Candidater avec un véhicule" }).click();
  await page.waitForURL(/\/connexion\?retour=/);
  await page.getByRole("link", { name: "Créer un compte" }).last().click();
  await page.waitForURL(/\/inscription\?retour=/);
  await page.getByLabel("Pseudo").fill(pseudo);
  await page.getByLabel("E-mail").fill(`${pseudo.toLowerCase()}@e2e.orasso.test`);
  await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
  await fillArrivee(page);
  await page.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(`**/e/${event.slug}/candidater`);

  // --- 3. Garage vide : ajout du véhicule au moment de candidater, retour au même endroit ---
  await expect(page.getByText("Ton garage est vide")).toBeVisible();
  await page.getByRole("link", { name: "Ajouter un véhicule" }).first().click();
  await page.waitForURL(/\/app\/garage\/nouveau\?retour=/);
  await page.getByLabel("Marque").selectOption({ label: "BMW" });
  await expect(page.getByLabel("Modèle")).toBeEnabled();
  await page.getByLabel("Modèle").selectOption({ index: 1 });
  await page.getByLabel("Année").fill("1995");
  await page.getByLabel("Plaque").fill(plate);
  await page.getByLabel("Photo").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: samplePhoto() });
  // Lot 51 : une photo part avec son cadre de plaque, ou « aucune plaque visible » coché.
  await page.getByTestId("site-no-plate").check();
  await page.getByRole("button", { name: "Ajouter au garage" }).click();
  await page.waitForURL(new RegExp(`/e/${event.slug}/candidater\\?vehicule=`));

  // --- 4. Candidature en 3 écrans ---
  await expect(page.locator('[data-step="1"]')).toBeVisible();
  await expect(page.getByText("1 véhicule")).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator('[data-step="2"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();
  await page.getByLabel("J'ai lu le règlement").check();
  // Lot 47 : l'horaire d'arrivée des exposants, case obligatoire et note facultative.
  await expect(page.getByTestId("arrival-seen")).toContainText("Arrivée 17 h 30 – 18 h 15 (strict)");
  await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();
  await page.getByLabel("J'ai vu le créneau d'arrivée.").check();
  await page.getByLabel("Une note pour l'équipe (facultatif)").fill("J'arriverai vers 17 h 45.");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator('[data-step="3"]')).toBeVisible();
  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await page.waitForURL(/\/app\/(acces|sorties)/);
  const card = page.getByTestId("application").first();
  await expect(card).toHaveAttribute("data-status", "pending");
  await expect(card).toContainText("En attente");
  await expect(page.getByTestId("pass-qr")).toHaveCount(0);

  // Un deuxième participant (par l'API), retenu d'office, pour le pointage rapide par plaque.
  const second = await signUpApi(`Second_${suffix}`);
  const secondPlate = randomPlate();
  // Lot 47 : l'événement a un créneau exposants, la candidature coche « J'ai vu ».
  const secondRes = await apiCall<{ id: string }[]>(second, "POST", `/events/${event.id}/applications`, {
    vehicleIds: [await addVehicleApi(second, secondPlate)],
    rulesAccepted: true,
    arrivalSeen: true,
  });
  expect(secondRes.status).toBe(201);
  const secondApp = secondRes.data[0]?.id ?? "";
  await decideApi(organizer, event.id, secondApp, "accept");

  // --- 5. Organisateur : tri au clavier (thème au choix de l'utilisateur depuis le lot 38, Béton par défaut) ---
  const orga = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const orgaPage = await orga.newPage();
  await loginInBrowser(orgaPage, "damien@orasso.local", SEED_PASSWORD, "/app/acces");
  await orgaPage.goto(`/orga/meditesportcar/e/${event.id}/candidatures`);
  await expect(orgaPage.locator("html")).toHaveAttribute("data-theme", "beton");
  const tri = orgaPage.getByTestId("triage-card");
  await expect(tri).toBeVisible();
  await expect(orgaPage.getByTestId("triage-pseudo")).toContainText(pseudo);
  await expect(orgaPage.getByTestId("counters")).toContainText("à trier");
  // La page est hydratée quand le temps réel est connecté (les touches ne servent à rien avant).
  await expect(orgaPage.getByTestId("counters")).toHaveAttribute("data-live", "on");
  await orgaPage.keyboard.press("v");
  await expect(orgaPage.getByTestId("triage-message")).toContainText(`${pseudo} : retenue`);
  await expect(orgaPage.getByTestId("triage-empty")).toBeVisible();

  // --- 6. Le passionné voit son QR (mise à jour en direct, sans recharger) ---
  const qr = page.getByTestId("pass-qr").locator("svg");
  await expect(qr).toBeVisible({ timeout: 20_000 });
  // Relecture du lot 48 : le code tournant OR2 (69 caractères, QR version 4), jamais l'ancien QR statique.
  await expect(qr).toHaveAttribute("data-qr-version", "4");
  await expect(page.getByTestId("rotating-countdown")).toBeVisible();
  await expect(page.getByTestId("application").first()).toHaveAttribute("data-status", "accepted");

  // --- 7. Staff : liste du jour J, pointage manuel puis pointage rapide par plaque ---
  const staff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const staffPage = await staff.newPage();
  await loginInBrowser(staffPage, "julie@orasso.local", SEED_PASSWORD, "/app/acces");
  await staffPage.goto(`/orga/meditesportcar/e/${event.id}/jour-j`);
  const row = staffPage.getByTestId("participant-row").filter({ hasText: pseudo });
  await expect(row).toHaveAttribute("data-arrived", "no");
  await row.getByRole("button", { name: `Pointer ${pseudo}` }).click();
  await expect(row).toHaveAttribute("data-arrived", "yes");
  await staffPage.getByLabel("Plaques").fill(secondPlate);
  await staffPage.getByRole("button", { name: "Pointer", exact: true }).click();
  await expect(staffPage.getByTestId("plate-outcome")).toContainText("entré");
  await expect(staffPage.getByTestId("participant-row").filter({ hasText: `Second_${suffix}` })).toHaveAttribute(
    "data-arrived",
    "yes",
  );

  // --- 8. J+2 simulé : les points apparaissent dans le carnet de route ---
  simulateSettle(event.slug);
  await page.goto("/app/acces?vue=passes");
  const past = page.getByTestId("application").first();
  await expect(past).toContainText(event.title);
  await expect(past.getByTestId("points")).toContainText("+20 pts");
  await expect(page.getByTestId("season-points")).toContainText("20 pts");

  await fan.close();
  await orga.close();
  await staff.close();
});
