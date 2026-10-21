import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { loginInBrowser, MOBILE, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot 56 : site public v2 (accueil, événements, organisateurs, professionnels, fiche événement, annuaire des pros), en-tête
// et pied, cartes avec affiche, crédits des données, e-mails v2. Quatre pages + fiche + pros, à 390 px et 1280 px, dans les
// deux thèmes ; l'audit du système sur chacune ; aucune carte sans affiche ni gabarit ; la phrase à trous (département) ; le
// bandeau des dates ; les crédits ; l'e-mail de vérification rendu depuis `.data/mail`. Captures dans le relais.
// Prérequis : API et site lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-56-captures/site`;
const MAIL_DIR = resolve(import.meta.dirname, "../../..", process.env.DATA_DIR ?? ".data", "mail");
const DESKTOP = { width: 1280, height: 900 } as const;
const THEMES = ["beton", "sable"] as const;
const PAGES: [string, string][] = [
  ["accueil", "/"],
  ["evenements", "/evenements"],
  ["organisateurs", "/organisateurs"],
  ["professionnels", "/professionnels"],
  ["fiche-evenement", "/e/nocturne-de-canet-2026"],
  ["annuaire-pros", "/pros"],
];

/** Fait défiler la page de haut en bas : les images paresseuses se chargent (captures et contrôles de rendu). */
async function loadLazy(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(300, window.innerHeight / 2);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
}

/** Chaque carte a une affiche : l'image générée chargée (taille réelle) ou le gabarit « Minimal », jamais un aplat vide. */
async function noEmptyPoster(page: Page, where: string) {
  await loadLazy(page);
  const empties = await page.evaluate(() =>
    [...document.querySelectorAll(".s-pcard .w-card__poster, .w-fan__card")]
      .filter((poster) => {
        const r = poster.getBoundingClientRect();
        const img = poster.querySelector("img");
        const minimal = poster.querySelector("[data-testid='poster-minimal'], .w-card__minimal");
        const loaded = img ? img.complete && img.naturalWidth > 0 : false;
        return r.width < 40 || r.height < 40 || !(loaded || minimal);
      })
      .map((p) => p.textContent?.slice(0, 40) ?? p.getAttribute("aria-label") ?? ""),
  );
  expect(empties, `${where} : cartes sans affiche`).toEqual([]);
}

/** Aucun défilement horizontal : la page, le corps et chaque conteneur de l'en-tête et du pied tiennent dans leur largeur. */
async function noHorizontalScroll(page: Page, where: string) {
  const over = await page.evaluate(() => {
    const out: string[] = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) out.push(`html ${de.scrollWidth}>${de.clientWidth}`);
    if (document.body.scrollWidth > document.body.clientWidth) out.push("body");
    for (const el of document.querySelectorAll("header, header *, footer, footer *, main, main *")) {
      const e = el as HTMLElement;
      if (
        e.clientWidth > 1 &&
        !e.classList.contains("o-visually-hidden") &&
        !e.closest(".w-ticker, .maplibregl-map") &&
        e.scrollWidth > e.clientWidth + 1 &&
        getComputedStyle(e).overflowX !== "visible"
      ) {
        out.push(`${e.tagName.toLowerCase()}.${e.className} ${e.scrollWidth}>${e.clientWidth}`);
      }
    }
    return out;
  });
  expect(over, `${where} : défilement horizontal`).toEqual([]);
}

async function audit(page: Page, where: string) {
  const a = await auditPage(page);
  expect(a.primaryButtons, `${where} : boutons principaux`).toBeLessThanOrEqual(1);
  expect(a.neonAccent, `${where} : néons moutarde`).toBeLessThanOrEqual(1);
  expect(a.buttonsWithoutIcon, `${where} : boutons sans icône`).toEqual([]);
  expect(a.greens, `${where} : vert`).toEqual([]);
  expect(a.truncated, `${where} : texte tronqué`).toEqual([]);
  expect(a.horizontalScroll, `${where} : défilement horizontal`).toBe(false);
  expect(a.unoutlinedOnPhoto, `${where} : texte sur photo sans contour`).toEqual([]);
  expect(a.brokenWords, `${where} : mot coupé en plein mot`).toEqual([]);
}

