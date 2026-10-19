import { mkdirSync } from "node:fs";
import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { apiCall, decideApi, login, SEED_PASSWORD } from "./helpers";

// Appli dans le navigateur (lot 23) : tri par glissement de la casquette Organisateur. Damien trie la « Nocturne de
// Canet » (seed : 27 à trier) à la souris : 5 décisions par glissement ou bouton (dont un refus motivé et une liste
// d'attente), une annulée dans les 5 s, compteurs à jour, liste d'attente réordonnée, onglet Prestataires, crew affiché,
// mode liste (3 refus en masse). Puis réduction des animations (aucune translation) et sans réseau.
// Lancer avec APP_URL=http://localhost:<relais> (voir appli-orga.spec.ts). Captures dans les deux thèmes.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-23-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";

test.use({ actionTimeout: 20_000 });

/** Ferme la feuille ouverte par son voile (« Fermer »), comme le ferait un appui hors de la feuille. */
async function closeSheet(page: Page) {
  await page
    .getByRole("button", { name: "Fermer", exact: true })
    .first()
    .click({ position: { x: 100, y: 15 } });
  await expect(page.getByRole("button", { name: "Fermer", exact: true })).toHaveCount(0, { timeout: 5_000 });
}

async function openApp(
  browser: Browser,
  theme: Theme,
  reducedMotion: "reduce" | "no-preference" = "no-preference",
  eventTitle = "Nocturne de Canet",
) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: APP,
    reducedMotion,
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((th) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", th);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  await page.goto("/moi"); // Lot 40 : les casquettes sont dans Mon profil (plus d'avatar en haut).
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
  await page.getByRole("tab", { name: "Tri", exact: true }).click();
  await page.getByTestId("triage-event-picker").click();
  await page.getByTestId("triage-event-choice").filter({ hasText: eventTitle }).click();
  await expect(page.getByTestId("triage-counters")).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

/** Glissement à la souris : plusieurs étapes, comme un doigt. */
async function drag(page: Page, target: Locator, dx: number, dy: number, release = true) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Carte introuvable");
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
  if (release) await page.mouse.up();
}

async function counter(page: Page, label: string): Promise<number> {
  const text = await page.getByTestId("triage-counters").innerText();
  const m = new RegExp(`(\\d+)\\s*${label}`, "i").exec(text);
  return m ? Number(m[1]) : Number.NaN;
}

const apiCounters = async (cookie: string, eventId: string) =>
  (
    await apiCall<{ accepted: number; pending: number; waitlisted: number; refused: number }>(
      cookie,
      "GET",
      `/events/${eventId}/counters`,
    )
  ).data;

