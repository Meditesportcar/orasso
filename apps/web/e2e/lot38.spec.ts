import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { loginInBrowser, MOBILE, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot 38 : socle de la DA v2 côté site — recette /_ds (section v2) dans les deux thèmes avec l'audit (contour sur photo
// et sur fond), grands titres sur une ligne à 390 et 360 px, thème jamais imposé dans les espaces organisateur et pro,
// thème Automatique par le soleil (horloge Playwright). Captures (390 px) dans le relais.
// Prérequis : API et site lancés sur la base seedée (damien@orasso.local, garage-narbonne@orasso.local).

const DIR = process.env.LOT38_CAPTURES ?? `${RELAIS}/lot-38-captures/site`;
mkdirSync(DIR, { recursive: true });

async function phone(
  browser: Browser,
  theme: "beton" | "sable" | "auto" | null,
  viewport: { width: number; height: number } = MOBILE,
) {
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

test("grands titres : une ligne à 390, 360 et 320 px, l'étiquette passe dessous à 360 px", async ({ browser }) => {
  for (const width of [390, 360, 320]) {
    const { ctx, page } = await phone(browser, "beton", { width, height: 844 });
    await page.goto("/_ds?only=v2&theme=beton");
    for (const frame of [390, 360, 320]) {
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
        if (frame <= 360) expect(row.labelBelow, `${row.text} : étiquette dessous à 360 px`).toBe(true);
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

test("thème Automatique le jour : jamais de passage par Béton entre le script d'init et l'hydratation", async ({
  browser,
}) => {
  const { ctx, page } = await phone(browser, "auto");
  await page.clock.install({ time: new Date("2026-10-19T12:00:00+02:00") });
  // Chaque écriture de data-theme sur <html> est relevée, depuis le tout début du chargement.
  await page.addInitScript(() => {
    const w = window as unknown as { __themes: (string | null)[] };
    w.__themes = [];
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.target === document.documentElement) w.__themes.push(document.documentElement.getAttribute("data-theme"));
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-theme"] });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.clock.runFor(2_000);
  const themes = await page.evaluate(() => (window as unknown as { __themes: (string | null)[] }).__themes);
  expect(themes.length).toBeGreaterThan(0);
  expect(themes, "valeurs successives de data-theme").toEqual(themes.map(() => "sable"));
  expect(await htmlTheme(page)).toBe("sable");
  await ctx.close();
});

test("Sable, barre nuit : ✕ d'une barre de flux et choix du thème lisibles ; compteurs de la page événement", async ({
  browser,
}) => {
  const { ctx, page } = await phone(browser, "sable");
  const barInk = async () =>
    page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--bar-ink)";
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
  // Page événement publique (compteurs dans la plaque) et choix du thème du pied de page.
  await page.goto("/e/expo-rivesaltes-2026");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sable");
  const ink = await barInk();
  const chips = page.locator("footer[data-bar] .o-chip");
  await expect(chips).toHaveCount(3);
  for (const chip of await chips.all()) {
    const color = await chip.evaluate((el) => getComputedStyle(el).color);
    const selected = await chip.evaluate((el) => el.classList.contains("is-selected"));
    if (!selected) expect(color).toBe(ink);
  }
  await page.screenshot({ path: `${DIR}/evenement-public-sable.png`, fullPage: true });
  // Barre de flux de la candidature : le ✕ prend l'encre de barre.
  // Un compte neuf (aucune candidature) : la candidature s'ouvre sur sa première étape.
  const pseudo = `Lot38_${unique()}`;
  await signUpApi(pseudo);
  await loginInBrowser(
    page,
    `${pseudo.toLowerCase()}@e2e.orasso.test`,
    undefined,
    "/e/expo-rivesaltes-2026/candidater",
  );
  await page.goto("/e/expo-rivesaltes-2026/candidater");
  const close = page.locator(".o-appbar .o-button--close");
  await expect(close).toBeVisible();
  // Lot M7 (c98f6c8d, AppBar.css) : le ✕ d'un en-tête de fiche est sur fond de carte, à l'encre du thème (plus l'encre de barre).
  const pageInk = await page.evaluate(() => {
    const probe = document.createElement("i");
    probe.style.color = "var(--ink)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(await close.evaluate((el) => getComputedStyle(el).color)).toBe(pageInk);
  await page.screenshot({ path: `${DIR}/candidater-barre-flux-sable.png` });
  await ctx.close();
});