test("pages publiques v2 : quatre pages, fiche, pros ; 390 px et bureau ; Béton et Sable ; captures", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    for (const [label, viewport] of [
      ["390", MOBILE],
      ["1280", DESKTOP],
    ] as const) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      const hydration: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" && /hydrat|descendant|nested/i.test(m.text())) hydration.push(m.text().slice(0, 200));
      });
      await setTheme(page, theme);
      for (const [name, path] of PAGES) {
        const where = `${path} ${theme} ${label}`;
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1"), `${where} : un h1`).toHaveCount(1);
        await audit(page, where);
        await noHorizontalScroll(page, where);
        await noEmptyPoster(page, where);
        // En-tête et pied : navigation, logo, crédits des données, thème au choix.
        await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();
        const credits = page.getByTestId("data-credits");
        await expect(credits).toContainText("OpenFreeMap");
        await expect(credits).toContainText("OpenMapTiles");
        await expect(credits).toContainText("OpenStreetMap");
        await expect(credits).toContainText("Victor Cazanave");
        await expect(credits).toContainText("Open-Meteo");
        await page.screenshot({ path: `${DIR}/${name}-${theme}-${label}.png`, fullPage: true });
        expect(hydration, `${where} : erreurs d'hydratation`).toEqual([]);
      }
      await ctx.close();
    }
  }
});

