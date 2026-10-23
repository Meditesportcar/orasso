import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { addVehicleApi, apiCall, decideApi, login, MOBILE, randomPlate, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot M4, côté appli (version web de recette) : la feuille de candidature (« Avec quel véhicule ? », « Suivre » cochée
// d'office, newsletter non cochée, « J'ai vu le créneau d'arrivée »), Mon QR épuré (« Présente le QR code », « ? » à
// côté de « Hors ligne », plus de pavé des captures, Maps et Waze seulement à l'approche), le créneau strict des
// exposants absent de la fiche publique, l'étiquette « À propos de » d'un message écrit depuis la fiche. Deux thèmes,
// captures à 390 px. `M4_PHASE=avant` : captures seules, avant les changements (paires avant | après).
// Tour 2 : pas de logo O dans le QR, consigne du créneau dans « Ta place » et sur l'écran du QR (hors ligne),
// « Autour de… » de l'Explorer (Mon coin, Ailleurs…, distance, « Revenir à mon coin »), ✉ sans compte → connexion.
// Lancer avec APP_URL=http://localhost:8801 (relais isolé devant Metro), API et site seedés.
const APP = process.env.APP_URL;
const PHASE = process.env.M4_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m4-captures/${PHASE}`;
const AFTER = PHASE !== "avant";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
type Cookie = string;
const THEMES: Theme[] = ["beton", "sable"];
const EXHIBITORS = { from: "17:00", to: "17:45", strict: true, note: "Entrée côté capitainerie." };

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
  await page
    .getByLabel("Mot de passe", { exact: true })
    .first()
    .fill(process.env.SEED_PASSWORD ?? "orasso-demo-2026");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

/** Un événement de MéditeSportCar dans `days` jours à 18 h (Paris), avec le créneau strict des exposants. */
async function eventIn(damien: Cookie, days: number, title: string) {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date();
  start.setDate(start.getDate() + days);
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
    description: "Événement de recette du lot M4.",
    arrivals: { exhibitors: EXHIBITORS, public: { from: "18:30", to: null, strict: false, note: null } },
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return { ...created.data, title };
}

test("Lot M4 : candidature, Mon QR, créneau privé, « À propos de »", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const id = unique();
  const soon = await eventIn(damien, 1, `M4 Veille ${id}`.slice(0, 34));
  const far = await eventIn(damien, 6, `M4 Semaine ${id}`.slice(0, 34));
  const open6 = await eventIn(damien, 9, `M4 Ouverte ${id}`.slice(0, 34));
  // Un exposant du 66 avec un véhicule photographié : retenu à la veille et à J-6.
  const pseudo = `ExpoM4_${id}`.slice(0, 24);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"] });
  const vehicleId = await addVehicleApi(cookie, randomPlate());
  const apply = async (eventId: string) => {
    const res = await apiCall<{ id: string }[]>(cookie, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [vehicleId],
      rulesAccepted: true,
      // Ne suit pas encore MéditeSportCar : la feuille propose « Suivre », cochée d'office.
      followStructure: false,
      arrivalSeen: true,
    });
    expect(res.status).toBe(201);
    return res.data[0]?.id ?? "";
  };
  const appSoon = await apply(soon.id);
  const app6 = await apply(far.id);
  await decideApi(damien, soon.id, appSoon, "accept");
  await decideApi(damien, far.id, app6, "accept");

  // Le créneau strict des exposants n'est pas dans la fiche anonyme (API).
  const anon = await apiCall<{ arrivals: { exhibitors: unknown } }>(null, "GET", `/events/by-slug/${open6.slug}`);
  if (AFTER) expect(anon.data.arrivals.exhibitors).toBeNull();

  // Une conversation avec MéditeSportCar « À propos de » l'événement de la veille.
  const structureId = (
    await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me")
  ).data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const conv = await apiCall<{ id: string }>(cookie, "POST", `/structures/${structureId}/conversation`);
  await apiCall(cookie, "POST", `/conversations/${conv.data.id}/messages`, {
    clientId: crypto.randomUUID(),
    body: "Bonjour, je peux venir avec une remorque ?",
    ...(AFTER ? { aboutEventId: soon.id } : {}),
  });

  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);

    // 1. Fiche d'un événement ouvert : bande de l'organisateur fixe, pavé J-x, fiche compacte ; pas de créneau des
    // exposants affiché ; la feuille de candidature.
    await goto(page, `/e/${open6.slug}`);
    await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
    await shot(page, `fiche-haut-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("org-bar")).toContainText("MéditeSportCar");
      await expect(page.getByTestId("org-bar")).toContainText("abonné");
      await expect(page.getByTestId("event-countdown")).toContainText("J-9");
      await expect(page.getByTestId("event-when")).toContainText("18 h");
      await expect(page.getByTestId("event-when")).not.toContainText("17 h");
      await expect(page.getByTestId("event-seats")).toContainText("places exposants restantes");
      await expect(page.getByTestId("event-public")).toContainText("Public");
      await expect(page.getByTestId("arrival-exhibitors")).toHaveCount(0);
      await expect(page.getByText(/conseillé/i)).toHaveCount(0);
      await expect(page.getByTestId("event-primary")).toHaveText(/Candidater$/);
      await page.getByTestId("admission-help-admission").click();
      await expect(page.getByTestId("admission-help-text")).toContainText("L'équipe organisatrice choisit");
      // La bande reste en haut quand on fait défiler la fiche.
      await page.getByTestId("event-page").evaluate((el) => el.scrollTo(0, 900));
      await page.waitForTimeout(400);
      const bar = await page.getByTestId("org-bar").boundingBox();
      expect(bar?.y ?? 99).toBeLessThan(5);
      await shot(page, `fiche-defile-${theme}`);
      await page.getByTestId("event-page").evaluate((el) => el.scrollTo(0, 0));
      await audit(page);
      // ✉ : « Écrire à MéditeSportCar » avec l'étiquette « À propos de ».
      await page.getByTestId("org-write").click();
      await expect(page.getByTestId("write-sheet")).toBeVisible();
      await expect(page.getByTestId("write-sheet").getByTestId("message-about")).toContainText(open6.title);
      await shot(page, `ecrire-${theme}`);
      await page.getByTestId("write-body").fill(`Remorque possible ? (${theme})`);
      await page.getByTestId("write-send").click();
      await expect(page.getByTestId("write-sent")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("write-open").click();
      await expect(page.getByText(`Remorque possible ? (${theme})`)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("message-about").filter({ hasText: open6.title }).first()).toBeVisible();
      await goto(page, `/e/${open6.slug}`);
      await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
    }
    await page.getByTestId("event-primary").click();
    await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
    await shot(page, `candidature-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("cand-vehicle").first()).toBeVisible();
      await expect(page.getByTestId("cand-follow")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("cand-follow")).toContainText("Suivre MéditeSportCar");
      await expect(page.getByTestId("cand-newsletter")).toHaveAttribute("aria-checked", "false");
      await expect(page.getByTestId("arrival-seen")).toContainText("J'ai vu le créneau d'arrivée");
      await expect(page.getByTestId("arrival-seen")).toContainText("17 h à 17 h 45, strict");
      await expect(page.getByTestId("cand-send")).toBeDisabled();
      await page.getByTestId("arrival-seen").click();
      await page.getByTestId("cand-rules").click();
      await expect(page.getByTestId("cand-send")).toBeEnabled();
      await audit(page);
      await page.getByTestId("cand-sheet").evaluate((el) => {
        el.closest("[data-sheet-scroll]")?.scrollTo(0, 9999);
      });
      await shot(page, `candidature-bas-${theme}`);
    }
    await page.getByTestId("cand-close").click();

    // 2. Mon QR à la veille : Maps et Waze proposés ; un seul texte sous le QR.
    await goto(page, `/jour-j/${appSoon}`);
    await expect(page.getByTestId("qr-poster")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, `mon-qr-veille-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("qr-say")).toHaveText("Présente le QR code");
      await expect(page.getByTestId("qr-capture-note")).toHaveCount(0);
      await expect(page.getByText("Comment ça marche sans réseau")).toHaveCount(0);
      await expect(page.getByText(/luminosité/i)).toHaveCount(0);
      await expect(page.getByTestId("gps-maps")).toBeVisible();
      await expect(page.getByTestId("gps-waze")).toBeVisible();
      await expect(page.getByTestId("gps-map")).toBeVisible();
      await expect(page.getByTestId("jourj-place")).toHaveCount(0);
      // Tour 2 : pas de logo O pour l'instant ; le créneau privé et sa consigne restent ici, hors ligne.
      await expect(page.getByTestId("qr-logo")).toHaveCount(0);
      await expect(page.getByText(/Entrée côté capitainerie/).first()).toBeVisible();
      await page.getByTestId("qr-offline-help").click();
      await expect(page.getByTestId("qr-offline-pop")).toContainText("Comment ça marche sans réseau");
      await shot(page, `mon-qr-aide-${theme}`);
      await page.getByTestId("qr-offline-pop").getByRole("button", { name: "Compris" }).click();
      await expect(page.getByTestId("qr-offline-pop")).toHaveCount(0);
      await audit(page);
    }

    // 3. Mon QR à J-6 : ni Maps ni Waze, « Sur la carte » seulement.
    await goto(page, `/jour-j/${app6}`);
    await expect(page.getByTestId("qr-poster")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, `mon-qr-j6-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("gps-maps")).toHaveCount(0);
      await expect(page.getByTestId("gps-waze")).toHaveCount(0);
      await expect(page.getByTestId("gps-map")).toBeVisible();
    }

    // 3 bis. La fiche « inscrit » : « Ta place » en tête (statut, J-x, véhicule, zone, créneau privé, Se retirer),
    // « Mon QR » en bouton principal ; ouverte en touchant le ticket de Sorties.
    if (AFTER) {
      await goto(page, "/sorties");
      const ticket = page.getByTestId("ticket-application-open").filter({ hasText: far.title });
      await expect(ticket).toBeVisible({ timeout: 30_000 });
      await ticket.click({ position: { x: 30, y: 30 } });
      await expect(page.getByTestId("my-place")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("my-place")).toContainText("Retenue");
      await expect(page.getByTestId("my-place-countdown")).toHaveText("J-6");
      await expect(page.getByTestId("my-place")).toContainText("BMW");
      await expect(page.getByTestId("my-place-arrival")).toContainText("17:00 – 17:45");
      await expect(page.getByTestId("my-place-arrival")).toContainText("Arrivée exposants, strict");
      // Tour 2 : la consigne du créneau revient dans « Ta place ».
      await expect(page.getByTestId("my-place-arrival-note")).toHaveText("Entrée côté capitainerie.");
      await expect(page.getByTestId("my-place-withdraw")).toBeVisible();
      await expect(page.getByTestId("event-primary")).toHaveText(/Mon QR/);
      await audit(page);
      await shot(page, `fiche-inscrit-${theme}`);
      await page.getByTestId("my-place").scrollIntoViewIfNeeded();
      await shot(page, `fiche-inscrit-place-${theme}`);
      await page.getByTestId("event-admission").scrollIntoViewIfNeeded();
      await shot(page, `fiche-inscrit-lignes-${theme}`);
    }

    // 4. La conversation : l'étiquette « À propos de » l'événement, des deux côtés.
    await goto(page, `/boite/${conv.data.id}`);
    await expect(page.getByText("Bonjour, je peux venir avec une remorque ?")).toBeVisible({ timeout: 30_000 });
    await shot(page, `conversation-${theme}`);
    if (AFTER) {
      const aboutSoon = page.getByTestId("message-about").filter({ hasText: soon.title }).first();
      await expect(aboutSoon).toBeVisible();
      await expect(aboutSoon).toContainText("À propos de");
    }

    // 5. Explorer : cartes en portrait, « Trier : Distance ▾ » dans une feuille, bascule « Liste | Carte » flottante.
    await goto(page, "/explorer");
    await expect(page.getByTestId("event-row").first()).toBeVisible({ timeout: 30_000 });
    const later = page.getByText("Plus tard", { exact: true });
    if (await later.isVisible().catch(() => false)) await later.click();
    await shot(page, `explorer-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("sort-open")).toContainText("Distance");
      await expect(page.getByTestId("sort-line")).toContainText("événement");
      await expect(page.getByTestId("list-map-toggle")).toBeVisible();
      await audit(page);
      await page.getByTestId("sort-open").click();
      await expect(page.getByTestId("sort-sheet")).toBeVisible();
      await shot(page, `explorer-trier-${theme}`);
      await page.getByTestId("sort-recent").click();
      await expect(page.getByTestId("sort-sheet")).toHaveCount(0);
      await expect(page.getByTestId("sort-open")).toContainText("Nouveautés");
      // Le dernier publié de la recette arrive en tête.
      await expect(page.getByTestId("event-row").first()).toContainText(open6.title, { timeout: 30_000 });
      // Tour 2 : « Autour de… » (temporaire) : Ailleurs… le 75, une distance, puis « Revenir à mon coin ».
      await expect(page.getByTestId("around-open")).toContainText("Mon coin");
      await expect(page.getByTestId("around-back")).toHaveCount(0);
      await page.getByTestId("around-open").click();
      await expect(page.getByTestId("around-sheet")).toBeVisible();
      await page.getByTestId("around-elsewhere").click();
      await page.getByTestId("around-find").fill("75");
      await shot(page, `explorer-autour-${theme}`);
      await page.getByRole("radio", { name: /^75 · / }).click();
      await expect(page.getByTestId("around-sheet")).toHaveCount(0);
      await expect(page.getByTestId("around-open")).toContainText("Le 75");
      await expect(page.getByTestId("sort-line")).toContainText("distances depuis le centre du 75", {
        timeout: 30_000,
      });
      await page.getByTestId("around-open").click();
      await page.getByRole("radio", { name: "50 km" }).click();
      await page.getByTestId("sheet-close").last().click();
      await expect(page.getByTestId("sort-line")).toContainText("à 50 km au plus", { timeout: 30_000 });
      await shot(page, `explorer-ailleurs-${theme}`);
      await page.getByTestId("around-back").click();
      await expect(page.getByTestId("around-open")).toContainText("Mon coin");
      await expect(page.getByTestId("around-back")).toHaveCount(0);
      await expect(page.getByTestId("sort-line")).not.toContainText("75");
      // Gardé pour la prochaine visite.
      await goto(page, "/explorer");
      await expect(page.getByTestId("sort-open")).toContainText("Nouveautés", { timeout: 30_000 });
      await page.getByTestId("sort-open").click();
      await page.getByTestId("sort-distance").click();
      await page.getByTestId("map-toggle").click();
      await expect(page).toHaveURL(/\/carte/, { timeout: 30_000 });
      const onMap = page.getByTestId("map-screen");
      await expect(onMap.getByTestId("list-map-toggle")).toBeVisible();
      await page.waitForTimeout(2500);
      await shot(page, `carte-${theme}`);
      await onMap.getByTestId("list-toggle").click();
      await expect(page).toHaveURL(/explorer/, { timeout: 30_000 });
    }
    await ctx.close();
  }

  // Tour 2 : sans compte, ✉ de la bande de l'organisateur mène à la connexion, comme « Suivre ».
  if (AFTER) {
    const { ctx, page } = await open(browser, "beton");
    await goto(page, `/e/${open6.slug}`);
    await expect(page.getByTestId("org-write")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("org-write").click();
    // Comme « Suivre » : l'inscription (l'arrivée), puis retour à la fiche.
    await expect(page).toHaveURL(/\/(auth|arrivee)\b.*next=%2Fe%2F/, { timeout: 30_000 });
    await ctx.close();
  }
});
