import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { type Audit, auditPage } from "./audit";
import { addVehicleApi, apiCall, type Cookie, login, randomPlate, samplePhoto } from "./helpers";
import { RELAIS } from "./relais";

// Captures du lot 31 (garage et certification) dans les deux thèmes, au bureau et sur téléphone (390 px), avec le
// contrôle automatique du système de design : `CAPTURES=1 pnpm --filter @orasso/web exec playwright test captures-lot31`.
// Prérequis : base locale avec le seed ; l'API et le site lancés.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-31-captures`;
test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");

const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;
const audits: Record<string, Audit> = {};

async function context(browser: Browser, theme: string, view: (typeof VIEWS)[number], cookie: Cookie) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const cookies = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: WEB });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function shot(page: Page, theme: string, view: string, name: string, settle = 700) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

async function uploadPhoto(cookie: Cookie, vehicleId: string, rgb: [number, number, number]) {
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto(rgb))], { type: "image/png" }), "photo.png");
  // Lot M1, tour 2 : l'API exige une décision sur la plaque (ici, aucune plaque sur l'image d'essai).
  form.set("noPlate", "true");
  const res = await fetch(`${API}/api/me/vehicles/${vehicleId}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  expect(res.status).toBe(201);
}

type Row = { id: string; label: string; status: string; photos: unknown[] };

async function createVehicle(cookie: Cookie, plate: string, status: "active" | "keepsake" = "active") {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const make = makes.data.find((m) => m.name === "BMW");
  const models = await apiCall<{ id: string; isOther: boolean }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${make?.id}/models`,
  );
  const model = models.data.find((m) => !m.isOther);
  const created = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: make?.id,
    modelId: model?.id,
    year: 1995,
    weightKg: 1320,
    plate: status === "active" ? plate : null,
    unregistered: false,
    status,
    statusNote: status === "active" ? null : "Gardée pour les balades du dimanche",
  });
  expect(created.status).toBe(201);
  await uploadPhoto(cookie, created.data.id, [90, 90, 100]);
  return created.data.id;
}

