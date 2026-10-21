import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, resuspendSeedStructure, SEED_PASSWORD, samplePhoto } from "./helpers";

// Appli dans le navigateur (lot 35b, décision D20 : tout se gère depuis l'appli). Deux parcours de la fiche :
// 1. créer un événement d'un jour de bout en bout depuis l'appli (brouillon gardé après une sortie), le publier, le
//    dupliquer, puis modifier la copie et la passer à plusieurs jours ;
// 2. décision groupée de 3 candidatures (feuille des motifs), puis invitation nominative depuis un événement passé
//    (confirmation), invitation d'un véhicule proposé et retrait d'une invitation.
// Puis les écrans dans le thème Sable, une structure suspendue (message de l'API, sans plantage) et un passionné qui
// n'a pas accès à l'assistant. Contrôle des règles du système de design sur chaque capture (390 px).
// Lancer avec APP_URL=http://localhost:<port de Metro> (EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SITE_URL et CORS_ORIGINS posés).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-35b-captures";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";

async function openApp(browser: Browser, email: string, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((th) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", th);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function chooseOrganizer(page: Page, name: string) {
  await page.goto("/moi"); // Lot 40 : les casquettes sont dans Mon profil (plus d'avatar en haut).
  await page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
}

/** Ouvre une adresse de l'appli et attend la fin de l'ouverture animée. */
async function go(page: Page, path: string) {
  await page.goto(path);
  await page.waitForTimeout(3500);
}

/** Les écrans des onglets restent montés derrière l'écran courant : on vise l'élément visible. */
const v = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

type Audit = { greens: string[]; truncated: string[]; horizontalScroll: boolean; noIcon: string[] };

/** Règles du système de design vérifiables dans le DOM : pas de vert, rien de tronqué, pas de défilement horizontal. */
async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const isGreen = (color: string) => {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return false;
      const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      if (a < 0.2) return false;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 40 || max !== g) return false;
      let h = 60 * ((b - r) / (max - min)) + 120;
      if (h < 0) h += 360;
      return h > 85 && h < 165;
    };
    const all = [...document.querySelectorAll("body *")].filter(visible);
    const greens = new Set<string>();
    for (const el of all) {
      const s = getComputedStyle(el);
      for (const c of [s.color, s.backgroundColor, s.borderTopColor]) if (isGreen(c)) greens.add(`${el.tagName} ${c}`);
    }
    const label = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const buttons = all.filter(
      (el) =>
        el.getAttribute("role") === "button" &&
        label(el).length > 0 &&
        getComputedStyle(el).textTransform === "uppercase",
    );
    return {
      greens: [...greens].slice(0, 10),
      truncated: all
        .filter((el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        .map(label),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      noIcon: buttons.filter((el) => !el.querySelector("svg")).map(label),
    };
  });
}

const results: Record<string, Audit> = {};
async function shot(page: Page, name: string) {
  // Les feuilles glissent en 300 ms : on attend qu'elles soient en place.
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  results[name] = await audit(page);
}

const next = (page: Page) => v(page, "wizard-next").click();
async function stepIs(page: Page, label: string) {
  await expect(v(page, "wizard-step")).toContainText(label, { timeout: 15_000 });
}

async function structureOf(cookie: string, name: string) {
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(cookie, "GET", "/me");
  const s = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes(name));
  expect(s).toBeTruthy();
  return s?.id ?? "";
}

type Ev = {
  id: string;
  title: string;
  status: string;
  capacity: number | null;
  days: { date: string }[];
  zones: { code: string }[];
  posterUrl: string | null;
  vendorTypes: string[];
  parentEventId: string | null;
};

