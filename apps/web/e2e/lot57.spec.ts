import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  type Cookie,
  createEvent,
  decideApi,
  login,
  loginInBrowser,
  MOBILE,
  randomPlate,
  setTheme,
  signUpApi,
  simulateSettle,
  unique,
} from "./helpers";
import { sql } from "./helpers/lot48";
import { checkerPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot 57, côté site : parité des fonctions nouvelles de la DA v2 (D20). Organisateur : réglages presse et décision d'une
// accréditation, mise en avant d'un contenu, besoin + candidature + emplacement + avis après le règlement, affiche
// régénérée. Utilisateur : Mes sorties (redirection de /app/acces), passeport de Kenji, vote sur un événement en cours,
// récap de Béziers Night, profil média de Léo (contenu avec floutage proposé), vitrine de Sofia, carte à partager,
// Mon profil en hub. Administration : vérification d'un profil média. Deux thèmes, `auditPage`, captures 390 px et
// bureau, pas de défilement horizontal à 390 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-57-captures/site`;
const WIDE = { width: 1280, height: 900 } as const;
const THEMES = ["beton", "sable"] as const;
type Theme = (typeof THEMES)[number];

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true });
}

/**
 * Néons de la page hors de la pastille centrale de la barre d'onglets du site (`.o-tabbar__tab.is-center`, barre v1 de
 * l'espace connecté, toujours en néon) : avec elle, toute page de `/app` qui a un bouton principal compterait deux néons.
 * Écart signalé au coordinateur (barre du site, lot 56 / 58).
 */
async function neonsOutsideTabBar(page: Page, total: number): Promise<number> {
  const center = await page.evaluate(() => {
    const el = document.querySelector(".o-tabbar__tab.is-center");
    if (!el || el.getBoundingClientRect().width === 0) return 0;
    const probe = document.createElement("div");
    probe.style.boxShadow = "var(--neon-accent)";
    document.body.appendChild(probe);
    const neon = getComputedStyle(probe).boxShadow;
    probe.remove();
    return getComputedStyle(el).boxShadow === neon ? 1 : 0;
  });
  return total - center;
}

/** Règles du système de design ; à 390 px, aucun défilement horizontal. */
async function checkRules(page: Page, name: string) {
  await page.waitForTimeout(300);
  const a = await auditPage(page);
  expect(a.primaryButtons, `${name} : un seul bouton principal`).toBeLessThanOrEqual(1);
  expect(await neonsOutsideTabBar(page, a.neonAccent), `${name} : un seul néon`).toBeLessThanOrEqual(1);
  expect(a.buttonsWithoutIcon, `${name} : tout bouton porte une icône`).toEqual([]);
  expect(a.greens, `${name} : pas de vert`).toEqual([]);
  expect(a.truncated, `${name} : rien de tronqué`).toEqual([]);
  expect(a.horizontalScroll, `${name} : pas de défilement horizontal`).toBe(false);
}

/** La page, au téléphone (390 px) puis sur bureau : règles et captures. */
async function both(page: Page, name: string, theme: Theme) {
  await page.setViewportSize(MOBILE);
  await page.waitForLoadState("networkidle");
  await checkRules(page, `${name} 390 ${theme}`);
  await shot(page, `${name}-390`, theme);
  await page.setViewportSize(WIDE);
  await checkRules(page, `${name} bureau ${theme}`);
  await shot(page, `${name}-bureau`, theme);
}

async function open(browser: Browser, theme: Theme, email: string) {
  const ctx = await browser.newContext({ viewport: WIDE });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  await loginInBrowser(page, email);
  return { ctx, page };
}

async function eventBySlug(cookie: Cookie, slug: string) {
  const res = await apiCall<{ id: string; slug: string; title: string }>(cookie, "GET", `/events/by-slug/${slug}`);
  expect(res.status, `événement ${slug}`).toBe(200);
  return res.data;
}

test.describe.configure({ mode: "serial" });

