import { siteLabels } from "@orasso/shared";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { REPRISE_STATEMENTS } from "../../api/src/modules/albums/reprise";
import { categoryOptions, nearOutcome, whenRange } from "../app/lib/events-filter";
import { proPitchCard } from "../app/lib/pro-pitch";
import { apiCall, loginInBrowser, setTheme } from "./helpers";

// Corrections des relectures du lot 56 (21/10/2026). Les parties pures (fenêtre « ce week-end », carte « fiche en vrai »
// des pros, libellé du compteur) se testent sans navigateur ; le reste tourne sur le site et l'API lancés, base seedée.
const DESKTOP = { width: 1280, height: 900 } as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lot R9e : une galerie d'avant (ligne `media_contents` de kind « gallery ») devient un album publié par la reprise (les mêmes
 * instructions que la migration, rejouées ici : la galerie de la recette est créée après les migrations) ; la façade la sert depuis
 * l'album, au même identifiant.
 */
async function adoptGallery(client: pg.Client): Promise<void> {
  for (const statement of REPRISE_STATEMENTS) await client.query(statement);
}
/** Efface la galerie de la recette et l'album qu'elle est devenue (les photos suivent, `on delete cascade`). */
async function dropGallery(client: pg.Client, id: string): Promise<void> {
  await client.query("delete from event_albums where id = $1", [id]);
  await client.query("delete from media_contents where id = $1", [id]);
}
/** Deux images du seed distinctes (une clé de stockage ne sert qu'à une photo d'album). */
function twoKeys(items: { posterUrl: string | null }[]): [string, string] {
  const keys = [
    ...new Set(items.map((i) => i.posterUrl?.replace(/^\/api\/files\//, "")).filter((k): k is string => Boolean(k))),
  ];
  const [a, b] = keys;
  if (!a || !b) throw new Error("Deux images du seed sont nécessaires pour la galerie");
  return [a, b];
}

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
    expect(proPitchCard({ verified: false, discounts: { sport: 0 } }).discounts).toEqual([]);
    // Aucun pro publié : carte clairement fictive, avec les pourcentages de présentation, sans badge.
    const fiction = proPitchCard(null);
    expect(fiction.fictional).toBe(true);
    expect(fiction.badge).toBe(false);
    expect(fiction.discounts.map((d) => d.percent)).toEqual([5, 8, 10, 15]);
  });

  test("menu de catégorie : la catégorie active reste choisissable, listée ou non, référentiel en échec ou non", () => {
    const labels = { all: "toutes", unlisted: "non listée", unavailable: "indisponible" };
    const list = [{ id: "a", label: "JDM" }];
    expect(categoryOptions(list, "", false, labels)).toEqual([
      { value: "", label: "toutes" },
      { value: "a", label: "JDM" },
    ]);
    // Catégorie désactivée (absente du référentiel qui répond) : gardée, marquée « non listée ».
    expect(categoryOptions(list, "z", false, labels).at(-1)).toEqual({ value: "z", label: "non listée" });
    // Référentiel en échec : la catégorie active reste là, marquée « liste indisponible ».
    expect(categoryOptions([], "z", true, labels)).toEqual([
      { value: "", label: "toutes" },
      { value: "z", label: "indisponible" },
    ]);
    // Référentiel en échec sans catégorie active : rien à montrer que « toutes ».
    expect(categoryOptions([], "", true, labels)).toHaveLength(1);
  });

  test("accueil : un appel départemental en erreur (503) n'est pas un résultat vide", () => {
    expect(nearOutcome(null)).toBe("none");
    expect(nearOutcome({ ok: false, count: 0 })).toBe("failed");
    expect(nearOutcome({ ok: true, count: 0 })).toBe("empty");
    expect(nearOutcome({ ok: true, count: 3 })).toBe("found");
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

  test("Retour / Suivant du navigateur : catégorie et dates suivent les critères rétablis", async ({ page }) => {
    const categories = await apiCall<{ id: string; label: string }[]>(null, "GET", "/vehicle-reference/categories");
    const category = categories.data[0];
    if (!category) throw new Error("Aucune catégorie dans le seed");
    const from = iso(new Date(Date.now() - 86_400_000));
    const to = iso(new Date(Date.now() + 400 * 86_400_000));
    const otherTo = iso(new Date(Date.now() + 200 * 86_400_000));
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    await page.goto(`/evenements?categorie=${category.id}&du=${from}&au=${to}`);
    await page.waitForLoadState("networkidle");
    const pick = page.getByTestId("pick-categorie");
    const dateTo = page.getByLabel("Jusqu'au");
    await expect(pick).toHaveValue(category.id);
    // 1) La catégorie est retirée, 2) la date de fin change.
    await pick.selectOption("");
    await page.waitForURL((u) => !u.searchParams.get("categorie"));
    await dateTo.fill(otherTo);
    await page.waitForURL((u) => u.searchParams.get("au") === otherTo);
    await expect(dateTo).toHaveValue(otherTo);
    // Retour : la date de fin d'avant, la catégorie toujours retirée.
    await page.goBack();
    await page.waitForURL((u) => u.searchParams.get("au") === to && !u.searchParams.get("categorie"));
    await expect(dateTo).toHaveValue(to);
    await expect(pick).toHaveValue("");
    // Retour encore : la catégorie revient.
    await page.goBack();
    await page.waitForURL((u) => u.searchParams.get("categorie") === category.id);
    await expect(pick).toHaveValue(category.id);
    await expect(dateTo).toHaveValue(to);
    // Suivant : la catégorie repart, les champs suivent.
    await page.goForward();
    await page.waitForURL((u) => !u.searchParams.get("categorie"));
    await expect(pick).toHaveValue("");
    // La soumission suivante part des critères affichés (date de fin d'avant, pas celle modifiée).
    await page.getByTestId("pick-format").selectOption("exhibition");
    await page.waitForURL(/format=exhibition/);
    expect(new URL(page.url()).searchParams.get("au")).toBe(to);
  });

  test("Retour pendant la requête : la catégorie choisie ne survit pas, même si la valeur du loader est identique", async ({
    page,
  }) => {
    const categories = await apiCall<{ id: string; label: string }[]>(null, "GET", "/vehicle-reference/categories");
    const category = categories.data[0];
    if (!category) throw new Error("Aucune catégorie dans le seed");
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    await page.goto("/evenements");
    await page.waitForLoadState("networkidle");
    // Deuxième page sans catégorie.
    await page.getByTestId("pick-quand").selectOption("weekend");
    await page.waitForURL(/quand=weekend/);
    await page.waitForLoadState("networkidle");
    const pick = page.getByTestId("pick-categorie");
    await expect(pick).toHaveValue("");
    // Les réponses du loader sont retardées : la catégorie est choisie, puis Retour avant toute réponse.
    let delayed = true;
    await page.route(/\.data/, async (route) => {
      if (delayed) await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await pick.selectOption(category.id);
    await page.goBack();
    delayed = false;
    await page.waitForURL((u) => !u.searchParams.get("quand") && !u.searchParams.get("categorie"));
    await page.waitForLoadState("networkidle");
    await expect(pick).toHaveValue("");
    // La soumission suivante ne réapplique pas la catégorie.
    await page.getByTestId("pick-format").selectOption("exhibition");
    await page.waitForURL(/format=exhibition/);
    expect(new URL(page.url()).searchParams.get("categorie") ?? "").toBe("");
  });

  test("catégorie du lien absente du référentiel : affichée, gardée par les autres filtres", async ({ page }) => {
    const ghost = "00000000-0000-4000-8000-000000000000";
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    await page.goto(`/evenements?categorie=${ghost}`);
    await page.waitForLoadState("networkidle");
    const pick = page.getByTestId("pick-categorie");
    await expect(pick).toHaveValue(ghost);
    await expect(pick.locator("option:checked")).toHaveText(siteLabels.events.categoryUnlisted);
    await expect(page.getByRole("link", { name: "Réinitialiser" })).toBeVisible();
    await page.getByTestId("pick-format").selectOption("exhibition");
    await page.waitForURL(/format=exhibition/);
    expect(new URL(page.url()).searchParams.get("categorie")).toBe(ghost);
    await expect(page.getByTestId("pick-categorie")).toHaveValue(ghost);
  });

  test("affiche en échec puis remplacée par une adresse valide, sans démontage de la carte", async ({ page }) => {
    const list = await apiCall<{ items: { id: string; generatedPosterUrl: string | null }[] }>(
      null,
      "GET",
      "/events?limit=20",
    );
    const withPoster = list.data.items.filter((e) => e.generatedPosterUrl);
    const broken = withPoster[0]?.generatedPosterUrl;
    const fixed = withPoster.find((e) => e.generatedPosterUrl !== broken)?.generatedPosterUrl;
    if (!broken || !fixed) throw new Error("Deux affiches générées différentes attendues dans le seed");
    await page.route(`**${broken}`, (route) => route.abort());
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    await page.goto("/evenements");
    await page.waitForLoadState("networkidle");
    const tile = page
      .getByTestId("event-tile")
      .filter({ has: page.getByTestId("poster-minimal") })
      .first();
    await expect(tile).toBeVisible();
    await expect(tile.locator(".w-card__stub")).toBeVisible();
    await tile.evaluate((el) => el.setAttribute("data-same-node", "1"));
    // La navigation suivante (même carte, même clé) revient avec une autre adresse d'affiche.
    await page.route("**/*.data*", async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).split(broken).join(fixed);
      await route.fulfill({
        status: res.status(),
        headers: { "content-type": res.headers()["content-type"] ?? "text/x-script" },
        body,
      });
    });
    await page.getByRole("button", { name: siteLabels.events.apply }).click();
    const same = page.locator('[data-same-node="1"]');
    await expect(same.locator(`img.w-card__img[src="${fixed}"]`)).toBeVisible();
    await expect(same.getByTestId("poster-minimal")).toHaveCount(0);
    await expect(same.locator(".w-card__stub")).toHaveCount(0);
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

test("fiche événement : une galerie sans adresse est un album de la section « Photos » et s'ouvre dans la visionneuse", async ({
  page,
}) => {
  const slug = "nocturne-de-canet-2026";
  const ev = await apiCall<{ id: string; poster?: { postUrl?: string | null } | null }>(
    null,
    "GET",
    `/events/by-slug/${slug}`,
  );
  const events = await apiCall<{ items: { posterUrl: string | null }[] }>(null, "GET", "/events?limit=5");
  const keys = twoKeys(events.data.items);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let contentId = "";
  let accreditationId = "";
  try {
    const media = await client.query<{ id: string; user_id: string }>(
      "select id, user_id from media_profiles where deleted_at is null limit 1",
    );
    const mediaId = media.rows[0]?.id;
    if (!mediaId) throw new Error("Aucun profil média dans le seed");
    // R9g : la fiche ne montre l'album que d'un média accrédité maintenant à l'événement (la galerie d'avant n'avait pas cette condition).
    const accreditation = await client.query<{ id: string }>(
      `insert into applications (event_id, user_id, kind, media_profile_id, media_formats, status, rules_accepted_at, follow_structure)
       values ($1, $2, 'media', $3, array['photo'], 'accepted', now(), false) on conflict do nothing returning id`,
      [ev.data.id, media.rows[0]?.user_id, mediaId],
    );
    accreditationId = accreditation.rows[0]?.id ?? "";
    const inserted = await client.query<{ id: string }>(
      `insert into media_contents (media_profile_id, event_id, kind, title, url, platform, photo_keys)
       values ($1, $2, 'gallery', 'Galerie sans lien E2E', null, 'other', $3) returning id`,
      [mediaId, ev.data.id, keys],
    );
    contentId = inserted.rows[0]?.id ?? "";
    await adoptGallery(client);
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    // L'album ouvert est réservé aux membres : la recette se connecte (Damien) avant d'ouvrir la fiche.
    await loginInBrowser(page, "damien@orasso.local", undefined, `/e/${slug}`);
    await page.waitForLoadState("networkidle");
    // R9g : la galerie est un album de la section « Photos » (elle n'a plus de visionneuse sur la fiche) ; « Voir l'album » l'ouvre.
    const card = page.getByTestId("event-photos-album").filter({ hasText: "Galerie sans lien E2E" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("2 photos");
    await card.getByTestId("event-photos-open").click();
    await page.waitForURL(new RegExp(`/albums/${contentId}`));
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(2);
    await page.getByTestId("media-gallery-photo").first().click();
    const viewer = page.getByTestId("media-gallery-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer).toContainText("1 / 2");
    await viewer.getByRole("button", { name: "Photo suivante" }).click();
    await expect(viewer).toContainText("2 / 2");
    await viewer.getByRole("button", { name: "Fermer" }).click();
    await expect(viewer).toBeHidden();
  } finally {
    if (contentId) await dropGallery(client, contentId);
    if (accreditationId) await client.query("delete from applications where id = $1", [accreditationId]);
    await client.end();
  }
});

test("fiche événement : la vue de l'album est comptée à l'ouverture depuis la fiche, et réessayée après un échec", async ({
  page,
}) => {
  const events = await apiCall<{ items: { posterUrl: string | null }[] }>(null, "GET", "/events?limit=5");
  const slug = "nocturne-de-canet-2026";
  const keys = twoKeys(events.data.items);
  const ev = await apiCall<{ id: string }>(null, "GET", `/events/by-slug/${slug}`);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let contentId = "";
  let accreditationId = "";
  try {
    const media = await client.query<{ id: string; user_id: string }>(
      "select id, user_id from media_profiles where deleted_at is null limit 1",
    );
    const mediaId = media.rows[0]?.id;
    if (!mediaId) throw new Error("Aucun profil média dans le seed");
    const accreditation = await client.query<{ id: string }>(
      `insert into applications (event_id, user_id, kind, media_profile_id, media_formats, status, rules_accepted_at, follow_structure)
       values ($1, $2, 'media', $3, array['photo'], 'accepted', now(), false) on conflict do nothing returning id`,
      [ev.data.id, media.rows[0]?.user_id, mediaId],
    );
    accreditationId = accreditation.rows[0]?.id ?? "";
    const inserted = await client.query<{ id: string }>(
      `insert into media_contents (media_profile_id, event_id, kind, title, url, platform, photo_keys)
       values ($1, $2, 'gallery', 'Galerie retentée E2E', null, 'other', $3) returning id`,
      [mediaId, ev.data.id, keys],
    );
    contentId = inserted.rows[0]?.id ?? "";
    await adoptGallery(client);
    await setTheme(page, "beton");
    await page.setViewportSize(DESKTOP);
    const calls: number[] = [];
    await page.route(/\/api\/media-contents\/[^/]+\/view$/, async (route) => {
      calls.push(Date.now());
      if (calls.length === 1) await route.fulfill({ status: 503, body: "" });
      else await route.continue();
    });
    await loginInBrowser(page, "damien@orasso.local", undefined, `/e/${slug}`);
    await page.waitForLoadState("networkidle");
    // Aucune vue au chargement de la fiche.
    expect(calls).toHaveLength(0);
    const open = () =>
      page
        .getByTestId("event-photos-album")
        .filter({ hasText: "Galerie retentée E2E" })
        .getByTestId("event-photos-open");
    // Une vue à l'ouverture ; le premier appel échoue (503), l'album s'ouvre quand même.
    await open().click();
    await page.waitForURL(new RegExp(`/albums/${contentId}`));
    await expect.poll(() => calls.length).toBe(1);
    // Nouvelle ouverture depuis la fiche : l'appel est retenté, et réussit.
    await page.goto(`/e/${slug}`);
    await page.waitForLoadState("networkidle");
    expect(calls).toHaveLength(1);
    await open().click();
    await page.waitForURL(new RegExp(`/albums/${contentId}`));
    await expect.poll(() => calls.length).toBe(2);
    const counted = await client.query<{ views: number }>("select views from event_albums where id = $1", [contentId]);
    expect(counted.rows[0]?.views).toBe(1);
  } finally {
    if (contentId) await dropGallery(client, contentId);
    if (accreditationId) await client.query("delete from applications where id = $1", [accreditationId]);
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
