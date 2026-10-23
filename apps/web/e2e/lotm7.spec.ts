import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot M7, côté site (« le site raccord », rappel de Damien du 23/10) : les pages connectées suivent les deux modes de
// l'appli.
//   (A) navigation : l'en-tête du site (bande ORASSO : logo, Recherche, Boîte) et la barre d'onglets du compte ;
//   (B) fiche, parcours : l'en-tête de fiche (titre, ✕ à droite qui revient), ni bande ni barre d'onglets.
// Espaces de gestion (organisateur, pro, administration) : leur barre latérale est leur en-tête de navigation ; une fiche
// ou un parcours y garde un retour. Captures Béton et Sable, 390 et 1280 px. Site et API lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m7-captures/site`;
const DESKTOP = { width: 1280, height: 900 } as const;

type Theme = "beton" | "sable";
type Ids = { vehicle: string; pseudo: string; publicVehicle: string; crew: string; provider: string; media: string };

async function ids(): Promise<Ids> {
  const need = async (name: string, text: string) => {
    const v = (await sql<{ v: string }>(text))[0]?.v;
    if (!v) throw new Error(`Seed : pas de ${name}`);
    return v;
  };
  return {
    vehicle: await need(
      "véhicule de Kenji",
      `select v.id as v from vehicles v join "user" u on u.id = v.owner_id
       where u.email = 'kenji@orasso.local' and v.status = 'active' limit 1`,
    ),
    pseudo: await need("pseudo", "select pseudo as v from profiles where pseudo like 'Nina%' limit 1"),
    publicVehicle: await need(
      "véhicule de Nina",
      `select v.id as v from vehicles v join profiles p on p.user_id = v.owner_id
       where p.pseudo like 'Nina%' and v.status = 'active' limit 1`,
    ),
    crew: await need("crew", "select slug as v from crews limit 1"),
    provider: await need("prestataire", "select id as v from provider_profiles where deleted_at is null limit 1"),
    media: await need("profil média", "select id as v from media_profiles limit 1"),
  };
}

/** Pages du compte en mode A (onglets) : nom → adresse. */
const TABS: [string, string][] = [
  ["accueil", "/app"],
  ["explorer", "/app/explorer"],
  ["sorties", "/app/sorties"],
  ["garage", "/app/garage"],
  ["profil", "/app/moi"],
];

/** Pages du compte en mode B (fiche, parcours) : nom → adresse. */
function fiches(id: Ids): [string, string][] {
  return [
    ["fiche-vehicule", `/app/garage/${id.vehicle}`],
    ["ajout-vehicule", "/app/garage/nouveau"],
    ["profil-public", `/u/${id.pseudo}`],
    ["vehicule-public", `/v/${id.publicVehicle}`],
    ["crew", `/c/${id.crew}`],
    ["prestataire-public", `/providers/${id.provider}`],
    ["media-public", `/m/${id.media}`],
    ["securite", "/app/securite"],
    ["sanctions", "/app/sanctions"],
    ["billets", "/app/billets"],
    ["amis", "/app/amis"],
    ["crews", "/app/crews"],
    ["creer-structure", "/app/structure/nouvelle"],
    ["creer-fiche-pro", "/app/pro/nouvelle"],
    ["profil-prestataire", "/app/prestataire"],
    ["profil-media", "/app/media/nouveau"],
    ["aide", "/app/aide"],
  ];
}

/** Un élément vraiment au-dessus : son centre, touché, tombe sur lui. */
async function onTop(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    let n = 0;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        Math.min(r.top + r.height / 2, window.innerHeight - 1),
      );
      if (hit && (hit === el || el.contains(hit))) n++;
    }
    return n;
  }, selector);
}

async function modeA(page: Page, name: string) {
  expect.soft(await onTop(page, ".o-appbar--tab .o-appbar__logo"), `${name} (A) : la bande ORASSO`).toBe(1);
  expect.soft(await onTop(page, ".app__tabs .o-tabbar, .app__tabs nav"), `${name} (A) : la barre d'onglets`).toBe(1);
  expect.soft(await onTop(page, ".o-appbar--flow"), `${name} (A) : pas d'en-tête de fiche`).toBe(0);
}

async function modeB(page: Page, name: string) {
  expect
    .soft(await onTop(page, ".o-appbar--flow .o-appbar__close"), `${name} (B) : le ✕ de l'en-tête de fiche`)
    .toBe(1);
  expect.soft(await onTop(page, ".o-appbar--tab"), `${name} (B) : pas de bande ORASSO`).toBe(0);
  expect.soft(await page.locator(".app__tabs").count(), `${name} (B) : pas de barre d'onglets`).toBe(0);
  const titles = await page.locator("h1").allInnerTexts();
  const norm = titles.map((t) => t.trim().toLowerCase()).filter(Boolean);
  expect.soft(new Set(norm).size, `${name} (B) : pas de titre répété (${titles.join(" | ")})`).toBe(norm.length);
}

