import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import {
  addVehicleApi,
  apiCall,
  createEvent,
  createPublishedPro,
  login,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  unique,
} from "./helpers";

// Lot 35c, parité de l'appli (D20), version web de recette : billetterie de l'organisateur (billet gratuit, billet
// payant, compte Stripe simulé côté API), fiche pro (modification, remise, publication, photo, partenaire, SIRET,
// publications modifiées puis supprimées, abonnement en consultation), compte (newsletter, export, clés d'accès) et
// garage (certification, transfert de plaque, suppression). Captures et contrôle du système de design dans les deux
// thèmes, à 390 px. Lancer avec APP_URL=http://localhost:8168 (Metro avec EXPO_PUBLIC_API_URL et CORS_ORIGINS posés) et
// l'API lancée avec des variables Stripe factices (jamais de vraie clé) : STRIPE_SECRET_KEY=sk_test_recette…,
// STRIPE_WEBHOOK_SECRET=whsec_recette…, STRIPE_CONNECT_CLIENT_ID=ca_recette…, GEOCODER_URL=off.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-35c-captures";
test.skip(!APP, "Appli : lancer avec APP_URL");
// Une action qui n'aboutit pas échoue en 30 s au lieu d'attendre la fin du test.
test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["sable", "beton"];

type Audit = {
  horizontalScroll: boolean;
  clipped: string[];
  greens: string[];
  truncated: string[];
  buttonsWithoutIcon: string[];
};
const audits: Record<string, Audit> = {};
const consoleErrors: string[] = [];

/** Règles du système de design lisibles dans le DOM de l'appli web (CLAUDE.md, règle 2). */
async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
    };
    const all = [...document.querySelectorAll("body *")].filter(visible);
    const isGreen = (color: string) => {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return false;
      const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      if (a < 0.2) return false;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 40 || max !== g) return false;
      let h = 60 * ((b - r) / (max - min)) + 120;
      if (h < 0) h += 360;
      return h > 85 && h < 165;
    };
    const greens = new Set<string>();
    for (const el of all) {
      const s = getComputedStyle(el);
      for (const c of [s.color, s.backgroundColor, s.borderTopColor]) if (isGreen(c)) greens.add(`${el.tagName} ${c}`);
    }
    const label = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const clamp = (el: Element) => {
      const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitLineClamp?: string };
      return s.webkitLineClamp && s.webkitLineClamp !== "none";
    };
    // Un élément qui dépasse le bord droit de l'écran (hors zone qui défile à l'horizontale) est un bouton ou un champ coupé.
    const scrollsX = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
      return false;
    };
    // (Le fond décoratif déborde exprès : on ne regarde que le texte, les boutons et les champs.)
    const clipped = all
      .filter(
        (el) =>
          el.getBoundingClientRect().right > window.innerWidth + 1 &&
          !scrollsX(el) &&
          (el.children.length === 0
            ? label(el) !== ""
            : ["button", "checkbox", "combobox"].includes(el.getAttribute("role") ?? "") || el.tagName === "INPUT"),
      )
      .map((el) => `${el.getAttribute("role") ?? el.tagName} ${label(el)}`);
    return {
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      clipped: clipped.slice(0, 10),
      greens: [...greens].slice(0, 10),
      truncated: all
        .filter(
          (el) =>
            (getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) ||
            (clamp(el) && el.scrollHeight > el.clientHeight + 1),
        )
        .map(label),
      // Un bouton du système (48 px, libellé en capitales) porte toujours une icône ; les chips (34 px), les lignes
      // cliquables (casquettes) et le voile d'une feuille (sans texte) ne sont pas des boutons du système.
      buttonsWithoutIcon: all
        .filter(
          (el) =>
            el.getAttribute("role") === "button" &&
            el.getBoundingClientRect().height >= 44 &&
            !el.querySelector("svg") &&
            (() => {
              const leaves = [...el.querySelectorAll("*")].filter(
                (c) => c.children.length === 0 && c.textContent?.trim(),
              );
              return leaves.length > 0 && leaves.every((c) => getComputedStyle(c).textTransform === "uppercase");
            })(),
        )
        .map(label),
    };
  });
}

async function shot(page: Page, name: string, theme: Theme) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
  audits[`${name}-${theme}`] = await audit(page);
}

