import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { MOBILE, SEED_PASSWORD } from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot M7 (socle « deux modes d'affichage », règle de Damien du 23/10) : chaque écran de l'appli est
//   (A) navigation : la bande ORASSO en haut (logo, Recherche, Boîte), la barre d'onglets en bas ;
//   (B) fiche, plein écran, parcours : l'en-tête de fiche (titre ou bande, ✕ au même endroit), sans barre d'onglets.
// La recette parcourt chaque onglet de chaque casquette du seed (mode A) et des pages hors onglets (mode B), vérifie ce
// qui est réellement au-dessus (point touché au centre de l'élément, pas seulement sa présence dans la page), qu'une
// feuille passe au-dessus de la bande, puis prend une capture Béton et Sable à 390 px d'un écran par mode et par
// casquette.
// Lancer avec APP_URL (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m7-captures`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
type Kind = "fan" | "visitor" | "organizer" | "pro" | "provider" | "media" | "admin";

/** Qui représente chaque casquette dans le seed. */
const ACCOUNTS: Record<Kind, string> = {
  fan: "kenji@orasso.local",
  visitor: "paul.photo@orasso.local",
  organizer: "damien@orasso.local",
  pro: "garage@orasso.local",
  provider: "paul.photo@orasso.local",
  media: "leo@orasso.local",
  admin: "damien@orasso.local",
};

/** Onglets de chaque barre (libellé → route). */
const TABS: Record<Kind, [string, string][]> = {
  fan: [
    ["Explorer", "explorer"],
    ["Sorties", "sorties"],
    ["Accueil", "accueil"],
    ["Garage", "garage"],
    ["Profil", "profil"],
  ],
  visitor: [
    ["Explorer", "explorer"],
    ["Sorties", "sorties"],
    ["Accueil", "accueil"],
    ["Passeport", "passeport"],
    ["Profil", "profil"],
  ],
  organizer: [
    ["Événements", "evenements"],
    ["Tri", "tri"],
    ["Direct", "direct"],
    ["Équipe", "equipe"],
    ["Structure", "structure"],
  ],
  pro: [
    ["Scanner", "scanner"],
    ["Ma fiche", "fiche"],
    ["Accueil", "accueil"],
    ["Stats", "stats"],
    ["Profil", "profil"],
  ],
  provider: [
    ["Missions", "missions"],
    ["Candidatures", "candidatures"],
    ["Accueil", "accueil"],
    ["Vitrine", "vitrine"],
    ["Profil", "profil"],
  ],
  media: [
    ["Explorer", "explorer"],
    ["Presse", "presse"],
    ["Accueil", "accueil"],
    ["Contenus", "contenus"],
    ["Profil", "profil"],
  ],
  admin: [
    ["Accueil", "administration"],
    ["Signalements", "signalements"],
    ["Registres", "registres"],
    ["Gestion", "gestion"],
  ],
};

/** Onglet capturé (mode A) et page hors onglets capturée (mode B), par casquette. */
const SHOTS: Record<Kind, { tab: string; page: string }> = {
  fan: { tab: "garage", page: "fiche-vehicule" },
  visitor: { tab: "passeport", page: "fiche-evenement" },
  organizer: { tab: "tri", page: "bannis" },
  pro: { tab: "stats", page: "publier" },
  provider: { tab: "missions", page: "vitrine-publique" },
  media: { tab: "presse", page: "profil-media" },
  admin: { tab: "administration", page: "verification" },
};

type Ids = {
  event: string;
  orgaEvent: string;
  vehicle: string;
  pseudo: string;
  crew: string;
  structure: string;
  pro: string;
  provider: string;
  salon: string;
  pass: string | null;
};

async function ids(): Promise<Ids> {
  const first = async (text: string, params: unknown[] = []) => {
    const rows = await sql<{ v: string }>(text, params);
    return rows[0]?.v ?? null;
  };
  const need = async (name: string, text: string, params: unknown[] = []) => {
    const v = await first(text, params);
    if (!v) throw new Error(`Seed : pas de ${name}`);
    return v;
  };
  return {
    event: await need(
      "événement publié",
      "select slug as v from events where status = 'published' and starts_at > now() order by starts_at limit 1",
    ),
    orgaEvent: await need(
      "événement de MéditeSportCar",
      `select e.id as v from events e join structures s on s.id = e.structure_id
       where s.name = 'MéditeSportCar' and e.status = 'published' order by e.starts_at desc limit 1`,
    ),
    vehicle: await need(
      "véhicule de Kenji",
      `select v.id as v from vehicles v join "user" u on u.id = v.owner_id
       where u.email = 'kenji@orasso.local' and v.status = 'active' limit 1`,
    ),
    pseudo: await need("pseudo", "select pseudo as v from profiles where pseudo like 'Nina%' limit 1"),
    crew: await need("crew", "select slug as v from crews limit 1"),
    structure: await need("structure", "select slug as v from structures order by name limit 1"),
    pro: await need("fiche pro", "select slug as v from pro_profiles where deleted_at is null limit 1"),
    provider: await need("prestataire", "select id as v from provider_profiles where deleted_at is null limit 1"),
    salon: await need("Salon d'Argelès", "select id as v from events where slug = 'salon-argeles'"),
    pass: await first(
      `select a.id as v from applications a join "user" u on u.id = a.user_id join events e on e.id = a.event_id
       where u.email = 'kenji@orasso.local' and a.kind = 'vehicle' and a.status = 'accepted' and e.ends_at > now()
       order by e.starts_at limit 1`,
    ),
  };
}

/** Pages hors onglets (mode B) par casquette : nom de la capture → adresse. */
function pages(kind: Kind, id: Ids): [string, string][] {
  switch (kind) {
    case "fan":
      return [
        ["fiche-evenement", `/e/${id.event}`],
        ["fiche-vehicule", `/vehicule/${id.vehicle}`],
        ["ajout-vehicule", "/vehicule/nouveau"],
        ["partager-vehicule", `/vehicule/${id.vehicle}/partager`],
        ["profil-public", `/u/${id.pseudo}`],
        ["crew", `/crew/${id.crew}`],
        ["organisateur-public", `/o/${id.structure}`],
        ["pro-public", `/p/${id.pro}`],
        ["reglages", "/reglages/preferences"],
        ["amis", "/amis"],
        ["billets", "/billets"],
        ["passeport", "/mon-passeport"],
        ["archives", "/vehicules-archives"],
        ["creer-fiche-pro", "/pro-nouvelle"],
        ["creer-structure", "/structure/nouvelle"],
        ...(id.pass ? ([["jour-j", `/jour-j/${id.pass}`]] as [string, string][]) : []),
      ];
    case "visitor":
      return [
        ["fiche-evenement", `/e/${id.event}`],
        ["reglages", "/reglages/notifications"],
      ];
    case "organizer":
      return [
        ["page-evenement", `/evenement/${id.orgaEvent}`],
        ["bilan", `/evenement/${id.orgaEvent}/bilan`],
        ["creation-evenement", "/nouvel-evenement"],
        ["bannis", "/bannis"],
        ["modeles", "/modeles"],
        ["notes", "/notes"],
        ["boite-structure", "/boite/orga"],
        // L'exposant et le visiteur cherchent dans l'Explorer (mode A) ; les autres casquettes ont l'écran de recherche.
        ["recherche", "/recherche"],
        ["mode-staff", `/staff/${id.salon}`],
        ["scan-staff", `/staff/${id.salon}/scan`],
      ];
    case "pro":
      return [["publier", "/publier"]];
    case "provider":
      return [["vitrine-publique", `/providers/${id.provider}`]];
    case "media":
      return [["profil-media", "/media/modifier"]];
    case "admin":
      return [
        ["verification", "/verification"],
        ["sanctions", "/sanctions"],
        ["utilisateurs", "/utilisateurs"],
        ["parametres", "/parametres"],
      ];
  }
}

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

/** Un chargement de page rejoue l'ouverture de l'appli : un toucher la passe. */
async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
}