test("organisateur : presse, missions et avis, affiche, prix du public (deux thèmes)", async ({ browser }) => {
  test.setTimeout(900_000);
  const damien = await login("damien@orasso.local");
  const leo = await login("leo@orasso.local");
  const sofia = await login("sofia@orasso.local");
  for (const theme of THEMES) {
    const s = unique();
    const event = await createEvent(damien, { title: `Rasso presse ${s}` });
    const base = `/orga/meditesportcar/e/${event.id}`;
    const { ctx, page } = await open(browser, theme, "damien@orasso.local");

    // Réglages presse : ouverture, quota, zones, consignes.
    await page.goto(`${base}/presse`);
    await expect(page.getByRole("heading", { name: "Presse", exact: true })).toBeVisible();
    const settings = page.getByTestId("press-settings");
    await settings.getByLabel("Accréditation presse ouverte").check();
    await settings.getByLabel("Quota (médias accrédités)").fill("3");
    await settings.getByLabel("Zones").fill("zone piste 19 h – 21 h · paddock libre");
    await settings.getByLabel("Consignes").fill("Gilet presse obligatoire, pas de drone.");
    await settings.getByRole("button", { name: "Enregistrer les réglages" }).click();
    await expect(page.getByTestId("press-ok")).toHaveText("Réglages enregistrés.");

    // Léo demande une accréditation ; l'organisateur la décide sur le site (la raison du refus est obligatoire).
    const asked = await apiCall<{ id: string }>(leo, "POST", `/events/${event.id}/accreditations`, {
      formats: ["photo", "video"],
      message: "Reportage photo et une vidéo courte.",
    });
    expect(asked.status, JSON.stringify(asked.data)).toBe(201);
    await page.reload();
    const request = page.getByTestId("press-request").filter({ hasText: "Sud Cars" });
    await expect(request).toBeVisible();
    await both(page, "orga-presse", theme);
    if (theme === "beton") {
      await request.getByText("Refuser", { exact: true }).click();
      await request.getByLabel("Raison du refus (le média la lit)").fill("Quota presse atteint pour la vidéo.");
      await request.getByTestId("press-refuse").click();
      await expect(page.getByTestId("press-ok")).toContainText("Demande refusée");
      const mine = await apiCall<{ status: string; refusalNote: string | null }[]>(leo, "GET", "/me/accreditations");
      const refused = mine.data.find((a) => a.status === "refused" && a.refusalNote?.includes("Quota presse"));
      expect(refused, "le média lit la raison").toBeTruthy();
    } else {
      await request.getByTestId("press-accept").click();
      await expect(page.getByTestId("press-ok")).toHaveText("Accréditation donnée.");
      await expect(page.getByTestId("press-decided").filter({ hasText: "Sud Cars" })).toContainText(
        "Badge presse délivré",
      );
      // Un contenu de Léo, mis en avant par l'organisateur.
      const content = await apiCall(leo, "POST", "/me/media-contents", {
        eventId: event.id,
        kind: "link",
        title: `Reportage ${s}`,
        url: "https://example.org/reportage",
        platform: "website",
      });
      expect(content.status, JSON.stringify(content.data)).toBe(201);
      await page.reload();
      const item = page.getByTestId("press-content").filter({ hasText: `Reportage ${s}` });
      await item.getByTestId("press-feature").click();
      await expect(page.getByTestId("press-ok")).toHaveText("Contenu mis en avant sur la page de l'événement.");
      await expect(item).toContainText("Mis en avant");
    }

    // Missions : un besoin, la candidature de Sofia sur ce besoin, retenue, emplacement, puis avis après le règlement.
    await page.goto(`${base}/prestataires`);
    const add = page.getByTestId("need-add");
    await add.getByLabel("Métier").selectOption("food_truck");
    await add.getByLabel("Nombre").fill("2");
    await add.getByLabel("Électricité fournie").selectOption("a16");
    await add.getByTestId("need-create").click();
    await expect(page.getByTestId("need")).toHaveCount(1);
    const needs = await apiCall<{ id: string }[]>(damien, "GET", `/events/${event.id}/needs`);
    const proposed = await apiCall(sofia, "POST", `/events/${event.id}/provider-applications`, {
      rulesAccepted: true,
      needId: needs.data[0]?.id,
      message: "La Brasa, bocatas catalans.",
    });
    expect(proposed.status, JSON.stringify(proposed.data)).toBe(201);
    await page.reload();
    const need = page.getByTestId("need").first();
    await need.getByRole("button", { name: "Retenir" }).first().click();
    await expect(page.getByTestId("provider-message").first()).toContainText("retenu");
    await page.reload();
    const retained = page.getByTestId("need-retained").first();
    await retained.getByText("Attribuer un emplacement", { exact: true }).click();
    await retained.getByLabel("Emplacement (12 caractères au plus)").fill("B4");
    await retained.getByLabel("Consigne d'installation").fill("Entrée côté plage, arrivée 16 h.");
    await retained.getByTestId("spot-save").click();
    await expect(page.getByTestId("need-retained").first()).toContainText("Emplacement B4");
    const sofiaApps = await apiCall<{ event: { id: string }; spot: { label: string } | null }[]>(
      sofia,
      "GET",
      "/me/provider-applications",
    );
    expect(sofiaApps.data.find((a) => a.event.id === event.id)?.spot?.label).toBe("B4");
    await both(page, "orga-prestataires", theme);

    // Après l'événement (J+2 simulé) : « Donner un avis ».
    simulateSettle(event.slug);
    await page.reload();
    const review = page.getByTestId("need-review").first();
    await review.getByText("Donner un avis", { exact: true }).click();
    await review.getByLabel("Note sur 5").selectOption("5");
    await review.getByLabel("Commentaire (facultatif)").fill("Ponctuels et très bons.");
    await review.getByTestId("review-send").click();
    await expect(page.getByTestId("need-reviewed").first()).toContainText("Ton avis · 5/5");

    // Affiche de la Nocturne : régénérée avec un autre style.
    const nocturne = await eventBySlug(damien, "nocturne-de-canet-2026");
    await page.goto(`/orga/meditesportcar/e/${nocturne.id}`);
    const poster = page.getByTestId("orga-poster");
    await expect(poster).toBeVisible();
    await poster.getByLabel("Style").selectOption(theme === "beton" ? "swiss" : "retro");
    await poster.getByTestId("orga-poster-regenerate").click();
    await expect(page.getByTestId("orga-poster-done")).toHaveText("Affiche régénérée.");
    await poster.scrollIntoViewIfNeeded();
    await both(page, "orga-affiche", theme);
    await ctx.close();
  }
});

