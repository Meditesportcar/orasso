import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, unique } from "./helpers";
import { parisDay, type R5Account, r5Crew, r5Outing } from "./lotr5c2-setup";
import { RELAIS } from "./relais";

// Lot R5c2 (appli, version web compilée) : la page du crew à onglets (chef, membre), « Proposer une sortie » avec le
// réglage oui et non, les réponses, les réglages du crew, la vitrine d'un non-membre et sa demande avec un message, et
// la demande avec un message depuis « Rejoindre un crew ». Béton et Sable à 390 px ; quelques vues à 384 px (Pixel de
// Damien). Lancer avec APP_URL=http://localhost:<port de l'appli>.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5c2-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, who: R5Account, theme: string, width = 390): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(who.email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return page;
}

async function openCrew(page: Page, slug: string, extra = "") {
  await page.goto(`/crew/${slug}${extra}`);
  await skipOpening(page);
  await expect(page.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
}

/** Fait défiler la page de l'appli (défilement interne de React Native Web). */
async function scrollDown(page: Page, px = 600) {
  const { width, height } = page.viewportSize() ?? { width: 390, height: 844 };
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, px);
  await page.waitForTimeout(400);
}

test("appli : page du crew, sorties, réglages, vitrine et demande avec message", async ({ browser }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  for (const theme of ["beton", "sable"] as const) {
    const crew = await r5Crew(unique());
    const watch = (p: Page) =>
      p.on("console", (m) => {
        if (m.type() === "error") errors.push(`${m.text().slice(0, 200)} @ ${m.location().url}`);
      });

    // ---------- Chef : en-tête, onglets, proposer une sortie, réponse, garage, membres, réglages.
    const k = await appLogin(browser, crew.chef, theme);
    watch(k);
    await openCrew(k, crew.slug);
    await expect(k.getByTestId("crew-tabs")).toBeVisible();
    await expect(k.getByTestId("crew-feed")).toBeVisible();
    await expect(k.getByTestId("crew-instagram")).toContainText("roussillondrift");
    await expect(k.getByText("Tu es le chef")).toBeVisible();
    await shot(k, `01-chef-fil-${theme}`);
    await k.getByTestId("crew-tab-outings").click();
    await expect(k.getByTestId("crew-propose-outing")).toBeVisible();
    await k.getByTestId("crew-propose-outing").click();
    await k.waitForURL(/\/crew\/sortie/);
    await expect(k.getByTestId("outing-send")).toBeDisabled();
    await expect(k.getByTestId("outing-missing")).toBeVisible();
    await k.getByTestId("outing-title").fill("Balade des Aspres");
    await k.getByTestId("outing-day").fill(parisDay(5));
    await k.getByTestId("outing-time").fill("09:00");
    await k.getByTestId("outing-place").fill("Parking de la cave coopérative, Thuir");
    await k.getByTestId("outing-program").fill("Café à Thuir, puis la route de Castelnou et Prades.");
    await expect(k.getByTestId("outing-when")).toBeVisible();
    await shot(k, `02-proposer-sortie-${theme}`);
    await k.getByTestId("outing-send").click();
    await k.waitForURL(new RegExp(`/crew/${crew.slug}`), { timeout: 30_000 });
    const card = k.getByTestId("crew-outing").filter({ hasText: "Balade des Aspres" });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByTestId("outing-rsvp-yes").click();
    await expect(card.getByTestId("outing-count")).toHaveText("1 vient", { timeout: 20_000 });
    await shot(k, `03-chef-sorties-${theme}`);
    await k.getByTestId("crew-tab-garage").click();
    await expect(k.getByTestId("crew-garage-vehicle")).toHaveCount(2);
    await shot(k, `04-chef-garage-${theme}`);
    await k.getByTestId("crew-tab-members").click();
    const request = k.getByTestId("crew-pending-request");
    await expect(request).toContainText(crew.nina.pseudo);
    await expect(request).toContainText("Je roule en S13");
    await expect(k.getByTestId("crew-member")).toHaveCount(2);
    await shot(k, `05-chef-membres-${theme}`);
    // Réglages : « Les membres peuvent proposer une sortie » → Non.
    await k.getByTestId("crew-settings").click();
    await k.waitForURL(/\/crew\/reglages/);
    await expect(k.getByTestId("crew-settings-instagram")).toHaveValue("@roussillondrift");
    await k.getByTestId("crew-outings-right-no").click();
    await expect(k.getByTestId("crew-settings-ok")).toBeVisible({ timeout: 20_000 });
    await shot(k, `06-reglages-${theme}`);
    await k.context().close();

    // ---------- Membre : réglage non, pas de « Proposer » ; elle répond ; réglage oui, le bouton revient.
    const l = await appLogin(browser, crew.lea, theme);
    watch(l);
    await openCrew(l, crew.slug, "?onglet=sorties");
    await expect(l.getByTestId("crew-propose-reserved")).toBeVisible();
    await expect(l.getByTestId("crew-propose-outing")).toHaveCount(0);
    const lcard = l.getByTestId("crew-outing").filter({ hasText: "Balade des Aspres" });
    await lcard.getByTestId("outing-rsvp-maybe").click();
    await expect(lcard.getByTestId("outing-count")).toHaveText("1 vient · 1 peut-être", { timeout: 20_000 });
    await expect(lcard.getByTestId("outing-edit")).toHaveCount(0);
    await shot(l, `07-membre-sorties-reserve-${theme}`);
    expect(
      (await apiCall(crew.chef.cookie, "PATCH", `/crews/${crew.id}`, { membersCanProposeOutings: true })).status,
    ).toBe(200);
    await openCrew(l, crew.slug, "?onglet=sorties");
    await expect(l.getByTestId("crew-propose-outing")).toBeVisible();
    await l.context().close();

    // ---------- Pas membre : la vitrine, puis la demande avec un message.
    const s = await appLogin(browser, crew.sarah, theme);
    watch(s);
    await openCrew(s, crew.slug);
    const vitrine = s.getByTestId("crew-vitrine");
    await expect(vitrine).toBeVisible();
    await expect(s.getByTestId("crew-tabs")).toHaveCount(0);
    await expect(s.getByTestId("crew-friends")).toContainText("1 de tes amis en fait partie");
    await expect(vitrine.getByTestId("crew-member")).toHaveCount(2);
    await expect(s.getByTestId("crew-members-only")).toBeVisible();
    await expect(s.getByText("Balade des Aspres")).toHaveCount(0);
    await shot(s, `08-vitrine-${theme}`);
    await s.getByTestId("crew-request").click();
    await s.getByTestId("crew-request-message").fill("Salut ! Je roule en Clio 2 RS, souvent à Canet le dimanche.");
    await shot(s, `09-vitrine-demande-${theme}`);
    await s.getByTestId("crew-request-send").click();
    await expect(s.getByTestId("crew-request-sent")).toContainText(`Demande envoyée à ${crew.chef.pseudo}`);
    await expect(s.getByTestId("crew-request-cancel")).toBeVisible();
    await scrollDown(s, 900);
    await shot(s, `10-vitrine-envoyee-${theme}`);
    await s.context().close();

    // ---------- « Rejoindre un crew » : la recherche ouvre la même feuille, le message part avec la demande.
    const p = await appLogin(browser, crew.paul, theme);
    watch(p);
    await p.goto("/rejoindre-crew");
    await skipOpening(p);
    await p.getByTestId("crew-join-q").fill(crew.name);
    const row = p.getByTestId("crew-row").filter({ hasText: crew.name });
    await row.getByTestId("crew-join").click({ timeout: 30_000 });
    await p.getByTestId("crew-request-message").fill("Je cherche un crew pour rouler le dimanche.");
    await shot(p, `11-rejoindre-feuille-${theme}`);
    await p.getByTestId("crew-request-send").click();
    await expect(row.getByTestId("crew-requested")).toBeVisible({ timeout: 20_000 });
    await p.context().close();
    const pending = await apiCall<{ requests: { person: { pseudo: string }; message: string | null }[] }>(
      crew.chef.cookie,
      "GET",
      `/crews/${crew.id}/requests`,
    );
    expect(pending.data.requests.find((r) => r.person.pseudo === crew.paul.pseudo)?.message).toBe(
      "Je cherche un crew pour rouler le dimanche.",
    );
    expect(pending.data.requests.find((r) => r.person.pseudo === crew.sarah.pseudo)?.message).toContain("Clio 2 RS");

    // ---------- 384 px (Pixel de Damien) : la page du chef, onglet Sorties.
    await r5Outing(crew, crew.lea, "Nocturne du Barcarès", 9);
    const k2 = await appLogin(browser, crew.chef, theme, 384);
    await openCrew(k2, crew.slug, "?onglet=sorties");
    await expect(k2.getByTestId("crew-outing")).toHaveCount(2);
    await shot(k2, `12-chef-sorties-384-${theme}`);
    // Tour 2 : le vrai fil (lot R5c1) dans l'onglet Fil, avec les sorties proposées et « Je viens ».
    await k2.getByTestId("crew-tab-feed").click();
    await expect(k2.getByTestId("crew-feed")).toBeVisible();
    await expect(k2.getByTestId("crew-auto-outing").first()).toBeVisible({ timeout: 30_000 });
    await shot(k2, `13-chef-fil-384-${theme}`);
    await k2.context().close();

    // ---------- Tour 2 : un compte privé vu par un membre non ami (le chef) : marque et modèle, sans photo.
    expect((await apiCall(crew.lea.cookie, "PATCH", "/me/profile", { visibility: "private" })).status).toBeLessThan(
      300,
    );
    const k3 = await appLogin(browser, crew.chef, theme);
    await openCrew(k3, crew.slug);
    await k3.getByTestId("crew-tab-garage").click();
    await expect(k3.getByTestId("crew-garage-vehicle")).toHaveCount(2);
    await shot(k3, `14-garage-prive-non-ami-${theme}`);
    await k3.context().close();
  }
  expect(
    errors.filter((e) => !/favicon|DevTools|Sentry|expo-notifications|push|maplibre|tiles|glyphs/i.test(e)),
  ).toEqual([]);
});