/** Place un élément en haut de la zone qui défile avant une capture. */
async function reveal(_page: Page, locator: ReturnType<Page["getByTestId"]>) {
  await locator.first().scrollIntoViewIfNeeded();
  await locator.first().evaluate((node) => node.scrollIntoView({ block: "start" }));
}

async function openApp(browser: Browser, email: string, theme: Theme): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function chooseCasquette(page: Page, kind: "organizer" | "pro", name?: string) {
  await page.getByRole("button", { name: "Moi et mes casquettes" }).click();
  const entry = page.getByTestId(`casquette-${kind}`);
  await (name ? entry.filter({ hasText: name }) : entry).first().click();
  await page.waitForURL(kind === "organizer" ? /\/direct/ : /\/scanner/, { timeout: 20_000 });
}

async function db<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

test.afterAll(() => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
});

test("billetterie : billet gratuit configuré, billet payant avec compte Stripe simulé", async ({ browser }) => {
  test.setTimeout(420_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  // Sans variables Stripe factices côté API, la billetterie payante est « bientôt » : la recette ne s'applique pas
  // (lot 34 : sautée proprement au lieu d'échouer dans une recette complète sans Stripe).
  const settings = await apiCall<{ stripe: { configured: boolean } }>(damien, "GET", "/admin/settings");
  test.skip(!settings.data.stripe?.configured, "API à lancer avec STRIPE_* factices (voir l'en-tête du fichier)");
  const free = await createEvent(damien, { publicAccess: "free_reservation", title: `Billets gratuits ${unique()}` });
  const paid = await createEvent(damien, { publicAccess: "paid_orasso", title: `Billets payants ${unique()}` });
  const closed = await createEvent(damien, { publicAccess: "free", title: `Entrée libre ${unique()}` });
  await db((c) => c.query("update structures set stripe_account_id = null where slug = 'meditesportcar'"));

  for (const theme of THEMES) {
    const { ctx, page } = await openApp(browser, "damien@orasso.local", theme);
    await chooseCasquette(page, "organizer", "MéditeSportCar");
    const first = theme === "sable";

    // Billet gratuit : types, places, ouverture.
    await page.goto(`/evenement/${free.id}`);
    await page.getByTestId("orga-ticketing").click();
    await expect(page.getByTestId("ticketing-form")).toBeVisible({ timeout: 30_000 });
    if (first) {
      await expect(page.getByTestId("ticketing")).toContainText("La billetterie n'est pas ouverte");
      await expect(page.getByTestId("stripe")).toHaveCount(0);
      await page.getByRole("checkbox", { name: "Ouvrir la billetterie pour cet événement" }).click();
      await page.getByTestId("ticketing-name").fill("Pass visiteur");
      await page.getByTestId("ticketing-capacity").fill("30");
      await page.getByTestId("ticketing-save").click();
      await expect(page.getByTestId("ticketing-notice")).toHaveText("Billetterie enregistrée.", { timeout: 20_000 });
      await expect(page.getByTestId("ticketing")).toContainText("Ouverte");
      const view = await apiCall<{
        enabled: boolean;
        capacity: number | null;
        name: string;
        priceCents: number | null;
      }>(damien, "GET", `/events/${free.id}/ticketing`);
      expect(view.data).toMatchObject({ enabled: true, capacity: 30, name: "Pass visiteur", priceCents: null });
      // Une capacité invalide est refusée avant l'envoi.
      await page.getByTestId("ticketing-capacity").fill("0");
      await page.getByTestId("ticketing-save").click();
      await expect(page.getByText(/Places pour les visiteurs : un nombre entier/)).toBeVisible();
      await page.getByTestId("ticketing-capacity").fill("30");
    }
    await shot(page, "01-billetterie-gratuite", theme);

    // Billet payant : prix, compte Stripe à connecter, parcours dans le navigateur, état relu au retour.
    await page.goto(`/evenement/${paid.id}`);
    await page.getByTestId("orga-ticketing").click();
    await expect(page.getByTestId("ticketing-price")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("stripe-not-connected")).toBeVisible();
    if (first) {
      await page.getByRole("checkbox", { name: "Ouvrir la billetterie pour cet événement" }).click();
      await page.getByTestId("ticketing-save").click();
      await expect(page.getByText("Indique le prix du billet.")).toBeVisible();
      await page.getByTestId("ticketing-price").fill("12,50");
      await page.getByTestId("ticketing-save").click();
      await expect(page.getByTestId("ticketing-notice")).toHaveText("Billetterie enregistrée.", { timeout: 20_000 });
      const view = await apiCall<{ enabled: boolean; priceCents: number | null; block: string | null }>(
        damien,
        "GET",
        `/events/${paid.id}/ticketing`,
      );
      expect(view.data).toMatchObject({ enabled: true, priceCents: 1250 });
      // Le parcours Stripe s'ouvre dans un autre onglet (navigateur du téléphone) ; Stripe est simulé, aucun réseau.
      await ctx.route(/connect\.stripe\.com/, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Stripe simulé</body></html>" }),
      );
      const opened = ctx.waitForEvent("page");
      await page.getByTestId("stripe-connect").click();
      const stripe = await opened;
      await stripe.waitForLoadState("domcontentloaded").catch(() => undefined);
      expect(stripe.url()).toContain("connect.stripe.com/oauth/authorize");
      expect(stripe.url()).toContain("client_id=ca_recette");
      await stripe.close();
      await expect(page.getByTestId("stripe-refresh")).toBeVisible();
      // Compte connecté simulé côté base, puis relu au retour dans l'appli.
      await db((c) =>
        c.query("update structures set stripe_account_id = 'acct_recette35c1234' where slug = 'meditesportcar'"),
      );
      await page.getByTestId("stripe-refresh").click();
      await expect(page.getByTestId("stripe-connected")).toHaveText("acct_…1234", { timeout: 20_000 });
      await shot(page, "02-billetterie-payante-connectee", theme);
      // Déconnexion : feuille de confirmation d'abord (on n'appelle pas Stripe, même factice).
      await page.getByTestId("stripe-disconnect").click();
      await expect(page.getByText("Déconnecter le compte Stripe ?")).toBeVisible();
      await page.getByRole("button", { name: "Annuler" }).click();
      await expect(page.getByTestId("stripe-connected")).toBeVisible();
      await db((c) => c.query("update structures set stripe_account_id = null where slug = 'meditesportcar'"));
      await page
        .getByTestId("stripe-refresh")
        .click()
        .catch(() => undefined);
    } else {
      await shot(page, "02-billetterie-payante", theme);
    }

    // Accès du public sans billetterie : l'écran l'explique.
    await page.goto(`/evenement/${closed.id}`);
    await page.getByTestId("orga-ticketing").click();
    await expect(page.getByText(/Pour ouvrir la billetterie Orasso/)).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  }
  // Droits : un passionné sans casquette Organisateur n'a pas l'API de la billetterie.
  const fan = await signUpApi(`FanBillets_${unique()}`);
  expect((await apiCall(fan, "GET", `/events/${free.id}/ticketing`)).status).toBe(403);
});

test("billets du public : réserver dans l'appli, QR dans Mes billets, rendre un billet (lot 34)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const ev = await createEvent(damien, { publicAccess: "free_reservation", title: `Billets appli ${unique()}` });
  const opened = await apiCall(damien, "PUT", `/events/${ev.id}/ticketing`, { enabled: true, capacity: 3 });
  expect(opened.status).toBe(200);
  const pseudo = `Visiteur_${unique()}`.slice(0, 24);
  const fan = await signUpApi(pseudo);
  const { ctx, page } = await openApp(browser, `${pseudo.toLowerCase()}@e2e.orasso.test`, "sable");
  await page.goto(`/e/${ev.slug}`);
  const block = page.getByTestId("ticket-block");
  await expect(block).toContainText("Billets visiteurs", { timeout: 30_000 });
  await expect(block).toContainText("3 places restantes");
  await block.getByLabel("2 billets").click();
  await shot(page, "03-billets-reserver", "sable");
  await page.getByTestId("ticket-reserve").click();
  await page.waitForURL(/billets/, { timeout: 30_000 });
  await expect(page.getByText("Réservation confirmée").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ticket")).toHaveCount(2);
  await expect(page.getByTestId("ticket-qr").first()).toBeVisible();
  await shot(page, "04-mes-billets", "sable");
  await page.getByTestId("ticket-give-back").first().click();
  await page.getByRole("button", { name: "Rendre ce billet" }).filter({ visible: true }).last().click();
  await expect(page.getByText("Billet rendu : la place est libérée.").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ticket")).toHaveCount(1);
  const mine = await apiCall<{ status: string }[]>(fan, "GET", "/me/tickets");
  expect(mine.data.filter((t) => t.status === "valid")).toHaveLength(1);
  // Accès : un raccourci vers Mes billets.
  await page.goto("/acces");
  await expect(page.getByTestId("my-tickets")).toContainText("Mes billets · 1", { timeout: 30_000 });
  await ctx.close();
});

test("pro : créer sa fiche depuis Mes casquettes (lot 34)", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const pseudo = `FicheApp_${unique()}`.slice(0, 24);
  await signUpApi(pseudo);
  const { ctx, page } = await openApp(browser, `${pseudo.toLowerCase()}@e2e.orasso.test`, "sable");
  await page.getByRole("button", { name: "Moi et mes casquettes" }).click();
  await page.getByTestId("casquette-create-pro").click();
  await page.waitForURL(/pro-nouvelle/, { timeout: 20_000 });
  await expect(page.getByTestId("pro-form")).toBeVisible({ timeout: 30_000 });
  // Formulaire refusé sans activité (règle du site), puis créé.
  await page.getByLabel("Nom de l'activité").fill(`Atelier ${pseudo}`);
  await page.getByTestId("pro-form-save").click();
  await expect(page.getByText("Choisis au moins une activité.")).toBeVisible();
  await page.getByTestId("pro-form").getByText("Covering", { exact: true }).click();
  await page.getByLabel("Ville").first().fill("Perpignan");
  await shot(page, "00-creer-fiche-pro", "sable");
  await page.getByTestId("pro-form-save").click();
  await page.waitForURL(/\/fiche/, { timeout: 30_000 });
  await expect(page.getByText("Fiche pro créée.").first()).toBeVisible({ timeout: 20_000 });
  const cookie = await login(`${pseudo.toLowerCase()}@e2e.orasso.test`);
  const mine = await apiCall<{ name: string } | null>(cookie, "GET", "/me/pro");
  expect(mine.data?.name).toBe(`Atelier ${pseudo}`);
  await ctx.close();
});

test("pro : fiche, remise, publication, photo, partenaire, SIRET, publications, abonnement en consultation", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const pseudo = `ProApp_${s}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const pro = await createPublishedPro(cookie, `Atelier parité ${s}`);
  const fan = await signUpApi(`FanPro_${s}`);
  expect((await apiCall(fan, "PATCH", `/pros/${pro.id}`, { name: "Piraté" })).status).toBe(403);

  for (const theme of THEMES) {
    const { ctx, page } = await openApp(browser, email, theme);
    await chooseCasquette(page, "pro");
    const first = theme === "sable";
    await page.goto("/fiche");
    await expect(page.getByTestId("pro-edit")).toBeVisible({ timeout: 30_000 });

    // Abonnement et emplacements sponsorisés : consultation seulement, jamais de paiement.
    await expect(page.getByTestId("pro-subscription")).toHaveText("Gratuit jusqu'au 21 juin 2027");
    const body = (await page.locator("body").textContent()) ?? "";
    expect(body).not.toMatch(/€|\bprix\b|stripe|checkout/i);
    await expect(page.getByRole("button", { name: /payer|acheter|souscrire|s'abonner/i })).toHaveCount(0);
    await expect(page.getByTestId("pro-sponsored")).toBeVisible();
    await shot(page, "03-pro-fiche", theme);

    if (first) {
      // Modifier la fiche.
      await page.getByTestId("pro-edit").click();
      await expect(page.getByTestId("pro-form")).toBeVisible();
      await page.getByLabel("Présentation").fill("Entretien, préparation et detailing, sur rendez-vous.");
      await page.getByLabel("Téléphone").fill("04 68 11 22 33");
      await page.getByLabel("Instagram").fill("instagram.com/atelier.parite");
      await page.getByLabel("Lundi").fill("9h-12h / 14h-18h");
      await shot(page, "04-pro-modifier", theme);
      await page.getByTestId("pro-form-save").click();
      await expect(page.getByTestId("pro-form-notice")).toHaveText("Fiche enregistrée.", { timeout: 20_000 });
      const mine = await apiCall<{
        description: string | null;
        phone: string | null;
        socials: Record<string, string>;
        hours: Record<string, string>;
      }>(cookie, "GET", "/me/pro");
      expect(mine.data.description).toBe("Entretien, préparation et detailing, sur rendez-vous.");
      expect(mine.data.phone).toBe("04 68 11 22 33");
      expect(mine.data.socials.instagram).toBe("https://instagram.com/atelier.parite");
      expect(mine.data.hours.mon).toBe("9h-12h / 14h-18h");
      // Une zone invalide est refusée avant l'envoi.
      await page.getByLabel("Zone d'intervention").fill("66, nimportequoi");
      await page.getByTestId("pro-form-save").click();
      await expect(page.getByText(/Zone d'intervention : codes de département/)).toBeVisible();
      await page.getByRole("button", { name: "Retour à la fiche" }).click();
      await page.waitForURL(/\/fiche/);

      // Remise.
      await page.getByTestId("pro-discounts-edit").click();
      await page.getByLabel("Rodage (%)").fill("7");
      await page.getByTestId("pro-discounts-save").click();
      await expect(page.getByTestId("pro-discounts")).toContainText("−7 %", { timeout: 20_000 });
      const discounts = await apiCall<{ discounts: Record<string, number> }>(cookie, "GET", "/me/pro");
      expect(discounts.data.discounts.rodage).toBe(7);

      // Publication : brouillon avec confirmation, puis republication.
      await page.getByTestId("pro-unpublish").click();
      await page.getByTestId("orga-confirm").click();
      await expect(page.getByTestId("pro-publish-notice")).toHaveText("Fiche repassée en brouillon.", {
        timeout: 20_000,
      });
      expect((await apiCall<{ published: boolean }>(cookie, "GET", "/me/pro")).data.published).toBe(false);
      await page.getByTestId("pro-publish-button").click();
      await expect(page.getByTestId("pro-publish-notice")).toHaveText("Fiche publiée dans l'annuaire.", {
        timeout: 20_000,
      });

      // Logo et photo.
      const logoChooser = page.waitForEvent("filechooser");
      await page.getByTestId("pro-logo-change").click();
      await (await logoChooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: samplePhoto() });
      await expect(page.getByTestId("pro-media-notice")).toHaveText("Logo enregistré.", { timeout: 30_000 });
      expect((await apiCall<{ logoUrl: string | null }>(cookie, "GET", "/me/pro")).data.logoUrl).toBeTruthy();
      const photoChooser = page.waitForEvent("filechooser");
      await page.getByTestId("pro-photo-add").click();
      await (await photoChooser).setFiles({ name: "realisation.png", mimeType: "image/png", buffer: samplePhoto() });
      await expect(page.getByTestId("pro-media-notice")).toHaveText("Photo ajoutée.", { timeout: 30_000 });
      expect((await apiCall<{ photos: unknown[] }>(cookie, "GET", "/me/pro")).data.photos).toHaveLength(1);
      await page.getByRole("button", { name: "Retirer cette photo" }).first().click();
      await expect(page.getByTestId("pro-media-notice")).toHaveText("Photo retirée.", { timeout: 20_000 });
      expect((await apiCall<{ photos: unknown[] }>(cookie, "GET", "/me/pro")).data.photos).toHaveLength(0);

      // Partenaire : proposition puis retrait avec confirmation.
      await page.getByRole("combobox", { name: "Organisateur" }).click();
      await page
        .getByRole("menuitem", { name: /MéditeSportCar/ })
        .first()
        .click();
      await page.getByTestId("pro-partner-propose").click();
      await expect(page.getByTestId("pro-partners-notice")).toHaveText(
        "Demande envoyée : l'équipe organisatrice doit l'accepter.",
        {
          timeout: 20_000,
        },
      );
      expect((await apiCall<{ partnerLinks: unknown[] }>(cookie, "GET", "/me/pro")).data.partnerLinks).toHaveLength(1);
      await reveal(page, page.getByTestId("pro-partners"));
      await shot(page, "05-pro-partenaires", theme);
      await page.getByTestId("pro-partner-remove-meditesportcar").click();
      await page.getByTestId("orga-confirm").click();
      await expect(page.getByTestId("pro-partners-notice")).toHaveText("Partenariat retiré.", { timeout: 20_000 });
      expect((await apiCall<{ partnerLinks: unknown[] }>(cookie, "GET", "/me/pro")).data.partnerLinks).toHaveLength(0);

      // SIRET : un numéro inconnu du registre donne un résultat, jamais une erreur silencieuse.
      await page.getByTestId("pro-siret-field").fill("000 000 000 00000");
      await page.getByTestId("pro-siret-check").click();
      await expect(page.getByTestId("pro-siret-result").or(page.getByTestId("pro-siret-notice-error"))).toBeVisible({
        timeout: 30_000,
      });
      await reveal(page, page.getByTestId("pro-siret"));
      await shot(page, "06-pro-siret", theme);
    }

    // Publications : création, modification, suppression avec confirmation.
    await page.goto("/publier");
    await expect(page.getByTestId("pro-posts-counter")).toBeVisible({ timeout: 30_000 });
    if (first) {
      await page.getByLabel("Titre").fill("Offre de rentrée");
      await page.getByLabel("Texte").fill("Vidange offerte pour les membres Orasso.");
      await page.getByRole("button", { name: "Publier", exact: true }).click();
      await expect(page.getByTestId("pro-post")).toHaveCount(1, { timeout: 20_000 });
      await page.getByTestId("pro-post-edit").click();
      await page.getByTestId("pro-post-title").fill("Offre de rentrée prolongée");
      await shot(page, "07-pro-publication-modifier", theme);
      await page.getByTestId("pro-post-save").click();
      await expect(page.getByTestId("pro-post")).toContainText("Offre de rentrée prolongée", { timeout: 20_000 });
      const posts = await apiCall<{ posts: { title: string; body: string }[]; postsUsed: number }>(
        cookie,
        "GET",
        "/me/pro",
      );
      expect(posts.data.posts[0]).toMatchObject({
        title: "Offre de rentrée prolongée",
        body: "Vidange offerte pour les membres Orasso.",
      });
      expect(posts.data.postsUsed).toBe(1);
      await shot(page, "08-pro-publications", theme);
      await page.getByTestId("pro-post-delete").click();
      await page.getByTestId("orga-confirm").click();
      await expect(page.getByTestId("pro-post")).toHaveCount(0, { timeout: 20_000 });
      expect((await apiCall<{ posts: unknown[] }>(cookie, "GET", "/me/pro")).data.posts).toHaveLength(0);
    } else {
      await shot(page, "08-pro-publications", theme);
    }
    await ctx.close();
  }
});

test("compte : newsletter, export des données, clés d'accès renommées puis supprimées", async ({ browser }) => {
  test.setTimeout(360_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const pseudo = `CompteApp_${s}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  const userId = me.data.user.id;
  for (const theme of THEMES) {
    // Une clé d'accès : la création demande WebAuthn (non faisable dans l'appli ni ici), elle est posée en base.
    await db((c) =>
      c.query(
        `insert into passkey (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at)
         values ($1, $2, 'cle-publique', $3, $4, 0, 'multiDevice', true, now())`,
        [`pk_${s}_${theme}`, "iPhone de test", userId, `cred_${s}_${theme}`],
      ),
    );
    const { ctx, page } = await openApp(browser, email, theme);
    await page.goto("/moi");
    await expect(page.getByTestId("moi-data")).toBeVisible({ timeout: 30_000 });
    const first = theme === "sable";
    await reveal(page, page.getByTestId("moi-data"));
    if (first) {
      // Newsletter.
      const box = page.getByRole("checkbox", { name: "Recevoir la newsletter Orasso" });
      // La case du système de design n'expose pas `aria-checked` sur le web : cochée = sa coche (svg) est dessinée.
      const ticks = box.locator("svg");
      await expect(ticks).toHaveCount(0);
      await box.click();
      await expect(ticks).toHaveCount(1, { timeout: 20_000 });
      await expect(page.getByTestId("newsletter-notice")).toHaveText("Tu recevras la newsletter Orasso.", {
        timeout: 20_000,
      });
      expect(
        (await apiCall<{ profile: { newsletterOptIn: boolean } }>(cookie, "GET", "/me")).data.profile,
      ).toMatchObject({
        newsletterOptIn: true,
      });
      await box.click();
      await expect(page.getByTestId("newsletter-notice")).toHaveText("Tu ne recevras plus la newsletter Orasso.", {
        timeout: 20_000,
      });
      await box.click();
      await expect(page.getByTestId("newsletter-notice")).toHaveText("Tu recevras la newsletter Orasso.", {
        timeout: 20_000,
      });
      // Export des données : un fichier JSON daté, avec mon profil et sans secret.
      const download = page.waitForEvent("download");
      await page.getByTestId("export-data").click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^orasso-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/);
      const path = await file.path();
      const { readFileSync } = await import("node:fs");
      const exported = JSON.parse(readFileSync(path, "utf8"));
      expect(exported.profile).toMatchObject({ pseudo, newsletterOptIn: true });
      expect(exported.account.email).toBe(email);
      expect(JSON.stringify(exported)).not.toMatch(/account_?[qQ]r_?[sS]ecret|password/);
      await expect(page.getByTestId("export-notice")).toBeVisible({ timeout: 20_000 });
    }
    await shot(page, "09-moi-donnees", theme);

    // Clés d'accès : liste, renommage, suppression.
    await reveal(page, page.getByTestId("moi-passkeys"));
    await page.getByTestId("moi-passkeys").click();
    await expect(page.getByTestId("passkey-row")).toHaveCount(1, { timeout: 20_000 });
    await shot(page, "10-moi-cles-d-acces", theme);
    if (first) {
      await expect(page.getByTestId("passkey-name")).toHaveText("iPhone de test");
      await page.getByTestId("passkey-rename").click();
      await page.getByTestId("passkey-name-field").fill("Pixel de Damien");
      await page.getByTestId("passkey-rename-save").click();
      await expect(page.getByTestId("passkey-name")).toHaveText("Pixel de Damien", { timeout: 20_000 });
      const keys = await apiCall<{ name: string }[]>(cookie, "GET", "/auth/passkey/list-user-passkeys");
      expect(keys.data.map((k) => k.name)).toEqual(["Pixel de Damien"]);
      // Session par mot de passe : l'API demande la preuve d'un second facteur, le message l'explique.
      await page.getByTestId("passkey-delete").click();
      await page.getByTestId("orga-confirm").click();
      await expect(page.getByText(/Cette session ne prouve pas ta double authentification/)).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("button", { name: "Annuler" }).last().click();
      // Session qui prouve la clé (comme après une connexion par clé d'accès) : la suppression passe.
      await db((c) => c.query("update session set second_factor = 'passkey' where user_id = $1", [userId]));
      await page.getByTestId("passkey-delete").click();
      await page.getByTestId("orga-confirm").click();
      await expect(page.getByTestId("passkey-row")).toHaveCount(0, { timeout: 20_000 });
      // (Better Auth ferme les autres sessions à la suppression d'une clé : on relit en base.)
      const left = await db((c) => c.query("select count(*)::int as n from passkey where user_id = $1", [userId]));
      expect(left.rows[0].n).toBe(0);
    }
    await ctx.close();
  }
});

