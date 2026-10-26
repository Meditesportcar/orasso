import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  applyApi,
  type Cookie,
  decideApi,
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

// Lot R5b, côté site (raccord de l'appli, maquettes R5.5, R5.6, R5.6b) : /app/moi regroupé comme l'appli (carte du profil,
// roue dentée, « Réglages » dans l'ordre de Damien), « Modifier mon profil » (/app/profil/modifier : réseaux vérifiés,
// lien de profil ramené au pseudo, publication refusée), profil d'un membre (/u/:pseudo) en deux colonnes au bureau :
// « Sa voiture » en carré à côté de « Prochaine sortie » et de « Toi aussi », « Son garage », compte privé réduit,
// aperçu (/app/profil-public). Béton et Sable, 390 et 1280 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5b-captures/apres/site-recette`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.brokenWords, JSON.stringify(a.brokenWords)).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

async function vehicle(cookie: Cookie, index: number) {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const m = makes.data.find((x) => x.name === "BMW") ?? makes.data[0];
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
    year: 1997,
    plate: randomPlate(),
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
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
  start.setDate(start.getDate() + 6);
  start.setHours(9, 0, 0, 0);
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
    description: "Événement de recette du lot R5b (site).",
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return created.data;
}

test("R5b site : /app/moi, Modifier mon profil, profil d'un membre en deux colonnes, aperçu", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const tag = unique().slice(-6);
  const damien = await login("damien@orasso.local");
  const event = await openEvent(damien, `R5b Site ${tag}`);
  const aPseudo = `R5sA_${tag}`;
  const a = await signUpApi(aPseudo);
  await apiCall(a, "PATCH", "/me/profile", {
    departments: ["66"],
    visibility: "public",
    bio: "E30 de 1989, MX-5 pour l'été. Toujours partante pour une balade.",
  });
  const aMain = await vehicle(a, 0);
  await vehicle(a, 1);
  await decideApi(damien, event.id, await applyApi(a, event.id, aMain.id), "accept");
  const bPseudo = `R5sB_${tag}`;
  const b = await signUpApi(bPseudo);
  await apiCall(b, "PATCH", "/me/profile", { departments: ["66"] });
  await applyApi(b, event.id, (await vehicle(b, 0)).id);
  const cPseudo = `R5sC_${tag}`;
  const c = await signUpApi(cPseudo);
  await apiCall(c, "PATCH", "/me/profile", { departments: ["66"], visibility: "private" });
  await vehicle(c, 1);

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      // Chaque passage repart des mêmes réseaux (le précédent les a modifiés).
      await apiCall(a, "PATCH", "/me/profile", { socials: { instagram: "julie.e30", tiktok: "julie66" } });
      const name = `${theme}-${width}`;
      // --- Profil d'un membre, vu par B ----------------------------------------------------------------------------
      const ctxB = await browser.newContext({ viewport: { width, height: 1000 } });
      const pb = await ctxB.newPage();
      await setTheme(pb, theme);
      await loginInBrowser(pb, `${bPseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, "/app/moi");
      await pb.goto(`/u/${aPseudo}`);
      await expect(pb.getByTestId("profile-socials")).toContainText("julie.e30");
      await expect(pb.getByTestId("profile-socials").getByRole("link").first()).toHaveAttribute(
        "href",
        "https://www.instagram.com/julie.e30/",
      );
      await expect(pb.getByTestId("profile-car")).toContainText(aMain.label);
      await expect(pb.getByTestId("profile-next")).toContainText(`R5b Site ${tag}`);
      await expect(pb.getByTestId("profile-together")).toContainText("Toi aussi : vous y serez tous les deux");
      await expect(pb.getByTestId("profile-garage")).toBeVisible();
      await expect(pb.getByTestId("message-open")).toBeVisible();
      if (width === 1280) {
        // Deux colonnes : « Sa voiture » et « Prochaine sortie » côte à côte, à droite de la carte de la personne.
        const car = await pb.getByTestId("profile-car").boundingBox();
        const next = await pb.getByTestId("profile-next").boundingBox();
        expect((next?.x ?? 0) > (car?.x ?? 0) + (car?.width ?? 0) - 1).toBe(true);
      }
      await audit(pb);
      await pb.screenshot({ path: `${DIR}/membre-${name}.png`, fullPage: true });
      // Compte privé.
      await pb.goto(`/u/${cPseudo}`);
      await expect(pb.getByTestId("profile-private-note")).toContainText("Le reste est réservé à ses amis");
      await expect(pb.getByTestId("profile-follow")).toHaveCount(0);
      await expect(pb.getByTestId("profile-car")).toHaveCount(0);
      await expect(pb.getByTestId("profile-socials")).toHaveCount(0);
      await audit(pb);
      await pb.screenshot({ path: `${DIR}/membre-prive-${name}.png`, fullPage: true });
      await ctxB.close();

      // --- A : /app/moi, Réglages, Modifier mon profil, aperçu -------------------------------------------------------
      const ctxA = await browser.newContext({ viewport: { width, height: 1000 } });
      const pa = await ctxA.newPage();
      await setTheme(pa, theme);
      await loginInBrowser(pa, `${aPseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, "/app/moi");
      await pa.goto("/app/moi");
      await expect(pa.getByTestId("profil-card")).toContainText("E30 de 1989");
      await expect(pa.getByTestId("profil-settings")).toHaveAttribute("href", "#reglages");
      const rows = await pa
        .getByTestId("settings-hub")
        .locator("a, button")
        .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
      const order = [
        "Modifier mon profil",
        "Compte",
        "Notifications",
        "Confidentialité",
        "Tes préférences",
        "Apparence",
        "Aide",
        "Se déconnecter",
      ];
      expect(order.map((o) => rows.findIndex((r) => r.startsWith(o)))).toEqual(order.map((_, i) => i));
      await audit(pa);
      await pa.screenshot({ path: `${DIR}/moi-${name}.png`, fullPage: true });
      await pa.getByTestId("reglage-profil").click();
      await expect(pa.getByTestId("edit-profile")).toBeVisible();
      await expect(pa.getByTestId("social-instagram")).toHaveValue("julie.e30");
      await pa.getByTestId("social-instagram").fill("https://www.instagram.com/p/C1abcDEF/");
      await pa.getByTestId("edit-save").click();
      await expect(pa.getByTestId("social-error-instagram")).toHaveText(
        "Ce lien mène à une publication. Mets ton pseudo Instagram, par exemple kenji.supra.",
      );
      await pa.screenshot({ path: `${DIR}/modifier-erreur-${name}.png`, fullPage: true });
      await pa.getByTestId("social-instagram").fill(`https://www.instagram.com/julie.${theme}/`);
      await pa.getByTestId("edit-save").click();
      await expect(pa.getByTestId("edit-saved")).toBeVisible();
      await expect(pa.getByTestId("social-instagram")).toHaveValue(`julie.${theme}`);
      await audit(pa);
      await pa.screenshot({ path: `${DIR}/modifier-${name}.png`, fullPage: true });
      await pa.goto("/app/profil-public");
      await expect(pa.getByTestId("preview-banner")).toBeVisible();
      // Dans l'aperçu, « Sa voiture » garde le nom de recette du lot R4c (`preview-vehicles`).
      await expect(pa.getByTestId("preview-vehicles")).toContainText(aMain.label);
      await expect(pa.getByTestId("preview-edit")).toHaveAttribute("href", "/app/profil/modifier");
      await audit(pa);
      await pa.screenshot({ path: `${DIR}/apercu-${name}.png`, fullPage: true });
      await ctxA.close();
    }
  }
});
