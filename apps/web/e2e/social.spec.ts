import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { addVehicleApi, apiCall, deliverNow, login, loginInBrowser, randomPlate, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Social (lot 17) sur le site : profil d'un autre (public / privé / abonné), véhicule d'un autre, recherche de personnes
// dans Explorer, suivre et demander à suivre (acceptation), Journal avec l'actualité des abonnements, cloche. Avec CAPTURES=1, captures dans
// les deux thèmes, au bureau et sur téléphone, avec le contrôle automatique du système de design.
// Prérequis : site et API lancés sur la base locale avec le seed (Kenji ↔ Léa se suivent, Nina suit Damien, Marc privé suivi par Julie, Théo demande à suivre Marc).
// Lot R6b (D37) : plus d'« ami » ; « Demander à suivre » (compte privé) et l'onglet Demandes remplacent la demande d'ami.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-17-captures/site`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;
const audits: Record<string, Audit> = {};

async function context(browser: Browser, theme: string, view: (typeof VIEWS)[number], cookie?: string) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of (cookie ?? "").split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function shot(page: Page, theme: string, view: string, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

test("social : profils selon l'audience, recherche, demande à suivre, acceptation, Journal", async ({ browser }) => {
  test.setTimeout(300_000);
  const s = unique();
  const alpha = `AlphaPub_${s}`;
  const bravo = `BravoPriv_${s}`;
  const charlie = `Charlie_${s}`;
  const alphaCookie = await signUpApi(alpha);
  const bravoCookie = await signUpApi(bravo);
  await signUpApi(charlie);
  await addVehicleApi(alphaCookie, randomPlate());
  await addVehicleApi(bravoCookie, randomPlate());
  await apiCall(alphaCookie, "PATCH", "/me/profile", { bio: "Passionné d'anciennes", departments: ["66"] });
  await apiCall(bravoCookie, "PATCH", "/me/profile", {
    visibility: "private",
    bio: "secret-de-bravo",
    departments: ["66"],
  });

  const page = await browser.newPage();
  await loginInBrowser(page, `${charlie.toLowerCase()}@e2e.orasso.test`, undefined, "/app");

  // Compte public : profil complet.
  await page.goto(`/u/${alpha}`);
  await expect(page.getByTestId("profil")).toHaveAttribute("data-audience", "public_full");
  await expect(page.getByText("Passionné d'anciennes")).toBeVisible();
  await expect(page.getByTestId("profil-vehicle")).toHaveCount(1);

  // Compte privé : réduit, aucune bio.
  await page.goto(`/u/${bravo}`);
  await expect(page.getByTestId("profil")).toHaveAttribute("data-audience", "public_limited");
  await expect(page.getByText("secret-de-bravo")).toHaveCount(0);
  // Lot R5b (maquette R5.6) : la ligne « Ses photos, … sont pour ses abonnés » ; ses véhicules en marque et modèle.
  await expect(page.getByTestId("profile-private-note")).toContainText(
    "Ses photos, ses sorties, son crew et ses réseaux sont pour ses abonnés.",
  );
  await expect(page.getByTestId("follow-button")).toContainText("Demander à suivre");
  await expect(page.getByTestId("profile-vehicles-private")).toContainText(/\S/);

  // Fiche du véhicule d'un compte public : complète, avec « Autres propriétaires près de chez moi ».
  await page.goto(`/u/${alpha}`);
  await page.getByTestId("profil-vehicle").click();
  await expect(page.getByTestId("vehicule")).toHaveAttribute("data-detailed", "true");
  await expect(page.getByTestId("owners-nearby")).toBeVisible();

  // Recherche de personnes dans Explorer.
  await page.goto("/app/explorer?segment=personnes");
  await expect(page.getByTestId("people-search")).toBeVisible();
  await page.goto(`/app/explorer?segment=personnes&q=${bravo.slice(0, 12)}`);
  const row = page.getByTestId("person-row").filter({ hasText: bravo });
  await expect(row).toBeVisible();
  // Demande à suivre depuis la liste (Bravo est privé).
  // Lot R6b : « Demander à suivre », puis « Demandé » (comme l'appli).
  await row.getByTestId("net-follow").click();
  await expect(page.getByTestId("person-row").filter({ hasText: bravo }).getByTestId("net-requested")).toContainText(
    "Demandé",
  );

  // Bravo accepte dans « Ton réseau », onglet Demandes.
  const bravoPage = await browser.newPage();
  await loginInBrowser(bravoPage, `${bravo.toLowerCase()}@e2e.orasso.test`, undefined, "/app/reseau?liste=demandes");
  const incoming = bravoPage.getByTestId("net-requests");
  await expect(incoming).toContainText(charlie);
  await incoming.getByTestId("net-request-accept").click();
  await expect(bravoPage.getByTestId("net-notice")).toContainText(charlie);

  // Charlie voit maintenant tout de Bravo, et a une notification dans le Journal.
  await page.goto(`/u/${bravo}`);
  await expect(page.getByTestId("profil")).toHaveAttribute("data-audience", "follower");
  await expect(page.getByText("secret-de-bravo")).toBeVisible();
  await expect(page.getByTestId("follow-button")).toContainText("Abonné");
  // Heures calmes (la nuit) : la notification serait reportée à 08:00 ; livrée tout de suite pour la recette.
  deliverNow(`${charlie.toLowerCase()}@e2e.orasso.test`);
  await page.goto("/app/journal");
  await expect(page.getByTestId("journal-item").filter({ hasText: `${bravo} a accepté` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Boîte" }).first()).toBeVisible();

  // Se désabonner : le profil redevient réduit.
  await page.goto(`/u/${bravo}`);
  await page.getByTestId("follow-button").click();
  await page.getByTestId("follow-confirm-yes").click();
  await expect(page.getByTestId("profil")).toHaveAttribute("data-audience", "public_limited");

  // Journal de Léa : l'actualité de Kenji, qu'elle suit (retenues du seed), jamais plus de sept jours en arrière sauf non lues.
  const lea = await browser.newPage();
  await loginInBrowser(lea, "lea@orasso.local", undefined, "/app/journal");
  // Les specs précédentes ajoutent des entrées au Journal de Léa : on cherche l'entrée attendue à travers la pagination
  // (« Plus ancien ») au lieu de supposer qu'elle est sur la première page.
  const kenjiEntry = lea.getByTestId("journal-item").filter({ hasText: "Kenji_66 va à" });
  for (let pageNo = 0; pageNo < 50; pageNo++) {
    await expect(lea.getByTestId("journal")).toBeVisible();
    if ((await kenjiEntry.count()) > 0) break;
    const older = lea.getByRole("link", { name: "Plus ancien" });
    if ((await older.count()) === 0) break;
    await older.click();
    await lea.waitForLoadState("networkidle");
  }
  await expect(kenjiEntry.first()).toBeVisible();
  await lea.close();
  await bravoPage.close();
  await page.close();
});

test("captures du social", async ({ browser }) => {
  test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const nina = await login("nina@orasso.local");
  const lea = await login("lea@orasso.local");
  const julie = await login("julie@orasso.local");
  const marcProfile = (await apiCall<{ vehicles: { id: string }[] }>(nina, "GET", "/users/Marc_66")).data;
  const kenjiProfile = (await apiCall<{ vehicles: { id: string }[] }>(nina, "GET", "/users/Kenji_66")).data;
  const marcVehicle = marcProfile.vehicles[0]?.id;
  const kenjiVehicle = kenjiProfile.vehicles[0]?.id;
  expect(marcVehicle).toBeTruthy();
  expect(kenjiVehicle).toBeTruthy();

  for (const theme of THEMES) {
    for (const view of VIEWS) {
      // Nina (sans lien avec eux) : profil privé réduit, profil public, véhicules, recherche.
      const n = await (await context(browser, theme, view, nina)).newPage();
      await n.goto("/u/Marc_66");
      await shot(n, theme, view.id, "01-profil-prive-reduit");
      await n.goto("/u/Kenji_66");
      await shot(n, theme, view.id, "02-profil-public");
      await n.goto(`/v/${kenjiVehicle}`);
      await shot(n, theme, view.id, "03-vehicule-autre-proprietaires");
      await n.goto(`/v/${marcVehicle}`);
      await shot(n, theme, view.id, "04-vehicule-prive-reduit");
      await n.goto("/app/explorer?segment=personnes&q=ke");
      await shot(n, theme, view.id, "05-explorer-personnes");
      await n.context().close();

      // Damien : Nina parmi ses abonnés, le Journal et la cloche.
      const d = await (await context(browser, theme, view, damien)).newPage();
      await d.goto("/app/reseau?liste=abonnes");
      await shot(d, theme, view.id, "06-reseau-abonnes");
      await d.goto("/app/journal");
      await shot(d, theme, view.id, "07-journal");
      await d.context().close();

      // Julie, abonnée de Marc : voit tout de son profil privé.
      const j = await (await context(browser, theme, view, julie)).newPage();
      await j.goto("/u/Marc_66");
      await shot(j, theme, view.id, "08-profil-prive-vu-par-un-abonne");
      await j.context().close();

      // Léa : l'actualité de Kenji, qu'elle suit, dans le Journal.
      const l = await (await context(browser, theme, view, lea)).newPage();
      await l.goto("/app/journal");
      await shot(l, theme, view.id, "09-journal-actualite-abonnements");
      await l.context().close();
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  const problems = Object.entries(audits).filter(
    ([, a]) =>
      a.primaryButtons > 1 ||
      a.neonAccent > 1 ||
      a.buttonsWithoutIcon.length > 0 ||
      a.greens.length > 0 ||
      a.truncated.length > 0 ||
      a.horizontalScroll,
  );
  console.log("Audit du système de design :", problems.length ? JSON.stringify(problems, null, 2) : "aucun écart");
});