test("utilisateur : sorties, passeport, vote, récap, carte à partager, hub (deux thèmes)", async ({ browser }) => {
  test.setTimeout(900_000);
  const damien = await login("damien@orasso.local");
  const kenji = await login("kenji@orasso.local");
  // Un événement en cours de vote : Kenji et deux pilotes retenus et pointés.
  const s = unique();
  const event = await createEvent(damien, { title: `Nocturne vote ${s}` });
  const vehicles = await apiCall<{ id: string; status: string }[]>(kenji, "GET", "/me/vehicles");
  const kenjiApp = await applyApi(kenji, event.id, vehicles.data.find((v) => v.status === "active")?.id ?? "");
  await decideApi(damien, event.id, kenjiApp, "accept");
  const pilots: { pseudo: string; applicationId: string }[] = [];
  for (const name of ["Alpha", "Bravo"]) {
    const pseudo = `${name}_${s}`;
    const cookie = await signUpApi(pseudo);
    const applicationId = await applyApi(cookie, event.id, await addVehicleApi(cookie, randomPlate()));
    await decideApi(damien, event.id, applicationId, "accept");
    pilots.push({ pseudo, applicationId });
  }
  for (const id of [kenjiApp, ...pilots.map((p) => p.applicationId)]) {
    const res = await apiCall(damien, "POST", `/events/${event.id}/checkins`, { applicationId: id, method: "manual" });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
  }
  const beziers = await eventBySlug(kenji, "beziers-night-2026");
  let candidatesCount = 3;

  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme, "kenji@orasso.local");

    // Accès devient Mes sorties : l'ancienne adresse redirige, trois segments.
    await page.goto("/app/acces");
    await expect(page).toHaveURL(/\/app\/sorties/);
    await expect(page.getByRole("heading", { name: "Mes sorties", exact: true })).toBeVisible();
    await expect(page.getByTestId("vote-link").first()).toBeVisible();
    await both(page, "sorties", theme);
    await page.getByTestId("sorties-staff-tab").click();
    await expect(page).toHaveURL(/vue=staff/);
    await expect(page.getByTestId("sorties-staff")).toBeVisible();
    await both(page, "sorties-staff", theme);
    await page.goto("/app/sorties?vue=passes");
    await expect(page.getByTestId("recap-link").first()).toBeVisible();
    await both(page, "sorties-passees", theme);

    // Passeport de Kenji : 9 tampons dont 1 rare, même dessin que l'appli.
    await page.goto("/app/passeport");
    // Kenji a 9 tampons au seed (1 rare), plus un par pointage des recettes qui l'ont pointé.
    await expect(page.getByTestId("passport-summary")).toHaveText(/^\d+ tampons · \d+ rares?$/);
    expect(await page.getByTestId("passport-stamp").count()).toBeGreaterThanOrEqual(9);
    expect(await page.locator('[data-testid="passport-stamp"][data-rare="true"]').count()).toBeGreaterThanOrEqual(1);
    await both(page, "passeport", theme);

    // Prix du public : la grille, sa propre voiture grisée, un vote, le classement.
    await page.goto(`/app/vote/${event.slug}`);
    await expect(page.getByTestId("vote-candidate")).toHaveCount(candidatesCount);
    await page
      .getByTestId("vote-candidate")
      .filter({ hasText: pilots[theme === "beton" ? 0 : 1]?.pseudo ?? "" })
      .click();
    await expect(page.getByTestId("vote-saved")).toContainText("Vote enregistré · tu peux le changer jusqu'à");
    await expect(page.getByTestId("vote-candidate").filter({ hasText: "C'est toi" })).toBeDisabled();
    // Relecture : un pointage sans aucun vote entre-temps ajoute le véhicule à la grille ouverte (rechargement en direct).
    if (theme === "beton") {
      const late = `Charlie_${s}`;
      const lateCookie = await signUpApi(late);
      const lateApp = await applyApi(lateCookie, event.id, await addVehicleApi(lateCookie, randomPlate()));
      await decideApi(damien, event.id, lateApp, "accept");
      const lateCheck = await apiCall(damien, "POST", `/events/${event.id}/checkins`, {
        applicationId: lateApp,
        method: "manual",
      });
      expect(lateCheck.status, JSON.stringify(lateCheck.data)).toBe(201);
      candidatesCount = 4;
      await expect(page.getByTestId("vote-candidate")).toHaveCount(4, { timeout: 30_000 });
    }
    await both(page, "vote", theme);

    // Récap de Béziers Night (prix du public décerné) ; résultats du vote.
    await page.goto(`/app/recap/${beziers.id}`);
    await expect(page.getByTestId("recap-hero")).toContainText("Ta sortie : Béziers Night");
    await expect(page.getByTestId("recap-rank")).toContainText("4e");
    await both(page, "recap", theme);
    await page.goto(`/app/vote/${beziers.slug}`);
    await expect(page.getByTestId("vote-winner")).toBeVisible();

    // Carte à partager : trois styles, aperçu, téléchargement de la story.
    await page.goto("/app/garage");
    await page.locator('a[href^="/app/garage/"]').filter({ hasNotText: "Ajouter" }).first().click();
    await expect(page.getByTestId("share-card")).toBeVisible();
    await page.getByTestId("share-style-neon").click();
    const download = page.waitForEvent("download");
    await page.getByTestId("share-story").click();
    expect((await download).suggestedFilename()).toBe("orasso-story-neon.png");
    await page.getByTestId("share-card").scrollIntoViewIfNeeded();
    await both(page, "carte-a-partager", theme);

    // Mon profil en hub : passeport, crew, casquettes.
    await page.goto("/u/Kenji_66");
    await expect(page.getByTestId("hub-passport")).toContainText(/\d+ tampons, dont \d+ rares?/);
    await both(page, "profil-hub", theme);
    await ctx.close();
  }
});

