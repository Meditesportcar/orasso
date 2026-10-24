import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, type Cookie, MOBILE, randomPlate, SEED_PASSWORD, seeStepEnd, signUpApi, unique } from "./helpers";
import { checkerPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot R4a, côté appli (version web compilée), d'après la maquette R4 validée par Damien le 24/10 :
//   - R4.1 : le cadre de floutage par modes. Toucher le cadre : Déplacer → Rotation → Taille → Déplacer ; Déplacer avec
//     la loupe et le contour seul ; Rotation par la tige, sans loupe ; Taille sans poignée, le bord tenu s'allume, le
//     bord opposé reste fixe ; la ligne du mode et ses trois points ; plus d'aide « deux doigts » ; vignette « Cadre
//     posé » ; le cadre rouvre en Déplacer ;
//   - R4.8 : la recherche « Marque ou modèle » tolérante (« golf 4 », « e36 », « mx5 ») ; « Je ne sais pas, ou elle
//     n'est pas dans la liste » ; « Ajouter « … » chez Peugeot », le champ « Nom du modèle », « Continuer » dès
//     2 caractères, la fiche en direct « Peugeot … · à ajouter à la liste », l'année demandée, ce que l'API garde.
// Les gestes (worklets) se vérifient aussi sur le téléphone (APK du coordinateur). Béton et Sable, 390 px.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4a-captures/apres/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

function carPhoto() {
  const dir = process.env.M1_PHOTOS;
  if (dir && existsSync(`${dir}/supra.jpg`))
    return { name: "supra.jpg", mimeType: "image/jpeg", buffer: readFileSync(`${dir}/supra.jpg`) };
  return { name: "supra.png", mimeType: "image/png", buffer: checkerPhoto() };
}

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const center = async (page: Page, testId: string) => {
  const b = await page.getByTestId(testId).first().boundingBox();
  if (!b) throw new Error(`${testId} absent`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
};

/** Glisse de (dx, dy) depuis (x, y) ; `hold` : appelé avant de lâcher (capture pendant le geste). */
async function drag(page: Page, x: number, y: number, dx: number, dy: number, hold?: () => Promise<void>) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
  if (hold) await hold();
  await page.mouse.up();
}

const angleOf = (page: Page) =>
  page
    .getByTestId("plate-frame")
    .first()
    .evaluate((el) => {
      const m = getComputedStyle(el).transform.match(/matrix\(([^,]+),\s*([^,]+)/);
      return m ? (Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI : 0;
    });

for (const theme of ["beton", "sable"] as const) {
  test(`ajout de véhicule (${theme}) : cadre par modes, modèle absent de la liste`, async ({ browser }) => {
    test.setTimeout(300_000);
    const pseudo = `R4a${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie: Cookie = await signUpApi(pseudo, email);
    const { ctx, page } = await open(browser, theme);
    await page.goto("/auth");
    await afterOpening(page);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
    await page.goto("/vehicule/nouveau");
    await afterOpening(page);
    const next = async () => {
      await seeStepEnd(page);
      await page.getByTestId("vehicle-step-next").click();
    };

    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("vehicle-photo-add").click();
    await (await chooser).setFiles([carPhoto()]);
    await expect(page.getByTestId("crop-validate")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("crop-validate").click();
    await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
    await next();

    // --- R4.1 : le cadre par modes -----------------------------------------------------------------------------------
    await expect(page.getByText("Étape 2 sur 5 · Plaque")).toBeVisible();
    await expect(page.getByTestId("plate-frame-mode")).toHaveCount(0);
    if ((await page.getByTestId("plate-frame").count()) === 0) await page.getByTestId("plate-frame-add").click();
    const mode = page.getByTestId("plate-frame-mode");
    await expect(mode).toContainText(
      "Déplacer : fais glisser le cadre du doigt · touche le cadre pour changer de mode",
    );
    await expect(page.getByTestId("plate-frame-dots")).toHaveAttribute("aria-label", "Mode 1 sur 3");
    // Plus d'aide « deux doigts » ni de poignées.
    await expect(page.getByText(/Deux doigts/)).toHaveCount(0);
    await expect(page.getByTestId("plate-frame-rotate")).toHaveCount(0);
    await expect(page.getByTestId("plate-frame-edge-r")).toHaveCount(0);
    await page.getByTestId("plate-editor").scrollIntoViewIfNeeded();
    await shot(page, `${theme}-01-deplacer`);

    // Déplacer : la loupe et le masque translucide pendant le geste, noir au lâcher.
    let c = await center(page, "plate-frame");
    await drag(page, c.x, c.y, -24, -18, async () => {
      await expect
        .poll(async () =>
          page
            .getByTestId("plate-loupe")
            .evaluate((el) => Number(getComputedStyle(el).opacity))
            .catch(() => 0),
        )
        .toBeGreaterThan(0.5);
      const bg = await page
        .getByTestId("plate-frame")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toMatch(/rgba\(.+0\.6\d*\)/);
      await shot(page, `${theme}-02-deplacer-loupe`);
    });
    const moved = await center(page, "plate-frame");
    expect(moved.x).toBeLessThan(c.x - 10);
    const bgRest = await page
      .getByTestId("plate-frame")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgRest).toMatch(/^rgb\(/);

    // Toucher : Rotation, la tige seule ; elle fait pencher le cadre, sans loupe.
    await page.mouse.click(moved.x, moved.y);
    await expect(mode).toContainText("Rotation : tourne la tige au-dessus du cadre");
    await expect(page.getByTestId("plate-frame-dots")).toHaveAttribute("aria-label", "Mode 2 sur 3");
    await expect(page.getByTestId("plate-frame-rotate")).toBeVisible();
    await shot(page, `${theme}-03-rotation`);
    const knob = await center(page, "plate-frame-rotate");
    await drag(page, knob.x, knob.y, 30, 0, async () => {
      const loupe = await page
        .getByTestId("plate-loupe")
        .evaluate((el) => Number(getComputedStyle(el).opacity))
        .catch(() => 0);
      expect(loupe).toBeLessThan(0.1);
    });
    const angle = await angleOf(page);
    expect(angle).toBeGreaterThan(10);

    // Toucher : Taille, aucune poignée ; le bord droit tiré, le bord gauche ne bouge pas, seul le bord tenu s'allume.
    c = await center(page, "plate-frame");
    await page.mouse.click(c.x, c.y);
    await expect(mode).toContainText("Taille : tire un bord du cadre");
    await expect(page.getByTestId("plate-frame-rotate")).toHaveCount(0);
    await shot(page, `${theme}-04-taille`);
    const leftBefore = await center(page, "plate-frame-edge-l");
    const widthBefore = await page
      .getByTestId("plate-frame")
      .first()
      .evaluate((el) => (el as HTMLElement).offsetWidth);
    const right = await center(page, "plate-frame-edge-r");
    const rad = (angle * Math.PI) / 180;
    await drag(page, right.x, right.y, 30 * Math.cos(rad), 30 * Math.sin(rad), async () => {
      const held = await page
        .getByTestId("plate-frame-edge-r")
        .first()
        .evaluate((el) => (el as HTMLElement).offsetWidth);
      const idle = await page
        .getByTestId("plate-frame-edge-l")
        .first()
        .evaluate((el) => (el as HTMLElement).offsetWidth);
      expect(held).toBe(5);
      expect(idle).toBe(3);
      await shot(page, `${theme}-05-taille-bord-tenu`);
    });
    const widthAfter = await page
      .getByTestId("plate-frame")
      .first()
      .evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(widthAfter).toBeGreaterThan(widthBefore + 15);
    const leftAfter = await center(page, "plate-frame-edge-l");
    expect(Math.abs(leftAfter.x - leftBefore.x)).toBeLessThan(3);
    expect(Math.abs(leftAfter.y - leftBefore.y)).toBeLessThan(3);

    // Toucher : retour à Déplacer. Vignette « Cadre posé » (cadre posé à la main).
    c = await center(page, "plate-frame");
    await page.mouse.click(c.x, c.y);
    await expect(mode).toContainText("Déplacer");
    await expect(page.getByTestId("plate-thumb-1")).toContainText("Cadre posé");
    await page.getByTestId("plate-strip").scrollIntoViewIfNeeded();
    await shot(page, `${theme}-06-vignette-cadre-pose`);
    const audit = await auditPage(page);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);
    await page.getByTestId("vehicle-plate").fill(randomPlate());
    await next();

    // --- R4.8 : marque et modèle -------------------------------------------------------------------------------------
    await expect(page.getByText("Étape 3 sur 5 · Marque et modèle")).toBeVisible();
    // Le cadre rouvre en Déplacer (retour à l'étape Plaque, puis de nouveau ici).
    await page.getByTestId("vehicle-step-back").click();
    await expect(page.getByTestId("plate-frame-mode")).toContainText("Déplacer");
    await next();
    const search = page.getByLabel("Marque ou modèle");
    for (const [q, hit] of [
      ["golf 4", /Volkswagen Golf Mk4/],
      ["e36", /BMW Série 3 E36/],
      ["mx5", /Mazda MX-5/],
    ] as const) {
      await search.fill(q);
      await expect(page.getByTestId("ref-row").filter({ hasText: hit }).first()).toBeVisible({ timeout: 15_000 });
    }
    await shot(page, `${theme}-07-recherche-tolerante`);
    await search.fill("peugeot");
    await page
      .getByTestId("ref-row")
      .filter({ hasText: /^Peugeot$/ })
      .first()
      .click();
    // Modèle connu, génération absente : « Je ne sais pas » laisse continuer.
    await page
      .getByRole("radio", { name: /^208\b/ })
      .first()
      .click();
    const unknown = page.getByTestId("ref-other");
    await expect(unknown).toContainText("Je ne sais pas, ou elle n'est pas dans la liste");
    await unknown.click();
    await expect(page.getByTestId("vehicle-live-card")).toContainText("Génération non précisée");
    await seeStepEnd(page);
    await expect(page.getByTestId("vehicle-step-next")).toBeEnabled();
    await page.getByTestId("vehicle-live-card").scrollIntoViewIfNeeded();
    await shot(page, `${theme}-08-generation-inconnue`);

    // Modèle absent : « Ajouter « … » chez Peugeot », le champ, la fiche en direct.
    await page.getByRole("button", { name: /Modèle : 208, changer/ }).click();
    const typed = `Quasar ${unique().slice(-3).toUpperCase()}`;
    await search.fill(typed);
    await expect(page.getByTestId("vehicle-search-empty")).toContainText(
      `Aucun modèle Peugeot ne s'appelle « ${typed} » dans la liste Orasso.`,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("vehicle-add-typed")).toContainText(`Ajouter « ${typed} » chez Peugeot`);
    await shot(page, `${theme}-09-ajouter-chez-peugeot`);
    await page.getByTestId("vehicle-add-typed").click();
    const field = page.getByLabel("Nom du modèle");
    await expect(field).toHaveValue(typed);
    await expect(page.getByTestId("vehicle-typed")).toContainText(
      "Ta fiche est créée tout de suite avec ce nom. L'équipe Orasso l'ajoutera à la liste.",
    );
    await expect(page.getByTestId("vehicle-live-name")).toHaveText(new RegExp(`Peugeot ${typed}`, "i"));
    await expect(page.getByTestId("vehicle-live-tobe")).toHaveText("à ajouter à la liste");
    await expect(page.getByText("Génération : facultative")).toBeVisible();
    // « Continuer » dès 2 caractères.
    await field.fill("Q");
    await seeStepEnd(page);
    await expect(page.getByTestId("vehicle-step-next")).toBeDisabled();
    await field.scrollIntoViewIfNeeded();
    await field.fill(typed);
    await seeStepEnd(page);
    await expect(page.getByTestId("vehicle-step-next")).toBeEnabled();
    await page.getByTestId("vehicle-typed").scrollIntoViewIfNeeded();
    await shot(page, `${theme}-10-nom-du-modele`);
    await next();

    // Fiche technique : l'année est demandée.
    await expect(page.getByText("Étape 4 sur 5 · Fiche technique")).toBeVisible();
    await next();
    await expect(page.getByTestId("vehicle-step-error")).toContainText("Indique l'année");
    await page.getByTestId("vehicle-year").fill("2008");
    await next();
    await expect(page.getByText("Étape 5 sur 5 · Catégories")).toBeVisible();
    await expect(page.getByTestId("vehicle-origin")).toContainText("Peugeot");
    await next();
    await expect(page.getByTestId("vehicle-done-title")).toBeVisible({ timeout: 90_000 });

    const mine = await apiCall<{ label: string; proposedModel: string | null; generationId: string | null }[]>(
      cookie,
      "GET",
      "/me/vehicles",
    );
    expect(mine.data[0]).toMatchObject({ label: `Peugeot ${typed}`, proposedModel: typed, generationId: null });
    await ctx.close();
  });
}
