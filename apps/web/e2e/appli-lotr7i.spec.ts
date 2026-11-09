import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defaultDuration, durationOptions, type SpotMeetupView, wallTime } from "@orasso/shared";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7i (D38), côté appli (version web compilée de recette) : « Rendez-vous au spot ». Damien lance (le soir : « Ce soir » par
// défaut, lieu placé sur la carte, mot, abonnés), un abonné le reçoit dans l'Accueil (bloc « Au spot ») et répond, un inconnu
// n'y a pas accès, l'onglet Spots du crew lance avec l'audience préremplie, et après la fin il n'y a plus de lieu. L'heure est
// simulée (20 h, puis +5 h) et remise à l'heure réelle à la fin. Lancer avec APP_URL (appli compilée), API seedée (DEV_CLOCK=on).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7i-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });
const apiDir = resolve(import.meta.dirname, "../../api");
const clock = (...args: string[]) =>
  execFileSync(process.execPath, ["--import", "tsx", "scripts/dev-clock.ts", ...args], {
    cwd: apiDir,
    stdio: "pipe",
    timeout: 120_000,
  });

let damien = "";
let meetupId = "";
let crewId = "";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
  return { ctx, page };
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function cancelActive(cookie: string) {
  const mine = await apiCall<{ meetup: SpotMeetupView | null }>(cookie, "GET", "/me/spot-meetups/active");
  if (mine.data.meetup) await apiCall(cookie, "DELETE", `/me/spot-meetups/${mine.data.meetup.id}`);
}

async function placeOnMap(page: Page) {
  const map = page.getByTestId("wizard-map-canvas");
  await expect(map).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  const box = await map.boundingBox();
  if (!box) throw new Error("carte sans cadre");
  // À côté de l épingle (posée au centre) ; on recommence tant que le point n est pas pris.
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50);
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
    // Remise à l'heure réelle best effort.
  }
});