test("média : profil de Léo, accréditations, contenu avec floutage proposé ; vitrine de Sofia (deux thèmes)", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme, "leo@orasso.local");
    await page.goto("/app/media");
    await expect(page.getByTestId("media-name")).toHaveText("Sud Cars");
    const accepted = page.getByTestId("media-accreditation").filter({ hasText: "Nocturne de Canet" });
    await expect(accepted).toHaveAttribute("data-status", "accepted");
    await expect(accepted.getByTestId("media-briefing")).toBeVisible();
    await both(page, "media-presse", theme);

    await page.goto("/app/media?onglet=explorer");
    await expect(page.getByTestId("media-event").first()).toBeVisible();
    await both(page, "media-explorer", theme);

    // Galerie sur la Nocturne : une photo floutée (cadre posé), une envoyée sans flouter (D28 : au choix du média).
    await page.goto("/app/media?onglet=contenus");
    const form = page.getByTestId("media-content-form");
    await form.getByLabel("Événement").selectOption({ label: "Nocturne de Canet" });
    const galleryTitle = `Galerie ${unique()}`;
    await form.getByLabel("Titre").fill(galleryTitle);
    await form.getByText("Galerie", { exact: true }).click();
    const picker = page.getByTestId("media-gallery-picker");
    await picker.getByLabel("Choisir des photos").setInputFiles({
      name: "nocturne-1.png",
      mimeType: "image/png",
      buffer: await checkerPhoto(),
    });
    await picker.getByRole("button", { name: "Poser un cadre" }).click();
    await picker.getByTestId("media-photo-blur").click();
    await expect(picker.getByText("Plaque floutée", { exact: true })).toBeVisible();
    await picker.getByLabel("Choisir des photos").setInputFiles({
      name: "nocturne-2.png",
      mimeType: "image/png",
      buffer: await checkerPhoto(),
    });
    await picker.getByTestId("media-photo-plain").click();
    await expect(picker.getByTestId("media-gallery-sent").locator("li")).toHaveCount(2);
    await both(page, "media-contenus-ajout", theme);
    await form.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByTestId("media-done")).toContainText("Contenu publié");
    // Relecture : le contenu publié a bien ses deux photos (une floutée, une envoyée telle quelle).
    const mine = await apiCall<{ title: string; kind: string; photos: unknown[] }[]>(
      await login("leo@orasso.local"),
      "GET",
      "/me/media-contents",
    );
    expect(mine.data.find((c) => c.title === galleryTitle)?.photos).toHaveLength(2);
    // La fiche du média (connecté) liste ses contenus publiés, galerie comprise (deux photos).
    const profile = await apiCall<{ profile: { id: string } | null }>(
      await login("leo@orasso.local"),
      "GET",
      "/me/media-profile",
    );
    await page.goto(`/m/${profile.data.profile?.id}`);
    const published = page.getByTestId("media-public-content").filter({ hasText: galleryTitle });
    await expect(published).toBeVisible();
    await expect(published.locator("img")).toHaveCount(2);
    await both(page, "media-contenus", theme);

    await page.goto("/app/media?onglet=agenda");
    await expect(page.getByTestId("media-agenda")).toBeVisible();
    await both(page, "media-agenda", theme);

    await page.goto("/app/media/nouveau");
    await expect(page.getByLabel("Nom du média")).toHaveValue("Sud Cars");
    await both(page, "media-profil", theme);
    await ctx.close();

    // Vitrine de Sofia (menu, besoins, avis) et ses missions, côté prestataire.
    const sofia = await open(browser, theme, "sofia@orasso.local");
    await sofia.page.goto("/app/prestataire");
    await expect(sofia.page.getByTestId("provider-missions")).toBeVisible();
    await expect(sofia.page.getByTestId("provider-spot").first()).toContainText("Emplacement B2");
    await both(sofia.page, "prestataire", theme);
    const me = await apiCall<{ profile: { id: string } | null }>(
      await login("sofia@orasso.local"),
      "GET",
      "/me/provider-profile",
    );
    await sofia.page.goto(`/providers/${me.data.profile?.id}`);
    await expect(sofia.page.getByTestId("vitrine-menu")).toBeVisible();
    await expect(sofia.page.getByTestId("vitrine-review").first()).toBeVisible();
    await both(sofia.page, "vitrine", theme);
    await sofia.ctx.close();
  }
});