test("garage : certification demandée, plaque d'un autre membre = transfert lancé, historique, suppression", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  mkdirSync(DIR, { recursive: true });
  const s = unique();
  const pseudo = `GarageApp_${s}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const otherPseudo = `Ancien_${s}`.slice(0, 20);
  const other = await signUpApi(otherPseudo, `${otherPseudo.toLowerCase()}@e2e.orasso.test`);
  const takenPlate = randomPlate();
  await addVehicleApi(other, takenPlate);
  // Véhicule à certifier : grade Sport, trois photos, description, une catégorie.
  const mine = await addVehicleApi(cookie, randomPlate());
  const spare = await addVehicleApi(cookie, randomPlate());
  const toDelete = await addVehicleApi(cookie, randomPlate());
  await db((c) =>
    c.query("update profiles set grade = 'sport', points_season = 340 where lower(pseudo) = lower($1)", [pseudo]),
  );
  const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
  for (let n = 1; n < 3; n++) {
    const form = new FormData();
    form.set("photo", new Blob([new Uint8Array(samplePhoto([40 + n * 30, 90, 160]))], { type: "image/png" }), "p.png");
    const res = await fetch(`${API}/api/me/vehicles/${mine}/photos`, {
      method: "POST",
      headers: { origin: `http://localhost:${process.env.WEB_PORT ?? 5173}`, cookie },
      body: form,
    });
    expect(res.status).toBe(201);
  }
  const categories = await apiCall<{ id: string; eligible: boolean }[]>(cookie, "GET", "/vehicle-reference/categories");
  const category = categories.data.find((c) => c.eligible) ?? categories.data[0];
  const patched = await apiCall(cookie, "PATCH", `/me/vehicles/${mine}`, {
    description: "BMW d'origine, entretenue.",
    categoryIds: category ? [category.id] : [],
  });
  expect(patched.status).toBe(200);

  for (const theme of THEMES) {
    const { ctx, page } = await openApp(browser, email, theme);
    await page.goto(`/vehicule/${mine}`);
    await expect(page.getByTestId("vehicle-edit-open")).toBeVisible({ timeout: 30_000 });
    const first = theme === "sable";
    if (first) {
      // Certification : message facultatif, demande envoyée.
      await page.getByTestId("certification-message").fill("Voiture d'origine, carnet complet.");
      await reveal(page, page.getByTestId("certification-request"));
      await shot(page, "11-garage-certification", theme);
      await page.getByTestId("certification-request").click();
      await expect(page.getByText(/Demande en cours d'examen/)).toBeVisible({ timeout: 30_000 });
      const detail = await apiCall<{ certification: { request: { status: string } | null } }>(
        cookie,
        "GET",
        `/me/vehicles/${mine}`,
      );
      expect(detail.data.certification.request?.status).toBe("pending");
      // Historique : vide pour un véhicule neuf.
      await expect(page.getByText("Ce véhicule n'a pas encore participé à un événement.")).toBeVisible();

      // Modifier la fiche : couleur, description.
      await page.getByTestId("vehicle-edit-open").click();
      await page.getByLabel("Couleur").fill("Rouge Calypso");
      await shot(page, "12-garage-modifier", theme);
      await page.getByTestId("vehicle-save").click();
      await expect(page.getByText("Fiche enregistrée.")).toBeVisible({ timeout: 20_000 });
      expect((await apiCall<{ color: string | null }>(cookie, "GET", `/me/vehicles/${mine}`)).data.color).toBe(
        "Rouge Calypso",
      );

      // Transfert de plaque lancé depuis l'appli : la plaque est celle d'un autre membre.
      await page.goto(`/vehicule/${spare}`);
      await page.getByTestId("vehicle-edit-open").click();
      await page.getByTestId("vehicle-plate").fill(takenPlate);
      await page.getByTestId("vehicle-save").click();
      await expect(page.getByText(/Plaque en attente de transfert/).first()).toBeVisible({ timeout: 20_000 });
      const spareView = await apiCall<{ plateTransfer: { status: string } | null }>(
        cookie,
        "GET",
        `/me/vehicles/${spare}`,
      );
      expect(spareView.data.plateTransfer).toMatchObject({ status: "pending" });
      const incoming = await apiCall<{ incoming: unknown[] }>(other, "GET", "/me/plate-transfers");
      expect(incoming.data.incoming).toHaveLength(1);
      await shot(page, "13-garage-transfert", theme);
      // En attente : la plaque ne se change plus.
      await page.getByTestId("vehicle-edit-open").click();
      await expect(page.getByTestId("vehicle-plate")).not.toBeEditable();
      await page.getByRole("button", { name: "Annuler" }).click();

      // Suppression avec confirmation.
      await page.goto(`/vehicule/${toDelete}`);
      await page.getByTestId("vehicle-delete").click();
      await expect(page.getByText("Supprimer ce véhicule ?")).toBeVisible();
      await page.getByTestId("orga-confirm").click();
      await page.waitForURL(/\/garage/, { timeout: 20_000 });
      const left = await apiCall<{ id: string }[]>(cookie, "GET", "/me/vehicles");
      expect(left.data.map((v) => v.id)).not.toContain(toDelete);
    } else {
      await shot(page, "11-garage-certification", theme);
    }
    await ctx.close();
  }
});

test.afterAll(() => {
  const real = consoleErrors.filter((e) => !/favicon|manifest|Failed to load resource|net::ERR/i.test(e));
  expect(real.slice(0, 5)).toEqual([]);
  for (const [name, a] of Object.entries(audits)) {
    expect(a.horizontalScroll, `${name} : défilement horizontal`).toBe(false);
    expect(a.clipped, `${name} : élément coupé à droite`).toEqual([]);
    expect(a.greens, `${name} : du vert`).toEqual([]);
    expect(a.truncated, `${name} : texte tronqué`).toEqual([]);
    expect(a.buttonsWithoutIcon, `${name} : bouton sans icône ${JSON.stringify(a.buttonsWithoutIcon)}`).toEqual([]);
  }
});
