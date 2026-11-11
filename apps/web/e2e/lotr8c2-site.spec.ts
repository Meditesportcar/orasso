import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8c2, côté site (`/app/fil`, API et site lancés sur la base seedée) : la phrase de chaque onglet et « Comment le Fil
// choisit » ; le rail « Ça plaît en ce moment » (« Abonnements » et « Autour de moi », jamais « Pour toi ») ; les cartes vues
// (envoi à l'API) puis « Tu es à jour » et « Déjà vu » ; la publication juste envoyée en tête avec son bandeau (et plus après
// un rechargement) ; la pastille « Nouvelles publications » ; les trois cartes rattachées du seed (« pour le », « présent au »,
// « était au » avec le tampon). Les mots sont ceux de la maquette R8.3 et R8.7.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r8c2-captures/apres/recette-site`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });

const PHRASES = {
  for_you: "Près de toi, chez ceux que tu suis, et pour tes sorties.",
  nearby: "À 80 km ou moins de chez toi : ce qui plaît, puis le plus récent.",
  following: "Ceux que tu suis : ce qui plaît, puis le plus récent.",
} as const;
type Filter = keyof typeof PHRASES;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function goFil(page: Page, width = 390, theme: "beton" | "sable" = "beton", email = "damien@orasso.local") {
  await page.setViewportSize({ width, height: 900 });
  await setTheme(page, theme);
  await loginInBrowser(page, email, undefined, "/app/fil");
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
}

async function tab(page: Page, filter: Filter) {
  await page.getByTestId(`fil-filters-${filter}`).click();
  await expect(page.getByTestId("fil-phrase")).toHaveText(PHRASES[filter]);
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
}

/** La carte d'un auteur dans l'onglet courant (on descend, « Voir la suite » au besoin). */
async function cardOf(page: Page, author: string, text?: string): Promise<Locator | null> {
  let card = page.getByTestId("feed-card-feed_post").filter({ hasText: author });
  if (text) card = card.filter({ hasText: text });
  card = card.first();
  for (let i = 0; i < 14; i++) {
    if (await card.isVisible().catch(() => false)) {
      await card.scrollIntoViewIfNeeded();
      return card;
    }
    const more = page.getByTestId("fil-more");
    if (await more.isVisible().catch(() => false)) await more.click();
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
  }
  return null;
}

test("la phrase de chaque onglet, et la fenêtre « Comment le Fil choisit »", async ({ page }) => {
  test.setTimeout(180_000);
  await goFil(page);
  for (const filter of ["for_you", "nearby", "following"] as const) await tab(page, filter);
  await tab(page, "for_you");
  await expect(page.getByRole("button", { name: "Comment le Fil choisit" })).toBeVisible();
  await page.getByTestId("fil-how-open").click();
  const how = page.getByTestId("fil-how");
  await expect(how).toBeVisible();
  await expect(how.getByRole("heading", { name: "Comment le Fil choisit" })).toBeVisible();
  for (const [filter, name] of [
    ["for_you", "Pour toi"],
    ["nearby", "Autour de moi"],
    ["following", "Abonnements"],
  ] as const) {
    const rule = page.getByTestId(`fil-how-${filter}`);
    await expect(rule).toContainText(name);
    await expect(rule).toContainText(PHRASES[filter]);
  }
  await expect(page.getByTestId("fil-how-for_you")).toContainText(
    "Une carte « Sponsorisé » environ toutes les 6 cartes.",
  );
  await expect(page.getByTestId("fil-how-nearby")).toContainText("Seulement des publications publiques.");
  await expect(page.getByTestId("fil-how-following")).toContainText("Tes propres publications y sont.");
  await expect(page.getByTestId("fil-how-mine")).toContainText("Ta publication");
  await expect(page.getByTestId("fil-how-mine")).toContainText(
    "Elle reprend sa place normale dès que tu quittes le Fil ou que tu actualises.",
  );
  await expect(page.getByTestId("fil-how-note")).toContainText(
    "Le Fil classe selon ce que tu suis, la distance, tes sorties, tes types de voitures, la fraîcheur et ce qui plaît. Rien d'autre : pas de vente de données.",
  );
  await shot(page, "feuille-comment-le-fil-choisit-390");
  await page.getByTestId("fil-how-ok").click();
  await expect(how).toBeHidden();
  // « Pourquoi je vois ça » d'une carte ne change pas.
  await page.getByTestId("feed-card-more").first().click();
  await expect(page.getByTestId("feed-menu-why")).toBeVisible();
});

