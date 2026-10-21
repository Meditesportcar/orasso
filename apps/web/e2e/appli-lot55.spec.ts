import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { MOBILE, SEED_PASSWORD } from "./helpers";
import { auditApp } from "./helpers/lot43";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot 55, côté appli (version web de recette) : la casquette Média. Léo (Sud Cars) a trois onglets remplis : Explorer
// (Chercher partout en France avec « Accréditation ouverte », région, temps de route estimé, demande d'accréditation par
// la feuille, Garder, Mon agenda), Presse (tickets accréditée, en attente, refusée ; Mon badge presse, Consignes, passées
// avec les vues) et Contenus (compteurs, ajout d'un lien, modification). La fiche événement propose « Demander une
// accréditation » / « Mon accréditation » et montre les contenus mis en avant à tous les profils. Un autre compte crée son
// profil média depuis Créer (sans numéro de carte de presse, D26). Deux thèmes, captures à 390 px, audit des règles du
// système de design sur chaque écran.
// Lancer avec APP_URL=http://localhost:8401 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée. Les
// tests modifient la base (demandes, contenus, profil créé) : relancer `pnpm db:seed --reset` avant de rejouer.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-55-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 20_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme, reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP, reducedMotion });
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

/** Casquette Média : depuis Mon profil, la ligne « Média · <nom> » ouvre sa barre (Explorer · Presse · Accueil · Contenus · Profil). */
async function toMedia(page: Page) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-media").first().click();
  await page.waitForURL(/\/accueil/, { timeout: 60_000 });
  await expect(page.getByRole("tab", { name: "Presse", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function tab(page: Page, label: string) {
  await page.getByRole("tab", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

/**
 * Contraste minimal (3 : texte large et gras des boutons) entre le texte de chaque bouton visible et son fond réel (le
 * premier fond opaque en remontant les parents). Attrape un bouton sans fond (« secondary » : encre) posé sur une plaque
 * sombre, illisible en Sable.
 */
async function lowContrastButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) } : null;
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bad: string[] = [];
    for (const el of document.querySelectorAll('[role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right < 0 || r.left > window.innerWidth) continue;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (el.closest('[aria-hidden="true"]') || el.closest('[role="tablist"]') || r.bottom <= 72) continue;
      const label = el.querySelector("div[dir]");
      if (!label || !(label.textContent ?? "").trim()) continue;
      // Les boutons du système ont leur étiquette en Archivo large (Expanded) ; les pastilles et les cartes non.
      if (!/Expanded/.test(getComputedStyle(label).fontFamily)) continue;
      const fg = parse(getComputedStyle(label).color);
      let bg: ReturnType<typeof parse> = null;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.5) {
          bg = c;
          break;
        }
      }
      if (!fg || !bg) continue;
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05);
      if (ratio < 3) bad.push(`${(el.textContent ?? "").trim().slice(0, 40)} (${ratio.toFixed(1)})`);
    }
    return bad;
  });
}

/** Règles du système de design à l'écran : un seul primaire, un seul néon, icône partout, pas de vert, pas de défilement horizontal. */
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
  expect(await lowContrastButtons(page), `${name} : texte de bouton lisible sur son fond`).toEqual([]);
}

async function closeSheet(page: Page) {
  await page
    .getByRole("button", { name: "Fermer", exact: true })
    .last()
    .click({ position: { x: 60, y: 15 } });
  await page.waitForTimeout(400);
}

/** Les écrans d'une casquette média ne mènent à aucun écran de passionné (exposant). */
async function noFanScreen(page: Page) {
  for (const label of ["Sorties", "Garage", "Passeport"]) {
    await expect(page.getByRole("tab", { name: label, exact: true }), `onglet ${label}`).toHaveCount(0);
  }
}

