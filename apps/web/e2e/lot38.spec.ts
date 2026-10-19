import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { loginInBrowser, MOBILE, setTheme } from "./helpers";

// Lot 38 : socle de la DA v2 côté site — recette /_ds (section v2) dans les deux thèmes avec l'audit (contour sur photo
// et sur fond), grands titres sur une ligne à 390 et 360 px, thème jamais imposé dans les espaces organisateur et pro,
// thème Automatique par le soleil (horloge Playwright). Captures (390 px) dans le relais.
// Prérequis : API et site lancés sur la base seedée (damien@orasso.local, garage-narbonne@orasso.local).

const DIR = process.env.LOT38_CAPTURES ?? "C:/Users/DELL/.claude/relais/orasso/lot-38-captures/site";
mkdirSync(DIR, { recursive: true });

async function phone(browser: Browser, theme: "beton" | "sable" | "auto" | null, viewport = MOBILE) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  if (theme) await setTheme(page, theme);
  return { ctx, page };
}

const htmlTheme = (page: Page) => page.locator("html").getAttribute("data-theme");

test("/_ds section v2 : deux thèmes, audit sans défaut, captures à 390 px", async ({ browser }) => {
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await phone(browser, theme);
    await page.goto(`/_ds?only=v2&theme=${theme}`);
    await expect(page.locator(`[data-panel="v2-${theme}"]`)).toBeVisible();
    expect(await htmlTheme(page)).toBe(theme);
    // Surcouche : la liste des écarts, les jetons de carte et d'encre.
    await expect(page.getByTestId("v2-tokens")).toContainText("color/ink-muted");
    await expect(page.getByTestId("v2-tokens")).toContainText("color/map-land");
    await expect(page.getByTestId("v2-tokens")).toContainText("color/stamp-ink-66");
    // Six barres, une pastille au O chacune.
    await expect(page.locator(".ds-v2-bar")).toHaveCount(6);
    await expect(page.locator(".ds-v2-bar .o-tabbar__tab.is-o")).toHaveCount(6);
    // Le contour est bien appliqué sur la photo et sur le fond.
    const stroke = await page
      .getByTestId("v2-photo")
      .locator(".o-onphoto")
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("-webkit-text-stroke-width"));
    expect(Number.parseFloat(stroke)).toBeGreaterThan(0);
    const audit = await auditPage(page);
    expect(audit.unoutlinedOnPhoto, "textes sur photo ou fond sans contour").toEqual([]);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);
    expect(audit.truncated).toEqual([]);
    expect(audit.buttonsWithoutIcon).toEqual([]);
    await page.screenshot({ path: `${DIR}/ds-v2-${theme}.png`, fullPage: true });
    await ctx.close();
  }
});

test("grands titres : une ligne à 390 et 360 px, l'étiquette passe dessous à 360 px", async ({ browser }) => {
  for (const width of [390, 360]) {
    const { ctx, page } = await phone(browser, "beton", { width, height: 844 });
    await page.goto("/_ds?only=v2&theme=beton");
    for (const frame of [390, 360]) {
      const titles = page.locator(`[data-frame="${frame}"] .o-bigtitle`);
      await expect(titles).toHaveCount(9);
      const rows = await titles.evaluateAll((els) =>
        els.map((el) => {
          const title = el.querySelector(".o-bigtitle__title") as HTMLElement;
          const label = el.querySelector(".o-bigtitle__label") as HTMLElement;
          const t = title.getBoundingClientRect();
          const l = label.getBoundingClientRect();
          return {
            text: title.textContent,
            fits: title.scrollWidth <= title.clientWidth + 1 && t.right <= el.getBoundingClientRect().right + 1,
            oneLine: t.height < Number.parseFloat(getComputedStyle(title).fontSize) * 1.6,
            labelBelow: l.top >= t.bottom - 1,
          };
        }),
      );
      for (const row of rows) {
        expect(row.fits, `${row.text} tient dans ${frame} px`).toBe(true);
        expect(row.oneLine, `${row.text} sur une ligne à ${frame} px`).toBe(true);
        if (frame === 360) expect(row.labelBelow, `${row.text} : étiquette dessous à 360 px`).toBe(true);
      }
      if (frame === 390) expect(rows.some((row) => !row.labelBelow)).toBe(true);
    }
    expect((await auditPage(page)).horizontalScroll).toBe(false);
    await ctx.close();
  }
});

test("espaces organisateur et pro : le thème suit le cookie, Béton par défaut", async ({ browser }) => {
  for (const [email, path] of [
    ["damien@orasso.local", "/orga/meditesportcar"],
    ["garage-narbonne@orasso.local", "/pro/garage-des-corbieres"],
  ] as const) {
    const { ctx, page } = await phone(browser, null);
    await loginInBrowser(page, email, undefined, path);
    await page.goto(path);
    await expect(page.locator(".orga__side")).toBeVisible();
    expect(await htmlTheme(page)).toBe("beton");
    expect(await page.locator(".orga").evaluate((el) => el.closest('[data-theme="sable"]') === null)).toBe(true);
    await setTheme(page, "sable");
    await page.goto(path);
    expect(await htmlTheme(page)).toBe("sable");
    await page.screenshot({ path: `${DIR}/${path.split("/")[1]}-sable.png` });
    await ctx.close();
  }
});

test("thème Automatique : Béton à minuit, Sable à midi (heure de Paris)", async ({ browser }) => {
  for (const [at, expected] of [
    ["2026-10-19T00:00:00+02:00", "beton"],
    ["2026-10-19T12:00:00+02:00", "sable"],
  ] as const) {
    const { ctx, page } = await phone(browser, "auto");
    await page.clock.install({ time: new Date(at) });
    await page.goto("/");
    // Le serveur rend Béton pour « auto » ; le script d'init (puis le fournisseur) pose le thème du soleil.
    await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
    await ctx.close();
  }
});
