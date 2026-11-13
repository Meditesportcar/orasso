import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, setTheme, unique } from "./helpers";
import { r5Crew } from "./lotr5c2-setup";
import { RELAIS } from "./relais";

// Petit lot de fin, partie E (option B « Comme le Profil » choisie par Damien le 13/11), côté site : le haut compact de
// l'onglet Crew (`/app/crew`), la même ligne que le haut du Profil. Vignette de la couverture (elle ouvre la couverture en grand,
// la description et « Signaler » pour un membre), nom jamais tronqué (▾ quand j'ai plusieurs crews), « N membres · tu es le
// chef », description sur une ligne avec « plus » (elle se déplie avec l'Instagram), Inviter et Réglages à droite (chef) ;
// Discussion sous la ligne à 390 px et sur la ligne à 1 280 px ; onglets soulignés collants avec « Publier » en icône au bout ;
// les sorties restent dans la colonne de droite sur grand écran. API et site lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-fin-e-captures/apres/recette-site`;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function box(page: Page, id: string) {
  const b = await page.getByTestId(id).first().boundingBox();
  expect(b, id).not.toBeNull();
  return b as { x: number; y: number; width: number; height: number };
}

async function open(page: Page, email: string, path: string, theme: "beton" | "sable" = "beton") {
  await setTheme(page, theme);
  await loginInBrowser(page, email, undefined, path);
  await expect(page.getByTestId("crew-head")).toBeVisible();
}

test.describe("grand écran (1 280 px)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("chef : la ligne du haut, Discussion sur la ligne, onglets et « Publier », sorties à droite", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}`);
    await expect(page.getByTestId("crew-name")).toHaveText(crew.name);
    await expect(page.getByTestId("crew-sub")).toHaveText("2 membres · tu es le chef");
    await expect(page.getByTestId("crew-selector")).toHaveCount(0);
    await expect(page.getByTestId("crew-invite")).toHaveAttribute("href", `/c/${crew.slug}/inviter`);
    await expect(page.getByTestId("crew-settings")).toHaveAttribute("href", `/c/${crew.slug}/reglages`);
    const thumb = await box(page, "crew-cover-open");
    const disc = await box(page, "crew-discussion");
    const invite = await box(page, "crew-invite");
    const settings = await box(page, "crew-settings");
    // Discussion monte sur la ligne : à droite de la vignette, sur la même hauteur, avant Inviter et Réglages.
    expect(disc.y).toBeLessThan(thumb.y + thumb.height);
    expect(disc.x).toBeGreaterThan(thumb.x + thumb.width);
    expect(invite.x).toBeGreaterThan(disc.x + disc.width - 1);
    // Inviter et Réglages empilés.
    expect(Math.abs(invite.x - settings.x)).toBeLessThan(2);
    expect(settings.y).toBeGreaterThanOrEqual(invite.y + invite.height - 1);
    // Les sorties restent à droite ; l'onglet « Sorties » n'a plus lieu d'être sur grand écran.
    const feed = await box(page, "crew-feed");
    const outings = await box(page, "crew-outings");
    expect(outings.x).toBeGreaterThan(feed.x + feed.width);
    await expect(page.getByTestId("crew-tab-sorties")).toBeHidden();
    // « Publier » (icône) au bout de la rangée d'onglets.
    const tabs = await box(page, "crew-tabs");
    const pub = await box(page, "crew-feed-publish");
    expect(pub.x).toBeGreaterThan(tabs.x + tabs.width - 4);
    await expect(page.getByTestId("crew-feed-publish")).not.toContainText("Publier");
    await expect(page.getByTestId("crew-feed-publish")).toHaveAttribute("aria-label", "Publier dans le crew");
    // L'ancien composeur du haut du fil a disparu ; « Publier » ouvre la fenêtre de publication.
    await expect(page.getByText("Une photo, un mot")).toHaveCount(0);
    await shot(page, "chef-repos-1280");
    await page.getByTestId("crew-feed-publish").click();
    await expect(page.getByTestId("crew-publish")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("crew-publish")).toBeHidden();
  });

  test("deux crews : le nom ▾ ouvre « Mes crews », le rôle reste sous le nom", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "theo@orasso.local", "/app/crew");
    await expect(page.getByTestId("crew-sub")).toHaveText(/membres? · tu es (membre|le chef)/);
    await expect(page.getByTestId("crew-sub")).not.toContainText("autre");
    await page.getByTestId("crew-selector").click();
    await expect(page.getByTestId("crew-selector-list")).toBeVisible();
    await expect(page.getByTestId("crew-choice-more")).toBeVisible();
    await shot(page, "multi-selecteur-1280");
    await page.getByTestId("crew-choice-cote-vermeille-classic").click();
    await page.waitForURL(/crew=cote-vermeille-classic/);
    await expect(page.getByTestId("crew-name")).toContainText("Côte Vermeille Classic");
  });
});