test("administration : vérification d'un profil média (deux thèmes)", async ({ browser }) => {
  test.setTimeout(300_000);
  // Un média neuf, à vérifier.
  const s = unique();
  const cookie = await signUpApi(`Media_${s}`);
  const created = await apiCall(cookie, "PUT", "/me/media-profile", {
    name: `Objectif ${s}`,
    formats: ["photo"],
    website: "https://example.org/objectif",
    departments: ["66"],
  });
  expect(created.status, JSON.stringify(created.data)).toBe(200);
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme, "damien@orasso.local");
    await page.goto(theme === "beton" ? "/admin/medias" : "/admin/medias?filtre=all");
    const row = page.getByTestId("admin-media-row").filter({ hasText: `Objectif ${s}` });
    await expect(row).toBeVisible();
    await both(page, "admin-medias", theme);
    await row.getByTestId("admin-media-verify").click();
    await expect(page.getByTestId("admin-media-done")).toBeVisible();
    const mine = await apiCall<{ profile: { verifiedAt: string | null } }>(cookie, "GET", "/me/media-profile");
    expect(Boolean(mine.data.profile.verifiedAt)).toBe(theme === "beton");
    await ctx.close();
  }
});

test("sorties : billet contrôlé encore « à venir », staff « Je serai là » puis « Pas là » (relecture)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const kenji = await login("kenji@orasso.local");
  const s = unique();
  const event = await createEvent(damien, { title: `Sorties relue ${s}`, publicAccess: "free_reservation" });

  // Billet du public : valable, puis contrôlé à l'entrée avant la fin de l'événement. Il reste dans « À venir »
  // (avec l'entrée vers le vote), jamais dans « Passées ».
  const ticketing = await apiCall(damien, "PUT", `/events/${event.id}/ticketing`, {
    enabled: true,
    capacity: 10,
    priceCents: null,
    name: "Entrée",
  });
  expect(ticketing.status, JSON.stringify(ticketing.data)).toBe(200);
  const reserved = await apiCall<{ payload: string }[]>(kenji, "POST", `/events/${event.id}/tickets/reserve`, {
    quantity: 1,
  });
  expect(reserved.status, JSON.stringify(reserved.data)).toBe(201);
  const k = await open(browser, "beton", "kenji@orasso.local");
  await k.page.goto("/app/sorties");
  const ticket = k.page.getByTestId("sorties-ticket").filter({ hasText: event.title });
  await expect(ticket).toHaveAttribute("data-status", "valid");
  const checked = await apiCall(damien, "POST", `/events/${event.id}/tickets/check`, {
    payload: reserved.data[0]?.payload,
  });
  expect(checked.status, JSON.stringify(checked.data)).toBe(200);
  await k.page.reload();
  await expect(ticket).toHaveAttribute("data-status", "used");
  await k.page.goto("/app/sorties?vue=passes");
  await expect(k.page.getByTestId("sorties-ticket").filter({ hasText: event.title })).toHaveCount(0);
  await k.ctx.close();

  // Staff : « Je serai là » devient « Pas là » (mêmes mots que l'appli), puis revient.
  const j = await open(browser, "beton", "julie@orasso.local");
  await j.page.goto("/app/sorties?vue=staff");
  const mission = j.page.getByTestId("staff-ticket").filter({ hasText: event.title });
  const presence = mission.getByTestId("staff-presence");
  await expect(presence).toContainText("Je serai là");
  await presence.click();
  await expect(presence).toHaveAttribute("data-presence", "present");
  await expect(presence).toContainText("Pas là");
  await presence.click();
  await expect(presence).not.toHaveAttribute("data-presence", "present");
  await expect(presence).toContainText("Je serai là");
  await j.ctx.close();
});

