import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, loginInBrowser, randomPlate, setTheme, signUpApi, unique } from "./helpers";
import { checkerPhoto, regionSpread, storedPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot 59c, côté site : cadre de plaque orientable (poignée au-dessus du cadre) et flou gaussien de l'API sur le
// quadrilatère tourné. Ajout d'un véhicule avec un cadre tourné ; la photo stockée est floutée au centre du cadre et
// nette loin de lui (pixels lus via l'API). Deux thèmes.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-59c-captures/site`;
const WIDE = { width: 1280, height: 900 } as const;

type Theme = "beton" | "sable";

/** Glisse un point de (dx, dy) pixels, en huit pas. */
async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await page.mouse.up();
}

for (const theme of ["beton", "sable"] as Theme[]) {
  test(`site : cadre de plaque tourné à la main, flouté à sa forme (${theme})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const pseudo = `Site59_${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo, email);
    const ctx = await browser.newContext({ viewport: WIDE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, email, undefined, "/app/garage/nouveau");

    await page.getByLabel("Marque").selectOption({ label: "Toyota" });
    await expect(page.getByLabel("Modèle").locator('option:text-is("Supra")')).toHaveCount(1);
    await page.getByLabel("Modèle").selectOption({ label: "Supra" });
    await page.getByLabel("Plaque").fill(randomPlate());
    await page.getByLabel("Photo").setInputFiles({ name: "supra.png", mimeType: "image/png", buffer: checkerPhoto() });
    const editor = page.getByTestId("new-plate-frame");
    await editor.getByRole("button", { name: "Poser un cadre" }).click();
    const frame = editor.getByTestId("site-plate-frame").first();
    await expect(frame).toHaveAttribute("data-angle", "0");
    await expect(editor.getByText("tourne-le par sa poignée du haut")).toBeVisible();

    // La poignée du haut, tirée vers la droite : le cadre penche (sens horaire).
    const handle = await editor.getByTestId("site-plate-rotate").first().boundingBox();
    if (!handle) throw new Error("poignée de rotation absente");
    await drag(page, handle.x + handle.width / 2, handle.y + handle.height / 2, 30, 0);
    const angle = Number(await frame.getAttribute("data-angle"));
    expect(angle).toBeGreaterThan(15);
    expect(angle).toBeLessThan(60);
    const hidden = await editor.locator('input[type="hidden"][name="plateRects"]').inputValue();
    const sent = JSON.parse(hidden) as { x: number; y: number; w: number; h: number; angle?: number }[];
    expect(sent[0]?.angle).toBe(angle);
    const audit = await auditPage(page);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);
    mkdirSync(DIR, { recursive: true });
    await page.waitForTimeout(300);
    await editor.screenshot({ path: `${DIR}/cadre-tourne-${theme}.png` });

    await page.getByRole("button", { name: "Ajouter au garage" }).click();
    await page.waitForURL(/\/app\/garage$/, { timeout: 30_000 });
    const list = await apiCall<{ photos: { url: string; plateBlurred: boolean }[] }[]>(cookie, "GET", "/me/vehicles");
    const photo = list.data[0]?.photos[0];
    expect(photo?.plateBlurred).toBe(true);
    const stored = await storedPhoto(photo?.url ?? "");
    const r = sent[0] as { x: number; y: number; w: number; h: number };
    // Centre du cadre : flouté ; coin de la photo, loin du cadre : net.
    const c = { x: r.x + r.w * 0.4, y: r.y + r.h * 0.35, w: r.w * 0.2, h: r.h * 0.3 };
    expect(await regionSpread(stored, c), "centre du cadre : flouté").toBeLessThan(25);
    expect(await regionSpread(stored, { x: 0.02, y: 0.02, w: 0.15, h: 0.15 }), "loin du cadre : net").toBeGreaterThan(60);
    await ctx.close();
  });
}
