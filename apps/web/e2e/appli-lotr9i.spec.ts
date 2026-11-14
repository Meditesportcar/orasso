import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9i, côté appli (version web de recette, `APP_URL`) : la conversation de page d'un média. Kenji_66 voit « Sud Cars » (ligne,
// étiquette « Média », titre, réponse signée « Sud Cars », « Lu par Sud Cars », « Voir la page »), écrit ; Leo_SudCars (sans
// second facteur) voit « Kenji_66 » / « Sud Cars », « Tu réponds en tant que Sud Cars » et sa légende, répond. « Leo_SudCars »
// n'apparaît ni dans l'écran ni dans aucune réponse /api/ reçue par le navigateur de Kenji. Captures : Béton et Sable, 384 px.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9i-captures/apres/recette-appli`;
const OWNER = "Leo_SudCars";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function openApp(browser: Browser, theme: Theme, email: string, fontScale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(
    ([th, scale]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", th as string);
      document.documentElement.style.fontSize = `${Number(scale) * 100}%`;
    },
    [theme, fontScale],
  );
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

for (const theme of ["beton", "sable"] as const) {
  test(`conversation de page, côté personne puis côté titulaire (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await openApp(browser, theme, "kenji@orasso.local");
    const seen: string[] = [];
    page.on("response", async (res) => {
      if (!res.url().includes("/api/")) return;
      try {
        seen.push(await res.text());
      } catch {
        // Réponse sans corps lisible.
      }
    });
    await page.goto("/messages");
    const row = page.getByTestId("conversation-row").filter({ hasText: "Sud Cars" });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText("Média");
    await shot(page, `liste-personne-${theme}-384`);
    await row.click();
    await expect(page.getByTestId("messages").getByText("Oui, je te l'envoie ce soir.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("view-page")).toBeVisible();
    await expect(page.getByTestId("read-by")).toContainText("Lu par Sud Cars");
    const note = `Merci, bien reçu (${theme})`;
    await page.getByTestId("message-body").fill(note);
    await page.getByTestId("message-send").click();
    await expect(page.getByTestId("messages").getByText(note)).toBeVisible();
    await shot(page, `conversation-personne-${theme}-384`);
    await page.getByTestId("view-page").click();
    await page.waitForURL(/\/m\/[0-9a-f-]{36}/, { timeout: 30_000 });
    expect(seen.filter((t) => t.includes(OWNER))).toEqual([]);
    expect(await page.content()).not.toContain(OWNER);
    await ctx.close();

    const owner = await openApp(browser, theme, "leo@orasso.local");
    await owner.page.goto("/messages");
    const row2 = owner.page.getByTestId("conversation-row").filter({ hasText: "Kenji_66" });
    await expect(row2).toBeVisible({ timeout: 30_000 });
    await expect(row2).toContainText("Sud Cars");
    await expect(row2).toContainText("Média");
    await shot(owner.page, `liste-titulaire-${theme}-384`);
    await row2.click();
    await expect(owner.page.getByTestId("reply-as")).toContainText("Tu réponds en tant que Sud Cars");
    await expect(owner.page.getByTestId("reply-as")).toContainText(
      "Kenji_66 voit le nom et le logo de ta page, jamais ton compte personnel.",
    );
    await expect(owner.page.getByTestId("messages").getByText(note)).toBeVisible();
    const answer = `Avec plaisir (${theme})`;
    await owner.page.getByTestId("message-body").fill(answer);
    await owner.page.getByTestId("message-send").click();
    await expect(owner.page.getByTestId("messages").getByText(answer)).toBeVisible();
    await shot(owner.page, `conversation-titulaire-${theme}-384`);
    await owner.ctx.close();

    // Police ×1,3 : la ligne « Tu réponds en tant que » et le bouton tiennent.
    const big = await openApp(browser, theme, "leo@orasso.local", 1.3);
    await big.page.goto("/messages");
    await big.page.getByTestId("conversation-row").filter({ hasText: "Kenji_66" }).click();
    await expect(big.page.getByTestId("reply-as")).toBeVisible({ timeout: 30_000 });
    await expect(big.page.getByTestId("message-send")).toBeVisible();
    await shot(big.page, `conversation-titulaire-${theme}-384-x1_3`);
    await big.ctx.close();
  });
}
