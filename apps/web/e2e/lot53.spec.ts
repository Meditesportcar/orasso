import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, login, loginInBrowser, MOBILE, samplePhoto, setTheme, unique } from "./helpers";

// Lot 53, côté site : l'assistant de création en huit temps (`s-create`) — type, lieu avec épingle, arrivées, critères
// en trois questions, avant-première, règlement, affiche générée, « Tout est prêt » (Publier / Brouillon / Aperçu).
// Enregistré à chaque temps ; un brouillon rouvre au bon temps. Deux thèmes, téléphone (390 px) et bureau.
// Prérequis : API et site lancés sur la base seedée (damien@orasso.local, MéditeSportCar vérifiée).
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/Dams/.claude/relais/orasso/lot-53-captures/site";
mkdirSync(DIR, { recursive: true });
const DESKTOP = { width: 1280, height: 900 } as const;

const parisDay = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.primaryButtons, "un seul bouton principal").toBeLessThanOrEqual(1);
  expect(a.buttonsWithoutIcon).toEqual([]);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.neonAccent).toBeLessThanOrEqual(1);
}

async function shot(page: Page, name: string, theme: string, desktop: boolean) {
  await audit(page);
  await page.screenshot({ path: `${DIR}/${name}-${theme}${desktop ? "-bureau" : ""}.png`, fullPage: true });
}

const next = async (page: Page, label: string) => {
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText(label, { timeout: 30_000 });
};

async function open(browser: Browser, theme: "beton" | "sable", desktop: boolean) {
  const ctx = await browser.newContext({ viewport: desktop ? DESKTOP : MOBILE });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar/nouvel-evenement");
  await page.goto("/orga/meditesportcar/nouvel-evenement");
  await page.waitForLoadState("networkidle");
  const restored = page.getByTestId("wizard-restored");
  if (await restored.isVisible().catch(() => false)) await restored.getByRole("button").click();
  return { ctx, page };
}

