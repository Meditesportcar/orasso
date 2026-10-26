import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, loginInBrowser, setTheme, unique } from "./helpers";
import { parisDay, type R5Account, r5Crew } from "./lotr5c2-setup";
import { RELAIS } from "./relais";

// Lot R5c2 (site) : la même page que l'appli. Chef : onglets, « Proposer une sortie » (formulaire avec la carte),
// réponse, garage, membres et demandes avec leur message, réglages (Instagram, sorties réservées au chef). Membre :
// sorties réservées. Pas membre : vitrine et fenêtre de demande avec un message. « Rejoindre un crew » : la même
// fenêtre. Béton et Sable, 390 et 1 280 px (sorties à droite sur grand écran).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5c2-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string, full = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
}

async function open(browser: Browser, who: R5Account, theme: "beton" | "sable", width: number, path: string) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  await loginInBrowser(page, who.email, undefined, path);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return page;
}

test("site : page du crew, sorties, réglages, vitrine et demande avec message", async ({ browser }) => {
  test.setTimeout(900_000);
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const crew = await r5Crew(unique());
      const base = `/c/${crew.slug}`;

      // Chef : proposer une sortie (onglet Sorties sur téléphone, colonne de droite sur grand écran).
      const k = await open(browser, crew.chef, theme, width, base);
      await expect(k.getByTestId("crew")).toHaveAttribute("data-state", "leader");
      await expect(k.getByTestId("crew-feed")).toBeVisible();
      await expect(k.getByTestId("crew-instagram")).toContainText("roussillondrift");
      if (width === 390) {
        await expect(k.getByTestId("crew-propose-outing")).toBeHidden();
        await k.getByTestId("crew-tab-sorties").click();
        await k.waitForURL(/onglet=sorties/);
      } else {
        await expect(k.getByTestId("crew-tab-sorties")).toBeHidden();
      }
      await shot(k, `01-chef-${tag}`);
      await k.getByTestId("crew-propose-outing").click();
      await k.waitForURL(/\/sortie$/);
      await k.waitForLoadState("networkidle");
      await expect(k.getByTestId("outing-missing")).toBeVisible();
      await k.getByTestId("outing-title").fill("Balade des Aspres");
      await k.getByTestId("outing-day").fill(parisDay(5));
      await k.getByTestId("outing-time").fill("09:00");
      await k.getByTestId("outing-place").fill("Parking de la cave coopérative, Thuir");
      await k.getByLabel("Le programme").fill("Café à Thuir, puis Castelnou et Prades.");
      await expect(k.getByTestId("outing-missing")).toHaveCount(0);
      await shot(k, `02-proposer-${tag}`, true);
      await k.getByTestId("outing-send").click();
      await k.waitForURL(/onglet=sorties/);
      const card = k.getByTestId("crew-outing").filter({ hasText: "Balade des Aspres" });
      await expect(card).toBeVisible();
      await card.getByTestId("outing-rsvp-yes").click();
      await expect(card.getByTestId("outing-count")).toHaveText("1 vient");
      await shot(k, `03-chef-sorties-${tag}`);
      await k.goto(`${base}?onglet=garage`);
      await expect(k.getByTestId("crew-garage-vehicle")).toHaveCount(2);
      await shot(k, `04-chef-garage-${tag}`);
      await k.goto(`${base}?onglet=membres`);
      await expect(k.getByTestId("crew-pending-request")).toContainText("Je roule en S13");
      await shot(k, `05-chef-membres-${tag}`);
      // Réglages : sorties réservées au chef.
      await k.getByTestId("crew-settings").click();
      await k.waitForURL(/\/reglages$/);
      await expect(k.getByTestId("crew-settings-instagram")).toHaveValue("@roussillondrift");
      await k.getByTestId("crew-outings-right-no").click();
      await expect(k.getByTestId("crew-settings-ok")).toBeVisible();
      await expect(k.getByTestId("crew-outings-right-no")).toHaveAttribute("aria-pressed", "true");
      await shot(k, `06-reglages-${tag}`, true);
      await k.context().close();

      // Membre : pas de « Proposer une sortie » (réglage non) ; elle répond « Peut-être ».
      const l = await open(browser, crew.lea, theme, width, `${base}?onglet=sorties`);
      await expect(l.getByTestId("crew-propose-reserved")).toBeVisible();
      await expect(l.getByTestId("crew-propose-outing")).toHaveCount(0);
      const lcard = l.getByTestId("crew-outing").filter({ hasText: "Balade des Aspres" });
      await lcard.getByTestId("outing-rsvp-maybe").click();
      await expect(lcard.getByTestId("outing-count")).toHaveText("1 vient · 1 peut-être");
      await expect(lcard.getByTestId("outing-edit")).toHaveCount(0);
      await l.context().close();

      // Pas membre : la vitrine (sans sorties ni garage), puis la demande avec un message.
      const s = await open(browser, crew.sarah, theme, width, base);
      await expect(s.getByTestId("crew-vitrine")).toBeVisible();
      await expect(s.getByTestId("crew-tabs")).toHaveCount(0);
      await expect(s.getByTestId("crew-friends")).toContainText("1 de tes amis en fait partie");
      await expect(s.getByText("Balade des Aspres")).toHaveCount(0);
      await shot(s, `07-vitrine-${tag}`, true);
      await s.getByTestId("crew-request").click();
      await s.getByTestId("crew-request-message").fill("Salut ! Je roule en Clio 2 RS, souvent à Canet le dimanche.");
      await shot(s, `08-vitrine-demande-${tag}`);
      await s.getByTestId("crew-request-send").click();
      await expect(s.getByTestId("crew-request-sent")).toContainText(`Demande envoyée à ${crew.chef.pseudo}`);
      await shot(s, `09-vitrine-envoyee-${tag}`, true);
      await s.context().close();

      // « Rejoindre un crew » : la même fenêtre ; le message part avec la demande.
      const p = await open(browser, crew.paul, theme, width, `/app/crews/rejoindre?q=${encodeURIComponent(crew.name)}`);
      const row = p.getByTestId("crew-row").filter({ hasText: crew.name });
      await row.getByTestId("crew-join").click();
      await p.getByTestId("crew-request-message").fill("Je cherche un crew pour rouler le dimanche.");
      await p.getByTestId("crew-request-send").click();
      await expect(row.getByTestId("crew-requested")).toBeVisible();
      await p.context().close();
      const pending = await apiCall<{ requests: { person: { pseudo: string }; message: string | null }[] }>(
        crew.chef.cookie,
        "GET",
        `/crews/${crew.id}/requests`,
      );
      expect(pending.data.requests.find((r) => r.person.pseudo === crew.paul.pseudo)?.message).toBe(
        "Je cherche un crew pour rouler le dimanche.",
      );
    }
  }
});
