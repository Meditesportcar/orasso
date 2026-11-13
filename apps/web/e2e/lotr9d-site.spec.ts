import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
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

// Lot R9d, côté site : l'Activité de la structure (la cloche de l'organisateur) et les Messages (la bulle). Damien_66 est
// propriétaire de MéditeSportCar (seed « Activité de la structure » : deux candidatures à trier sur la Nocturne, une mention
// de Kenji_66, un commentaire de Lea_11, la demande de collaboration de Kenji_66, une demande de staff). Vérifie : la page
// `/orga/<structure>/activite` (chips, « Demandes · N », lignes), le filtre « À trier », la pastille de la barre latérale,
// « Messages » (titre, « Nouveau message » et ses deux lignes), la cloche personnelle sans rien de la structure.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9d-captures/apres/recette-site`;
const SLUG = "meditesportcar";
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["beton", "sable"] as const) {
  for (const viewport of [MOBILE, { width: 1280, height: 800 }] as const) {
    test(`Activité de la structure et Messages (${theme}, ${viewport.width} px)`, async ({ browser }) => {
      test.setTimeout(180_000);
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, `/orga/${SLUG}/activite`);
      await page.goto(`/orga/${SLUG}/activite`);
      await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
      // Les cinq chips, dans l'ordre de la maquette.
      const chips = page.locator("nav.sact__chips a");
      await expect(chips).toHaveText(["Tout", "À trier", "Mentions", "Commentaires", "Collaborations"]);
      // La ligne « Demandes · N » (staff et collaboration) et la ligne « candidatures à trier ».
      await expect(page.getByTestId("sact-requests-row")).toContainText(/Demandes · \d+/);
      await expect(
        page
          .getByTestId("activity-row")
          .filter({ hasText: /candidatures? à trier/ })
          .first(),
      ).toBeVisible();
      await shot(page, `activite-${theme}-${viewport.width}`);

      // Le filtre « À trier » ne garde que les candidatures.
      await page.getByTestId("sact-chip-triage").click();
      await page.waitForURL((url) => url.searchParams.get("filtre") === "triage");
      const rows = page.getByTestId("activity-row");
      await expect(rows.first()).toContainText(/à trier/);
      await expect(rows.filter({ hasNotText: /à trier/ })).toHaveCount(0);

      // La ligne mène au tri de l'événement.
      await rows.first().locator("a").click();
      await page.waitForURL(/\/orga\/meditesportcar\/e\/[^/]+\/candidatures/);

      // Messages : le titre, « Nouveau message » et ses deux lignes.
      await page.goto(`/orga/${SLUG}/communication`);
      await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Nouveau message" }).click();
      await expect(page.getByTestId("comm-new-group")).toContainText("Message groupé");
      await expect(page.getByTestId("comm-new-staff")).toContainText("Discussion de staff");
      await shot(page, `messages-${theme}-${viewport.width}`);

      // La cloche personnelle ne montre rien de la structure.
      await page.goto("/app/activite");
      await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
      await expect(page.getByText(/candidatures? à trier/)).toHaveCount(0);
      await ctx.close();
    });
  }
}

async function structureId(): Promise<string> {
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(
    await login("damien@orasso.local"),
    "GET",
    "/me",
  );
  const p = me.data.personas.find((x) => x.kind === "organizer" && x.label.includes("MéditeSportCar"));
  if (!p) throw new Error("Structure introuvable");
  return p.id;
}

// « Vu » en échec : la page se rafraîchit quand même à l'arrivée d'une candidature (la relecture ne dépend pas du POST), et le
// « vu » est retenté après la lecture suivante (une fois le POST rétabli, le compteur de non-vus tombe à zéro).
test("POST /seen en échec : la page se rafraîchit quand même, le vu est retenté ensuite", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, `/orga/${SLUG}/activite`);
  let failing = true;
  await page.route("**/api/structures/*/activity/seen", (route) => (failing ? route.abort() : route.continue()));
  await page.goto(`/orga/${SLUG}/activite`);
  await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
  const lines = page.getByTestId("activity-row").filter({ hasText: /candidatures? à trier/ });
  await expect(lines.first()).toBeVisible();
  const before = await lines.first().innerText();
  // Une nouvelle candidature arrive pendant que la page est ouverte : la ligne se met à jour sans rechargement manuel.
  const nocturne = await apiCall<{ id: string }>(
    await login("damien@orasso.local"),
    "GET",
    "/events/by-slug/nocturne-de-canet-2026",
  );
  const cookie = await signUpApi(`Cand_${unique()}`);
  const vehicle = await addVehicleApi(cookie, randomPlate());
  // La Nocturne demande de cocher « J'ai vu » sous l'horaire d'arrivée des exposants.
  const applied = await apiCall(cookie, "POST", `/events/${nocturne.data.id}/applications`, {
    vehicleIds: [vehicle],
    rulesAccepted: true,
    followStructure: true,
    newsletterOptIn: false,
    companions: 0,
    arrivalSeen: true,
  });
  expect(applied.status).toBe(201);
  await expect.poll(async () => lines.first().innerText(), { timeout: 30_000 }).not.toBe(before);
  // Le POST est rétabli : la lecture suivante repose le « vu ».
  failing = false;
  await page.reload();
  const summary = async () =>
    (
      await apiCall<{ unseen: number }>(
        await login("damien@orasso.local"),
        "GET",
        `/structures/${await structureId()}/activity/count`,
      )
    ).data.unseen;
  await expect.poll(summary, { timeout: 30_000 }).toBe(0);
  await ctx.close();
});
