import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot B3a, points 1 et 3 (appli) : le titre d'une ligne d'événement ne se coupe jamais en plein mot, et le compteur « 0 / 2000 »
// d'une conversation n'est pas chevauché par « Envoyer », à 384 px (Pixel 10 Pro XL), police ×1 et ×1,3, Béton et Sable.
// Lancer avec APP_URL (version compilée, scripts/appli-compilee.mjs) ; CAPTURES=1 pour les captures (CAPTURES_DIR).
const APP = process.env.APP_URL;
test.skip(!APP, "Lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "default" });

const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-b3a-captures/appli`;
const SHOTS = Boolean(process.env.CAPTURES);
if (SHOTS) mkdirSync(DIR, { recursive: true });

async function open(browser: Browser, opts: { scale: number; theme: "beton" | "sable"; email?: string }) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 900 }, baseURL: APP });
  await ctx.route(/(openfreemap|openstreetmap)\.org/, (route) => route.abort());
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", String(t));
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [opts.theme, opts.scale],
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
  await page.getByLabel("E-mail").fill(opts.email ?? "damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
  return { ctx, page };
}

/** Va à une adresse de l'appli (rechargement complet) et passe l'ouverture animée qui rejoue à chaque chargement. */
async function visit(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
};

/** Les mots d'un texte posés sur deux lignes (coupés en plein mot) dans les éléments choisis. */
async function splitWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const m of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index ?? 0);
          range.setEnd(node, (m.index ?? 0) + m[0].length);
          if (new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1) out.push(m[0]);
        }
      }
    }
    return out;
  }, selector);
}

const MATRIX = [
  { theme: "beton", scale: 1, tag: "beton-384" },
  { theme: "beton", scale: 1.3, tag: "beton-384-x13" },
  { theme: "sable", scale: 1.3, tag: "sable-384-x13" },
] as const;

for (const m of MATRIX) {
  test(`ligne d'événement (${m.tag}) : « Rassemblement du Lydia » ne se coupe pas en plein mot`, async ({
    browser,
  }) => {
    const { ctx, page } = await open(browser, m);
    await visit(page, "/o/roues-libres-66?onglet=evenements");
    const rows = page.getByTestId("event-row");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const lydia = rows.filter({ hasText: "Rassemblement du Lydia" }).first();
    await expect(lydia).toBeVisible();
    await lydia.scrollIntoViewIfNeeded();
    await shot(page, `appli-eventrow-${m.tag}`);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => splitWords(page, '[data-testid="event-row"]')).toEqual([]);
    await ctx.close();
  });

  test(`conversation (${m.tag}) : le compteur « 0 / 2000 » n'est pas chevauché par « Envoyer »`, async ({
    browser,
  }) => {
    const { ctx, page } = await open(browser, m);
    await visit(page, "/messages");
    const row = page.getByTestId("conversation-row").first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    await expect(page.getByTestId("message-send")).toBeVisible({ timeout: 30_000 });
    const counter = page.locator('[aria-label$="caractères"]').first();
    await expect(counter).toBeVisible();
    await shot(page, `appli-conversation-${m.tag}`);
    const c = await counter.boundingBox();
    const b = await page.getByTestId("message-send").boundingBox();
    if (!c || !b) throw new Error("boîtes absentes");
    const overlap = c.x < b.x + b.width && c.x + c.width > b.x && c.y < b.y + b.height && c.y + c.height > b.y;
    expect(overlap, `compteur ${JSON.stringify(c)} contre « Envoyer » ${JSON.stringify(b)}`).toBe(false);
    await ctx.close();
  });
}

