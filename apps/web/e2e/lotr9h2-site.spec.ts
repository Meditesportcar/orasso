import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R9h, partie 2 : la « Page » du propriétaire des quatre casquettes, sur le site (`/orga/:s/page`, `/pro/:p/page`,
// `/app/media/page`, `/app/prestataire/page`) : l'en-tête au gabarit de R8g (anneau, nom, type, pas de « Suivre », « QR de la page » et
// « Réglages », trois compteurs), les chips de gestion, les onglets (`?onglet=`), « Publier » depuis la Page (`auteur=`), « Mes
// casquettes » ; puis les pages publiques du prestataire et du média au même gabarit (« Suivre » par `page-follows`, au nom de la page
// quand l'adresse porte la casquette : T14) et les liens que les lots d'avant n'avaient pas pu poser (T54).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9h-captures/apres/recette-site-2`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
test.use({ actionTimeout: 30_000 });

/**
 * Les images attendues d'une capture : chaque image **visible** doit être chargée pour de bon (`naturalWidth > 0`) ; une image cassée
 * n'est plus acceptée parce que son chargement est « terminé ». Un repli attendu s'autorise explicitement (`brokenOk` : sélecteurs CSS).
 */
async function expectImagesLoaded(page: Page, brokenOk: string[] = []) {
  await expect
    .poll(
      () =>
        page.evaluate(async (allowed) => {
          await Promise.all(
            [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => undefined))),
          );
          return [...document.images]
            .filter((img) => {
              const r = img.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(img).visibility !== "hidden";
            })
            .filter((img) => !allowed.some((q) => img.matches(q)))
            .filter((img) => !(img.complete && img.naturalWidth > 0))
            .map((img) => img.currentSrc || img.src);
        }, brokenOk),
      { message: "toutes les images visibles sont chargées (naturalWidth > 0)", timeout: 20_000 },
    )
    .toEqual([]);
}

async function shot(page: Page, name: string, brokenOk: string[] = []) {
  mkdirSync(DIR, { recursive: true });
  // Le thème voulu est vraiment celui de la page (le Sable ne repasse jamais en Béton sans que personne le voie, tour 2, point 4).
  const wanted = (await page.context().cookies()).find((c) => c.name === "orasso-theme")?.value;
  if (wanted === "sable" || wanted === "beton")
    await expect(page.locator("html")).toHaveAttribute("data-theme", wanted);
  // Un état observable, pas un délai : réseau au repos, polices et images décodées, deux images peintes (la capture voit le contenu final).
  await page.waitForLoadState("networkidle");
  await expectImagesLoaded(page, brokenOk);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function open(page: Page, email: string, to: string) {
  // On repart sans session, mais le thème posé par `setTheme` reste : `clearCookies` l'effaçait et le Sable tournait en Béton (tour 1, point 2).
  const theme = (await page.context().cookies()).find((c) => c.name === "orasso-theme");
  await page.context().clearCookies();
  if (theme) await setTheme(page, theme.value as "beton" | "sable" | "auto");
  await loginInBrowser(page, email, undefined, to);
  await page.goto(to);
}

/** Le libellé d'un onglet sans son nombre (« Mentions · 3 » → « Mentions »). */
const clean = (t: string) =>
  t
    .replace(/\s*·.*$/s, "")
    .replace(/\s+\d+$/, "")
    .trim();

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "aucun défilement horizontal de la page").toBeLessThanOrEqual(1);
}

type Me = {
  pro: { slug: string; id: string } | null;
  personas: { kind: string; id: string; label: string }[];
};
const meOf = async (email: string) => (await apiCall<Me>(await login(email), "GET", "/me")).data;
const personaOf = async (email: string, kind: string) => {
  const p = (await meOf(email)).personas.find((x) => x.kind === kind);
  expect(p, `${email} a une casquette ${kind} (seed)`).toBeTruthy();
  return p as { kind: string; id: string; label: string };
};

/** `GET /providers/:id` lu au nom d'une casquette (en-tête) ou de la personne : son état d'abonnement et son nombre d'abonnés. */
async function providerAs(email: string, providerId: string, actor?: string) {
  const res = await fetch(`${API}/api/providers/${providerId}`, {
    headers: { cookie: await login(email), origin: WEB, ...(actor ? { "x-orasso-actor": actor } : {}) },
  });
  return (await res.json()) as { isFollowing: boolean; followersCount: number };
}

