import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot C7 (finitions), côté site : la battle autour du O de l'accueil (artefact `s-web-home`, `.hero-o`) — à 1 280 px la
// composition de l'artefact telle quelle (affiches de 180 px, O de 170 px), à 390 px la même réduite en bloc (affiches
// et O plus petits, rien ne déborde, la scène reste un ovale plus large que haut), voitures, fumée et traces peintes
// dans la toile ; « Tout » de la Boîte (un seul fil) ; la file des conflits de plaque sous les transferts (équipe).
// Béton et Sable. Lancer avec l'API et le site sur la base seedée. Captures : `CAPTURES_DIR`, sinon
// `<relais>/lot-c7-captures/<C7_PHASE>/site`.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-c7-captures/${process.env.C7_PHASE ?? "apres"}/site`;
const DESKTOP = { width: 1280, height: 900 } as const;
const SIZES = [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

test("accueil : la battle autour du O et ses affiches, à l'échelle de l'artefact", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const theme of ["beton", "sable"] as const) {
    for (const [size, viewport] of SIZES) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await page.goto("/");
      const fan = page.locator(".w-fan");
      await fan.scrollIntoViewIfNeeded();
      const box = await fan.boundingBox();
      expect(box).not.toBeNull();
      const cards = page.locator(".w-fan__card");
      expect(await cards.count()).toBeGreaterThan(0);
      const card = await cards.first().boundingBox();
      const o = await page.locator(".w-fan__o .o-live__o").boundingBox();
      const stage = await page.locator(".w-fan__o").boundingBox();
      if (size === "1280") {
        // L'artefact tel quel : composition 480 px de haut, O de 170 px, scène de 440 × 360 px.
        expect(Math.round(box?.height ?? 0)).toBe(480);
        expect(Math.round(o?.width ?? 0)).toBe(170);
        expect(Math.round(stage?.width ?? 0)).toBe(440);
      } else {
        // Réduite en bloc : tout plus petit, la scène reste plus large que haute (pas d'ovale debout qui coupe les affiches).
        expect(box?.height ?? 0).toBeLessThan(480);
        expect(o?.width ?? 0).toBeLessThan(170);
        expect(stage?.width ?? 0).toBeGreaterThan(stage?.height ?? 0);
        expect((card?.width ?? 0) / (box?.width ?? 1)).toBeLessThan(0.45); // affiche tournée : son cadre fait ~41 % comme dans l'artefact
      }
      // Pendant la battle, la toile peint voitures, fumée et traces.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const c = document.querySelector(".w-fan .o-live__fx") as HTMLCanvasElement | null;
              const d = c?.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
              let n = 0;
              if (d) for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n++;
              return n;
            }),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(1000);
      const a = await auditPage(page);
      expect(a.horizontalScroll).toBe(false);
      await shot(page, `accueil-battle-${theme}-${size}`);
      await ctx.close();
    }
  }
  // Mouvement réduit : une image figée de la battle, pas de boucle.
  const ctx = await browser.newContext({ viewport: MOBILE, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator(".w-fan").scrollIntoViewIfNeeded();
  await expect(page.locator(".w-fan__o .o-live__o")).toHaveClass(/is-parked/);
  await shot(page, "accueil-battle-reduit-beton-390");
  await ctx.close();
});

test("Boîte, « Tout » : messages, demandes et notifications dans un seul fil", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [size, viewport] of SIZES) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await setTheme(page, "beton");
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/journal");
    await page.goto("/app/journal");
    await expect(page.getByTestId("journal")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("inbox-unavailable")).toHaveCount(0);
    const feed = page.getByTestId("inbox-all");
    await expect(feed).toBeVisible();
    // Un seul fil : notifications et conversations sont des éléments du même `ul`.
    expect(await feed.getByTestId("journal-item").count()).toBeGreaterThan(0);
    await shot(page, `boite-tout-beton-${size}`);
    await ctx.close();
  }
});

test("administration : les conflits de plaque sous les transferts", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, "/admin/transferts");
  await page.goto("/admin/transferts");
  const section = page.getByTestId("plate-conflicts");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.getByRole("heading", { name: "Conflits de plaque" })).toBeVisible();
  await shot(page, "admin-conflits-beton-1280");
  await ctx.close();
});
