import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { SEED_PASSWORD, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8c2, côté appli (version web compilée de recette, `APP_URL`) : la phrase de chaque onglet et la feuille « Comment le Fil
// choisit » ; le rail « Ça plaît en ce moment » (« Abonnements » et « Autour de moi », jamais « Pour toi ») ; les cartes vues
// (envoi à l'API) puis « Tu es à jour » et « Déjà vu » ; la publication juste envoyée en tête avec son bandeau, qui repart quand
// on quitte le Fil ; la pastille « Nouvelles publications » ; les cartes rattachées du seed ; le Fil hors ligne (la copie gardée,
// sans rendez-vous au spot ni sponsorisé, et le retour du réseau). Les mots sont ceux de la maquette R8.3 et R8.7.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8c2-captures/apres/recette-appli`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const PHRASES = {
  for_you: "Près de toi, chez ceux que tu suis, et pour tes sorties.",
  nearby: "À 80 km ou moins de chez toi : ce qui plaît, puis le plus récent.",
  following: "Ceux que tu suis : ce qui plaît, puis le plus récent.",
} as const;
type Filter = keyof typeof PHRASES;

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(
  browser: Browser,
  email = "damien@orasso.local",
  theme = "beton",
  size: { scale?: number; width?: number } = {},
) {
  const ctx = await browser.newContext({ viewport: { width: size.width ?? 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, scale]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(scale) > 1) localStorage.setItem("orasso.recette.echellePolice", String(scale));
    },
    [theme, size.scale ?? 1] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function goFil(page: Page, filter: Filter = "for_you") {
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await tab(page, filter);
}

async function tab(page: Page, filter: Filter) {
  await page.getByTestId(`fil-filters-${filter}`).click();
  await expect(page.getByTestId("fil-phrase")).toHaveText(PHRASES[filter]);
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** La carte d'un auteur dans l'onglet courant (on descend, « Voir la suite » au besoin). */
async function cardOf(page: Page, author: string, text?: string): Promise<Locator | null> {
  let card = page.getByTestId("feed-card-feed_post").filter({ hasText: author });
  if (text) card = card.filter({ hasText: text });
  card = card.first();
  for (let i = 0; i < 16; i++) {
    if (await card.isVisible().catch(() => false)) {
      await card.scrollIntoViewIfNeeded();
      return card;
    }
    const more = page.getByTestId("fil-more");
    if (await more.isVisible().catch(() => false)) await more.click();
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(300);
  }
  return null;
}

test("la phrase de chaque onglet, et la feuille « Comment le Fil choisit »", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser);
  await goFil(page);
  for (const filter of ["nearby", "following", "for_you"] as const) await tab(page, filter);
  await expect(page.getByRole("button", { name: "Comment le Fil choisit" })).toBeVisible();
  await page.getByTestId("fil-how-open").click();
  await expect(page.getByTestId("fil-how-ok")).toBeVisible();
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
  await shot(page, "feuille-comment-le-fil-choisit-384");
  await page.getByTestId("fil-how-ok").click();
  await expect(page.getByTestId("fil-how-ok")).toBeHidden();
  // « Pourquoi je vois ça » d'une carte ne change pas.
  await page.getByTestId("feed-card-more").first().click();
  await expect(page.getByText("Pourquoi je vois ça").first()).toBeVisible();
  await ctx.close();
});

test("le rail « Ça plaît en ce moment » : Abonnements et Autour de moi, jamais Pour toi", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser);
  await goFil(page);
  await expect(page.getByTestId("fil-hot")).toHaveCount(0);
  await tab(page, "following");
  const hot = page.getByTestId("fil-hot");
  await expect(hot).toBeVisible();
  await expect(hot).toContainText("Ça plaît en ce moment");
  await expect(hot).toContainText("chez ceux que tu suis · 7 jours");
  expect(await page.getByTestId("fil-hot-tile").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("fil-hot-tile").first()).toContainText(/\d/);
  await shot(page, "rail-abonnements-384");
  await tab(page, "nearby");
  if (await page.getByTestId("fil-hot").count())
    await expect(page.getByTestId("fil-hot")).toContainText("près de chez toi · 7 jours");
  await tab(page, "following");
  // Toucher une vignette ouvre la publication.
  await page.getByTestId("fil-hot-tile").first().click();
  await page.waitForURL(/\/publication\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await ctx.close();
});

