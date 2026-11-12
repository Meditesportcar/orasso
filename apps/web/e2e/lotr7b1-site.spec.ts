import { expect, test } from "@playwright/test";
import { auditPage } from "./audit";
import { loginInBrowser, setTheme } from "./helpers";

// Lot R7b1 (D38), côté site : « Mon compte » porte le Garage (par défaut) et les Sorties (`?onglet=`), `/app/garage` et
// `/app/passeport` répondent 302 vers lui, le profil d'un autre a les mêmes onglets, compte privé vu d'un inconnu : les
// nombres seulement, abonné accepté : tout. Comptes du seed ; site et API lancés sur la base seedée.
test.use({ actionTimeout: 30_000 });

test("les anciennes adresses répondent 302 vers le Profil, la recherche gardée", async ({ page, baseURL }) => {
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const hit = async (path: string) => {
    const res = await fetch(`${baseURL}${path}`, { redirect: "manual", headers: { cookie: cookies } });
    return { status: res.status, location: res.headers.get("location") };
  };
  expect(await hit("/app/garage")).toEqual({ status: 302, location: "/app/moi?onglet=garage" });
  expect(await hit("/app/garage?photo=refusee")).toEqual({
    status: 302,
    location: "/app/moi?onglet=garage&photo=refusee",
  });
  expect(await hit("/app/passeport")).toEqual({ status: 302, location: "/app/moi?onglet=sorties" });
  expect(await hit("/app/passeport?saison=2025")).toEqual({
    status: 302,
    location: "/app/moi?onglet=sorties&saison=2025",
  });
});

test("Mon compte : Publications par défaut (R8b2), onglets Garage et Sorties, aucune plaque lisible dans les pages", async ({
  page,
}) => {
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/moi");
    // Lot R8b2 : le profil s'ouvre sur « Publications » ; le Garage est un clic plus loin.
    await expect(page.getByTestId("profil-tab-publications")).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("profil-tab-garage").click();
    await expect(page.getByTestId("profil-tab-garage")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("link", { name: "Ajouter un véhicule" }).first()).toBeVisible();
    for (const id of ["profil-count-abonnes", "profil-count-abonnements", "profil-count-sorties"]) {
      await expect(page.getByTestId(id), `${width} : ${id}`).toBeVisible();
    }
    const a = await auditPage(page);
    expect(a.horizontalScroll, `${width}`).toBe(false);
    expect(a.greens).toEqual([]);
    await page.getByTestId("profil-tab-sorties").click();
    await page.waitForURL(/onglet=sorties/);
    await expect(page.getByTestId("profil-tab-sorties")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("passport")).toBeVisible();
    await expect(page.getByTestId("profil-places")).toBeVisible();
    // Le nombre de sorties ouvre le même onglet.
    await page.goto("/app/moi");
    await page.getByTestId("profil-count-sorties").click();
    await page.waitForURL(/onglet=sorties/);
  }
});

test("profil d'un autre : onglets Garage et Sorties ; compte privé : nombres seulement ; abonné accepté : tout", async ({
  page,
  browser,
}) => {
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  await page.goto("/u/Lea_11");
  await expect(page.getByTestId("profil-tab-garage")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("profile-car")).toBeVisible();
  await expect(page.getByTestId("message-open")).toBeVisible();
  await page.getByTestId("profil-tab-sorties").click();
  await page.waitForURL(/onglet=sorties/);
  await expect(page.getByTestId("profile-car")).toHaveCount(0);
  // Compte privé vu d'un inconnu.
  await page.goto("/u/Marc_66");
  await expect(page.getByTestId("public-counts")).toBeVisible();
  await expect(page.getByTestId("publications-private")).toContainText("Compte privé");
  await expect(page.getByTestId("profil-tab-garage")).toHaveCount(0);
  // Tour 2 (maquette R7.12) : plus de liste « Ses véhicules · marque et modèle » pour un inconnu.
  await expect(page.getByTestId("profile-vehicles-private")).toHaveCount(0);
  await expect(page.getByText("Ses véhicules", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("profile-car")).toHaveCount(0);
  await expect(page.getByTestId("profile-garage")).toHaveCount(0);
  await expect(page.getByTestId("profile-outings")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/[A-Z]{2}-\d{3}-[A-Z]{2}/);
  // Abonné accepté.
  const ctx = await browser.newContext({ baseURL: page.url().split("/u/")[0] });
  const p2 = await ctx.newPage();
  await loginInBrowser(p2, "julie@orasso.local", undefined, "/app/moi");
  await p2.goto("/u/Marc_66");
  await expect(p2.getByTestId("profil-tab-garage")).toBeVisible();
  // Abonné accepté : l'onglet « Publications » n'a pas de panneau « Compte privé ».
  await p2.getByTestId("profil-tab-publications").click();
  await expect(p2).toHaveURL(/onglet=publications/);
  // L'onglet chargé (liste ou état vide) avant de constater l'absence du panneau « Compte privé ».
  await expect(p2.getByTestId("publications-tab").or(p2.getByTestId("publications-empty"))).toBeVisible({
    timeout: 30_000,
  });
  await expect(p2.getByTestId("publications-private")).toHaveCount(0);
  // Le profil s'ouvre sur « Publications » (R8b2) : la voiture est dans l'onglet « Garage ».
  await p2.getByTestId("profil-tab-garage").click();
  await expect(p2.getByTestId("profile-car")).toBeVisible();
  await expect(p2.locator("body")).not.toContainText(/[A-Z]{2}-\d{3}-[A-Z]{2}/);
  await ctx.close();
});
