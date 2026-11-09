import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, setTheme } from "./helpers";

// Lot R7-0 (corrections du 08/11, site) sur l'événement en cours « Rassemblement du Lydia » du seed : pas de bandeau
// « t'invite » une fois retenu, tampon daté de l'entrée, entrée valable pour tout l'événement (Nina_34, entrée la veille),
// vote « jusqu'au <jour> », classement caché avant le vote. API et site lancés sur la base seedée.
const SLUG = "rassemblement-du-lydia";

async function signIn(page: Page, email: string, theme: "beton" | "sable") {
  await setTheme(page, theme);
  await page.goto(`/connexion?retour=${encodeURIComponent("/app")}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
  await page.waitForLoadState("networkidle");
}

for (const theme of ["beton", "sable"] as const) {
  test(`Damien pendant le Lydia, site (${theme})`, async ({ page }) => {
    const cookie = await login("damien@orasso.local");
    const apps = await apiCall<{ checkedInAt: string | null; event: { slug: string } }[]>(
      cookie,
      "GET",
      "/me/applications?scope=upcoming",
    );
    const mine = apps.data.find((a) => a.event.slug === SLUG);
    expect(mine?.checkedInAt).toBeTruthy();
    await signIn(page, "damien@orasso.local", theme);

    await page.goto(`/e/${SLUG}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/t'invite/)).toHaveCount(0);

    const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })
      .format(new Date(mine?.checkedInAt as string))
      .replace("/", ".");
    await page.goto("/app/passeport");
    await expect(page.getByTestId("passport-stamp").first()).toBeVisible();
    await expect(
      page.getByLabel(new RegExp(`Tampon Rassemblement du Lydia, ${day.replace(".", "\\.")}`)).first(),
    ).toBeVisible();

    await page.goto(`/app/vote/${SLUG}`);
    await expect(page.getByText(/vote ouvert jusqu'au \w+ \d+ \S+, \d+ h/i)).toBeVisible();
    await expect(page.getByTestId("vote-ranking-hidden")).toContainText("Le classement s'affiche après ton vote");
    await expect(page.getByTestId("vote-board-row")).toHaveCount(0);
  });
}

test("Nina_34, entrée la veille : l'entrée vaut jusqu'à la fin, le QR reste en second", async ({ page }) => {
  await signIn(page, "nina@orasso.local", "beton");
  await page.goto("/app/sorties");
  const entered = page.getByTestId("pass-entered").first();
  await expect(entered).toContainText(/Entrée \S+ à \d+ h(?: \d+)? · accès jusqu'au \S+ \d+ \S+/);
  await expect(entered).toContainText("pour un contrôle");
  await expect(page.getByTestId("pass-qr").first()).toBeVisible();
});

test("Nina_34 : le classement apparaît après son vote ; si sa relecture échoue, la page le dit (tour 2)", async ({
  page,
}) => {
  await signIn(page, "nina@orasso.local", "beton");
  await page.goto(`/app/vote/${SLUG}`);
  await expect(page.getByTestId("vote-candidate").first()).toBeVisible();
  // Le chargeur du site relit le classement côté serveur : on ne peut pas l'intercepter ici, on vérifie le chemin nominal
  // (vote, puis classement visible) ; l'échec de la relecture est couvert par la recette de l'appli et les tests de `shared`.
  await page.locator('[data-testid="vote-candidate"]:not([disabled])').first().click();
  await expect(page.getByTestId("vote-saved")).toBeVisible();
  await expect(page.getByTestId("vote-ranking-hidden")).toHaveCount(0);
  await expect(page.getByTestId("vote-board-row").first()).toBeVisible();
});