/** Pose l'état d'abonnement voulu par l'API (précondition d'une recette : la graine fait déjà suivre certaines pages). */
async function setFollowing(email: string, targetKey: string, wanted: boolean, actor?: string) {
  const res = await fetch(`${API}/api/me/page-follows/${encodeURIComponent(targetKey)}`, {
    method: wanted ? "PUT" : "DELETE",
    headers: { cookie: await login(email), origin: WEB, ...(actor ? { "x-orasso-actor": actor } : {}) },
  });
  expect(res.status).toBe(200);
}

/** `GET /media/:id` lu au nom d'une casquette : son état d'abonnement (casquette de la personne : sans en-tête). */
async function fetchMediaAs(email: string, mediaId: string, actor: string) {
  const res = await fetch(`${API}/api/media/${mediaId}`, {
    headers: { cookie: await login(email), origin: WEB, "x-orasso-actor": actor },
  });
  return (await res.json()) as { isFollowing: boolean };
}

/** `GET /media/:id` lu par une personne : son état d'abonnement et son nombre d'abonnés. */
async function fetchMedia(email: string, mediaId: string) {
  const res = await fetch(`${API}/api/media/${mediaId}`, { headers: { cookie: await login(email), origin: WEB } });
  return (await res.json()) as { isFollowing: boolean; followersCount: number };
}

const SPACES = [
  {
    name: "organisateur",
    email: "sarah@orasso.local",
    page: "/orga/roues-libres-66/page",
    title: "Roues Libres 66",
    type: /Organisateur|Structure|Association/i,
    tabs: ["Événements", "Publications", "Mentions"],
    first: "publications", // « Publications » par défaut quand la page en a (R9.3) ; la structure de la graine en a
    gest: [
      ["team", "Équipe", "/orga/roues-libres-66/staff"],
      ["structure", "Réglages de la structure", "/orga/roues-libres-66/structure"],
    ],
    counters: ["abonné", "événement", "partenaire"],
  },
  {
    name: "pro",
    email: "garage@orasso.local",
    page: "", // renseignée à l'exécution (le slug de la fiche)
    title: "",
    type: /Pro/i,
    tabs: ["Publications", "Offres", "Mentions"],
    first: "publications",
    gest: [],
    counters: ["abonné"],
  },
  {
    name: "média",
    email: "leo@orasso.local",
    page: "/app/media/page",
    title: "Sud Cars",
    type: /Média/i,
    tabs: ["Publications", "Albums", "Mentions"],
    first: "publications",
    gest: [["media", "Modifier ma page", "/app/media"]],
    counters: ["abonné", "album", "photo"],
  },
  {
    name: "prestataire",
    email: "sofia@orasso.local",
    page: "/app/prestataire/page",
    title: "La Brasa",
    type: /./,
    tabs: ["Publications", "Prestations", "Mentions"],
    first: "publications",
    gest: [["vitrine", "Modifier ma vitrine", "/app/prestataire"]],
    counters: ["abonné", "mission", "organisateur"],
  },
] as const;

/** L'onglet ouvert sans `onglet` (le champ `first` de `SPACES`). */
const FIRST_TAB = { events: "Événements", publications: "Publications" } as const;

