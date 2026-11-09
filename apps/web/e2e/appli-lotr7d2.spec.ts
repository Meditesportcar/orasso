import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { lydia, northOf, resetPresences, SLUG, VISITORS, withAccess } from "./helpers/lotr7d2";
import { RELAIS } from "./relais";

// Lot R7d2 (le direct sur place, appli) sur l'événement en cours « Rassemblement du Lydia » du seed : la fiche pendant
// l'événement (« En cours · jour N sur M », « N sur place, sur M retenues », « Votes · N ouverts » une fois entré), « Je suis
// sur place » par la position du téléphone (simulée par le navigateur : dans la zone, hors zone, trop imprécise), rien
// de gardé sur l'appareil, le Jour J, les présents de l'organisateur (rafraîchis en direct), la zone de présence de
// l'éditeur, et rien après la fin. APP_URL = l'appli compilée ; API et seed lancés ; horloge simulée dans les heures de
// l'événement (`pnpm dev:clock to <jour>T10:30`), sinon la validation répond « closed » et les cas GPS sont sautés.
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7d2-captures/apres/recette-appli`).replaceAll("\\", "/");
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.setTimeout(300_000);

type Theme = "beton" | "sable";
type Geo = { latitude: number; longitude: number; accuracy: number };
const CLOSED_HINT = "à partir de 30 minutes";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: Theme = "beton", geo?: Geo, height = 860) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height },
    baseURL: APP,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    ...(geo ? { geolocation: geo, permissions: ["geolocation"] } : {}),
  });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|direct/, { timeout: 60_000 });
  return { ctx, page };
}

async function goEvent(page: Page, slug = SLUG) {
  await page.goto(`/e/${slug}`);
  await afterOpening(page).catch(() => undefined);
  await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 45_000 });
}

async function toOrganizerDirect(page: Page) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").filter({ hasText: "Roues Libres" }).first().click();
  await page.waitForURL(/\/direct/, { timeout: 60_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Le texte lu par la fiche : « 11 sur place, sur 14 retenues ». */
const onSiteText = (live: { onSiteCount: number | null; acceptedCount: number | null }) =>
  `${live.onSiteCount} sur place, sur ${live.acceptedCount} ${(live.acceptedCount ?? 0) >= 2 ? "retenues" : "retenue"}`;

const running = async (email: string | null) => {
  const ev = await lydia(email);
  test.skip(ev.live.phase !== "running", "Le Lydia n'est pas en cours (horloge simulée à régler).");
  return ev;
};

test.describe("fiche et Jour J pendant l'événement", () => {
  test("Damien entré : « En cours », « N sur place », bouton principal « Votes · N ouverts » (B2) ; Jour J « Sur place · N »", async ({
    browser,
  }) => {
    const ev = await running("damien@orasso.local");
    expect(ev.live.myPresence).not.toBeNull();
    for (const theme of ["beton", "sable"] as const) {
      const { ctx, page } = await open(browser, "damien@orasso.local", theme, undefined, 1500);
      await goEvent(page);
      // Il a une place (« Ta place » dit déjà « En cours · jour N sur M ») : pas de seconde ligne de phase.
      await expect(page.getByTestId("event-live")).toBeVisible();
      await expect(page.getByTestId("event-live-onsite")).toContainText(onSiteText(ev.live));
      await expect(page.getByTestId("event-live-phase")).toHaveCount(0);
      await expect(page.getByTestId("my-place-countdown")).toContainText(/En cours · jour \d sur \d/i);
      // Jamais « Je suis sur place » pour un exposant entré.
      await expect(page.getByTestId("event-presence-open")).toHaveCount(0);
      const primary = page.getByTestId("event-primary");
      if (ev.live.votesOpen > 0) {
        const label = `Votes · ${ev.live.votesOpen} ${ev.live.votesOpen >= 2 ? "ouverts" : "ouvert"}`;
        await expect(primary).toContainText(label);
        await shot(page, `fiche-entre-${theme}`);
        await primary.click();
        await expect(page).toHaveURL(new RegExp(`/votes/${ev.id}`));
      } else {
        await expect(primary).toContainText("Mon accès");
      }
      await ctx.close();
    }
    // Jour J : une ligne « Sur place · N » sous l'état d'entrée.
    const cookie = await login("damien@orasso.local");
    const apps = await apiCall<{ id: string; event: { slug: string } }[]>(
      cookie,
      "GET",
      "/me/applications?scope=upcoming",
    );
    const appId = apps.data.find((a) => a.event.slug === SLUG)?.id;
    const { ctx, page } = await open(browser, "damien@orasso.local");
    await page.goto(`/jour-j/${appId}`);
    await afterOpening(page).catch(() => undefined);
    await expect(page.getByTestId("jourj-entered")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("jourj-onsite")).toHaveText(`Sur place · ${ev.live.onSiteCount}`);
    await shot(page, "jour-j-sur-place");
    await ctx.close();
  });

  test("après la fin : ni retenues ni sur place (aucune valeur gardée)", async ({ browser }) => {
    const cookie = await login("damien@orasso.local");
    const past = await apiCall<{ event: { slug: string } }[]>(cookie, "GET", "/me/applications?scope=past");
    const slug = past.data.map((a) => a.event.slug).find((s) => s !== SLUG);
    test.skip(!slug, "Aucun événement passé dans le seed.");
    const res = await apiCall<{ live: { phase: string; onSiteCount: number | null; acceptedCount: number | null } }>(
      cookie,
      "GET",
      `/events/by-slug/${slug}`,
    );
    expect(res.data.live.phase).toBe("after");
    expect(res.data.live.onSiteCount).toBeNull();
    expect(res.data.live.acceptedCount).toBeNull();
    const { ctx, page } = await open(browser, "damien@orasso.local");
    // L'événement en cours d'abord (les compteurs sont à l'écran), puis l'événement fini : rien ne reste.
    await goEvent(page);
    await goEvent(page, slug);
    await expect(page.getByTestId("event-live")).toHaveCount(0);
    await expect(page.getByText(/sur place, sur \d+ retenue/)).toHaveCount(0);
    await expect(page.getByTestId("event-presence-open")).toHaveCount(0);
    await shot(page, "fiche-apres-la-fin");
    await ctx.close();
  });
});

test.describe("« Je suis sur place » (position simulée par le navigateur)", () => {
  test.beforeAll(async () => {
    await resetPresences(Object.values(VISITORS));
  });

  test("dans la zone : présence, tampon, droit de vote, rien de gardé sur l'appareil", async ({ browser }) => {
    const ev = await running(VISITORS.success);
    expect(ev.live.myPresence).toBeNull();
    const geo: Geo = { latitude: northOf(ev.lat, 40), longitude: ev.lng, accuracy: 20 };
    const posted: string[] = [];
    for (const theme of ["beton", "sable"] as const) {
      if (theme === "sable") await resetPresences([VISITORS.success]);
      const { ctx, page } = await open(browser, VISITORS.success, theme, geo, 1500);
      page.on("request", (r) => {
        if (r.method() !== "GET") posted.push(`${r.url()} ${r.postData() ?? ""}`);
      });
      const logs: string[] = [];
      page.on("console", (m) => logs.push(m.text()));
      await goEvent(page);
      await expect(page.getByTestId("event-live-phase")).toContainText(/En cours/i);
      await expect(page.getByTestId("event-live-onsite")).toContainText("sur place, sur");
      await shot(page, `fiche-visiteur-${theme}`);
      await page.getByTestId("event-presence-open").click();
      await expect(page.getByTestId("presence-sheet")).toContainText("Je suis sur place");
      await expect(page.getByTestId("presence-explain")).toContainText("ni suivie ni gardée");
      await shot(page, `presence-feuille-${theme}`);
      await page.getByTestId("presence-validate").click();
      const outcome = page.getByTestId("presence-validated").or(page.getByTestId("presence-error"));
      await expect(outcome).toBeVisible({ timeout: 30_000 });
      const error = await page
        .getByTestId("presence-error")
        .textContent()
        .catch(() => null);
      test.skip(Boolean(error?.includes(CLOSED_HINT)), "Hors des heures de l'événement (horloge simulée).");
      await expect(page.getByTestId("presence-validated")).toContainText("tu peux voter");
      await shot(page, `presence-validee-${theme}`);
      await page.getByTestId("presence-close").click();
      // La fiche se relit : « Votes · N ouverts » en bouton principal, plus de « Je suis sur place ».
      const after = await lydia(VISITORS.success);
      expect(after.live.myPresence).toBe("gps");
      if (after.live.votesOpen > 0)
        await expect(page.getByTestId("event-primary")).toContainText(`Votes · ${after.live.votesOpen}`, {
          timeout: 20_000,
        });
      await expect(page.getByTestId("event-presence-open")).toHaveCount(0);
      await shot(page, `fiche-visiteur-present-${theme}`);

      // La position n'est gardée nulle part : ni dans l'appareil (stockage local, de session), ni dans un journal de la
      // page ; une seule demande l'a portée (la validation) et elle part vers la route de présence seulement.
      const digits = [String(geo.latitude).slice(0, 7), String(geo.longitude).slice(0, 6)];
      const stored = await page.evaluate(() => {
        const dump: Record<string, string> = {};
        for (const store of [localStorage, sessionStorage])
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i) as string;
            dump[key] = store.getItem(key) ?? "";
          }
        return JSON.stringify(dump);
      });
      for (const d of digits) {
        expect(stored, `le stockage de l'appareil ne contient pas ${d}`).not.toContain(d);
        expect(logs.join("\n"), `le journal de la page ne contient pas ${d}`).not.toContain(d);
      }
      const carrying = posted.filter((p) => digits.some((d) => p.includes(d)));
      expect(carrying.length).toBeGreaterThanOrEqual(1);
      for (const p of carrying) expect(p).toContain("/presence");
      await ctx.close();
    }
  });

  test("hors zone : « Tu n'es pas encore dans la zone », rien n'est validé", async ({ browser }) => {
    const ev = await running(VISITORS.far);
    const geo: Geo = { latitude: northOf(ev.lat, 20_000), longitude: ev.lng, accuracy: 15 };
    const { ctx, page } = await open(browser, VISITORS.far, "beton", geo, 1500);
    await goEvent(page);
    await page.getByTestId("event-presence-open").click();
    await page.getByTestId("presence-validate").click();
    await expect(page.getByTestId("presence-error")).toBeVisible({ timeout: 30_000 });
    const text = (await page.getByTestId("presence-error").textContent()) ?? "";
    test.skip(text.includes(CLOSED_HINT), "Hors des heures de l'événement (horloge simulée).");
    expect(text).toBe("Tu n'es pas encore dans la zone de l'événement : rapproche-toi du lieu et réessaie.");
    await shot(page, "presence-hors-zone");
    // On peut réessayer ; la présence n'a pas été posée.
    await expect(page.getByTestId("presence-validate")).toContainText("Réessayer");
    expect((await lydia(VISITORS.far)).live.myPresence).toBeNull();
    await ctx.close();
  });

  test("position trop imprécise : « sors à l'air libre »", async ({ browser }) => {
    const ev = await running(VISITORS.vague);
    const geo: Geo = { latitude: ev.lat, longitude: ev.lng, accuracy: 500 };
    const { ctx, page } = await open(browser, VISITORS.vague, "beton", geo, 1500);
    await goEvent(page);
    await page.getByTestId("event-presence-open").click();
    await page.getByTestId("presence-validate").click();
    await expect(page.getByTestId("presence-error")).toBeVisible({ timeout: 30_000 });
    const text = (await page.getByTestId("presence-error").textContent()) ?? "";
    test.skip(text.includes(CLOSED_HINT), "Hors des heures de l'événement (horloge simulée).");
    expect(text).toBe("Ta position est trop imprécise : sors à l'air libre, attends quelques secondes et réessaie.");
    await ctx.close();
  });

  test("permission de position refusée : un message et un lien vers les réglages", async ({ browser }) => {
    await running(VISITORS.vague);
    // Aucune permission accordée au navigateur : l'appli le dit.
    const { ctx, page } = await open(browser, VISITORS.vague, "beton", undefined, 1500);
    await goEvent(page);
    await page.getByTestId("event-presence-open").click();
    await page.getByTestId("presence-validate").click();
    await expect(page.getByTestId("presence-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("presence-settings")).toBeVisible();
    await ctx.close();
  });
});