/** Passe à une casquette depuis Mon profil. */
async function choose(page: Page, kind: Kind) {
  if (kind === "fan" || kind === "visitor") return;
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId(`casquette-${kind}`).first().click();
  const landing: Record<string, RegExp> = {
    organizer: /\/direct/,
    pro: /\/accueil/,
    provider: /\/accueil/,
    media: /\/accueil/,
    admin: /\/administration/,
  };
  await page.waitForURL(landing[kind] ?? /./, { timeout: 30_000 });
}

/**
 * Ce qui est vraiment affiché au-dessus : pour chaque identifiant, le nombre d'éléments visibles dont le centre, touché,
 * tombe sur eux (un élément recouvert par une feuille ou par l'écran du dessus ne compte pas).
 */
async function onTop(page: Page, testIds: string[]): Promise<Record<string, number>> {
  return page.evaluate((list) => {
    const out: Record<string, number> = {};
    for (const id of list) {
      let n = 0;
      for (const el of document.querySelectorAll(`[data-testid="${id}"]`)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
        const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) n++;
      }
      out[id] = n;
    }
    return out;
  }, testIds);
}

const CHROME = ["topbar-logo", "persona-tabbar", "appbar-close", "flow-close"];

/** Mode A : une seule bande ORASSO, la barre d'onglets, aucun ✕ d'en-tête de fiche. */
/** Attend un élément sans arrêter la recette : la recette relève tous les écarts d'un passage. */
const shows = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