for (const [theme, desktop] of [
  ["beton", false],
  ["sable", false],
  ["beton", true],
  ["sable", true],
] as const) {
  test(`huit temps, affiche générée, ${theme}${desktop ? " (bureau)" : ""}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme, desktop);
    const step = page.getByTestId("wizard-step");
    const title = `Nocturne 53 ${unique()}`;
    const recurrent = theme === "sable" && !desktop;

    // (1) Type.
    await expect(step).toContainText("Étape 1 sur 8 · Type");
    await expect(page.getByRole("heading", { name: "C'est quel genre ?" })).toBeVisible();
    await page.getByRole("button", { name: "Nocturne", exact: true }).click();
    if (recurrent) {
      await page.getByTestId("wizard-kind-rec").click();
      await page.getByRole("button", { name: "Le 1er" }).click();
      await page.getByRole("button", { name: "Dimanche", exact: true }).click();
      await page.getByLabel("Nombre de dates après la première").selectOption("2");
      await expect(page.getByTestId("wizard-next-dates")).toContainText("Jusqu'au");
    } else {
      await page.getByLabel("Date", { exact: true }).fill(parisDay(20));
    }
    await page.getByLabel(recurrent ? "De" : "Début", { exact: true }).fill("19:00");
    await page.getByLabel(recurrent ? "À" : "Fin", { exact: true }).fill("23:30");
    await page.getByLabel("Titre").fill(title);
    await page.getByText("Public et places").click();
    await page.getByRole("button", { name: "Avec une limite" }).click();
    await page.getByLabel("Nombre de places").fill("60");
    await shot(page, "01-type", theme, desktop);
    await next(page, "Lieu");

    // (2) Lieu : adresse obligatoire, épingle posée sur la carte, précision, mission.
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByTestId("wizard-error")).toContainText("adresse");
    await page.getByLabel("Adresse", { exact: true }).fill("Quai Arthur Rimbaud");
    await page.getByLabel("Code postal").fill("66140");
    await page.getByLabel("Ville").fill("Canet-en-Roussillon");
    const map = page.getByTestId("event-map");
    await expect(map.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await map.click({ position: { x: 140, y: 120 } });
    await expect(page.getByTestId("wizard-coords")).toContainText(/N · .* E/);
    await page
      .getByLabel("Précision pour l'entrée (facultatif)")
      .fill("Entrée par le quai Nord, barrière levée à 18 h");
    await page.getByText("Sur place", { exact: true }).click();
    await page.getByTestId("wizard-mission-add").click();
    await page.getByLabel("Installation à partir de").fill("16:00");
    await shot(page, "02-lieu", theme, desktop);
    await next(page, "Arrivées");

    // (3) Arrivées.
    await page.getByTestId("arrival-exhibitors-set").click();
    await expect(page.getByTestId("wizard-exhibitor-sees")).toContainText("Arrivée 18 h 30 – 19 h 15 (strict)");
    await shot(page, "03-arrivees", theme, desktop);
    await next(page, "Critères");

    // (4) Critères en trois questions.
    await page.getByRole("button", { name: "Japonaise" }).click();
    await page.getByRole("button", { name: "Allemande" }).click();
    await expect(page.getByTestId("wizard-criteria-summary")).toContainText(
      "Tu acceptes les japonaises et les allemandes",
    );
    await shot(page, "04-criteres", theme, desktop);
    await next(page, "Avant-première");

    // (5) Avant-première : abonnés avant tout le monde.
    await expect(page.getByTestId("wizard-open-subscribers")).toBeVisible();
    await expect(page.getByTestId("wizard-timeline").locator("li")).toHaveCount(3);
    await shot(page, "05-avant-premiere", theme, desktop);
    await next(page, "Règlement");

    // (6) Règlement : modèle et compteur.
    await page.getByRole("button", { name: "Modèle Nocturne" }).click();
    await expect(page.getByText(/4 lignes · \d+ caractères/)).toBeVisible();
    await shot(page, "06-reglement", theme, desktop);
    await next(page, "Affiche");

    // (7) Affiche : photo, style, titre, aperçu rendu par l'API.
    await page
      .getByTestId("wizard-poster-photo")
      .locator("input")
      .setInputFiles({
        name: "photo.jpg",
        mimeType: "image/jpeg",
        buffer: samplePhoto([40, 60, 120]),
      });
    await page.getByTestId("wizard-style-jdm").click();
    await page.getByLabel("Titre sur l'affiche").fill("Nocturne de Canet");
    await expect(page.getByTestId("wizard-poster-preview")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("wizard-style-neon").locator("img")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await shot(page, "07-affiche", theme, desktop);
    await next(page, "Tout est prêt");

    // (8) Tout est prêt : affiche générée, récapitulatif, trois choix.
    await expect(page.getByTestId("wizard-ready-poster")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("wizard-recap")).toContainText(title);
    await expect(page.getByTestId("wizard-publish")).toBeVisible();
    await shot(page, "08-tout-est-pret", theme, desktop);

    // Enregistré à chaque temps : le brouillon existe déjà, avec tout ce qui a été saisi.
    const damien = await login("damien@orasso.local");
    const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
    const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
    const list = await apiCall<{ id: string; title: string; parentEventId?: string | null }[]>(
      damien,
      "GET",
      `/structures/${structureId}/events`,
    );
    const id = list.data.find((e) => e.title === title)?.id ?? "";
    const ev = await apiCall<{
      status: string;
      lat: number | null;
      entranceNote: string | null;
      arrivals: { exhibitors: { from: string; strict: boolean } | null };
      posterSettings: { style: string; photoKey: string | null } | null;
      posterUrl: string | null;
      capacity: number | null;
      criteria: { countries: string[] } | null;
      slug: string;
    }>(damien, "GET", `/events/${id}`);
    expect(ev.data).toMatchObject({
      status: "draft",
      entranceNote: "Entrée par le quai Nord, barrière levée à 18 h",
      arrivals: { exhibitors: { from: "18:30", strict: true } },
      posterSettings: { style: "jdm" },
      capacity: 60,
      criteria: { countries: ["JP", "DE"] },
    });
    expect(ev.data.lat).not.toBeNull();
    expect(ev.data.posterSettings?.photoKey).toBeTruthy();
    expect(ev.data.posterUrl).toBeTruthy();
    const needs = await apiCall<{ trade: string; installAt: string | null }[]>(damien, "GET", `/events/${id}/needs`);
    expect(needs.data).toHaveLength(1);
    expect(needs.data[0]?.installAt).toBeTruthy();

    if (recurrent) {
      // Récurrent : la série naît à la fin, en brouillons.
      await page.getByRole("button", { name: "Brouillon" }).click();
      await page.waitForURL(/\/orga\/meditesportcar\/e\/[0-9a-f-]{36}/);
      const after = await apiCall<{ parentEventId?: string | null }[]>(
        damien,
        "GET",
        `/structures/${structureId}/events`,
      );
      const full = await Promise.all(
        after.data.map((e) =>
          apiCall<{ parentEventId: string | null }>(damien, "GET", `/events/${(e as { id: string }).id}`),
        ),
      );
      expect(full.filter((e) => e.data.parentEventId === id)).toHaveLength(2);
    } else if (!desktop) {
      // Aperçu : la page publique du brouillon, en lecture ; puis le brouillon rouvre sur « Tout est prêt » et se publie.
      await page.getByTestId("wizard-preview").click();
      await page.waitForURL(/\/e\/[^/?]+\?apercu=1/);
      await expect(page.getByTestId("draft-preview")).toBeVisible();
      await page.goto(`/orga/meditesportcar/e/${id}/modifier`);
      await expect(step).toContainText("Tout est prêt");
      await page.getByTestId("wizard-publish").click();
      await page.waitForURL(/publie=1/);
      expect((await apiCall<{ status: string }>(damien, "GET", `/events/${id}`)).data.status).toBe("published");
      // Un événement publié rouvre sur le temps demandé.
      await page.goto(`/orga/meditesportcar/e/${id}/modifier?temps=arrivees`);
      await expect(step).toContainText("Arrivées");
      await expect(page.getByTestId("wizard-save")).toHaveCount(0);
    } else {
      await page.getByRole("button", { name: "Brouillon" }).click();
      await page.waitForURL(/\/orga\/meditesportcar\/e\/[0-9a-f-]{36}/);
    }
    await ctx.close();
  });
}

test("brouillon sans adresse : le deuxième temps le retient, la saisie revient au bon temps", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "beton", false);
  const title = `Sans adresse ${unique()}`;
  await page.getByLabel("Date", { exact: true }).fill(parisDay(30));
  await page.getByLabel("Début").fill("10:00");
  await page.getByLabel("Fin").fill("12:00");
  await page.getByLabel("Titre").fill(title);
  await next(page, "Lieu");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-error")).toContainText("adresse et la ville");
  // Rien n'est encore enregistré côté serveur (l'API exige l'adresse) ; le navigateur garde la saisie et le temps.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId("wizard-restored")).toBeVisible();
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu");
  // Un brouillon complet rouvre sur « Tout est prêt » ; `?temps=` choisit le temps.
  await page.getByLabel("Adresse", { exact: true }).fill("Place de la Loge");
  await page.getByLabel("Ville").fill("Perpignan");
  await next(page, "Arrivées");
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const list = await apiCall<{ id: string; title: string }[]>(damien, "GET", `/structures/${structureId}/events`);
  const id = list.data.find((e) => e.title === title)?.id ?? "";
  expect(id).not.toBe("");
  await page.goto(`/orga/meditesportcar/e/${id}/modifier`);
  await expect(page.getByTestId("wizard-step")).toContainText("Tout est prêt");
  await page.goto(`/orga/meditesportcar/e/${id}/modifier?temps=reglement`);
  await expect(page.getByTestId("wizard-step")).toContainText("Règlement");
  await ctx.close();
});
