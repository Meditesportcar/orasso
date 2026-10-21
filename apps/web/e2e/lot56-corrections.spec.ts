import { siteLabels } from "@orasso/shared";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { whenRange } from "../app/lib/events-filter";
import { proPitchCard } from "../app/lib/pro-pitch";
import { apiCall, setTheme } from "./helpers";

// Corrections des relectures du lot 56 (21/10/2026). Les parties pures (fenêtre « ce week-end », carte « fiche en vrai »
// des pros, libellé du compteur) se testent sans navigateur ; le reste tourne sur le site et l'API lancés, base seedée.
const DESKTOP = { width: 1280, height: 900 } as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

test.describe("parties pures", () => {
  test("« ce week-end » ne remonte jamais avant maintenant", () => {
    // Mercredi 21/10/2026 12 h (Paris) : le samedi 24 à minuit, le dimanche 25 à 23 h 59 (changement d'heure la nuit
    // du 24 au 25 : minuit samedi = UTC+2, 23 h 59 dimanche = UTC+1).
    const wednesday = Date.parse("2026-10-21T10:00:00Z");
    expect(whenRange("weekend", wednesday)).toEqual({
      from: "2026-10-23T22:00:00.000Z",
      to: "2026-10-25T22:59:00.000Z",
    });
    // Samedi 24/10 à 10 h : déjà commencé, le début est maintenant.
    const saturday = Date.parse("2026-10-24T08:00:00Z");
    expect(whenRange("weekend", saturday).from).toBe(new Date(saturday).toISOString());
    // Dimanche 25/10 à 21 h (Paris, UTC+1) : le début est maintenant, jamais samedi minuit.
    const sundayEvening = Date.parse("2026-10-25T20:00:00Z");
    const sunday = whenRange("weekend", sundayEvening);
    expect(sunday.from).toBe(new Date(sundayEvening).toISOString());
    expect(sunday.to).toBe("2026-10-25T22:59:00.000Z");
    // Dimanche soir de printemps (heure d'été) : même règle.
    const springSunday = Date.parse("2027-03-28T18:00:00Z");
    expect(whenRange("weekend", springSunday).from).toBe(new Date(springSunday).toISOString());
    // Lundi : le week-end d'après.
    const monday = Date.parse("2026-10-26T09:00:00Z");
    expect(whenRange("weekend", monday).from).toBe("2026-10-30T23:00:00.000Z");
    expect(whenRange("weekend", monday).to).toBe("2026-11-01T22:59:00.000Z");
    // Le début ne passe jamais après la fin.
    for (const at of [wednesday, saturday, sundayEvening, springSunday, monday]) {
      const r = whenRange("weekend", at);
      expect(r.from <= r.to).toBe(true);
      expect(r.from >= new Date(at).toISOString()).toBe(true);
    }
  });

  test("« la fiche en vrai » : badge seulement si vérifié, remises réelles, exemple fictif marqué", () => {
    // Pro publié non vérifié, avec remises : pas de badge, ses remises seulement.
    const unverified = proPitchCard({ verified: false, discounts: { route: 7, circuit: 12 } });
    expect(unverified).toEqual({
      fictional: false,
      badge: false,
      discounts: [
        { grade: "route", percent: 7 },
        { grade: "circuit", percent: 12 },
      ],
    });
    // Pro vérifié sans aucune remise : badge, et surtout aucun pourcentage de présentation.
    const bare = proPitchCard({ verified: true, discounts: {} });
    expect(bare).toEqual({ fictional: false, badge: true, discounts: [] });
    expect(proPitchCard({ verified: false, discounts: { sport: null } }).discounts).toEqual([]);
    // Aucun pro publié : carte clairement fictive, avec les pourcentages de présentation, sans badge.
    const fiction = proPitchCard(null);
    expect(fiction.fictional).toBe(true);
    expect(fiction.badge).toBe(false);
    expect(fiction.discounts.map((d) => d.percent)).toEqual([5, 8, 10, 15]);
  });

  test("compteur : « N événements affichés »", () => {
    expect(siteLabels.events.shown(1)).toBe("1 événement affiché");
    expect(siteLabels.events.shown(60)).toBe("60 événements affichés");
    expect(siteLabels.events.shown(5)).toBe("5 événements affichés");
  });
});

