import { type Browser, expect, test } from "@playwright/test";
import { addVehicleApi, apiCall, type Cookie, createEvent, login, randomPlate, signUpApi, unique } from "./helpers";

// Lot R8n2 (maquette R8.11), côté site : les notifications d'un événement, mêmes mots et mêmes règles que l'appli.
//   - fin de candidature : « Ce que tu recevras pour cet événement » ; « Nouveautés » coupé puis « C'est noté » ;
//   - la cloche de la fiche (visible avec une place seulement), l'interrupteur coupé puis rallumé, place perdue ;
//   - Réglages > Notifications : la ligne verrouillée, « Nouveautés de mes sorties », grisée si la famille est coupée ;
//   - organisateur : « N inscrits seront prévenus » (heure ou lieu), aucune ligne pour le titre seul.
// 390 et 1280 px. L'API et le site tournent sur la base seedée.
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });

async function siteContext(browser: Browser, cookie: Cookie, width: number) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const url = new URL(WEB);
  const cookies: { name: string; value: string; url: string }[] = [];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function person(prefix: string) {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const cookie = await signUpApi(pseudo, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await addVehicleApi(cookie, randomPlate());
  return { pseudo, cookie };
}

const prefsOf = (cookie: Cookie, eventId: string) =>
  apiCall<{ news: boolean; hasPlace: boolean }>(cookie, "GET", `/me/events/${eventId}/notification-prefs`);

for (const width of [390, 1280]) {
  test(`site ${width} px : à l'inscription, la cloche de la fiche, la place perdue`, async ({ browser }) => {
    test.setTimeout(240_000);
    const damien = await login("damien@orasso.local");
    const event = await createEvent(damien, {
      title: `Nocturne site R8n2 ${unique()}`.slice(0, 40),
      admission: "filtered",
    });
    const a = await person("InsS");
    const outsider = await person("HorsS");

    // Sans place : pas de cloche.
    const octx = await siteContext(browser, outsider.cookie, width);
    const op = await octx.newPage();
    await op.goto(`/e/${event.slug}`);
    await expect(op.getByTestId("event-hero")).toBeVisible({ timeout: 30_000 });
    await op.waitForLoadState("networkidle");
    await expect(op.getByTestId("notify-bell")).toHaveCount(0);
    await octx.close();

    const ctx = await siteContext(browser, a.cookie, width);
    const page = await ctx.newPage();
    await page.goto(`/e/${event.slug}`);
    await expect(page.getByTestId("event-hero")).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("notify-bell")).toHaveCount(0);

    await page.goto(`/e/${event.slug}/candidater`);
    await expect(page.locator('[data-step="1"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.locator('[data-step="2"]')).toBeVisible();
    await page.getByLabel("J'ai lu le règlement").check();
    const seen = page.getByTestId("arrival-seen");
    if (await seen.isVisible().catch(() => false)) await page.getByLabel("J'ai vu le créneau d'arrivée.").check();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.locator('[data-step="3"]')).toBeVisible();
    await page.getByRole("button", { name: "Envoyer ma candidature" }).click();

    // L'écran de fin : l'Essentiel, « Nouveautés » activé par défaut, « C'est noté » (le bouton principal).
    const block = page.getByTestId("notify-signup");
    await expect(block).toBeVisible({ timeout: 30_000 });
    await expect(block).toContainText("Ce que tu recevras pour cet événement");
    const essential = block.getByTestId("notify-essential");
    await expect(essential).toContainText("Essentiel");
    await expect(essential).toContainText("Actif tant que tu es inscrit ou retenu");
    for (const line of [
      "Changement de date ou d'heure",
      "Changement de lieu",
      "Annulation, ou événement « incertain »",
      "Décision sur ta candidature",
      "Rappel de la veille",
      "« Info importante » de l'organisateur",
    ]) {
      await expect(essential).toContainText(line);
    }
    // Lecteur d'écran : « Essentiel, toujours actif » (texte masqué) ; pas d'interrupteur sur l'Essentiel.
    await expect(essential).toContainText("toujours actif");
    await expect(essential.getByRole("switch")).toHaveCount(0);
    const news = page.getByTestId("notify-signup-news");
    await expect(news).toBeChecked();
    await expect(news).toHaveAccessibleName("Nouveautés de l'événement");
    expect((await prefsOf(a.cookie, event.id)).data).toMatchObject({ news: true, hasPlace: true });
    await news.uncheck();
    // Tour 2 : enregistré au changement de l'interrupteur, avant « C'est noté ».
    await expect.poll(async () => (await prefsOf(a.cookie, event.id)).data.news, { timeout: 15_000 }).toBe(false);
    await page.getByTestId("notify-noted").click();
    await page.waitForURL(/\/app\/(acces|sorties)/, { timeout: 30_000 });
    expect((await prefsOf(a.cookie, event.id)).data.news).toBe(false);

    // La cloche de la fiche : l'interrupteur est coupé ; on le rallume.
    await page.goto(`/e/${event.slug}`);
    const bell = page.getByTestId("notify-bell");
    await expect(bell).toBeVisible({ timeout: 30_000 });
    await expect(bell).toHaveAccessibleName("Notifications de cet événement");
    await bell.click();
    const sw = page.getByTestId("notify-news-switch");
    await expect(sw).not.toBeChecked();
    await expect(page.getByTestId("notify-sheet").getByTestId("notify-essential")).toContainText("Essentiel");
    await sw.check();
    await expect.poll(async () => (await prefsOf(a.cookie, event.id)).data.news, { timeout: 15_000 }).toBe(true);

    // Place perdue entre-temps : le message, puis la cloche disparaît à la fermeture.
    const mine = await apiCall<{ id: string }[]>(a.cookie, "GET", "/me/applications?scope=upcoming");
    expect((await apiCall(a.cookie, "POST", `/applications/${mine.data[0]?.id}/withdraw`, {})).status).toBe(200);
    await sw.uncheck();
    await expect(page.getByTestId("notify-message")).toContainText("Tu n'as pas de place à cet événement");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("notify-bell")).toHaveCount(0, { timeout: 15_000 });
    await ctx.close();
  });
}