async function openSite(browser: Browser, theme: Theme, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  return { ctx, page };
}

async function visit(page: Page, path: string) {
  const res = await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
  return res?.status() ?? 0;
}

for (const [label, viewport] of [
  ["390", MOBILE],
  ["1280", DESKTOP],
] as const) {
  test(`compte du passionné : onglets en mode A, fiches et parcours en mode B (${label} px, Béton et Sable)`, async ({
    browser,
  }) => {
    test.setTimeout(600_000);
    mkdirSync(DIR, { recursive: true });
    const id = await ids();
    for (const theme of ["beton", "sable"] as const) {
      const { ctx, page } = await openSite(browser, theme, viewport);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      for (const [name, path] of TABS) {
        if (theme === "sable" && name !== "garage") continue;
        expect(await visit(page, path), path).toBeLessThan(400);
        await modeA(page, `${name} (${label})`);
        await page.screenshot({ path: `${DIR}/A-${name}-${label}-${theme}.png` });
      }
      for (const [name, path] of fiches(id)) {
        if (theme === "sable" && name !== "fiche-vehicule" && name !== "billets") continue;
        expect(await visit(page, path), path).toBeLessThan(400);
        await modeB(page, `${name} (${label})`);
        await page.screenshot({ path: `${DIR}/B-${name}-${label}-${theme}.png` });
      }
      await ctx.close();
    }
  });

  test(`espaces de gestion : navigation latérale, fiche avec retour (${label} px, Béton et Sable)`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(DIR, { recursive: true });
    const [structure] = await sql<{ slug: string; event: string }>(
      `select s.slug, e.id as event from structures s join events e on e.structure_id = s.id
       where s.name = 'MéditeSportCar' and e.status = 'published' order by e.starts_at desc limit 1`,
    );
    const [pro] = await sql<{ slug: string }>(
      `select p.slug from pro_profiles p join "user" u on u.id = p.owner_user_id where u.email = 'garage@orasso.local'`,
    );
    const pages: [string, string, string][] = [
      ["damien@orasso.local", "orga-evenements", `/orga/${structure?.slug}`],
      ["damien@orasso.local", "orga-page-evenement", `/orga/${structure?.slug}/e/${structure?.event}`],
      ["damien@orasso.local", "orga-creation", `/orga/${structure?.slug}/nouvel-evenement`],
      ["damien@orasso.local", "admin", "/admin"],
      ["garage@orasso.local", "pro-fiche", `/pro/${pro?.slug}`],
    ];
    for (const theme of ["beton", "sable"] as const) {
      let who = "";
      let session: Awaited<ReturnType<typeof openSite>> | null = null;
      for (const [email, name, path] of pages) {
        if (email !== who) {
          await session?.ctx.close();
          session = await openSite(browser, theme, viewport);
          await loginInBrowser(session.page, email, undefined, "/app");
          who = email;
        }
        const page = (session as NonNullable<typeof session>).page;
        expect(await visit(page, path), path).toBeLessThan(400);
        await page.screenshot({ path: `${DIR}/G-${name}-${label}-${theme}.png` });
      }
      await session?.ctx.close();
    }
  });
}

/** Lot M7, tour 2 : le ✕ de l'en-tête de fiche est un vrai lien (sans JavaScript aussi) et revient à l'écran d'origine. */
test("✕ du site sans JavaScript : un lien vers l'écran d'origine (?retour=), jamais vers une adresse extérieure", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const id = await ids();
  const web = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const ctx = await browser.newContext({ viewport: MOBILE, javaScriptEnabled: false });
  const cookies = [{ name: "orasso-theme", value: "beton", url: web }];
  for (const pair of (await login("kenji@orasso.local")).split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: web });
  }
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const close = page.locator(".o-appbar--flow a.o-appbar__close");
  const cases: [string, string][] = [
    [`/app/garage/${id.vehicle}`, "/app/garage"],
    [`/u/${id.pseudo}?retour=${encodeURIComponent("/app/amis")}`, "/app/amis"],
    [`/u/${id.pseudo}?retour=${encodeURIComponent("//evil.example")}`, "/app"],
    [`/v/${id.publicVehicle}?retour=${encodeURIComponent(`/u/${id.pseudo}`)}`, `/u/${id.pseudo}`],
  ];
  for (const [path, back] of cases) {
    await page.goto(`${web}${path}`);
    await expect(close, `${path} : le ✕ est un lien`).toHaveAttribute("href", back);
    // Un seul titre de page (h1), celui de l'en-tête ou celui de la fiche.
    await expect(page.locator("h1"), `${path} : un seul h1`).toHaveCount(1);
  }
  // Sans JavaScript, le lien ramène bien à l'écran d'origine.
  await page.goto(`${web}/u/${id.pseudo}?retour=${encodeURIComponent("/app/amis")}`);
  await close.click();
  await page.waitForURL(/\/app\/amis$/, { timeout: 30_000 });
  await ctx.close();
});