test("lancer : « Ce soir » d'emblée, lieu sur la carte, mot, abonnés ; l'écran du rendez-vous ; un seul actif", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await go(page, "/spot/nouveau");
  await expect(page.getByTestId("spot-launch")).toBeVisible({ timeout: 30_000 });
  const sim = await apiCall<{ now: string }>(damien, "GET", "/dev/clock");
  const simNow = new Date(sim.data.now);
  const expected = defaultDuration(durationOptions(simNow), simNow);
  await expect(page.getByTestId("spot-durations").getByRole("radio", { name: expected?.label ?? "" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  if (wallTime(simNow).hour >= 17 && wallTime(simNow).hour < 23) expect(expected?.id).toBe("evening");
  await expect(page.getByTestId("spot-durations").getByRole("radio", { name: "Cet après-midi" })).toHaveCount(0);
  // Sans lieu : bouton principal grisé, et la ligne qui dit pourquoi.
  await expect(page.getByTestId("spot-launch")).toBeDisabled();
  await expect(page.getByTestId("spot-missing")).toContainText("Choisis un lieu");
  await placeOnMap(page);
  await page.getByTestId("spot-place-name").fill("Port de Saint-Cyprien");
  await page.getByTestId("spot-note").fill("Petit tour après le boulot, qui vient ?");
  await expect(page.getByTestId("spot-privacy")).toContainText("Le lieu exact n'est montré qu'à eux");
  await shot(page, "01-lancer");
  await expect(page.getByTestId("spot-launch")).toBeEnabled();
  await page.getByTestId("spot-launch").click();
  await page.waitForURL(/\/spot\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  meetupId = /\/spot\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? "";
  await expect(page.getByTestId("spot-detail")).toBeVisible();
  await expect(page.getByTestId("spot-place")).toHaveText("Port de Saint-Cyprien");
  await expect(page.getByTestId("spot-cancel")).toBeVisible();
  await shot(page, "02-mon-rendez-vous");
  await go(page, "/spot/nouveau");
  await expect(page.getByTestId("spot-active-notice")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("spot-launch")).toBeDisabled();
  await page.getByTestId("spot-see-active").click();
  await page.waitForURL(new RegExp(`/spot/${meetupId}$`));
  await ctx.close();
});

test("reçu par un abonné : bloc « Au spot », « Je viens », la page avec le lieu ; non visible d'un inconnu", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const lea = await open(browser, "lea@orasso.local");
  await go(lea.page, "/accueil");
  const block = lea.page.getByTestId("home-spot-meetup");
  await expect(block).toBeVisible({ timeout: 30_000 });
  await expect(block).toContainText("Damien_66");
  await expect(block).toContainText("Port de Saint-Cyprien");
  await expect(block).toContainText("Qui vient ?");
  await block.scrollIntoViewIfNeeded();
  await shot(lea.page, "03-accueil-recu");
  await lea.page.getByTestId("home-spot-card-yes").click();
  await expect(lea.page.getByTestId("home-spot-card-yes")).toHaveAttribute("aria-label", /choisi/);
  await go(lea.page, `/spot/${meetupId}`);
  await expect(lea.page.getByTestId("spot-place")).toHaveText("Port de Saint-Cyprien");
  await expect(lea.page.getByTestId("spot-who")).toContainText("Lea_11");
  await expect(lea.page.getByTestId("spot-who")).toContainText("1 vient");
  await expect(lea.page.getByTestId("spot-cancel")).toHaveCount(0);
  await shot(lea.page, "04-recu-je-viens");
  await lea.page.getByTestId("spot-maybe").click();
  await expect(lea.page.getByTestId("spot-who")).toContainText("1 peut-être");
  await lea.ctx.close();

  // Un inconnu : pas de bloc, pas de lieu.
  const paul = await open(browser, "paul.photo@orasso.local");
  await go(paul.page, "/accueil");
  await expect(paul.page.getByTestId("home-spot-meetup")).toHaveCount(0);
  await go(paul.page, `/spot/${meetupId}`);
  await expect(paul.page.getByTestId("spot-gone")).toBeVisible({ timeout: 30_000 });
  await expect(paul.page.locator("body")).not.toContainText("Saint-Cyprien");
  await shot(paul.page, "05-inconnu");
  await paul.ctx.close();
});

test("onglet Spots du crew : lancer pour le crew (audience préremplie), un membre le voit, pas un non-membre", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const kenji = await open(browser, "kenji@orasso.local");
  await go(kenji.page, "/crew?crew=roussillon-drift&onglet=spots");
  await expect(kenji.page.getByTestId("crew-spots-launch")).toBeVisible({ timeout: 30_000 });
  await shot(kenji.page, "06-spots-vide");
  await kenji.page.getByTestId("crew-spots-launch").click();
  await kenji.page.waitForURL(/\/spot\/nouveau/);
  const crewOpt = kenji.page.locator('[data-testid^="spot-audience-crew-"]').first();
  await expect(crewOpt).toBeVisible({ timeout: 30_000 });
  await expect(crewOpt).toHaveAttribute("aria-label", /Roussillon Drift/);
  await expect(crewOpt).toHaveAttribute("aria-checked", "true");
  await placeOnMap(kenji.page);
  await kenji.page.getByTestId("spot-place-name").fill("Parking de la plage");
  await kenji.page.getByTestId("spot-launch").click();
  await kenji.page.waitForURL(/\/spot\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const audiences = await apiCall<{ crews: { id: string; slug: string }[] }>(
    await login("kenji@orasso.local"),
    "GET",
    "/me/spot-meetups/audiences",
  );
  crewId = audiences.data.crews.find((c) => c.slug === "roussillon-drift")?.id ?? "";
  expect(crewId).not.toBe("");
  await kenji.ctx.close();

  const theo = await open(browser, "theo@orasso.local");
  await go(theo.page, "/crew?crew=roussillon-drift&onglet=spots");
  await expect(theo.page.getByTestId("crew-spot-card")).toContainText("Parking de la plage", { timeout: 30_000 });
  await shot(theo.page, "07-spots-membre");
  await theo.ctx.close();
  const paul = await login("paul.photo@orasso.local");
  expect((await apiCall(paul, "GET", `/crews/${crewId}/spot-meetups`)).status).toBe(404);
});

test("après la fin : plus de lieu, « Ce rendez-vous est terminé » ; l'onglet Spots garde la ligne sans lieu", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  clock("+5h");
  const lea = await open(browser, "lea@orasso.local");
  await go(lea.page, `/spot/${meetupId}`);
  await expect(lea.page.getByTestId("spot-ended")).toBeVisible({ timeout: 30_000 });
  await expect(lea.page.getByTestId("spot-ended-title")).toHaveText("Ce rendez-vous est terminé");
  await expect(lea.page.locator("body")).not.toContainText("Saint-Cyprien");
  await shot(lea.page, "08-apres-invite");
  await go(lea.page, "/accueil");
  await expect(lea.page.getByTestId("home-spot-meetup")).toHaveCount(0);
  await lea.ctx.close();
  const theo = await open(browser, "theo@orasso.local");
  await go(theo.page, "/crew?crew=roussillon-drift&onglet=spots");
  await expect(theo.page.getByTestId("crew-spot-past").first()).toBeVisible({ timeout: 30_000 });
  await expect(theo.page.getByTestId("crew-spot-card")).toHaveCount(0);
  await expect(theo.page.locator("body")).not.toContainText("Parking de la plage");
  await shot(theo.page, "09-spots-passes");
  await theo.ctx.close();
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
  browser,
}) => {
  test.setTimeout(300_000);
  await cancelActive(damien);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ latitude: 42.7, longitude: 2.9 });
  await go(page, "/spot/nouveau");
  await expect(page.getByTestId("spot-launch")).toBeVisible({ timeout: 30_000 });
  await placeOnMap(page);
  await expect(page.getByTestId("spot-missing")).not.toContainText("Choisis un lieu");
  await page.getByTestId("spot-around-me").click();
  await expect(page.getByTestId("spot-missing")).toContainText("Choisis un lieu", { timeout: 20_000 });
  await expect(page.getByTestId("wizard-pin")).toBeHidden();
  await expect(page.getByTestId("spot-launch")).toBeDisabled();
  await placeOnMap(page);
  await expect(page.getByTestId("wizard-pin")).toBeVisible();
  await expect(page.getByTestId("spot-missing")).not.toContainText("Choisis un lieu");
  await ctx.close();
});

