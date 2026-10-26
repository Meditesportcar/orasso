import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import {
  addVehicleApi,
  apiCall,
  type Cookie,
  chooseSitePhoto,
  login,
  loginInBrowser,
  randomPlate,
  samplePhoto,
} from "./helpers";

// Lot 31 : garage et certification de bout en bout sur le site — catégories grisées, transfert de plaque (Léa prend la
// plaque de Marc, Marc confirme), fiche Instagram (PNG sans plaque), certification (Kenji demande, Damien certifie,
// la puissance change : perdue), archivage. Prérequis : API et site lancés sur la base locale avec le seed.
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

type VehicleRow = {
  id: string;
  label: string;
  status: string;
  certified: boolean;
  photos: { id: string }[];
  plate: string | null;
  plateTransfer: { status: string } | null;
};

async function uploadPhoto(cookie: Cookie, vehicleId: string) {
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto())], { type: "image/png" }), "photo.png");
  // Lot M1, tour 2 : l'API exige une décision sur la plaque (ici, aucune plaque sur l'image d'essai).
  form.set("noPlate", "true");
  const res = await fetch(`${API}/api/me/vehicles/${vehicleId}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  expect(res.status).toBe(201);
}

/** Kenji est « Route » dans le seed ; la certification demande le grade Sport (S37) : on le lui donne en base locale. */
export async function giveSportGrade(pseudo: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("update profiles set grade = 'sport', points_season = 340 where lower(pseudo) = lower($1)", [
      pseudo,
    ]);
  } finally {
    await client.end();
  }
}

const vehicles = async (cookie: Cookie) => (await apiCall<VehicleRow[]>(cookie, "GET", "/me/vehicles")).data;

async function pickVehicle(page: Page, make: string, model: string) {
  await page.getByLabel("Marque", { exact: true }).selectOption({ label: make });
  await expect(page.getByLabel("Modèle", { exact: true }).locator(`option:text-is("${model}")`)).toHaveCount(1);
  await page.getByLabel("Modèle", { exact: true }).selectOption({ label: model });
}

test("formulaire du véhicule : catégories grisées avec la raison, statut et poids", async ({ page }) => {
  await loginInBrowser(page, "lea@orasso.local", undefined, "/app/garage/nouveau");
  await pickVehicle(page, "BMW", "Série 3");
  await page.getByLabel("Année").fill("2015");
  // Lot M1 (parité avec l'appli) : les styles qui n'ont rien à voir avec le véhicule (autre marque, autre type) sont
  // cachés, celui refusé pour l'âge reste barré et grisé avec une seule phrase dessous ; l'origine vient de la marque.
  const cats = page.getByTestId("categories");
  const youngtimer = cats.getByRole("checkbox", { name: "Youngtimer" });
  await expect(youngtimer).toBeDisabled();
  await expect(page.getByTestId("add-styles-note")).toContainText("Youngtimer");
  await expect(page.getByTestId("add-styles-note")).toContainText("grisée");
  await expect(cats.getByRole("checkbox", { name: "Supercar" })).toHaveCount(0);
  await expect(cats.getByRole("checkbox", { name: "JDM" })).toHaveCount(0);
  await expect(page.getByTestId("add-origin")).toContainText("Allemande");
  await expect(page.getByTestId("add-origin")).toContainText("Déduit de BMW");
  await expect(cats.getByRole("checkbox", { name: "Drift" })).toBeEnabled();
  await expect(page.getByLabel(/Poids \(kg\)/)).toBeVisible();
  // Un ancien véhicule (vendu, souvenir, accidenté) n'exige ni plaque ni photo.
  await page.getByLabel("C'est un ancien véhicule").check();
  await page.getByLabel("Il est…").selectOption({ label: "Souvenir" });
  await expect(page.getByLabel("Motif (facultatif)")).toBeVisible();
  await expect(page.getByLabel("Photo")).not.toHaveAttribute("required", "");
});

test("transfert de plaque : Léa saisit la plaque de Marc, Marc confirme, sa voiture passe « Vendu »", async ({
  browser,
}) => {
  const marc = await login("marc@orasso.local");
  const lea = await login("lea@orasso.local");
  const plate = randomPlate();
  const marcVehicle = await addVehicleApi(marc, plate);

  const leaPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await loginInBrowser(leaPage, "lea@orasso.local", undefined, "/app/garage/nouveau");
  await pickVehicle(leaPage, "BMW", "Série 3");
  await leaPage.getByLabel("Année").fill("1995");
  await leaPage.getByLabel("Numéro de plaque").fill(plate);
  await chooseSitePhoto(leaPage, { name: "photo.png", mimeType: "image/png", buffer: samplePhoto([40, 80, 140]) });
  // Lot 51 : une photo part avec son cadre de plaque, ou « aucune plaque visible » coché.
  // Lot M2, tour 2 : « Envoyer sans flouter » se confirme sur la photo.
  await leaPage.getByTestId("site-no-plate").click();
  await leaPage.getByTestId("site-no-plate-yes").click();
  await expect(leaPage.getByTestId("site-no-plate")).toBeChecked();
  await leaPage.getByRole("button", { name: "Envoyer", exact: true }).click();
  await leaPage.waitForURL(/\/app\/garage\/[0-9a-f-]{36}$/);
  await expect(leaPage.getByTestId("plate-pending")).toBeVisible();
  await expect(leaPage.getByText("Plaque en attente de transfert").first()).toBeVisible();
  const leaVehicleId = leaPage.url().split("/").pop() as string;

  const marcPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await loginInBrowser(marcPage, "marc@orasso.local", undefined, "/app/garage");
  const card = marcPage.getByTestId("plate-transfer-request").filter({ hasText: "Lea_11" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Je confirme le transfert" }).click();
  await expect(marcPage.getByTestId("plate-transfer-request").filter({ hasText: plate })).toHaveCount(0);

  expect((await vehicles(marc)).find((v) => v.id === marcVehicle)?.status).toBe("sold");
  const mine = (await vehicles(lea)).find((v) => v.id === leaVehicleId);
  expect(mine?.status).toBe("active");
  expect(mine?.plateTransfer).toBeNull();

  // Archivage depuis la page du véhicule : feuille Vendu / Souvenir / Accidenté, puis « Archivés » replié.
  await leaPage.goto(`/app/garage/${leaVehicleId}`);
  await leaPage.getByTestId("archive-sheet").locator("summary").click();
  await leaPage.getByRole("radio", { name: /Souvenir/ }).check();
  await leaPage.getByLabel("Motif (facultatif)").first().fill("Gardé pour les balades");
  await leaPage.getByRole("button", { name: "Archiver ce véhicule" }).click();
  await expect(leaPage.getByText("Remettre dans le garage actif")).toBeVisible();
  await leaPage.goto("/app/garage");
  await leaPage.getByTestId("garage-archived").locator("summary").click();
  await expect(leaPage.getByTestId("garage-archived")).toContainText("Souvenir");
  await leaPage.context().close();
  await marcPage.context().close();
});

test("certification : Kenji demande, Damien certifie, la puissance change et elle est perdue ; fiche Instagram sans plaque", async ({
  browser,
}) => {
  await giveSportGrade("Kenji_66");
  const kenji = await login("kenji@orasso.local");
  const supra = (await vehicles(kenji)).find((v) => v.label.includes("Supra") && v.status === "active");
  expect(supra, "la Supra de Kenji existe (seed)").toBeTruthy();
  const id = (supra as VehicleRow).id;
  for (let n = (supra as VehicleRow).photos.length; n < 3; n++) await uploadPhoto(kenji, id);
  // Départ propre (lot 34) : une puissance différente fait perdre une certification laissée par un passage précédent.
  const patched = await apiCall(kenji, "PATCH", `/me/vehicles/${id}`, {
    description: "Supra Mk4, 2JZ turbo, d'origine.",
    powerHp: 320 + Math.floor(Math.random() * 100),
  });
  expect(patched.status).toBe(200);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, "kenji@orasso.local", undefined, `/app/garage/${id}`);
  const block = page.getByTestId("certification");
  await expect(block).toBeVisible();
  // Une demande en attente d'une exécution précédente est laissée telle quelle ; sinon on la crée.
  if (await block.getByRole("button", { name: "Demander la certification" }).count()) {
    await block.getByRole("button", { name: "Demander la certification" }).click();
  }
  await expect(block).toContainText("Demande en cours d'examen");

  // Fiche Instagram : PNG aux bonnes dimensions (lu depuis l'en-tête IHDR).
  const dims = await page.evaluate(async (vehicleId) => {
    const out: Record<string, number[]> = {};
    for (const format of ["story", "post"]) {
      const res = await fetch(`/api/me/vehicles/${vehicleId}/share-image?format=${format}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const view = new DataView(bytes.buffer);
      out[format] = [res.status, bytes[1] ?? 0, view.getUint32(16), view.getUint32(20)];
    }
    return out;
  }, id);
  expect(dims.story).toEqual([200, 0x50, 1080, 1920]);
  // Lot M6 : le post passe en 4:5 (maquette 2.2).
  expect(dims.post).toEqual([200, 0x50, 1080, 1350]);

  const damienPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await loginInBrowser(damienPage, "damien@orasso.local", undefined, "/admin/certifications");
  const request = damienPage.getByTestId("certification-request").filter({ hasText: "Kenji_66" }).first();
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "Certifier" }).click();
  await expect(damienPage.getByTestId("certification-request").filter({ hasText: "Kenji_66" })).toHaveCount(0);

  await page.goto(`/app/garage/${id}`);
  await expect(page.getByTestId("certification")).toContainText("Certifié depuis le");

  // Modifier la puissance : certification perdue.
  // Lot R5a : la feuille contient aussi la ligne « Proposer un style » (un autre <summary>) : seulement le sien.
  await page.locator("details.g-sheet", { hasText: "Modifier la fiche" }).locator(":scope > summary").click();
  // Une valeur différente de l'actuelle (lot 34 : un passage précédent a pu laisser 455 ch, rien ne changeait alors).
  const power = page.getByLabel("Puissance (ch)");
  await power.fill(String((Number(await power.inputValue()) || 450) + 1));
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("certification")).toContainText("Certification perdue : fiche modifiée");
  await ctx.close();
  await damienPage.context().close();
});

