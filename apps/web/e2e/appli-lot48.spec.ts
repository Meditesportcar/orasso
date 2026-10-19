import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { rotatingCode, sql } from "./helpers/lot48";

// Lot 48, côté appli (version web de recette) : jour J v2. Le QR tournant (`s-qr`) dans ses quatre variantes (zone d'un
// pilote du Salon, emplacement B2 de Sofia, badge presse de Léo, billet du public) et le passage d'un créneau de 20 s avec
// `page.clock` ; le mode staff v2 (`s-staff`, tuiles selon les rôles de Julie) ; le scan d'un code OR2 fabriqué avec le
// secret du kit : OK, puis déjà entré, puis périmé 61 s plus tard ; l'accueil drive (`s-drive`) : plaque tapée
// « GA-662-KS » → OK avec la zone. Deux thèmes, captures à 390 px, audit des règles du système de design.
// Lancer avec APP_URL=http://localhost:8331 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-48-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

/** Erreurs de la console de toutes les pages ouvertes (sans filtre « cannot create file » : point hérité du lot 40). */
const consoleErrors: string[] = [];

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  await page.clock.install();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

/** Un chargement de page rejoue l'ouverture de l'appli (3 s, lot 39) : un toucher la passe. */
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
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page, name: string) {
  const a = await auditPage(page);
  expect(a.horizontalScroll, `${name} : défilement horizontal`).toBe(false);
  expect(a.greens, `${name} : du vert`).toEqual([]);
  expect(a.truncated, `${name} : texte tronqué`).toEqual([]);
  expect(a.buttonsWithoutIcon, `${name} : bouton sans icône`).toEqual([]);
  expect(a.primaryButtons, `${name} : un seul bouton principal`).toBeLessThanOrEqual(1);
  expect(a.neonAccent, `${name} : un seul néon`).toBeLessThanOrEqual(1);
}

const salonId = async () =>
  (await sql<{ id: string }>("select id from events where slug = 'salon-argeles'"))[0]?.id ?? "";

/** Candidature retenue d'un compte du seed (par e-mail et genre). */
async function acceptedApplication(email: string, kind: "vehicle" | "provider" | "media", eventSlug?: string) {
  const rows = await sql<{ id: string }>(
    `select a.id from applications a join "user" u on u.id = a.user_id join events e on e.id = a.event_id
     where u.email = $1 and a.kind = $2 and a.status = 'accepted' and ($3::text is null or e.slug = $3)
     order by e.starts_at limit 1`,
    [email, kind, eventSlug ?? null],
  );
  expect(rows[0], `candidature ${kind} de ${email}`).toBeTruthy();
  return rows[0]?.id ?? "";
}