for (const theme of ["beton", "sable"] as const) {
  for (const space of SPACES) {
    for (const viewport of [
      { name: "1280", size: { width: 1280, height: 900 } },
      { name: "390", size: MOBILE },
    ]) {
      test(`${space.name} : la Page du propriétaire (${theme}, ${viewport.name})`, async ({ browser }) => {
        test.setTimeout(240_000);
        const ctx = await browser.newContext({ viewport: viewport.size });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        let path: string = space.page;
        let title: string = space.title;
        let gest: readonly (readonly string[])[] = space.gest;
        if (space.name === "pro") {
          const me = await meOf(space.email);
          expect(me.pro, "garage@ a une fiche pro (seed)").not.toBeNull();
          path = `/pro/${me.pro?.slug}/page`;
          title = me.pro ? ((await personaOf(space.email, "pro")).label ?? "") : "";
          gest = [
            ["fiche", "Modifier ma fiche", `/pro/${me.pro?.slug}`],
            ["subscription", "Abonnement", `/pro/${me.pro?.slug}/abonnement`],
          ];
        }
        await open(page, space.email, path);

        // L'en-tête : le nom jamais tronqué, le type, aucun « Suivre », « QR de la page » et « Réglages », la bande de compteurs.
        const head = page.getByTestId("owner-head");
        await expect(head).toBeVisible();
        if (title) await expect(page.getByTestId("page-name")).toHaveText(title);
        await expect(page.getByTestId("page-type")).toContainText(space.type);
        await expect(page.getByTestId("follow-button")).toHaveCount(0);
        await expect(page.getByTestId("page-qr-open")).toBeVisible();
        await expect(page.getByTestId("page-settings")).toHaveAttribute("href", "/app/moi#reglages");
        const band = page.getByTestId("page-counts");
        for (const word of space.counters) await expect(band).toContainText(word);

        // Les chips de gestion : les écrans d'hier, jamais le bouton principal.
        await expect(page.getByTestId("page-gest")).toBeVisible();
        for (const [id, label, href] of gest) {
          const chip = page.getByTestId(`page-gest-${id}`);
          await expect(chip).toContainText(label ?? "");
          await expect(chip).toHaveAttribute("href", href ?? "");
        }

        // Les onglets, dans l'ordre ; un lien partagé (`?onglet=`) ouvre le bon.
        const tabs = page.getByTestId("page-tabs");
        const labels = (await tabs.getByRole("tab").allInnerTexts()).map(clean);
        expect(labels).toEqual(space.tabs);

        // « QR de la page » : la fenêtre montre le QR du lien public, avec le nom et de quoi partager.
        await page.getByTestId("page-qr-open").click();
        await expect(page.getByTestId("page-qr-dialog")).toBeVisible();
        await expect(page.getByTestId("page-qr").getByRole("img")).toBeVisible();
        await shot(page, `page-${space.name}-qr-${theme}-${viewport.name}`);
        await page.keyboard.press("Escape");

        // « Mes casquettes » : le pied ramène à `/app/moi`, où les casquettes vivent.
        await expect(page.getByTestId("page-row-casquettes")).toContainText("Mes casquettes");
        await expect(page.getByTestId("page-row-casquettes")).toHaveAttribute("href", "/app/moi");

        if (viewport.name === "390") {
          // Les chips et les onglets tiennent ou défilent : rien n'est coupé, la page ne défile jamais de côté.
          await noHorizontalScroll(page);
          const chips = await page
            .getByTestId("page-gest")
            .locator("a")
            .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
          for (const right of chips) expect(right, "une chip dépasse de l'écran").toBeLessThanOrEqual(390);
          const name = await page.getByTestId("page-name").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
          expect(name, "le nom n'est jamais coupé").toBe(true);
        }
        await shot(page, `page-${space.name}-${theme}-${viewport.name}`);

        // Sans `onglet`, l'onglet par défaut est celui de la fiche (tour 1, point 4).
        await page.goto(path);
        await expect(tabs.getByRole("tab", { selected: true })).toContainText(FIRST_TAB[space.first]);

        // Chaque onglet s'ouvre par son adresse.
        for (const tab of space.tabs) {
          const slug = {
            Événements: "evenements",
            Publications: "publications",
            Offres: "offres",
            Albums: "albums",
            Prestations: "prestations",
            Mentions: "mentions",
          }[tab];
          await page.goto(`${path}?onglet=${slug}`);
          await expect(tabs.getByRole("tab", { selected: true })).toContainText(tab);
          await shot(page, `page-${space.name}-${slug}-${theme}-${viewport.name}`);
        }
        await ctx.close();
      });
    }
  }
}

test("« Publier » depuis la Page : le seul bouton principal de l'onglet, au nom de la page ; « Mes casquettes » → /app/moi", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "sarah@orasso.local", "/orga/roues-libres-66/page?onglet=publications");
  const publish = page.getByTestId("publications-publish").first();
  await expect(publish).toBeVisible();
  // Un seul bouton principal dans l'onglet.
  await expect(page.getByTestId("publications-publish")).toHaveCount(1);
  await expect(publish).toHaveAttribute("href", /\/app\/fil\/publier\?auteur=s%3A/);
  await publish.click();
  await page.waitForURL(/\/app\/fil\/publier\?auteur=s%3A/);
  await expect(page.locator('[data-testid^="fil-publish-as-structure:"][aria-pressed="true"]')).toContainText(
    "Roues Libres 66",
  );
  await page.goto("/orga/roues-libres-66/page");
  await page.getByTestId("page-row-casquettes").click();
  await page.waitForURL(`${WEB}/app/moi`);
  await ctx.close();
});