test("transferts de plaque à arbitrer : file de l'administration", async ({ browser }) => {
  const marc = await login("marc@orasso.local");
  const nina = await login("nina@orasso.local");
  const plate = randomPlate();
  await addVehicleApi(marc, plate);
  const make = (await apiCall<{ id: string; name: string }[]>(nina, "GET", "/vehicle-reference/makes")).data.find(
    (m) => m.name === "BMW",
  );
  const model = (
    await apiCall<{ id: string; isOther: boolean }[]>(nina, "GET", `/vehicle-reference/makes/${make?.id}/models`)
  ).data.find((m) => !m.isOther);
  const created = await apiCall<{ id: string; plateTransfer: { id: string } | null }>(nina, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: make?.id,
    modelId: model?.id,
    year: 1995,
    plate,
  });
  expect(created.status).toBe(201);
  const transfer = (
    await apiCall<{ incoming: { id: string }[] }>(marc, "GET", "/me/plate-transfers")
  ).data.incoming.find((t) => t.id === created.data.plateTransfer?.id);
  expect((await apiCall(marc, "POST", `/plate-transfers/${transfer?.id}/decline`)).status).toBe(200);

  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/admin/transferts");
  const row = page.getByTestId("plate-transfer").filter({ hasText: plate });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Refuser : non immatriculé" }).click();
  await expect(page.getByTestId("plate-transfer").filter({ hasText: plate })).toHaveCount(0);
  const refused = (await vehicles(nina)).find((v) => v.id === created.data.id);
  expect(refused?.plate).toBeNull();
  expect(refused?.plateTransfer).toBeNull();
  await page.context().close();
});