test("QR tournant : quatre variantes, nouveau code au passage d'un créneau de 20 s (deux thèmes)", async ({
  browser,
}) => {
  test.setTimeout(1_200_000);
  mkdirSync(DIR, { recursive: true });
  // Un pilote du seed retenu au Salon (aujourd'hui) et pas encore entré : son mode jour J est ouvert.
  const [pilot] = await sql<{ id: string; email: string }>(
    `select a.id, u.email from applications a join "user" u on u.id = a.user_id join events e on e.id = a.event_id
     where e.slug = 'salon-argeles' and a.kind = 'vehicle' and a.status = 'accepted' and u.email like 'pilote%'
       and a.zone_id is not null and not exists (select 1 from checkins c where c.application_id = a.id)
     order by u.email desc limit 1`,
  );
  expect(pilot).toBeTruthy();
  const sofiaApp = await acceptedApplication("sofia@orasso.local", "provider", "nocturne-de-canet-2026");
  const leoApp = await acceptedApplication("leo@orasso.local", "media");
  const salon = await salonId();

  for (const theme of THEMES) {
    // 1. Exposant : le vrai kit (secret compris) reçu avec du réseau, le Salon commence dans l'heure.
    {
      const { ctx, page } = await open(browser, theme);
      await signIn(page, pilot?.email ?? "");
      await goto(page, `/jour-j/${pilot?.id}`);
      await expect(page.getByTestId("qr-countdown")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("qr-holder-value")).not.toHaveText("—");
      await expect(page.getByTestId("qr-capture-note")).toBeVisible();
      // Le numéro affiché est celui du créneau courant (secondes Unix / 20, modulo 10 000).
      const number = async () => Number((await page.getByTestId("qr-number").innerText()).replace(/\D/g, ""));
      const slotNow = async () => Math.floor((await page.evaluate(() => Date.now())) / 20_000) % 10_000;
      await expect.poll(async () => (await number()) === (await slotNow())).toBe(true);
      const before = await number();
      await shot(page, `qr-vehicule-${theme}`);
      await audit(page, `qr-vehicule-${theme}`);
      await page.getByTestId("qr-how").click();
      await expect(page.getByText(/Il fabrique un nouveau code toutes les 20 secondes/)).toBeVisible();
      await shot(page, `qr-comment-ca-marche-${theme}`);
      await page.clock.fastForward(20_000);
      await expect.poll(number, { timeout: 10_000 }).toBe((before + 1) % 10_000);
      await ctx.close();
    }

    // 2. Prestataire : emplacement B2 sur la Nocturne (lot 46), même code tournant sur l'écran du QR de stand.
    {
      const { ctx, page } = await open(browser, theme);
      await signIn(page, "sofia@orasso.local");
      await goto(page, `/stand/${sofiaApp}`);
      await expect(page.getByTestId("qr-countdown")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("qr-holder-value")).toHaveText("B2");
      await shot(page, `qr-prestataire-${theme}`);
      await audit(page, `qr-prestataire-${theme}`);
      await ctx.close();
    }

    // 3. Média : badge presse de Léo. Pas d'écran jour J média avant le lot 55 : son kit (réel, secret compris) est
    // posé sur le téléphone pour un événement qui commence dans l'heure, comme le ferait la synchro des kits.
    {
      const leo = await login("leo@orasso.local");
      const pass = await apiCall<{
        passId: string;
        payload: string;
        issuedAt: string;
        eventNo: number;
        otpSecret: string;
        mediaName: string;
      }>(leo, "GET", `/applications/${leoApp}/pass`);
      expect(pass.data.otpSecret).toBeTruthy();
      expect(pass.data.mediaName).toBeTruthy();
      const { ctx, page } = await open(browser, theme);
      await signIn(page, "leo@orasso.local");
      const startsAt = new Date((await page.evaluate(() => Date.now())) + 3_600_000);
      await page.evaluate(
        ({ id, kit, secret }) => {
          localStorage.setItem(`orasso.kit.${id}`, JSON.stringify(kit));
          localStorage.setItem("orasso.kits", JSON.stringify([id]));
          localStorage.setItem(`orasso.otp.${id}`, secret);
        },
        {
          id: leoApp,
          secret: pass.data.otpSecret,
          kit: {
            applicationId: leoApp,
            savedAt: new Date().toISOString(),
            pseudo: "Leo_66",
            status: "accepted",
            vehicleLabel: null,
            zone: null,
            checkedInAt: null,
            day: null,
            multiDay: false,
            event: {
              id: salon,
              slug: "nocturne-de-canet-2026",
              title: "Nocturne de Canet",
              startsAt: startsAt.toISOString(),
              endsAt: new Date(startsAt.getTime() + 4 * 3_600_000).toISOString(),
              timezone: "Europe/Paris",
              addressLine: "Port de Canet",
              postalCode: "66140",
              city: "Canet-en-Roussillon",
              lat: 42.7,
              lng: 3.03,
              outlook: "confirmed",
              cancelled: false,
              instructions: null,
            },
            pass: {
              passId: pass.data.passId,
              payload: pass.data.payload,
              issuedAt: pass.data.issuedAt,
              eventNo: pass.data.eventNo,
            },
            holder: { kind: "media", spotLabel: null, mediaName: pass.data.mediaName },
            weather: null,
          },
        },
      );
      await goto(page, `/jour-j/${leoApp}`);
      await expect(page.getByTestId("qr-countdown")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("qr-holder-value")).toHaveText("Presse");
      await expect(page.getByText(pass.data.mediaName).first()).toBeVisible();
      await shot(page, `qr-media-${theme}`);
      await audit(page, `qr-media-${theme}`);
      await ctx.close();
    }

    // 4. Visiteur : billet gratuit du Salon, « Entrée · Public » (QR statique du billet).
    {
      const pseudo = `Visiteur_${unique()}`.slice(0, 24);
      const visitor = await signUpApi(pseudo);
      const reserved = await apiCall(visitor, "POST", `/events/${salon}/tickets/reserve`, { quantity: 1 });
      expect(reserved.status).toBe(201);
      const { ctx, page } = await open(browser, theme);
      await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
      await goto(page, "/billets");
      await expect(page.getByTestId("qr-holder-value").first()).toHaveText("Public", { timeout: 30_000 });
      await shot(page, `qr-billet-${theme}`);
      await audit(page, `qr-billet-${theme}`);
      await ctx.close();
    }
  }
});

