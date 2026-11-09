import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7f4, appli (version web compilée, `APP_URL`) : partager un contenu d'Orasso.
//  - une voiture du garage : la feuille à quatre destinations, « En story » → la carte sur fond 9:16 → publier → la visionneuse montre
//    « Voir la voiture », qui ouvre la voiture ;
//  - un événement : story d'un compte public = l'organisateur est identifié ; d'un compte privé = pas d'identification et la ligne
//    « L'organisateur ne sera pas prévenu » ;
//  - une story de crew ne sort jamais (403 `crew_only`) ; ma story hors crew sort en fichier signé.
// API et seed lancés ; événement « Rassemblement du Lydia ». Aucune plaque lisible (photos de démonstration).
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7f4-captures/apres/recette-appli`).replaceAll("\\", "/");
const THEME = (process.env.R7F4_THEME ?? "sable") as "beton" | "sable";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000, locale: "fr-FR", timezoneId: "Europe/Paris" });
test.setTimeout(420_000);
mkdirSync(DIR, { recursive: true });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: "beton" | "sable" = THEME, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", String(t));
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
  return { ctx, page };
}

type Story = { id: string; linked: { type: string; label: string } | null; audience: string };

async function myStories(cookie: string): Promise<Story[]> {
  return ((await apiCall<{ stories: Story[] }>(cookie, "GET", "/me/stories")).data.stories ?? []) as Story[];
}

test("une voiture du garage : feuille, carte sur fond 9:16, publication, carte touchable dans la visionneuse", async ({
  browser,
}) => {
  const cookie = await login("damien@orasso.local");
  const vehicles = (await apiCall<{ id: string }[] | { items: { id: string }[] }>(cookie, "GET", "/me/vehicles")).data;
  const list = Array.isArray(vehicles) ? vehicles : vehicles.items;
  // Une voiture à photo montrable : l'API le dit (`destinations.story`).
  let vehicleId = "";
  for (const v of list) {
    const info = (
      await apiCall<{ destinations: { story: boolean } }>(cookie, "GET", `/me/share/info?type=vehicle&id=${v.id}`)
    ).data;
    if (info.destinations.story) {
      vehicleId = v.id;
      break;
    }
  }
  expect(vehicleId, "une voiture de démonstration à photo masquée").not.toBe("");
  const before = (await myStories(cookie)).length;
  for (const scale of [1, 1.3]) {
    const { ctx, page } = await open(browser, "damien@orasso.local", THEME, scale);
    await page.goto(`/vehicule/${vehicleId}/partager`);
    await afterOpening(page);
    await expect(page.getByTestId("share-sheet")).toBeVisible({ timeout: 30_000 });
    for (const d of ["story", "feed", "message", "external"])
      await expect(page.getByTestId(`share-dest-${d}`)).toBeVisible();
    await page.screenshot({ path: `${DIR}/appli-feuille-voiture-${THEME}-${scale}.png` });
    if (scale === 1) {
      await page.getByTestId("share-dest-story").click();
      await expect(page.getByTestId("share-story-composer")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("share-story-card")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("share-story-link")).toContainText("Voir la voiture");
      await page.waitForFunction(
        () => {
          const img = document.querySelector<HTMLImageElement>('[data-testid="share-story-card"] img');
          return Boolean(img?.complete && img.naturalWidth > 0);
        },
        null,
        { timeout: 60_000 },
      );
      await page.screenshot({ path: `${DIR}/appli-composeur-voiture-${THEME}.png` });
      await page.getByTestId("share-story-publish").click();
      await expect.poll(async () => (await myStories(cookie)).length, { timeout: 60_000 }).toBe(before + 1);
    }
    await ctx.close();
  }
  const mine = (await myStories(cookie)).find((s) => s.linked?.type === "vehicle");
  expect(mine?.linked?.label).toBe("Voir la voiture");
  // La visionneuse : la carte touchable ouvre la voiture.
  const me = (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data;
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await page.goto(`/story/${encodeURIComponent(`u:${me.user.id}`)}`);
  await afterOpening(page);
  await expect(page.getByTestId("story-linked")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${DIR}/appli-visionneuse-carte-${THEME}.png` });
  await page.getByTestId("story-linked").click();
  await expect(page).toHaveURL(/vehicule\//, { timeout: 30_000 });
  await ctx.close();
  // Ma story hors crew sort en fichier signé (9:16).
  const res = await fetch(
    `${process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4451}`}/api/stories/${mine?.id}/export`,
    {
      headers: { cookie },
    },
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/jpeg");
});

test("un événement : compte public = organisateur identifié ; compte privé = pas d'identification, ligne dite", async ({
  browser,
}) => {
  const cookie = await login("damien@orasso.local");
  const events = (
    await apiCall<{ items: { id: string; slug: string; title: string }[] }>(cookie, "GET", "/events?q=Lydia")
  ).data;
  const lydia = events.items.find((e) => e.title.includes("Lydia"));
  expect(lydia).toBeTruthy();
  for (const [email, notified] of [
    ["kenji@orasso.local", true],
    ["marc@orasso.local", false],
  ] as const) {
    const { ctx, page } = await open(browser, email);
    await page.goto(`/e/${lydia?.slug}`);
    await afterOpening(page);
    await page.getByTestId("event-share").click();
    await expect(page.getByTestId("share-sheet")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${DIR}/appli-feuille-evenement-${THEME}-${notified ? "public" : "prive"}.png` });
    await page.getByTestId("share-dest-story").click();
    await expect(page.getByTestId("share-story-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("share-story-organizer")).toContainText(
      notified ? "sera prévenu" : "ne sera pas prévenu : compte privé",
    );
    // L'aperçu (carte et fond rendus par l'API) est chargé avant la capture : jamais un cadre vide.
    await page.waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll("img")].filter((i) => i.getBoundingClientRect().width > 100);
        return imgs.length >= 1 && imgs.every((i) => i.complete && i.naturalWidth > 0);
      },
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/appli-composeur-evenement-${THEME}-${notified ? "public" : "prive"}.png` });
    // Pas de bouton principal grisé sans explication : l'audience est choisie d'office.
    await page.getByTestId("share-story-publish").click();
    const c = await login(email);
    await expect
      .poll(async () => (await myStories(c)).some((s) => s.linked?.type === "event"), { timeout: 60_000 })
      .toBe(true);
    await ctx.close();
  }
});

test("une story de crew ne sort jamais ; la sortie d'une story publique est un fichier 9:16", async () => {
  const cookie = await login("kenji@orasso.local");
  const crew = (await myStories(cookie)).find((s) => s.audience === "crew");
  const base = `http://localhost:${process.env.API_PORT ?? 4451}`;
  if (crew) {
    const res = await fetch(`${base}/api/stories/${crew.id}/export`, { headers: { cookie } });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("crew_only");
  }
  const open = (await myStories(cookie)).find((s) => s.audience !== "crew");
  if (open) {
    const res = await fetch(`${base}/api/stories/${open.id}/export`, { headers: { cookie } });
    expect(res.status).toBe(200);
  }
});

