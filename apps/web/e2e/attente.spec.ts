import { expect, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  login,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";

// Liste d'attente : désistement d'un retenu → place offerte au premier de la liste (compte à rebours, acceptation,
// QR) ; l'organisateur change l'ordre de la liste d'attente avec les flèches.
test("place libérée à accepter et liste d'attente triable", async ({ browser }) => {
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer, { capacity: 1 });
  const suffix = unique();
  const make = async (letter: string) => {
    const pseudo = `${letter}_${suffix}`;
    const cookie = await signUpApi(pseudo);
    const applicationId = await applyApi(cookie, event.id, await addVehicleApi(cookie, randomPlate()));
    return { pseudo, cookie, applicationId };
  };
  const first = await make("P");
  const second = await make("Q");
  const third = await make("R");
  await decideApi(organizer, event.id, first.applicationId, "accept");
  await decideApi(organizer, event.id, second.applicationId, "waitlist");
  await decideApi(organizer, event.id, third.applicationId, "waitlist");

  // Ordre de la liste d'attente : Q puis R ; l'organisateur remonte R.
  const orga = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const orgaPage = await orga.newPage();
  await loginInBrowser(orgaPage, "damien@orasso.local", SEED_PASSWORD, "/app/acces");
  await orgaPage.goto(`/orga/meditesportcar/e/${event.id}/candidatures?vue=attente`);
  const rows = orgaPage.getByTestId("waitlist-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(second.pseudo);
  await expect(orgaPage.getByTestId("counters")).toHaveAttribute("data-live", "on");
  await rows
    .nth(1)
    .getByRole("button", { name: `Monter ${third.pseudo}` })
    .click();
  await expect(rows.first()).toContainText(third.pseudo);
  const ordered = await apiCall<{ items: { applicant: { pseudo: string } }[] }>(
    organizer,
    "GET",
    `/events/${event.id}/applications?status=waitlisted&sort=waitlist_rank`,
  );
  expect(ordered.data.items.map((i) => i.applicant.pseudo)).toEqual([third.pseudo, second.pseudo]);

  // Le premier de la liste (R) ouvre « Accès » ; le retenu P se désiste ; l'offre arrive en direct.
  const fanR = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageR = await fanR.newPage();
  await loginInBrowser(pageR, `${third.pseudo.toLowerCase()}@e2e.orasso.test`);
  await expect(pageR.getByTestId("application").first()).toHaveAttribute("data-status", "waitlisted");
  await expect(pageR.getByTestId("application").first()).toContainText("Liste d'attente");

  const fanP = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageP = await fanP.newPage();
  await loginInBrowser(pageP, `${first.pseudo.toLowerCase()}@e2e.orasso.test`);
  await expect(pageP.getByTestId("pass-qr")).toBeVisible();
  pageP.once("dialog", (dialog) => dialog.accept());
  await pageP.getByRole("button", { name: "Me désister" }).click();
  await expect(pageP.getByTestId("application").first()).toHaveAttribute("data-status", "withdrawn");

  const card = pageR.getByTestId("application").first();
  await expect(card).toHaveAttribute("data-status", "offered", { timeout: 20_000 });
  await expect(card.getByText("Une place s'est libérée")).toBeVisible();
  await expect(card.getByTestId("countdown")).toContainText(/\d+ h|\d+ min/);
  await card.getByRole("button", { name: "Accepter la place" }).click();
  await expect(card).toHaveAttribute("data-status", "accepted", { timeout: 20_000 });
  await expect(pageR.getByTestId("pass-qr")).toBeVisible();

  await orga.close();
  await fanR.close();
  await fanP.close();
});