test("mode staff v2 : tuiles selon les rôles, scan d'un OR2 (OK, déjà entré, périmé), accueil drive (deux thèmes)", async ({
  browser,
}) => {
  test.setTimeout(1_200_000);
  mkdirSync(DIR, { recursive: true });
  const salon = await salonId();
  const julie = await login("julie@orasso.local");
  const damien = await login("damien@orasso.local");
  const staffEvents = await apiCall<{ event: { id: string }; roles: string[] }[]>(julie, "GET", "/me/staff-events");
  const roles = staffEvents.data.find((s) => s.event.id === salon)?.roles ?? [];
  expect(roles.length).toBeGreaterThan(0);

  for (const theme of THEMES) {
    // Deux pilotes retenus pas encore entrés : l'un présente son code tournant, l'autre passe à l'accueil drive avec
    // la plaque « GA-662-KS » (posée sur son véhicule pour la recette, rendue ensuite).
    type Entry = {
      passId: string;
      applicationId: string;
      pseudo: string;
      status: string;
      checkedInAt: string | null;
      plate?: string | null;
      zoneCode: string | null;
      kind: string;
    };
    const sync = await apiCall<{ event: { eventNo: number }; entries: Entry[] }>(
      damien,
      "GET",
      `/events/${salon}/staff/sync`,
    );
    const free = sync.data.entries.filter(
      (e) => e.status === "valid" && !e.checkedInAt && e.kind === "vehicle" && e.plate && /^Pilote_\d+$/.test(e.pseudo),
    );
    let scanTarget: { entry: Entry; secret: string } | null = null;
    for (const e of free) {
      const cookie = await login(`pilote${Number(e.pseudo.split("_")[1])}@orasso.local`).catch(() => null);
      if (!cookie) continue;
      const pass = await apiCall<{ otpSecret: string | null }>(cookie, "GET", `/applications/${e.applicationId}/pass`);
      if (pass.data.otpSecret) {
        scanTarget = { entry: e, secret: pass.data.otpSecret };
        break;
      }
    }
    expect(scanTarget).toBeTruthy();
    const driveTarget = free.find((e) => e.passId !== scanTarget?.entry.passId && e.zoneCode);
    expect(driveTarget).toBeTruthy();
    const [vehicle] = await sql<{ id: string; plate: string; plate_normalized: string }>(
      "select v.id, v.plate, v.plate_normalized from vehicles v join applications a on a.vehicle_id = v.id where a.id = $1",
      [driveTarget?.applicationId],
    );
    await sql("update vehicles set plate = 'GA-662-KS', plate_normalized = 'GA662KS' where id = $1", [vehicle?.id]);

    try {
      const { ctx, page } = await open(browser, theme);
      await signIn(page, "julie@orasso.local");
      await goto(page, `/staff/${salon}`);
      await page.getByRole("button", { name: "Synchroniser la liste" }).click();
      await expect(page.getByTestId("staff-tile-list")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Synchronisé à \d+ h \d\d/)).toBeVisible();
      // Tuiles selon les rôles : Scanner (scan, contrôle, super staff), Liste (tous), Placement (placement, super staff).
      const canScan = roles.some((r) => ["scan", "control", "super_staff"].includes(r));
      const canPlace = roles.some((r) => ["placement", "super_staff"].includes(r));
      await expect(page.getByTestId("staff-tile-scan")).toHaveCount(canScan ? 1 : 0);
      await expect(page.getByTestId("staff-tile-placement")).toHaveCount(canPlace ? 1 : 0);
      for (const label of ["Alerte", "Main courante", "Discussion"]) {
        await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
      }
      await shot(page, `staff-entree-${theme}`);
      await audit(page, `staff-entree-${theme}`);

      // Scan d'un code tournant, fabriqué avec le secret du kit à l'heure du téléphone.
      await page.getByTestId("staff-tile-scan").click();
      await expect(page.getByTestId("scan-drive-tile")).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => {
        (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = true;
      });
      const at = await page.evaluate(() => Date.now());
      const code = rotatingCode(scanTarget?.secret ?? "", sync.data.event.eventNo, scanTarget?.entry.passId ?? "", at);
      const scan = (p: string) =>
        page.evaluate((x) => (globalThis as unknown as { __orassoScan: (y: string) => void }).__orassoScan(x), p);
      await scan(code);
      await expect(page.getByText(scanTarget?.entry.pseudo ?? "—").first()).toBeVisible({ timeout: 10_000 });
      await shot(page, `scan-or2-ok-${theme}`);
      // Même code relu 4 s plus tard (après l'anti-rebond de 3 s) : déjà entré.
      // Hors ligne pendant le saut d'horloge : aucune réponse de l'API ne recale l'heure du serveur (en-tête Date).
      await ctx.setOffline(true);
      await page.clock.fastForward(4_000);
      await scan(code);
      await expect(page.getByText("Déjà entré").first()).toBeVisible({ timeout: 10_000 });
      // Capture rejouée 61 s après : périmée.
      await page.clock.fastForward(61_000);
      await scan(code);
      // Relecture : l'écart et le pointage à la main plutôt que « rafraîchis ton écran ».
      await expect(page.getByText(/^Code ancien de 1 min : capture ou téléphone en retard/).first()).toBeVisible({
        timeout: 10_000,
      });
      await shot(page, `scan-or2-perime-${theme}`);
      await ctx.setOffline(false);

      // Accueil drive : la plaque tapée (la caméra et ML Kit n'existent pas dans le navigateur).
      await goto(page, `/staff/${salon}/drive`);
      await page.evaluate(() => {
        (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = true;
      });
      await expect(page.getByTestId("drive-offline")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("drive-typed").fill("GA-662-KS");
      await expect(page.getByTestId("drive-typed")).toHaveValue("GA-662-KS");
      await page.getByTestId("drive-typed").press("Enter");
      await expect(page.getByText(driveTarget?.pseudo ?? "—").first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(driveTarget?.zoneCode ?? "—", { exact: true }).first()).toBeVisible();
      await expect(page.getByTestId("drive-read")).toHaveText("GA-662-KS");
      await shot(page, `drive-ok-${theme}`);
      await page.evaluate(() => {
        (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = false;
      });
      await page.clock.fastForward(3_000);
      await audit(page, `drive-${theme}`);

      // Le pointage `drive` part au serveur.
      await expect
        .poll(
          async () =>
            (
              await sql<{ method: string }>("select method from checkins where application_id = $1", [
                driveTarget?.applicationId,
              ])
            )[0]?.method ?? null,
          { timeout: 90_000, intervals: [3_000] },
        )
        .toBe("drive");
      await ctx.close();
    } finally {
      await sql("update vehicles set plate = $2, plate_normalized = $3 where id = $1", [
        vehicle?.id,
        vehicle?.plate,
        vehicle?.plate_normalized,
      ]);
    }
  }
});

test.afterAll(() => {
  const real = consoleErrors.filter((e) => !/favicon|manifest|Failed to load resource|net::ERR/i.test(e));
  expect(real.slice(0, 5)).toEqual([]);
});