test("créer un événement d'un jour depuis l'appli, le publier, le dupliquer, passer la copie à plusieurs jours", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const title = `Rasso recette ${Date.now().toString().slice(-6)}`;

  const { ctx, page } = await openApp(browser, "damien@orasso.local", "beton");
  await chooseOrganizer(page, "MéditeSportCar");
  await tab(page, "Événements").click();
  await v(page, "orga-create-event").click();
  // Lot 53 : huit temps (type, lieu, arrivées, critères, avant-première, règlement, affiche, tout est prêt).
  await stepIs(page, "Type");
  await shot(page, "01-assistant-format-beton");
  await v(page, "wizard-formats").getByText("Nocturne", { exact: true }).click();
  await v(page, "wizard-title").fill(title);
  await v(page, "wizard-description").fill("Rendez-vous sur le port, café offert.");
  await v(page, "wizard-date").fill("2026-12-06");
  await v(page, "wizard-start-time").fill("18h");
  await v(page, "wizard-start-time").blur();
  await v(page, "wizard-end-time").fill("23:30");
  await v(page, "wizard-end-time").blur();
  // Volet « Public et places » : véhicules et places (la règle du site s'affiche sans nombre).
  await v(page, "wizard-panel-places-toggle").click();
  await page.getByRole("checkbox", { name: "Moto" }).filter({ visible: true }).click();
  await v(page, "wizard-capacity-mode").getByText("Avec une limite").click();
  await next(page);
  await expect(page.getByText("Indique un nombre de places supérieur à zéro.").filter({ visible: true })).toBeVisible();
  await shot(page, "02-assistant-dates-erreur-beton");
  await v(page, "wizard-capacity").fill("40");
  await next(page);
  await stepIs(page, "Lieu");
  await v(page, "wizard-address").fill("Quai Georges Pompidou");
  await v(page, "wizard-postal-code").fill("66140");
  await v(page, "wizard-city").fill("Canet-en-Roussillon");
  await v(page, "wizard-check-address").click();
  await expect(v(page, "wizard-address-status")).not.toHaveText("Recherche…", { timeout: 20_000 });
  await shot(page, "03-assistant-lieu-beton");

  // Avant l'adresse, la saisie reste sur le téléphone : l'assistant rouvert la reprend.
  await page.waitForTimeout(800);
  await go(page, "/nouvel-evenement");
  await expect(v(page, "wizard-resumed")).toBeVisible({ timeout: 20_000 });
  await stepIs(page, "Lieu");
  await expect(v(page, "wizard-city")).toHaveValue("Canet-en-Roussillon");
  await shot(page, "04-assistant-brouillon-repris-beton");
  // Volet « Sur place » : prestataires attendus et zones ; « Continuer » enregistre le brouillon.
  await v(page, "wizard-panel-onsite-toggle").click();
  await page.getByRole("checkbox", { name: "Food truck" }).filter({ visible: true }).click();
  await v(page, "wizard-zone-add").click();
  await v(page, "wizard-zone-0-code").fill("a");
  await v(page, "wizard-zone-0-name").fill("Alpha");
  await v(page, "wizard-zone-0-capacity").fill("20");
  await shot(page, "07-assistant-zones-beton");
  await next(page);
  await stepIs(page, "Arrivées");
  await next(page);
  await stepIs(page, "Critères");
  await v(page, "wizard-categories").getByText("JDM", { exact: true }).click();
  await v(page, "wizard-makes-search").fill("Toyo");
  await page.getByText("Toyota", { exact: true }).filter({ visible: true }).first().click();
  await shot(page, "05-assistant-criteres-beton");
  await next(page);
  await stepIs(page, "Avant-première");
  await next(page);
  await stepIs(page, "Règlement");
  await v(page, "wizard-instructions").fill("Entrée par le parking nord.");
  await next(page);
  await stepIs(page, "Affiche");
  const chooser = page.waitForEvent("filechooser");
  await v(page, "wizard-poster-pick").click();
  (await chooser).setFiles({ name: "affiche.png", mimeType: "image/png", buffer: samplePhoto([200, 140, 30]) });
  await expect(page.getByText("Affiche choisie", { exact: false }).filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
  await shot(page, "06-assistant-affiche-beton");
  await next(page);
  await stepIs(page, "Tout est prêt");
  await expect(v(page, "wizard-recap")).toContainText(title);
  await shot(page, "08-assistant-recapitulatif-beton");
  await v(page, "wizard-save").click();

  await page.waitForURL(/\/evenement\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const eventId = /\/evenement\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? "";
  await expect(page.getByText("Brouillon enregistré.").filter({ visible: true })).toBeVisible({ timeout: 20_000 });
  const created = (await apiCall<Ev>(damien, "GET", `/events/${eventId}`)).data;
  expect(created).toMatchObject({ title, status: "draft", capacity: 40, vendorTypes: ["Food truck"] });
  expect(created.zones.map((z) => z.code)).toEqual(["A"]);
  expect(created.posterUrl).toBeTruthy();
  await shot(page, "09-evenement-brouillon-beton");

  // Publier, avec confirmation.
  await v(page, "orga-publish").click();
  await shot(page, "10-publier-confirmation-beton");
  await v(page, "orga-confirm").click();
  await expect(page.getByText("Événement publié", { exact: false }).filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
  expect((await apiCall<Ev>(damien, "GET", `/events/${eventId}`)).data.status).toBe("published");
  await shot(page, "11-evenement-publie-beton");

  // Dupliquer, avec confirmation : la copie s'ouvre dans l'assistant.
  await v(page, "orga-duplicate").click();
  await v(page, "orga-confirm").click();
  await page.waitForURL(/\/modifier/, { timeout: 30_000 });
  const copyId = /\/evenement\/([0-9a-f-]{36})\/modifier/.exec(page.url())?.[1] ?? "";
  expect(copyId).not.toBe(eventId);
  await expect(page.getByText("Copie créée en brouillon", { exact: false }).filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
  await shot(page, "12-copie-assistant-beton");

  // La copie passe à plusieurs jours (trois jours, accès au choix) : elle rouvre sur le temps « Type ».
  await go(page, `/evenement/${copyId}/modifier?temps=type`);
  await stepIs(page, "Type");
  await v(page, "wizard-kind-multi").click();
  await expect(v(page, "wizard-day")).toHaveCount(2);
  await v(page, "wizard-day-0-date").fill("2027-01-09");
  await v(page, "wizard-day-1-date").fill("2027-01-10");
  await v(page, "wizard-day-add").click();
  await expect(v(page, "wizard-day")).toHaveCount(3);
  await v(page, "wizard-days").getByText("Par jour", { exact: true }).click();
  await shot(page, "13-copie-plusieurs-jours-beton");
  for (let i = 0; i < 8; i++) {
    if (await v(page, "wizard-save").count()) break;
    const before = (await v(page, "wizard-step").textContent()) ?? "";
    await next(page);
    await expect(v(page, "wizard-step")).not.toHaveText(before, { timeout: 30_000 });
  }
  await v(page, "wizard-save").click();
  await page.waitForURL(new RegExp(`/evenement/${copyId}(\\?|$)`), { timeout: 30_000 });
  await expect(page.getByText("Modifications enregistrées.").filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
  const copy = (await apiCall<Ev>(damien, "GET", `/events/${copyId}`)).data;
  expect(copy.days.map((d) => d.date)).toEqual(["2027-01-09", "2027-01-10", "2027-01-11"]);
  expect(copy.status).toBe("draft");
  expect(copy.parentEventId).toBe(eventId);
  await shot(page, "14-copie-enregistree-beton");
  await ctx.close();
  writeFileSync(`${DIR}/audit-1.json`, JSON.stringify(results, null, 2));
});

test("décision groupée de 3 candidatures, puis invitations depuis un événement passé", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const sid = await structureOf(damien, "MéditeSportCar");
  type Card = { id: string; title: string; status: string };
  const events = (await apiCall<Card[]>(damien, "GET", `/structures/${sid}/events`)).data;
  let target: { id: string; title: string } | null = null;
  for (const e of events.filter((x) => x.status === "published")) {
    const c = (await apiCall<{ pending: number }>(damien, "GET", `/events/${e.id}/counters`)).data;
    if (c.pending >= 3) {
      target = e;
      break;
    }
  }
  expect(target, "un événement publié avec au moins 3 candidatures à trier").toBeTruthy();
  const tid = target?.id ?? "";
  const before = (await apiCall<{ refused: number }>(damien, "GET", `/events/${tid}/counters`)).data.refused;

  const { ctx, page } = await openApp(browser, "damien@orasso.local", "beton");
  await chooseOrganizer(page, "MéditeSportCar");
  await tab(page, "Tri").click();
  await page.getByTestId("triage-event-picker").click();
  await page
    .getByTestId("triage-event-choice")
    .filter({ hasText: target?.title ?? "" })
    .click();
  await expect(page.getByTestId("triage-counters")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "En liste", exact: true }).click();
  await expect(page.getByTestId("triage-list-row").first()).toBeVisible({ timeout: 20_000 });
  const boxes = page.getByTestId("triage-list").getByRole("checkbox");
  for (let i = 0; i < 3; i++) await boxes.nth(i).click();
  await expect(page.getByTestId("triage-bulk")).toContainText("3 sélectionnées");
  await shot(page, "20-tri-selection-beton");
  await page.getByTestId("triage-bulk-refuse").click();
  await page.getByRole("checkbox", { name: /Photos insuffisantes/ }).click();
  await shot(page, "21-tri-motifs-beton");
  await page.getByTestId("triage-refusal-confirm").click();
  await expect(page.getByText(/3 décisions enregistrées/)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await apiCall<{ refused: number }>(damien, "GET", `/events/${tid}/counters`)).data.refused, {
      timeout: 15_000,
    })
    .toBe(before + 3);
  await shot(page, "22-tri-decision-groupee-beton");

  // Un événement publié, ouvert aux inscriptions, pour les invitations.
  const created = await apiCall<{ id: string }>(damien, "POST", `/structures/${sid}/events`, {
    title: `Expo sur invitation ${Date.now().toString().slice(-5)}`,
    format: "exhibition",
    startsAt: "2027-02-14T09:00:00.000Z",
    endsAt: "2027-02-14T17:00:00.000Z",
    addressLine: "Parc des expositions",
    city: "Perpignan",
    postalCode: "66000",
    admittedVehicleTypes: ["car"],
    admission: "invite_only",
    registrationsOpenAt: new Date(Date.now() - 3_600_000).toISOString(),
  });
  expect(created.status).toBe(201);
  const eid = created.data.id;
  expect((await apiCall(damien, "POST", `/events/${eid}/publish`)).status).toBe(200);

  await go(page, `/evenement/${eid}/inviter`);
  await expect(v(page, "invite-from-event").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "23-inviter-beton");
  await v(page, "invite-from-event").first().click();
  await shot(page, "24-inviter-edition-confirmation-beton");
  await v(page, "orga-confirm").click();
  await expect(
    page
      .getByText(/invitation.* envoyée/i)
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  const sent = (await apiCall<{ id: string; status: string }[]>(damien, "GET", `/events/${eid}/invitations`)).data;
  expect(sent.length).toBeGreaterThan(0);

  // Un véhicule proposé (abonnés, retenus passés) encore libre, puis retrait d'une invitation en attente.
  const free = v(page, "invitation-candidates").getByRole("checkbox", { checked: false, disabled: false });
  if (await free.count()) {
    await free.first().click();
    await v(page, "invite-send").click();
    await expect
      .poll(async () => (await apiCall<unknown[]>(damien, "GET", `/events/${eid}/invitations`)).data.length, {
        timeout: 15_000,
      })
      .toBe(sent.length + 1);
  }
  const withdrawn = async () =>
    (await apiCall<{ status: string }[]>(damien, "GET", `/events/${eid}/invitations`)).data.filter(
      (i) => i.status === "withdrawn",
    ).length;
  const withdrawnBefore = await withdrawn();
  await v(page, "invitation-remove").first().click();
  await shot(page, "25-inviter-retrait-confirmation-beton");
  await v(page, "orga-confirm").click();
  await expect(page.getByText("Invitation retirée.").filter({ visible: true })).toBeVisible({ timeout: 20_000 });
  await expect.poll(withdrawn, { timeout: 15_000 }).toBe(withdrawnBefore + 1);
  await shot(page, "26-inviter-liste-beton");
  await ctx.close();
  writeFileSync(`${DIR}/audit-2.json`, JSON.stringify(results, null, 2));
});

test("thème Sable, structure suspendue et passionné sans accès", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const sid = await structureOf(damien, "MéditeSportCar");
  const events = (
    await apiCall<{ id: string; title: string; status: string }[]>(damien, "GET", `/structures/${sid}/events`)
  ).data;
  const published = events.find((e) => e.status === "published");
  const draft = events.find((e) => e.status === "draft");

  const { ctx, page } = await openApp(browser, "damien@orasso.local", "sable");
  await chooseOrganizer(page, "MéditeSportCar");
  await tab(page, "Événements").click();
  await shot(page, "30-evenements-sable");
  await v(page, "orga-create-event").click();
  // Un brouillon reste peut-être d'un passage précédent : on repart de zéro.
  if (await v(page, "wizard-restart").count()) await v(page, "wizard-restart").click();
  await stepIs(page, "Type");
  await v(page, "wizard-title").fill("Rasso Sable");
  await shot(page, "31-assistant-format-sable");
  await v(page, "wizard-kind-multi").click();
  await shot(page, "32-assistant-plusieurs-jours-sable");
  await v(page, "wizard-kind-one").click();
  await v(page, "wizard-date").fill("2026-12-20");
  await v(page, "wizard-start-time").fill("10:00");
  await v(page, "wizard-end-time").fill("12:00");
  await v(page, "wizard-end-time").blur();
  await next(page);
  await stepIs(page, "Lieu");
  await shot(page, "33-assistant-lieu-sable");
  // Lot 36 : adresse et ville obligatoires. On ne va pas plus loin : sans « Continuer », rien n'est enregistré.
  await v(page, "wizard-address").fill("Plage du Racou");
  await v(page, "wizard-city").fill("Argelès-sur-Mer");
  await shot(page, "35-assistant-recapitulatif-sable"); // Quitter : le brouillon reste sur le téléphone (confirmation), puis on l'efface pour les prochains passages.
  await v(page, "wizard-back").click();
  await page.getByRole("button", { name: "Fermer" }).filter({ visible: true }).first().click();
  await shot(page, "36-assistant-quitter-sable");
  await v(page, "orga-confirm").click();
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.includes("event-draft")) localStorage.removeItem(k);
  });

  if (draft) {
    await go(page, `/evenement/${draft.id}`);
    await expect(v(page, "orga-event-head")).toBeVisible({ timeout: 30_000 });
    await shot(page, "37-evenement-brouillon-sable");
  }
  if (published) {
    await go(page, `/evenement/${published.id}`);
    await expect(v(page, "orga-event-head")).toBeVisible({ timeout: 30_000 });
    await shot(page, "38-evenement-publie-sable");
    await v(page, "orga-recurrence").getByRole("button").click();
    await expect(v(page, "recurrence-preview")).toBeVisible();
    await shot(page, "39-recurrence-sable");
    await page.keyboard.press("Escape");
    await go(page, `/evenement/${published.id}/inviter`);
    await page.waitForTimeout(1500);
    await shot(page, "40-inviter-sable");
    await go(page, `/evenement/${published.id}/modifier`);
    await stepIs(page, "Type");
    await shot(page, "41-modifier-sable");
  }
  await ctx.close();

  // Structure suspendue : l'assistant s'ouvre, l'enregistrement est refusé avec le message de l'API (sans plantage).
  // La recette du site « après l'événement » lève la suspension du seed : on la remet (lot 34, ordre des recettes).
  await resuspendSeedStructure();
  const tram = await openApp(browser, "pres_tramontane@orasso.local", "sable");
  await chooseOrganizer(tram.page, "Tramontane Auto Club");
  await go(tram.page, "/nouvel-evenement");
  if (await v(tram.page, "wizard-restart").count()) await v(tram.page, "wizard-restart").click();
  await v(tram.page, "wizard-title").fill("Sortie hivernale");
  await v(tram.page, "wizard-date").fill("2027-01-17");
  await v(tram.page, "wizard-start-time").fill("09:00");
  await v(tram.page, "wizard-end-time").fill("12:00");
  await v(tram.page, "wizard-end-time").blur();
  await next(tram.page);
  // Lot 36 : adresse et ville obligatoires ; « Continuer » enregistre le brouillon, et l'API refuse.
  await v(tram.page, "wizard-address").fill("Place de la Loge");
  await v(tram.page, "wizard-city").fill("Perpignan");
  await next(tram.page);
  await expect(
    tram.page.getByText("Structure suspendue", { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible({
    timeout: 20_000,
  });
  await shot(tram.page, "42-structure-suspendue-sable");
  await tram.page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.includes("event-draft")) localStorage.removeItem(k);
  });
  await tram.ctx.close();

  // Passionné : pas de casquette Organisateur, l'assistant ne s'affiche pas.
  const kenji = await openApp(browser, "kenji@orasso.local", "beton");
  await go(kenji.page, "/nouvel-evenement");
  await expect(kenji.page.getByTestId("wizard-step")).toHaveCount(0);
  await shot(kenji.page, "43-passionne-sans-acces-beton");
  await kenji.ctx.close();
  writeFileSync(`${DIR}/audit-3.json`, JSON.stringify(results, null, 2));
});