test("tri par glissement : 5 décisions, annulation, liste d'attente, prestataires, crew, mode liste", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(damien, "GET", "/me");
  const structure = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("MéditeSportCar"));
  const events = await apiCall<{ id: string; title: string }[]>(damien, "GET", `/structures/${structure?.id}/events`);
  const nocturne = events.data.find((e) => e.title.includes("Nocturne de Canet"));
  expect(nocturne).toBeTruthy();
  const eventId = nocturne?.id ?? "";
  // Liste d'attente d'au moins trois lignes (lot 34) : la Nocturne a des places libres, donc la moindre place libérée
  // (désistement, offre échue) offre toute la liste d'attente du seed ; on en remet trois de côté avant le tri.
  const waiting = await apiCall<{ items: { id: string }[] }>(
    damien,
    "GET",
    `/events/${eventId}/applications?status=waitlisted&limit=10`,
  );
  if (waiting.data.items.length < 3) {
    const pending = await apiCall<{ items: { id: string }[] }>(
      damien,
      "GET",
      `/events/${eventId}/applications?status=pending&sort=created_at&limit=30`,
    );
    for (const a of pending.data.items.slice(-(3 - waiting.data.items.length))) {
      await decideApi(damien, eventId, a.id, "waitlist");
    }
  }
  const before = await apiCounters(damien, eventId);

  const { ctx, page } = await openApp(browser, "beton");
  const shot = (name: string) => page.screenshot({ path: `${DIR}/${name}.png` });
  const card = page.getByTestId("triage-swipe");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("triage-vehicle")).toBeVisible();
  expect(await counter(page, "À trier")).toBe(before.pending);
  await shot("01-tri-carte-beton");

  const settle = async () => {
    await expect(page.getByTestId("triage-armed")).toHaveCount(0, { timeout: 30_000 });
  };

  // 1. Droite : Retenir (étiquette « Retenue » pendant le geste, bandeau Annuler après).
  const first = await card.boundingBox();
  const cx = (first?.x ?? 0) + (first?.width ?? 0) / 2;
  const cy = (first?.y ?? 0) + (first?.height ?? 0) * 0.6;
  await drag(page, card, 60, 0, false);
  await expect(page.getByTestId("triage-tag-accept")).toBeVisible();
  await shot("02-glissement-retenue-beton");
  await page.mouse.move(cx + 260, cy);
  await page.mouse.up();
  await expect(page.getByTestId("triage-armed")).toContainText("Retenue", { timeout: 10_000 });
  await shot("03-bandeau-annuler-beton");
  await settle();

  // 2. Haut : Liste d'attente.
  await expect(card).toBeVisible();
  await drag(page, card, 0, -260);
  await expect(page.getByTestId("triage-armed")).toContainText("Liste d'attente", { timeout: 10_000 });
  await settle();

  // 3. Gauche : feuille des motifs, refus motivé.
  await drag(page, card, -260, 0);
  await expect(page.getByTestId("triage-refusal-confirm")).toBeVisible({ timeout: 10_000 });
  await shot("04-motifs-refus-beton");
  await page.getByRole("checkbox", { name: /Hors thème/ }).click();
  await page.getByTestId("triage-refusal-confirm").click();
  await expect(page.getByTestId("triage-armed")).toContainText("Refusée", { timeout: 10_000 });
  await settle();

  // 4. Bouton Retenir puis Annuler dans les 5 s : la même carte revient, rien n'est envoyé.
  const title = (await page.getByTestId("triage-vehicle").textContent()) ?? "";
  await page.getByTestId("triage-accept").click();
  await expect(page.getByTestId("triage-armed")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("triage-undo").click();
  await expect(page.getByTestId("triage-armed")).toHaveCount(0);
  await expect(page.getByTestId("triage-vehicle")).toHaveText(title, { timeout: 10_000 });
  // Refuser sans motif : la feuille refuse de confirmer.
  await page.getByTestId("triage-refuse").click();
  await page.getByTestId("triage-refusal-confirm").click();
  await expect(page.getByText("Choisis au moins un motif.")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).last().click();
  await expect(page.getByTestId("triage-armed")).toHaveCount(0);

  // 4 bis. La même carte, Retenir pour de bon (bouton) ; 5. Droite : Retenir.
  await page.getByTestId("triage-accept").click();
  await expect(page.getByTestId("triage-armed")).toBeVisible({ timeout: 10_000 });
  await drag(page, card, 260, 0);
  await expect(page.getByTestId("triage-armed")).toHaveCount(2, { timeout: 10_000 });
  await settle();

  // Compteurs : 5 décisions envoyées (3 retenues, 1 attente, 1 refus), identiques à l'API.
  await expect
    .poll(async () => (await apiCounters(damien, eventId)).pending, { timeout: 20_000 })
    .toBe(before.pending - 5);
  const after = await apiCounters(damien, eventId);
  expect(after.accepted).toBe(before.accepted + 3);
  expect(after.waitlisted).toBe(before.waitlisted + 1);
  expect(after.refused).toBe(before.refused + 1);
  await expect.poll(() => counter(page, "À trier"), { timeout: 30_000 }).toBe(after.pending);
  expect(await counter(page, "Retenus")).toBe(after.accepted);
  await shot("05-compteurs-beton");

  // Fiche complète.
  await page.getByTestId("triage-full").click();
  await expect(page.getByTestId("triage-full-title")).toBeVisible();
  await shot("06-fiche-complete-beton");
  await closeSheet(page);

  // --- Liste d'attente : réordonnée (Descendre), puis Retenir ---------------------------------------------------
  await page.getByRole("button", { name: "Attente", exact: true }).first().click();
  await expect(page.getByTestId("waitlist-row").first()).toBeVisible({ timeout: 20_000 });
  const order = async () =>
    (
      await apiCall<{ items: { id: string; applicant: { pseudo: string } }[] }>(
        damien,
        "GET",
        `/events/${eventId}/applications?status=waitlisted&sort=waitlist_rank&limit=100`,
      )
    ).data.items.map((i) => i.applicant.pseudo);
  const o1 = await order();
  await shot("07-liste-attente-beton");
  await page
    .getByRole("button", { name: /^Descendre/ })
    .first()
    .click();
  await expect.poll(async () => (await order())[0], { timeout: 15_000 }).toBe(o1[1]);
  // Glisser-déposer : la première ligne descend d'un cran (poignée).
  const o2 = await order();
  const handle = page.getByTestId("waitlist-handle").first();
  await drag(page, handle, 0, 220);
  await expect.poll(async () => (await order())[0], { timeout: 15_000 }).not.toBe(o2[0]);
  const countBefore = (await apiCounters(damien, eventId)).accepted;
  await page.getByTestId("waitlist-keep").first().click();
  await expect
    .poll(async () => (await apiCounters(damien, eventId)).accepted, { timeout: 15_000 })
    .toBe(countBefore + 1);

  // --- Prestataires : une décision ---------------------------------------------------------------------------------
  await page.getByRole("button", { name: /^Prestataires/ }).click();
  await expect(page.getByTestId("triage-vehicle")).toBeVisible({ timeout: 20_000 });
  await shot("08-prestataire-beton");
  const providerTitle = (await page.getByTestId("triage-vehicle").textContent()) ?? "";
  await page.getByTestId("triage-accept").click();
  await expect(page.getByTestId("triage-armed")).toContainText("Retenue", { timeout: 10_000 });
  await settle();
  await expect(page.getByTestId("triage-empty").or(page.getByTestId("triage-vehicle"))).toBeVisible();
  if (await page.getByTestId("triage-vehicle").count()) {
    expect(await page.getByTestId("triage-vehicle").textContent()).not.toBe(providerTitle);
  }

  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.getByTestId("triage-list-row").first()).toBeVisible({ timeout: 20_000 });
  await shot("09-mode-liste-beton");

  // --- Mode liste : 3 refus en masse -------------------------------------------------------------------------------
  const refusedBefore = (await apiCounters(damien, eventId)).refused;
  const boxes = page.getByRole("checkbox");
  for (let i = 0; i < 3; i++) await boxes.nth(i).click();
  await expect(page.getByTestId("triage-bulk")).toContainText("3 sélectionnées");
  await shot("11-selection-beton");
  await page.getByTestId("triage-bulk-refuse").click();
  await page.getByRole("checkbox", { name: /Photos insuffisantes/ }).click();
  await page.getByTestId("triage-refusal-confirm").click();
  await expect(page.getByText(/3 décisions enregistrées/)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await apiCounters(damien, eventId)).refused, { timeout: 15_000 })
    .toBe(refusedBefore + 3);
  await shot("12-refus-en-masse-beton");
  await ctx.close();
});