test("Le média : « Nouvel album » est le seul bouton principal de l'onglet « Albums » ; l'album publié s'ouvre", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "leo@orasso.local", "/app/media/page?onglet=albums");
  await expect(page.getByTestId("page-album-new")).toHaveAttribute("href", "/app/media/albums/nouveau");
  await expect(page.getByTestId("media-public-albums")).toBeVisible();
  const published = page
    .getByTestId("media-public-album")
    .filter({ hasText: "Les photos du Rassemblement Côte Vermeille" });
  await expect(published).toBeVisible();
  // Les brouillons du propriétaire y sont (« Brouillon »).
  await expect(page.getByTestId("media-public-album").filter({ hasText: "Brouillon" }).first()).toBeVisible();
  await published.click();
  await page.waitForURL(/\/albums\//);
  await ctx.close();
});

test("Le prestataire : l'onglet « Prestations » montre sa vitrine en lecture", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "sofia@orasso.local", "/app/prestataire/page?onglet=prestations");
  await expect(page.getByTestId("page-prestations")).toBeVisible();
  await expect(page.getByTestId("vitrine-menu")).toBeVisible();
  await ctx.close();
});

test("Le pro : l'onglet « Offres » avec « Publier une offre »", async ({ browser }) => {
  test.setTimeout(240_000);
  const me = await meOf("garage@orasso.local");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "garage@orasso.local", `/pro/${me.pro?.slug}/page?onglet=offres`);
  await expect(page.getByTestId("page-offers")).toBeVisible();
  await expect(page.getByTestId("offers-publish")).toBeVisible();
  await ctx.close();
});

