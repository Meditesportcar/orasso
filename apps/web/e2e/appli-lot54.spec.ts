import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { accountQr, apiCall, login, MOBILE, SEED_PASSWORD } from "./helpers";
import { auditApp } from "./helpers/lot43";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot 54, côté appli (version web de recette) : les casquettes Pro et Prestataire en DA v2.
// Pro (garage@orasso.local, « Yann » du brief) : Ma fiche en grille (activités en tuiles, remises par grade, réalisations,
// « Y aller » / « Favori », puis « Modifier ma fiche » avec exemples de format), Scanner (dernier scan en carte), Stats
// (deux chiffres en grand, barres par grade).
// Prestataire (sofia@orasso.local, La Brasa) : Missions (3 du seed dont « 1 place sur 2 »), proposer sa vitrine, tickets
// des Candidatures (emplacement, accès, consignes, avis des passées, retrait), Vitrine en lecture et en modification
// (menu mal formé : erreur de ligne), fiche publique d'un prestataire.
// Deux thèmes, captures à 390 px, audit des règles du système de design sur chaque écran.
// Lancer avec APP_URL=http://localhost:8391 (relais `apps/mobile/scripts/web-isolated.mjs` devant `expo start --web`), API
// seedée. Rejouer une spec seule sur seed neuf (`pnpm db:seed --reset`) : elle écrit des candidatures de Sofia.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-54-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 20_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

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
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function toPersona(page: Page, kind: "pro" | "provider", landing: RegExp) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId(`casquette-${kind}`).first().click();
  await page.waitForURL(landing, { timeout: 60_000 });
}

async function tab(page: Page, label: string) {
  await page.getByRole("tab", { name: label, exact: true }).click();
  await page.waitForTimeout(600);
}

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

/** Règles du système de design à l'écran + aucun texte coupé par des points de suspension. */
async function rules(page: Page, theme: Theme, name: string) {
  await page.waitForTimeout(1200);
  const a = await auditApp(page, theme);
  expect(a.primaryButtons, `${name} : un seul bouton principal (${a.primaryLabels.join(" | ")})`).toBeLessThanOrEqual(
    1,
  );
  expect(a.neon, `${name} : un seul néon (${a.neonLabels.join(" | ")})`).toBeLessThanOrEqual(1);
  expect(a.buttonsWithoutIcon, `${name} : tout bouton porte une icône`).toEqual([]);
  expect(a.greens, `${name} : pas de vert`).toEqual([]);
  expect(a.horizontalScroll, `${name} : pas de défilement horizontal`).toBe(false);
  expect(a.unoutlinedOnPhoto, `${name} : texte sur photo en contour`).toEqual([]);
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.right > 0 &&
          r.left < window.innerWidth &&
          getComputedStyle(el).textOverflow === "ellipsis" &&
          el.scrollWidth > el.clientWidth + 1
        );
      })
      .map((el) => (el.textContent ?? "").trim().slice(0, 50)),
  );
  expect(cut, `${name} : aucun texte coupé`).toEqual([]);
}