async function modeA(page: Page, name: string) {
  expect.soft(await shows(page, '[data-testid="persona-tabbar"]'), `${name} (A) : barre d'onglets`).toBe(true);
  expect.soft(await shows(page, '[data-testid="topbar-logo"]'), `${name} (A) : bande ORASSO`).toBe(true);
  await page.waitForTimeout(400);
  const top = await onTop(page, CHROME);
  expect.soft(top["topbar-logo"], `${name} (A) : une seule bande ORASSO au-dessus`).toBe(1);
  expect.soft(top["persona-tabbar"], `${name} (A) : la barre d'onglets`).toBe(1);
  expect.soft((top["appbar-close"] ?? 0) + (top["flow-close"] ?? 0), `${name} (A) : pas d'en-tête de fiche`).toBe(0);
  const band = await page
    .getByTestId("topbar-logo")
    .first()
    .boundingBox()
    .catch(() => null);
  expect.soft(band?.y ?? -1, `${name} (A) : la bande est en haut`).toBeLessThan(40);
}

/** Mode B : l'en-tête de fiche (✕ au-dessus, en haut à droite), ni bande ORASSO ni barre d'onglets. */
async function modeB(page: Page, name: string) {
  const selector = '[data-testid="appbar-close"], [data-testid="flow-close"]';
  const close = page.locator(selector).first();
  expect.soft(await shows(page, selector), `${name} (B) : un retour`).toBe(true);
  await page.waitForTimeout(400);
  const top = await onTop(page, CHROME);
  expect.soft((top["appbar-close"] ?? 0) + (top["flow-close"] ?? 0), `${name} (B) : un seul retour`).toBe(1);
  expect.soft(top["topbar-logo"], `${name} (B) : pas de bande ORASSO`).toBe(0);
  expect.soft(top["persona-tabbar"], `${name} (B) : pas de barre d'onglets`).toBe(0);
  const box = await close.boundingBox().catch(() => null);
  // Le retour est toujours au même endroit : en haut à droite, cible de 38 px au moins (44 px avec sa marge d'appui).
  expect.soft(box && box.x + box.width, `${name} (B) : ✕ à droite`).toBeGreaterThan(MOBILE.width - 24);
  expect.soft(box?.y ?? 999, `${name} (B) : ✕ en haut`).toBeLessThan(40);
  expect.soft(box?.width ?? 0, `${name} (B) : cible du ✕`).toBeGreaterThanOrEqual(38);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

for (const kind of Object.keys(ACCOUNTS) as Kind[]) {
  test(`${kind} : onglets en mode A, pages hors onglets en mode B (Béton, captures Béton et Sable)`, async ({
    browser,
  }) => {
    test.setTimeout(900_000);
    mkdirSync(DIR, { recursive: true });
    const id = await ids();
    for (const theme of ["beton", "sable"] as const) {
      const { ctx, page } = await open(browser, theme);
      await signIn(page, ACCOUNTS[kind]);
      await choose(page, kind);
      // Mode A : chaque onglet, ouvert par la barre (la bande ne doit pas sauter d'un onglet à l'autre).
      let bandAt: number | null = null;
      for (const [label, route] of TABS[kind]) {
        if (theme === "sable" && route !== SHOTS[kind].tab) continue;
        await page.getByRole("tab", { name: label, exact: true }).first().click();
        await expect(page).toHaveURL(new RegExp(`/${route}(\\?|$)`), { timeout: 30_000 });
        await modeA(page, `${kind} › ${label}`);
        const y =
          (
            await page
              .getByTestId("topbar-logo")
              .first()
              .boundingBox()
              .catch(() => null)
          )?.y ?? null;
        if (bandAt !== null) expect.soft(y, `${kind} › ${label} : la bande n'a pas bougé`).toBe(bandAt);
        bandAt = y;
        if (route === SHOTS[kind].tab) await shot(page, `${kind}-A-${route}-${theme}`);
      }
      // Mode B : les pages hors onglets de la casquette.
      for (const [name, path] of pages(kind, id)) {
        if (theme === "sable" && name !== SHOTS[kind].page) continue;
        await page.goto(path);
        await afterOpening(page);
        await modeB(page, `${kind} › ${name} (${path})`);
        await shot(page, `${kind}-B-${name}-${theme}`);
      }
      await ctx.close();
    }
  });
}

test("feuilles : au-dessus de la bande ORASSO et de la barre (Boîte, Mon QR de compte)", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, ACCOUNTS.fan);
    // La Boîte, ouverte par la bande : une feuille par-dessus l'écran.
    await page.getByRole("button", { name: "Boîte", exact: true }).first().click();
    await page.waitForURL(/\/boite$/, { timeout: 30_000 });
    await expect(page.getByTestId("inbox-all")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    let top = await onTop(page, CHROME);
    expect.soft(top["topbar-logo"], "Boîte : la bande est sous la feuille").toBe(0);
    expect.soft(top["persona-tabbar"], "Boîte : la barre est sous la feuille").toBe(0);
    await shot(page, `feuille-boite-${theme}`);
    // Une feuille d'un onglet : Mon QR de compte, depuis Mon profil.
    await page.goto("/moi");
    await afterOpening(page);
    await modeA(page, "Profil");
    await page.getByTestId("profil-account-qr").click();
    await expect(page.getByText("Mon QR de compte").last()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    top = await onTop(page, CHROME);
    expect.soft(top["topbar-logo"], "QR de compte : la bande est sous la feuille").toBe(0);
    expect.soft(top["persona-tabbar"], "QR de compte : la barre est sous la feuille").toBe(0);
    await shot(page, `feuille-qr-${theme}`);
    await ctx.close();
  }
});

