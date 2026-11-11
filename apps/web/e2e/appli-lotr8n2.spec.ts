import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  type Cookie,
  createEvent,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";

// Lot R8n2 (maquette R8.11), côté appli (version web compilée) : les notifications d'un événement.
//   - fin de candidature : le bloc « Ce que tu recevras pour cet événement » (l'Essentiel, « Nouveautés » activé par
//     défaut), « C'est noté » après avoir coupé les Nouveautés ;
//   - la cloche de la fiche : l'interrupteur coupé, puis rallumé ; place perdue : le message, la cloche disparaît ;
//     sans place : pas de cloche ;
//   - Réglages > Notifications : la ligne verrouillée, « Nouveautés de mes sorties » coupée puis relue, grisée quand la
//     famille « Événements » est coupée ;
//   - organisateur : un changement d'heure prévient « N inscrits » (le nombre de l'API) ; le titre seul, aucune ligne.
// Lancer avec APP_URL (appli compilée), l'API et le site sur la base seedée.
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Who = { pseudo: string; email: string; cookie: Cookie };

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, theme: "beton" | "sable" = "beton") {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
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

const v = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function person(prefix: string): Promise<Who> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await addVehicleApi(cookie, randomPlate());
  return { pseudo, email, cookie };
}

const prefsOf = (cookie: Cookie, eventId: string) =>
  apiCall<{ news: boolean; hasPlace: boolean }>(cookie, "GET", `/me/events/${eventId}/notification-prefs`);

async function applyInApp(page: Page, slug: string) {
  await goto(page, `/e/${slug}`);
  await expect(v(page, "event-primary")).toBeVisible({ timeout: 30_000 });
  await v(page, "event-primary").click();
  await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
  const rules = page.getByTestId("cand-rules");
  if (await rules.isVisible().catch(() => false)) await rules.click();
  const seen = page.getByTestId("arrival-seen");
  if (await seen.isVisible().catch(() => false)) await seen.click();
  await page.getByTestId("cand-send").click();
  await expect(page.getByTestId("cand-done")).toBeVisible({ timeout: 20_000 });
}

test("appli : à l'inscription, la cloche de la fiche et la place perdue", async ({ browser }) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, { title: `Nocturne R8n2 ${unique()}`.slice(0, 40), admission: "filtered" });
  const a = await person("Ins");
  const outsider = await person("Hors");

  // Sans place : pas de cloche.
  const out = await open(browser);
  await signIn(out.page, outsider.email);
  await goto(out.page, `/e/${event.slug}`);
  await expect(v(out.page, "event-primary")).toBeVisible({ timeout: 30_000 });
  await expect(out.page.getByTestId("notify-bell")).toHaveCount(0);
  expect((await prefsOf(outsider.cookie, event.id)).data.hasPlace).toBe(false);
  await out.ctx.close();

  const { ctx, page } = await open(browser);
  await signIn(page, a.email);
  await expect(async () => {
    await goto(page, `/e/${event.slug}`);
    await expect(v(page, "event-primary")).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 40_000 });
  await expect(page.getByTestId("notify-bell")).toHaveCount(0);
  await applyInApp(page, event.slug);

  // Le bloc : l'Essentiel (six lignes), « Nouveautés » activé par défaut, un seul bouton principal : « C'est noté ».
  const block = page.getByTestId("notify-signup");
  await expect(block).toContainText("Ce que tu recevras pour cet événement");
  await expect(block.getByTestId("notify-essential")).toContainText("Essentiel");
  await expect(block.getByTestId("notify-essential")).toContainText("Actif tant que tu es inscrit ou retenu");
  for (const line of [
    "Changement de date ou d'heure",
    "Changement de lieu",
    "Annulation, ou événement « incertain »",
    "Décision sur ta candidature",
    "Rappel de la veille",
    "« Info importante » de l'organisateur",
  ]) {
    await expect(block.getByTestId("notify-essential")).toContainText(line);
  }
  const news = page.getByTestId("notify-signup-news");
  await expect(news).toHaveAttribute("aria-checked", "true");
  await expect(news).toContainText("Nouveautés de l'événement");
  // L'Essentiel n'a pas d'interrupteur ; rien n'est enregistré tant que « C'est noté » n'est pas touché.
  expect((await prefsOf(a.cookie, event.id)).data).toMatchObject({ news: true, hasPlace: true });
  await news.click();
  await expect(news).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("notify-noted").click();
  await expect(page.getByTestId("cand-done")).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await prefsOf(a.cookie, event.id)).data.news, { timeout: 15_000 }).toBe(false);

  // La cloche de la fiche : l'interrupteur est coupé ; on le rallume.
  await goto(page, `/e/${event.slug}`);
  await expect(page.getByTestId("notify-bell")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("notify-bell")).toHaveAccessibleName("Notifications de cet événement");
  await page.getByTestId("notify-bell").click();
  const sw = page.getByTestId("notify-news-switch");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("notify-essential")).toContainText("Essentiel");
  await sw.click();
  await expect.poll(async () => (await prefsOf(a.cookie, event.id)).data.news, { timeout: 15_000 }).toBe(true);
  await expect(sw).toHaveAttribute("aria-checked", "true");

  // Place perdue entre-temps : le message, puis la cloche disparaît.
  const mine = await apiCall<{ id: string }[]>(a.cookie, "GET", "/me/applications?scope=upcoming");
  const withdrawn = await apiCall(a.cookie, "POST", `/applications/${mine.data[0]?.id}/withdraw`, {});
  expect(withdrawn.status).toBe(200);
  expect((await prefsOf(a.cookie, event.id)).data.hasPlace).toBe(false);
  await sw.click();
  await expect(page.getByTestId("notify-message")).toContainText("Tu n'as pas de place à cet événement");
  await page.getByRole("button", { name: "Fermer" }).first().click({ force: true });
  await expect(page.getByTestId("notify-bell")).toHaveCount(0, { timeout: 15_000 });
  await ctx.close();
});

