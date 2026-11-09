import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, MOBILE, setTheme, signUpApi, unique } from "./helpers";
import { creerComptePastilles } from "./r7a1-pastilles";
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
    await expect(header.getByRole("link", { name: "Activité" })).toHaveAttribute("href", "/app/activite");
    await expect(header.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/app/messages");
    await expect(header.getByRole("link", { name: "Boîte" })).toHaveCount(0);

    // Tour 2 : la cloche compte les notifications non lues et les demandes en attente, la bulle les conversations non lues
    // seulement. (La lecture passe par la session du navigateur : une nouvelle connexion ajouterait elle-même une notification.)
    // Lot R7c2 : cloche = nouveautés depuis la dernière ouverture + demandes hors demandes de message ; bulle = conversations
    // non lues + demandes de message (une demande ne compte qu'une fois).
    const summary = (await (await page.request.get("/api/me/inbox/summary")).json()) as {
      unreadMessages: number;
      unseenActivity: number;
      pendingRequests: number;
      requests: { contact: number };
    };
    const contact = summary.requests.contact;
    const bell = (await header.getByRole("link", { name: "Activité" }).innerText()).trim();
    const bubble = (await header.getByRole("link", { name: "Messages" }).innerText()).trim();
    const wantBell = summary.unseenActivity + Math.max(0, summary.pendingRequests - contact);
    const wantBubble = summary.unreadMessages + contact;
    expect(bell).toBe(wantBell ? String(wantBell) : "");
    expect(bubble).toBe(wantBubble ? String(wantBubble) : "");
    // Les noms accessibles annoncent le nombre.
    if (wantBell) {
      await expect(
        header.getByRole("link", { name: `Activité, ${wantBell} non lue${wantBell > 1 ? "s" : ""}` }),
      ).toBeVisible();
    }
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

test("Le Fil (coquille) : les notifications seules, rien marqué comme lu ; la cloche mène au Journal", async ({
  page,
}) => {
  const compte = await creerComptePastilles();
  await compte.ajouterNotificationNonLue();
  await loginInBrowser(page, compte.email, undefined, "/app");
  const unread = async () =>
    ((await (await page.request.get("/api/me")).json()) as { counts: { unreadNotifications: number } }).counts
      .unreadNotifications;
  const before = await unread();
  expect(before).toBeGreaterThan(0);
  await page.goto("/app/fil");
  await expect(page.getByRole("heading", { name: "Le Fil", exact: true })).toBeVisible();
  await expect(page.getByTestId("journal")).toBeVisible();
  // Comme l'appli : les notifications seules (ni conversations ni demandes), et la page ne marque rien comme lu.
  await expect(page.getByTestId("journal-item").first()).toBeVisible();
  await expect(page.locator(".s-convo")).toHaveCount(0);
  await expect(page.getByTestId("inbox-request")).toHaveCount(0);
  expect(await unread()).toBe(before);
  // Tour 3 : comme l'appli, pas de « Tout marquer comme lu » sur Le Fil.
  await expect(page.getByRole("button", { name: "Tout marquer comme lu" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Boîte", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Mon compte" })).toBeVisible();
  await shot(page, "fil-390");
  await page.locator("header.o-appbar--tab").getByRole("link", { name: "Activité" }).click();
  await page.waitForURL((url) => url.pathname === "/app/activite");
  await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
  await page.locator("header.o-appbar--tab").getByRole("link", { name: "Messages" }).click();
  await page.waitForURL((url) => url.pathname === "/app/messages");
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

test("le bandeau « où sont passées les choses » : vu une fois par navigateur, jamais deux", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  await page.goto("/app");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("Orasso se range autrement");
  await expect(banner(page)).toContainText("Mon garage");
  await expect(banner(page)).toContainText("Rien n'est perdu");
  // Sous le bonjour (maquette R7.1), avec de l'air entre les deux, et un ✕ qui se lit « Fermer l'explication ».
  const hello = await page.getByRole("heading", { name: /^Salut / }).boundingBox();
  const box = await banner(page).boundingBox();
  expect((box?.y ?? 0) - ((hello?.y ?? 0) + (hello?.height ?? 0))).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId("whatsnew-dismiss")).toHaveAccessibleName("Fermer l'explication");
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
  // Tour 3 : un cookie de préférence `vu` par navigateur, sans identifiant de compte ni secret.
  expect(cookie?.value).toBe("vu");
  await page.reload();
  await expect(banner(page)).toHaveCount(0);

  // Un autre compte sur le même navigateur ne le revoit pas (accepté : le cookie est par navigateur).
  await page.goto("/app/moi");
  await page.getByTestId("reglage-deconnexion").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/app"));
  await loginInBrowser(page, "lea@orasso.local", undefined, "/app");
  await page.goto("/app");
  await expect(banner(page)).toHaveCount(0);
  await ctx.close();
});

test("le visiteur : bandeau sans le Garage, ses archives et son QR de compte par un lien du Profil (l'exposant a la ligne « Mon garage »)", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  const pseudo = `Visiteur_${unique()}`;
  await signUpApi(pseudo);
  await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, undefined, "/app");
  await page.goto("/app");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("Orasso se range autrement");
  await expect(banner(page)).not.toContainText("garage");
  await shot(page, "bandeau-visiteur-390");
  await page.goto("/app/moi");
  // Tour 3 : le visiteur garde ses archives et son QR de compte, comme dans l'appli.
  await expect(page.getByTestId("garage-archives-link")).toHaveText("Mes véhicules archivés et mon QR de compte");
  await expect(page.getByTestId("garage-archives-link")).toHaveAttribute("href", "/app/garage");
  await shot(page, "profil-visiteur-390");
  await ctx.close();
  // L'exposant (Kenji) : la ligne est là, comme dans l'appli.
  const k = await browser.newContext({ viewport: MOBILE });
  const kp = await k.newPage();
  await loginInBrowser(kp, "kenji@orasso.local", undefined, "/app/moi");
  await kp.goto("/app/moi");
  await expect(kp.getByTestId("garage-link")).toBeVisible();
  await expect(kp.getByTestId("garage-link")).toContainText("Tes véhicules et leurs photos");
  await expect(kp.getByTestId("garage-archives-link")).toHaveCount(0);
  await k.close();
});

test("les pastilles : une demande seule fait monter la cloche, pas la bulle ; une conversation non lue, la bulle", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const compte = await creerComptePastilles();
  const before = await compte.summary();
  expect(before.unreadMessages).toBe(0);
  expect(before.requests.contact).toBe(1);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, compte.email, undefined, "/app");
  await page.goto("/app");
  const header = page.locator("header.o-appbar--tab");
  // Demande seule : la bulle est sans pastille, la cloche en a une (au moins la demande).
  await expect(header.getByRole("link", { name: "Messages" })).toHaveAccessibleName("Messages");
  await expect(header.getByRole("link", { name: "Messages" }).locator(".o-appbar__count")).toHaveCount(0);
  await expect(header.getByRole("link", { name: /^Activité, \d+ non lues?$/ })).toBeVisible();
  await shot(page, "pastilles-demande-seule-390");
  // Une conversation non lue : la bulle affiche 1.
  await compte.ajouterConversationNonLue();
  await page.reload();
  const bubble = header.getByRole("link", { name: "Messages, 1 non lu" });
  await expect(bubble).toBeVisible();
  await expect(bubble.locator(".o-appbar__count")).toHaveText("1");
  await shot(page, "pastilles-conversation-390");
  await ctx.close();
});
