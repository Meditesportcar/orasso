import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, randomPlate, SEED_PASSWORD, samplePhoto, signUpApi, unique } from "./helpers";

// Captures du lot 13 (site public, structure, création d'événement, express, administration) dans les deux thèmes,
// au bureau et sur téléphone (390 px), avec le contrôle automatique du système de design :
// `CAPTURES=1 pnpm --filter @orasso/web exec playwright test captures-lot13`.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-13-captures";
test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");

const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const audits: Record<string, Audit> = {};

async function upload(
  cookie: string,
  path: string,
  field: string,
  name: string,
  type: string,
  data: Buffer,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set(field, new Blob([new Uint8Array(data)], { type }), name);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(`${API}/api${path}`, { method: "POST", headers: { origin: WEB, cookie }, body: form });
  if (!res.ok) throw new Error(`Envoi ${path} : ${res.status} ${await res.text()}`);
}

async function context(browser: Browser, theme: string, view: (typeof VIEWS)[number], cookie?: string) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of (cookie ?? "").split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function shot(page: Page, theme: string, view: string, name: string, settle = 600) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

test("captures du site public, de la structure et de la création d'événement", async ({ browser }) => {
  mkdirSync(DIR, { recursive: true });
  test.setTimeout(900_000);
  const s = unique();
  const damien = await login("damien@orasso.local");
  const poster = samplePhoto([70, 82, 110]);

  // Une structure vérifiée avec logo, un événement demain (express), un événement plus tard avec affiche, un passé.
  const ownerCookie = await signUpApi(`Orga_${s}`);
  const created = await apiCall<{ id: string; slug: string; inviteToken: string }>(ownerCookie, "POST", "/structures", {
    kind: "association",
    name: `Auto Club du Port ${s}`,
    description:
      "Association de passionnés de voitures anciennes et sportives, basée à Canet-en-Roussillon. Sorties, expositions et soirées.",
    addressLine: "Place de la République",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    departments: ["66"],
    website: "https://example.org/auto-club",
    socials: { instagram: "https://instagram.com/autoclubduport" },
  });
  expect(created.status).toBe(201);
  const structure = created.data;
  await upload(
    ownerCookie,
    `/structures/${structure.id}/logo`,
    "logo",
    "logo.png",
    "image/png",
    samplePhoto([200, 160, 20]),
  );
  await upload(
    ownerCookie,
    `/structures/${structure.id}/verification/documents`,
    "file",
    "recepisse.pdf",
    "application/pdf",
    PDF,
    { kind: "identity" },
  );
  await apiCall(ownerCookie, "POST", `/structures/${structure.id}/verification/submit`);

  // File d'administration : capturée avant la validation.
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const ctx = await context(browser, theme, view, damien);
      const p = await ctx.newPage();
      await p.goto("/admin/verification");
      await shot(p, theme, view.id, "20-admin-file");
      await ctx.close();
    }
  }
  await apiCall(damien, "POST", `/admin/structures/${structure.id}/verify`, { verified: true, note: "Récépissé reçu" });

  const day = (offset: number, hour: number) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const mk = async (title: string, offset: number, extra: Record<string, unknown> = {}) => {
    const start = day(offset, 18);
    const e = await apiCall<{ id: string; slug: string }>(ownerCookie, "POST", `/structures/${structure.id}/events`, {
      title,
      format: "gathering",
      description:
        "Soirée sur le port : voitures anciennes, sportives et youngtimers. Ambiance détendue, entrée par le parking nord.",
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 5 * 3_600_000).toISOString(),
      addressLine: "Place de la République",
      postalCode: "66140",
      city: "Canet-en-Roussillon",
      department: "66",
      lat: 42.7058,
      lng: 3.0072,
      admittedVehicleTypes: ["car", "moto"],
      capacity: 60,
      maxVehiclesPerUser: 2,
      admission: "filtered",
      publicAccess: "free",
      registrationsOpenAt: new Date(Date.now() - 3_600_000).toISOString(),
      previewHours: 24,
      rulesText: "Pas de burn, pas de bruit inutile.",
      vendorTypes: ["Food truck", "Barbier", "Glacier"],
      ...extra,
    });
    expect(e.status, JSON.stringify(e.data)).toBe(201);
    return e.data;
  };
  const tomorrow = await mk(`Soirée du port ${s}`, 1);
  await upload(ownerCookie, `/events/${tomorrow.id}/poster`, "poster", "affiche.png", "image/png", poster);
  expect((await apiCall(ownerCookie, "POST", `/events/${tomorrow.id}/publish`)).status).toBe(200);
  const later = await mk(`Exposition d'automne ${s}`, 24, { format: "exhibition" });
  expect((await apiCall(ownerCookie, "POST", `/events/${later.id}/publish`)).status).toBe(200);
  const past = await mk(`Cars & coffee de rentrée ${s}`, -20, { format: "cars_and_coffee" });
  expect((await apiCall(ownerCookie, "POST", `/events/${past.id}/publish`)).status).toBe(200);
  const draft = await mk(`Nocturne de décembre ${s}`, 60, { format: "night" });
  await apiCall(ownerCookie, "POST", `/events/${later.id}/zones`, { code: "A", name: "Allée A" });

  // Une invitation express pour le formulaire.
  const invite = await apiCall<{ url: string }>(ownerCookie, "POST", `/events/${tomorrow.id}/express-invites`, {
    email: `express_${s}@e2e.orasso.test`,
  });
  const expressPath = `/express/${invite.data.url.split("/express/")[1]}`;
  const inviteToken = structure.inviteToken;
  void inviteToken;

  for (const theme of THEMES) {
    for (const view of VIEWS) {
      // --- Pages publiques (visiteur) ---
      const v = await (await context(browser, theme, view)).newPage();
      const slugOfStructure = structure.slug;
      await v.goto("/");
      await shot(v, theme, view.id, "01-accueil");
      await v.goto("/evenements");
      await shot(v, theme, view.id, "02-evenements", 1500);
      await v.goto(`/e/${tomorrow.slug}`);
      await shot(v, theme, view.id, "03-evenement");
      await v.goto(`/o/${slugOfStructure}`);
      await shot(v, theme, view.id, "04-structure");
      await v.goto("/organisateurs");
      await shot(v, theme, view.id, "05-organisateurs");
      await v.goto("/professionnels");
      await shot(v, theme, view.id, "06-professionnels");
      await v.goto(`/invitation/${structure.inviteToken}`);
      await shot(v, theme, view.id, "07-invitation");
      await v.goto(expressPath);
      await shot(v, theme, view.id, "08-express-formulaire");
      await v.context().close();

      // --- Passionné : créer une structure ---
      const fan = await signUpApi(`Fan_${s}_${theme}_${view.id}`);
      const f = await (await context(browser, theme, view, fan)).newPage();
      await f.goto("/app/structure/nouvelle");
      await shot(f, theme, view.id, "10-structure-creation");
      await f.context().close();

      // --- Organisateur ---
      const o = await (await context(browser, theme, view, ownerCookie)).newPage();
      await o.goto(`/orga/${structure.slug}`);
      await shot(o, theme, view.id, "11-orga-evenements");
      await o.goto(`/orga/${structure.slug}/structure`);
      await shot(o, theme, view.id, "12-orga-structure");
      await o.goto(`/orga/${structure.slug}/e/${tomorrow.id}`);
      await shot(o, theme, view.id, "13-orga-evenement-publie");
      await o.goto(`/orga/${structure.slug}/e/${draft.id}`);
      await shot(o, theme, view.id, "14-orga-evenement-brouillon");
      await o.goto(`/orga/${structure.slug}/nouvel-evenement`);
      await o.waitForLoadState("networkidle");
      await shot(o, theme, view.id, "15-assistant-1-format");
      await o.getByLabel("Titre").fill("Rassemblement d'exemple");
      await o.getByLabel("Début").fill("2026-12-05T18:00");
      await o.getByLabel("Fin").fill("2026-12-05T23:00");
      for (let i = 0; i < 3; i++) await o.getByRole("button", { name: "Suivant" }).click();
      await shot(o, theme, view.id, "16-assistant-4-prestataires");
      for (let i = 0; i < 3; i++) await o.getByRole("button", { name: "Suivant" }).click();
      await shot(o, theme, view.id, "17-assistant-7-criteres");
      for (let i = 0; i < 3; i++) await o.getByRole("button", { name: "Suivant" }).click();
      await shot(o, theme, view.id, "18-assistant-10-infos");
      await o.getByRole("button", { name: "Suivant" }).click();
      await o.getByRole("button", { name: "Ajouter une zone" }).click();
      await o.getByLabel("Code").fill("JDM");
      await o.getByLabel("Nom", { exact: true }).fill("Zone JDM");
      await shot(o, theme, view.id, "19-assistant-11-zones");
      await o.getByRole("button", { name: "Suivant" }).click();
      await shot(o, theme, view.id, "19b-assistant-12-billetterie");
      await o.context().close();
    }
  }

  // --- Express : écran de fin (le lien ne sert qu'une fois) : un lien par vue et par thème ---
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const link = await apiCall<{ url: string }>(ownerCookie, "POST", `/events/${tomorrow.id}/express-invites`, {
        email: `express_${s}_${theme}_${view.id}@e2e.orasso.test`,
      });
      const g = await (await context(browser, theme, view)).newPage();
      await g.goto(`/express/${link.data.url.split("/express/")[1]}`);
      await g.waitForLoadState("networkidle");
      const form = g.getByTestId("express-form");
      await form.getByLabel("Pseudo").fill(`Camille_${s}${theme[0]}${view.id[0]}`);
      await form.getByLabel("Mot de passe", { exact: true }).fill("mot-de-passe-express-2026");
      await form.getByLabel("Mot de passe, encore une fois").fill("mot-de-passe-express-2026");
      await form.getByLabel("Prénom").fill("Camille");
      await form.getByLabel("Nom", { exact: true }).fill("Durand");
      await form.getByLabel("Marque").selectOption({ label: "BMW" });
      await expect(form.getByLabel("Modèle").locator("option")).not.toHaveCount(1);
      await form.getByLabel("Modèle").selectOption({ index: 1 });
      await form.getByLabel("Plaque d'immatriculation").fill(randomPlate());
      await form
        .getByLabel("Photo du véhicule")
        .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: poster });
      await form.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
      await shot(g, theme, view.id, "08b-express-rempli");
      await form.getByRole("button", { name: "M'inscrire" }).click();
      await expect(g.getByTestId("express-done")).toBeVisible({ timeout: 30_000 });
      await shot(g, theme, view.id, "09-express-inscrit");
      await g.context().close();
    }
  }

  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  void SEED_PASSWORD;
});