/**
 * Lot M7, tour 2 (relecture Codex) : un écran B ouvert depuis un onglet se ferme sur cet onglet, une fois par casquette
 * (les groupes Pro et Organisateur gardent le retour par défaut des onglets, qui menait au premier onglet).
 */
const CLOSINGS: Record<Kind, { tab: [string, string]; open: (page: Page) => Promise<void>; page: RegExp }> = {
  fan: {
    tab: ["Garage", "garage"],
    open: (page) => page.getByTestId("garage-card").first().click(),
    page: /\/vehicule\//,
  },
  visitor: {
    tab: ["Profil", "profil"],
    open: (page) => page.getByTestId("reglage-preferences").first().click(),
    page: /\/reglages\/preferences/,
  },
  organizer: {
    tab: ["Structure", "structure"],
    open: (page) => page.getByTestId("tile-bans").first().click(),
    page: /\/bannis/,
  },
  pro: {
    tab: ["Ma fiche", "fiche"],
    open: async (page) => {
      await page.getByText("Publications", { exact: true }).first().click();
      await page.getByTestId("pro-new-post").first().click();
    },
    page: /\/publier/,
  },
  provider: {
    tab: ["Profil", "profil"],
    open: (page) => page.getByTestId("reglage-notifications").first().click(),
    page: /\/reglages\/notifications/,
  },
  media: {
    tab: ["Profil", "profil"],
    open: (page) => page.getByTestId("reglage-preferences").first().click(),
    page: /\/reglages\/preferences/,
  },
  admin: {
    tab: ["Registres", "registres"],
    open: (page) => page.getByTestId("admin-link-utilisateurs").first().click(),
    page: /\/utilisateurs/,
  },
};