test("pros : la carte d'exemple reflète le premier pro de l'annuaire (badge, remises) ou s'annonce fictive", async ({
  page,
}) => {
  const list = await apiCall<{ items: { slug: string }[] }>(null, "GET", "/pros?limit=1");
  const first = list.data.items[0];
  await setTheme(page, "beton");
  await page.setViewportSize(DESKTOP);
  await page.goto("/professionnels");
  const sample = page.getByTestId("pro-sample");
  await expect(sample).toBeVisible();
  if (!first) {
    await expect(page.getByTestId("pro-sample-fictional")).toHaveText("Exemple");
    return;
  }
  const pro = await apiCall<{ verified: boolean; discounts: Record<string, number | null> }>(
    null,
    "GET",
    `/pros/by-slug/${first.slug}`,
  );
  await expect(page.getByTestId("pro-sample-fictional")).toHaveCount(0);
  await expect(sample.getByText("Pro validé")).toHaveCount(pro.data.verified ? 1 : 0);
  const real = Object.values(pro.data.discounts).filter((v) => (v ?? 0) > 0).length;
  if (real === 0) {
    await expect(page.getByTestId("pro-sample-nodiscount")).toBeVisible();
    await expect(sample.locator(".w-discounts")).toHaveCount(0);
  } else {
    await expect(sample.locator(".w-discounts > div")).toHaveCount(real);
  }
});

