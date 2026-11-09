import { mkdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7f4, site : la feuille « Partager » (événement, voiture), le composeur de story à la souris, le fichier 9:16 signé téléchargé,
// la carte touchable de la visionneuse. API, site et seed lancés ; aucune plaque lisible (photos de démonstration).
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7f4-captures/apres/recette-site`).replaceAll("\\", "/");
test.setTimeout(240_000);
mkdirSync(DIR, { recursive: true });

/** Dimensions d'un JPEG (premier marqueur SOF). */
function jpegSize(data: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) throw new Error("JPEG illisible");
    const marker = data[i + 1] as number;
    const len = data.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("Pas de SOF");
}

for (const [label, width] of [
  ["390", 390],
  ["1280", 1280],
] as const) {
  test(`site ${label} : événement → feuille → fichier 9:16 signé téléchargé`, async ({ browser }) => {
    const cookie = await login("damien@orasso.local");
    const events = (
      await apiCall<{ items: { id: string; slug: string; title: string }[] }>(cookie, "GET", "/events?q=Lydia")
    ).data;
    const lydia = events.items.find((e) => e.title.includes("Lydia"));
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await setTheme(page, "sable");
    await loginInBrowser(page, "damien@orasso.local");
    await page.goto(`/e/${lydia?.slug}`);
    await page.getByTestId("event-share").click();
    await expect(page.getByTestId("share-sheet")).toBeVisible({ timeout: 30_000 });
    for (const d of ["story", "feed", "message", "external"])
      await expect(page.getByTestId(`share-dest-${d}`)).toBeVisible();
    await page.screenshot({ path: `${DIR}/site-feuille-evenement-${label}.png` });
    await page.getByTestId("share-dest-external").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("share-file-story").click()]);
    const path = await download.path();
    const size = jpegSize(readFileSync(path));
    expect(size).toEqual({ width: 1080, height: 1920 });
    await ctx.close();
  });
}

test("site : composer une story de carte à la souris, publier, la carte est touchable", async ({ browser }) => {
  const cookie = await login("damien@orasso.local");
  const events = (
    await apiCall<{ items: { id: string; slug: string; title: string }[] }>(cookie, "GET", "/events?q=Lydia")
  ).data;
  const lydia = events.items.find((e) => e.title.includes("Lydia"));
  const before = (await apiCall<{ stories: unknown[] }>(cookie, "GET", "/me/stories")).data.stories.length;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await setTheme(page, "sable");
  await loginInBrowser(page, "damien@orasso.local");
  await page.goto(`/app/story/partager?type=event&id=${lydia?.id}`);
  const card = page.getByTestId("share-story-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("share-story-link")).toContainText("Voir l'événement");
  const stage = page.getByTestId("share-story-stage");
  const box = await stage.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
  }
  await expect(card).toHaveAttribute("style", /scale\(1\.\d+\)/);
  await page.screenshot({ path: `${DIR}/site-composeur-evenement-1280.png` });
  await page.getByTestId("share-story-publish").click();
  await expect
    .poll(async () => (await apiCall<{ stories: unknown[] }>(cookie, "GET", "/me/stories")).data.stories.length, {
      timeout: 60_000,
    })
    .toBe(before + 1);
  const me = (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data;
  await page.goto(`/app/story/${encodeURIComponent(`u:${me.user.id}`)}`);
  await expect(page.getByTestId("story-linked")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${DIR}/site-visionneuse-carte-1280.png` });
  await ctx.close();
});