test("le rail « Ça plaît en ce moment » : Abonnements et Autour de moi, jamais Pour toi", async ({ page }) => {
  test.setTimeout(180_000);
  await goFil(page);
  await tab(page, "for_you");
  await expect(page.getByTestId("fil-hot")).toHaveCount(0);
  await tab(page, "following");
  const hot = page.getByTestId("fil-hot");
  await expect(hot).toBeVisible();
  await expect(hot).toContainText("Ça plaît en ce moment");
  await expect(hot).toContainText("chez ceux que tu suis · 7 jours");
  expect(await page.getByTestId("fil-hot-tile").count()).toBeGreaterThan(0);
  await shot(page, "rail-abonnements-390");
  // Le rail défile au clavier : la liste prend le focus.
  await page.getByTestId("fil-hot-rail").focus();
  await expect(page.getByTestId("fil-hot-rail")).toBeFocused();
  await tab(page, "nearby");
  if (await page.getByTestId("fil-hot").count())
    await expect(page.getByTestId("fil-hot")).toContainText("près de chez toi · 7 jours");
  // Toucher une vignette ouvre la publication.
  await tab(page, "following");
  const href = await page.getByTestId("fil-hot-tile").first().getAttribute("href");
  expect(href).toMatch(/^\/app\/publication\/[0-9a-f-]{36}$/);
  await page.getByTestId("fil-hot-tile").first().click();
  await page.waitForURL(new RegExp(`${href}$`));
});

test("cartes vues : elles partent à l'API, puis « Tu es à jour » et « Déjà vu » au rechargement", async ({ page }) => {
  test.setTimeout(240_000);
  const sent: { cards: { id: string; action: string; at?: string }[] }[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/me/fil/seen")) {
      sent.push(req.postDataJSON() as (typeof sent)[number]);
    }
  });
  await goFil(page);
  await tab(page, "for_you");
  // On lit : chaque carte reste plus d'une seconde à l'écran.
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(1500);
  }
  await expect.poll(() => sent.length, { timeout: 40_000, intervals: [1_000] }).toBeGreaterThan(0);
  const all = sent.flatMap((b) => b.cards);
  expect(all.length).toBeGreaterThan(0);
  expect(all.length).toBeLessThanOrEqual(50 * sent.length);
  for (const c of all) {
    expect(c.id).toMatch(/^[a-z_]+:[0-9a-f-]{36}$/);
    expect(c.id.startsWith("sponsored:")).toBe(false);
    expect(["view", "open", "share"]).toContain(c.action);
  }
  expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  // Au rechargement : une frontière « Tu es à jour », puis « Déjà vu » ; les cartes avant elle ne sont pas atténuées.
  await page.reload();
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  // Les cartes vues sont rangées à la fin du parcours : on tourne les pages jusqu'à la frontière.
  for (let i = 0; i < 30 && !(await page.getByTestId("fil-uptodate").count()); i++) {
    const more = page.getByTestId("fil-more");
    if (!(await more.isVisible().catch(() => false))) break;
    await more.click();
    await page.waitForTimeout(500);
  }
  const upToDate = page.getByTestId("fil-uptodate");
  await expect(upToDate).toHaveCount(1);
  await expect(upToDate).toContainText("Tu es à jour");
  await expect(upToDate).toContainText(
    "Tu as vu les nouveautés : elles ne reviennent pas en haut. Tire vers le bas pour actualiser.",
  );
  await expect(page.getByTestId("fil-seen-heading")).toHaveText("Déjà vu");
  await upToDate.scrollIntoViewIfNeeded();
  await shot(page, "tu-es-a-jour-390");
  const order = await page
    .getByTestId("fil-list")
    .locator(".fil-item, [data-testid='fil-uptodate']")
    .evaluateAll((els) =>
      els.map((e) => (e.classList.contains("is-seen") ? "seen" : (e.getAttribute("data-testid") ?? "card"))),
    );
  const firstSeen = order.indexOf("seen");
  expect(firstSeen).toBeGreaterThan(0);
  expect(order.slice(0, firstSeen)).not.toContain("seen");
  expect(order.slice(firstSeen).every((x) => x === "seen")).toBe(true);
});