test("cartes vues : elles partent à l'API, puis « Tu es à jour » et « Déjà vu » au rechargement", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser);
  const sent: { cards: { id: string; action: string; at?: string }[] }[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/me/fil/seen"))
      sent.push(req.postDataJSON() as (typeof sent)[number]);
  });
  await goFil(page);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(1500);
  }
  await expect.poll(() => sent.length, { timeout: 40_000, intervals: [1_000] }).toBeGreaterThan(0);
  const all = sent.flatMap((b) => b.cards);
  expect(all.length).toBeGreaterThan(0);
  for (const c of sent) expect(c.cards.length).toBeLessThanOrEqual(50);
  for (const c of all) {
    expect(c.id).toMatch(/^[a-z_]+:[0-9a-f-]{36}$/);
    expect(c.id.startsWith("sponsored:")).toBe(false);
    expect(["view", "open", "share"]).toContain(c.action);
    expect(typeof c.at).toBe("string");
  }
  expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  // Un rechargement de la liste : la frontière « Tu es à jour », puis « Déjà vu », les cartes vues atténuées.
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 30 && !(await page.getByTestId("fil-uptodate").count()); i++) {
    const more = page.getByTestId("fil-more");
    if (!(await more.isVisible().catch(() => false))) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(300);
      if (!(await more.isVisible().catch(() => false))) continue;
    }
    await more.scrollIntoViewIfNeeded();
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
  await shot(page, "tu-es-a-jour-384");
  expect(await page.getByTestId("fil-card-seen").count()).toBeGreaterThan(0);
  await ctx.close();
});

test("la publication juste envoyée : en tête avec son bandeau, qui repart quand on quitte le Fil", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const caption = `R8c2 appli ${unique()}`;
  const { ctx, page } = await open(browser, "damien@orasso.local", "beton", { width: 390 });
  await goFil(page, "following");
  await page.getByTestId("fil-publish-open").click();
  await page.getByTestId("fil-publish-choose-post").click();
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-photo").nth(0).click();
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
  await expect(page.getByTestId("fil-banner-profile")).toContainText("Voir sur mon profil");
  await expect(page.getByTestId("feed-card-feed_post").first()).toContainText(caption);
  await shot(page, "bandeau-publication-390");
  // « Fermer le bandeau » : le bandeau part, la carte reste en tête.
  await page.getByRole("button", { name: "Fermer le bandeau" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId("feed-card-feed_post").first()).toContainText(caption);
  // « Voir sur mon profil » (bandeau rouvert par une nouvelle lecture ? non : on quitte le Fil) : l'onglet « Publications ».
  await page.getByRole("tab", { name: /Accueil/i }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  await page.getByRole("tab", { name: /Le Fil/i }).click();
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fil-banner")).toHaveCount(0);
  await ctx.close();
});

test("la pastille « Nouvelles publications » : elle apparaît, la toucher actualise", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser);
  await page.clock.install();
  let asked = 0;
  await page.route("**/api/fil/fresh**", async (route) => {
    asked += 1;
    expect(route.request().url()).toMatch(/since=/);
    await route.fulfill({ json: { count: 3 }, headers: { "cache-control": "no-store" } });
  });
  await goFil(page);
  await expect(page.getByTestId("fil-fresh")).toHaveCount(0);
  await page.clock.runFor(61_000);
  await expect(page.getByTestId("fil-fresh")).toBeVisible();
  await expect(page.getByTestId("fil-fresh")).toContainText("Nouvelles publications");
  expect(asked).toBeGreaterThan(0);
  await shot(page, "pastille-384");
  await page.getByTestId("fil-fresh").click();
  await expect(page.getByTestId("fil-fresh")).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("les cartes rattachées du seed : « pour le », « présent au », « était à la » avec le tampon", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "damien@orasso.local", "beton", { width: 390 });
  await goFil(page, "following");
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
    {
      author: "Kenji_66",
      event: "Nocturne de rentrée",
      verb: /^était à la Nocturne de rentrée · /,
      stamp: true,
      see: false,
    },
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
    const c = card as Locator;
    await expect(c.getByTestId("feed-attach").first()).toBeVisible();
    const text = (await c.getByTestId("feed-attach-text").first().textContent()) ?? "";
    expect(text).toMatch(w.verb);
    expect(text).toMatch(/· (dim|lun|mar|mer|jeu|ven|sam)\. \d{1,2} \S+$/);
    await expect(c.getByTestId("feed-attach-stamp")).toHaveCount(w.stamp ? 1 : 0);
    await expect(c.getByTestId("feed-attach-see")).toHaveCount(w.see ? 1 : 0);
    // La ligne est sous l'en-tête (la deuxième ligne), avant les photos.
    const line = await c.getByTestId("feed-attach").first().boundingBox();
    const photos = await c.getByTestId("feed-post-photos").boundingBox();
    expect((line?.y ?? 0) < (photos?.y ?? 0)).toBe(true);
    await shot(page, `carte-rattachee-${w.author.replaceAll(" ", "-")}-390`);
  }
  // Toute la ligne ouvre la fiche de l'événement.
  await tab(page, "following");
  const kenji = (await cardOf(page, "Kenji_66", "Nocturne de rentrée")) as Locator;
  await kenji.getByTestId("feed-attach").first().click();
  await page.waitForURL(/\/e\/[^/]+/, { timeout: 30_000 });
  await ctx.close();
});

