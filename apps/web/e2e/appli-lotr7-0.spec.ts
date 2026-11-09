import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";

// Lot R7-0 (corrections du 08/11, appli) sur l'événement en cours « Rassemblement du Lydia » du seed (Damien_66 retenu et
// entré, Nina_34 entrée la veille seulement, accès « tout l'événement ») : « En cours · jour N sur M » (jamais « J+1 »),
// pas de bandeau d'invitation une fois retenu, tampon daté de l'entrée, « Mon accès » qui suit le thème (carte du QR
// crème dans les deux), entrée valable pour tout l'événement, vote « jusqu'au <jour> », classement caché avant le vote.
// APP_URL = l'appli compilée ; API et seed lancés (`pnpm db:seed` recrée l'événement en cours s'il a fini).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.setTimeout(240_000);

const SLUG = "rassemblement-du-lydia";
type Theme = "beton" | "sable";

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 860 },
    baseURL: APP,
    timezoneId: "Europe/Paris",
  });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page: await ctx.newPage() };
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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 60_000 });
}

async function myPlace(email: string) {
  const cookie = await login(email);
  const apps = await apiCall<{ id: string; checkedInAt: string | null; event: { id: string; slug: string } }[]>(
    cookie,
    "GET",
    "/me/applications?scope=upcoming",
  );
  const a = apps.data.find((x) => x.event.slug === SLUG);
  expect(a, `${email} a une place au Lydia (seed)`).toBeTruthy();
  return a as NonNullable<typeof a>;
}

test("Accueil, Sorties, fiche, passeport et vote de Damien pendant le Lydia", async ({ browser }) => {
  const place = await myPlace("damien@orasso.local");
  expect(place.checkedInAt).toBeTruthy();
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");

    // Accueil : « En cours » et « Jour N sur 4 », jamais « J+1 ».
    await page.goto("/accueil");
    await afterOpening(page);
    const outing = page.getByTestId("home-outing").filter({ hasText: "Rassemblement du Lydia" });
    await expect(outing).toBeVisible({ timeout: 30_000 });
    await expect(outing).toContainText(/En cours/i);
    await expect(outing).toContainText(/Jour \d sur 4/i);
    await expect(outing).not.toContainText(/J\+\d/);

    // Mes sorties : « En cours · jour N sur 4 ».
    await page.goto("/sorties");
    await afterOpening(page);
    await expect(page.getByText(/En cours · jour \d sur 4/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/J\+\d/)).toHaveCount(0);

    // Fiche : plus de bandeau « t'invite » (retenu, entré).
    await page.goto(`/e/${SLUG}`);
    await afterOpening(page);
    await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    await expect(page.getByText(/t'invite/)).toHaveCount(0);

    // Passeport : le tampon porte le jour de l'entrée (jj.mm, Paris).
    const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })
      .format(new Date(place.checkedInAt as string))
      .replace("/", ".");
    await page.goto("/mon-passeport");
    await afterOpening(page);
    await expect(page.getByLabel(new RegExp(`Tampon Rassemblement du Lydia, ${day.replace(".", "\\.")}`))).toBeVisible({
      timeout: 30_000,
    });

    // Vote : « jusqu'au <jour> », classement caché avant le vote.
    await page.goto(`/vote/${place.event.id}`);
    await afterOpening(page);
    await expect(page.getByText(/vote ouvert jusqu'au \w+ \d+ \S+, \d+ h/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vote-ranking-hidden")).toContainText("Le classement s'affiche après ton vote");
    await expect(page.getByTestId("vote-board")).toHaveCount(0);
    await ctx.close();
  }
});

test("Mon accès suit le thème, la carte du QR reste crème ; entré la veille, l'accès vaut pour tout l'événement", async ({
  browser,
}) => {
  const nina = await myPlace("nina@orasso.local");
  expect(nina.checkedInAt).toBeTruthy();
  const bg: Record<Theme, string | null> = { beton: null, sable: null };
  const edge = async (page: Page) =>
    (await page.screenshot({ clip: { x: 0, y: 4, width: 6, height: 6 } })).toString("base64");
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "nina@orasso.local");
    await page.goto(`/jour-j/${nina.id}`);
    await afterOpening(page);
    const poster = page.getByTestId("qr-poster");
    await expect(poster).toBeVisible({ timeout: 45_000 });
    expect(await poster.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(243, 235, 221)");
    // L'écran suit le thème : le fond n'est pas le même en Béton et en Sable.
    bg[theme] = await edge(page);
    // Entrée de la veille : « Entrée enregistrée », « Entrée … · accès jusqu'au … », et le QR en second.
    await expect(page.getByTestId("jourj-entered")).toContainText("Entrée enregistrée");
    await expect(page.getByTestId("jourj-entered")).toContainText(
      /Entré \S+ à \d+ h(?: \d+)? · accès jusqu'au \S+ \d+ \S+/,
    );
    await expect(page.getByTestId("jourj-reentry")).toContainText("pour un contrôle");
    await expect(page.getByTestId("qr-say")).toContainText("Seulement si on te le demande");
    await ctx.close();
  }
  expect(bg.beton).not.toBe(bg.sable);
});

test("Nina_34, entrée la veille : sur la fiche, le bouton principal ne redevient pas « Mon QR » (tour 2)", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, "nina@orasso.local");
  await page.goto(`/e/${SLUG}`);
  await afterOpening(page);
  await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Voir ma candidature" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Mon QR" })).toHaveCount(0);
  await ctx.close();
});

test("Vote réussi puis classement qui ne se relit pas : la raison et « Réessayer », puis le classement (tour 2)", async ({
  browser,
}) => {
  const place = await myPlace("nina@orasso.local");
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, "nina@orasso.local");
  // La relecture du classement (GET, sans suffixe) échoue tant que la route est posée ; le vote (PUT) passe.
  const board = //events/[^/]+/audience-prize$/;
  const failing = (route: import("@playwright/test").Route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 500, body: "{}" }) : route.fallback();
  await page.goto(`/vote/${place.event.id}`);
  await afterOpening(page);
  await expect(page.getByTestId("vote-grid")).toBeVisible({ timeout: 45_000 });
  await page.route(board, failing);
  // Une voiture qui n'est pas la sienne (la grille grise la sienne).
  await page.getByTestId("vote-card").first().click();
  await page.getByTestId("vote-cta").click();
  await expect(page.getByTestId("vote-saved")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("vote-ranking-failed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("vote-board")).toHaveCount(0);
  await page.unroute(board, failing);
  await page.getByTestId("vote-ranking-retry").click();
  await expect(page.getByTestId("vote-board")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("vote-ranking-failed")).toHaveCount(0);
  await ctx.close();
});
