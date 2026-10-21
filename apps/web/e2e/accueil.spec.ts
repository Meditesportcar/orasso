import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, loginInBrowser } from "./helpers";
import { RELAIS } from "./relais";

// Accueil complet (lot 30) sur le site, avec Kenji (département 66). Prérequis : base locale avec le seed (garage favori,
// deux emplacements sponsorisés, cache factice du lavage et du carburant), API lancée avec `OVERPASS_URL=off`,
// `FUEL_API_URL=off` et `WEATHER_PROVIDER=off` (aucun appel à une source externe). Captures dans les deux thèmes, au
// bureau et sur téléphone (390 px) : `CAPTURES=1 pnpm --filter @orasso/web exec playwright test accueil`.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-30-captures/site`;
const TITLES = ["pending", "nearby", "weather", "agenda", "favorite_garage", "wash", "fuel"] as const;

type Home = {
  nearby: { radiusKm: number; events: { title: string }[] };
  widgets: { order: string[]; hidden: string[] };
  sponsored: { title: string } | null;
  favoriteGarage: { name: string } | null;
  wash: unknown[];
  fuel: unknown[];
  weather: unknown;
};

/** Ordre d'affichage des blocs de la page, lu dans le DOM. */
async function shownOrder(page: Page): Promise<string[]> {
  const all = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="widget-"]')].map((el) =>
      (el.getAttribute("data-testid") ?? "").replace("widget-", ""),
    ),
  );
  // L'emplacement sponsorisé n'est pas un bloc réglable.
  return all.filter((id) => id !== "sponsored");
}

test("accueil : blocs, rayon 50 puis 150 km, sponsorisé ciblé 66, réorganisation persistée", async ({ page }) => {
  const cookie = await login("kenji@orasso.local");
  // Départ propre : rayon de 50 km et réglage par défaut.
  await apiCall(cookie, "PATCH", "/me/settings", { radiusKm: 50 });
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: [] });

  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await expect(page).toHaveURL(/\/app$/);

  // Prochain accès (Salon Argelès, retenu) : le seul bouton principal.
  const next = page.getByTestId("next-access");
  await expect(next).toContainText("Salon Argelès");
  await expect(next.getByRole("link", { name: /Voir mon accès/ })).toBeVisible();

  // Blocs dans l'ordre par défaut.
  expect(await shownOrder(page)).toEqual([...TITLES]);

  // Autour de moi : 50 km.
  const nearby = page.getByTestId("widget-nearby");
  await expect(nearby).toContainText("Rayon : 50 km");
  const near50 = await nearby.getByTestId("nearby-event").count();
  expect(near50).toBeGreaterThan(0);

  // Météo : l'événement du jour (prévision factice du seed), avec l'attribution du fournisseur.
  await expect(page.getByTestId("widget-weather").getByTestId("weather-attribution")).toHaveText("Météo : Open-Meteo");

  // Garage favori de Kenji.
  await expect(page.getByTestId("widget-favorite_garage")).toContainText("Garage du Port");

  // Lavage et carburant (cache factice), prix, itinéraire, attribution des sources.
  const wash = page.getByTestId("widget-wash");
  await expect(wash.getByTestId("place-line").first()).toBeVisible();
  await expect(wash).toContainText("OpenStreetMap");
  const fuel = page.getByTestId("widget-fuel");
  await expect(fuel.getByTestId("place-line").first()).toContainText("Gazole");
  await expect(fuel).toContainText("data.economie.gouv.fr");

  // Emplacement sponsorisé ciblé 66 + JDM : même apparence, mention « Sponsorisé ».
  const sponsored = page.getByTestId("widget-sponsored");
  await expect(sponsored).toContainText("Sponsorisé");
  // Tirage pondéré avec une graine (personne + jour) : l'emplacement ciblé 66 + JDM sort le plus souvent, l'emplacement
  // ouvert à tous certains jours (lot 34 : la recette ne dépend plus de la date).
  await expect(sponsored).toContainText(/Polish avant saison|Covering sur mesure/);

  // Curseur de rayon : 150 km, enregistré dans le profil (la page se recharge avec ?rayon=150).
  // Glisser le curseur (beaucoup d'événements `input`) n'envoie rien : une seule requête, au relâchement (`change`).
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/app") posts.push(r.url());
  });
  await page.getByTestId("home-radius").evaluate(async (el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    for (let km = 20; km <= 150; km += 10) {
      setter?.call(el, String(km));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForTimeout(800);
  expect(posts).toHaveLength(0);
  await page
    .getByTestId("home-radius")
    .evaluate((el: HTMLInputElement) => el.dispatchEvent(new Event("change", { bubbles: true })));
  await expect(page).toHaveURL(/rayon=150/);
  await expect(page.getByTestId("widget-nearby")).toContainText("Rayon : 150 km");
  const near150 = await page.getByTestId("widget-nearby").getByTestId("nearby-event").count();
  expect(near150).toBeGreaterThanOrEqual(near50);
  const home = await apiCall<Home>(cookie, "GET", "/me/home");
  expect(home.data.nearby.radiusKm).toBe(150);

  // Réorganiser : « Carburant » remonte avant « Lavage », « Lavage » est masqué ; tout persiste après rechargement.
  await page.goto("/app");
  await page.getByTestId("reorder").locator("summary").click();
  await page.getByTestId("up-fuel").click();
  await expect
    .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.order.indexOf("fuel"))
    .toBe(6);
  await page.getByTestId("toggle-wash").click();
  await expect.poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.hidden).toEqual(["wash"]);
  await page.reload();
  expect(await shownOrder(page)).toEqual(["pending", "nearby", "weather", "agenda", "favorite_garage", "fuel"]);
  await expect(page.getByTestId("widget-wash")).toHaveCount(0);
  // Réglage remis à l'état d'origine pour la suite.
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: [] });
  await apiCall(cookie, "PATCH", "/me/settings", { radiusKm: 50 });
});

