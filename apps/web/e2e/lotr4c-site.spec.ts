import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  type Cookie,
  login,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R4c, côté site (raccord de l'appli) : Garage (« ★ Principal », « Mettre en avant »), candidature qui présélectionne
// le principal, /app/moi (trois compteurs, « Mon profil public », crew), /app/reseau (onglets, recherche, vie privée),
// /app/profil-public (membre, ami), « Suivre » sur /u/:pseudo (absent d'un compte privé). Béton et Sable, 390 et 1280 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4c-captures/site`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });

async function vehicle(cookie: Cookie, make: string, index: number) {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const m = makes.data.find((x) => x.name === make) ?? makes.data[0];
  const models = await apiCall<{ id: string; isOther: boolean }[]>(
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

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
}

test("R4c site : véhicule principal, réseau, aperçu public, suivre", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const id = unique();
  const damien = await login("damien@orasso.local");
  const me0 = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me0.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date();
  start.setDate(start.getDate() + 9);
  start.setHours(18, 0, 0, 0);
  const ev = await apiCall<{ id: string; slug: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title: `R4c Site ${id}`.slice(0, 34),
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
    description: "Événement de recette du lot R4c (site).",
  });
  expect(ev.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${ev.data.id}/publish`)).status).toBe(200);

  const mePseudo = `R4cSite_${id}`.slice(0, 20);
  const me = await signUpApi(mePseudo);
  await apiCall(me, "PATCH", "/me/profile", { departments: ["66"], visibility: "public" });
  const first = await vehicle(me, "Toyota", 0);
  const second = await vehicle(me, "Nissan", 0);
  const mk = async (p: string, visibility: "public" | "private") => {
    const pseudo = `${p}_${id}`.slice(0, 20);
    const cookie = await signUpApi(pseudo);
    await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility });
    return { pseudo, cookie };
  };
  const friend = await mk("R4sAmi", "public");
  const fan = await mk("R4sFan", "public");
  const priv = await mk("R4sPrive", "private");
  const req = await apiCall<{ id: string }>(me, "POST", "/friends/requests", { pseudo: friend.pseudo });
  await apiCall(friend.cookie, "POST", `/friends/requests/${req.data.id}/accept`);
  await apiCall(fan.cookie, "POST", `/users/${mePseudo}/follow`);
  await apiCall(priv.cookie, "POST", `/users/${mePseudo}/follow`);
  const email = `${mePseudo.toLowerCase()}@e2e.orasso.test`;

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      expect((await apiCall(me, "PUT", "/me/main-vehicle", { vehicleId: first.id })).status).toBe(200);
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await loginInBrowser(page, email, SEED_PASSWORD, "/app/garage");
      await setTheme(page, theme);
      const shot = (name: string) => page.screenshot({ path: `${DIR}/${name}-${width}-${theme}.png`, fullPage: true });

      // Garage.
      await page.goto("/app/garage");
      await expect(page.getByTestId("garage-main").getByTestId("garage-main-tag")).toBeVisible();
      await expect(page.getByTestId("garage-main")).toContainText(first.label);
      await audit(page);
      await shot("01-garage");
      await page.getByTestId("garage-other").getByTestId("garage-menu").locator("summary").click();
      await expect(page.getByTestId("garage-other").getByTestId("garage-feature")).toBeVisible();
      await shot("02-garage-menu");
      await page.getByTestId("garage-other").getByTestId("garage-feature").click();
      await expect(page.getByTestId("garage-main-banner")).toContainText(second.label);
      await expect(page.getByTestId("garage-main")).toContainText(second.label);
      await shot("03-garage-principal");

      // Candidature : le principal coché.
      await page.goto(`/e/${ev.data.slug}/candidater`);
      await expect(page.getByLabel(second.label)).toBeChecked();
      await expect(page.getByText("★ Véhicule principal")).toBeVisible();
      await shot("04-candidature");

      // Moi : compteurs et accès.
      await page.goto("/app/moi");
      await expect(page.getByTestId("profil-count-abonnes")).toContainText("2");
      await expect(page.getByTestId("profil-count-amis")).toContainText("1");
      await audit(page);
      await shot("05-moi");
      await page.getByTestId("profil-count-abonnes").click();
      await expect(page).toHaveURL(/\/app\/reseau\?onglet=abonnes/);
      await expect(page.getByTestId("net-followers")).toContainText(fan.pseudo);
      await expect(
        page.getByTestId("net-person").filter({ hasText: priv.pseudo }).getByTestId("net-follow"),
      ).toHaveCount(0);
      await expect(page.getByTestId("net-privacy")).toContainText("Toi seul vois ces listes.");
      await audit(page);
      await shot("06-reseau-abonnes");
      await page.getByTestId("net-tab-amis").click();
      await expect(page.getByTestId("net-friends")).toContainText(friend.pseudo);
      await shot("07-reseau-amis");

      // Aperçu public.
      await page.goto("/app/profil-public");
      await expect(page.getByTestId("public-head")).toContainText(mePseudo);
      await expect(page.getByTestId("preview-vehicles")).toContainText("★ Principal");
      await audit(page);
      await shot("08-apercu-membre");
      await page.getByTestId("preview-as-friend").click();
      await expect(page.getByTestId("preview-banner")).toContainText("ami");
      await shot("09-apercu-ami");

      // Suivre : public, puis privé.
      await page.goto(`/u/${friend.pseudo}`);
      await page.getByTestId("profile-follow").click();
      await expect(page.getByTestId("profile-followed")).toBeVisible();
      await audit(page);
      await shot("10-profil-suivi");
      await page.getByTestId("profile-followed").click();
      await expect(page.getByTestId("profile-follow")).toBeVisible();
      await page.goto(`/u/${priv.pseudo}`);
      await expect(page.getByTestId("profil")).toBeVisible();
      await expect(page.getByTestId("profile-follow")).toHaveCount(0);
      await expect(page.getByTestId("public-counts")).toHaveCount(0);
      await shot("11-profil-prive");
      await ctx.close();
    }
  }
});