test("la publication juste envoyée : en tête avec son bandeau, puis plus après un rechargement", async ({ page }) => {
  test.setTimeout(240_000);
  const caption = `R8c2 site ${unique()}`;
  await setTheme(page, "beton");
  await page.setViewportSize({ width: 390, height: 900 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible();
  await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  await page.getByTestId("fil-publish-caption").fill(caption);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("fil-publish-back").click();
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  const banner = page.getByTestId("fil-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Publié sur ton profil.");
  await expect(banner).toContainText("Tes abonnés la verront dans leur Fil.");
  await expect(page.getByTestId("fil-banner-profile")).toHaveText(/Voir sur mon profil/);
  await expect(page.getByTestId("fil-banner-profile")).toHaveAttribute("href", "/app/moi?onglet=publications");
  await expect(page.getByTestId("feed-card-feed_post").first()).toContainText(caption);
  await shot(page, "bandeau-publication-390");
  // « Fermer le bandeau » : le bandeau part, la carte reste en tête.
  await page.getByRole("button", { name: "Fermer le bandeau" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId("feed-card-feed_post").first()).toContainText(caption);
  // Un rechargement : plus de bandeau, la carte reprend sa place normale.
  await page.reload();
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fil-banner")).toHaveCount(0);
  // Elle est aussi dans « Abonnements » (mes publications), à sa date.
  await tab(page, "following");
  await expect(page.getByTestId("feed-card-feed_post").first()).toContainText(caption);
});

test("la pastille « Nouvelles publications » : elle apparaît, la toucher actualise et remonte", async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  let asked = 0;
  await page.route("**/api/fil/fresh**", async (route) => {
    asked += 1;
    await route.fulfill({ json: { count: 3 }, headers: { "cache-control": "no-store" } });
  });
  await goFil(page);
  await expect(page.getByTestId("fil-fresh")).toHaveCount(0);
  await page.clock.runFor(61_000);
  await expect(page.getByTestId("fil-fresh")).toBeVisible();
  await expect(page.getByTestId("fil-fresh")).toContainText("Nouvelles publications");
  expect(asked).toBeGreaterThan(0);
  const url = new URL(asked ? "http://x/?q" : "http://x/");
  expect(url).toBeTruthy();
  await shot(page, "pastille-390");
  await page.getByTestId("fil-fresh").click();
  await expect(page.getByTestId("fil-fresh")).toHaveCount(0);
  await expect(page.getByTestId("fil-list")).toBeVisible();
});

test("la nouveauté vue de l'API : count borné, depuis le ref de la page", async () => {
  const cookie = await login("damien@orasso.local");
  const page1 = await apiCall<{ ref: string; items: unknown[] }>(cookie, "GET", "/fil?filter=for_you");
  expect(page1.status).toBe(200);
  const fresh = await apiCall<{ count: number }>(
    cookie,
    "GET",
    `/fil/fresh?filter=for_you&since=${encodeURIComponent(page1.data.ref)}`,
  );
  expect(fresh.status).toBe(200);
  expect(fresh.data.count).toBeGreaterThanOrEqual(0);
  expect(fresh.data.count).toBeLessThanOrEqual(20);
});

for (const width of [390, 1280]) {
  test(`les trois cartes rattachées du seed (${width} px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await goFil(page, width);
    const wanted = [
      {
        author: "Roues Libres 66",
        event: "Rassemblement du Lydia",
        verb: /^pour le Rassemblement du Lydia · /,
        stamp: false,
        see: true,
      },
      {
        author: "La Brasa",
        event: "Rassemblement du Lydia",
        verb: /^présent au Rassemblement du Lydia · /,
        stamp: false,
        see: false,
      },
      // Le seed : Kenji_66 était à la « Nocturne de rentrée » (féminin : « à la »), présence validée : le tampon.
      {
        author: "Kenji_66",
        event: "Nocturne de rentrée",
        verb: /^était à la Nocturne de rentrée · /,
        stamp: true,
        see: false,
      },
      // Un passionné pendant l'événement : « est au », sans tampon (présence non validée).
      {
        author: "Marc_66",
        event: "Rassemblement du Lydia",
        verb: /^est au Rassemblement du Lydia · /,
        stamp: false,
        see: false,
      },
    ];
    for (const w of wanted) {
      let card: Locator | null = null;
      for (const filter of ["following", "for_you", "nearby"] as const) {
        await tab(page, filter);
        card = await cardOf(page, w.author, w.event);
        if (card && (await card.getByTestId("feed-attach").count())) break;
        card = null;
      }
      expect(card, `carte de ${w.author}`).not.toBeNull();
      const attach = (card as Locator).getByTestId("feed-attach").first();
      await expect(attach).toBeVisible();
      const text = (await (card as Locator).getByTestId("feed-attach-text").first().textContent()) ?? "";
      expect(text).toMatch(w.verb);
      expect(text).toMatch(/· (dim|lun|mar|mer|jeu|ven|sam)\. \d{1,2} \S+$/);
      await expect((card as Locator).getByTestId("feed-attach-stamp")).toHaveCount(w.stamp ? 1 : 0);
      await expect((card as Locator).getByTestId("feed-attach-see")).toHaveCount(w.see ? 1 : 0);
      // La ligne est la deuxième : sous l'en-tête, avant les photos.
      const head = await (card as Locator).locator("header").boundingBox();
      const line = await attach.boundingBox();
      expect((line?.y ?? 0) >= (head?.y ?? 0) + (head?.height ?? 0) - 1).toBe(true);
      await shot(page, `carte-rattachee-${w.author.replaceAll(" ", "-")}-${width}`);
    }
    // Toute la ligne ouvre la fiche de l'événement.
    const card = (await cardOf(page, "Kenji_66", "Nocturne de rentrée")) as Locator;
    await Promise.all([page.waitForURL(/\/e\/[^/]+$/), card.getByTestId("feed-attach").first().click()]);
  });
}

for (const theme of ["beton", "sable"] as const) {
  test(`captures du Fil, rail et phrase (${theme})`, async ({ page }) => {
    test.setTimeout(180_000);
    await goFil(page, 1280, theme);
    await tab(page, "following");
    await shot(page, `abonnements-${theme}-1280`);
  });
}
