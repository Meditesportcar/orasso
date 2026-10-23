import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot M5 (mise au point Exposant, 23/10/2026), côté site : parité de l'appli. Mon compte (sanctions dans « Compte »,
// export des données dans « Confidentialité »), Aide (`/app/aide` : questions fréquentes et contact), Garage (ligne de
// certification, « Pour ta … » : pros partenaires et sponsorisé lié au véhicule), accueil connecté (une seule affiche
// sponsorisée). Site et API lancés sur la base seedée. Captures à 390 et 1 280 px dans les deux thèmes :
// `CAPTURES_DIR`, sinon `<relais>/lot-m5-captures/site-<M5_PHASE>` (avant | apres).
const PHASE = process.env.M5_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m5-captures/site-${PHASE}`;

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
const WIDE = { width: 1280, height: 900 } as const;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

test("captures du site (Béton et Sable, 390 et 1 280 px)", async ({ page }) => {
  test.setTimeout(600_000);
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  for (const theme of THEMES) {
    await setTheme(page, theme);
    for (const [size, viewport] of [
      ["390", MOBILE],
      ["1280", WIDE],
    ] as const) {
      await page.setViewportSize(viewport);
      for (const [name, path] of [
        ["accueil", "/app"],
        ["garage", "/app/garage"],
        ["moi", "/app/moi"],
        ...(PHASE === "avant" ? [] : [["aide", "/app/aide"]]),
      ] as const) {
        await page.goto(path);
        await expect(page.locator("main, body").first()).toBeVisible();
        await shot(page, `${name}-${theme}-${size}`);
      }
    }
  }
});

test.describe("parité du site (lot M5)", () => {
  test.skip(PHASE === "avant", "Captures d'avant seulement");

  test("Mon compte : sanctions dans Compte, export dans Confidentialité, lien vers l'Aide ; l'export se télécharge", async ({
    page,
  }) => {
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
    await page.goto("/app/moi");
    const account = page.getByTestId("account-section");
    await expect(account.getByRole("heading", { name: "Compte", exact: true })).toBeVisible();
    await expect(account.getByTestId("my-sanctions-link")).toBeVisible();
    const privacy = page.getByTestId("privacy-section");
    await expect(privacy.getByRole("heading", { name: "Confidentialité", exact: true })).toBeVisible();
    await expect(privacy.getByTestId("export-data")).toHaveAttribute("href", "/app/mes-donnees");
    await expect(page.getByTestId("help-link")).toHaveAttribute("href", "/app/aide");
    const res = await page.request.get("/app/mes-donnees");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="orasso-mes-donnees-/);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).length).toBeGreaterThan(0);
  });

  test("Aide : six questions fréquentes, nous écrire par e-mail, où sont les sanctions et l'export", async ({
    page,
  }) => {
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/aide");
    await page.goto("/app/aide");
    await expect(page.getByTestId("help-faq").locator("details")).toHaveCount(6);
    await expect(page.getByTestId("help-write-team")).toHaveAttribute("href", /^mailto:contact@orasso\.fr\?subject=/);
    await expect(page.getByTestId("help-report")).toHaveAttribute("href", /^mailto:contact@orasso\.fr\?subject=/);
    await expect(page.getByTestId("help-moved")).toContainText("Compte");
    await expect(page.getByTestId("help-moved")).toContainText("Confidentialité");
  });

  test("Garage : ligne de certification et « Pour ta … » avec un seul sponsorisé lié au véhicule ; Accueil : une seule affiche sponsorisée", async ({
    page,
  }) => {
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/garage");
    await page.goto("/app/garage");
    await expect(page.getByTestId("certification-line").first()).toContainText("Certification");
    const pros = page.getByTestId("garage-pros");
    await expect(pros.getByRole("heading", { name: /^Pour ta / })).toBeVisible();
    expect(await pros.getByTestId("garage-pros-sponsored").count()).toBeLessThanOrEqual(1);
    await expect(pros.getByTestId("garage-pros-item").first()).toBeVisible();
    await page.goto("/app");
    expect(await page.getByTestId("widget-sponsored").count()).toBeLessThanOrEqual(1);
  });
});