test.describe("téléphone (390 px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("chef : Discussion sous la ligne, « plus » avec l'Instagram, la vignette ouvre la couverture", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}`, "sable");
    const thumb = await box(page, "crew-cover-open");
    const disc = await box(page, "crew-discussion");
    expect(disc.y).toBeGreaterThanOrEqual(thumb.y + thumb.height - 1);
    expect(disc.width).toBeGreaterThan(300);
    // La description tient sur une ligne ; « plus » la déplie avec l'Instagram, « moins » la replie.
    await expect(page.getByTestId("crew-instagram")).toHaveCount(0);
    await page.getByTestId("crew-description-toggle").click();
    await expect(page.getByTestId("crew-instagram")).toContainText("roussillondrift");
    await shot(page, "chef-plus-390-sable");
    await page.getByTestId("crew-description-toggle").click();
    await expect(page.getByTestId("crew-instagram")).toHaveCount(0);
    // La couverture en grand, la description, l'Instagram ; le chef n'y signale pas son crew.
    await page.getByTestId("crew-cover-open").click();
    await expect(page.getByTestId("crew-cover-dialog")).toBeVisible();
    await expect(page.getByTestId("crew-cover-description")).toContainText("Glisse, japonaises");
    await expect(page.getByTestId("crew-cover-instagram")).toBeVisible();
    await expect(page.getByTestId("report-open")).toHaveCount(0);
    await shot(page, "chef-vignette-390-sable");
  });

  test("membre : « Signaler » est dans la feuille de la couverture, plus au bas de l'espace", async ({ page }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.lea.email, `/app/crew?crew=${crew.slug}`);
    await expect(page.getByTestId("crew-sub")).toHaveText("2 membres · tu es membre");
    await expect(page.getByTestId("crew-invite")).toHaveCount(0);
    await expect(page.getByTestId("crew-settings")).toHaveCount(0);
    await expect(page.getByTestId("report-open")).toBeHidden();
    await page.getByTestId("crew-cover-open").click();
    await expect(page.getByTestId("report-open")).toBeVisible();
    await shot(page, "membre-vignette-390");
  });

  test("les onglets sont collés sous la barre du haut ; « Publier » sur un autre onglet mène au Fil, fenêtre ouverte", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}&onglet=membres`);
    const position = await page
      .getByTestId("crew-tabs")
      .evaluate((el) => getComputedStyle(el.parentElement as Element).position);
    expect(position).toBe("sticky");
    const pub = page.getByTestId("crew-feed-publish");
    await expect(pub).toHaveAttribute("href", /onglet=|publier=1/);
    await pub.click();
    await expect(page.getByTestId("crew-publish")).toBeVisible({ timeout: 20_000 });
    // L'adresse perd `publier=1` quand la fenêtre se referme.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("crew-publish")).toBeHidden();
    await expect.poll(() => new URL(page.url()).searchParams.has("publier")).toBe(false);
  });
});
