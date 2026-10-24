import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  login,
  loginInBrowser,
  MOBILE,
  randomPlate,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot M4, côté site (le site raccord) : la fiche événement (bande de l'organisateur fixée en haut, créneau strict des
// exposants jamais montré au public, aucun horaire « conseillé », « Ta place » pour l'inscrit, « Écrire à » avec
// l'étiquette « À propos de »), la candidature (« Suivre » cochée d'office) et l'Explorer (tris « Nouveautés » et
// « Places restantes », « Où chercher ? » depuis le lot R2). Béton et Sable, 390 et 1 280 px. `M4_PHASE=avant` : captures seules (paires avant | après).
// Lancer avec l'API et le site sur la base seedée.
const PHASE = process.env.M4_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m4-captures/site-${PHASE}`;
const AFTER = PHASE !== "avant";
const DESKTOP = { width: 1280, height: 900 } as const;
const SIZES = [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const;
const EXHIBITORS = { from: "17:00", to: "17:45", strict: true, note: "Entrée côté capitainerie." };

async function eventIn(damien: string, days: number, title: string) {
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
    description: "Événement de recette du lot M4 (site).",
    arrivals: { exhibitors: EXHIBITORS, public: { from: "18:30", to: null, strict: false, note: null } },
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return { ...created.data, title };
}

/** Ouvre une feuille de l'Explorer : le clic n'a d'effet qu'une fois la page hydratée, on le répète jusqu'à la fenêtre. */
async function openSheet(page: Page, pill: string, sheet: string) {
  await expect(async () => {
    await page.getByTestId(pill).click();
    await expect(page.getByTestId(sheet)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
}

test("Lot M4, site : fiche, « Ta place », écrire avec le contexte, candidature, Explorer", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const id = unique();
  const ev = await eventIn(damien, 6, `M4 Site ${id}`.slice(0, 34));
  const open = await eventIn(damien, 9, `M4 Site ouverte ${id}`.slice(0, 34));
  const pseudo = `SiteM4_${id}`.slice(0, 24);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"] });
  const vehicleId = await addVehicleApi(cookie, randomPlate());
  const applied = await apiCall<{ id: string }[]>(cookie, "POST", `/events/${ev.id}/applications`, {
    vehicleIds: [vehicleId],
    rulesAccepted: true,
    followStructure: true,
    arrivalSeen: true,
  });
  expect(applied.status).toBe(201);
  const appId = applied.data[0]?.id ?? "";
  expect(
    (await apiCall(damien, "POST", `/events/${ev.id}/applications/${appId}/decide`, { decision: "accept" })).status,
  ).toBe(200);

  for (const theme of ["beton", "sable"] as const) {
    for (const [size, viewport] of SIZES) {
      // 1. Public (sans compte) : la fiche, sans créneau des exposants ni horaire « conseillé ».
      const anon = await browser.newContext({ viewport });
      const page = await anon.newPage();
      await setTheme(page, theme);
      await page.goto(`/e/${open.slug}`);
      await expect(page.getByTestId("event-hero")).toBeVisible({ timeout: 30_000 });
      await shot(page, `fiche-public-${theme}-${size}`);
      if (AFTER) {
        await expect(page.getByTestId("org-bar")).toContainText("MéditeSportCar");
        await expect(page.getByText(/17 h 45|capitainerie/)).toHaveCount(0);
        await expect(page.getByText(/conseillé/i)).toHaveCount(0);
        await audit(page);
      }
      await anon.close();

      // 2. L'exposant retenu : « Ta place » avec son créneau ; la bande reste en haut ; écrire avec le contexte.
      const ctx = await browser.newContext({ viewport });
      const mine = await ctx.newPage();
      await setTheme(mine, theme);
      await loginInBrowser(mine, email, undefined, `/e/${ev.slug}`);
      await expect(mine.getByTestId("event-hero")).toBeVisible({ timeout: 30_000 });
      await shot(mine, `fiche-inscrit-${theme}-${size}`);
      if (AFTER) {
        await expect(mine.getByTestId("my-place")).toContainText("Ta place");
        await expect(mine.getByTestId("my-place-arrival")).toContainText("Arrivée exposants 17 h – 17 h 45 (strict)");
        await mine.mouse.wheel(0, 1500);
        await mine.waitForTimeout(300);
        const bar = await mine.getByTestId("org-bar").boundingBox();
        expect(bar?.y ?? 99).toBeLessThan(5);
        await shot(mine, `fiche-defile-${theme}-${size}`);
        await mine.getByTestId("write-organizer").scrollIntoViewIfNeeded();
        await expect(mine.getByTestId("write-about")).toContainText(ev.title);
        await shot(mine, `ecrire-${theme}-${size}`);
        if (theme === "beton" && size === "1280") {
          await mine.locator("#write-body").fill("Je peux venir avec une remorque ?");
          await mine.getByTestId("write-organizer").getByTestId("contact-organizer").click();
          await mine.waitForURL(/\/app\/boite\/[0-9a-f-]{36}$/);
          await expect(mine.getByTestId("message-about")).toContainText(ev.title);
          await shot(mine, `conversation-${theme}-${size}`);
        }
      }

      // 3. La candidature : « Suivre MéditeSportCar » cochée d'office, newsletter non cochée.
      await mine.goto(`/e/${open.slug}/candidater`);
      await expect(mine.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
      await shot(mine, `candidater-${theme}-${size}`);
      if (AFTER) {
        await mine.getByRole("button", { name: "Continuer" }).click();
        await mine.getByLabel("J'ai lu le règlement de l'événement et je l'accepte.").check();
        await expect(mine.getByTestId("arrival-seen")).toContainText("17 h – 17 h 45 (strict)");
        await mine.getByTestId("arrival-seen").getByRole("checkbox").first().check();
        await mine.getByRole("button", { name: "Continuer" }).click();
        await shot(mine, `candidater-suivre-${theme}-${size}`);
        await expect(mine.getByLabel(/Suivre MéditeSportCar/)).toBeChecked();
        await expect(mine.getByLabel(/newsletter/i)).not.toBeChecked();
      }

      // 4. L'Explorer du site (adapté au lot R2) : le tri « Nouveautés » dans sa feuille, puis « Ailleurs » et le retour à
      // « Mon coin » dans « Où chercher ? ».
      await mine.goto("/app/explorer");
      await expect(mine.getByTestId("explorer-head")).toBeVisible({ timeout: 30_000 });
      await shot(mine, `explorer-${theme}-${size}`);
      if (AFTER && theme === "beton") {
        await mine.goto("/app/explorer?segment=evenements&tri=nouveautes&autour=partout");
        await expect(mine.getByText(open.title).first()).toBeVisible({ timeout: 30_000 });
        await expect(mine.getByTestId("sort-open")).toContainText("Nouveautés");
        await openSheet(mine, "sort-open", "sort-sheet");
        await expect(mine.getByTestId("sort-recent")).toHaveAttribute("aria-current", "true");
      }
      if (AFTER) {
        await mine.goto("/app/explorer?segment=evenements&autour=ailleurs&ailleurs=75");
        await expect(mine.getByTestId("around-open")).toContainText("(75)", { timeout: 30_000 });
        await expect(mine.getByTestId("around-open")).toHaveAttribute("data-set", "true");
        await expect(mine.getByTestId("sort-line")).toContainText("(75)");
        await shot(mine, `explorer-ailleurs-${theme}-${size}`);
        await openSheet(mine, "around-open", "where-sheet");
        await mine.getByTestId("around-mine").click();
        await mine.getByTestId("where-apply").click();
        // Revenu sur ses réglages habituels (Mon coin) : la pastille repasse en contour.
        await expect(mine.getByTestId("around-open")).toContainText("Mon coin", { timeout: 30_000 });
        await expect(mine.getByTestId("around-open")).not.toHaveAttribute("data-set", "true");
      }
      await ctx.close();
    }
  }
});