test("tour 2 : annulé pendant que l'écran est ouvert, il se vide sans rechargement (aucun lieu)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Quai Vauban", 2 * 3_600_000);
  const lea = await open(browser, "lea@orasso.local");
  await go(lea.page, `/spot/${id}`);
  await expect(lea.page.getByTestId("spot-place")).toHaveText("Quai Vauban", { timeout: 30_000 });
  await apiCall(damien, "DELETE", `/me/spot-meetups/${id}`);
  await expect(lea.page.getByTestId("spot-gone")).toBeVisible({ timeout: 60_000 });
  await expect(lea.page.locator("body")).not.toContainText("Quai Vauban");
  await lea.ctx.close();
});

test("tour 2 : « Qui vient ? » se relit quand le total ne change pas (Léa part, Nina arrive)", async ({ browser }) => {
  test.setTimeout(300_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Plage du Barcarès", 3 * 3_600_000);
  const lea = await login("lea@orasso.local");
  const nina = await login("nina@orasso.local");
  await apiCall(lea, "PUT", `/spot-meetups/${id}/reply`, { answer: "yes" });
  const d = await open(browser, "damien@orasso.local");
  await go(d.page, `/spot/${id}`);
  await expect(d.page.getByTestId("spot-who")).toContainText("Lea_11", { timeout: 30_000 });
  await apiCall(lea, "DELETE", `/spot-meetups/${id}/reply`);
  await apiCall(nina, "PUT", `/spot-meetups/${id}/reply`, { answer: "yes" });
  await expect(d.page.getByTestId("spot-who")).toContainText("Nina", { timeout: 60_000 });
  await expect(d.page.getByTestId("spot-who")).not.toContainText("Lea_11");
  await expect(d.page.getByTestId("spot-who")).toContainText("1 vient");
  await apiCall(damien, "DELETE", `/me/spot-meetups/${id}`);
  await d.ctx.close();
});

test("tour 2 : l'écran ouvert passe « terminé » à l'heure de fin, même sans réseau", async ({ browser }) => {
  test.setTimeout(300_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Parking des Capellans", 55_000);
  const lea = await open(browser, "lea@orasso.local");
  await go(lea.page, `/spot/${id}`);
  await expect(lea.page.getByTestId("spot-place")).toHaveText("Parking des Capellans", { timeout: 30_000 });
  await lea.ctx.setOffline(true);
  await expect(lea.page.getByTestId("spot-ended")).toBeVisible({ timeout: 60_000 });
  await expect(lea.page.locator("body")).not.toContainText("Capellans");
  await lea.ctx.close();
});

test("tour 2 : le Fil porte la carte du rendez-vous pour mes abonnés ; l'Accueil gardé hors ligne n'a aucun lieu", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await cancelActive(damien);
  const id = await launchBy(damien, "Cap Béar", 3 * 3_600_000);
  const lea = await open(browser, "lea@orasso.local");
  await go(lea.page, "/accueil");
  await expect(lea.page.getByTestId("home-spot-meetup")).toContainText("Cap Béar", { timeout: 30_000 });
  await go(lea.page, "/fil");
  const card = lea.page.getByTestId("feed-card-spot_meetup");
  await expect(card.first()).toBeVisible({ timeout: 30_000 });
  await expect(card.first()).toContainText("Cap Béar");
  await shot(lea.page, "10-fil-carte");
  // Rien du lieu n'a été écrit dans la copie locale de l'Accueil (cache du téléphone), alors que la copie existe bien.
  const stored = await lea.page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([k]) => k.includes("home-"))
      .map(([, v]) => v),
  );
  expect(stored.length).toBeGreaterThan(0);
  expect(stored.join(" ")).not.toMatch(/Cap Béar|42\.62/);
  await apiCall(damien, "DELETE", `/me/spot-meetups/${id}`);
  await lea.ctx.close();
});
