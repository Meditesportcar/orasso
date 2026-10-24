import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  type Cookie,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R4c (maquettes R4.5, R4.5b, R4.6, R4.6b, R4.6c), côté appli (version web compilée) :
//   - Garage : le principal en mini-fiche (« ★ Principal »), « Mettre en avant » dans le menu « ⋯ », bandeau, autres en
//     lignes compactes ;
//   - candidature : le principal présélectionné (« ★ Véhicule principal ») ;
//   - profil : trois compteurs, « Mon profil public » et le crew côte à côte ; « Ton réseau » (trois onglets, recherche,
//     « Suivre aussi » / « Suivi », compte privé sans « Suivre », « Toi seul vois ces listes ») ;
//   - aperçu du profil public (vu par un membre, par un ami) ; « Suivre » sur un profil public, absent d'un compte privé.
// Béton et Sable, 390 px. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4c-captures/appli`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme) {
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

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/**
 * `words` : aucun mot coupé. Pas sur le profil d'un autre : son en-tête de fiche porte le pseudo d'essai, un identifiant
 * de 15 lettres sans espace (« R4cAmi_MVMBWHSW0 ») que l'en-tête existant coupe (même limite que la recette R3b).
 */
async function audit(page: Page, words = true) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  if (words) expect(a.brokenWords, JSON.stringify(a.brokenWords)).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

/** Un véhicule (marque `make`, le `index`-ième modèle) avec une photo ; renvoie son identifiant et son nom. */
async function vehicle(cookie: Cookie, make: string, index: number) {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const m = makes.data.find((x) => x.name === make) ?? makes.data[0];
  const models = await apiCall<{ id: string; name: string; isOther: boolean }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${m?.id}/models`,
  );
  const model = models.data.filter((x) => !x.isOther)[index];
  const created = await apiCall<{ id: string; label: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: m?.id,
    modelId: model?.id,
    year: 2012,
    plate: randomPlate(),
  });
  expect(created.status).toBe(201);
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto())], { type: "image/png" }), "photo.png");
  form.set("noPlate", "true");
  const res = await fetch(`${API}/api/me/vehicles/${created.data.id}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return { id: created.data.id, label: created.data.label };
}

async function openEvent(damien: Cookie, title: string) {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date();
  start.setDate(start.getDate() + 9);
  start.setHours(18, 0, 0, 0);
  const created = await apiCall<{ id: string; slug: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 5 * 3600_000).toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car"],
    capacity: 40,
    maxVehiclesPerUser: 1,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Départs au pas, aucun burn.",
    description: "Événement de recette du lot R4c.",
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return { ...created.data, structureId: structureId ?? "" };
}