for (const theme of THEMES) {
  test(`Léo : Explorer, Presse, Contenus, la barre et le logo restent (${theme})`, async ({ browser }) => {
    test.setTimeout(420_000);
    const { ctx, page } = await open(browser, theme);
    // Une passe précédente a pu garder des événements : on repart d'un agenda sans « gardé ».
    await sql("delete from media_saved_events");
    await signIn(page, "leo@orasso.local");
    await toMedia(page);
    await noFanScreen(page);

    // --- Explorer : Chercher ---------------------------------------------------------------------------------------------
    await tab(page, "Explorer");
    await expect(page.getByRole("heading", { name: "Explorer", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Toute la France", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Chercher", { exact: true })).toBeVisible();
    await expect(page.getByText("Mon agenda", { exact: true })).toBeVisible();
    // « Accréditation ouverte » est actif par défaut : la Nocturne (accréditée), Toulouse, Montpellier, Narbonne…
    const nocturne = page.getByTestId("media-event").filter({ hasText: "Nocturne de Canet" });
    await expect(nocturne).toBeVisible({ timeout: 30_000 });
    await expect(nocturne.getByText("Accréditée", { exact: true })).toBeVisible();
    const toulouse = page.getByTestId("media-event").filter({ hasText: "Toulouse" }).first();
    await expect(toulouse).toBeVisible();
    // Temps de route estimé (« ≈ 3 h de route »), fourni par l'API depuis le secteur du média.
    await expect(toulouse.getByText(/≈ .*(h|min)/)).toBeVisible();
    await expect(page.getByText(/événements? avec accréditation ouverte, par date/)).toBeVisible();
    await expect(page.getByTestId("media-loading")).toHaveCount(0);
    await shot(page, "explorer-chercher", theme);
    await rules(page, theme, "Explorer");

    // Région : l'Occitanie garde Toulouse et Montpellier, écarte Narbonne (Aude, Occitanie aussi) — la région Provence écarte tout.
    await page.getByText("Provence-Alpes-Côte d'Azur", { exact: true }).click();
    await expect(page.getByTestId("media-event")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("Rien par ici")).toBeVisible();
    await page.getByText("Occitanie", { exact: true }).click();
    await expect(toulouse).toBeVisible({ timeout: 15_000 });
    await page.getByText("Toute la France", { exact: true }).first().click();

    // La demande d'accréditation : feuille, formats, règlement, envoi.
    await expect(toulouse).toBeVisible({ timeout: 15_000 });
    await toulouse.getByTestId("media-request").click();
    await expect(page.getByText("Demander une accréditation", { exact: true })).toBeVisible();
    await expect(page.getByText("Ce que tu produis", { exact: true })).toBeVisible();
    await expect(page.getByTestId("media-request-rules")).toBeVisible({ timeout: 15_000 });
    const send = page.getByTestId("media-request-send");
    await expect(send).toBeDisabled();
    await shot(page, "demande-feuille", theme);
    await page.getByText(/En envoyant ta demande/).click();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByTestId("media-request-sent")).toBeVisible({ timeout: 30_000 });
    await shot(page, "demande-envoyee", theme);
    await closeSheet(page);
    // La carte dit maintenant « En attente ».
    await expect(toulouse.getByText("En attente", { exact: true })).toBeVisible({ timeout: 20_000 });

    // Garder un événement : le cœur plein, puis il apparaît dans Mon agenda.
    const montpellier = page.getByTestId("media-event").filter({ hasText: "Montpellier" }).first();
    await montpellier.getByTestId("media-keep").click();
    await expect(montpellier.getByText("Gardé", { exact: true })).toBeVisible({ timeout: 15_000 });

    // --- Explorer : Mon agenda -------------------------------------------------------------------------------------------
    await page.getByText("Mon agenda", { exact: true }).click();
    await expect(page.getByText(/Les événements que tu couvres ou que tu as gardés/)).toBeVisible();
    await expect(page.getByTestId("media-week")).toBeVisible();
    await expect(page.getByText("Cette semaine", { exact: true })).toBeVisible();
    await expect(page.getByTestId("media-agenda-event").filter({ hasText: "Nocturne de Canet" })).toBeVisible();
    await expect(page.getByText("Plus tard", { exact: true })).toBeVisible();
    await expect(page.getByTestId("media-agenda-event").filter({ hasText: "Montpellier" })).toBeVisible();
    await shot(page, "explorer-agenda", theme);
    await rules(page, theme, "Mon agenda");

    // --- Presse ------------------------------------------------------------------------------------------------------------
    await tab(page, "Presse");
    await expect(page.getByRole("heading", { name: "Accréditations", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/^À venir · \d+$/)).toBeVisible();
    await expect(page.getByText(/^Passées · \d+$/)).toBeVisible();
    const accredited = page.getByTestId("media-ticket-accepted").filter({ hasText: "Nocturne de Canet" });
    await expect(accredited).toBeVisible({ timeout: 30_000 });
    await expect(accredited.getByText("Accréditée", { exact: true })).toBeVisible();
    await expect(accredited.getByText(/Badge presse · zone piste/)).toBeVisible();
    await expect(accredited.getByTestId("media-badge")).toBeVisible();
    const pending = page.getByTestId("media-ticket-pending").filter({ hasText: "C&C Perpignan" });
    await expect(pending).toBeVisible();
    await expect(pending.getByText(/Demande envoyée le/)).toBeVisible();
    const refused = page.getByTestId("media-ticket-refused").filter({ hasText: "Expo Rivesaltes" });
    await expect(refused.getByText(/Quota presse atteint/)).toBeVisible();
    await shot(page, "presse-a-venir", theme);
    await rules(page, theme, "Presse");

    // Consignes : zones, consignes écrites et contact de l'organisation.
    await accredited.getByTestId("media-briefing").click();
    const brief = page.getByLabel("Consignes", { exact: true });
    await expect(brief.getByText(/Gilet presse obligatoire/)).toBeVisible();
    await expect(brief.getByText(/Damien, à l'accueil nord/)).toBeVisible();
    await shot(page, "presse-consignes", theme);
    await closeSheet(page);

    // Retirer la demande envoyée à Toulouse.
    const toulouseTicket = page.getByTestId("media-ticket-pending").filter({ hasText: "Toulouse" });
    await expect(toulouseTicket).toBeVisible();
    await toulouseTicket.getByTestId("media-withdraw").click();
    await expect(page.getByText("Retirer ma demande ?")).toBeVisible();
    await page.getByTestId("media-withdraw-confirm").click();
    await expect(page.getByTestId("media-ticket-pending").filter({ hasText: "Toulouse" })).toHaveCount(0, {
      timeout: 20_000,
    });

    // Passées : ce qui a été publié et les vues.
    await page.getByText(/^Passées · \d+$/).click();
    const past = page.getByTestId("media-ticket-past").filter({ hasText: "Béziers Night" });
    await expect(past).toBeVisible();
    await expect(past.getByText(/Couvert · 2 contenus/)).toBeVisible();
    await expect(past.getByText(/1\s070 vues depuis la page de l'événement/)).toBeVisible();
    await shot(page, "presse-passees", theme);

    // Mon badge presse : le QR du jour J (variante média), puis retour.
    await page.getByText(/^À venir · \d+$/).click();
    await page
      .getByTestId("media-ticket-accepted")
      .filter({ hasText: "Nocturne de Canet" })
      .getByTestId("media-badge")
      .click();
    await page.waitForURL(/jour-j\//, { timeout: 30_000 });
    // Le kit du badge est enregistré sur le téléphone ; le mode s'ouvre la veille, l'écran dit l'événement.
    await expect(page.getByText("Ton QR est prêt", { exact: true })).toBeVisible({ timeout: 30_000 });
    await shot(page, "badge-presse", theme);
    await page.goBack();
    await expect(page.getByRole("tab", { name: "Presse", exact: true })).toBeVisible({ timeout: 30_000 });

    // --- Contenus -----------------------------------------------------------------------------------------------------------
    await tab(page, "Contenus");
    await expect(page.getByRole("heading", { name: "Contenus", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("media-stats")).toBeVisible();
    await expect(page.getByText("Vues depuis Orasso", { exact: true })).toBeVisible();
    await expect(page.getByText(/^1\s070$/)).toBeVisible();
    const group = page.getByTestId("media-group").filter({ hasText: "Béziers Night" });
    await expect(group).toBeVisible();
    await expect(group.getByText("Mis en avant sur la page", { exact: true })).toBeVisible();
    await expect(group.getByText(/Vidéo · Le roll de minuit/)).toBeVisible();
    await expect(group.getByText(/YouTube · 460 vues/)).toBeVisible();
    await expect(group.getByText(/Article · La nuit des japonaises/)).toBeVisible();
    await expect(group.getByText(/sudcars\.example · 610 vues/)).toBeVisible();
    await shot(page, "contenus", theme);
    await rules(page, theme, "Contenus");

    // Ajouter un lien sur la Nocturne (accréditée).
    await page.getByTestId("media-add").click();
    await expect(page.getByText("Ce que tu ajoutes", { exact: true })).toBeVisible();
    const publish = page.getByTestId("media-publish");
    await expect(publish).toBeDisabled();
    // Le dernier événement commencé est choisi d'office (Béziers Night) ; la Nocturne se choisit d'une touche.
    await page.getByLabel("Ajouter un contenu").getByText("Nocturne de Canet", { exact: true }).click();
    await page.getByLabel("Titre").fill(`Reportage de la nuit ${theme}`);
    await page.getByTestId("media-url").fill("sudcars.example/nocturne-canet");
    await expect(publish).toBeEnabled();
    await shot(page, "contenus-ajout", theme);
    await publish.click();
    const added = page.getByTestId("media-group").filter({ hasText: "Nocturne de Canet" });
    await expect(added.getByText(new RegExp(`Article · Reportage de la nuit ${theme}`))).toBeVisible({
      timeout: 30_000,
    });
    // Modifier : le titre change.
    await added.getByTestId("media-content").first().click();
    await expect(page.getByText("Modifier le contenu", { exact: true })).toBeVisible();
    await page.getByLabel("Titre").fill(`Nocturne, le reportage ${theme}`);
    await page.getByTestId("media-edit-save").click();
    await expect(page.getByText(new RegExp(`Nocturne, le reportage ${theme}`))).toBeVisible({ timeout: 30_000 });
    await shot(page, "contenus-apres", theme);

    // --- Profil : la ligne de la casquette ----------------------------------------------------------------------------------
    await tab(page, "Profil");
    await expect(page.getByTestId("casquette-quick-media-profile")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("casquette-quick-media-profile").getByText("Profil vérifié")).toBeVisible();
    await expect(page.getByTestId("casquette-quick-press")).toBeVisible();
    await expect(page.getByTestId("casquette-quick-contents")).toBeVisible();
    // Aucun écran de passionné : ni points, ni crew, ni véhicules archivés.
    await expect(page.getByTestId("profil-points")).toHaveCount(0);
    await expect(page.getByTestId("profil-crew")).toHaveCount(0);
    await expect(page.getByTestId("profil-archived")).toHaveCount(0);
    await shot(page, "profil", theme);
    await rules(page, theme, "Profil");
    await noFanScreen(page);

    // Modifier mon profil média : pas de numéro de carte de presse, liens, zone couverte.
    await page.getByTestId("casquette-quick-media-profile").click();
    await expect(page.getByRole("heading", { name: "Profil média", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    // Le profil est vérifié : l'appli dit, avant l'enregistrement, que changer l'identité relance la vérification.
    await expect(page.getByTestId("media-reverify")).toBeVisible();
    await expect(page.getByLabel("Nom du média")).toHaveValue("Sud Cars");
    await expect(page.getByText(/carte de presse/i)).toHaveCount(1); // la seule mention : « Aucun numéro de carte de presse n'est demandé ».
    await expect(page.getByText(/numéro de carte de presse n'est demandé/)).toBeVisible();
    await shot(page, "profil-media", theme);
    await ctx.close();
  });

  test(`Fiche événement : accréditation, contenus pour tous les profils (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "leo@orasso.local");
    await toMedia(page);

    // Un événement ouvert : « Demander une accréditation » (action principale) et la feuille.
    await page.goto("/e/rassemblement-narbonne");
    await afterOpening(page);
    const primary = page.getByTestId("event-primary");
    await expect(primary).toBeVisible({ timeout: 30_000 });
    await expect(primary).toContainText("Demander une accréditation");
    await shot(page, "fiche-demander", theme);
    await primary.click();
    await expect(page.getByTestId("media-request-rules")).toBeVisible({ timeout: 15_000 });
    await closeSheet(page);

    // Accréditée : « Mon accréditation » mène à Presse.
    await page.goto("/e/nocturne-de-canet-2026");
    await afterOpening(page);
    await expect(page.getByTestId("event-primary")).toContainText("Mon accréditation", { timeout: 30_000 });
    await shot(page, "fiche-mon-accreditation", theme);
    await page.getByTestId("event-primary").click();
    await expect(page.getByTestId("media-ticket-accepted").first()).toBeVisible({ timeout: 30_000 });

    // Les contenus mis en avant d'abord, sur la fiche d'un événement couvert.
    await page.goto("/e/beziers-night-2026");
    await afterOpening(page);
    const contents = page.getByTestId("event-media-contents");
    await expect(contents).toBeVisible({ timeout: 30_000 });
    await contents.scrollIntoViewIfNeeded();
    const rows = contents.getByTestId("event-media-content");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Le roll de minuit");
    await expect(rows.first()).toContainText("Mis en avant");
    await expect(rows.first()).toContainText("par Sud Cars");
    await shot(page, "fiche-contenus", theme);
    await rules(page, theme, "Fiche événement");
    await ctx.close();

    // Un exposant (autre profil) voit les mêmes contenus.
    const other = await open(browser, theme);
    await signIn(other.page, "kenji@orasso.local");
    await other.page.goto("/e/beziers-night-2026");
    await afterOpening(other.page);
    await expect(other.page.getByTestId("event-media-contents")).toBeVisible({ timeout: 30_000 });
    await expect(other.page.getByTestId("event-media-content")).toHaveCount(2);
    await other.ctx.close();
  });

  test(`Un autre compte crée son profil média depuis Créer (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const email = theme === "beton" ? "nina@orasso.local" : "lea@orasso.local";
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);
    await page.goto("/moi");
    await afterOpening(page);
    await expect(page.getByTestId("casquette-media")).toHaveCount(0);
    await page.getByTestId("profil-create").click();
    await expect(page.getByTestId("casquette-create-media")).toBeVisible();
    await shot(page, "creer-feuille", theme);
    await page.getByTestId("casquette-create-media").click();
    await expect(page.getByRole("heading", { name: "Profil média", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    // Pas de carte de presse demandée (D26) ; les formats et un lien sont nécessaires pour demander une accréditation.
    await expect(page.getByLabel(/carte de presse/i)).toHaveCount(0);
    await page.getByTestId("media-name").fill(`Média ${theme}`);
    await page.getByText("Photo", { exact: true }).click();
    await page.getByTestId("media-website").fill("exemple-media.fr");
    // Le champ qui vient d'être rempli garde le focus (et son halo) : on le quitte avant de relever les règles.
    await page.getByTestId("media-website").blur();
    await shot(page, "profil-creation", theme);
    await rules(page, theme, "Création du profil média");
    await page.getByTestId("media-profile-submit").click();
    // La casquette Média s'ouvre sur son Accueil, avec sa barre.
    await page.waitForURL(/\/accueil/, { timeout: 60_000 });
    await expect(page.getByRole("tab", { name: "Presse", exact: true })).toBeVisible({ timeout: 30_000 });
    await tab(page, "Presse");
    await expect(page.getByText("Aucune accréditation à venir", { exact: true })).toBeVisible({ timeout: 30_000 });
    await shot(page, "presse-vide", theme);
    await tab(page, "Contenus");
    await expect(page.getByTestId("media-stats")).toBeVisible({ timeout: 30_000 });
    await shot(page, "contenus-vide", theme);
    // Le profil est en base, sans numéro de carte de presse.
    const rows = await sql<{ name: string; press_card_number: string | null; press_card_verified_at: Date | null }>(
      "select name, press_card_number, press_card_verified_at from media_profiles where name = $1",
      [`Média ${theme}`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.press_card_number).toBeNull();
    expect(rows[0]?.press_card_verified_at).toBeNull();
    await ctx.close();
  });
}
