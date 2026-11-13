import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";

// Petit lot de fin, partie A (tour 1) : mesures à 384 px, police ×1 et ×1,3 (échelle simulée en recette). Un bouton bordé d'une ligne
// garde 48 px (le contour ne le fait pas grandir) et ne grandit que s'il passe sur deux lignes ; le titre d'une affiche du rail de
// l'Accueil ne descend jamais sous la plus petite taille des jetons (9 px) et n'a pas de « … ». La puce de casquette en mode assistance
// est vérifiée par `appli-administration.spec.ts` (aucun texte tronqué sur chaque écran relevé).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, scale: number, transfer: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", "beton");
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [scale] as const,
  );
  const page = await ctx.newPage();
  if (transfer)
    await page.route("**/api/me/requests*", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.items = [
        {
          id: "00000000-0000-4000-8000-000000000001",
          kind: "plate_transfer",
          from: { type: "person", pseudo: "Nico_66", avatarUrl: null },
          payload: { vehicleLabel: "Peugeot 205 GTI", answerBy: "2026-11-19T10:00:00.000Z" },
          createdAt: "2026-11-12T08:00:00.000Z",
        },
        ...body.items,
      ];
      await route.fulfill({ response: res, json: body });
    });
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

const height = async (loc: ReturnType<Page["getByRole"]>) => (await loc.boundingBox())?.height ?? 0;

for (const scale of [1, 1.3]) {
  test(`boutons bordés à ×${scale} : 48 px sur une ligne, plus hauts seulement sur deux lignes`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, scale, true);
    await page.goto("/activite/demandes");
    await afterOpening(page);
    const card = page.getByTestId("request-plate-transfer");
    await expect(card).toBeVisible({ timeout: 30_000 });
    // « Ce n'est pas le cas » (plate pointillé) tient sur une ligne : 48 px.
    expect(await height(card.getByRole("button", { name: /Ce n'est pas le cas/i })), "plate, une ligne").toBeCloseTo(
      48,
      0,
    );
    // « Je confirme le transfert » : une ligne à ×1 (48), deux lignes à ×1,3 (plus haut, jamais collé aux bords).
    const confirm = card.getByRole("button", { name: /Je confirme le transfert/i });
    const lines = await confirm.evaluate((el) => {
      const label = [...el.querySelectorAll("*")].find(
        (n) => n.children.length === 0 && /confirme/i.test(n.textContent ?? ""),
      );
      if (!label) return 1;
      const r = label.getBoundingClientRect();
      return Math.round(r.height / Number.parseFloat(getComputedStyle(label).lineHeight));
    });
    const h = await height(confirm);
    if (lines <= 1) expect(h, "plate, une ligne").toBeCloseTo(48, 0);
    else expect(h, "plate, deux lignes").toBeGreaterThan(48);
    await ctx.close();
  });
}

test("rail de l'Accueil à ×1,3 : un titre ne descend jamais sous 9 px et n'a pas de « … »", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, 1.3, false);
  const rail = page.getByTestId("home-rail");
  await expect(rail).toBeVisible({ timeout: 30_000 });
  const titles = await rail.getByTestId("home-rail-item").evaluateAll((items) =>
    items.map((item) => {
      const title = item.getAttribute("aria-label") ?? "";
      const el = [...item.querySelectorAll("*")].find(
        (n) => n.children.length === 0 && (n.textContent ?? "").trim() === title,
      );
      const s = el ? getComputedStyle(el) : null;
      return {
        title,
        found: Boolean(el),
        size: s ? Number.parseFloat(s.fontSize) : 0,
        ellipsis: s ? s.textOverflow === "ellipsis" && (el?.scrollWidth ?? 0) > (el?.clientWidth ?? 0) : false,
      };
    }),
  );
  expect(titles.length).toBeGreaterThan(0);
  for (const t of titles) {
    expect(t.found, `${t.title} : titre trouvé`).toBe(true);
    expect(t.size, `${t.title} : corps`).toBeGreaterThanOrEqual(9);
    expect(t.ellipsis, `${t.title} : pas de « … »`).toBe(false);
  }
  await ctx.close();
});