test("R4c appli : véhicule principal, réseau, aperçu du profil public, suivre", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const id = unique();
  const damien = await login("damien@orasso.local");
  const event = await openEvent(damien, `R4c Nocturne ${id}`.slice(0, 34));

  // Mon compte : public, dans le 66, deux véhicules (le plus ancien est le principal par défaut).
  const mePseudo = `R4cMe_${id}`.slice(0, 20);
  const me = await signUpApi(mePseudo);
  await apiCall(me, "PATCH", "/me/profile", { departments: ["66"], visibility: "public" });
  const first = await vehicle(me, "Toyota", 0);
  const second = await vehicle(me, "Nissan", 0);
  // Un ami, un abonné public (que je suis aussi), un abonné privé, un compte privé à visiter ; MéditeSportCar suivie.
  const mk = async (p: string, visibility: "public" | "private") => {
    const pseudo = `${p}_${id}`.slice(0, 20);
    const cookie = await signUpApi(pseudo);
    await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility });
    return { pseudo, cookie };
  };
  const friend = await mk("R4cAmi", "public");
  const fan = await mk("R4cFan", "public");
  const shy = await mk("R4cDiscret", "private");
  const priv = await mk("R4cPrive", "private");
  await vehicle(priv.cookie, "Toyota", 1);
  const req = await apiCall<{ id: string }>(me, "POST", "/friends/requests", { pseudo: friend.pseudo });
  expect((await apiCall(friend.cookie, "POST", `/friends/requests/${req.data.id}/accept`)).status).toBe(200);
  expect((await apiCall(fan.cookie, "POST", `/users/${mePseudo}/follow`)).status).toBe(200);
  expect((await apiCall(shy.cookie, "POST", `/users/${mePseudo}/follow`)).status).toBe(200);
  expect((await apiCall(me, "POST", `/users/${fan.pseudo}/follow`)).status).toBe(200);
  await apiCall(me, "POST", `/structures/${event.structureId}/follow`);
  // Une demande d'ami reçue (en tête de l'onglet Amis).
  const asker = await mk("R4cDemande", "public");
  await apiCall(asker.cookie, "POST", "/friends/requests", { pseudo: mePseudo });
  const errors: string[] = [];
  const email = `${mePseudo.toLowerCase()}@e2e.orasso.test`;

  for (const theme of THEMES) {
    // Chaque thème repart du même état : le plus ancien en principal, « Fan » non suivi par la page.
    expect((await apiCall(me, "PUT", "/me/main-vehicle", { vehicleId: first.id })).status).toBe(200);
    const { ctx, page } = await open(browser, theme);
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await signIn(page, email);

    // --- R4.5 Garage : le principal en grand, « Mettre en avant » un autre --------------------------------------------
    await goto(page, "/garage");
    const mini = page.getByTestId("garage-mini");
    await expect(mini.getByTestId("garage-main-tag")).toBeVisible({ timeout: 30_000 });
    await expect(mini.getByTestId("garage-card-name")).toHaveText(first.label);
    await expect(page.getByTestId("garage-row").getByTestId("garage-card-name")).toHaveText(second.label);
    await shot(page, `01-garage-${theme}`);
    await audit(page);
    // L'étoile n'est pas un bouton.
    await expect(mini.getByTestId("garage-main-tag")).not.toHaveAttribute("role", "button");
    await page.getByTestId("garage-row").getByTestId("garage-menu").click();
    await expect(page.getByTestId("garage-menu-sheet")).toBeVisible();
    await expect(page.getByTestId("garage-feature")).toBeVisible();
    await shot(page, `02-garage-menu-${theme}`);
    await page.getByTestId("garage-feature").click();
    await expect(page.getByTestId("garage-main-banner")).toContainText(second.label, { timeout: 15_000 });
    await expect(page.getByTestId("garage-mini").getByTestId("garage-card-name")).toHaveText(second.label, {
      timeout: 15_000,
    });
    await shot(page, `03-garage-principal-${theme}`);
    // Le menu du principal n'a pas « Mettre en avant ».
    await page.getByTestId("garage-mini").getByTestId("garage-menu").click();
    await expect(page.getByTestId("garage-menu-sheet")).toBeVisible();
    await expect(page.getByTestId("garage-feature")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // --- R4.5b La candidature propose le principal ------------------------------------------------------------------
    await goto(page, `/e/${event.slug}`);
    await expect(page.getByTestId("event-primary")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("event-primary").click();
    await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
    const main = page.getByTestId("cand-vehicle").filter({ has: page.getByTestId("cand-main") });
    await expect(main).toContainText(second.label);
    await expect(main.getByTestId("cand-checked")).toBeVisible();
    await expect(page.getByTestId("cand-checked")).toHaveCount(1);
    await shot(page, `04-candidature-principal-${theme}`);
    // Tour 2 : le principal archivé ailleurs (fiche du véhicule, ou ici par l'API) : la candidature propose le suivant,
    // d'après le garage relu, même si le profil de la session date d'avant.
    expect((await apiCall(me, "PATCH", `/me/vehicles/${second.id}`, { status: "sold", statusNote: null })).status).toBe(
      200,
    );
    await goto(page, `/e/${event.slug}`);
    await page.getByTestId("event-primary").click();
    await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
    const after = page.getByTestId("cand-vehicle").filter({ has: page.getByTestId("cand-main") });
    await expect(after).toContainText(first.label, { timeout: 15_000 });
    await expect(after.getByTestId("cand-checked")).toBeVisible();
    expect(
      (await apiCall(me, "PATCH", `/me/vehicles/${second.id}`, { status: "active", statusNote: null })).status,
    ).toBe(200);

    // --- R4.6 Profil : trois compteurs, deux accès ----------------------------------------------------------------
    await goto(page, "/profil");
    await expect(page.getByTestId("profil-count-abonnes")).toContainText("2", { timeout: 30_000 });
    await expect(page.getByTestId("profil-count-abonnements")).toContainText("2");
    await expect(page.getByTestId("profil-count-amis")).toContainText("1");
    await expect(page.getByTestId("profil-public")).toBeVisible();
    await expect(page.getByTestId("profil-crew")).toBeVisible();
    await expect(page.getByTestId("reglage-profil")).toHaveCount(0);
    await expect(page.getByTestId("reglage-amis")).toHaveCount(0);
    await shot(page, `05-profil-${theme}`);
    await audit(page);

    // --- R4.6b Ton réseau ----------------------------------------------------------------------------------------
    await page.getByTestId("profil-count-abonnes").click();
    await expect(page).toHaveURL(/\/reseau/, { timeout: 30_000 });
    const followers = page.getByTestId("net-followers");
    await expect(followers).toContainText(fan.pseudo, { timeout: 30_000 });
    await expect(followers).toContainText(shy.pseudo);
    // Je suis déjà « Fan » : « Suivi » ; « Discret » est privé : pas de « Suivre aussi ».
    await expect(
      page.getByTestId("net-person").filter({ hasText: fan.pseudo }).getByTestId("net-followed"),
    ).toBeVisible();
    await expect(page.getByTestId("net-person").filter({ hasText: shy.pseudo }).getByTestId("net-follow")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("net-privacy")).toContainText("Toi seul vois ces listes.");
    await shot(page, `06-reseau-abonnes-${theme}`);
    await audit(page);
    await page.getByTestId("net-search").fill("zzzz");
    await expect(page.getByTestId("net-empty")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("net-search").fill("");
    await page.getByTestId("net-tab-abonnements").click();
    await expect(page.getByTestId("net-people")).toContainText(fan.pseudo, { timeout: 30_000 });
    await expect(page.getByTestId("net-structures")).toContainText("MéditeSportCar");
    await shot(page, `07-reseau-abonnements-${theme}`);
    await audit(page);
    await page.getByTestId("net-tab-amis").click();
    await expect(page.getByTestId("net-requests")).toContainText(asker.pseudo, { timeout: 30_000 });
    await expect(page.getByTestId("net-friends")).toContainText(friend.pseudo);
    // Les demandes reçues passent avant les amis.
    const reqBox = await page.getByTestId("net-requests").boundingBox();
    const frBox = await page.getByTestId("net-friends").boundingBox();
    expect((reqBox?.y ?? 0) < (frBox?.y ?? 0)).toBe(true);
    await shot(page, `08-reseau-amis-${theme}`);
    await audit(page);

    // --- R4.6c Mon profil public, en aperçu ------------------------------------------------------------------------
    await goto(page, "/profil-public");
    await expect(page.getByTestId("public-head")).toContainText(mePseudo, { timeout: 30_000 });
    await expect(page.getByTestId("public-counts")).toContainText("abonnés");
    await expect(page.getByTestId("preview-vehicles")).toContainText("★ Principal");
    await expect(page.getByTestId("preview-banner")).toContainText("membre connecté");
    // Tour 2 : compte public, ses sorties à venir sont visibles de tout membre : l'aperçu les montre.
    await expect(page.getByTestId("preview-upcoming")).toBeVisible();
    await shot(page, `09-apercu-membre-${theme}`);
    await audit(page);
    await page.getByTestId("preview-as-friend").click();
    await expect(page.getByTestId("preview-banner")).toContainText("ami", { timeout: 15_000 });
    await shot(page, `10-apercu-ami-${theme}`);

    // --- Suivre une personne : public (Suivre secondaire), privé (pas de Suivre, nombres cachés) ---------------------
    await goto(page, `/u/${friend.pseudo}`);
    await expect(page.getByTestId("public-head")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("profile-follow").click();
    await expect(page.getByTestId("profile-followed")).toBeVisible({ timeout: 15_000 });
    await shot(page, `11-profil-autre-suivi-${theme}`);
    await audit(page, false);
    await page.getByTestId("profile-followed").click();
    await expect(page.getByTestId("profile-follow")).toBeVisible({ timeout: 15_000 });
    await goto(page, `/u/${priv.pseudo}`);
    await expect(page.getByTestId("public-head")).toContainText("Compte privé", { timeout: 30_000 });
    await expect(page.getByTestId("profile-follow")).toHaveCount(0);
    await expect(page.getByTestId("public-counts")).toHaveCount(0);
    await shot(page, `12-profil-prive-${theme}`);
    await audit(page, false);
    await ctx.close();
  }

  // Vie privée côté API : aucune liste d'un autre, « Suivre » refusé vers un compte privé.
  expect((await apiCall(fan.cookie, "GET", `/users/${mePseudo}/followers`)).status).toBe(404);
  expect((await apiCall(me, "POST", `/users/${priv.pseudo}/follow`)).status).toBe(403);
  expect(errors.filter((e) => !/favicon|ResizeObserver|Failed to load resource/i.test(e))).toEqual([]);
});
