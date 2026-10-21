import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Staff côté site (lot 24) : un passionné demande à devenir staff de MéditeSportCar depuis la page de la structure,
// l'organisateur l'accepte dans /orga/<structure>/staff en lui donnant le rôle boutique, puis voit les présences par
// événement et relance ceux qui n'ont pas répondu ; l'invitation de l'organisateur arrive dans Boîte > Demandes.
// Lancer avec le site et l'API sur la base locale du seed (DEV_SKIP_2FA=true pour l'organisateur).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-24-captures/site`;

test("devenir staff : demande, acceptation avec le rôle boutique, présences et relance, invitation", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const pseudo = `Staff_${unique()}`.slice(0, 24);
  await signUpApi(pseudo);

  // Le demandeur, depuis la page publique de la structure.
  const fanCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const fan = await fanCtx.newPage();
  await loginInBrowser(fan, `${pseudo.toLowerCase()}@e2e.orasso.test`, undefined, "/o/meditesportcar");
  await fan.goto("/o/meditesportcar");
  const become = fan.getByTestId("become-staff").getByRole("button", { name: "Devenir staff" });
  await expect(become).toBeVisible();
  await become.click();
  await expect(fan.getByTestId("become-staff")).toContainText("Demande de staff envoyée");
  await fan.screenshot({ path: `${DIR}/01-devenir-staff-demande.png` });

  // L'organisateur : la demande est dans /orga/meditesportcar/staff.
  const orgaCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const orga = await orgaCtx.newPage();
  await loginInBrowser(orga, "damien@orasso.local", undefined, "/orga/meditesportcar/staff");
  await orga.goto("/orga/meditesportcar/staff");
  const requests = orga.getByTestId("staff-requests");
  await expect(requests).toContainText(pseudo);
  const row = requests.getByTestId("staff-request").filter({ hasText: pseudo });
  // Lot 36 : accepter fait entrer dans l'équipe, sans rôle (plus de cases de rôles sur la demande).
  await expect(row.getByLabel("Contrôle des billets")).toHaveCount(0);
  await orga.screenshot({ path: `${DIR}/02-staff-demandes-sable.png` });
  await row.getByRole("button", { name: "Accepter" }).click();

  // Membre actif, sans rôle : les rôles se donnent ensuite (ici le rôle par défaut « Contrôle des billets »).
  const member = orga.getByTestId("staff-members").getByTestId("staff-member").filter({ hasText: pseudo });
  await expect(member).toBeVisible({ timeout: 60_000 });
  await expect(member.getByLabel("Contrôle des billets")).not.toBeChecked();
  await expect(member.getByLabel("Accueil et scan")).not.toBeChecked();
  const admin = await login("damien@orasso.local");
  const sid = await structureId(admin);
  const members = await apiCall<{ userId: string; pseudo: string; status: string; staffRoles: string[] }[]>(
    admin,
    "GET",
    `/structures/${sid}/members`,
  );
  const joined = members.data.find((m) => m.pseudo === pseudo);
  expect(joined).toMatchObject({ status: "active", staffRoles: [] });
  await apiCall(admin, "PATCH", `/structures/${sid}/members/${joined?.userId}`, { staffRoles: ["shop"] });
  await orga.reload();
  await orga.screenshot({ path: `${DIR}/03-staff-membres-sable.png` });

  // Par événement : présences, « jamais répondu » et relance.
  const events = orga.getByTestId("staff-event");
  await expect(events.first()).toBeVisible();
  const salon = events.filter({ hasText: "Salon Argelès" });
  await expect(salon).toBeVisible();
  await expect(salon.getByTestId("staff-discussion-link")).toHaveAttribute(
    "href",
    /communication\?onglet=staff&ouvrir=/,
  );
  await expect(salon.getByTestId("never-answered").first()).toBeVisible();
  await salon.scrollIntoViewIfNeeded();
  await orga.screenshot({ path: `${DIR}/04-staff-presences-sable.png`, fullPage: true });
  // Le rôle boutique s'ajuste pour l'événement seulement.
  const eventMember = salon.getByTestId("staff-event-member").filter({ hasText: pseudo });
  await expect(eventMember.getByLabel("Contrôle des billets")).toBeChecked();
  await eventMember.getByLabel("Accueil et scan").check();
  await eventMember.getByRole("button", { name: "Enregistrer pour l'événement" }).click();
  await expect(salon.getByTestId("staff-event-member").filter({ hasText: pseudo })).toContainText(
    "Rôles ajustés pour cet événement",
  );

  // Invitation de l'organisateur : arrive dans Boîte > Demandes du destinataire, qui l'accepte.
  const invited = `Invite_${unique()}`.slice(0, 24);
  const guest = await signUpApi(invited);
  await orga.goto("/orga/meditesportcar/staff");
  await orga.getByTestId("staff-invite-form").getByLabel("Pseudo ou e-mail du compte").fill(invited);
  await orga.getByTestId("staff-invite-form").getByLabel("Contrôle des billets").check();
  await orga.getByRole("button", { name: "Envoyer l'invitation" }).click();
  await expect(orga.getByTestId("staff-invite-form")).toContainText("Invitation envoyée");
  await expect(orga.getByTestId("staff-invited")).toContainText(invited);
  const summary = await apiCall<{ requests: { staffInvitation: number } }>(guest, "GET", "/me/inbox/summary");
  expect(summary.data.requests.staffInvitation).toBe(1);
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestPage = await guestCtx.newPage();
  await loginInBrowser(guestPage, `${invited.toLowerCase()}@e2e.orasso.test`, undefined, "/app/boite/demandes");
  await guestPage.goto("/app/boite/demandes");
  const card = guestPage.getByTestId("request-staff-invitation");
  await expect(card).toContainText("MéditeSportCar");
  await guestPage.screenshot({ path: `${DIR}/05-invitation-staff-demandes-390.png` });
  await card.getByRole("button", { name: "Accepter" }).click();
  await expect(guestPage.getByTestId("request-staff-invitation")).toHaveCount(0);
  const mine = await apiCall<{ memberships: { structureSlug: string; status: string }[] }>(guest, "GET", "/me");
  expect(mine.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.status).toBe("active");

  // Un staff sans droit d'organisation n'ouvre pas la gestion du staff.
  const julie = await browser.newContext().then((c) => c.newPage());
  await loginInBrowser(julie, "julie@orasso.local", undefined, "/orga/meditesportcar");
  const refused = await julie.goto("/orga/meditesportcar/staff");
  expect(refused?.status()).toBe(403);
  await fanCtx.close();
  await orgaCtx.close();
  await guestCtx.close();
});

async function structureId(cookie: string): Promise<string> {
  const me = await apiCall<{ memberships: { structureSlug: string; structureId: string }[] }>(cookie, "GET", "/me");
  const m = me.data.memberships.find((x) => x.structureSlug === "meditesportcar");
  if (!m) throw new Error("MéditeSportCar absente");
  return m.structureId;
}
