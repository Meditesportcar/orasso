import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
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

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function open(page: Page, email: string, to: string) {
  await page.context().clearCookies();
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
    first: "events",
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
    await shot(page, `providers-visiteur-${theme}`);
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
    const base = await providerAs("sarah@orasso.local", brasa.id, key);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toContainText("Suivi");
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

    // Une clé qui n'est pas au compte n'est jamais crue : la personne agit.
    followCalls.length = 0;
    await page.goto(`/providers/${brasa.id}?auteur=${encodeURIComponent(`s:${brasa.id}`)}&onglet=prestations`);
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