test("captures du garage et de la certification", async ({ browser }) => {
  mkdirSync(DIR, { recursive: true });
  test.setTimeout(900_000);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("update profiles set grade = 'sport', points_season = 340 where lower(pseudo) = 'kenji_66'");
  await client.end();

  const [damien, kenji, lea, marc, nina] = await Promise.all(
    ["damien", "kenji", "lea", "marc", "nina"].map((n) => login(`${n}@orasso.local`)),
  );
  const supra = (await apiCall<Row[]>(kenji as Cookie, "GET", "/me/vehicles")).data.find(
    (v) => v.label.includes("Supra") && v.status === "active",
  ) as Row;
  for (let n = supra.photos.length; n < 3; n++) await uploadPhoto(kenji as Cookie, supra.id, [60 + n * 40, 70, 90]);
  await apiCall(kenji as Cookie, "PATCH", `/me/vehicles/${supra.id}`, {
    description: "Supra Mk4 turbo, d'origine : 2JZ-GTE, boîte six vitesses, quelques sorties circuit.",
    preparation: "Échappement inox, intercooler, reprogrammation.",
    weightKg: 1540,
  });
  await apiCall(kenji as Cookie, "POST", `/me/vehicles/${supra.id}/certification-request`, { message: null });

  // Marc prête sa plaque deux fois : Nina attend sa réponse, Léa part à l'arbitrage de l'équipe.
  const p1 = randomPlate();
  await createVehicle(marc as Cookie, p1);
  const ninaVehicle = await createVehicle(nina as Cookie, p1);
  const p2 = randomPlate();
  await createVehicle(marc as Cookie, p2);
  const leaVehicle = await createVehicle(lea as Cookie, p2);
  const incoming = (
    await apiCall<{ incoming: { id: string; plate: string }[] }>(marc as Cookie, "GET", "/me/plate-transfers")
  ).data.incoming;
  const toDecline = incoming.find((t) => t.plate.replace(/\W/g, "") === p2.replace(/\W/g, ""));
  await apiCall(marc as Cookie, "POST", `/plate-transfers/${toDecline?.id}/decline`);
  await createVehicle(lea as Cookie, "", "keepsake");

  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const open = async (who: Cookie, path: string, name: string) => {
        const page = await (await context(browser, theme, view, who)).newPage();
        await page.goto(path);
        return { page, name };
      };
      const take = async (who: Cookie, path: string, name: string, prep?: (p: Page) => Promise<void>) => {
        const { page } = await open(who, path, name);
        if (prep) await prep(page);
        await shot(page, theme, view.id, name);
        await page.context().close();
      };

      await take(kenji as Cookie, "/app/garage", "01-garage");
      await take(kenji as Cookie, `/app/garage/${supra.id}`, "02-vehicule");
      await take(kenji as Cookie, `/app/garage/${supra.id}`, "03-vehicule-modifier", async (p) => {
        await p.locator("details.g-sheet", { hasText: "Modifier la fiche" }).locator("summary").click();
      });
      await take(lea as Cookie, "/app/garage/nouveau", "04-nouveau-categories-grisees", async (p) => {
        await p.getByLabel("Marque", { exact: true }).selectOption({ label: "BMW" });
        await expect(p.getByLabel("Modèle", { exact: true }).locator('option:text-is("Série 3")')).toHaveCount(1);
        await p.getByLabel("Modèle", { exact: true }).selectOption({ label: "Série 3" });
        await p.getByLabel("Année").fill("2015");
      });
      await take(marc as Cookie, "/app/garage", "05-garage-demande-de-transfert");
      await take(nina as Cookie, `/app/garage/${ninaVehicle}`, "06-vehicule-plaque-en-attente");
      await take(lea as Cookie, `/app/garage/${leaVehicle}`, "07-vehicule-arbitrage");
      await take(lea as Cookie, "/app/garage", "08-garage-archives", async (p) => {
        await p.getByTestId("garage-archived").locator("summary").click();
      });
      await take(kenji as Cookie, `/app/garage/${supra.id}`, "09-vehicule-archiver", async (p) => {
        await p.getByTestId("archive-sheet").locator("summary").click();
      });
      await take(damien as Cookie, "/admin/certifications", "10-admin-certifications");
      await take(damien as Cookie, "/admin/transferts", "11-admin-transferts");
    }
  }

  // Fiches Instagram (PNG rendus par l'API, identiques dans les deux thèmes) : la Supra, puis un nom très long
  // (« Mercedes-Benz SLK 230 Kompressor R170 », ajouté au référentiel local pour l'occasion) qui passe sur deux lignes.
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query(
    `insert into vehicle_models (make_id, name, slug, vehicle_type)
       select id, 'SLK 230 Kompressor', 'slk-230-kompressor', 'car' from vehicle_makes where name = 'Mercedes-Benz'
       on conflict (make_id, slug) do nothing`,
  );
  await db.query(
    `insert into vehicle_generations (model_id, name)
       select m.id, 'R170' from vehicle_models m where m.slug = 'slk-230-kompressor'
       on conflict (model_id, name) do nothing`,
  );
  const ids = await db.query<{ make_id: string; model_id: string; generation_id: string }>(
    `select m.make_id, m.id as model_id, g.id as generation_id from vehicle_models m
       join vehicle_generations g on g.model_id = m.id where m.slug = 'slk-230-kompressor' and g.name = 'R170'`,
  );
  await db.end();
  const row = ids.rows[0];
  expect(row).toBeTruthy();
  const slk = await apiCall<{ id: string }>(kenji as Cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: row?.make_id,
    modelId: row?.model_id,
    generationId: row?.generation_id,
    year: 1999,
    powerHp: 197,
    weightKg: 1330,
    plate: randomPlate(),
  });
  expect(slk.status).toBe(201);
  await uploadPhoto(kenji as Cookie, slk.data.id, [150, 60, 40]);
  for (const [name, id] of [
    ["supra", supra.id],
    ["slk", slk.data.id],
  ] as const) {
    for (const format of ["story", "post"]) {
      const res = await fetch(`${API}/api/me/vehicles/${id}/share-image?format=${format}`, {
        headers: { cookie: kenji as Cookie, origin: WEB },
      });
      expect(res.status).toBe(200);
      writeFileSync(`${DIR}/fiche-instagram-${name}-${format}.png`, Buffer.from(await res.arrayBuffer()));
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
});
