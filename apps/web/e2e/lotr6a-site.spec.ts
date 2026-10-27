import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, loginInBrowser, setTheme, unique } from "./helpers";
import { type R5Account, type R5Crew, r5Crew, r5Outing } from "./lotr5c2-setup";
import { comment, fire, postText, removeMember, removePost } from "./lotr6a-setup";
import { RELAIS } from "./relais";

// Lot R6a (site) : la page du crew en direct, comme l'appli. La page de « Kenji » (le chef) est ouverte ; « Julie »
// (membre) publie, met une flamme, commente, propose une sortie, retire sa publication : la page de Kenji le montre sans
// recharger. Loin du haut du fil, une pastille « 1 nouvelle publication » remonte au clic. Julie retirée du crew : sa
// page ne reçoit plus rien. Captures Béton et Sable, 390 et 1 280 px. CAPTURES_PHASE=avant pour les captures d'avant
// le lot (test « captures » seul).
const PHASE = process.env.CAPTURES_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6a-captures/${PHASE}/recette-site`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function open(browser: Browser, who: R5Account, theme: "beton" | "sable", width: number, path: string) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  await loginInBrowser(page, who.email, undefined, path);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return page;
}

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

async function postIdOf(crew: R5Crew, who: R5Account, text: string): Promise<string> {
  const feed = await apiCall<{ items: { post?: { id: string; text: string | null } }[] }>(
    who.cookie,
    "GET",
    `/crews/${crew.id}/feed`,
  );
  const found = feed.data.items.find((i) => i.post?.text?.includes(text));
  if (!found?.post) throw new Error(`Publication introuvable : ${text}`);
  return found.post.id;
}

test("captures : la page du crew, onglet Fil (site)", async ({ browser }) => {
  test.setTimeout(600_000);
  for (const theme of ["beton", "sable"] as const) {
    const crew = await liveCrew();
    for (const width of [390, 1280]) {
      const k = await open(browser, crew.chef, theme, width, `/c/${crew.slug}`);
      await expect(k.getByTestId("crew-post").first()).toBeVisible({ timeout: 30_000 });
      await shot(k, `01-fil-${width}-${theme}`);
      await k.mouse.wheel(0, 700);
      await shot(k, `02-fil-defile-${width}-${theme}`);
      await k.context().close();
    }
  }
});

test("site : la page du crew en direct, à deux", async ({ browser }) => {
  test.setTimeout(900_000);
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const crew = await liveCrew();
      const kenji = crew.chef;
      const julie = crew.lea;
      const k = await open(browser, kenji, theme, width, `/c/${crew.slug}`);
      const posts = k.getByTestId("crew-post");
      await expect(posts).toHaveCount(4, { timeout: 30_000 });

      // Julie publie : en haut du fil, la publication s'insère sans recharger.
      const first = `Julie arrive avec la MX-5 (${tag})`;
      const firstId = await postText(crew, julie, first);
      await expect(posts.filter({ hasText: first })).toBeVisible({ timeout: 15_000 });
      await expect(posts).toHaveCount(5);

      // Flamme et commentaire de Julie : les nombres se mettent à jour sur place ; la fenêtre ouverte les reçoit.
      const mine = posts.filter({ hasText: "Publication de départ n° 3" });
      const mineId = await postIdOf(crew, kenji, "Publication de départ n° 3");
      await fire(crew, julie, mineId);
      await expect(mine.getByTestId("crew-post-fire")).toContainText("1", { timeout: 15_000 });
      await mine.getByTestId("crew-post-comments").click();
      await expect(k.getByTestId("crew-comments-sheet")).toBeVisible();
      await comment(crew, julie, mineId, "Je serai là à 9 h pile.");
      await expect(k.getByTestId("crew-comment").filter({ hasText: "Je serai là à 9 h pile." })).toBeVisible({
        timeout: 15_000,
      });
      await shot(k, `03-commentaire-en-direct-${tag}`);
      await k.keyboard.press("Escape");
      await expect(mine.getByTestId("crew-post-comments")).toContainText("1", { timeout: 15_000 });

      // Julie propose une sortie : elle entre dans le fil et dans la colonne (ou l'onglet) des sorties.
      await r5Outing(crew, julie, "Balade des Aspres", 5);
      await expect(k.getByTestId("crew-auto-outing").filter({ hasText: "Balade des Aspres" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(k.getByTestId("crew-tab-sorties")).toContainText("1", { timeout: 15_000 });

      // Loin du haut du fil : une pastille, la liste ne saute pas ; au clic, on remonte et la publication est là.
      await k.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await k.waitForTimeout(500);
      const second = `Photo du Col de Jau (${tag})`;
      await postText(crew, julie, second);
      const pill = k.getByTestId("crew-feed-new");
      await expect(pill).toBeVisible({ timeout: 15_000 });
      await expect(pill).toHaveText("1 nouvelle publication");
      await expect(posts.filter({ hasText: second })).toHaveCount(0);
      await shot(k, `04-pastille-${tag}`);
      await pill.click();
      await expect(posts.filter({ hasText: second })).toBeVisible({ timeout: 15_000 });
      await expect(pill).toHaveCount(0);
      await shot(k, `05-pastille-cliquee-${tag}`);

      // Julie retire sa publication : elle disparaît.
      await removePost(crew, julie, firstId);
      await expect(posts.filter({ hasText: first })).toHaveCount(0, { timeout: 15_000 });

      // Julie, page ouverte, est retirée du crew : sa page ne reçoit plus rien (elle revient à la vitrine).
      const j = await open(browser, julie, theme, width, `/c/${crew.slug}`);
      await expect(j.getByTestId("crew-feed")).toBeVisible();
      await removeMember(crew, julie);
      await expect(j.getByTestId("crew-vitrine")).toBeVisible({ timeout: 15_000 });
      const after = `Après le départ de Julie (${tag})`;
      await postText(crew, kenji, after);
      await expect(k.getByText(after)).toBeVisible({ timeout: 15_000 });
      await j.waitForTimeout(2_000);
      await expect(j.getByText(after)).toHaveCount(0);
      await shot(j, `06-julie-retiree-${tag}`);
      await j.context().close();
      await k.context().close();
    }
  }
});