for (const theme of ["beton", "sable"] as const) {
  test(`/providers/<id> au gabarit : « Suivre » → « Suivi », le compteur ; la page seule en casquette (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const brasa = await personaOf("sofia@orasso.local", "provider");
    const structure = await personaOf("sarah@orasso.local", "organizer");
    const key = `s:${structure.id}`;
    // Préconditions : ni Damien (la graine le fait suivre La Brasa) ni la structure ne suivent ; l'état d'avant est rendu à la fin.
    const damienWas = (await providerAs("damien@orasso.local", brasa.id)).isFollowing;
    const pageWas = (await providerAs("sarah@orasso.local", brasa.id, key)).isFollowing;
    await setFollowing("damien@orasso.local", `v:${brasa.id}`, false);
    await setFollowing("sarah@orasso.local", `v:${brasa.id}`, false, key);
    const before = await providerAs("damien@orasso.local", brasa.id);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    const followCalls: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PUT" || r.method() === "DELETE")
        if (new URL(r.url()).pathname.includes("/page-follows/"))
          followCalls.push(r.headers()["x-orasso-actor"] ?? "moi");
    });

    // Damien, en son nom : « Suivre » devient « Suivi » et le compteur monte d'un.
    await open(page, "damien@orasso.local", `/providers/${brasa.id}`);
    await expect(page.getByTestId("provider-head")).toBeVisible();
    await expect(page.getByTestId("page-name")).toHaveText("La Brasa");
    for (const word of ["abonné", "mission", "organisateur"])
      await expect(page.getByTestId("page-counts")).toContainText(word);
    const tabs = (await page.getByTestId("page-tabs").getByRole("tab").allInnerTexts()).map(clean);
    expect(tabs).toEqual(["Publications", "Prestations", "Mentions"]);
    await page.goto(`/providers/${brasa.id}?onglet=prestations`);
    await expect(page.getByTestId("page-prestations")).toBeVisible();
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    // Sans casquette dans l'adresse : ni pastille, ni « en tant que » (tour 1, point 1).
    await expect(page.getByTestId("page-actor")).toHaveCount(0);
    await expect(page.getByTestId("follow-button")).not.toContainText("en tant que");
    await shot(page, `providers-visiteur-${theme}`);
    // À 390 px : aucun défilement de côté (tour 1, point 4).
    await page.setViewportSize(MOBILE);
    await noHorizontalScroll(page);
    await shot(page, `providers-visiteur-${theme}-390`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivi");
    await expect(page.getByTestId("page-count-followers")).toContainText(String(before.followersCount + 1));
    expect((await providerAs("damien@orasso.local", brasa.id)).isFollowing).toBe(true);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    await expect(page.getByTestId("page-count-followers")).toContainText(String(before.followersCount));
    expect(followCalls).toEqual(["moi", "moi"]);

    // Sarah, depuis l'espace de sa structure (`?auteur=`) : c'est la page qui suit, pas la personne.
    followCalls.length = 0;
    await open(
      page,
      "sarah@orasso.local",
      `/providers/${brasa.id}?auteur=${encodeURIComponent(key)}&onglet=prestations`,
    );
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    // La pastille dit au nom de qui on agit, et le bouton aussi (tour 1, point 1) : un lien reçu ne fait jamais suivre en silence.
    await expect(page.getByTestId("page-actor")).toBeVisible();
    await expect(page.getByTestId("page-actor-name")).toHaveText(structure.label);
    await expect(page.getByTestId("page-actor")).toContainText("Tu agis au nom de");
    await expect(page.getByTestId("follow-button")).toHaveText(`Suivre en tant que ${structure.label}`);
    await shot(page, `providers-au-nom-d-une-page-${theme}`);
    const base = await providerAs("sarah@orasso.local", brasa.id, key);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivi");
    await expect(page.getByTestId("follow-button")).toHaveText(`Suivi en tant que ${structure.label}`);
    expect(followCalls.at(-1)).toBe(key);
    const asPage = await providerAs("sarah@orasso.local", brasa.id, key);
    expect(asPage.isFollowing, "la page suit").toBe(true);
    expect(asPage.followersCount, "le compteur de La Brasa monte d'un").toBe(base.followersCount + 1);
    const asPerson = await providerAs("sarah@orasso.local", brasa.id);
    expect(asPerson.isFollowing, "la personne, elle, ne suit pas (T14)").toBe(false);
    // L'onglet garde la casquette dans l'adresse.
    await page.getByTestId("page-tab-mentions").click();
    await expect(page).toHaveURL(/auteur=s%3A.*onglet=mentions/);
    await page.goto(`/providers/${brasa.id}?auteur=${encodeURIComponent(key)}&onglet=prestations`);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    expect((await providerAs("sarah@orasso.local", brasa.id, key)).followersCount).toBe(base.followersCount);

    // « En mon nom » : la même adresse sans `auteur` (l'onglet reste), plus de pastille, le bouton redit « Suivre ».
    await page.goto(`/providers/${brasa.id}?auteur=${encodeURIComponent(key)}&onglet=prestations`);
    await page.getByTestId("page-actor-change").click();
    await page.waitForURL((u) => !u.searchParams.has("auteur") && u.searchParams.get("onglet") === "prestations");
    await expect(page.getByTestId("page-actor")).toHaveCount(0);
    await expect(page.getByTestId("follow-button")).toHaveText("Suivre");

    // Une clé qui n'est pas au compte n'est jamais crue : la personne agit.
    followCalls.length = 0;
    await page.goto(`/providers/${brasa.id}?auteur=${encodeURIComponent(`s:${brasa.id}`)}&onglet=prestations`);
    await expect(page.getByTestId("page-actor")).toHaveCount(0);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivi");
    expect(followCalls).toEqual(["moi"]);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    if (damienWas) await setFollowing("damien@orasso.local", `v:${brasa.id}`, true);
    if (pageWas) await setFollowing("sarah@orasso.local", `v:${brasa.id}`, true, key);
    await ctx.close();
  });
}

test("/providers/<id> pour son propriétaire : pas de « Suivre », « Modifier » dans « Plus » mène à sa Page ; le prestataire visité signale", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const brasa = await personaOf("sofia@orasso.local", "provider");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "sofia@orasso.local", `/providers/${brasa.id}?onglet=prestations`);
  await expect(page.getByTestId("follow-button")).toHaveCount(0);
  await page.getByTestId("page-more").locator("summary").click();
  await expect(page.getByTestId("page-edit")).toHaveAttribute("href", "/app/prestataire/page");
  await expect(page.getByTestId("report-open")).toHaveCount(0);
  await open(page, "damien@orasso.local", `/providers/${brasa.id}?onglet=prestations`);
  await page.getByTestId("page-more").locator("summary").click();
  await expect(page.getByTestId("report-open")).toBeVisible();
  await ctx.close();
});

for (const theme of ["beton", "sable"] as const) {
  test(`/m/<id> au gabarit : « Suivre », albums et liens, compteurs « abonnés · albums · photos » (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const sudCars = await personaOf("leo@orasso.local", "media");
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    const damienWas = (await fetchMedia("damien@orasso.local", sudCars.id)).isFollowing;
    await setFollowing("damien@orasso.local", `m:${sudCars.id}`, false);
    const before = await fetchMedia("damien@orasso.local", sudCars.id);
    await open(page, "damien@orasso.local", `/m/${sudCars.id}?onglet=albums`);
    await expect(page.getByTestId("media-head")).toBeVisible();
    await expect(page.getByTestId("page-name")).toHaveText("Sud Cars");
    for (const word of ["abonné", "album", "photo"]) await expect(page.getByTestId("page-counts")).toContainText(word);
    const tabs = (await page.getByTestId("page-tabs").getByRole("tab").allInnerTexts()).map(clean);
    expect(tabs).toEqual(["Publications", "Albums", "Mentions"]);
    await expect(page.getByTestId("media-public-albums")).toBeVisible();
    await expect(page.getByTestId("page-album-new")).toHaveCount(0);
    await noHorizontalScroll(page);
    await shot(page, `m-visiteur-${theme}`);
    const count = page.getByTestId("page-count-followers");
    await expect(count).toContainText(String(before.followersCount));
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivi");
    await expect(count).toContainText(String(before.followersCount + 1));
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    await expect(count).toContainText(String(before.followersCount));
    if (damienWas) await setFollowing("damien@orasso.local", `m:${sudCars.id}`, true);
    await ctx.close();
  });
}

