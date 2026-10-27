import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
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
// /app/profil-public (membre, abonné), « Suivre » sur /u/:pseudo (« Demander à suivre » sur un compte privé). Béton et
// Sable, 390 et 1280 px.
// Lot R6b (D37) : plus d'« ami » ; deux personnes qui se suivent remplacent l'ami, l'onglet Demandes (compte privé)
// remplace l'onglet Amis, un seul bouton `follow-button` remplace « Suivre » et « Ajouter en ami ».
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
  const mutual = await mk("R4sMut", "public");
  const stranger = await mk("R4sNew", "public");
  const asker = await mk("R4sDem", "public");
  const fan = await mk("R4sFan", "public");
  const priv = await mk("R4sPrive", "private");
  await apiCall(me, "POST", `/users/${mutual.pseudo}/follow`);
  await apiCall(mutual.cookie, "POST", `/users/${mePseudo}/follow`);
  await apiCall(fan.cookie, "POST", `/users/${mePseudo}/follow`);
  await apiCall(priv.cookie, "POST", `/users/${mePseudo}/follow`);
  const email = `${mePseudo.toLowerCase()}@e2e.orasso.test`;
  // Tour 2 : 31 organisateurs et 31 pros suivis (copies d'une structure et d'une fiche du seed, en base) : chaque groupe
  // a sa propre page suivante.
  const meRow = await apiCall<{ user: { id: string } }>(me, "GET", "/me");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const tag = `r4c-${id}`;
    await db.query(
      `insert into structures
         select (jsonb_populate_record(null::structures, to_jsonb(s) || jsonb_build_object(
           'id', gen_random_uuid(), 'slug', $1 || '-org-' || g, 'name', 'Orga R4c ' || lpad(g::text, 2, '0'),
           'invite_token', md5(random()::text || g)))).*
         from (select * from structures where slug = 'meditesportcar') s, generate_series(1, 31) g`,
      [tag],
    );
    await db.query(
      `insert into structure_follows (structure_id, user_id, source)
         select id, $2, 'manual' from structures where slug like $1 || '-org-%'`,
      [tag, meRow.data.user.id],
    );
    await db.query(
      `insert into pro_profiles
         select (jsonb_populate_record(null::pro_profiles, to_jsonb(p) || jsonb_build_object(
           'id', gen_random_uuid(), 'slug', $1 || '-pro-' || u.n, 'name', 'Pro R4c ' || lpad(u.n::text, 2, '0'),
           'owner_user_id', u.id, 'siret', null))).*
         from (select * from pro_profiles where deleted_at is null and published_at is not null limit 1) p,
              (select id, row_number() over () as n from "user"
                 where id not in (select owner_user_id from pro_profiles where deleted_at is null) limit 31) u`,
      [tag],
    );
    await db.query(
      `insert into pro_follows (pro_id, user_id) select id, $2 from pro_profiles where slug like $1 || '-pro-%'`,
      [tag, meRow.data.user.id],
    );
  } finally {
    await db.end();
  }

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
      await expect(page.getByTestId("profil-count-abonnes")).toContainText("3");
      // Lot R6b : plus de compteur « amis ».
      await expect(page.getByTestId("profil-count-amis")).toHaveCount(0);
      await audit(page);
      await shot("05-moi");
      await page.getByTestId("profil-count-abonnes").click();
      await expect(page).toHaveURL(/\/app\/reseau\?liste=abonnes/);
      await expect(page.getByTestId("net-followers")).toContainText(fan.pseudo);
      await expect(page.getByTestId("net-followers")).toContainText(mutual.pseudo);
      // Un abonné que je ne suis pas : « Suivre en retour » ; un que je suis : « Abonné ».
      await expect(
        page.getByTestId("net-person").filter({ hasText: priv.pseudo }).getByTestId("net-follow-back"),
      ).toBeVisible();
      await expect(
        page.getByTestId("net-person").filter({ hasText: mutual.pseudo }).getByTestId("net-followed"),
      ).toBeVisible();
      await expect(page.getByTestId("net-privacy")).toContainText("Toi seul vois ces listes.");
      await audit(page);
      await shot("06-reseau-abonnes");
      // Tour 2 : Organisateurs et Pros, 30 par page, chacun son « Suivants ».
      await page.getByTestId("net-tab-abonnements").click();
      await expect(page.getByTestId("net-structures").locator(".n-row")).toHaveCount(30);
      await expect(page.getByTestId("net-pros").locator(".n-row")).toHaveCount(30);
      await page.getByTestId("net-next-pros").click();
      await expect(page.getByTestId("net-pros").locator(".n-row")).toHaveCount(1);
      await expect(page.getByTestId("net-structures").locator(".n-row")).toHaveCount(30);
      await page.goto("/app/reseau?liste=abonnements");
      await page.getByTestId("net-next-structures").click();
      await expect(page.getByTestId("net-structures").locator(".n-row")).toHaveCount(1);
      await shot("06b-reseau-abonnements");
      // Lot R6b : plus d'onglet Amis ; l'onglet Demandes n'existe que pour un compte privé (vu en fin de tour).
      await page.goto("/app/reseau?liste=abonnes");
      await expect(page.getByTestId("net-tab-amis")).toHaveCount(0);
      await expect(page.getByTestId("net-tab-demandes")).toHaveCount(0);

      // Aperçu public.
      await page.goto("/app/profil-public");
      await expect(page.getByTestId("public-head")).toContainText(mePseudo);
      // Lot R5b (maquette R5.6) : « Sa voiture » porte la pastille « Principale ».
      await expect(page.getByTestId("preview-vehicles")).toContainText("Principale");
      await expect(page.getByTestId("preview-upcoming")).toBeVisible();
      await audit(page);
      await shot("08-apercu-membre");
      await page.getByTestId("preview-as-follower").click();
      await expect(page.getByTestId("preview-banner")).toContainText("abonné");
      await shot("09-apercu-abonne");

      // Suivre : public (« Abonné », puis « Ne plus suivre » après confirmation), puis privé (« Demander à suivre »).
      await page.goto(`/u/${stranger.pseudo}`);
      await page.getByTestId("follow-button").click();
      await expect(page.getByTestId("follow-button")).toContainText("Abonné");
      await audit(page);
      await shot("10-profil-suivi");
      await page.getByTestId("follow-button").click();
      await page.getByTestId("follow-confirm-yes").click();
      await expect(page.getByTestId("follow-button")).not.toContainText("Abonné");
      await page.goto(`/u/${priv.pseudo}`);
      await expect(page.getByTestId("profil")).toBeVisible();
      await expect(page.getByTestId("follow-button")).toContainText("Demander à suivre");
      // Damien, 24/10 : les nombres d'un compte privé sont visibles de tout membre (les listes, non).
      await expect(page.getByTestId("public-counts")).toContainText("abonné");
      await shot("11-profil-prive");

      // Mon compte en privé : l'onglet Demandes (refuser), puis retour en public.
      const patchVisibility = (visibility: "public" | "private") =>
        apiCall(me, "PATCH", "/me/profile", { departments: ["66"], visibility });
      expect((await patchVisibility("private")).status).toBe(200);
      await apiCall(asker.cookie, "POST", `/users/${mePseudo}/follow`);
      await page.goto("/app/reseau?liste=demandes");
      await expect(page.getByTestId("net-requests")).toContainText(asker.pseudo);
      await shot("07-reseau-demandes");
      await page
        .getByTestId("net-request")
        .filter({ hasText: asker.pseudo })
        .getByTestId("net-request-decline")
        .click();
      await expect(page.getByTestId("net-notice")).toBeVisible();
      expect((await patchVisibility("public")).status).toBe(200);
      await ctx.close();
    }
  }
});
