import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defaultDuration, durationOptions, type SpotMeetupView, wallTime } from "@orasso/shared";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7i (D38), côté site : « Rendez-vous au spot ». Damien lance (le soir : « Ce soir » par défaut), un abonné le reçoit dans
// l'Accueil et répond « Je viens », un inconnu n'y a pas accès, un crew a ses Spots, et après la fin il n'y a plus de lieu.
// L'heure est simulée (horloge de développement : le soir à 20 h, puis +5 h) ; elle est remise à l'heure réelle à la fin.
// API et site lancés sur la base seedée (DEV_CLOCK=on).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7i-captures/apres/recette-site`;
const apiDir = resolve(import.meta.dirname, "../../api");
const clock = (...args: string[]) =>
  execFileSync(process.execPath, ["--import", "tsx", "scripts/dev-clock.ts", ...args], {
    cwd: apiDir,
    stdio: "pipe",
    timeout: 120_000,
  });
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

let damien = "";
let meetupId = "";
let crewMeetupId = "";
let crewId = "";

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function cancelActive(cookie: string) {
  const mine = await apiCall<{ meetup: SpotMeetupView | null }>(cookie, "GET", "/me/spot-meetups/active");
  if (mine.data.meetup) await apiCall(cookie, "DELETE", `/me/spot-meetups/${mine.data.meetup.id}`);
}

async function clickMap(page: Page) {
  const map = page.getByTestId("event-map");
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("wizard-pin")).toBeVisible({ timeout: 30_000 });
  const box = await map.boundingBox();
  if (!box) throw new Error("carte sans cadre");
  // À côté de l épingle (posée au centre) : un toucher sur la carte place le point ; on recommence tant qu il n est pas pris.
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60);
    if (
      !(
        await page
          .getByTestId("spot-missing")
          .textContent()
          .catch(() => "")
      )?.includes("Choisis un lieu")
    )
      return;
    await page.waitForTimeout(800);
  }
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  // Le soir (20 h) : l'horloge ne fait qu'avancer ; trop tard dans la journée (≥ 20 h), on garde l'heure réelle.
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  if (wallTime(new Date()).hour < 20) clock("to", `${today}T20:00`);
  damien = await login("damien@orasso.local");
  for (const email of ["lea@orasso.local", "nina@orasso.local"]) {
    const cookie = await login(email);
    await apiCall(cookie, "POST", "/users/Damien_66/follow");
    await cancelActive(cookie);
  }
  await cancelActive(damien);
  await cancelActive(await login("kenji@orasso.local"));
});

test.afterAll(() => {
  try {
    clock("reset");
  } catch {
    // Remise à l'heure réelle best effort : un second essai suffit à la main (`pnpm dev:clock reset`).
  }
});