test.describe("le bouton suit l'accès (tour 2 : l'API ne refuserait pas avant la mesure)", () => {
  test("fermé au public, billetterie externe, entrée payante sans billet : ni bouton ni mesure ; entrée libre : le bouton", async ({
    browser,
  }) => {
    await running(VISITORS.vague);
    await resetPresences([VISITORS.vague]);
    for (const access of ["closed", "paid_external", "paid_orasso"]) {
      await withAccess(
        access,
        async () => {
          const ev = await lydia(VISITORS.vague);
          expect(ev.live.canValidatePresence, access).toBe(false);
          const { ctx, page } = await open(browser, VISITORS.vague, "beton", undefined, 1500);
          await goEvent(page);
          await expect(page.getByTestId("event-presence-open"), access).toHaveCount(0);
          if (access === "closed") await shot(page, "fiche-ferme-au-public");
          await ctx.close();
        },
        access === "paid_orasso" ? 1000 : undefined,
      );
    }
    await withAccess("free", async () => {
      const ev = await lydia(VISITORS.vague);
      expect(ev.live.canValidatePresence).toBe(true);
      const { ctx, page } = await open(browser, VISITORS.vague, "beton", undefined, 1500);
      await goEvent(page);
      await expect(page.getByTestId("event-presence-open")).toBeVisible();
      await ctx.close();
    });
  });
});

