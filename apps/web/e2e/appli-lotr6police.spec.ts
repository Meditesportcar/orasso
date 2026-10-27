import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R6-police (le Pixel de Damien, police du système agrandie) : à 384 px et à l'échelle de police 1,3 (simulée en
// recette, `apps/mobile/src/lib/fontScaleSim.ts`), aucun mot coupé au milieu :
//   - les cinq libellés de la barre d'onglets tiennent chacun sur une ligne, au même corps ;
//   - les trois compteurs du profil (abonnés, abonnements, sorties) ont leur libellé sur une ligne, au même corps ;
//   - le nom de l'organisateur dans la bande de la fiche, le nom du crew, les segments de l'Explorer ne sont jamais
//     coupés au milieu d'un mot ; les étiquettes de la fiche tiennent dans leur cadre ;
//   - « 7 h », « jour J » : espaces insécables.
// Et à l'échelle 1, la barre garde son corps d'origine (9,5 px). Béton et Sable. APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6-police-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const WIDTH = 384;

async function open(browser: Browser, theme: Theme, scale: number) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (s > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
      else localStorage.removeItem("orasso.recette.echellePolice");
    },
    [theme, scale] as const,
  );
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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
  await page.waitForTimeout(1500);
}

/** Les mots coupés sur deux lignes sous `selector` (lettres et chiffres d'un même mot, à des hauteurs différentes). */
async function brokenWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
          const start = m.index ?? 0;
          range.setStart(node, start);
          range.setEnd(node, start + m[0].length);
          const tops = new Set(
            Array.from(range.getClientRects())
              .filter((r) => r.width > 0)
              .map((r) => Math.round(r.top)),
          );
          if (tops.size > 1) out.push(m[0]);
        }
      }
    }
    return out;
  }, selector);
}

/** Pour chaque élément visé, son nombre de lignes et son corps (px). */
async function lines(page: Page, selector: string): Promise<{ text: string; lines: number; size: number }[]> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set(
        Array.from(range.getClientRects())
          .filter((r) => r.width > 0)
          .map((r) => Math.round(r.top)),
      );
      return {
        text: el.textContent ?? "",
        lines: tops.size,
        size: Number.parseFloat(getComputedStyle(el).fontSize),
      };
    });
  }, selector);
}

/** Les libellés de la barre d'onglets : le texte de chaque onglet (le nœud qui porte le libellé). */
const TAB_LABELS = '[role="tablist"] [role="tab"] div[dir="auto"]';
const COUNTER_LABELS = '[data-testid^="profil-count-"] div[dir="auto"]';

for (const theme of ["beton", "sable"] as Theme[]) {
  test(`R6-police : 384 px, police 1,3, rien n'est coupé (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    mkdirSync(DIR, { recursive: true });
    const { ctx, page } = await open(browser, theme, 1.3);
    await signIn(page, "kenji@orasso.local");

    // La simulation tient : `fontScale` vaut 1,3 et les textes grossissent.
    await goto(page, "/profil");
    const tabs = await lines(page, TAB_LABELS);
    expect(tabs.map((t) => t.text.toUpperCase())).toEqual(["EXPLORER", "SORTIES", "ACCUEIL", "GARAGE", "PROFIL"]);
    for (const t of tabs) expect(t.lines, `onglet « ${t.text} » sur une ligne`).toBe(1);
    expect(new Set(tabs.map((t) => t.size)).size, "un seul corps pour la barre").toBe(1);
    expect(await brokenWords(page, '[role="tablist"]')).toEqual([]);

    // Compteurs du profil : chacun sur une ligne, un seul corps.
    const counters = await lines(page, COUNTER_LABELS);
    const labels = counters.filter((c) => /[a-z]/i.test(c.text));
    expect(labels.map((c) => c.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^abonnement/)]));
    for (const c of labels) expect(c.lines, `compteur « ${c.text} » sur une ligne`).toBe(1);
    expect(new Set(labels.map((c) => c.size)).size, "un seul corps pour les compteurs").toBe(1);
    await page.screenshot({ path: `${DIR}/profil-${theme}-x13.png` });

    // Fiche : la bande de l'organisateur et les étiquettes.
    await goto(page, "/e/cars-and-coffee-plage");
    await expect(page.getByTestId("org-bar")).toBeVisible();
    expect(await brokenWords(page, '[data-testid="org-bar"]')).toEqual([]);
    expect(await brokenWords(page, '[data-testid="event-admission"]')).toEqual([]);
    // Une étiquette tient dans son cadre (le téléphone rogne ce qui dépasse).
    const clipped = await page.evaluate(() => {
      const bad: string[] = [];
      for (const box of Array.from(document.querySelectorAll('[data-testid="event-admission"] div'))) {
        const kids = Array.from(box.children).filter((k) => k.getAttribute("dir") === "auto");
        if (kids.length !== 1) continue;
        const b = box.getBoundingClientRect();
        const r = (kids[0] as HTMLElement).getBoundingClientRect();
        if (r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) bad.push(kids[0]?.textContent ?? "");
      }
      return bad;
    });
    expect(clipped).toEqual([]);
    await page.screenshot({ path: `${DIR}/fiche-${theme}-x13.png` });

    // Le crew et l'Explorer.
    await goto(page, "/crew/roussillon-drift");
    expect(await brokenWords(page, '[data-testid="crew"]')).toEqual([]);
    await page.screenshot({ path: `${DIR}/crew-${theme}-x13.png` });
    await goto(page, "/explorer");
    expect(await brokenWords(page, '[data-testid="explorer-segments"]')).toEqual([]);
    const segs = await page.getByTestId("explorer-segments").innerText();
    expect(segs).not.toContain("…");
    await page.screenshot({ path: `${DIR}/explorer-${theme}-x13.png` });
    await ctx.close();
  });
}

test("R6-police : à l'échelle 1, la barre garde son corps d'origine", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await open(browser, "beton", 1);
  await signIn(page, "kenji@orasso.local");
  await goto(page, "/profil");
  const tabs = await lines(page, TAB_LABELS);
  expect(tabs).toHaveLength(5);
  for (const t of tabs) {
    expect(t.size).toBe(9.5);
    expect(t.lines).toBe(1);
  }
  const counters = (await lines(page, COUNTER_LABELS)).filter((c) => /[a-z]/i.test(c.text));
  for (const c of counters) expect(c.size).toBe(12);
  await ctx.close();
});

test("R6-police : « jour J » et « 7 h » insécables (règle commune)", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await open(browser, "beton", 1.3);
  await signIn(page, "kenji@orasso.local");
  await goto(page, "/sorties");
  // Les heures des tickets portent l'espace insécable entre le nombre et « h » (et avant les minutes).
  const text = (await page.evaluate(() => document.body.textContent)) ?? "";
  expect(text.match(/\d+\u00a0h/g)?.length ?? 0).toBeGreaterThan(0);
  expect(text).not.toMatch(/\d+ h\b/);
  await ctx.close();
});