test("appli : Réglages > Notifications, les deux lignes de « Événements »", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await person("Reg");
  const { ctx, page } = await open(browser);
  await signIn(page, a.email);
  await goto(page, "/reglages/notifications");
  const essential = page.getByTestId("notif-essential");
  await expect(essential).toBeVisible({ timeout: 30_000 });
  await expect(essential).toContainText("Changements importants de mes sorties");
  await expect(essential).toContainText(
    "Date, heure, lieu, annulation, décision, rappel de la veille, info importante",
  );
  await expect(essential).toContainText("Toujours actif");
  await expect(essential).toHaveAccessibleName(/toujours actif/i);
  // Pas d'interrupteur sur la ligne verrouillée.
  await expect(essential.getByRole("switch")).toHaveCount(0);
  const news = page.getByTestId("notif-news");
  await expect(news).toContainText("Nouveautés de mes sorties");
  await expect(news).toHaveAttribute("aria-checked", "true");
  await news.click();
  await expect(news).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(
      async () =>
        (await apiCall<{ notificationPrefs: { eventNews?: boolean; event: boolean } }>(a.cookie, "GET", "/me/settings"))
          .data.notificationPrefs.eventNews,
      { timeout: 15_000 },
    )
    .toBe(false);
  // Relue après rechargement ; la famille « Événements » reste active.
  await goto(page, "/reglages/notifications");
  await expect(page.getByTestId("notif-news")).toHaveAttribute("aria-checked", "false", { timeout: 20_000 });
  const settings = await apiCall<{ notificationPrefs: { event: boolean }; mutedTypes: string[] }>(
    a.cookie,
    "GET",
    "/me/settings",
  );
  expect(settings.data.notificationPrefs.event).toBe(true);
  // Le résumé n'est pas aussi une case de la famille (une seule ligne pour lui).
  expect(settings.data.mutedTypes).not.toContain("event_news_digest");
  await ctx.close();
});

test("appli : organisateur, « N inscrits seront prévenus » seulement pour l'heure ou le lieu", async ({ browser }) => {
  test.setTimeout(420_000);
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, {
    title: `Organisateur R8n2 ${unique()}`.slice(0, 40),
    admission: "filtered",
  });
  const inscrits = [await person("InsO"), await person("InsO")];
  for (const p of inscrits) {
    const vehicles = await apiCall<{ id: string }[]>(p.cookie, "GET", "/me/vehicles");
    const applied = await apiCall(p.cookie, "POST", `/events/${event.id}/applications`, {
      vehicleIds: [vehicles.data[0]?.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
    });
    expect(applied.status).toBe(201);
  }
  const preview = await apiCall<{ recipients: number }>(damien, "GET", `/events/${event.id}/notify-preview`);
  expect(preview.data.recipients).toBe(2);

  const { ctx, page } = await open(browser);
  await signIn(page, "damien@orasso.local");
  await page.goto("/moi");
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });

  const toLastStep = async () => {
    for (let i = 0; i < 9; i++) {
      if (await v(page, "wizard-save").count()) return;
      const before = (await v(page, "wizard-step").textContent()) ?? "";
      await v(page, "wizard-next").click();
      await expect(v(page, "wizard-step")).not.toHaveText(before, { timeout: 30_000 });
    }
  };

  // Le titre seul : aucune ligne.
  await goto(page, `/evenement/${event.id}/modifier?temps=type`);
  await expect(v(page, "wizard-title")).toBeVisible({ timeout: 30_000 });
  await v(page, "wizard-title").fill(`${event.title} bis`);
  await toLastStep();
  await expect(v(page, "wizard-save")).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("notify-recipients")).toHaveCount(0);

  // L'heure : « 2 inscrits seront prévenus. », sans case à cocher.
  await goto(page, `/evenement/${event.id}/modifier?temps=type`);
  const start = v(page, "wizard-start-time");
  await expect(start).toBeVisible({ timeout: 30_000 });
  await start.fill("17:00");
  await start.blur();
  await toLastStep();
  const banner = page.getByTestId("notify-recipients");
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("notify-recipients-count")).toHaveText("2 inscrits seront prévenus.");
  await expect(banner).toContainText("Un changement d'heure ou de lieu prévient tout seul : pas de case à cocher.");
  await expect(banner.getByRole("checkbox")).toHaveCount(0);
  // Le moment : rien de plus dans la journée ; la nuit, une phrase (l'heure de la recette n'est pas figée).
  const timing = await page.getByTestId("notify-recipients-timing").count();
  if (timing) {
    await expect(page.getByTestId("notify-recipients-timing")).toHaveText(
      /Il est tard : ils seront prévenus à 8 h\.|L'événement commence dans moins de 12 h : ils sont prévenus tout de suite, même la nuit\./,
    );
  }
  await v(page, "wizard-save").click();
  await expect(page.getByText(/Enregistré : 2 inscrits (seront )?prévenus/)).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});
