import { mkdirSync } from "node:fs";
import { type Browser, expect, test } from "@playwright/test";
import { apiCall, createPublishedPro, login, loginInBrowser, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot 36 : corrections des retours de Damien côté site — adresse obligatoire, fin d'assistant à trois choix (Aperçu,
// Publier), saisie gardée et garde avant de quitter, raison d'une candidature impossible, page « l'appli », liens de
// l'appli (assetlinks.json), vérification de l'adresse d'une fiche pro. Captures (Béton et Sable, 390 px) dans le relais.
// Prérequis : API et site lancés sur la base seedée (damien@orasso.local, MéditeSportCar vérifiée).

const DIR = process.env.LOT36_CAPTURES ?? `${RELAIS}/lot-36-captures/site`;
mkdirSync(DIR, { recursive: true });
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

async function phone(browser: Browser, theme: "beton" | "sable") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "orasso-theme", value: theme, url: WEB }]);
  return ctx;
}

test("liens de l'appli et page « l'appli »", async ({ page }) => {
  const res = await page.request.get("/.well-known/assetlinks.json");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
  expect(body[0]?.target.package_name).toBe("fr.orasso.app");
  expect(body[0]?.target.sha256_cert_fingerprints[0]).toMatch(/^65:05:62:39:/);
  expect((await page.request.get("/.well-known/apple-app-site-association")).status()).toBe(404);
  await page.goto("/appli");
  await expect(page.getByTestId("app-page")).toBeVisible();
  await expect(page.getByTestId("app-soon")).toBeVisible();
});

test("assistant : adresse obligatoire, aperçu du brouillon, saisie gardée, publication depuis la fin", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const theme of ["beton", "sable"] as const) {
    const ctx = await phone(browser, theme);
    const page = await ctx.newPage();
    await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar/nouvel-evenement");
    await page.goto("/orga/meditesportcar/nouvel-evenement");
    // Saisie gardée d'un passage précédent : on repart de zéro.
    const restored = page.getByTestId("wizard-restored");
    if (await restored.isVisible().catch(() => false)) await restored.getByRole("button").click();
    const title = `Rasso lot 36 ${unique()}`;
    await page.getByLabel("Titre").fill(title);
    const day = new Date(Date.now() + 20 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    // Lot 53 : huit temps ; l'adresse a le sien (le deuxième).
    await page.getByLabel("Date", { exact: true }).fill(day);
    await page.getByLabel("Début").fill("18:00");
    await page.getByLabel("Fin").fill("22:00");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByTestId("wizard-step")).toContainText("Lieu");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByTestId("wizard-error")).toContainText("adresse et la ville");
    await page.screenshot({ path: `${DIR}/01-assistant-adresse-obligatoire-${theme}.png`, fullPage: true });
    await page.getByLabel("Adresse", { exact: true }).fill("Parking du port");
    await page.getByLabel("Ville").fill("Canet-en-Roussillon");

    // Saisie gardée dans le navigateur : un rechargement ne la perd pas.
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByTestId("wizard-restored")).toBeVisible();
    // Lot 53 : la saisie revient au temps où on l'a laissée (le lieu).
    await expect(page.getByLabel("Adresse", { exact: true })).toHaveValue("Parking du port");

    // Chaque « Continuer » enregistre : on attend le temps suivant avant de recliquer.
    for (let i = 0; i < 8; i++) {
      const more = page.getByRole("button", { name: "Continuer" });
      if (!(await more.isVisible())) break;
      const before = (await page.getByTestId("wizard-step").textContent()) ?? "";
      await more.click();
      await expect(page.getByTestId("wizard-step")).not.toHaveText(before, { timeout: 30_000 });
    }
    await expect(page.getByTestId("wizard-step")).toContainText("Tout est prêt");
    await expect(page.getByTestId("wizard-publish")).toBeVisible();
    await expect(page.getByTestId("wizard-keep-draft")).toBeVisible();
    await page.screenshot({ path: `${DIR}/02-assistant-fin-trois-choix-${theme}.png`, fullPage: true });

    // Aperçu : la page publique du brouillon, pour l'équipe seulement.
    await page.getByTestId("wizard-preview").click();
    await page.waitForURL(/\/e\/[^/?]+\?apercu=1/);
    await expect(page.getByTestId("draft-preview")).toBeVisible();
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "";
    await page.screenshot({ path: `${DIR}/03-apercu-brouillon-${theme}.png`, fullPage: true });
    const visitor = await signUpApi(`Visiteur_${unique()}`.slice(0, 24));
    expect((await apiCall(visitor, "GET", `/events/by-slug/${slug}`)).status).toBe(404);

    // Modifier le brouillon puis publier depuis la fin de l'assistant.
    const damien = await login("damien@orasso.local");
    const ev = await apiCall<{ id: string }>(damien, "GET", `/events/by-slug/${slug}`);
    // Lot 53 : un brouillon complet rouvre directement sur « Tout est prêt ».
    await page.goto(`/orga/meditesportcar/e/${ev.data.id}/modifier`);
    await expect(page.getByTestId("wizard-step")).toContainText("Tout est prêt");
    await page.getByTestId("wizard-publish").click();
    await page.waitForURL(/publie=1/);
    await expect(page.getByTestId("published-note")).toBeVisible();
    expect((await apiCall(visitor, "GET", `/events/by-slug/${slug}`)).status).toBe(200);
    await ctx.close();
  }
});

