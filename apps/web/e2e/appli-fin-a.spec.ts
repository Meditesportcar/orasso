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

async function open(browser: Browser, scale: number, transfer: boolean, railTitles: readonly string[] = []) {
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
  // Les titres du rail de l'Accueil : ceux qu'on veut mesurer remplacent ceux de la base (un mot trop long pour tenir, un mot qui tient après réduction).
  if (railTitles.length)
    await page.route("**/api/me/home*", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const events: { title: string }[] = body?.nearby?.events ?? [];
      events.forEach((e, i) => {
        e.title = railTitles[i % railTitles.length] as string;
      });
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
    // « Je confirme le transfert » (Archivo large, majuscules) passe sur deux lignes dans la carte, à ×1 comme à ×1,3 : on l'exige
    // (sinon la croissance du bouton ne serait plus testée). Il grandit de sa 2e ligne, et la marge visible reste de 12 px (+ 12 de bordure).
    const confirm = card.getByRole("button", { name: /Je confirme le transfert/i });
    const { lines, labelHeight } = await confirm.evaluate((el) => {
      const label = [...el.querySelectorAll("*")].find(
        (n) => n.children.length === 0 && /confirme/i.test(n.textContent ?? ""),
      );
      if (!label) return { lines: 1, labelHeight: 0 };
      const r = label.getBoundingClientRect();
      return {
        lines: Math.round(r.height / Number.parseFloat(getComputedStyle(label).lineHeight)),
        labelHeight: r.height,
      };
    });
    const h = await height(confirm);
    expect(lines, `« Je confirme le transfert » à ×${scale}`).toBe(2);
    expect(h, "plate, deux lignes").toBeGreaterThan(48);
    expect(h - labelHeight, "marge verticale totale du bouton bordé (2 × (10,5 + 1,5))").toBeGreaterThanOrEqual(22);
    expect(h - labelHeight).toBeLessThanOrEqual(26);
    await ctx.close();
  });
}

// Le plancher d'un titre du rail est la plus petite taille des jetons (« credit », 9) ; le corps baisse de 1 px à la fois depuis 12,5 : il
// ne descend donc jamais sous 9,5 ici. L'échelle de police simulée multiplie la taille lue : on compare à 9 × l'échelle.
/**
 * Un mot du libellé est-il coupé entre deux lignes ? (même mesure que `webLabelBreaksInsideWord` du système de design ; autonome : elle
 * est envoyée à la page sous forme de texte.)
 */
function wordIsBroken(el: Element): boolean {
  const range = document.createRange();
  const lines = (r: Range) =>
    new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
  range.selectNodeContents(el);
  if (lines(range) < 2) return false;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    for (const m of (n.textContent ?? "").matchAll(/[\p{L}\p{N}]+/gu)) {
      range.setStart(n, m.index ?? 0);
      range.setEnd(n, (m.index ?? 0) + m[0].length);
      if (lines(range) > 1) return true;
    }
  }
  return false;
}
const BROKEN_SRC = wordIsBroken.toString();

test("la mesure « mot coupé » repère un mot coupé exprès et laisse un mot entier", async ({ browser }) => {
  const page = await browser.newPage();
  await page.setContent(
    `<div id="cut" style="width:40px;word-break:break-all;font:16px sans-serif">Constitutionnelle</div><div id="whole" style="width:400px;font:16px sans-serif">Rassemblement des Pilotes</div><div id="wrapped" style="width:90px;font:16px sans-serif">Rassemblement des Pilotes</div>`,
  );
  const verdict = await page.evaluate((src) => {
    const fn = new Function(`return (${src})`)() as (e: Element) => boolean;
    const get = (id: string) => fn(document.getElementById(id) as Element);
    return { cut: get("cut"), whole: get("whole"), wrapped: get("wrapped") };
  }, BROKEN_SRC);
  expect(verdict).toEqual({ cut: true, whole: false, wrapped: false });
  await page.close();
});

const FLOOR = 9;
/** L'échelle de police du titre du rail est plafonnée à ×1,12 (`data-fsmax` des maquettes). */
const TITLE_SCALE_MAX = 1.12;
const RAIL_TITLES = [
  // Un seul mot, trop long pour tenir même au plancher : le corps y arrive (c'est ce qui prouve le plancher).
  "Anticonstitutionnellement",
  // Un mot long qui tient après réduction : jamais coupé.
  "Exposition",
  // Le mot courant des titres d'événements : entier même à ×1,3 (l'échelle du titre est plafonnée à ×1,12).
  "Rassemblement",
  "Expo des Pilotes Catalans",
];