test("hors ligne : la copie gardée, sans rendez-vous au spot ni sponsorisé ; le retour du réseau", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "damien@orasso.local", "beton", { width: 390 });
  await goFil(page, "for_you");
  // Hors ligne, la première photo des cartes de la copie s'affiche : elle est gardée dès qu'elle est reçue en ligne.
  const firstPhoto = page
    .getByTestId("feed-card-feed_post")
    .first()
    .getByTestId("feed-post-photos")
    .locator("img")
    .first();
  await expect(firstPhoto).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tab(page, "nearby");
  await tab(page, "following");
  const onlineFirst = await page.getByTestId("feed-card-feed_post").first().textContent();
  // Ce que l'appareil a gardé : 40 cartes au plus par onglet, jamais un rendez-vous au spot ni une carte sponsorisée.
  const stored = await page.evaluate(() => {
    const out: Record<string, { kinds: string[]; at: string | null }> = {};
    for (const key of Object.keys(localStorage)) {
      if (!key.includes("copy.fil.") || key.includes("seen-queue")) continue;
      const ref = JSON.parse(localStorage.getItem(key) ?? "null") as {
        savedAt?: string;
        value?: { items?: { kind: string }[] };
      } | null;
      out[key] = { kinds: (ref?.value?.items ?? []).map((i) => i.kind), at: ref?.savedAt ?? null };
    }
    return out;
  });
  const keys = Object.keys(stored);
  expect(keys.length).toBe(3);
  for (const k of keys) {
    expect(stored[k]?.kinds.length).toBeGreaterThan(0);
    expect(stored[k]?.kinds.length).toBeLessThanOrEqual(40);
    expect(stored[k]?.kinds).not.toContain("spot_meetup");
    expect(stored[k]?.kinds).not.toContain("sponsored");
    expect(stored[k]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }
  // Pas de réseau : l'onglet montre la copie, sous la phrase de l'Accueil hors ligne.
  await ctx.setOffline(true);
  await tab(page, "for_you");
  await expect(page.getByTestId("fil-offline")).toContainText("Hors ligne : voici ce que ton téléphone a gardé.");
  await expect(page.getByTestId("fil-list")).toBeVisible();
  expect(await page.getByTestId("fil-list").locator("[data-testid^='feed-card-']").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("fil-hot")).toHaveCount(0);
  await expect(page.getByTestId("fil-uptodate")).toHaveCount(0);
  await expect(page.getByTestId("fil-more")).toHaveCount(0);
  await expect(page.getByTestId("feed-card-spot_meetup")).toHaveCount(0);
  await expect(page.getByTestId("feed-card-sponsored")).toHaveCount(0);
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0);
  await expect(page.getByTestId("load-error")).toHaveCount(0);
  // La photo gardée remplace « Photo indisponible ».
  const keptCard = page.getByTestId("feed-card-feed_post").first();
  await expect(keptCard.getByTestId("feed-post-photos").locator("img").first()).toBeVisible({ timeout: 30_000 });
  await expect(keptCard.getByTestId("photo-failed")).toHaveCount(0);
  await shot(page, "hors-ligne-pour-toi-390");
  await tab(page, "following");
  await expect(page.getByTestId("fil-offline")).toBeVisible();
  await expect(page.getByTestId("feed-card-feed_post").first()).toContainText((onlineFirst ?? "").slice(0, 8));
  await shot(page, "hors-ligne-abonnements-390");
  // Le retour du réseau, en haut de la liste : la liste est relue seule.
  await ctx.setOffline(false);
  await expect(page.getByTestId("fil-offline")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list")).toBeVisible();
  await ctx.close();
});