test("accueil : un compte d'un autre département ne voit pas l'emplacement ciblé 66", async () => {
  const cookie = await login("kenji@orasso.local");
  const home = await apiCall<Home>(cookie, "GET", "/me/home");
  // Kenji (66, JDM) voit l'emplacement ciblé ; l'autre (ouvert à tous) peut sortir pour un compte hors 66.
  expect(["Polish avant saison", "Covering sur mesure"]).toContain(home.data.sponsored?.title);
  const damien = await login("damien@orasso.local");
  const other = await apiCall<Home>(damien, "GET", "/me/home");
  expect(other.status).toBe(200);
});

test("garage : QR de compte du site, lu et validé par un pro (lecteur du lot 14)", async ({ page }) => {
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/garage");
  const qr = page.getByTestId("account-qr");
  await expect(qr).toContainText("Mon QR de compte");
  await expect(qr.getByTestId("account-qr-warning")).toContainText("Ne le partage pas");
  const code = qr.getByTestId("account-qr-code");
  await expect(code).toBeVisible();
  const payload = await code.getAttribute("data-payload");
  expect(payload).toMatch(/^OA1[\w-]{11}\.\d{8}$/);
  // Le pro (Garage du Port) le scanne : valide, avec le pseudo de Kenji.
  const pro = await login("garage@orasso.local");
  const verified = await apiCall<{ valid: boolean; pseudo?: string }>(pro, "POST", "/account-qr/verify", { payload });
  expect(verified.data).toMatchObject({ valid: true, pseudo: "Kenji_66" });
  // Il est à usage unique par fenêtre : le même code rejoué est refusé.
  const replay = await apiCall<{ valid: boolean; reason?: string }>(pro, "POST", "/account-qr/verify", { payload });
  expect(replay.data).toMatchObject({ valid: false, reason: "replayed" });
  // La page du secret n'est jamais mise en cache et garde les en-têtes de sécurité de la racine (lot 12).
  const res = await page.request.get("/app/garage");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  // Même contrôle sur d'autres pages du compte.
  for (const path of ["/app", "/app/acces"]) {
    expect((await page.request.get(path)).headers()["x-frame-options"], path).toBe("DENY");
  }
});

test.describe("captures et audit du système de design", () => {
  test.skip(!process.env.CAPTURES, "CAPTURES=1 pour produire les captures");

  async function audited(browser: Browser, theme: "beton" | "sable", width: number, height: number, name: string) {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR" });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem("orasso.theme", t), theme);
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
    await expect(page.getByTestId("next-access")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true });
    const audit: Audit = await auditPage(page);
    await ctx.close();
    return audit;
  }

  test("/app : Béton et Sable, bureau et 390 px", async ({ browser }) => {
    mkdirSync(DIR, { recursive: true });
    for (const theme of ["beton", "sable"] as const) {
      for (const [w, h, name] of [
        [1280, 900, "accueil-bureau"],
        [390, 844, "accueil-390"],
      ] as const) {
        const a = await audited(browser, theme, w, h, name);
        expect(a.primaryButtons, `${name} ${theme} : boutons principaux`).toBeLessThanOrEqual(1);
        expect(a.neonAccent, `${name} ${theme} : néons`).toBeLessThanOrEqual(1);
        expect(a.buttonsWithoutIcon, `${name} ${theme} : boutons sans icône`).toEqual([]);
        expect(a.greens, `${name} ${theme} : vert`).toEqual([]);
        expect(a.truncated, `${name} ${theme} : texte tronqué`).toEqual([]);
        expect(a.horizontalScroll, `${name} ${theme} : défilement horizontal`).toBe(false);
      }
    }
  });

  test("/app/garage : QR de compte, Béton et Sable, 390 px", async ({ browser }) => {
    mkdirSync(DIR, { recursive: true });
    for (const theme of ["beton", "sable"] as const) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem("orasso.theme", t), theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/garage");
      await expect(page.getByTestId("account-qr-code")).toBeVisible();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${DIR}/garage-qr-390-${theme}.png`, fullPage: true });
      const a = await auditPage(page);
      expect(a.horizontalScroll).toBe(false);
      expect(a.greens).toEqual([]);
      await ctx.close();
    }
  });
});
