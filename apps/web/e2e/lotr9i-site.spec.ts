import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9i, côté site : la conversation de page d'un média (graine : Kenji_66 ↔ « Sud Cars », tenue par Leo_SudCars).
// Kenji_66 : la ligne « Sud Cars » et l'étiquette « Média », la conversation sous le nom de la page, « Lu par Sud Cars »,
// « Voir la page » vers /m/<id>, il écrit ; Leo_SudCars (sans second facteur) : la ligne « Kenji_66 », « Tu réponds en tant
// que Sud Cars » et sa légende, il répond ; retour chez Kenji. « Leo_SudCars » n'apparaît ni dans la page, ni dans le rendu
// serveur, ni dans aucune réponse /api/ reçue par le navigateur de Kenji. Lea_11 (identification retirée) : 403 avec le libellé.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9i-captures/apres/recette-site`;
const OWNER = "Leo_SudCars";
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["beton", "sable"] as const) {
  for (const viewport of [MOBILE, { width: 1280, height: 800 }] as const) {
    test(`conversation de page, côté personne puis côté titulaire (${theme}, ${viewport.width} px)`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      // --- Kenji_66 (la personne identifiée).
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      const seen: string[] = [];
      page.on("response", async (res) => {
        if (!res.url().includes("/api/")) return;
        try {
          seen.push(await res.text());
        } catch {
          // Réponse sans corps lisible (redirection, flux).
        }
      });
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/messages");
      await page.goto("/app/messages");
      const row = page.getByTestId("conversation-row").filter({ hasText: "Sud Cars" });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Média");
      await shot(page, `liste-personne-${theme}-${viewport.width}`);
      await row.click();
      await expect(page.getByTestId("conversation").getByRole("heading", { name: "Sud Cars" })).toBeVisible();
      // La réponse de la page est signée « Sud Cars », lue par « Sud Cars ».
      await expect(page.getByTestId("messages")).toContainText("Oui, je te l'envoie ce soir.");
      await expect(page.getByTestId("messages")).toContainText("Sud Cars");
      const link = page.getByTestId("view-page");
      await expect(link).toHaveText("Voir la page");
      await expect(link).toHaveAttribute("href", /^\/m\/[0-9a-f-]{36}$/);
      await expect(page.locator('a[href^="/u/"]')).toHaveCount(0);
      const note = `Merci, bien reçu (${theme} ${viewport.width})`;
      await page.locator("#message-body").fill(note);
      await page.getByRole("button", { name: "Envoyer", exact: true }).click();
      await expect(page.getByTestId("messages")).toContainText(note);
      await shot(page, `conversation-personne-${theme}-${viewport.width}`);
      // Le rendu serveur : la page et son HTML initial ne disent rien du titulaire.
      const html = await page.content();
      expect(html).not.toContain(OWNER);
      const url = page.url();
      const ssr = await ctx.request.get(url);
      expect(await ssr.text()).not.toContain(OWNER);
      expect(seen.filter((t) => t.includes(OWNER))).toEqual([]);
      expect(seen.length).toBeGreaterThan(0);
      await ctx.close();

      // --- Leo_SudCars (le titulaire, sans second facteur).
      const ctx2 = await browser.newContext({ viewport });
      const page2 = await ctx2.newPage();
      await setTheme(page2, theme);
      await loginInBrowser(page2, "leo@orasso.local", undefined, "/app/messages");
      await page2.goto("/app/messages");
      const row2 = page2.getByTestId("conversation-row").filter({ hasText: "Kenji_66" });
      await expect(row2).toContainText("Sud Cars");
      await expect(row2).toContainText("Média");
      await shot(page2, `liste-titulaire-${theme}-${viewport.width}`);
      await row2.click();
      await expect(page2.getByTestId("reply-as")).toContainText("Tu réponds en tant que Sud Cars");
      await expect(page2.getByTestId("reply-as")).toContainText(
        "Kenji_66 voit le nom et le logo de ta page, jamais ton compte personnel.",
      );
      await expect(page2.getByTestId("messages")).toContainText(note);
      const answer = `Avec plaisir (${theme} ${viewport.width})`;
      await page2.locator("#message-body").fill(answer);
      await page2.getByRole("button", { name: "Envoyer", exact: true }).click();
      await expect(page2.getByTestId("messages")).toContainText(answer);
      await shot(page2, `conversation-titulaire-${theme}-${viewport.width}`);
      await ctx2.close();

      // --- Retour chez Kenji : la réponse est signée « Sud Cars ».
      const ctx3 = await browser.newContext({ viewport });
      const page3 = await ctx3.newPage();
      await setTheme(page3, theme);
      await loginInBrowser(page3, "kenji@orasso.local", undefined, "/app/messages");
      await page3.goto("/app/messages");
      await page3.getByTestId("conversation-row").filter({ hasText: "Sud Cars" }).click();
      await expect(page3.getByTestId("messages")).toContainText(answer);
      expect(await page3.content()).not.toContain(OWNER);
      await ctx3.close();
    });
  }
}

test("Lea_11 (identification retirée) : l'ouverture est refusée avec le libellé, sans rien du titulaire", async () => {
  const lea = await login("lea@orasso.local");
  const kenji = await login("kenji@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string }[] }>(kenji, "GET", "/me");
  const list = await apiCall<{ items: { id: string; page: { id: string } | null }[] }>(
    kenji,
    "GET",
    "/me/conversations",
  );
  expect(me.status).toBe(200);
  const conv = list.data.items[0];
  expect(conv).toBeDefined();
  const view = await apiCall<{ page: { id: string } }>(kenji, "GET", `/conversations/${conv?.id}`);
  const refused = await apiCall<{ error: { message: string } }>(
    lea,
    "POST",
    `/media/${view.data.page.id}/conversation`,
  );
  expect(refused.status).toBe(403);
  expect(refused.data.error.message).toBe("Tu peux écrire à un média quand il t'a identifié sur un de ses albums.");
  expect(JSON.stringify(refused.data)).not.toContain(OWNER);
});