for (const scale of [1, 1.3]) {
  test(`rail de l'Accueil à ×${scale} : le plancher des titres est 9 px, aucun mot qui tient n'est coupé, pas de « … »`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, scale, false, RAIL_TITLES);
    const rail = page.getByTestId("home-rail");
    await expect(rail).toBeVisible({ timeout: 30_000 });
    await expect(rail.getByTestId("home-rail-item").first()).toBeVisible();
    await page.waitForTimeout(1_500);
    const titles = await rail.getByTestId("home-rail-item").evaluateAll(
      (items, src) =>
        items.map((item) => {
          const title = item.getAttribute("aria-label") ?? "";
          const el = [...item.querySelectorAll("*")].find(
            (n) => n.children.length === 0 && (n.textContent ?? "").trim() === title,
          );
          const s = el ? getComputedStyle(el) : null;
          // Un mot est coupé quand ses morceaux sont sur deux lignes (`wordIsBroken`, vérifiée plus bas sur un mot coupé exprès).
          const broken = el ? (new Function(`return (${src})`)() as (e: Element) => boolean)(el) : false;
          return {
            title,
            found: Boolean(el),
            size: s ? Number.parseFloat(s.fontSize) : 0,
            ellipsis: s ? s.textOverflow === "ellipsis" && (el?.scrollWidth ?? 0) > (el?.clientWidth ?? 0) : false,
            broken,
          };
        }),
      BROKEN_SRC,
    );
    expect(titles.length).toBeGreaterThan(0);
    const by = (t: string) => titles.find((x) => x.title === t);
    for (const t of titles) {
      expect(t.found, `${t.title} : titre trouvé`).toBe(true);
      expect(
        t.size,
        `${t.title} : corps (plancher ${FLOOR} × ${Math.min(scale, TITLE_SCALE_MAX)})`,
      ).toBeGreaterThanOrEqual(FLOOR * Math.min(scale, TITLE_SCALE_MAX) - 0.01);
      expect(t.ellipsis, `${t.title} : pas de « … »`).toBe(false);
    }
    // Le mot trop long atteint le plancher (et pas en dessous : l'ancien plancher de 8 donnait 8,5).
    const longest = by(RAIL_TITLES[0] as string);
    expect(longest, "le mot le plus long est dans le rail").toBeDefined();
    expect(longest?.size).toBeLessThanOrEqual(9.5 * Math.min(scale, TITLE_SCALE_MAX) + 0.01);
    // Un mot qui tient après réduction n'est jamais coupé.
    for (const t of RAIL_TITLES.slice(1)) {
      expect(by(t), `${t} est dans le rail`).toBeDefined();
      expect(by(t)?.broken, `${t} : aucun mot coupé`).toBe(false);
    }
    await ctx.close();
  });
}

test("bouton secondary : 48 px sur une ligne à ×1 et ×1,3, plus haut sur deux lignes (jamais collé aux bords)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const scale of [1, 1.3]) {
    const { ctx, page } = await open(browser, scale, false);
    await page.goto("/_ds");
    await afterOpening(page);
    const follow = page.getByRole("button", { name: /^Suivre$/ }).first();
    await expect(follow).toBeVisible({ timeout: 30_000 });
    expect(await height(follow), `secondary, une ligne à ×${scale}`).toBeCloseTo(48, 0);
    // Le même bouton, libellé long dans une colonne étroite : deux lignes. Les mêmes règles de mise en page (copie du nœud : le
    // système de design n'a pas de bouton secondaire à libellé long sur une page de recette).
    const two = await follow.evaluate((el) => {
      const wrap = document.createElement("div");
      wrap.style.cssText =
        "position:fixed;top:80px;left:16px;width:190px;z-index:99999;display:flex;flex-direction:column";
      const copy = el.cloneNode(true) as HTMLElement;
      const label = [...copy.querySelectorAll("*")].find(
        (n) => n.children.length === 0 && /Suivre/.test(n.textContent ?? ""),
      );
      if (label) label.textContent = "Candidater pour un autre jour";
      copy.style.alignSelf = "stretch";
      wrap.append(copy);
      document.body.append(wrap);
      const text = [...copy.querySelectorAll("*")].find(
        (n) => n.children.length === 0 && /Candidater/.test(n.textContent ?? ""),
      );
      const r = text?.getBoundingClientRect();
      const lineHeight = text ? Number.parseFloat(getComputedStyle(text).lineHeight) : 0;
      return { h: copy.getBoundingClientRect().height, lines: r && lineHeight ? Math.round(r.height / lineHeight) : 0 };
    });
    expect(two.lines, `secondary, libellé long à ×${scale}`).toBeGreaterThanOrEqual(2);
    expect(two.h, `secondary, deux lignes à ×${scale}`).toBeGreaterThan(48);
    await ctx.close();
  }
});