test("média : envoi d'une photo retardé, aperçu flouté, Explorer au-delà de 30 et panne affichée (relecture)", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const damien = await login("damien@orasso.local");
  const tag = `Pagination ${unique()}`;
  for (let i = 0; i < 31; i++) await createEvent(damien, { title: `${tag} ${String(i).padStart(2, "0")}` });
  const { ctx, page } = await open(browser, "beton", "leo@orasso.local");

  // Explorer : 31 événements, 30 d'abord, « Voir la suite » garde les filtres et ajoute le dernier.
  await page.goto(`/app/media?onglet=explorer&q=${encodeURIComponent(tag)}`);
  await expect(page.getByTestId("media-event")).toHaveCount(30);
  await expect(page.getByTestId("media-results")).toContainText("30+");
  await page.getByTestId("media-explorer-more").click();
  await expect(page.getByTestId("media-event")).toHaveCount(31);
  await expect(page.getByTestId("media-explorer-more")).toHaveCount(0);
  await expect(page.getByLabel("Rechercher un événement")).toHaveValue(tag);

  // Panne : une demande refusée par l'API n'est pas « aucun résultat » ; « Réessayer » relance avec les mêmes filtres.
  await page.goto(`/app/media?onglet=explorer&q=${"x".repeat(100)}`);
  await expect(page.getByTestId("media-explorer-error")).toBeVisible();
  await expect(page.getByText("Rien par ici")).toHaveCount(0);
  await expect(page.getByTestId("media-explorer-retry")).toHaveAttribute("href", /q=x{100}/);
  await page.goto(`/app/media?onglet=explorer&q=${encodeURIComponent(tag)}`);
  await expect(page.getByTestId("media-explorer-error")).toHaveCount(0);

  // Galerie : « Publier » reste bloqué pendant l'envoi retardé d'une photo.
  await page.route("**/api/me/uploads", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.goto("/app/media?onglet=contenus");
  const form = page.getByTestId("media-content-form");
  await form.getByLabel("Titre").fill(`Galerie retardée ${unique()}`);
  await form.getByText("Galerie", { exact: true }).click();
  const picker = page.getByTestId("media-gallery-picker");
  const publish = page.getByTestId("media-publish");
  await picker.getByLabel("Choisir des photos").setInputFiles({
    name: "lente.png",
    mimeType: "image/png",
    buffer: await checkerPhoto(),
  });
  // Photo choisie, pas encore ajoutée : on ne publie pas.
  await expect(publish).toBeDisabled();
  await picker.getByRole("button", { name: "Poser un cadre" }).click();
  await picker.getByTestId("media-photo-blur").click();
  await expect(picker.getByTestId("media-photo-sending")).toBeVisible();
  await expect(publish).toBeDisabled();
  // Envoyée : l'aperçu montre les cadres pixellisés (image dessinée), « Publier » se libère.
  await expect(picker.getByText("Plaque floutée", { exact: true })).toBeVisible({ timeout: 30_000 });
  const preview = picker.getByTestId("media-gallery-sent").locator("img").first();
  expect(await preview.getAttribute("src")).toMatch(/^data:image\/jpeg/);
  await expect(publish).toBeEnabled();
  // Photo retirée : son envoi est supprimé côté serveur (il occupait le quota des envois en attente).
  const deleted = page.waitForResponse(
    (r) => r.url().includes("/api/me/uploads/") && r.request().method() === "DELETE",
  );
  await picker.getByRole("button", { name: "Retirer cette photo" }).click();
  expect((await deleted).status()).toBe(204);
  await expect(picker.getByTestId("media-gallery-sent")).toHaveCount(0);
  await ctx.close();
});

