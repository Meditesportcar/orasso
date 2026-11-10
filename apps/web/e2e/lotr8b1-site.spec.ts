import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, loginInBrowser, SEED_PASSWORD, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8b1 (D40, maquette R8.1, option A « Compact »), côté site : « Mon compte » reprend le haut de l'appli (photo de 72 px,
// pseudo, grade et département, bio sur une ligne avec « plus », QR et Réglages en icônes, bande de compteurs avec
// « partenaires » en 4e), « Voir mon profil comme les autres » en première ligne de Réglages, onglets soulignés et collants
// (« Garage · N », « Sorties »), « Ajouter un véhicule » en fin de liste ; le profil d'un autre : « Suivre » sur la ligne du
// grade, « Message » et « Plus » en icônes. Comptes du seed ; site et API lancés sur la base seedée.
test.use({ actionTimeout: 30_000 });
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8b1-captures/apres/recette-site`;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const box = async (page: Page, id: string) =>
  (await page.getByTestId(id).first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

test("Mon compte : haut compact, quatre compteurs, Garage · N, ligne d'ajout en fin de liste, Profil public dans Réglages", async ({
  page,
}) => {
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/moi");
    await expect(page.getByTestId("profil-head")).toBeVisible();
    await expect(page.getByTestId("profil-account-qr")).toHaveAccessibleName("Mon QR");
    await expect(page.getByTestId("profil-settings")).toHaveAccessibleName("Réglages");
    // « Profil public » a quitté l'en-tête ; il n'y a plus de ligne de logos.
    await expect(page.getByTestId("profil-public")).toHaveCount(0);
    for (const id of ["abonnes", "abonnements", "sorties", "partenaires"]) {
      await expect(page.getByTestId(`profil-count-${id}`), `${width} : ${id}`).toBeVisible();
    }
    await expect(page.getByTestId("profil-count-partenaires")).toContainText(/partenaire$/);
    // Garage · N = nombre de véhicules affichés ; la ligne d'ajout vient après la liste.
    const tab = page.getByTestId("profil-tab-garage");
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const n = (await page.getByTestId("garage-main").count()) + (await page.getByTestId("garage-other").count());
    await expect(tab).toHaveText(`Garage · ${n}`);
    const add = page.getByTestId("garage-add");
    await expect(add).toBeVisible();
    await expect(page.getByTestId("garage-empty-add")).toHaveCount(0);
    const lastCard = await page
      .locator('[data-testid="garage-main"], [data-testid="garage-other"]')
      .last()
      .boundingBox()
      .then((b) => b ?? { y: 0, height: 0 });
    expect((await add.boundingBox())?.y ?? 0).toBeGreaterThan(lastCard.y + lastCard.height - 1);
    if (width === 390) {
      const tall = await page.evaluate(() => {
        const q = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
        const head = q("profil-head");
        const tabs = q("profil-tabs");
        return head && tabs ? Math.round(tabs.bottom - head.top) : -1;
      });
      console.log(`R8b1 site : hauteur avant le contenu (390 px) : ${tall} px`);
      expect(tall).toBeGreaterThan(0);
      expect(tall).toBeLessThanOrEqual(260);
    }
    const a = await auditPage(page);
    expect(a.horizontalScroll, `${width}`).toBe(false);
    expect(a.greens).toEqual([]);
    await shot(page, `01-mon-compte-${width}`);
  }
  // Le compteur « partenaires » mène à la liste (« Mettre fin » compris), sans JavaScript.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/app/moi");
  await page.getByTestId("profil-count-partenaires").click();
  await expect(page.getByTestId("partners-line")).toBeVisible();
  await expect(page.getByTestId("partner-row").first()).toBeVisible();
  await shot(page, "02-partenaires");
  // Réglages : la première ligne ouvre l'aperçu.
  await page.goto("/app/moi");
  const first = page.locator("#reglages .pr5-hub a").first();
  await expect(first).toHaveAttribute("data-testid", "reglage-profil-public");
  await expect(first).toContainText("Voir mon profil comme les autres");
  await first.click();
  await page.waitForURL(/profil-public/);
});

test("Mon compte : la bio tient sur une ligne, « plus » la déroule ; les onglets restent collés en défilant", async ({
  page,
  browser,
  baseURL,
}) => {
  await setTheme(page, "beton");
  const pseudo = `Bio${unique()}`.slice(0, 14);
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", {
    bio: "Passionné de drift et de rassemblement, du circuit au col, toujours partant pour une sortie entre amis le week-end.",
  });
  await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, "/app/moi");
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/app/moi");
  const bio = page.getByTestId("profil-bio");
  const toggle = page.getByTestId("profil-bio-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText("plus");
  const closed = (await bio.boundingBox())?.height ?? 0;
  await toggle.click();
  await expect(toggle).toContainText("moins");
  expect((await bio.boundingBox())?.height ?? 0).toBeGreaterThan(closed + 8);
  await toggle.click();
  await expect(toggle).toContainText("plus");
  // Collant : la rangée reste en haut (sous la barre) quand la page défile.
  const kenji = await (await browser.newContext({ baseURL })).newPage();
  await setTheme(kenji, "beton");
  await loginInBrowser(kenji, "kenji@orasso.local", undefined, "/app/moi");
  await kenji.setViewportSize({ width: 390, height: 700 });
  await kenji.goto("/app/moi");
  const before = (await box(kenji, "profil-tabs")).y;
  await kenji.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await kenji.waitForTimeout(400);
  const after = await box(kenji, "profil-tabs");
  console.log(`R8b1 site : onglets collants, y avant ${Math.round(before)}, après défilement ${Math.round(after.y)}`);
  expect(after.y).toBeLessThan(before - 20);
  expect(after.y).toBeLessThan(120);
  await shot(kenji, "03-onglets-collants");
});

test("visiteur sans véhicule : le Garage vide (site) propose le bouton principal « Ajouter un véhicule »", async ({
  page,
}) => {
  await setTheme(page, "beton");
  await loginInBrowser(page, "paul.photo@orasso.local", undefined, "/app/moi");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/app/moi");
  await expect(page.getByTestId("profil-tab-garage")).toHaveText("Garage · 0");
  await expect(page.getByTestId("garage-empty")).toContainText("Ton garage est vide");
  await expect(page.getByTestId("garage-empty")).toContainText(
    "Ajoute ta première voiture : marque, photos, plaque floutée.",
  );
  await expect(page.getByTestId("garage-empty-add")).toBeVisible();
  await expect(page.getByTestId("garage-add")).toHaveCount(0);
  await shot(page, "04-visiteur");
});

test("profil d'un autre : « Suivre » sur la ligne du grade, « Message » et « Plus » en icônes, partenaires en 4e compteur", async ({
  page,
}) => {
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/u/Lea_11");
    await expect(page.getByTestId("public-head")).toBeVisible();
    const follow = page.getByTestId("follow-button");
    await expect(follow).toBeVisible();
    const f = await box(page, "follow-button");
    const p = await box(page, "public-id");
    const counts = await box(page, "public-counts");
    expect(f.width).toBeLessThan(200);
    expect(f.y).toBeGreaterThan(p.y);
    expect(f.y + f.height).toBeLessThanOrEqual(counts.y + 2);
    await expect(page.getByTestId("message-open")).toHaveAccessibleName(/Écrire à/);
    await expect(page.getByTestId("profile-more")).toBeVisible();
    await expect(page.getByTestId("profil-tab-garage")).toHaveText(/^Garage · \d+$/);
    await expect(page.getByTestId("public-count-partners")).toBeVisible();
    const a = await auditPage(page);
    expect(a.horizontalScroll, `${width}`).toBe(false);
    await shot(page, `05-profil-autre-${width}`);
  }
  // « Plus » ouvre « Signaler ce profil ».
  await page.getByTestId("profile-more").locator("summary").click();
  await page.getByTestId("report-open").click();
  await expect(page.getByTestId("report-dialog")).toBeVisible();
  await shot(page, "06-signaler");
  // La feuille « Plus » reste ouverte : on rouvre la page avant de toucher le compteur.
  await page.goto("/u/Lea_11");
  // Un seul partenaire : il ouvre sa fiche.
  await page.getByTestId("public-count-partners").click();
  await page.waitForURL(/\/p\//);
});

test("compte privé vu d'un inconnu : les nombres, « Réservé à ses abonnés », pas d'onglets", async ({ page }) => {
  await setTheme(page, "beton");
  const pseudo = `Vis${unique()}`.slice(0, 14);
  await signUpApi(pseudo);
  await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, "/app/moi");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/u/Marc_66");
  await expect(page.getByTestId("public-counts")).toBeVisible();
  await expect(page.getByTestId("profile-private-note")).toContainText("Réservé à ses abonnés");
  await expect(page.getByTestId("profil-tabs")).toHaveCount(0);
  await expect(page.getByTestId("follow-button")).toBeVisible();
  await shot(page, "07-prive-inconnu");
});