test("accueil : bandeau moutarde des dates, affiches en éventail, quatre bandes, boutiques vers /appli", async ({
  page,
}) => {
  await setTheme(page, "beton");
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tout le monde à sa place.");
  const ticker = page.getByTestId("home-ticker");
  await expect(ticker).toBeVisible();
  expect(await ticker.locator(".w-ticker__group").first().locator(".w-ticker__item").count()).toBeGreaterThan(0);
  await expect(page.locator(".w-fan__card").first()).toBeVisible();
  for (const title of ["Tu viens avec ta caisse", "Tu organises le rasso", "Tu es pro du coin"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "L'appli, c'est ta place" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Google Play" }).first()).toHaveAttribute("href", "/appli");
  await expect(page.getByRole("link", { name: "Télécharger l'appli" })).toHaveAttribute("href", "/appli");
  await expect(page.getByTestId("home-events").getByTestId("event-tile").first()).toBeVisible();
  await page.goto("/?departement=2A");
  await expect(page.getByTestId("home-events")).toBeVisible();
});

test("événements : la phrase à trous change la liste (département, format, dates, ville), vue Liste", async ({
  page,
}) => {
  await setTheme(page, "beton");
  await page.setViewportSize(DESKTOP);
  await page.goto("/evenements");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Je cherche")).toBeVisible();
  const all = await page.getByTestId("event-tile").count();
  expect(all).toBeGreaterThan(3);
  await expect(page.getByTestId("events-count")).toContainText("événements");
  // Le département : la feuille avec la carte de France.
  await page.getByTestId("pick-departement").click();
  const sheet = page.getByTestId("department-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("france-map")).toBeVisible();
  await expect(sheet.getByTestId("france-credit")).toContainText("Victor Cazanave");
  await sheet.getByTestId("dept-11").click();
  await page.waitForURL(/departement=11/);
  await expect(page.getByTestId("pick-departement")).toHaveText("11");
  await expect.poll(() => page.getByTestId("event-tile").count()).toBeLessThan(all);
  expect(await page.getByTestId("event-tile").count()).toBeGreaterThan(0);
  // Le format (sur la liste entière).
  await page.goto("/evenements");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("pick-format").selectOption("exhibition");
  await page.waitForURL(/format=exhibition/);
  await expect(page.getByTestId("event-tile").filter({ hasNotText: "Exposition" })).toHaveCount(0);
  await expect(page.getByTestId("event-tile").first()).toContainText("Exposition");
  // Les dates et la ville (autour de + rayon).
  await page.goto("/evenements?quand=month");
  await expect(page.getByTestId("pick-quand")).toHaveValue("month");
  await page.goto("/evenements?ville=perpignan&rayon=60");
  await expect(page.getByTestId("pick-rayon")).toHaveValue("60");
  await expect(page.getByTestId("events-count")).toContainText("du plus proche au plus loin");
  // La vue Liste : les mêmes cartes, l'affiche en petit.
  await page.goto("/evenements?vue=liste");
  await expect(page.locator(".w-card--row").first()).toBeVisible();
  await noEmptyPoster(page, "liste");
  await page.screenshot({ path: `${DIR}/evenements-liste-beton-1280.png`, fullPage: true });
});

test("fiche événement : affiche en vedette, créneaux d'arrivée en deux plaques, contenus des médias", async ({
  page,
}) => {
  await setTheme(page, "beton");
  await page.setViewportSize(DESKTOP);
  await page.goto("/e/nocturne-de-canet-2026");
  await expect(page.getByTestId("event-hero").getByRole("heading", { level: 1 })).toHaveText("Nocturne de Canet");
  await expect(page.getByTestId("event-poster").locator("img")).toBeVisible();
  const plaques = page.getByTestId("arrival-plaque");
  await expect(plaques).toHaveCount(2);
  await expect(plaques.first()).toContainText("Exposants");
  await expect(plaques.first()).toContainText("18 h 30 – 19 h 15");
  await expect(plaques.nth(1)).toContainText("Public");
  await page.goto("/e/beziers-night-2026");
  await expect(page.getByTestId("media-contents")).toBeVisible();
  await expect(page.getByTestId("audience-prize")).toHaveCount(0); // sans compte, le classement n'est pas lu
});

test("organisateurs et professionnels : six temps, mur des huit styles, remises, offre fondateur", async ({ page }) => {
  await setTheme(page, "sable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/organisateurs");
  await expect(page.getByTestId("orga-steps").locator("li")).toHaveCount(6);
  const wall = page.getByTestId("poster-wall").locator("img");
  expect(await wall.evaluateAll((imgs) => imgs.map((i) => i.getAttribute("alt")))).toEqual([
    "Néon",
    "Suisse",
    "Rétro",
    "JDM",
    "Billet",
    "Magazine",
    "Minimal",
    "Damier",
  ]);
  await expect(wall).toHaveCount(8);
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 8; i++) {
    const img = wall.nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByRole("link", { name: "Créer ma structure" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Créer ma structure" })).toHaveAttribute(
    "href",
    "/app/structure/nouvelle",
  );
  await page.goto("/professionnels");
  await expect(page.getByTestId("pro-discounts").locator("div")).toHaveCount(5);
  await expect(page.getByTestId("pro-discounts")).toContainText("20 %");
  await expect(page.getByTestId("pro-founders")).toContainText("Gratuit jusqu'au 21 juin 2027");
  await expect(page.getByTestId("pro-sample")).toBeVisible();
});

test("liens internes de l'en-tête, du pied et des pages publiques : aucun 404", async ({ page, request }) => {
  const hrefs = new Set<string>();
  for (const [, path] of PAGES) {
    await page.goto(path);
    for (const href of await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
      if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/app/") && !href.startsWith("/api/")) {
        hrefs.add(href.split("#")[0] ?? href);
      }
    }
  }
  expect(hrefs.size).toBeGreaterThan(8);
  for (const href of hrefs) {
    const res = await request.get(href, { maxRedirects: 5 });
    expect(res.status(), `${href} répond`).toBeLessThan(400);
  }
  // Les liens vers l'espace connecté renvoient vers la connexion (redirection), jamais 404.
  for (const href of ["/app/structure/nouvelle"]) {
    const res = await request.get(href, { maxRedirects: 5 });
    expect(res.status(), `${href} répond`).toBeLessThan(400);
  }
});

test("mentions légales : crédits des données ; pied identique sur toutes les pages", async ({ page }) => {
  await page.goto("/mentions-legales");
  const legal = page.getByTestId("legal-credits");
  await expect(legal).toContainText("OpenFreeMap");
  await expect(legal).toContainText("Victor Cazanave");
  await expect(legal).toContainText("Open-Meteo");
  await expect(page.getByRole("link", { name: "Conditions d'utilisation" })).toBeVisible();
  await expect(page.getByText("Propulsé par Orasso")).toBeVisible();
});

/** Dernier e-mail du journal adressé à `to` (attend jusqu'à 15 s). */
function lastMailTo(to: string): string {
  for (const file of readdirSync(MAIL_DIR).sort().reverse()) {
    const path = resolve(MAIL_DIR, file);
    if (Date.now() - statSync(path).mtimeMs > 60_000) continue;
    const html = readFileSync(path, "utf8");
    if (html.startsWith(`<!-- À : ${to} -->`)) return html;
  }
  throw new Error(`Aucun e-mail pour ${to}`);
}

test("e-mail de vérification v2 : affiche de nuit, titre, bouton moutarde (lien du site), pied", async ({ page }) => {
  const s = unique();
  const email = `mail56-${s}@e2e.orasso.test`;
  await signUpApi(`Mail56_${s}`.slice(0, 24), email);
  let html = "";
  for (let i = 0; i < 30 && !html; i++) {
    try {
      html = lastMailTo(email);
    } catch {
      await page.waitForTimeout(500);
    }
  }
  expect(html, "e-mail de vérification dans .data/mail").not.toBe("");
  expect(html).toContain("/mail/affiche-nuit.jpg");
  expect(html).toContain("Confirme ton adresse e-mail");
  expect(html).toMatch(/<a href="http[^"]*\/verification-email\?[^"]*"[^>]*>Confirmer mon adresse/);
  expect(html).toContain("Tu reçois cet e-mail parce que tu as un compte Orasso.");
  // Rendu : le fichier s'ouvre tel quel, l'image d'en-tête se charge depuis le site.
  await page.setViewportSize({ width: 700, height: 900 });
  await page.setContent(html.replace(/^<!--.*?-->\n/, ""));
  await page.waitForLoadState("networkidle");
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/email-verification.png`, fullPage: true });
  await expect(page.locator("img[alt='Orasso']")).toBeVisible();
});

test("/_mail : aperçu de chaque type d'e-mail (développement) avec le bouton et le pied", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/_mail");
  const samples = page.getByTestId("mail-sample");
  expect(await samples.count()).toBeGreaterThanOrEqual(8);
  // Chaque aperçu est vérifié : le pied annoncé pour son type, le bouton pour ceux qui ont un lien.
  const frames = await page
    .locator("[data-testid='mail-sample'] iframe")
    .evaluateAll((els) =>
      els.map((el) => ({ title: el.getAttribute("title") ?? "", html: el.getAttribute("srcdoc") ?? "" })),
    );
  expect(frames.length).toBe(await samples.count());
  let withButton = 0;
  for (const f of frames) {
    expect(f.html, f.title).toContain("/mail/affiche-nuit.jpg");
    const footer =
      f.title === "Compte supprimé"
        ? "pour confirmer la suppression de ton compte Orasso"
        : f.title === "Newsletter"
          ? "parce que tu as accepté la newsletter Orasso"
          : "parce que tu as un compte Orasso";
    expect(f.html, f.title).toContain(footer);
    if (/&rarr;<\/a>/.test(f.html)) {
      withButton++;
      expect(f.html, f.title).toContain("#e9b824");
    }
  }
  expect(withButton, "aperçus avec un bouton").toBeGreaterThanOrEqual(7);
  expect(frames.map((f) => f.title)).not.toContain("Avec un code de secours");
  await page.screenshot({ path: `${DIR}/apercu-emails.png`, fullPage: false });
});

test("en-tête de l'espace connecté : ni défilement horizontal ni recouvrement, 390 et 1280 px", async ({ browser }) => {
  for (const viewport of [MOBILE, DESKTOP]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await setTheme(page, "beton");
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/acces");
    await page.waitForLoadState("networkidle");
    await noHorizontalScroll(page, `/app/acces ${viewport.width}`);
    // La recherche reste cliquable : rien ne la recouvre.
    await page.getByTestId("site-search").getByRole("button").click({ trial: true });
    await ctx.close();
  }
});