test("garde avant de quitter l'assistant avec une saisie non enregistrée", async ({ page }) => {
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar/nouvel-evenement");
  await page.goto("/orga/meditesportcar/nouvel-evenement");
  const restored = page.getByTestId("wizard-restored");
  if (await restored.isVisible().catch(() => false)) await restored.getByRole("button").click();
  const title = `Brouillon gardé ${unique()}`;
  await page.getByLabel("Titre").fill(title);
  await page.waitForTimeout(600);
  // Un lien de l'espace organisateur (lien classique : le navigateur demande « Quitter le site ? », accepté ici) :
  // la saisie reste dans le navigateur et revient à l'ouverture de l'assistant.
  page.on("dialog", (d) => void d.accept());
  await page.locator("a[href='/orga/meditesportcar/staff']").first().click();
  await page.waitForURL(/\/staff/);
  await page.goto("/orga/meditesportcar/nouvel-evenement");
  await expect(page.getByTestId("wizard-restored")).toBeVisible();
  await expect(page.getByLabel("Titre")).toHaveValue(title);
  await page.getByTestId("wizard-restored").getByRole("button").click();
  await expect(page.getByLabel("Titre")).toHaveValue("");
});

test("raison d'une candidature impossible (ouverture à venir, avec l'année)", async ({ browser }) => {
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date(Date.now() + 400 * 86_400_000);
  const created = await apiCall<{ id: string; slug: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title: `Édition suivante ${unique()}`,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 4 * 3_600_000).toISOString(),
    addressLine: "Parking du port",
    city: "Canet-en-Roussillon",
    admittedVehicleTypes: ["car"],
    admission: "filtered",
    registrationsOpenAt: new Date(start.getTime() - 10 * 86_400_000).toISOString(),
    previewHours: 0,
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  for (const theme of ["beton", "sable"] as const) {
    const ctx = await phone(browser, theme);
    const page = await ctx.newPage();
    await page.goto(`/e/${created.data.slug}`);
    const reason = page.getByTestId("registration-reason");
    await expect(reason).toContainText("Les candidatures ouvrent le");
    await expect(reason).toContainText(String(start.getFullYear()));
    await reason.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/04-raison-ouverture-${theme}.png` });
    await ctx.close();
  }
});

test("fiche pro : vérifier l'adresse", async ({ browser }) => {
  const pseudo = `Pro_${unique()}`.slice(0, 24);
  const cookie = await signUpApi(pseudo);
  const pro = await createPublishedPro(cookie, `Garage ${pseudo}`);
  const ctx = await phone(browser, "sable");
  const page = await ctx.newPage();
  await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, undefined, `/pro/${pro.slug}`);
  await page.goto(`/pro/${pro.slug}`);
  await page.getByLabel("Adresse", { exact: true }).fill("Place de la République");
  await page.getByRole("button", { name: "Vérifier l'adresse" }).click();
  // Le géocodeur public de l'IGN répond « Trouvée … », « introuvable » ou une erreur : jamais vide.
  await expect(page.getByTestId("pro-address-status")).not.toHaveText(/^$|Recherche…/, { timeout: 20_000 });
  await page.screenshot({ path: `${DIR}/05-fiche-pro-adresse-sable.png`, fullPage: true });
  await ctx.close();
});
