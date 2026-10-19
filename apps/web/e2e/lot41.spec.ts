import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, MOBILE, SEED_PASSWORD, setTheme, unique } from "./helpers";

// Lot 41, côté site : /inscription alignée sur le flux d'arrivée de l'appli — six profils, carte de France des
// départements (toucher le 66 puis le 11 → puce « 66 · principal » et « +1 »), crédit CC BY 4.0 sous la carte, prénom
// et nom obligatoires et privés. Refus sans prénom (400 et message), compte créé avec profil, départements et nom.
// Deux thèmes, audit des règles du système, captures à 390 px. Prérequis : API et site lancés.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-41-captures/site";
mkdirSync(DIR, { recursive: true });

for (const theme of ["beton", "sable"] as const) {
  test(`/inscription (${theme}) : profil, carte, crédit, nom obligatoire, compte créé`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await page.goto("/inscription");
    await page.waitForLoadState("networkidle");

    // Six profils, l'exposant préchoisi.
    for (const key of ["exhibitor", "visitor", "pro", "organizer", "provider", "media"]) {
      await expect(page.getByTestId(`profile-${key}`), key).toBeVisible();
    }
    await expect(page.getByTestId("profile-exhibitor")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("profile-pro").click();
    await expect(page.getByTestId("profile-pro")).toHaveAttribute("aria-pressed", "true");

    // Carte : 66 puis 11, textes du pro.
    await expect(page.getByTestId("dept-why")).toHaveText(
      "On s'en sert pour montrer ta fiche aux passionnés du coin et te signaler les événements proches, même sans GPS.",
    );
    await expect(page.getByTestId("dept-hint")).toContainText("le premier choisi est celui de ton atelier");
    await page.getByTestId("dept-66").click();
    await expect(page.getByTestId("dept-summary")).toContainText("66 · principal");
    await page.getByTestId("dept-11").click();
    await expect(page.getByTestId("dept-summary")).toContainText("+1");
    await expect(page.getByTestId("dept-66")).toHaveClass(/is-favorite/);
    // Crédit CC BY 4.0 sous la carte, avec le lien vers la licence.
    const credit = page.getByTestId("france-credit");
    await expect(credit).toBeVisible();
    await expect(credit).toHaveText("Carte : Victor Cazanave, CC BY 4.0");
    await expect(credit.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/deed.fr",
    );
    await expect(page.getByTestId("name-privacy")).toContainText(
      "Ta fiche montre le nom de ton atelier, jamais le tien.",
    );

    const s = unique();
    const pseudo = `Ins_${s}`.slice(0, 24);
    const email = `ins_${s}@e2e.orasso.test`;
    await page.getByLabel("Pseudo").fill(pseudo);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
    await page.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
    await page.getByLabel("Nom", { exact: true }).fill("Martí");

    // Prénom d'espaces : le navigateur laisse passer, le serveur refuse (400) et le dit sous le champ.
    await page.getByLabel("Prénom").fill("   ");
    const refused = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/inscription"));
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    expect((await refused).status()).toBe(400);
    await expect(page.getByText("Ton prénom est obligatoire.")).toBeVisible();
    // Les choix sont gardés après le refus.
    await expect(page.getByTestId("profile-pro")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("dept-summary")).toContainText("66 · principal");
    await page.screenshot({ path: `${DIR}/01-inscription-${theme}.png`, fullPage: true });

    const audit = await auditPage(page);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);
    expect(audit.primaryButtons).toBeLessThanOrEqual(1);
    expect(audit.buttonsWithoutIcon).toEqual([]);

    await page.getByLabel("Prénom").fill("Julien");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/inscription"), { timeout: 60_000 });

    const cookie = await login(email);
    const me = await apiCall<{
      profile: { mainProfile: string; departments: string[]; firstName: string; lastName: string };
    }>(cookie, "GET", "/me");
    expect(me.data.profile).toMatchObject({
      mainProfile: "pro",
      departments: ["66", "11"],
      firstName: "Julien",
      lastName: "Martí",
    });
    await ctx.close();
  });
}

test("l'API refuse l'inscription sans nom, sans prénom, sans profil ou sans département (400)", async () => {
  const body = {
    email: `refus_${unique()}@e2e.orasso.test`,
    password: SEED_PASSWORD,
    name: `Rf_${unique()}`.slice(0, 24),
    termsAccepted: true,
    mainProfile: "visitor",
    departments: ["66"],
    firstName: "Julien",
    lastName: "Martí",
  };
  for (const patch of [{ lastName: "" }, { firstName: "  " }, { mainProfile: "autre" }, { departments: [] }]) {
    const res = await apiCall(null, "POST", "/auth/sign-up/email", { ...body, ...patch });
    expect(res.status, JSON.stringify(patch)).toBe(400);
  }
});
