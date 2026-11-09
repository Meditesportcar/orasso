import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7a1 (D38), côté site : la barre Explorer · Le Fil · Accueil · Crew · Profil, Sorties et Garage joignables par leur
// adresse (en-tête de fiche, sans barre), la loupe, la cloche « Activité » et la bulle « Messages » avec leurs pastilles
// (celles de `GET /me`), Le Fil et Crew (coquilles), le bandeau « où sont passées les choses » (cookie `whatsnew_r7`
// haché par compte). Kenji (chef de Roussillon Drift), Sarah (sans crew), Léa. API et site seedés.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7a1-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000, viewport: MOBILE });

const BAR = ["Explorer", "Le Fil", "Accueil", "Crew", "Profil"];
const HREFS = ["/app/explorer", "/app/fil", "/app", "/app/crew", "/app/moi"];

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Le bandeau est posé en haut de l'Accueil d'un compte qui ne l'a pas encore vu. */
const banner = (page: Page) => page.getByTestId("whatsnew-banner");

test("la barre : cinq onglets dans l'ordre, la loupe, la cloche et la bulle, plus de Boîte", async ({ browser }) => {
  for (const theme of ["beton", "sable"] as const) {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
    const nav = page.getByRole("navigation", { name: "Mon compte" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(5);
    expect(await links.evaluateAll((els) => els.map((el) => el.textContent?.trim()))).toEqual(BAR);
    expect(await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")))).toEqual(HREFS);
    for (const old of ["Sorties", "Garage", "Passeport"])
      await expect(nav.getByRole("link", { name: old })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");

    const header = page.locator("header.o-appbar--tab");
    await expect(header.getByRole("link", { name: "Rechercher" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Activité" })).toHaveAttribute("href", "/app/journal");
    await expect(header.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/app/boite");
    await expect(header.getByRole("link", { name: "Boîte" })).toHaveCount(0);

    // Les pastilles sont celles de `GET /me` : notifications non lues pour la cloche, conversations et demandes pour la bulle.
    // (La lecture passe par la session du navigateur : une nouvelle connexion ajouterait elle-même une notification.)
    const me = {
      data: (await (await page.request.get("/api/me")).json()) as {
        unreadInbox: number;
        counts: { unreadNotifications: number };
      },
    };
    const bell = (await header.getByRole("link", { name: "Activité" }).innerText()).trim();
    const bubble = (await header.getByRole("link", { name: "Messages" }).innerText()).trim();
    expect(bell).toBe(me.data.counts.unreadNotifications ? String(me.data.counts.unreadNotifications) : "");
    expect(bubble).toBe(me.data.unreadInbox ? String(me.data.unreadInbox) : "");
    await shot(page, `barre-${theme}-390`);

    // Chaque onglet ouvre sa page, l'onglet actif suit.
    for (const [label, href] of [
      ["Le Fil", "/app/fil"],
      ["Crew", "/app/crew"],
    ] as const) {
      await nav.getByRole("link", { name: label }).click();
      await page.waitForURL((url) => url.pathname === href);
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
    await ctx.close();
  }
});

test("la barre à 1 280 px : même ordre", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  const links = page.getByRole("navigation", { name: "Mon compte" }).getByRole("link");
  expect(await links.evaluateAll((els) => els.map((el) => el.textContent?.trim()))).toEqual(BAR);
  await shot(page, "accueil-1280");
  await ctx.close();
});

test("Sorties et Garage : joignables par leur adresse, en-tête de fiche, sans barre d'onglets", async ({ page }) => {
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  for (const [path, title] of [
    ["/app/sorties", "Mes sorties"],
    ["/app/garage", "Garage"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mon compte" })).toHaveCount(0);
    await expect(page.locator("header.o-appbar--tab")).toHaveCount(0);
    await expect(page.locator("header.fiche-bar")).toBeVisible();
  }
  // Le ✕ de Sorties revient à l'Accueil, celui du Garage au Profil.
  await page.goto("/app/sorties");
  await page.locator("header.fiche-bar").getByRole("link", { name: "Fermer" }).click();
  await page.waitForURL((url) => url.pathname === "/app");
  await page.goto("/app/garage");
  await page.locator("header.fiche-bar").getByRole("link", { name: "Fermer" }).click();
  await page.waitForURL((url) => url.pathname === "/app/moi");
  // Le Profil garde son lien vers le Garage.
  await expect(page.getByTestId("garage-link")).toBeVisible();
  // Les anciennes adresses d'onglet (`/app/acces`, `/app/passeport`) restent valables.
  const res = await page.request.get("/app/acces", { maxRedirects: 0 }).catch(() => null);
  expect(res === null || [200, 301, 302, 303, 307, 308].includes(res.status())).toBe(true);
});

test("Le Fil (coquille) rend le Journal sous son titre ; la cloche mène toujours au Journal", async ({ page }) => {
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await page.goto("/app/fil");
  await expect(page.getByRole("heading", { name: "Le Fil", exact: true })).toBeVisible();
  await expect(page.getByTestId("journal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Boîte", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Mon compte" })).toBeVisible();
  await shot(page, "fil-390");
  await page.locator("header.o-appbar--tab").getByRole("link", { name: "Activité" }).click();
  await page.waitForURL((url) => url.pathname === "/app/journal");
  await expect(page.getByRole("heading", { name: "Boîte", exact: true })).toBeVisible();
  await page.locator("header.o-appbar--tab").getByRole("link", { name: "Messages" }).click();
  await page.waitForURL((url) => url.pathname === "/app/boite");
});

test("Crew (coquille) : avec un crew, sans crew", async ({ browser }) => {
  const k = await browser.newContext({ viewport: MOBILE });
  const kp = await k.newPage();
  await loginInBrowser(kp, "kenji@orasso.local", undefined, "/app/crew");
  await kp.goto("/app/crew");
  await expect(kp.getByRole("heading", { name: "Crew", exact: true })).toBeVisible();
  await expect(kp.getByTestId("crew-tab-mine")).toBeVisible();
  await expect(kp.getByTestId("crew-tab-open")).toHaveAttribute("href", "/c/roussillon-drift");
  await expect(kp.getByTestId("crew-tab-none")).toHaveCount(0);
  await shot(kp, "crew-kenji-390");
  await k.close();

  const s = await browser.newContext({ viewport: MOBILE });
  const sp = await s.newPage();
  await loginInBrowser(sp, "sarah@orasso.local", undefined, "/app/crew");
  await sp.goto("/app/crew");
  await expect(sp.getByTestId("crew-tab-none")).toBeVisible();
  await expect(sp.getByTestId("crew-tab-join")).toHaveAttribute("href", "/app/crews/rejoindre");
  await expect(sp.getByTestId("crew-tab-join")).toContainText("Rejoindre un crew");
  await expect(sp.getByTestId("crew-tab-create")).toContainText("Créer un crew");
  await shot(sp, "crew-sarah-390");
  await s.close();
});

test("le bandeau « où sont passées les choses » : vu une fois par compte, jamais deux", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await page.goto("/app");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("Sorties est dans l'Accueil");
  await expect(banner(page)).toContainText("Rien n'est perdu");
  await shot(page, "bandeau-kenji-390");
  // Seulement sur l'Accueil.
  await page.goto("/app/explorer");
  await expect(banner(page)).toHaveCount(0);
  await page.goto("/app");
  await expect(banner(page)).toBeVisible();
  await page.getByTestId("whatsnew-dismiss").click();
  await page.waitForURL((url) => url.pathname === "/app");
  await expect(banner(page)).toHaveCount(0);
  const cookie = (await ctx.cookies()).find((c) => c.name === "whatsnew_r7");
  expect(cookie).toBeDefined();
  // Un haché : jamais l'identifiant du compte.
  expect(cookie?.value).toMatch(/^[0-9a-f]{16}$/);
  const me = await apiCall<{ user: { id: string } }>(await login("kenji@orasso.local"), "GET", "/me");
  expect(cookie?.value).not.toContain(me.data.user.id);
  await page.reload();
  await expect(banner(page)).toHaveCount(0);

  // Un autre compte sur le même navigateur le voit à son tour ; le premier ne le revoit pas.
  await page.goto("/app/moi");
  await page.getByTestId("reglage-deconnexion").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/app"));
  await loginInBrowser(page, "lea@orasso.local", undefined, "/app");
  await page.goto("/app");
  await expect(banner(page)).toBeVisible();
  await page.getByTestId("whatsnew-dismiss").click();
  await expect(banner(page)).toHaveCount(0);
  const both = (await ctx.cookies()).find((c) => c.name === "whatsnew_r7");
  expect(both?.value.split(".").length).toBe(2);
  await page.goto("/app/moi");
  await page.getByTestId("reglage-deconnexion").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/app"));
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await page.goto("/app");
  await expect(banner(page)).toHaveCount(0);
  await ctx.close();
});
