import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, chooseSitePhoto, loginInBrowser, randomPlate, setTheme, signUpApi, unique } from "./helpers";
import { checkerPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot R4a, côté site, d'après la maquette R4 validée par Damien le 24/10 :
//   - R4.1 : le cadre de floutage par modes, à la souris. Un clic sur le cadre : Déplacer → Rotation → Taille ; la
//     ligne du mode ; Taille sans poignée, le curseur dit le bord, le bord opposé reste fixe ;
//   - R4.8 : « Marque ou modèle » tolérant (« golf 4 »), « Ajouter « … » chez Peugeot », « Nom du modèle », l'année
//     demandée, la fiche « Peugeot … » enregistrée avec son nom tapé ;
//   - R4.8b : l'admin voit le groupe dans « Modèles proposés », la liste des fiches avant de valider, et rattache le
//     groupe en un geste ; la fiche perd son nom tapé et garde son nom.
// Captures Béton et Sable, 390 et 1 280 px ; admin à 1 280 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4a-captures/apres/site`;
test.use({ actionTimeout: 30_000 });

function carPhoto() {
  const dir = process.env.M1_PHOTOS;
  if (dir && existsSync(`${dir}/supra.jpg`))
    return { name: "supra.jpg", mimeType: "image/jpeg", buffer: readFileSync(`${dir}/supra.jpg`) };
  return { name: "supra.png", mimeType: "image/png", buffer: checkerPhoto() };
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const box = async (page: Page, testId: string) => {
  const b = await page.getByTestId(testId).first().boundingBox();
  if (!b) throw new Error(`${testId} absent`);
  return b;
};

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`ajout de véhicule du site (${theme}, ${width} px) : cadre par modes, modèle absent, file admin`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const pseudo = `R4aS${unique()}`.slice(0, 20);
      const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
      const cookie = await signUpApi(pseudo, email);
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email, undefined, "/app/garage/nouveau");

      // --- R4.1 ---------------------------------------------------------------------------------------------------
      await chooseSitePhoto(page, carPhoto());
      const editor = page.getByTestId("new-plate-frame");
      await editor.getByRole("button", { name: "Poser un cadre" }).click();
      const mode = editor.getByTestId("site-plate-mode");
      await expect(mode).toContainText("Déplacer : fais glisser le cadre · clique sur le cadre pour changer de mode");
      await editor.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-01-deplacer`);
      let f = await box(page, "site-plate-frame");
      await page.mouse.click(f.x + f.width / 2, f.y + f.height / 2);
      await expect(mode).toContainText("Rotation");
      await expect(editor.getByTestId("site-plate-rotate")).toBeVisible();
      await shot(page, `${theme}-${width}-02-rotation`);
      await page.mouse.click(f.x + f.width / 2, f.y + f.height / 2);
      await expect(mode).toContainText("Taille : tire un bord du cadre");
      await expect(editor.getByTestId("site-plate-rotate")).toHaveCount(0);
      // Le curseur dit le bord survolé.
      const photo = editor.locator(".g-plate__photo");
      await page.mouse.move(f.x + f.width, f.y + f.height / 2);
      await expect(photo).toHaveCSS("cursor", "ew-resize");
      await page.mouse.move(f.x + f.width / 2, f.y);
      await expect(photo).toHaveCSS("cursor", "ns-resize");
      // Un coin, juste dehors : ses deux bords.
      await page.mouse.move(f.x + f.width + 8, f.y + f.height + 8);
      await expect(photo).toHaveCSS("cursor", "nwse-resize");
      // Le bord droit tiré : le bord gauche reste fixe ; seul le bord tenu s'allume.
      await page.mouse.move(f.x + f.width, f.y + f.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(f.x + f.width + i * 5, f.y + f.height / 2);
      await expect(editor.getByTestId("site-plate-edge-r")).toHaveClass(/is-on/);
      await expect(editor.getByTestId("site-plate-edge-l")).not.toHaveClass(/is-on/);
      await shot(page, `${theme}-${width}-03-taille-bord-tenu`);
      await page.mouse.up();
      const g = await box(page, "site-plate-frame");
      expect(Math.abs(g.x - f.x)).toBeLessThan(2);
      expect(g.width).toBeGreaterThan(f.width + 25);
      f = g;
      await page.mouse.click(f.x + f.width / 2, f.y + f.height / 2);
      await expect(mode).toContainText("Déplacer");
      await page.getByLabel("Numéro de plaque · privé").fill(randomPlate());

      // --- R4.8 ---------------------------------------------------------------------------------------------------
      const identity = page.getByTestId("add-identity");
      const search = identity.getByLabel("Marque ou modèle");
      await search.fill("golf 4");
      await expect(identity.getByTestId("add-search-hits")).toContainText("Volkswagen Golf Mk4");
      // Tour 2 : la génération choisie par la recherche s'applique, et une deuxième du même modèle aussi.
      const generation = page.getByLabel("Génération", { exact: true });
      await identity
        .getByRole("button", { name: /Volkswagen Golf Mk4/ })
        .first()
        .click();
      await expect(generation.locator("option:checked")).toHaveText(/^Mk4/);
      await search.fill("golf 5");
      await identity
        .getByRole("button", { name: /Golf Mk5/ })
        .first()
        .click();
      await expect(generation.locator("option:checked")).toHaveText(/^Mk5/);
      await search.fill("");
      await page.getByLabel("Marque", { exact: true }).selectOption({ label: "Peugeot" });
      await expect(page.getByLabel("Modèle", { exact: true }).locator("option", { hasText: "208" })).toHaveCount(1);
      const typed = `Quasar ${unique().slice(-3).toUpperCase()}`;
      await search.fill(typed);
      await expect(identity.getByTestId("add-search-empty")).toContainText(
        `Aucun modèle Peugeot ne s'appelle « ${typed} » dans la liste Orasso.`,
      );
      await expect(identity.getByTestId("add-typed")).toContainText(`Ajouter « ${typed} » chez Peugeot`);
      await identity.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-04-ajouter-chez-peugeot`);
      await identity.getByTestId("add-typed").click();
      await expect(identity.getByLabel("Nom du modèle")).toHaveValue(typed);
      await expect(identity.getByTestId("add-typed-name")).toContainText(
        "Ta fiche est créée tout de suite avec ce nom. L'équipe Orasso l'ajoutera à la liste.",
      );
      await expect(page.getByLabel("Génération", { exact: true })).toHaveCount(0);
      await identity.getByTestId("add-typed-name").scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-05-nom-du-modele`);
      const audit = await auditPage(page);
      expect(audit.greens).toEqual([]);
      expect(audit.horizontalScroll).toBe(false);

      // Sans année : refusé, l'année est demandée ; avec : la fiche « Peugeot … » part avec son nom tapé.
      await page.getByRole("button", { name: "Envoyer", exact: true }).click();
      await expect(page.getByText("Indique l'année : ton modèle n'est pas encore dans la liste Orasso.")).toBeVisible();
      // Les champs fichiers se vident au rechargement : la photo est à reprendre.
      await page.getByLabel("Année").fill("2008");
      if (
        await page
          .getByLabel("Nom du modèle")
          .isVisible()
          .catch(() => false)
      )
        await page.getByLabel("Nom du modèle").fill(typed);
      const sentAgain = await page.getByTestId("site-plate-frame").count();
      if (!sentAgain) {
        await chooseSitePhoto(page, carPhoto());
        await page.getByTestId("site-no-plate").click();
        await page.getByTestId("site-no-plate-yes").click();
      }
      await page.getByRole("button", { name: "Envoyer", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.endsWith("/nouveau"), { timeout: 30_000 });
      const mine = await apiCall<{ id: string; label: string; proposedModel: string | null }[]>(
        cookie,
        "GET",
        "/me/vehicles",
      );
      const vehicle = mine.data[0];
      expect(vehicle).toMatchObject({ label: `Peugeot ${typed}`, proposedModel: typed });
      // La page du véhicule (propriétaire) dit « à ajouter à la liste ».
      await page.goto(`/app/garage/${vehicle?.id}`);
      await expect(page.getByTestId("vehicle-name")).toHaveText(`Peugeot ${typed}`);
      await expect(page.getByText("à ajouter à la liste")).toBeVisible();
      await ctx.close();

      // --- R4.8b : la file admin, un seul passage (1 280 px) ---------------------------------------------------------
      if (width !== 1280) return;
      const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const admin = await adminCtx.newPage();
      await setTheme(admin, theme);
      await loginInBrowser(admin, "damien@orasso.local", undefined, "/admin/vehicules");
      await admin.goto("/admin/vehicules");
      const proposals = admin.getByTestId("proposals");
      await expect(proposals).toContainText("Modèles proposés");
      const group = proposals.getByTestId("proposal-group").filter({ hasText: `Peugeot ${typed}` });
      await expect(group).toHaveCount(1);
      // Lot R4e : le premier groupe de la file est déjà ouvert (`open={i === 0}`) ; selon les fiches déjà en base, ce
      // peut être celui-ci, et un clic le refermerait.
      if (!(await group.evaluate((el) => (el as HTMLDetailsElement).open))) await group.locator("summary").click();
      await expect(group.getByTestId("proposal-vehicle").filter({ hasText: pseudo })).toBeVisible();
      await expect(group).toContainText("Marque connue : Peugeot · modèle tapé");
      await group.scrollIntoViewIfNeeded();
      await shot(admin, `${theme}-1280-06-admin-modeles-proposes`);
      await group.getByRole("button", { name: /Ajouter à la liste et rattacher/ }).click();
      await expect(admin.getByTestId("vehicles-done")).toBeVisible();
      await expect(admin.getByTestId("proposal-group").filter({ hasText: `Peugeot ${typed}` })).toHaveCount(0);
      const after = await apiCall<{ label: string; proposedModel: string | null; modelName: string }[]>(
        cookie,
        "GET",
        "/me/vehicles",
      );
      expect(after.data[0]).toMatchObject({ label: `Peugeot ${typed}`, proposedModel: null, modelName: typed });
      await adminCtx.close();
    });
  }
}
