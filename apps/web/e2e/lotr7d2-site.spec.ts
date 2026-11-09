import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme } from "./helpers";
import { lydia, SLUG, VISITORS, withAccess } from "./helpers/lotr7d2";

// Lot R7d2, site : la fiche pendant l'événement (compteurs, « Votes · N ouverts », présence réservée à l'appli, rien
// après la fin), les présents de l'organisateur au Jour J (nombres seulement) et la zone de présence de l'éditeur.
// API et site lancés sur la base seedée, horloge simulée dans les heures du Lydia.
test.use({ locale: "fr-FR", timezoneId: "Europe/Paris" });

const onSite = (l: { onSiteCount: number | null; acceptedCount: number | null }) =>
  `${l.onSiteCount} sur place, sur ${l.acceptedCount} ${(l.acceptedCount ?? 0) >= 2 ? "retenues" : "retenue"}`;

test("fiche : sans compte, compteurs sans bouton de vote ni invitation GPS", async ({ page }) => {
  const ev = await lydia(null);
  test.skip(ev.live.phase !== "running", "Le Lydia n'est pas en cours (horloge simulée).");
  await page.goto(`/e/${SLUG}`);
  await expect(page.getByTestId("event-live")).toBeVisible();
  await expect(page.getByTestId("event-live-phase")).toContainText(/En cours/);
  await expect(page.getByTestId("event-live-onsite")).toContainText(onSite(ev.live));
  await expect(page.getByTestId("event-votes")).toHaveCount(0);
  await expect(page.getByTestId("presence-app-only")).toHaveCount(0);
});

for (const theme of ["beton", "sable"] as const) {
  test(`fiche connectée (${theme}) : « Votes · N ouverts » une fois entré, présence GPS réservée à l'appli`, async ({
    page,
  }) => {
    const ev = await lydia("damien@orasso.local");
    test.skip(ev.live.phase !== "running", "Le Lydia n'est pas en cours (horloge simulée).");
    await setTheme(page, theme);
    await loginInBrowser(page, "damien@orasso.local", undefined, `/e/${SLUG}`);
    await page.goto(`/e/${SLUG}`);
    await expect(page.getByTestId("event-live-onsite")).toContainText(onSite(ev.live));
    if (ev.live.votesOpen > 0) {
      const votes = page.getByTestId("event-votes");
      await expect(votes).toContainText(`Votes · ${ev.live.votesOpen}`);
      await expect(votes).toHaveAttribute("href", `/app/vote/${SLUG}`);
    }
    await expect(page.getByTestId("presence-app-only")).toHaveCount(0);

    const v = await lydia(VISITORS.far);
    if (v.live.myPresence === null) {
      await page.context().clearCookies();
      await setTheme(page, theme);
      await loginInBrowser(page, VISITORS.far, undefined, `/e/${SLUG}`);
      await page.goto(`/e/${SLUG}`);
      await expect(page.getByTestId("presence-app-only")).toHaveText("Depuis l'appli, valide ta présence sur place");
      await expect(page.getByTestId("event-votes")).toHaveCount(0);
    }
  });
}

test("fiche : la ligne GPS suit l'accès (fermé au public, billetterie externe : aucune ligne)", async ({ page }) => {
  const ev = await lydia(VISITORS.far);
  test.skip(ev.live.phase !== "running" || ev.live.myPresence !== null, "Lydia hors des heures ou déjà présent.");
  await loginInBrowser(page, VISITORS.far, undefined, `/e/${SLUG}`);
  for (const access of ["closed", "paid_external"]) {
    await withAccess(access, async () => {
      await page.goto(`/e/${SLUG}`);
      await expect(page.getByTestId("event-live")).toBeVisible();
      await expect(page.getByTestId("presence-app-only"), access).toHaveCount(0);
    });
  }
  await page.goto(`/e/${SLUG}`);
  await expect(page.getByTestId("presence-app-only")).toBeVisible();
});

test("fiche : passage à la fin sur le même écran, compteurs et lignes du direct retirés", async ({ page }) => {
  const ev = await lydia(null);
  test.skip(ev.live.phase !== "running", "Le Lydia n'est pas en cours (horloge simulée).");
  const endsAt = await apiCall<{ endsAt: string }>(null, "GET", `/events/by-slug/${SLUG}`).then((r) => r.data.endsAt);
  // L'horloge de la page est posée 3 s avant la fin avant le chargement : les minuteurs de l'écran sont les siens.
  await page.clock.install({ time: new Date(new Date(endsAt).getTime() - 3_000) });
  await page.goto(`/e/${SLUG}`);
  await expect(page.getByTestId("event-live")).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId("event-live")).toHaveCount(0);
  await expect(page.getByText(/sur place, sur \d+ retenue/)).toHaveCount(0);
});

test("fiche d'un événement fini : ni compteurs ni présence", async ({ page }) => {
  const cookie = await login("damien@orasso.local");
  const past = await apiCall<{ event: { slug: string } }[]>(cookie, "GET", "/me/applications?scope=past");
  const slug = past.data.map((a) => a.event.slug).find((s) => s !== SLUG);
  test.skip(!slug, "Aucun événement passé dans le seed.");
  await page.goto(`/e/${slug}`);
  await expect(page.getByTestId("event-hero")).toBeVisible();
  await expect(page.getByTestId("event-live")).toHaveCount(0);
  await expect(page.getByText(/sur place, sur \d+ retenue/)).toHaveCount(0);
});

test("organisateur : Présents au Jour J (nombres, jamais une liste) et zone de présence de l'éditeur", async ({
  page,
}) => {
  const ev = await lydia("damien@orasso.local");
  const sarah = await login("sarah@orasso.local");
  const s = await apiCall<{
    exhibitorsCheckedIn: number;
    visitorsWithTicketGps: number;
    visitorsNoTicketGps: number;
    total: number;
  }>(sarah, "GET", `/events/${ev.id}/presences/summary`);
  expect(s.status).toBe(200);
  await loginInBrowser(page, "sarah@orasso.local", undefined, "/app");
  const base = `/orga/${ev.structure.slug}/e/${ev.id}`;
  await page.goto(`${base}/jour-j`);
  const block = page.getByTestId("presents");
  await expect(block).toBeVisible();
  await expect(page.getByTestId("presents-total")).toContainText(`${s.data.total} utilisateur`);
  await expect(page.getByTestId("presents-exhibitors")).toHaveText(`Exposants scannés · ${s.data.exhibitorsCheckedIn}`);
  await expect(page.getByTestId("presents-ticket")).toHaveText(
    `Visiteurs avec place (GPS) · ${s.data.visitorsWithTicketGps}`,
  );
  await expect(page.getByTestId("presents-noticket")).toHaveText(
    `Avec l'appli, sans place (GPS) · ${s.data.visitorsNoTicketGps}`,
  );
  await expect(block.locator("li")).toHaveCount(3);

  await page.goto(`${base}/modifier?temps=lieu`);
  const field = page.getByTestId("wizard-presence-radius").or(page.getByLabel("Zone de présence (m)")).first();
  await expect(field).toBeVisible();
  await expect(page.getByText("300 m si vide")).toBeVisible();
  await field.fill("20");
  await expect(page.getByText(/entre 50 et 2000/)).toBeVisible();
  await field.fill("600");
  await expect(page.getByText(/entre 50 et 2000/)).toHaveCount(0);
});