test.describe("/evenements", () => {
  test("catégorie et dates d'un ancien lien : visibles, modifiables, gardées par le formulaire", async ({ page }) => {
    const categories = await apiCall<{ id: string; label: string }[]>(null, "GET", "/vehicle-reference/categories");
    const category = categories.data[0];
    if (!category) throw new Error("Aucune catégorie dans le seed");
    const from = iso(new Date(Date.now() - 86_400_000));
    const to = iso(new Date(Date.now() + 400 * 86_400_000));
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);

    // Une catégorie seule suffit à activer « Réinitialiser ».
    await page.goto(`/evenements?categorie=${category.id}`);
    await expect(page.getByTestId("pick-categorie")).toHaveValue(category.id);
    await expect(page.getByRole("link", { name: "Réinitialiser" })).toBeVisible();

    // Ancien lien complet : tout se voit.
    await page.goto(`/evenements?categorie=${category.id}&du=${from}&au=${to}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("more-filters")).toBeVisible();
    await expect(page.getByTestId("pick-categorie")).toHaveValue(category.id);
    await expect(page.getByLabel("À partir du")).toHaveValue(from);
    await expect(page.getByLabel("Jusqu'au")).toHaveValue(to);
    await expect(page.getByRole("link", { name: "Réinitialiser" })).toBeVisible();

    // Changer de format garde la catégorie et les dates.
    await page.getByTestId("pick-format").selectOption("exhibition");
    await page.waitForURL(/format=exhibition/);
    const url = new URL(page.url());
    expect(url.searchParams.get("categorie")).toBe(category.id);
    expect(url.searchParams.get("du")).toBe(from);
    expect(url.searchParams.get("au")).toBe(to);

    // Les dates se modifient depuis la page.
    await page.getByLabel("Jusqu'au").fill(iso(new Date(Date.now() + 200 * 86_400_000)));
    await page.waitForURL((u) => u.searchParams.get("au") !== to);
    await expect(page.getByLabel("À partir du")).toHaveValue(from);

    // Une fenêtre « quand » remplace les dates libres : elles se masquent.
    await page.getByTestId("pick-quand").selectOption("month");
    await page.waitForURL(/quand=month/);
    await expect(page.getByLabel("À partir du")).toHaveCount(0);

    // Réinitialiser repart de zéro.
    await page.getByRole("link", { name: "Réinitialiser" }).click();
    await page.waitForURL((u) => u.search === "");
    await expect(page.getByTestId("pick-categorie")).toHaveValue("");
  });

  test("le compteur dit « affichés » et suit les cartes de la page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/evenements");
    await page.waitForLoadState("networkidle");
    const tiles = await page.getByTestId("event-tile").count();
    await expect(page.getByTestId("events-count")).toContainText(siteLabels.events.shown(tiles));
    await expect(page.getByTestId("events-count")).not.toContainText("et plus");
  });

  test("affiche qui ne charge pas : gabarit Minimal daté, jamais un aplat vide ; la date reste un texte", async ({
    page,
  }) => {
    await page.route("**/api/files/events/**", (route) => route.abort());
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    await page.goto("/evenements");
    const first = page.getByTestId("event-tile").first();
    await expect(first.getByTestId("poster-minimal")).toHaveCount(1);
    // La souche datée est posée sur le gabarit de repli.
    await expect(first.locator(".w-card__stub")).toBeVisible();
    // La date est lisible en texte (jour de la semaine, jour, mois), même quand l'affiche ou la souche la dessinent.
    await expect(first.locator(".w-card__format")).toContainText(
      /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \p{L}+/u,
    );
  });

  test("affiche chargée : la date reste aussi dans le texte de la carte", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/evenements");
    await page.waitForLoadState("networkidle");
    const first = page.getByTestId("event-tile").first();
    await expect(first.locator(".w-card__format")).toContainText(
      /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \p{L}+/u,
    );
  });
});

test("fiche événement : une galerie sans adresse montre ses photos et s'ouvre dans la visionneuse", async ({
  page,
}) => {
  const slug = "nocturne-de-canet-2026";
  const ev = await apiCall<{ id: string; poster?: { postUrl?: string | null } | null }>(
    null,
    "GET",
    `/events/by-slug/${slug}`,
  );
  const events = await apiCall<{ items: { posterUrl: string | null }[] }>(null, "GET", "/events?limit=5");
  const key = events.data.items.map((i) => i.posterUrl?.replace(/^\/api\/files\//, "")).find(Boolean);
  if (!key) throw new Error("Aucune image du seed pour la galerie");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let contentId = "";
  try {
    const media = await client.query<{ id: string }>("select id from media_profiles where deleted_at is null limit 1");
    const mediaId = media.rows[0]?.id;
    if (!mediaId) throw new Error("Aucun profil média dans le seed");
    const inserted = await client.query<{ id: string }>(
      `insert into media_contents (media_profile_id, event_id, kind, title, url, platform, photo_keys)
       values ($1, $2, 'gallery', 'Galerie sans lien E2E', null, 'other', $3) returning id`,
      [mediaId, ev.data.id, [key, key]],
    );
    contentId = inserted.rows[0]?.id ?? "";
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    await page.goto(`/e/${slug}`);
    await page.waitForLoadState("networkidle");
    const content = page.getByTestId("media-content").filter({ hasText: "Galerie sans lien E2E" });
    await expect(content).toBeVisible();
    const thumbs = content.getByTestId("media-gallery").locator("li");
    await expect(thumbs).toHaveCount(2);
    await thumbs.first().locator("a").click();
    const viewer = page.getByTestId("gallery-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("img.w-gallery__big")).toBeVisible();
    await expect(viewer).toContainText("1 / 2");
    await viewer.getByRole("button", { name: "Suivante" }).click();
    await expect(viewer).toContainText("2 / 2");
    await viewer.getByRole("button", { name: "Fermer" }).click();
    await expect(viewer).toBeHidden();
  } finally {
    if (contentId) await client.query("delete from media_contents where id = $1", [contentId]);
    await client.end();
  }
});

test("bandeau des dates : pause au survol et au focus", async ({ page }) => {
  await setTheme(page, "beton");
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const track = page.locator(".w-ticker__track");
  await expect(track).toBeVisible();
  const state = () => track.evaluate((el) => getComputedStyle(el).animationPlayState);
  expect(await state()).toBe("running");
  await page.getByTestId("home-ticker").hover();
  expect(await state()).toBe("paused");
  await page.mouse.move(5, 5);
  await expect.poll(state).toBe("running");
  await page.locator(".w-ticker__group").first().locator("a").first().focus();
  expect(await state()).toBe("paused");
});
