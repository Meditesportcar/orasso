import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, unique } from "./helpers";
import { type R5Account, type R5Crew, r5Crew, r5Outing } from "./lotr5c2-setup";
import { comment, fire, postText, removeMember, removePost } from "./lotr6a-setup";
import { RELAIS } from "./relais";

// Lot R6a (appli, version web compilée) : la page du crew en direct. Deux personnes, deux contextes : la page de
// « Kenji » (le chef) est ouverte ; « Julie » (membre) publie, met une flamme, commente, propose une sortie, retire sa
// publication : la page de Kenji le montre sans recharger. Loin du haut du fil, une pastille « 1 nouvelle
// publication » remonte au toucher. Julie retirée du crew : sa page ne reçoit plus rien. Captures Béton et Sable,
// 390 et 384 px (Pixel de Damien). Lancer avec APP_URL=http://localhost:<port de l'appli> ; CAPTURES_PHASE=avant pour
// les captures d'avant le lot (test « captures » seul).
const APP = process.env.APP_URL;
const PHASE = process.env.CAPTURES_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6a-captures/${PHASE}/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, who: R5Account, theme: string, width = 390): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(who.email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return page;
}

async function openCrew(page: Page, slug: string, extra = "") {
  await page.goto(`/crew/${slug}${extra}`);
  await skipOpening(page);
  await expect(page.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
}

/** Fait défiler la page de l'appli (défilement interne de React Native Web). */
async function scrollBy(page: Page, px: number) {
  const { width, height } = page.viewportSize() ?? { width: 390, height: 844 };
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, px);
  await page.waitForTimeout(500);
}

/** Un crew de recette avec quelques publications (Kenji et Julie). */
async function liveCrew(): Promise<R5Crew> {
  const crew = await r5Crew(unique());
  for (let i = 1; i <= 4; i += 1) {
    await postText(
      crew,
      i % 2 ? crew.chef : crew.lea,
      `Publication de départ n° ${i} : rendez-vous au parking de Thuir.`,
    );
  }
  return crew;
}

test("captures : la page du crew, onglet Fil", async ({ browser }) => {
  test.setTimeout(600_000);
  for (const theme of ["beton", "sable"] as const) {
    const crew = await liveCrew();
    for (const width of [390, 384]) {
      const k = await appLogin(browser, crew.chef, theme, width);
      await openCrew(k, crew.slug);
      await expect(k.getByTestId("crew-post").first()).toBeVisible({ timeout: 30_000 });
      await shot(k, `01-fil-${width}-${theme}`);
      await scrollBy(k, 700);
      await shot(k, `02-fil-defile-${width}-${theme}`);
      await k.context().close();
    }
  }
});

test("appli : la page du crew en direct, à deux", async ({ browser }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  for (const theme of ["beton", "sable"] as const) {
    const crew = await liveCrew();
    const kenji = crew.chef;
    const julie = crew.lea;
    const k = await appLogin(browser, kenji, theme);
    k.on("console", (m) => {
      if (m.type() === "error") errors.push(`${m.text().slice(0, 200)} @ ${m.location().url}`);
    });
    await openCrew(k, crew.slug);
    const posts = k.getByTestId("crew-post");
    await expect(posts).toHaveCount(4, { timeout: 30_000 });

    // Julie publie : en haut du fil, la publication s'insère sans recharger.
    const first = `Julie arrive avec la MX-5 (${theme})`;
    const firstId = await postText(crew, julie, first);
    const card = posts.filter({ hasText: first });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(posts).toHaveCount(5);

    // Flamme et commentaire de Julie : les nombres se mettent à jour sur place.
    const mine = posts.filter({ hasText: "Publication de départ n° 3" });
    const mineId = await mineIdOf(crew, kenji, "Publication de départ n° 3");
    await fire(crew, julie, mineId);
    await expect(mine.getByTestId("crew-post-fire")).toContainText("1", { timeout: 15_000 });
    // La feuille des commentaires ouverte : le commentaire de Julie y arrive.
    await mine.getByTestId("crew-post-comments").click();
    await expect(k.getByTestId("crew-comments").or(k.getByText("Aucun commentaire"))).toBeVisible();
    await comment(crew, julie, mineId, "Je serai là à 9 h pile.");
    await expect(k.getByTestId("crew-comment").filter({ hasText: "Je serai là à 9 h pile." })).toBeVisible({
      timeout: 15_000,
    });
    await shot(k, `03-commentaire-en-direct-${theme}`);
    await k.keyboard.press("Escape");
    await k
      .getByRole("button", { name: /Fermer/ })
      .first()
      .click()
      .catch(() => undefined);
    await expect(mine.getByTestId("crew-post-comments")).toContainText("1", { timeout: 15_000 });

    // Julie propose une sortie : elle entre dans le fil, et l'onglet Sorties la compte.
    await r5Outing(crew, julie, "Balade des Aspres", 5);
    await expect(k.getByTestId("crew-auto-outing").filter({ hasText: "Balade des Aspres" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(k.getByTestId("crew-tab-outings")).toContainText("1", { timeout: 15_000 });

    // Loin du haut du fil : une pastille, la liste ne saute pas ; au toucher, on remonte et la publication est là.
    await scrollBy(k, 1400);
    const second = `Photo du Col de Jau (${theme})`;
    await postText(crew, julie, second);
    const pill = k.getByTestId("crew-feed-new");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveText("1 nouvelle publication");
    await expect(posts.filter({ hasText: second })).toHaveCount(0);
    await shot(k, `04-pastille-${theme}`);
    await pill.click();
    await expect(posts.filter({ hasText: second })).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveCount(0);
    await shot(k, `05-pastille-touchee-${theme}`);

    // Julie retire sa publication : elle disparaît.
    await removePost(crew, julie, firstId);
    await expect(posts.filter({ hasText: first })).toHaveCount(0, { timeout: 15_000 });

    // Julie, page ouverte, est retirée du crew : sa page ne reçoit plus rien (elle revient à la vitrine).
    const j = await appLogin(browser, julie, theme);
    await openCrew(j, crew.slug);
    await expect(j.getByTestId("crew-feed")).toBeVisible();
    await removeMember(crew, julie);
    await expect(j.getByTestId("crew-vitrine")).toBeVisible({ timeout: 15_000 });
    await postText(crew, kenji, `Après le départ de Julie (${theme})`);
    await expect(k.getByText(`Après le départ de Julie (${theme})`)).toBeVisible({ timeout: 15_000 });
    await j.waitForTimeout(2_000);
    await expect(j.getByText(`Après le départ de Julie (${theme})`)).toHaveCount(0);
    await shot(j, `06-julie-retiree-${theme}`);
    await j.context().close();
    await k.context().close();
  }
  expect(
    errors.filter((e) => !/favicon|DevTools|Sentry|expo-notifications|push|maplibre|tiles|glyphs|WebSocket/i.test(e)),
  ).toEqual([]);
});

/** L'identifiant d'une publication par son texte (fil lu par l'API). */
async function mineIdOf(crew: R5Crew, who: R5Account, text: string): Promise<string> {
  const feed = await apiCall<{ items: { type: string; post?: { id: string; text: string | null } }[] }>(
    who.cookie,
    "GET",
    `/crews/${crew.id}/feed`,
  );
  const found = feed.data.items.find((i) => i.post?.text?.includes(text));
  if (!found?.post) throw new Error(`Publication introuvable : ${text}`);
  return found.post.id;
}