test("tri : réduction des animations (aucune translation) et sans réseau", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const { ctx, page } = await openApp(browser, "beton", "reduce");
  const card = page.getByTestId("triage-swipe");
  await expect(card).toBeVisible({ timeout: 30_000 });
  const start = await card.boundingBox();
  await drag(page, card, 200, 0, false);
  // Aucune translation : la carte reste où elle est, l'étiquette apparaît en fondu.
  const during = await card.boundingBox();
  expect(Math.abs((during?.x ?? 0) - (start?.x ?? 0))).toBeLessThan(2);
  await expect(page.getByTestId("triage-tag-accept")).toBeVisible();
  await page.screenshot({ path: `${DIR}/20-reduit-glissement-beton.png` });
  await page.mouse.up();
  await expect(page.getByTestId("triage-armed")).toBeVisible({ timeout: 10_000 });
  // Annuler : rien n'est décidé, la carte revient.
  await page.getByTestId("triage-undo").click();
  await expect(page.getByTestId("triage-armed")).toHaveCount(0);
  await expect(card).toBeVisible();

  // Sans réseau : message clair, boutons éteints, rien d'envoyé.
  await ctx.setOffline(true);
  await expect(page.getByText(/Pas de connexion/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("triage-accept")).toBeDisabled();
  await page.screenshot({ path: `${DIR}/21-hors-ligne-beton.png` });
  await ctx.setOffline(false);
  await ctx.close();
});