test("fermeture : le ✕ d'un écran B ouvert depuis un onglet ramène à cet onglet (chaque casquette)", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  for (const kind of Object.keys(CLOSINGS) as Kind[]) {
    const c = CLOSINGS[kind];
    const { ctx, page } = await open(browser, "beton");
    await signIn(page, ACCOUNTS[kind]);
    await choose(page, kind);
    await page.getByRole("tab", { name: c.tab[0], exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/${c.tab[1]}(\\?|$)`), { timeout: 30_000 });
    await page.waitForTimeout(600);
    await c.open(page);
    await expect(page, `${kind} : page ouverte`).toHaveURL(c.page, { timeout: 30_000 });
    await modeB(page, `${kind} › fermeture`);
    await page.locator('[data-testid="appbar-close"], [data-testid="flow-close"]').first().click();
    await expect(page, `${kind} : retour à l'onglet ${c.tab[0]}`).toHaveURL(new RegExp(`/${c.tab[1]}(\\?|$)`), {
      timeout: 30_000,
    });
    await modeA(page, `${kind} › retour`);
    await ctx.close();
  }
});

test("glissement entre onglets : seule la page glisse, la bande ORASSO ne bouge pas", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, ACCOUNTS.fan);
  await afterOpening(page);
  const logo = page.getByTestId("topbar-logo").first();
  await expect(logo).toBeVisible({ timeout: 30_000 });
  const before = await logo.boundingBox();
  // Le geste de la recette du lot 40, sur le haut de la page (pas de carte ni de carrousel sous le doigt).
  await page.mouse.move(320, 112);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(320 + ((60 - 320) * i) / 12, 112 + i * 0.2);
  await page.mouse.up();
  // Pendant que la page qui arrive se gare (220 ms), la bande reste à la même place.
  const seen: { x: number; y: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const box = await page
      .getByTestId("topbar-logo")
      .filter({ visible: true })
      .first()
      .boundingBox()
      .catch(() => null);
    if (box) seen.push({ x: box.x, y: box.y });
    await page.waitForTimeout(30);
  }
  await page.waitForURL(/\/garage/, { timeout: 15_000 });
  expect(seen.length, "bande visible pendant le glissement").toBeGreaterThan(0);
  for (const p of seen) expect(p, "la bande n'a pas bougé").toEqual({ x: before?.x, y: before?.y });
  const after = await page.getByTestId("topbar-logo").filter({ visible: true }).first().boundingBox();
  expect({ x: after?.x, y: after?.y }).toEqual({ x: before?.x, y: before?.y });
  await ctx.close();
});