test("site : Réglages > Notifications, les deux lignes de « Événements »", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await person("RegS");
  const ctx = await siteContext(browser, a.cookie, 1280);
  const page = await ctx.newPage();
  await page.goto("/app/moi#notifications");
  const essential = page.getByTestId("notif-essential");
  await expect(essential).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await expect(essential).toContainText("Changements importants de mes sorties");
  await expect(essential).toContainText(
    "Date, heure, lieu, annulation, décision, rappel de la veille, info importante",
  );
  await expect(essential).toContainText("Toujours actif");
  await expect(essential.getByRole("switch")).toHaveCount(0);
  const news = page.getByTestId("notif-news");
  await expect(news).toBeChecked();
  await expect(news).toHaveAccessibleName("Nouveautés de mes sorties");

  // La famille « Événements » coupée : « Nouveautés » est grisée avec sa raison, « Changements » reste toujours actif.
  const family = page.getByLabel("Recevoir les notifications « Événements »");
  await family.uncheck();
  await expect(news).toBeDisabled();
  await expect(page.getByTestId("notif-event-rows")).toContainText(
    "Coupé : tu as désactivé les notifications « Événements »",
  );
  await expect(essential).toContainText("Toujours actif");
  await family.check();
  await expect(news).toBeEnabled();

  // Coupée puis relue après l'enregistrement ; le résumé n'est pas aussi une case de la famille.
  await news.uncheck();
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await page.waitForURL(/fait=reglages/, { timeout: 30_000 });
  const settings = await apiCall<{ notificationPrefs: { eventNews?: boolean; event: boolean }; mutedTypes: string[] }>(
    a.cookie,
    "GET",
    "/me/settings",
  );
  expect(settings.data.notificationPrefs.eventNews).toBe(false);
  expect(settings.data.notificationPrefs.event).toBe(true);
  expect(settings.data.mutedTypes).not.toContain("event_news_digest");
  await page.goto("/app/moi#notifications");
  await expect(page.getByTestId("notif-news")).not.toBeChecked();
  await ctx.close();
});