for (const theme of THEMES) {
  test(`Pro : Ma fiche en grille, Modifier ma fiche, Scanner, Stats (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "garage@orasso.local");
    await toPersona(page, "pro", /\/accueil/);

    // Ma fiche : en-tête, segments, activités en tuiles, remises en grands chiffres, réalisations, Y aller · Favori.
    await tab(page, "Ma fiche");
    await expect(page.getByRole("heading", { name: "Ma fiche", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pro-identity")).toBeVisible();
    await expect(page.getByTestId("pro-identity")).toContainText(/Pro validé|SIRET à vérifier/);
    await expect(page.getByText("Vue passionné", { exact: true })).toBeVisible();
    await expect(page.getByText("Modifier ma fiche", { exact: true })).toBeVisible();
    await expect(page.getByTestId("pro-view-activities")).toBeVisible();
    // Les deux vues restent montées (la saisie survit au changement de segment) : seul ce qui se voit compte.
    await expect(page.getByText("Remises par grade", { exact: true }).locator("visible=true")).toBeVisible();
    await expect(page.getByText("Montre ton QR de compte", { exact: true })).toBeVisible();
    await expect(page.getByTestId("pro-view-discounts")).toBeVisible();
    await expect(page.getByText("Réalisations", { exact: true })).toBeVisible();
    await expect(page.getByTestId("pro-go")).toBeVisible();
    await expect(page.getByTestId("pro-favorite")).toBeVisible();
    await page.getByTestId("pro-favorite").click();
    await expect(page.getByText(/Aperçu : c'est ce que voit un passionné/)).toBeVisible();
    await rules(page, theme, "Ma fiche");
    await shot(page, "fiche", theme);

    // Modifier ma fiche : activités à cocher, exemples de format, SIRET et adresse.
    await page.getByText("Modifier ma fiche", { exact: true }).click();
    await expect(page.getByText("Activités · touche pour cocher", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("pro-activities")).toBeVisible();
    await expect(page.getByPlaceholder("ex. 04 68 12 34 56")).toBeVisible();
    await expect(page.getByPlaceholder("ex. @atelier.tet")).toBeVisible();
    await expect(page.getByPlaceholder("ex. atelier-tet.fr")).toBeVisible();
    await expect(page.getByPlaceholder("ex. 912 345 678 00014")).toBeVisible();
    await expect(page.getByText(/14 chiffres, ex\. 912 345 678 00014/)).toBeVisible();
    // Correction 6 : la saisie en cours survit à un aller-retour entre les segments.
    await page.getByLabel("Présentation").fill("Brouillon gardé en changeant de segment.");
    await page.getByText("Vue passionné", { exact: true }).click();
    await expect(page.getByTestId("pro-view")).toBeVisible();
    await page.getByText("Modifier ma fiche", { exact: true }).click();
    await expect(page.getByLabel("Présentation")).toHaveValue("Brouillon gardé en changeant de segment.");
    await expect(page.getByTestId("pro-address-check")).toBeVisible();
    await expect(page.getByTestId("pro-new-post")).toBeVisible();
    await rules(page, theme, "Modifier ma fiche");
    await shot(page, "fiche-modifier", theme);

    // Scanner : caméra en plein cadre, dernier scan en carte, historique.
    await tab(page, "Scanner");
    await expect(page.getByRole("heading", { name: "Scanner", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // Les onglets voisins restent montés : seul ce qui se voit compte.
    await expect(page.getByText("Remises par grade", { exact: true }).last()).toBeVisible();
    await expect(page.getByTestId("pro-camera")).toBeVisible();
    const field = page.getByLabel(/Recette · charge utile/);
    // Un passionné différent par thème : le code de 60 s d'un même compte ne se relit pas (rejeu refusé).
    const scanned =
      theme === "beton"
        ? { email: "kenji@orasso.local", pseudo: "Kenji" }
        : { email: "nina@orasso.local", pseudo: "Nina" };
    await field.fill(await accountQr(await login(scanned.email)));
    await field.press("Enter");
    const result = page.getByTestId("pro-scan-result");
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result).toContainText(new RegExp(`Dernier scan : ${scanned.pseudo}`));
    await expect(page.getByTestId("pro-scan-discount")).toContainText(
      /Grade \w+ · (remise de \d+ % appliquée|pas de remise)/,
    );
    await expect(result).not.toContainText("@");
    await rules(page, theme, "Scanner");
    await shot(page, "scanner", theme);
    // Un code illisible est refusé sans effacer le dernier scan de la séance.
    await field.fill("OA1AAAAAAAAAAA.12345678");
    await field.press("Enter");
    await expect(page.getByTestId("pro-scan-result")).toContainText(/Compte inconnu|Refusé|Code/, { timeout: 20_000 });
    await shot(page, "scanner-refuse", theme);

    // Stats : deux chiffres en grand, détail par grade.
    await tab(page, "Stats");
    await expect(page.getByRole("heading", { name: "Stats", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("30 derniers jours", { exact: true })).toBeVisible();
    await expect(page.getByTestId("pro-stats-views")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pro-stats-discounts")).toBeVisible();
    await expect(page.getByText("Vues de la fiche", { exact: true })).toBeVisible();
    await expect(page.getByTestId("pro-stats-grades")).toContainText("Rodage");
    await rules(page, theme, "Stats");
    await shot(page, "stats", theme);
    await ctx.close();
  });

  test(`Prestataire : Missions, proposer, Candidatures (tickets), Vitrine, fiche publique (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "sofia@orasso.local");
    await toPersona(page, "provider", /\/accueil/);

    // Missions : grand titre, puces, phrase d'intro, cartes en tickets (« 1 place sur 2 »).
    await tab(page, "Missions");
    await expect(page.getByRole("heading", { name: "Missions", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Autour du 66", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("missions-filters")).toContainText("Food truck");
    await expect(page.getByTestId("missions-intro")).toContainText(
      /événements? cherchent? un food truck, du plus proche au plus loin\./,
    );
    await expect(page.getByTestId("mission-card").first()).toBeVisible({ timeout: 30_000 });
    expect(await page.getByTestId("mission-card").count()).toBeGreaterThanOrEqual(3);
    // Rivesaltes : Sofia y est déjà en attente (le statut de sa candidature remplace « 1 place sur 2 »).
    await expect(page.getByTestId("mission-card").filter({ hasText: "Expo Rivesaltes" })).toContainText("En attente");
    await expect(page.getByText(/^(1 food truck|2 food trucks)$/).first()).toBeVisible();
    await expect(page.getByText("Électricité fournie", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Eau sur place", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Expo Rivesaltes").first()).toBeVisible();
    await expect(page.getByTestId("mission-see").first()).toBeVisible();
    await rules(page, theme, "Missions");
    await shot(page, "missions", theme);

    // Candidature libre : un événement qui accepte les food trucks sans avoir écrit de besoin (docs/01).
    await sql(
      `update events set vendor_types = vendor_types || array['Food truck']::text[] where id = (
         select e.id from events e
         where e.status = 'published' and e.starts_at > now() + interval '4 days'
           and not ('Food truck' = any(e.vendor_types))
           and not exists (select 1 from event_needs n where n.event_id = e.id)
         order by e.starts_at asc limit 1)`,
    );
    await page.reload();
    await afterOpening(page);
    await tab(page, "Missions");
    await expect(page.getByTestId("missions-free")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Ouverts à ton activité", { exact: true })).toBeVisible();
    await expect(page.getByText("Sans mission précise", { exact: true }).first()).toBeVisible();
    const free = page.getByTestId("provider-open-event").first();
    const freeTitle = (await free.locator('[role="link"]').first().textContent())?.trim() ?? "";
    await rules(page, theme, "Missions · ouverts à ton activité");
    await page.getByTestId("missions-free").scrollIntoViewIfNeeded();
    await shot(page, "missions-ouverts", theme);
    await free.getByTestId("open-apply").click();
    await page.getByText("J'accepte le règlement de l'événement").click();
    await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
    await expect(page.getByTestId("provider-open-event").filter({ hasText: freeTitle })).toHaveCount(0, {
      timeout: 30_000,
    });

    // « Voir ma candidature » ouvre le ticket concerné, en tête de l'onglet Candidatures.
    await page.getByTestId("mission-card").filter({ hasText: "Expo Rivesaltes" }).getByTestId("mission-see").click();
    await page.waitForURL(/candidatures/);
    await expect(page.getByTestId("provider-application").first()).toContainText("Expo Rivesaltes", {
      timeout: 30_000,
    });
    await tab(page, "Missions");

    // Proposer La Brasa à la première mission encore ouverte : la feuille, puis l'envoi.
    const openCard = page
      .getByTestId("mission-card")
      .filter({ has: page.getByTestId("mission-propose") })
      .first();
    await expect(openCard).toBeVisible();
    const eventTitle = (await openCard.locator('[role="link"]').first().textContent())?.trim() ?? "";
    await openCard.getByTestId("mission-propose").click();
    await expect(page.getByText("Proposer La Brasa").last()).toBeVisible();
    await expect(page.getByTestId("propose-send")).toBeDisabled();
    await page.getByLabel(/Un mot pour l'équipe organisatrice/).fill("La Brasa vient avec son groupe silencieux.");
    await page.getByText("J'accepte le règlement de l'événement").click();
    await shot(page, "missions-proposer", theme);
    await page.getByTestId("propose-send").click();
    await expect(page.getByTestId("propose-sent")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Candidature envoyée").first()).toBeVisible();
    await shot(page, "missions-envoyee", theme);
    await page.getByTestId("propose-close").click();
    await page.waitForTimeout(600);

    // Candidatures : tickets, segments, emplacement, accès, consignes, retrait, passées avec avis.
    await tab(page, "Candidatures");
    await expect(page.getByRole("heading", { name: "Candidatures", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/^À venir · \d+$/)).toBeVisible();
    await expect(page.getByText(/^Passées · \d+$/)).toBeVisible();
    const nocturne = page.getByTestId("provider-application").filter({ hasText: "Nocturne de Canet" });
    await expect(nocturne).toBeVisible({ timeout: 30_000 });
    await expect(nocturne).toContainText("Retenue");
    await expect(nocturne).toContainText(/Emplacement B2 · arrivée 16 h · électricité 16 A/);
    await expect(nocturne.getByTestId("candidature-access")).toBeVisible();
    await expect(nocturne.getByTestId("candidature-access")).toBeVisible();
    await expect(nocturne.getByTestId("candidature-instructions-open")).toBeVisible();
    const pending = page.getByTestId("provider-application").filter({ hasText: eventTitle }).first();
    await expect(pending).toContainText("En attente");
    await expect(pending).toContainText(/Envoyée le \d+ \S+ · en attente de la réponse de l'équipe organisatrice/);
    await expect(pending.getByTestId("candidature-withdraw")).toBeVisible();
    await expect(page.getByText(/Un empêchement \? Retire ta candidature depuis le ticket/)).toBeVisible();
    await rules(page, theme, "Candidatures");
    await shot(page, "candidatures", theme);

    await nocturne.getByTestId("candidature-instructions-open").click();
    await expect(page.getByTestId("candidature-instructions")).toBeVisible();
    await shot(page, "candidatures-consignes", theme);
    await page
      .getByRole("button", { name: "Fermer", exact: true })
      .last()
      .click({ position: { x: 60, y: 15 } });
    await page.waitForTimeout(500);

    if (theme === "sable") {
      // Retrait depuis le ticket (sable seulement : le thème béton garde sa candidature pour la capture).
      await pending.getByTestId("candidature-withdraw").click();
      await expect(page.getByText("Retirer ta candidature ?")).toBeVisible();
      await page.getByTestId("orga-confirm").click();
      await expect(page.getByTestId("provider-application").filter({ hasText: eventTitle })).toHaveCount(0, {
        timeout: 20_000,
      });
    }

    await page.getByText(/^Passées · \d+$/).click();
    const reviewed = page
      .getByTestId("provider-application-past")
      .filter({ hasText: /Avis · 5\/5/ })
      .first();
    await expect(reviewed).toBeVisible({ timeout: 20_000 });
    await expect(reviewed).toContainText("«");
    await rules(page, theme, "Candidatures passées");
    await shot(page, "candidatures-passees", theme);

    // Vitrine : vue organisateur.
    await tab(page, "Vitrine");
    await expect(page.getByRole("heading", { name: "Ma vitrine", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("vitrine-identity")).toContainText("La Brasa");
    await expect(page.getByText("Vue organisateur", { exact: true })).toBeVisible();
    await expect(page.getByTestId("vitrine-menu-list")).toContainText("Bocata de botifarra");
    await expect(page.getByTestId("vitrine-menu-list")).toContainText("9 €");
    await expect(page.getByText("De 4 à 11 €", { exact: true })).toBeVisible();
    await expect(page.getByText("Besoins sur place", { exact: true }).locator("visible=true")).toBeVisible();
    await expect(page.getByText("Électricité 16 A", { exact: true })).toBeVisible();
    await expect(page.getByText("6 m de façade", { exact: true })).toBeVisible();
    await expect(page.getByText("Pas d'eau", { exact: true })).toBeVisible();
    await expect(page.getByText("Jusqu'à 80 km", { exact: true }).locator("visible=true")).toBeVisible();
    await expect(page.getByTestId("vitrine-identity-tiles")).toContainText("Grillades catalanes");
    await expect(page.getByText("Avis des organisateurs", { exact: true })).toBeVisible();
    await expect(page.getByTestId("vitrine-reviews")).toContainText("MéditeSportCar");
    await rules(page, theme, "Vitrine");
    await shot(page, "vitrine", theme);

    // Vitrine : modification, menu mal formé → erreur de ligne, puis enregistrement valide.
    await page.getByText("Modifier ma vitrine", { exact: true }).click();
    await expect(page.getByText("Métier · touche pour cocher", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("vitrine-trades")).toBeVisible();
    const menu = page.getByTestId("vitrine-menu");
    const original = await menu.inputValue();
    await menu.fill(`${original}\nFrites sans prix`);
    await expect(page.getByText(/Ligne \d+ : indique le prix/)).toBeVisible();
    await shot(page, "vitrine-erreur", theme);
    // Équipe à « 0 » refusée comme l'API, et la saisie survit au changement de segment.
    await page.getByLabel("Équipe").fill("0");
    await expect(page.getByText("Équipe : de 1 à 50 personnes.")).toBeVisible();
    await page.getByText("Vue organisateur", { exact: true }).click();
    await page.getByText("Modifier ma vitrine", { exact: true }).click();
    await expect(page.getByLabel("Équipe")).toHaveValue("0");
    await expect(page.getByText("Équipe : de 1 à 50 personnes.")).toBeVisible();
    await page.getByLabel("Équipe").fill("2");
    await page.getByTestId("vitrine-save").click();
    await expect(page.getByText("Corrige les lignes du menu avant d'enregistrer.")).toBeVisible();
    await menu.fill(original);
    await expect(page.getByText(/Ligne \d+ : indique le prix/)).toHaveCount(0);
    await page.getByTestId("vitrine-save").click();
    await expect(page.getByText("Vitrine enregistrée.")).toBeVisible({ timeout: 20_000 });
    await rules(page, theme, "Vitrine · modification");
    await shot(page, "vitrine-modifier", theme);

    // Fiche publique d'un prestataire (pour l'organisateur et les passionnés).
    const sofia = await login("sofia@orasso.local");
    const profile = await apiCall<{ profile: { id: string } }>(sofia, "GET", "/me/provider-profile");
    await page.goto(`/providers/${profile.data.profile.id}`);
    await expect(page.getByTestId("provider-identity")).toContainText("La Brasa", { timeout: 30_000 });
    await expect(page.getByTestId("vitrine-menu-list")).toContainText("Brochettes catalanes");
    await expect(page.getByTestId("vitrine-reviews")).toBeVisible();
    await rules(page, theme, "Fiche publique prestataire");
    await shot(page, "prestataire-public", theme);
    await ctx.close();
  });
}
