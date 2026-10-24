import { mkdirSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R4d (maquette R4.2 validée par Damien le 24/10), côté site : dans « Où chercher ? » › Ailleurs, plus de liste
// de 101 départements mais la recherche sans accents et sa liste déroulante (5 au plus, parcourue au clavier : flèches,
// Entrée, Échap), les 3 derniers départements choisis (cookie de l'Explorer, par compte) et la carte de « Ton coin »
// (un clic choisit). Sans JavaScript, le texte tapé devient le premier département qui correspond.
// Béton et Sable, 390 et 1 280 px. Lancer avec l'API et le site sur la base seedée (Kenji, coin 66). Aucune date en dur.
// Le premier test (« Ailleurs ouvert ») marche aussi sur le code d'avant le lot : il sert aux captures « avant ».
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4d-captures/site`;
const DESKTOP = { width: 1280, height: 900 } as const;
const SIZES = [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.brokenWords).toEqual([]);
}

async function openWhere(page: Page) {
  await expect(async () => {
    await page.getByTestId("around-open").click();
    await expect(page.getByTestId("where-sheet")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByTestId("around-elsewhere").click();
}

const results = (page: Page): Locator => page.locator('[data-testid^="around-result-"]');
const recents = (page: Page): Locator => page.locator('[data-testid^="around-recent-"]');
const codes = async (list: Locator) =>
  (await list.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""))).map((id) =>
    id.replace(/^around-(result|recent)-/, ""),
  );

test("site R4d : « Ailleurs » ouvert (captures avant / après)", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of ["beton", "sable"] as const) {
    for (const [size, viewport] of SIZES) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      await page.goto("/app/explorer?segment=evenements");
      await openWhere(page);
      await shot(page, `01-ailleurs-${theme}-${size}`);
      await ctx.close();
    }
  }
});

test("site R4d : recherche, clavier, carte, récents, sans JavaScript", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of ["beton", "sable"] as const) {
    for (const [size, viewport] of SIZES) {
      const tag = `${theme}-${size}`;
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      await page.goto("/app/explorer?segment=evenements");
      await openWhere(page);

      // Plus de liste des 101 : la recherche, la carte ; aucun récent dans un navigateur neuf.
      await expect(page.getByTestId("around-find")).toBeVisible();
      await expect(page.getByTestId("around-map").locator("path")).toHaveCount(96);
      await expect(page.getByTestId("around-recent")).toHaveCount(0);
      await expect(page.getByTestId("where-apply")).toBeDisabled();

      // « her » trouve Hérault, pas Cher ; sans accents ni majuscules.
      const find = page.getByTestId("around-find");
      await find.fill("her");
      await expect(find).toHaveAttribute("aria-expanded", "true");
      expect(await codes(results(page))).toEqual(["34"]);
      await audit(page);
      await shot(page, `02-recherche-her-${tag}`);
      await find.fill("PYRÉNÉES");
      await expect(results(page)).toHaveCount(3);
      expect(await codes(results(page))).toEqual(["64", "66", "65"]);
      // 5 au plus, la suite se dit.
      await find.fill("1");
      await expect(results(page)).toHaveCount(5);
      await expect(page.getByTestId("around-results")).toContainText("autres : continue à taper");
      await find.fill("zzz");
      await expect(page.getByTestId("around-none")).toContainText("« zzz »");

      // Clavier : flèches puis Entrée (le formulaire ne part pas), Échap ferme la liste et pas la feuille.
      await find.fill("cote");
      expect(await codes(results(page))).toEqual(["21", "22"]);
      await find.press("ArrowDown");
      await find.press("ArrowDown");
      await expect(page.getByTestId("around-result-22")).toHaveAttribute("aria-selected", "true");
      await expect(find).toHaveAttribute("aria-activedescendant", /.+/);
      await find.press("Enter");
      await expect(page.getByTestId("where-sheet")).toBeVisible();
      await expect(page).not.toHaveURL(/ailleurs=22/);
      await expect(page.getByTestId("around-elsewhere")).toContainText("Choisi : Côtes-d'Armor (22)");
      await expect(find).toHaveValue("");
      await find.fill("aude");
      await expect(page.getByTestId("around-results")).toBeVisible();
      await find.press("Escape");
      await expect(page.getByTestId("around-results")).toBeHidden();
      await expect(page.getByTestId("where-sheet")).toBeVisible();
      await page.getByTestId("around-find-clear").click();

      // La carte : un clic choisit (l'Aude) ; le bouton s'active.
      await page.getByTestId("around-map").locator('[data-testid="dept-11"]').click();
      await expect(page.getByTestId("around-elsewhere")).toContainText("Choisi : Aude (11)");
      await expect(page.getByTestId("around-map").locator('[data-testid="dept-11"]')).toHaveClass(/is-selected/);
      // Mon coin (66) : repère en pointillé.
      await expect(page.getByTestId("around-map").locator('[data-testid="dept-66"]')).toHaveClass(/is-dashed/);
      await expect(page.getByTestId("where-apply")).toBeEnabled();
      await shot(page, `03-carte-aude-${tag}`);
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/autour=ailleurs/);
      await expect(page).toHaveURL(/ailleurs=11/);
      await expect(page).not.toHaveURL(/dq=/);
      await expect(page.getByTestId("around-open")).toContainText("(11)");

      // Les récents : l'Aude ; puis l'Hérault en tête ; Mon coin n'y entre pas.
      await openWhere(page);
      expect(await codes(recents(page))).toEqual(["11"]);
      await page.getByTestId("around-find").fill("34");
      await page.getByTestId("around-result-34").click();
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/ailleurs=34/);
      await openWhere(page);
      expect(await codes(recents(page))).toEqual(["34", "11"]);
      await page.getByTestId("around-find").fill("pyrenees orientales");
      await page.getByTestId("around-find").press("Enter");
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/ailleurs=66/);
      await openWhere(page);
      await page.getByTestId("around-mine").click();
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/autour=coin/);
      await openWhere(page);
      expect(await codes(recents(page))).toEqual(["66", "34", "11"]);
      // Un récent se choisit d'un clic.
      await page.getByTestId("around-recent-34").click();
      await expect(page.getByTestId("around-recent-34")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("around-elsewhere")).toContainText("(34)");
      await audit(page);
      await shot(page, `04-recents-${tag}`);
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/ailleurs=34/);
      // Un quatrième : 3 au plus.
      await openWhere(page);
      await page.getByTestId("around-find").fill("gironde");
      await page.getByTestId("around-find").press("Enter");
      await page.getByTestId("where-apply").click();
      await page.waitForURL(/ailleurs=33/);
      await openWhere(page);
      expect(await codes(recents(page))).toEqual(["33", "34", "66"]);
      // Personnes et crews : le même « Ailleurs », les mêmes récents.
      await page.goto("/app/explorer?segment=personnes");
      await expect(async () => {
        await page.getByTestId("people-where-open").click();
        await expect(page.getByTestId("people-where-sheet")).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
      await page.getByTestId("around-elsewhere").click();
      expect(await codes(recents(page))).toEqual(["33", "34", "66"]);

      // Sans JavaScript (une fois) : le texte tapé devient un département.
      if (theme === "beton" && size === "390") {
        const nojs = await browser.newContext({
          viewport,
          javaScriptEnabled: false,
          storageState: await ctx.storageState(),
        });
        const p = await nojs.newPage();
        await p.goto("/app/explorer?segment=evenements&autour=coin");
        const details = p.locator("details.ex-nojs").first();
        await details.locator("summary").click();
        await details.getByTestId("around-elsewhere").click();
        await expect(details.getByTestId("around-find")).toBeVisible();
        await details.getByTestId("around-find").fill("Hérault");
        await details.getByTestId("around-find").press("Enter");
        await p.waitForURL(/ailleurs=34/);
        await expect(p).not.toHaveURL(/dq=/);
        await expect(p.getByTestId("around-open")).toContainText("(34)");
        await shot(p, `05-sans-javascript-${tag}`);
        await nojs.close();
      }
      await ctx.close();
    }
  }
});