test("Les liens de T54 : l'album mène à la page du média, la Page du média à ses albums, « Plus » du média à sa Page", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const sudCars = await personaOf("leo@orasso.local", "media");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "leo@orasso.local", `/m/${sudCars.id}?onglet=albums`);
  await expect(page.getByTestId("follow-button")).toHaveCount(0);
  await page.getByTestId("page-more").locator("summary").click();
  await expect(page.getByTestId("page-edit")).toHaveAttribute("href", "/app/media/page");
  await page.getByTestId("media-public-album").first().click();
  await page.waitForURL(/\/albums\//);
  await expect(page.getByTestId("album-media-link")).toHaveAttribute("href", `/m/${sudCars.id}`);
  await ctx.close();
});

/** Les onglets de la page tiennent sans être coupés (`scrollWidth <= clientWidth`) : « Mentions · 0 » n'est jamais rogné à 390 px. */
async function tabsFit(page: Page) {
  const fits = await page.getByTestId("page-tabs").evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits, "la rangée d'onglets ne coupe rien").toBe(true);
}

test("/providers/<id>?auteur= : la pastille dit ce qui part au nom de la page ; un commentaire de la vue « Une par une » part au nom de la page ; « Signaler » reste personnel ; la vignette ouvre la publication", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const brasa = await personaOf("sofia@orasso.local", "provider");
  const structure = await personaOf("sarah@orasso.local", "organizer");
  const key = `s:${structure.id}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(
    page,
    "sarah@orasso.local",
    `/providers/${brasa.id}?auteur=${encodeURIComponent(key)}&onglet=publications`,
  );
  await expect(page.getByTestId("page-actor-name")).toHaveText(structure.label);
  await expect(page.getByTestId("page-actor-note")).toHaveText(
    "Sur cette page, tes commentaires partent au nom de la page. Réactions, partages et signalements restent à ton nom ; une publication ouverte seule repasse à ton nom.",
  );
  // La vue « Une par une » a les commentaires dans la page : le commentaire part au nom de la page (en-tête de la casquette), signé par elle.
  await page.getByTestId("publications-view-one").click();
  await page.getByTestId("feed-post-comment").first().click();
  await expect(page.getByTestId("feed-comments-sheet")).toBeVisible();
  const text = `Commentaire de la page ${Date.now()}`;
  await page.getByTestId("feed-comment-input").fill(text);
  const sent = page.waitForRequest((r) => r.method() === "POST" && /\/feed-posts\/[^/]+\/comments$/.test(r.url()));
  await page.getByTestId("feed-comment-send").click();
  expect((await (await sent).allHeaders())["x-orasso-actor"], "le commentaire part au nom de la casquette").toBe(key);
  const mine = page.getByTestId("feed-comment").filter({ hasText: text });
  await expect(mine).toBeVisible({ timeout: 30_000 });
  await expect(mine.locator("b").first()).toHaveText(structure.label);
  await page.getByTestId("feed-comments-close").click();
  await page.getByTestId("publications-view-grid").click();
  // « Signaler » reste personnel, et la feuille le dit sous la pastille.
  await page.getByTestId("page-more").locator("summary").click();
  await page.getByTestId("report-open").click();
  await expect(page.getByTestId("report-personal")).toContainText("part à ton nom");
  await expect(page.getByTestId("report-personal")).toContainText(structure.label);
  await page.keyboard.press("Escape");
  // La vignette ouvre la publication seule (`/app/publication/<id>`, sans pastille : elle n'agit pas au nom de la page).
  await page.getByTestId("publication-tile-open").first().click();
  await page.waitForURL(/\/app\/publication\//);
  await expect(page.getByTestId("page-actor")).toHaveCount(0);
  await ctx.close();
});

test("/m/<id>?auteur= : pastille, « Suivre en tant que », « En mon nom » ; « Voir la suite » garde onglet, casquette et retour ; nom de page long à 390 px", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sudCars = await personaOf("leo@orasso.local", "media");
  const structure = await personaOf("sarah@orasso.local", "organizer");
  const key = `s:${structure.id}`;
  const longName = "Association des passionnés de belles mécaniques du Roussillon et des Pyrénées-Orientales";
  await sql("update structures set name = $1 where id = $2", [longName, structure.id]);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  try {
    await setTheme(page, "sable");
    const back = "/app/sorties";
    await open(
      page,
      "sarah@orasso.local",
      `/m/${sudCars.id}?auteur=${encodeURIComponent(key)}&onglet=albums&taille=1&retour=${encodeURIComponent(back)}`,
    );
    await expect(page.getByTestId("page-actor-name")).toHaveText(longName);
    await expect(page.getByTestId("follow-button")).toContainText(`Suivre en tant que ${longName}`);
    const nameFits = await page.getByTestId("page-actor-name").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(nameFits, "le nom de la page n'est jamais coupé").toBe(true);
    await noHorizontalScroll(page);
    await tabsFit(page);
    // « Voir la suite » garde l'onglet, la casquette et le retour dans son adresse (liens : une page d'un lien).
    const more = page.getByTestId("media-public-more");
    await expect(more).toBeVisible();
    const href = new URL((await more.getAttribute("href")) ?? "", WEB);
    expect(href.pathname).toBe(`/m/${sudCars.id}`);
    expect(href.searchParams.get("onglet")).toBe("albums");
    expect(href.searchParams.get("auteur")).toBe(key);
    expect(href.searchParams.get("retour")).toBe(back);
    await shot(page, "m-au-nom-d-une-page-sable-390");
    // « En mon nom » : la même adresse sans `auteur` (onglet et retour restent).
    await page.getByTestId("page-actor-change").click();
    await page.waitForURL((u) => !u.searchParams.has("auteur") && u.searchParams.get("onglet") === "albums");
    expect(new URL(page.url()).searchParams.get("retour")).toBe(back);
    await expect(page.getByTestId("page-actor")).toHaveCount(0);
    await expect(page.getByTestId("follow-button")).toHaveText("Suivre");
  } finally {
    await sql("update structures set name = $1 where id = $2", [structure.label, structure.id]);
    await ctx.close();
  }
});

test("les onglets des pages publiques et des Pages du propriétaire tiennent à 390 px", async ({ browser }) => {
  test.setTimeout(240_000);
  const brasa = await personaOf("sofia@orasso.local", "provider");
  const sudCars = await personaOf("leo@orasso.local", "media");
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await setTheme(page, "sable");
  await open(page, "damien@orasso.local", `/providers/${brasa.id}?onglet=prestations`);
  await tabsFit(page);
  await shot(page, "onglets-providers-sable-390");
  await page.goto(`/m/${sudCars.id}?onglet=albums`);
  await tabsFit(page);
  await open(page, "sofia@orasso.local", "/app/prestataire/page");
  await tabsFit(page);
  await open(page, "leo@orasso.local", "/app/media/page");
  await tabsFit(page);
  await open(page, "sarah@orasso.local", "/orga/roues-libres-66/page");
  await tabsFit(page);
  await ctx.close();
});

test("Deux casquettes du même compte : la fiche pro suit sa vitrine de prestataire (au nom de la fiche) puis s'en désabonne ; la vitrine ne se suit pas elle-même", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const email = "garage@orasso.local";
  const provider = await personaOf(email, "provider");
  const pro = await personaOf(email, "pro");
  const proKey = `p:${pro.id}`;
  const ownKey = `v:${provider.id}`;
  // Précondition : la fiche pro ne suit pas la vitrine (l'état d'avant est rendu à la fin).
  const wasFollowing = (await providerAs(email, provider.id, proKey)).isFollowing;
  await setFollowing(email, ownKey, false, proKey);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await open(page, email, `/providers/${provider.id}?auteur=${encodeURIComponent(proKey)}&onglet=prestations`);
    // La fiche pro n'est pas la page visitée : « Suivre » est là, au nom de la fiche.
    const button = page.getByTestId("follow-button");
    await expect(button).toHaveText(`Suivre en tant que ${pro.label}`);
    await button.click();
    await expect(button).toHaveText(`Suivi en tant que ${pro.label}`);
    expect((await providerAs(email, provider.id, proKey)).isFollowing, "la fiche pro suit la vitrine").toBe(true);
    // Se désabonner, au nom de la fiche aussi.
    await button.click();
    await expect(button).toHaveText(`Suivre en tant que ${pro.label}`);
    expect((await providerAs(email, provider.id, proKey)).isFollowing).toBe(false);
    // La vitrine ne se suit pas elle-même (casquette = la page) ; sans casquette, le propriétaire non plus.
    await page.goto(`/providers/${provider.id}?auteur=${encodeURIComponent(ownKey)}&onglet=prestations`);
    await expect(page.getByTestId("page-actor")).toBeVisible();
    await expect(page.getByTestId("follow-button")).toHaveCount(0);
    await page.goto(`/providers/${provider.id}?onglet=prestations`);
    await expect(page.getByTestId("follow-button")).toHaveCount(0);
  } finally {
    if (wasFollowing) await setFollowing(email, ownKey, true, proKey);
    await ctx.close();
  }
});

test("/m/<id> à deux casquettes du même compte : la fiche pro suit son propre média (au nom de la fiche) puis s'en désabonne ; le média ne se suit pas lui-même", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const email = "garage@orasso.local";
  const cookie = await login(email);
  // Un média créé par l'API pour le compte du garage (la graine ne lui en donne pas) ; retiré à la fin.
  const created = await apiCall(cookie, "PUT", "/me/media-profile", {
    name: "Garage Images B2b",
    formats: ["photo"],
    website: "https://example.org/garage-images",
    departments: ["66"],
  });
  expect(created.status, "le média du garage est créé").toBe(200);
  const media = await personaOf(email, "media");
  const pro = await personaOf(email, "pro");
  const proKey = `p:${pro.id}`;
  const ownKey = `m:${media.id}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await setFollowing(email, ownKey, false, proKey);
    await open(page, email, `/m/${media.id}?auteur=${encodeURIComponent(proKey)}&onglet=albums`);
    // La fiche pro n'est pas la page visitée : « Suivre » est là, au nom de la fiche.
    const button = page.getByTestId("follow-button");
    await expect(button).toHaveText(`Suivre en tant que ${pro.label}`);
    await button.click();
    await expect(button).toHaveText(`Suivi en tant que ${pro.label}`);
    expect((await fetchMediaAs(email, media.id, proKey)).isFollowing, "la fiche pro suit le média").toBe(true);
    // Se désabonner, au nom de la fiche aussi.
    await button.click();
    await expect(button).toHaveText(`Suivre en tant que ${pro.label}`);
    expect((await fetchMediaAs(email, media.id, proKey)).isFollowing).toBe(false);
    // Le média ne se suit pas lui-même (casquette = la page) ; sans casquette, le propriétaire non plus.
    await page.goto(`/m/${media.id}?auteur=${encodeURIComponent(ownKey)}&onglet=albums`);
    await expect(page.getByTestId("page-actor")).toBeVisible();
    await expect(page.getByTestId("follow-button")).toHaveCount(0);
    await page.goto(`/m/${media.id}?onglet=albums`);
    await expect(page.getByTestId("follow-button")).toHaveCount(0);
  } finally {
    await setFollowing(email, ownKey, false, proKey).catch(() => undefined);
    // Le média de la recette est retiré : le compte retrouve l'état de la graine (sans casquette Média).
    await sql("delete from page_follows where target_id = $1", [media.id]);
    await sql("delete from media_profiles where id = $1", [media.id]);
    await ctx.close();
  }
});

test("Les onglets d'une page publique gardent `retour` : le ✕ ramène à l'écran d'origine", async ({ browser }) => {
  test.setTimeout(240_000);
  const brasa = await personaOf("sofia@orasso.local", "provider");
  const sudCars = await personaOf("leo@orasso.local", "media");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const back = "/app/sorties";
  const retour = encodeURIComponent(back);
  for (const path of [`/providers/${brasa.id}`, `/m/${sudCars.id}`]) {
    await open(page, "damien@orasso.local", `${path}?onglet=prestations&retour=${retour}`);
    await page.getByTestId("page-tab-mentions").click();
    await page.waitForURL((u) => u.searchParams.get("onglet") === "mentions");
    expect(new URL(page.url()).searchParams.get("retour"), `${path} : retour gardé par l'onglet`).toBe(back);
    await page.getByRole("link", { name: "Fermer" }).click();
    await page.waitForURL((u) => u.pathname === back);
  }
  await ctx.close();
});