test("hors ligne : un onglet jamais lu en ligne n'a pas de copie, l'erreur propose « Réessayer »", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local", "beton", { width: 390 });
  await goFil(page, "for_you");
  await ctx.setOffline(true);
  await page.getByTestId("fil-filters-nearby").click();
  await expect(page.getByTestId("fil-phrase")).toHaveText(PHRASES.nearby);
  await expect(page.getByTestId("load-error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await ctx.setOffline(false);
  await ctx.close();
});

test("hors ligne puis retour du réseau en bas de la liste : la pastille « Nouvelles publications », pas de saut", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local", "beton", { width: 390 });
  await goFil(page, "for_you");
  await tab(page, "nearby");
  await ctx.setOffline(true);
  await tab(page, "for_you");
  await expect(page.getByTestId("fil-offline")).toBeVisible();
  const first = (await page.getByTestId("feed-card-feed_post").first().textContent()) ?? "";
  // On descend dans la copie : le retour du réseau ne remplace pas la liste sous les yeux.
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
  }
  await ctx.setOffline(false);
  await expect(page.getByTestId("fil-fresh")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("fil-offline")).toBeVisible();
  await shot(page, "retour-reseau-pastille-390");
  // La pastille actualise : la liste en ligne remplace la copie et on remonte.
  await page.getByTestId("fil-fresh").click();
  await expect(page.getByTestId("fil-offline")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-fresh")).toHaveCount(0);
  await expect(page.getByTestId("fil-list")).toBeVisible();
  expect(first.length).toBeGreaterThan(0);
  await ctx.close();
});

test("mode avion sans quitter l'onglet : la copie filtrée, « Pas de réseau » sur la flamme et le commentaire, puis le retour du réseau", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local", "beton", { width: 390 });
  await goFil(page, "for_you");
  await expect(page.getByTestId("fil-offline")).toHaveCount(0);
  await ctx.setOffline(true); // ni actualisation ni changement d'onglet
  await expect(page.getByTestId("fil-offline")).toContainText("Hors ligne : voici ce que ton téléphone a gardé.", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("fil-hot")).toHaveCount(0);
  await expect(page.getByTestId("fil-more")).toHaveCount(0);
  await expect(page.getByTestId("feed-card-spot_meetup")).toHaveCount(0);
  await expect(page.getByTestId("feed-card-sponsored")).toHaveCount(0);
  // Flamme et commentaire d'une carte de la copie : « Pas de réseau », le compteur ne bouge pas.
  const card = page.getByTestId("feed-card-feed_post").first();
  const before = await card.getByTestId("feed-post-fire-count").textContent();
  await card.getByTestId("feed-post-fire").click();
  await expect(card.getByTestId("feed-post-no-network")).toHaveText("Pas de réseau");
  expect(await card.getByTestId("feed-post-fire-count").textContent()).toBe(before);
  await card.getByTestId("feed-post-comment").click();
  await expect(card.getByTestId("feed-post-no-network")).toBeVisible();
  await ctx.setOffline(false);
  // On a défilé pour toucher la carte : le retour du réseau propose la pastille, qui actualise.
  await page.waitForTimeout(3000);
  if (await page.getByTestId("fil-fresh").count()) await page.getByTestId("fil-fresh").click();
  await expect(page.getByTestId("fil-offline")).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("partager une carte la retient comme interaction (`share`)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "damien@orasso.local", "beton", { width: 390 });
  const sent: { cards: { id: string; action: string }[] }[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/me/fil/seen")) sent.push(req.postDataJSON());
  });
  await goFil(page, "following");
  const card = page.getByTestId("feed-card-feed_post").first();
  await card.scrollIntoViewIfNeeded();
  await card.getByTestId("feed-post-share").click();
  await expect
    .poll(() => sent.flatMap((b) => b.cards).filter((c) => c.action === "share").length, {
      timeout: 40_000,
      intervals: [1_000],
    })
    .toBeGreaterThan(0);
  await ctx.close();
});