test("site : organisateur, « N inscrits seront prévenus » seulement pour l'heure ou le lieu", async ({ browser }) => {
  test.setTimeout(240_000);
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, {
    title: `Organisateur site R8n2 ${unique()}`.slice(0, 40),
    admission: "filtered",
  });
  for (const p of [await person("InsO"), await person("InsO")]) {
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
  expect(
    (await apiCall<{ recipients: number }>(damien, "GET", `/events/${event.id}/notify-preview`)).data.recipients,
  ).toBe(2);

  const ctx = await siteContext(browser, damien, 1280);
  const page = await ctx.newPage();
  const toLastStep = async () => {
    for (let i = 0; i < 9; i++) {
      if (await page.getByTestId("wizard-save").count()) return;
      const before = (await page.getByTestId("wizard-step").textContent()) ?? "";
      await page.getByTestId("wizard-next").click();
      await expect(page.getByTestId("wizard-step")).not.toHaveText(before, { timeout: 30_000 });
    }
  };

  // Le titre seul : aucune ligne.
  await page.goto(`/orga/meditesportcar/e/${event.id}/modifier?temps=type`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Titre").fill(`${event.title} bis`);
  await toLastStep();
  await expect(page.getByTestId("wizard-save")).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("notify-recipients")).toHaveCount(0);

  // L'heure : « 2 inscrits seront prévenus. », sans case à cocher.
  await page.goto(`/orga/meditesportcar/e/${event.id}/modifier?temps=type`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Début").first().fill("17:00");
  await toLastStep();
  const banner = page.getByTestId("notify-recipients");
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("notify-recipients-count")).toHaveText("2 inscrits seront prévenus.");
  await expect(banner).toContainText("Un changement d'heure ou de lieu prévient tout seul : pas de case à cocher.");
  await expect(banner.getByRole("checkbox")).toHaveCount(0);
  if (await page.getByTestId("notify-recipients-timing").count()) {
    await expect(page.getByTestId("notify-recipients-timing")).toHaveText(
      /C.est la nuit : ils seront prévenus à 8 h\.|L'événement commence dans moins de 12 h : ils sont prévenus tout de suite, même la nuit\./,
    );
  }
  await page.getByTestId("wizard-save").click();
  await expect(page.getByTestId("notify-saved")).toContainText(/Enregistré : 2 inscrits (seront )?prévenus/, {
    timeout: 30_000,
  });
  await ctx.close();
});

test("site : lecture impossible, puis « C'est noté » pendant un envoi qui échoue", async ({ browser }) => {
  test.setTimeout(240_000);
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, { title: `Tour3 site R8n2 ${unique()}`.slice(0, 40), admission: "filtered" });
  const a = await person("T3S");
  const ctx = await siteContext(browser, a.cookie, 390);
  const page = await ctx.newPage();
  const prefsUrl = /\/api\/me\/events\/[^/]+\/notification-prefs$/;
  await page.goto(`/e/${event.slug}/candidater`);
  await expect(page.locator('[data-step="1"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator('[data-step="2"]')).toBeVisible();
  await page.getByLabel("J'ai lu le règlement").check();
  const seen = page.getByTestId("arrival-seen");
  if (await seen.isVisible().catch(() => false)) await page.getByLabel("J'ai vu le créneau d'arrivée.").check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator('[data-step="3"]')).toBeVisible();
  // La lecture du réglage échoue : jamais un défaut présenté comme enregistré.
  await page.route(prefsUrl, (route) => route.abort());
  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(page.getByTestId("notify-signup-read-error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("notify-signup-news")).toHaveCount(0);
  await page.unroute(prefsUrl);
  await page.getByTestId("notify-signup-retry").click();
  const news = page.getByTestId("notify-signup-news");
  await expect(news).toBeChecked({ timeout: 15_000 });
  // « C'est noté » pendant un envoi lent qui échoue : l'écran reste, le message est visible, rien n'est faussement noté.
  await page.route(prefsUrl, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await new Promise((r) => setTimeout(r, 800));
    return route.abort();
  });
  await news.uncheck();
  await page.getByTestId("notify-noted").click();
  await expect(page.getByTestId("notify-signup-message")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/candidater/);
  await expect(news).toBeChecked();
  expect((await prefsOf(a.cookie, event.id)).data.news).toBe(true);
  await page.unroute(prefsUrl);
  // Deux bascules rapprochées : le dernier choix est celui qui est enregistré.
  await news.uncheck();
  await news.check();
  await news.uncheck();
  await page.getByTestId("notify-noted").click();
  await page.waitForURL(/\/app\/(acces|sorties)/, { timeout: 30_000 });
  expect((await prefsOf(a.cookie, event.id)).data.news).toBe(false);
  await ctx.close();
});