test.describe("côté organisateur", () => {
  test("Présents : total et trois lignes, jamais de liste, rafraîchis quand quelqu'un est validé", async ({
    browser,
  }) => {
    const ev = await running("damien@orasso.local");
    const sarah = await login("sarah@orasso.local");
    const summary = await apiCall<{
      exhibitorsCheckedIn: number;
      visitorsWithTicketGps: number;
      visitorsNoTicketGps: number;
      total: number;
    }>(sarah, "GET", `/events/${ev.id}/presences/summary`);
    expect(summary.status).toBe(200);
    expect(Object.keys(summary.data).sort()).toEqual(
      ["exhibitorsCheckedIn", "total", "visitorsNoTicketGps", "visitorsWithTicketGps"].sort(),
    );
    const { ctx, page } = await open(browser, "sarah@orasso.local", "beton", undefined, 1700);
    await toOrganizerDirect(page);
    const block = page.getByTestId("orga-direct-presents");
    await expect(block).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("orga-direct-presents-total")).toContainText(
      `${summary.data.total} utilisateur${summary.data.total >= 2 ? "s" : ""} d'Orasso présent`,
    );
    await expect(block).toContainText(`Exposants scannés · ${summary.data.exhibitorsCheckedIn}`);
    await expect(block).toContainText(`Visiteurs avec place (GPS) · ${summary.data.visitorsWithTicketGps}`);
    await expect(block).toContainText(`Avec l'appli, sans place (GPS) · ${summary.data.visitorsNoTicketGps}`);
    await shot(page, "direct-presents");
    // Quelqu'un valide sa présence : le canal `presence.changed` relit le résumé sans rien toucher.
    const hugo = await login(VISITORS.far);
    const done = await apiCall(hugo, "POST", `/events/${ev.id}/presence`, {
      lat: ev.lat,
      lng: ev.lng,
      accuracyM: 10,
    });
    if (done.status === 200)
      await expect(block).toContainText(`Avec l'appli, sans place (GPS) · ${summary.data.visitorsNoTicketGps + 1}`, {
        timeout: 20_000,
      });
    else expect([409, 422, 429]).toContain(done.status);
    await ctx.close();
  });

  test("Éditeur, étape Lieu : « Zone de présence (m) », 300 m si vide, bornes 50 à 2000", async ({ browser }) => {
    const ev = await lydia("damien@orasso.local");
    const { ctx, page } = await open(browser, "sarah@orasso.local", "beton", undefined, 1500);
    await toOrganizerDirect(page);
    await page.goto(`/evenement/${ev.id}/modifier?temps=lieu`);
    await afterOpening(page).catch(() => undefined);
    const field = page.getByTestId("wizard-presence-radius");
    await expect(field).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Zone de présence (m)")).toBeVisible();
    await expect(page.getByTestId("wizard-presence-radius-help")).toHaveText("300 m si vide");
    await field.fill("20");
    await expect(page.getByTestId("wizard-presence-radius-problem")).toContainText("entre 50 et 2000");
    await field.fill("5000");
    await expect(page.getByTestId("wizard-presence-radius-problem")).toBeVisible();
    await field.fill("600");
    await expect(page.getByTestId("wizard-presence-radius-problem")).toHaveCount(0);
    await shot(page, "editeur-zone");
    await ctx.close();
  });
});