test("lancer : le soir, « Ce soir » est choisi ; lieu, mot, abonnés ; la page du rendez-vous", async ({ page }) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/spot/nouveau");
  await expect(page.getByTestId("spot-form")).toBeVisible({ timeout: 30_000 });
  // Durée proposée d'emblée : celle de la règle commune, à l'heure d'Orasso (horloge simulée).
  const sim = await apiCall<{ now: string }>(damien, "GET", "/dev/clock");
  const simNow = new Date(sim.data.now);
  const expected = defaultDuration(durationOptions(simNow), simNow);
  expect(expected).not.toBeNull();
  await expect(page.getByTestId("spot-durations").getByRole("button", { name: expected?.label ?? "" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (wallTime(simNow).hour >= 17 && wallTime(simNow).hour < 23) expect(expected?.id).toBe("evening");
  // « Cet après-midi » n'est plus proposé le soir ; « Jusqu'à demain 6 h » l'est.
  await expect(page.getByTestId("spot-durations").getByRole("button", { name: "Cet après-midi" })).toHaveCount(0);
  await expect(page.getByTestId("spot-durations").getByRole("button", { name: "Jusqu'à demain 6 h" })).toHaveCount(1);
  // Pas de lieu : le bouton principal est grisé, et une ligne dit pourquoi.
  await expect(page.getByTestId("spot-launch")).toBeDisabled();
  await expect(page.getByTestId("spot-missing")).toContainText("Choisis un lieu");
  await clickMap(page);
  await page.getByTestId("spot-place-name").fill("Port de Saint-Cyprien");
  await page.getByTestId("spot-note").fill("Petit tour après le boulot, qui vient ?");
  await expect(page.getByTestId("spot-audience-followers")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("spot-privacy")).toContainText("Le lieu exact n'est montré qu'à eux");
  await expect(page.getByTestId("spot-launch")).toBeEnabled();
  await shot(page, "01-lancer");
  await page.getByTestId("spot-launch").click();
  await page.waitForURL(/\/app\/spot\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  meetupId = /\/app\/spot\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? "";
  await expect(page.getByTestId("spot-detail")).toBeVisible();
  await expect(page.getByTestId("spot-place")).toHaveText("Port de Saint-Cyprien");
  await expect(page.getByTestId("spot-cancel")).toBeVisible();
  await shot(page, "02-mon-rendez-vous");
  // Un seul par personne : un second lancement est refusé et l'écran mène au rendez-vous actif.
  await page.goto("/app/spot/nouveau");
  await expect(page.getByTestId("spot-active-notice")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("spot-see-active")).toHaveAttribute("href", `/app/spot/${meetupId}`);
  await expect(page.getByTestId("spot-launch")).toBeDisabled();
  await shot(page, "03-deja-un-actif");
});

test("reçu par un abonné : bloc « Au spot » de l'Accueil, « Je viens », la page avec le lieu et qui vient", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "lea@orasso.local", undefined, "/app");
  const block = page.getByTestId("widget-spot_meetup");
  await expect(block).toBeVisible({ timeout: 30_000 });
  await expect(block).toContainText("Damien_66");
  await expect(block).toContainText("Port de Saint-Cyprien");
  await expect(block).toContainText("Qui vient ?");
  await shot(page, "04-accueil-recu");
  await page.getByTestId("home-spot-card-yes").click();
  await expect(page.getByTestId("home-spot-card-yes")).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/app/spot/${meetupId}`);
  await expect(page.getByTestId("spot-place")).toHaveText("Port de Saint-Cyprien");
  await expect(page.getByTestId("spot-who")).toContainText("1 vient");
  await expect(page.getByTestId("spot-who")).toContainText("Lea_11");
  await expect(page.getByTestId("spot-note-text")).toContainText("Petit tour après le boulot");
  await expect(page.getByTestId("spot-cancel")).toHaveCount(0);
  await shot(page, "05-recu-je-viens");
  // « Peut-être » remplace « Je viens » ; retoucher le même choix le retire.
  await page.getByTestId("spot-maybe").click();
  await expect(page.getByTestId("spot-maybe")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("spot-who")).toContainText("1 peut-être");
  await page.getByTestId("spot-yes").click();
  await expect(page.getByTestId("spot-yes")).toHaveAttribute("aria-pressed", "true");
});

test("l'auteur voit qui vient ; il n'a pas de « Je viens » sur son propre rendez-vous", async ({ page }) => {
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, `/app/spot/${meetupId}`);
  await expect(page.getByTestId("spot-who")).toContainText("Lea_11");
  await expect(page.getByTestId("spot-yes")).toHaveCount(0);
  await expect(page.getByTestId("spot-cancel")).toBeVisible();
  // Son Accueil le montre aussi (le mien, faute d'un rendez-vous reçu).
  await page.goto("/app");
  await expect(page.getByTestId("widget-spot_meetup")).toContainText("Port de Saint-Cyprien", { timeout: 30_000 });
  await expect(page.getByTestId("home-spot-card-yes")).toHaveCount(0);
});

test("un inconnu : pas de bloc, pas de lieu, la page dit qu'elle n'existe pas pour lui", async ({ page }) => {
  await setTheme(page, "beton");
  await loginInBrowser(page, "paul.photo@orasso.local", undefined, `/app/spot/${meetupId}`);
  await expect(page.getByTestId("spot-gone")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("Saint-Cyprien");
  await expect(page.locator("body")).not.toContainText("Damien_66");
  await page.goto("/app");
  await expect(page.getByTestId("widget-spot_meetup")).toHaveCount(0);
  const paul = await login("paul.photo@orasso.local");
  expect((await apiCall(paul, "GET", `/spot-meetups/${meetupId}`)).status).toBe(404);
  expect((await apiCall<{ items: unknown[] }>(paul, "GET", "/me/spot-meetups/incoming")).data.items).toHaveLength(0);
  await shot(page, "06-inconnu");
});

test("crew : « Lancer un rendez-vous pour le crew » (audience préremplie), l'onglet Spots des membres, pas des autres", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/crew?crew=roussillon-drift&onglet=spots");
  await expect(page.getByTestId("crew-spots")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("crew-spots-launch")).toBeVisible({ timeout: 30_000 });
  await shot(page, "07-spots-vide");
  await page.getByTestId("crew-spots-launch").click();
  await page.waitForURL(/\/app\/spot\/nouveau\?crew=/);
  await expect(page.getByTestId("spot-form")).toBeVisible({ timeout: 30_000 });
  const crew = page.locator('[data-testid^="spot-audience-crew-"]').first();
  await expect(crew).toHaveAttribute("aria-pressed", "true");
  await expect(crew).toContainText("Roussillon Drift");
  await clickMap(page);
  await page.getByTestId("spot-place-name").fill("Parking de la plage");
  await page.getByTestId("spot-launch").click();
  await page.waitForURL(/\/app\/spot\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  crewMeetupId = /\/app\/spot\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? "";
  const mine = await apiCall<{ crews: { id: string; slug: string }[] }>(
    await login("kenji@orasso.local"),
    "GET",
    "/me/spot-meetups/audiences",
  );
  crewId = mine.data.crews.find((c) => c.slug === "roussillon-drift")?.id ?? "";
  expect(crewId).not.toBe("");

  // Un membre (Théo) le voit dans l'onglet Spots ; un non-membre (Paul) n'a rien.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const theo = await ctx.newPage();
  await setTheme(theo, "beton");
  await loginInBrowser(theo, "theo@orasso.local", undefined, "/app/crew?crew=roussillon-drift&onglet=spots");
  const card = theo.getByTestId("crew-spot-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("Parking de la plage");
  await shot(theo, "08-spots-membre");
  await ctx.close();
  const paul = await login("paul.photo@orasso.local");
  expect((await apiCall(paul, "GET", `/crews/${crewId}/spot-meetups`)).status).toBe(404);
  expect((await apiCall(paul, "GET", `/spot-meetups/${crewMeetupId}`)).status).toBe(404);
});

test("après la fin : plus de lieu, « Ce rendez-vous est terminé » ; l'onglet Spots du crew le garde sans lieu", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  // 5 h plus tard (l'horloge simulée rattrape aussi la tâche d'effacement).
  clock("+5h");
  await setTheme(page, "beton");
  await loginInBrowser(page, "lea@orasso.local", undefined, `/app/spot/${meetupId}`);
  await expect(page.getByTestId("spot-ended")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("spot-ended-title")).toHaveText("Ce rendez-vous est terminé");
  await expect(page.locator("body")).not.toContainText("Saint-Cyprien");
  await shot(page, "09-apres-invite");
  await page.goto("/app");
  await expect(page.getByTestId("widget-spot_meetup")).toHaveCount(0);
  // L'auteur : « a disparu, comme prévu », sans lieu ni liste.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const author = await ctx.newPage();
  await setTheme(author, "beton");
  await loginInBrowser(author, "damien@orasso.local", undefined, `/app/spot/${meetupId}`);
  await expect(author.getByTestId("spot-ended-title")).toContainText("a disparu, comme prévu");
  await expect(author.locator("body")).not.toContainText("Saint-Cyprien");
  await shot(author, "10-apres-auteur");
  await ctx.close();
  // L'onglet Spots du crew : terminé, sans lieu ; l'API n'a plus ni lieu ni liste.
  const theo = await login("theo@orasso.local");
  const list = await apiCall<{ active: unknown[]; past: { place: unknown; phase: string }[] }>(
    theo,
    "GET",
    `/crews/${crewId}/spot-meetups`,
  );
  expect(list.data.active).toHaveLength(0);
  expect(list.data.past[0]).toMatchObject({ place: null, phase: "ended" });
  expect(JSON.stringify(list.data)).not.toContain("Parking de la plage");
  const replies = await apiCall<{ items: unknown[] }>(damien, "GET", `/spot-meetups/${meetupId}/replies`);
  expect(replies.data.items).toHaveLength(0);
});

// ---- Tour 2 (relectures Opus et Codex) ----------------------------------------------------------------------------------

/** Lance un rendez-vous par l'API, à l'heure simulée, pour `ms` millisecondes. */
async function launchBy(cookie: string, label: string, ms: number): Promise<string> {
  const sim = await apiCall<{ now: string }>(cookie, "GET", "/dev/clock");
  const start = new Date(sim.data.now);
  const res = await apiCall<SpotMeetupView>(cookie, "POST", "/me/spot-meetups", {
    placeLabel: label,
    lat: 42.62,
    lng: 3.03,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + ms).toISOString(),
    note: null,
    audience: "followers",
    crewId: null,
  });
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.id;
}

test("tour 2 : « Autour de moi » efface le point choisi et masque l'épingle ; « Lancer » attend une nouvelle sélection", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await cancelActive(damien);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 42.7, longitude: 2.9 });
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/spot/nouveau");
  await expect(page.getByTestId("spot-form")).toBeVisible({ timeout: 30_000 });
  await clickMap(page);
  await expect(page.getByTestId("spot-missing")).not.toContainText("Choisis un lieu");
  await expect(page.getByTestId("wizard-pin")).toBeVisible();
  await page.getByTestId("spot-around-me").click();
  // Le point visé n'est plus celui qui est montré : il est effacé, l'épingle disparaît, « Lancer » attend.
  await expect(page.getByTestId("spot-missing")).toContainText("Choisis un lieu", { timeout: 20_000 });
  await expect(page.getByTestId("wizard-pin")).toBeHidden();
  await expect(page.getByTestId("spot-launch")).toBeDisabled();
  // Une nouvelle sélection (toucher sur la carte) ramène l'épingle, et c'est elle qui est envoyée.
  const map = page.getByTestId("event-map");
  const box = await map.boundingBox();
  if (!box) throw new Error("carte sans cadre");
  await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40);
  await expect(page.getByTestId("wizard-pin")).toBeVisible();
  await expect(page.getByTestId("spot-missing")).not.toContainText("Choisis un lieu");
});

test("tour 2 : annulé pendant que la page est ouverte, la page se vide sans rechargement (aucun lieu)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Quai Vauban", 2 * 3_600_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "lea@orasso.local", undefined, `/app/spot/${id}`);
  await expect(page.getByTestId("spot-place")).toHaveText("Quai Vauban", { timeout: 30_000 });
  await apiCall(damien, "DELETE", `/me/spot-meetups/${id}`);
  // La page relit toutes les 30 s : refus définitif → « indisponible », jamais l'ancienne donnée devant l'erreur.
  await expect(page.getByTestId("spot-gone")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("body")).not.toContainText("Quai Vauban");
});

test("tour 2 : la liste « Qui vient ? » se relit quand le total ne change pas (Léa part, Nina arrive)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Plage du Barcarès", 3 * 3_600_000);
  const lea = await login("lea@orasso.local");
  const nina = await login("nina@orasso.local");
  await apiCall(lea, "PUT", `/spot-meetups/${id}/reply`, { answer: "yes" });
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, `/app/spot/${id}`);
  await expect(page.getByTestId("spot-who")).toContainText("Lea_11", { timeout: 30_000 });
  await apiCall(lea, "DELETE", `/spot-meetups/${id}/reply`);
  await apiCall(nina, "PUT", `/spot-meetups/${id}/reply`, { answer: "yes" });
  await expect(page.getByTestId("spot-who")).toContainText("Nina", { timeout: 60_000 });
  await expect(page.getByTestId("spot-who")).not.toContainText("Lea_11");
  await expect(page.getByTestId("spot-who")).toContainText("1 vient");
  await apiCall(damien, "DELETE", `/me/spot-meetups/${id}`);
});

test("tour 2 : la page ouverte passe « terminée » à l'heure de fin, même sans réseau", async ({ page }) => {
  test.setTimeout(240_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Parking des Capellans", 55_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "lea@orasso.local", undefined, `/app/spot/${id}`);
  await expect(page.getByTestId("spot-place")).toHaveText("Parking des Capellans", { timeout: 30_000 });
  await page.context().setOffline(true);
  // La fin passe pendant que le réseau est coupé : lieu, liste et réponses disparaissent d'eux-mêmes.
  await expect(page.getByTestId("spot-ended")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("body")).not.toContainText("Capellans");
  await page.context().setOffline(false);
});

test("tour 2 : le Fil du site porte la carte d'un rendez-vous pour mes abonnés, jamais celle d'un crew", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Cap Béar", 3 * 3_600_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "lea@orasso.local", undefined, "/app/fil");
  const card = page.getByTestId("feed-card-spot_meetup");
  await expect(card.first()).toBeVisible({ timeout: 30_000 });
  await expect(card.first()).toContainText("Cap Béar");
  // Dans une liste, les réponses sont des boutons secondaires (pas de bouton principal).
  await expect(card.first().getByTestId("feed-spot-yes")).toBeVisible();
  await shot(page, "10-fil-carte");
  await apiCall(damien, "DELETE", `/me/spot-meetups/${id}`);
});