// Conversation : un long message (≥ 15 lignes) à ×1,3 : la saisie défile en interne, compteur et « Envoyer » restent visibles et disjoints, le fil aussi.
test("conversation : long message à 384 px ×1,3, saisie plafonnée, compteur et « Envoyer » visibles, fil visible", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, { scale: 1.3, theme: "beton" });
  await visit(page, "/messages");
  await page.getByTestId("conversation-row").first().click();
  await expect(page.getByTestId("message-send")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page
    .getByTestId("message-body")
    .fill(Array.from({ length: 18 }, (_, i) => `Ligne ${i + 1} du message`).join("\n"));
  const counter = page.locator('[aria-label$="caractères"]').first();
  await expect(counter).toBeVisible();
  await shot(page, "appli-conversation-long-beton-384-x13");
  const [c, b, f, th] = await Promise.all([
    counter.boundingBox(),
    page.getByTestId("message-send").boundingBox(),
    page.getByTestId("message-body").boundingBox(),
    page.getByTestId("messages").boundingBox(),
  ]);
  if (!c || !b || !f || !th) throw new Error("boîtes absentes");
  const view = page.viewportSize()?.height ?? 900;
  expect(b.y + b.height).toBeLessThanOrEqual(view);
  expect(c.y + c.height).toBeLessThanOrEqual(view);
  expect(c.y).toBeGreaterThanOrEqual(f.y + f.height - 1);
  expect(c.x < b.x + b.width && c.x + c.width > b.x && c.y < b.y + b.height && c.y + c.height > b.y).toBe(false);
  expect(f.height).toBeLessThan(200);
  expect(th.height).toBeGreaterThan(60);
  await ctx.close();
});

// Point 7 (parité D20) : la relecture de la page en panne garde la liste et la dit à part, comme le site.
for (const [label, path] of [
  ["publique", "/o/roues-libres-66?onglet=evenements"],
  ["du propriétaire", "/page?onglet=evenements"],
] as const) {
  test(`page ${label} : relecture en panne → la liste reste, la panne se dit une fois, pas de « Aucun événement »`, async ({
    browser,
  }) => {
    const { ctx, page } = await open(browser, { scale: 1, theme: "beton", email: "sarah@orasso.local" });
    if (label === "du propriétaire") {
      await visit(page, "/moi");
      await page.getByTestId("casquette-organizer").filter({ hasText: "Roues Libres 66" }).first().click();
      await expect(page.getByTestId("persona-tabbar")).toBeVisible({ timeout: 30_000 });
    }
    await visit(page, path);
    const list = page.getByTestId("structure-events");
    await expect(list.getByTestId("event-row").first()).toBeVisible({ timeout: 30_000 });
    const rows = await list.getByTestId("event-row").count();
    await expect(page.getByTestId("structure-upcoming-reread-error")).toHaveCount(0);
    // Les relectures de la liste tombent en panne ; l'aller-retour par la fiche d'un événement relit la page au retour.
    await page.route("**/api/events?*structureId=*", (route) => route.fulfill({ status: 503, body: "{}" }));
    await list.getByTestId("event-row").first().click();
    await expect(page).toHaveURL(/\/e\//, { timeout: 30_000 });
    await page.goBack();
    await expect(page.getByTestId("structure-upcoming-reread-error")).toBeVisible({ timeout: 30_000 });
    await expect(list.getByTestId("event-row")).toHaveCount(rows);
    await expect(page.getByText("Aucun événement à venir")).toHaveCount(0);
    await expect(page.getByTestId("structure-upcoming-error")).toHaveCount(0);
    await shot(page, `appli-page-${label === "publique" ? "publique" : "proprietaire"}-relecture-en-panne-beton-384`);
    // La reprise : la panne disparaît.
    await page.unroute("**/api/events?*structureId=*");
    await list.getByTestId("event-row").first().click();
    await expect(page).toHaveURL(/\/e\//, { timeout: 30_000 });
    await page.goBack();
    await expect(page.getByTestId("structure-upcoming-reread-error")).toHaveCount(0, { timeout: 30_000 });
    await expect(list.getByTestId("event-row")).toHaveCount(rows);
    await ctx.close();
  });
}