test("tri : crew affiché avec ses autres candidatures", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(damien, "GET", "/me");
  const structure = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("MéditeSportCar"));
  const events = await apiCall<{ id: string; title: string }[]>(damien, "GET", `/structures/${structure?.id}/events`);
  const expo = events.data.find((e) => e.title.includes("Expo Rivesaltes"));
  const pending = await apiCall<{
    items: { applicant: { pseudo: string }; crew: { name: string; members: { pseudo: string }[] } | null }[];
  }>(damien, "GET", `/events/${expo?.id}/applications?status=pending&limit=100`);
  const withCrew = pending.data.items.find((i) => i.crew);
  expect(withCrew, "une candidature de crew en attente (seed : Roussillon Drift)").toBeTruthy();
  const { ctx, page } = await openApp(browser, "beton", "no-preference", "Expo Rivesaltes");
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.getByTestId("triage-filters").click();
  await page.getByTestId("triage-filter-q").fill(withCrew?.applicant.pseudo ?? "");
  await page.getByTestId("triage-filters-apply").click();
  await expect(page.getByTestId("triage-list-row")).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole("button", { name: /Ouvrir la fiche/ }).click();
  await expect(page.getByText(new RegExp(withCrew?.crew?.name ?? "crew")).first()).toBeVisible();
  await page.screenshot({ path: `${DIR}/10-fiche-crew-beton.png` });
  await closeSheet(page);
  // Dans la file : la carte du crew porte son nom (les membres non confirmés ne sont jamais nommés).
  await page.getByRole("button", { name: "Véhicules", exact: true }).click();
  await expect(page.getByTestId("triage-swipe")).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

test("tri : thème Sable", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const { ctx, page } = await openApp(browser, "sable");
  await expect(page.getByTestId("triage-swipe")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${DIR}/30-tri-carte-sable.png` });
  await page.getByTestId("triage-full").click();
  await expect(page.getByTestId("triage-full-title")).toBeVisible();
  await page.screenshot({ path: `${DIR}/31-fiche-sable.png` });
  await closeSheet(page);
  await page.getByRole("button", { name: "Attente", exact: true }).first().click();
  await expect(page.getByTestId("waitlist")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${DIR}/32-attente-sable.png` });
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.getByTestId("triage-list-row").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${DIR}/33-liste-sable.png` });
  await ctx.close();
});

export type { BrowserContext };

test("mode liste : filtre « Jour » d'un événement sur plusieurs jours (lot 34)", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await openApp(browser, "sable", "no-preference", "Salon de printemps");
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  // La liste de l'événement choisi est la dernière montée (celle de l'événement par défaut reste derrière).
  const list = page.getByTestId("triage-list").filter({ visible: true }).last();
  await expect(list).toBeVisible({ timeout: 20_000 });
  // Chaque ligne dit son jour (ou « Tout l'événement »).
  await expect(list.getByTestId("triage-row-day").first()).toBeVisible({ timeout: 20_000 });
  await list.getByTestId("triage-filters").click();
  await page.getByRole("combobox", { name: "Jour" }).click();
  await page.getByRole("menuitem", { name: "Tout l'événement" }).first().click();
  await page.getByTestId("triage-filters-apply").click();
  await expect(list.getByTestId("triage-filters")).toContainText("· 1");
  const days = await list.getByTestId("triage-row-day").allTextContents();
  for (const d of days) expect(d).toBe("Tout l'événement");
  await page.screenshot({ path: `${DIR}/40-liste-filtre-jour-sable.png` });
  await ctx.close();
});
