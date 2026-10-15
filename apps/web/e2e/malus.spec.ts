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
  signUpApi,
  simulateSettle,
  unique,
} from "./helpers";

// Carnet de route : un retenu absent sans désistement prend un malus à J+2, il peut le contester ; l'organisateur
// accepte et le malus est annulé.
test("malus à J+2 et contestation dans le carnet de route", async ({ browser }) => {
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer);
  const pseudo = `Absent_${unique()}`;
  const cookie = await signUpApi(pseudo);
  const applicationId = await applyApi(cookie, event.id, await addVehicleApi(cookie, randomPlate()));
  await decideApi(organizer, event.id, applicationId, "accept");

  simulateSettle(event.slug);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, undefined, "/app/acces?vue=passes");
  const card = page.getByTestId("application").first();
  await expect(card.getByTestId("points")).toContainText("-10 pts");
  await expect(page.getByTestId("season-points")).toContainText("-10 pts");
  await card.getByLabel(/Contester ce malus/).fill("J'étais sur place, mon QR n'a pas été lu.");
  await card.getByRole("button", { name: "Contester le malus" }).click();
  await expect(card.getByText("Contesté")).toBeVisible();

  // L'organisateur accepte la contestation : le malus est annulé.
  const contests = await apiCall<{ id: string }[]>(organizer, "GET", `/events/${event.id}/malus-contests`);
  const contestId = contests.data[0]?.id;
  expect(contestId).toBeTruthy();
  const decided = await apiCall(organizer, "POST", `/malus-contests/${contestId}/decide`, { decision: "accept" });
  expect(decided.status).toBe(200);
  await page.goto("/app/acces?vue=passes");
  await expect(page.getByTestId("season-points")).toContainText("0 pts");
  await context.close();
});