test("média : fiche avec galerie complète, suite au curseur au-delà de la 10e page et panne (relecture, tour 2)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const api = `http://localhost:${process.env.API_PORT ?? 3001}`;
  const origin = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const leo = await login("leo@orasso.local");
  const profile = await apiCall<{ profile: { id: string } | null }>(leo, "GET", "/me/media-profile");
  const mediaId = profile.data.profile?.id;
  const nocturne = await eventBySlug(leo, "nocturne-de-canet-2026");

  // Une galerie de 8 photos (plus de 6) et 12 liens : plus de 10 pages à 1 contenu par page.
  const photoKeys: string[] = [];
  const png = await checkerPhoto();
  for (let i = 0; i < 8; i++) {
    const body = new FormData();
    body.append("purpose", "media_content");
    body.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), `tour2-${i}.png`);
    const res = await fetch(`${api}/api/me/uploads`, { method: "POST", headers: { origin, cookie: leo }, body });
    expect(res.status, `envoi de la photo ${i}`).toBe(201);
    photoKeys.push(((await res.json()) as { key: string }).key);
  }
  const created: string[] = [];
  const galleryTitle = `Huit photos ${unique()}`;
  const gallery = await apiCall<{ id: string }>(leo, "POST", "/me/media-contents", {
    eventId: nocturne.id,
    kind: "gallery",
    title: galleryTitle,
    url: null,
    platform: "other",
    photoKeys,
  });
  expect(gallery.status).toBe(201);
  created.push(gallery.data.id);
  // Les 12 liens sont posés en base : l'API limite à 20 publications par jour et par média (`mediaContent`).
  const linkTag = `Lien ${unique()}`;
  const links = await sql<{ id: string }>(
    `insert into media_contents (media_profile_id, event_id, kind, title, url, platform, published_at)
     select $1, $2, 'link', $3 || ' ' || lpad(g::text, 2, '0'), 'https://example.org/article', 'website',
            now() - (g || ' minutes')::interval
     from generate_series(1, 12) g returning id`,
    [mediaId, nocturne.id, linkTag],
  );
  expect(links).toHaveLength(12);
  const all = await apiCall<unknown[]>(leo, "GET", "/me/media-contents");
  const total = all.data.length;
  expect(total).toBeGreaterThan(11);

  try {
    const { ctx, page } = await open(browser, "beton", "sofia@orasso.local");
    // Galerie complète : les 8 photos sont dans la grille, la visionneuse les parcourt.
    await page.goto(`/m/${mediaId}`);
    const card = page.getByTestId("media-public-content").filter({ hasText: galleryTitle });
    await expect(card.getByTestId("media-gallery-photo")).toHaveCount(8);
    await card.getByTestId("media-gallery-photo").nth(7).click();
    await expect(card.getByTestId("media-gallery-position")).toHaveText("8 / 8");
    await card.getByRole("button", { name: "Photo suivante" }).click();
    await expect(card.getByTestId("media-gallery-position")).toHaveText("1 / 8");
    await page.keyboard.press("Escape");
    await expect(card.getByTestId("media-gallery-viewer")).toBeHidden();

    // Suite au curseur, un contenu par page : on franchit la 10e page sans reboucler, sans doublon.
    await page.goto(`/m/${mediaId}?taille=1`);
    await expect(page.getByTestId("media-public-content")).toHaveCount(1);
    for (let n = 2; n <= total; n++) {
      await page.getByTestId("media-public-more").click();
      await expect(page.getByTestId("media-public-content")).toHaveCount(n);
    }
    await expect(page.getByTestId("media-public-more")).toHaveCount(0);
    const titles = await page.getByTestId("media-public-content").locator("h3").allTextContents();
    expect(new Set(titles).size).toBe(total);

    // Panne : un curseur refusé par l'API n'est pas « aucun contenu » ; « Réessayer » est proposé.
    await page.goto(`/m/${mediaId}?cursor=invalide`);
    await expect(page.getByTestId("media-public-error")).toBeVisible();
    await expect(page.getByTestId("media-public-retry")).toHaveAttribute("href", /cursor=invalide/);
    await page.goto(`/m/${mediaId}`);
    await expect(page.getByTestId("media-public-error")).toHaveCount(0);
    await expect(page.getByTestId("media-public-content").first()).toBeVisible();
    await ctx.close();
  } finally {
    for (const id of created) await apiCall(leo, "DELETE", `/me/media-contents/${id}`);
    await sql("delete from media_contents where id = any($1::uuid[])", [links.map((l) => l.id)]);
  }
});
test("accès refusés : staff sur Presse (403), non connecté sur /m/:id et /providers/:id (relecture)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const leo = await login("leo@orasso.local");
  const sofia = await login("sofia@orasso.local");
  const event = await createEvent(damien, { title: `Accès refusés ${unique()}` });

  // Julie est du staff de la structure : la page Presse est réservée à l'organisation.
  const j = await open(browser, "beton", "julie@orasso.local");
  const denied = await j.page.goto(`/orga/meditesportcar/e/${event.id}/presse`);
  expect(denied?.status()).toBe(403);
  await j.ctx.close();

  // Sans connexion : la fiche d'un média et la vitrine d'un prestataire renvoient vers la connexion.
  const media = await apiCall<{ profile: { id: string } | null }>(leo, "GET", "/me/media-profile");
  const provider = await apiCall<{ profile: { id: string } | null }>(sofia, "GET", "/me/provider-profile");
  const anon = await browser.newContext({ viewport: WIDE });
  const page = await anon.newPage();
  for (const path of [`/m/${media.data.profile?.id}`, `/providers/${provider.data.profile?.id}`]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/connexion/);
  }
  await anon.close();
});
