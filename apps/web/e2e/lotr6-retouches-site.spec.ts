import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, createEvent, login, loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R6-retouches, côté site : (1) l'en-tête ne se chevauche jamais (boîtes des liens disjointes, pas de défilement
// horizontal), déconnecté et en Kenji_66 (casquette organisateur) ; (2) le titre de la fiche d'un événement ne se coupe
// qu'entre deux mots (chaque mot tient sur une seule ligne), avec « Rassemblement de Narbonne » et un titre d'un seul
// long mot ; (3) « 1 abonné » au singulier sur la fiche. API et site lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6-retouches-captures/apres/recette-site`;
const WIDTHS = [390, 768, 1024, 1280, 1440] as const;
const HEADER_WIDTHS = [1024, 1280, 1440] as const;

/** Paires de liens de l'en-tête dont les boîtes se recouvrent, liens sortis de l'écran, défilement horizontal. */
async function headerOverlaps(page: Page) {
  return page.evaluate(() => {
    const head = document.querySelector("header.w-head");
    if (!head) return { overlaps: ["en-tête absent"], outside: [], scroll: false };
    const boxes = [...head.querySelectorAll<HTMLElement>("a, .o-button")]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => ({ el: e, text: e.textContent?.trim() ?? "", box: e.getBoundingClientRect() }));
    const overlaps: string[] = [];
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1)) {
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = a.box.left < b.box.right - 0.5 && b.box.left < a.box.right - 0.5;
        const y = a.box.top < b.box.bottom - 0.5 && b.box.top < a.box.bottom - 0.5;
        if (x && y) overlaps.push(`${a.text} / ${b.text}`);
      }
    });
    const outside = boxes.filter((b) => b.box.right > innerWidth + 0.5 || b.box.left < -0.5).map((b) => b.text);
    const lines = boxes.filter((b) => b.el.getClientRects().length > 1).map((b) => b.text);
    return {
      overlaps: [...overlaps, ...lines.map((t) => `${t} sur deux lignes`)],
      outside,
      scroll: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

/** Les mots du titre coupés sur deux lignes (un mot = une suite sans espace ; un seul rectangle de ligne attendu). */
async function brokenWords(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const value = n.nodeValue ?? "";
      for (const m of value.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(n, m.index ?? 0);
        range.setEnd(n, (m.index ?? 0) + m[0].length);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        if (tops.size > 1) broken.push(m[0]);
      }
    }
    return broken;
  });
}

test.use({ actionTimeout: 30_000 });

test.describe("Lot R6-retouches, site", () => {
  test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

  for (const who of ["déconnecté", "kenji"] as const) {
    test(`En-tête sans chevauchement à 1024, 1280 et 1440 px (${who})`, async ({ page }) => {
      if (who === "kenji") await loginInBrowser(page, "kenji@orasso.local", undefined, "/");
      for (const path of ["/", "/evenements", "/e/rassemblement-narbonne"]) {
        for (const width of HEADER_WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          const r = await headerOverlaps(page);
          expect(r.overlaps, `${path} à ${width} px`).toEqual([]);
          expect(r.outside, `${path} à ${width} px`).toEqual([]);
          expect(r.scroll, `${path} à ${width} px`).toBe(false);
        }
      }
      if (who === "kenji") {
        await expect(
          page.getByRole("navigation", { name: "Compte" }).getByRole("link", { name: "Organisateur" }),
        ).toBeVisible();
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto("/e/rassemblement-narbonne");
        await page.locator("header.w-head").screenshot({ path: `${DIR}/entete-kenji-1280.png` });
      }
    });
  }

  test("Titre de la fiche : aucun mot coupé, de 390 à 1 440 px, Béton et Sable", async ({ page }) => {
    const damien = await login("damien@orasso.local");
    const single = await createEvent(damien, { title: "Rassemblementdesmécaniques" });
    for (const theme of ["beton", "sable"] as const) {
      await setTheme(page, theme);
      for (const slug of ["rassemblement-narbonne", "salon-montpellier", single.slug]) {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/e/${slug}`);
          await expect(page.locator("#ev-title")).toBeVisible();
          expect(await brokenWords(page, "#ev-title"), `${slug} à ${width} px (${theme})`).toEqual([]);
          const fits = await page.locator("#ev-title").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
          expect(fits, `${slug} à ${width} px : le titre déborde`).toBe(true);
          if (slug === "rassemblement-narbonne" && (width === 390 || width === 1280))
            await page.getByTestId("event-hero").screenshot({ path: `${DIR}/titre-narbonne-${theme}-${width}.png` });
        }
      }
    }
  });

  test("Abonnés de l'organisateur accordés (0 ou 1 : singulier)", async ({ page }) => {
    const structure = await apiCall<{ followersCount: number }>(null, "GET", "/structures/by-slug/club-audois-passion");
    const n = structure.data.followersCount;
    const expected = `${n} ${n > 1 ? "abonnés" : "abonné"}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/e/rassemblement-narbonne");
    await expect(page.getByText(`${expected} · organisateur`)).toBeVisible();
    await expect(page.locator("#organisateur").getByText(expected, { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/\b[01] abonnés\b/);
  });
});
