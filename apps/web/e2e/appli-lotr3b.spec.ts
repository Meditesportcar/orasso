import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, type Cookie, type CreatedEvent, login, MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R3b (retours de Damien du 24/10 sur l'APK 00d34cd4), côté appli (version web compilée) :
//   - (10) l'année s'écrit quand l'événement n'est pas dans l'année en cours : vignette de l'Explorer, fiche, sans
//     décaler la vignette ;
//   - (11) « Où chercher ? » : un seul choix actif, à chaque transition (Autour de moi → Ailleurs en tête) ;
//   - (14) Mes sorties : toucher une sortie passée (pas seulement son titre) ouvre sa fiche, lisible, « terminé » ;
//   - (16) « Crée ou rejoins un crew » du profil : d'abord rejoindre (recherche, crews du coin), « Créer un crew » ensuite ;
//   - reste de R2 : « Demande envoyée » d'un crew gardée après un rechargement (l'état vient de l'API).
// Béton et Sable, 390 px. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r3b-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
/** L'année suivante, lue sur l'horloge de la machine (aucune date figée). */
const NEXT_YEAR = new Date().getFullYear() + 1;

async function open(browser: Browser, theme: Theme, width: number = MOBILE.width) {
  const ctx = await browser.newContext({ viewport: { ...MOBILE, width }, baseURL: APP });
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
 * `words` : aucun mot coupé. Pas sur la liste de l'Explorer : les titres d'essai portent un identifiant de 9 lettres
 * sans espace (« MVM9BCU70 ») que l'affiche Minimal de 84 px coupe forcément.
 */
async function audit(page: Page, words = true) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  if (words) expect(a.brokenWords).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

async function dismissAsk(page: Page) {
  const later = page.getByText("Plus tard", { exact: true });
  if (await later.isVisible().catch(() => false)) await later.click();
}

/** Un événement publié par MéditeSportCar le 14 mars de l'année suivante (à Canet, dans le coin de Kenji). */
async function nextYearEvent(orga: Cookie): Promise<CreatedEvent> {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(orga, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  if (!structureId) throw new Error("Structure MéditeSportCar introuvable : le seed a-t-il tourné ?");
  const title = `Annee R3b ${unique()}`;
  const start = new Date(Date.UTC(NEXT_YEAR, 2, 14, 17, 0));
  const created = await apiCall<{ id: string; slug: string }>(orga, "POST", `/structures/${structureId}/events`, {
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
    admittedVehicleTypes: ["car", "moto"],
    capacity: 40,
    maxVehiclesPerUser: 2,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Pas de burn, pas de bruit inutile, on respecte les riverains.",
    description: "Événement de l'année suivante (recette du lot R3b).",
  });
  if (created.status !== 201) throw new Error(`Création : ${created.status} ${JSON.stringify(created.data)}`);
  const published = await apiCall(orga, "POST", `/events/${created.data.id}/publish`);
  if (published.status !== 200) throw new Error(`Publication : ${published.status}`);
  return { id: created.data.id, slug: created.data.slug, title };
}

const checked = (page: Page, id: string) => expect(page.getByTestId(id)).toHaveAttribute("aria-checked", "true");
const unchecked = (page: Page, id: string) => expect(page.getByTestId(id)).toHaveAttribute("aria-checked", "false");
const WHERE = ["around-me", "around-mine", "around-elsewhere", "around-all"] as const;
async function onlyChecked(page: Page, id: (typeof WHERE)[number]) {
  for (const other of WHERE) await (other === id ? checked(page, other) : unchecked(page, other));
}

test("R3b appli : année des dates, un seul lieu, sorties passées, rejoindre un crew", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const event = await nextYearEvent(await login("damien@orasso.local"));
  // Un compte neuf, sans crew, dans le 66 (les crews du coin du seed).
  const pseudo = `R3b${unique()}`.slice(0, 20);
  const newcomerCookie = await signUpApi(pseudo);
  const newcomerId = (await apiCall<{ user: { id: string } }>(newcomerCookie, "GET", "/me")).data.user.id;
  const newcomer = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const errors: string[] = [];

  for (const [i, theme] of THEMES.entries()) {
    const { ctx, page } = await open(browser, theme);
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await signIn(page, "kenji@orasso.local");

    // --- (10) L'année sur la vignette de l'Explorer et sur la fiche ------------------------------------------------
    await goto(page, "/explorer");
    await dismissAsk(page);
    await page.getByTestId("events-q").fill(event.title);
    const card = page
      .getByTestId("event-when")
      .filter({ hasText: String(NEXT_YEAR) })
      .first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(new RegExp(`14\\sMARS\\s${NEXT_YEAR}`, "i"));
    await audit(page, false);
    await shot(page, `01-explorer-annee-${theme}`);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.slug}`), { timeout: 30_000 });
    await expect(page.getByTestId("event-when").first()).toContainText(String(NEXT_YEAR), { timeout: 30_000 });
    await shot(page, `02-fiche-annee-${theme}`);

    // --- (11) « Où chercher ? » : un seul choix actif, à chaque transition ---------------------------------------
    await goto(page, "/explorer");
    await dismissAsk(page);
    await page.getByTestId("around-open").click();
    await expect(page.getByTestId("around-sheet")).toBeVisible();
    await page.getByTestId("around-me").click();
    await onlyChecked(page, "around-me");
    // Le retour de Damien : Autour de moi, puis Ailleurs → seul Ailleurs reste coché (et le curseur disparaît).
    await page.getByTestId("around-elsewhere").click();
    await onlyChecked(page, "around-elsewhere");
    await expect(page.getByTestId("where-range")).toHaveCount(0);
    await expect(page.getByTestId("where-apply")).toBeDisabled();
    await shot(page, `03-ou-chercher-ailleurs-${theme}`);
    await page.getByTestId("around-mine").click();
    await onlyChecked(page, "around-mine");
    await page.getByTestId("around-elsewhere").click();
    await onlyChecked(page, "around-elsewhere");
    await page.getByTestId("around-all").click();
    await onlyChecked(page, "around-all");
    await page.getByTestId("around-elsewhere").click();
    await page.getByTestId("around-find").fill("11");
    await page.getByRole("radio", { name: /^11 · / }).click();
    await onlyChecked(page, "around-elsewhere");
    await expect(page.getByTestId("where-apply")).toBeEnabled();
    await page.getByTestId("around-me").click();
    await onlyChecked(page, "around-me");
    await page.getByTestId("around-mine").click();
    await onlyChecked(page, "around-mine");
    await page.getByTestId("where-apply").click();
    await expect(page.getByTestId("around-sheet")).toHaveCount(0);

    // --- (14) Mes sorties : toucher une sortie passée ouvre sa fiche, « terminé » -----------------------------------
    await goto(page, "/sorties");
    await page.getByText(/^Passées · \d+$/).click();
    const past = page.getByTestId("ticket-past-open").filter({ hasText: "Béziers Night" });
    await expect(past).toBeVisible({ timeout: 30_000 });
    await shot(page, `04-sorties-passees-${theme}`);
    // Le toucher sur la souche (pas sur le titre) suffit.
    await past.click({ position: { x: 20, y: 30 } });
    await expect(page).toHaveURL(/\/e\/beziers-night/, { timeout: 30_000 });
    await expect(page.getByTestId("event-ended")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Candidater/ })).toHaveCount(0);
    await shot(page, `05-fiche-passee-${theme}`);
    await ctx.close();

    // --- (16) Crée ou rejoins un crew : rejoindre d'abord ; « Demande envoyée » gardée après un rechargement ------
    const n = await open(browser, theme);
    await signIn(n.page, newcomer);
    await goto(n.page, "/profil");
    await n.page.getByTestId("profil-crew").click();
    await expect(n.page).toHaveURL(/\/rejoindre-crew/, { timeout: 30_000 });
    await expect(n.page.getByTestId("suggest-crews")).toBeVisible({ timeout: 30_000 });
    // « Créer un crew » vient après les crews, en secondaire.
    const create = n.page.getByTestId("crew-join-create");
    await expect(create.getByTestId("crew-new")).toBeVisible();
    const crewsBox = await n.page.getByTestId("suggest-crews").boundingBox();
    const createBox = await create.boundingBox();
    expect((createBox?.y ?? 0) > (crewsBox?.y ?? 0)).toBe(true);
    const row = n.page.getByTestId("suggest-crews").getByTestId("crew-row").first();
    if (i === 0) {
      await row.getByTestId("crew-join").click();
      // Lot R5c2 (R5.8) : « Rejoindre » ouvre la feuille avec un mot pour le chef (facultatif) avant d'envoyer.
      await n.page.getByTestId("crew-request-send").click({ timeout: 30_000 });
      await expect(row.getByTestId("crew-requested")).toBeVisible({ timeout: 30_000 });
    }
    await audit(n.page);
    await shot(n.page, `06-rejoindre-crew-${theme}`);
    await n.page.reload();
    await afterOpening(n.page);
    await expect(
      n.page.getByTestId("suggest-crews").getByTestId("crew-row").first().getByTestId("crew-requested"),
    ).toBeVisible({ timeout: 30_000 });
    if (i === 1) {
      // Tour 2 : la demande annulée ailleurs (fiche du crew, autre appareil) : au retour sur l'écran, « Rejoindre ».
      const near = await apiCall<{ items: { id: string; requested: boolean }[] }>(
        newcomerCookie,
        "GET",
        "/crews/search?departments=66&limit=6",
      );
      const asked = near.data.items.find((c) => c.requested);
      expect(asked).toBeTruthy();
      expect((await apiCall(newcomerCookie, "DELETE", `/crews/${asked?.id}/members/${newcomerId}`)).status).toBe(204);
      // Aller sur la fiche du crew puis revenir : l'écran relit la liste en reprenant le focus.
      await n.page.getByTestId("suggest-crews").getByTestId("crew-row").first().getByRole("link").first().click();
      await expect(n.page).toHaveURL(/\/crew\//, { timeout: 30_000 });
      await n.page.goBack();
      await expect(n.page).toHaveURL(/\/rejoindre-crew/, { timeout: 30_000 });
      await expect(
        n.page.getByTestId("suggest-crews").getByTestId("crew-row").first().getByTestId("crew-join"),
      ).toBeVisible({ timeout: 30_000 });
      await expect(n.page.getByTestId("crew-requested")).toHaveCount(0);
    }
    // La recherche par nom passe par les mêmes appels (Explorer, Personnes et crews).
    await n.page.getByTestId("crew-join-q").fill("drift");
    await expect(n.page.getByTestId("crew-results")).toBeVisible({ timeout: 30_000 });
    await shot(n.page, `07-rejoindre-crew-recherche-${theme}`);
    await n.ctx.close();
  }

  // --- Vignette à 320 px : l'année ne coupe ni ne décale la date --------------------------------------------------
  const narrow = await open(browser, "sable", 320);
  await signIn(narrow.page, "kenji@orasso.local");
  await goto(narrow.page, "/explorer");
  await dismissAsk(narrow.page);
  await narrow.page.getByTestId("events-q").fill(event.title);
  await expect(
    narrow.page
      .getByTestId("event-when")
      .filter({ hasText: String(NEXT_YEAR) })
      .first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  // La ligne de date de la vignette tient entière (les segments de l'en-tête, coupés à 320 px, ne sont pas de ce lot).
  const when = narrow.page
    .getByTestId("event-when")
    .filter({ hasText: String(NEXT_YEAR) })
    .first();
  expect(await when.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // Tour 2 : sur une seule ligne (l'heure jamais coupée).
  expect(
    await when.evaluate(
      (el) => el.getBoundingClientRect().height < 1.6 * Number.parseFloat(getComputedStyle(el).lineHeight),
    ),
  ).toBe(true);
  await expect(when).toContainText(/18\sH$/i);
  expect((await auditPage(narrow.page)).horizontalScroll).toBe(false);
  await shot(narrow.page, "08-explorer-annee-320-sable");
  await narrow.ctx.close();

  expect(errors.filter((e) => !/favicon|ResizeObserver|Failed to load resource/i.test(e))).toEqual([]);
});