// La recette publie des stories de carte avec les comptes du seed : elle les retire (les autres recettes comptent les stories du seed).
test.afterAll(async () => {
  for (const email of ["damien@orasso.local", "kenji@orasso.local", "marc@orasso.local"]) {
    const cookie = await login(email);
    for (const s of await myStories(cookie)) {
      if (s.linked) await apiCall(cookie, "DELETE", `/me/stories/${s.id}`);
    }
  }
});

// Tour 2 : « En message » lit les conversations par pages ; rien n'est envoyé ici (la liste, ou « Aucune conversation » si tout est lu et vide).
test("tour 2 : En message liste les conversations (ou dit « Aucune conversation » une fois tout lu)", async ({
  browser,
}) => {
  const cookie = await login("damien@orasso.local");
  const events = (
    await apiCall<{ items: { id: string; slug: string; title: string }[] }>(cookie, "GET", "/events?q=Lydia")
  ).data;
  const lydia = events.items.find((e) => e.title.includes("Lydia"));
  const { ctx, page } = await open(browser, "damien@orasso.local");
  await page.goto(`/e/${lydia?.slug}`);
  await afterOpening(page);
  await page.getByTestId("event-share").click();
  await expect(page.getByTestId("share-sheet")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("share-dest-message").click();
  await expect(page.getByTestId("share-message")).toBeVisible();
  await expect(
    page
      .locator('[data-testid^="share-conv-"]:not([data-testid="share-conv-more"]), :text("Aucune conversation")')
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Chargement…")).toHaveCount(0);
  await ctx.close();
});
