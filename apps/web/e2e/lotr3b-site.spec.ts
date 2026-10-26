import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  type Cookie,
  type CreatedEvent,
  login,
  loginInBrowser,
  MOBILE,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R3b (retours de Damien du 24/10), côté site (le site raccord) :
//   - (10) l'année s'écrit quand l'événement n'est pas dans l'année en cours : carte de la liste d'`/app/explorer`,
//     page de l'événement ;
//   - (11) « Où chercher ? » : un seul choix actif à chaque transition ;
//   - (14) Mes sorties > Passées : la sortie ouvre sa fiche, « Événement terminé », sans candidature ;
//   - (16) « Rejoins ou crée un crew » du profil : la page « Rejoindre un crew » (crews du coin, recherche), « Créer un
//     crew » en second ; « Demande envoyée » gardée après un rechargement (l'état vient de l'API).
// Béton et Sable, 390 et 1 280 px. Lancer avec l'API et le site sur la base seedée. Aucune date en dur.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r3b-captures/site`;
const DESKTOP = { width: 1280, height: 900 } as const;
const SIZES = [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const;
const NEXT_YEAR = new Date().getFullYear() + 1;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.brokenWords).toEqual([]);
}

async function openSheet(page: Page, pill: string, sheet: string) {
  await expect(async () => {
    await page.getByTestId(pill).click();
    await expect(page.getByTestId(sheet)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function nextYearEvent(orga: Cookie): Promise<CreatedEvent> {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(orga, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  if (!structureId) throw new Error("Structure MéditeSportCar introuvable : le seed a-t-il tourné ?");
  const title = `Annee site ${unique()}`;
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

const WHERE = ["around-me", "around-mine", "around-elsewhere", "around-all"] as const;
async function onlyChecked(page: Page, id: (typeof WHERE)[number]) {
  for (const other of WHERE) {
    const input = page.getByTestId(other).locator("input[type=radio]");
    await (other === id ? expect(input).toBeChecked() : expect(input).not.toBeChecked());
  }
  await expect(page.locator('[data-testid="around-sheet"] input[type=radio]:checked')).toHaveCount(1);
}

test("site R3b : année des dates, un seul lieu, sorties passées, rejoindre un crew", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const event = await nextYearEvent(await login("damien@orasso.local"));
  const pseudo = `R3bs${unique()}`.slice(0, 20);
  const newcomerCookie = await signUpApi(pseudo);
  const newcomerId = (await apiCall<{ user: { id: string } }>(newcomerCookie, "GET", "/me")).data.user.id;
  const newcomer = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  let first = true;

  for (const theme of ["beton", "sable"] as const) {
    for (const [size, viewport] of SIZES) {
      const tag = `${theme}-${size}`;
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");

      // --- (10) L'année sur la carte de la liste et sur la page de l'événement -----------------------------------
      await page.goto(`/app/explorer?segment=evenements&autour=partout&q=${encodeURIComponent(event.title)}`);
      const tile = page.getByTestId("event-tile").filter({ hasText: event.title });
      await expect(tile).toBeVisible({ timeout: 30_000 });
      await expect(tile.getByTestId("event-tile-date")).toContainText(String(NEXT_YEAR));
      await audit(page);
      // Tour 2 : la ligne de date de la carte, au-dessus de la barre flottante, pour la capture.
      await tile.getByTestId("event-tile-date").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await shot(page, `01-explorer-annee-${tag}`);
      await page.goto(`/e/${event.slug}`);
      await expect(page.getByText(new RegExp(`14 mars ${NEXT_YEAR}`)).first()).toBeVisible({ timeout: 30_000 });
      await shot(page, `02-evenement-annee-${tag}`);

      // --- (11) « Où chercher ? » : un seul choix actif --------------------------------------------------------
      await page.goto("/app/explorer?segment=evenements");
      await openSheet(page, "around-open", "where-sheet");
      for (const id of [
        "around-me",
        "around-elsewhere",
        "around-mine",
        "around-elsewhere",
        "around-all",
        "around-me",
      ] as const) {
        await page.getByTestId(id).click();
        await onlyChecked(page, id);
      }
      await shot(page, `03-ou-chercher-${tag}`);

      // --- (14) Passées : la sortie ouvre sa fiche, terminée -------------------------------------------------
      await page.goto("/app/sorties?vue=passes");
      const past = page.getByTestId("application").filter({ hasText: "Béziers Night" });
      await expect(past).toBeVisible({ timeout: 30_000 });
      await past.getByTestId("application-open").click();
      await expect(page).toHaveURL(/\/e\/beziers-night/, { timeout: 30_000 });
      await expect(page.getByText("Événement terminé").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("link", { name: /^Candidater/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Candidater/ })).toHaveCount(0);
      await shot(page, `04-fiche-passee-${tag}`);
      await ctx.close();

      // --- (16) Rejoindre un crew d'abord ; la demande reste « envoyée » -----------------------------------------
      const n = await browser.newContext({ viewport });
      const np = await n.newPage();
      await setTheme(np, theme);
      await loginInBrowser(np, newcomer, undefined, `/u/${encodeURIComponent(pseudo)}`);
      await expect(np.getByTestId("hub-crew")).toHaveAttribute("href", "/app/crews/rejoindre", { timeout: 30_000 });
      await np.getByTestId("hub-crew").click();
      await expect(np).toHaveURL(/\/app\/crews\/rejoindre/);
      const near = np.getByTestId("suggest-crews");
      await expect(near).toBeVisible({ timeout: 30_000 });
      await expect(np.getByTestId("crew-join-create").getByTestId("crew-new")).toBeVisible();
      const row = near.getByTestId("crew-row").first();
      if (first) {
        await row.getByTestId("crew-join").click();
        // Lot R5c2 (R5.8) : « Rejoindre » ouvre la fenêtre avec un mot pour le chef (facultatif) avant d'envoyer.
        await np.getByTestId("crew-request-send").click();
        await expect(row.getByTestId("crew-requested")).toBeVisible({ timeout: 30_000 });
        first = false;
      }
      await np.reload();
      await expect(
        np.getByTestId("suggest-crews").getByTestId("crew-row").first().getByTestId("crew-requested"),
      ).toBeVisible({
        timeout: 30_000,
      });
      await audit(np);
      await shot(np, `05-rejoindre-crew-${tag}`);
      await np.goto("/app/crews/rejoindre?q=drift");
      await expect(np.getByTestId("crew-results")).toBeVisible({ timeout: 30_000 });
      await shot(np, `06-rejoindre-crew-recherche-${tag}`);
      await n.close();
    }
  }

  // Tour 2 : la demande annulée (fiche du crew, autre appareil) revient à « Rejoindre » au chargement suivant.
  const near = await apiCall<{ items: { id: string; requested: boolean }[] }>(
    newcomerCookie,
    "GET",
    "/crews/search?departments=66&limit=6",
  );
  const asked = near.data.items.find((c) => c.requested);
  expect(asked).toBeTruthy();
  expect((await apiCall(newcomerCookie, "DELETE", `/crews/${asked?.id}/members/${newcomerId}`)).status).toBe(204);
  const n = await browser.newContext({ viewport: MOBILE });
  const np = await n.newPage();
  await loginInBrowser(np, newcomer, undefined, "/app/crews/rejoindre");
  await expect(np.getByTestId("suggest-crews").getByTestId("crew-row").first().getByTestId("crew-join")).toBeVisible({
    timeout: 30_000,
  });
  await expect(np.getByTestId("crew-requested")).toHaveCount(0);
  await n.close();
});
