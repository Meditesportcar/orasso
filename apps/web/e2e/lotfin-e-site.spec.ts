import { mkdirSync } from "node:fs";
import { feedPublishLabels } from "@orasso/shared";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { apiCall, loginInBrowser, setTheme, unique } from "./helpers";
import { r5Crew } from "./lotr5c2-setup";
import { postText } from "./lotr6a-setup";
import { landscape, storiesOf, who } from "./lotr7f3-setup";
import { RELAIS } from "./relais";

// Petit lot de fin, partie E (option B « Comme le Profil » choisie par Damien le 13/11), côté site : le haut compact de
// l'onglet Crew (`/app/crew`), la même ligne que le haut du Profil. Vignette de la couverture (elle ouvre la couverture en grand,
// la description et « Signaler » pour un membre), nom jamais tronqué (▾ quand j'ai plusieurs crews), « N membres · tu es le
// chef », description sur une ligne avec « plus » (elle se déplie avec l'Instagram), Inviter et Réglages à droite (chef) ;
// Discussion sous la ligne à 390 px et sur la ligne à 1 280 px ; onglets soulignés collants avec « Publier » en icône au bout ;
// les sorties restent dans la colonne de droite sur grand écran. API et site lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-fin-e-captures/apres/recette-site`;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function box(page: Page, id: string) {
  const b = await page.getByTestId(id).first().boundingBox();
  expect(b, id).not.toBeNull();
  return b as { x: number; y: number; width: number; height: number };
}

async function open(page: Page, email: string, path: string, theme: "beton" | "sable" = "beton") {
  await setTheme(page, theme);
  await loginInBrowser(page, email, undefined, path);
  await expect(page.getByTestId("crew-head")).toBeVisible();
}

test.describe("grand écran (1 280 px)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("chef : la ligne du haut, Discussion sur la ligne, onglets et « Publier », sorties à droite", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}`);
    await expect(page.getByTestId("crew-name")).toHaveText(crew.name);
    await expect(page.getByTestId("crew-sub")).toHaveText("2 membres · tu es le chef");
    await expect(page.getByTestId("crew-selector")).toHaveCount(0);
    await expect(page.getByTestId("crew-invite")).toHaveAttribute("href", `/c/${crew.slug}/inviter`);
    await expect(page.getByTestId("crew-settings")).toHaveAttribute("href", `/c/${crew.slug}/reglages`);
    const thumb = await box(page, "crew-cover-open");
    const disc = await box(page, "crew-discussion");
    const invite = await box(page, "crew-invite");
    const settings = await box(page, "crew-settings");
    // Discussion monte sur la ligne : à droite de la vignette, sur la même hauteur, avant Inviter et Réglages.
    expect(disc.y).toBeLessThan(thumb.y + thumb.height);
    expect(disc.x).toBeGreaterThan(thumb.x + thumb.width);
    expect(invite.x).toBeGreaterThan(disc.x + disc.width - 1);
    // Inviter et Réglages empilés.
    expect(Math.abs(invite.x - settings.x)).toBeLessThan(2);
    expect(settings.y).toBeGreaterThanOrEqual(invite.y + invite.height - 1);
    // Les sorties restent à droite ; l'onglet « Sorties » n'a plus lieu d'être sur grand écran.
    const feed = await box(page, "crew-feed");
    const outings = await box(page, "crew-outings");
    expect(outings.x).toBeGreaterThan(feed.x + feed.width);
    await expect(page.getByTestId("crew-tab-sorties")).toBeHidden();
    // « Publier » (icône) au bout de la rangée d'onglets.
    const tabs = await box(page, "crew-tabs");
    const pub = await box(page, "crew-feed-publish");
    expect(pub.x).toBeGreaterThan(tabs.x + tabs.width - 4);
    await expect(page.getByTestId("crew-feed-publish")).not.toContainText("Publier");
    await expect(page.getByTestId("crew-feed-publish")).toHaveAttribute("aria-label", "Publier dans le crew");
    // L'ancien composeur du haut du fil a disparu ; « Publier » ouvre la fenêtre de publication.
    await expect(page.getByText("Une photo, un mot")).toHaveCount(0);
    await shot(page, "chef-repos-1280");
    await page.getByTestId("crew-feed-publish").click();
    await expect(page.getByTestId("crew-publish")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("crew-publish")).toBeHidden();
  });

  test("deux crews : le nom ▾ ouvre « Mes crews », le rôle reste sous le nom", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "theo@orasso.local", "/app/crew");
    await expect(page.getByTestId("crew-sub")).toHaveText(/membres? · tu es (membre|le chef)/);
    await expect(page.getByTestId("crew-sub")).not.toContainText("autre");
    await page.getByTestId("crew-selector").click();
    await expect(page.getByTestId("crew-selector-list")).toBeVisible();
    await expect(page.getByTestId("crew-choice-more")).toBeVisible();
    await shot(page, "multi-selecteur-1280");
    await page.getByTestId("crew-choice-cote-vermeille-classic").click();
    await page.waitForURL(/crew=cote-vermeille-classic/);
    await expect(page.getByTestId("crew-name")).toContainText("Côte Vermeille Classic");
  });
});

test.describe("téléphone (390 px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("chef : Discussion sous la ligne, « plus » avec l'Instagram, la vignette ouvre la couverture", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}`, "sable");
    const thumb = await box(page, "crew-cover-open");
    const disc = await box(page, "crew-discussion");
    expect(disc.y).toBeGreaterThanOrEqual(thumb.y + thumb.height - 1);
    expect(disc.width).toBeGreaterThan(300);
    // La description tient sur une ligne ; « plus » la déplie avec l'Instagram, « moins » la replie.
    await expect(page.getByTestId("crew-instagram")).toHaveCount(0);
    await page.getByTestId("crew-description-toggle").click();
    await expect(page.getByTestId("crew-instagram")).toContainText("roussillondrift");
    await shot(page, "chef-plus-390-sable");
    await page.getByTestId("crew-description-toggle").click();
    await expect(page.getByTestId("crew-instagram")).toHaveCount(0);
    // La couverture en grand, la description, l'Instagram ; le chef n'y signale pas son crew.
    await page.getByTestId("crew-cover-open").click();
    await expect(page.getByTestId("crew-cover-dialog")).toBeVisible();
    await expect(page.getByTestId("crew-cover-description")).toContainText("Glisse, japonaises");
    await expect(page.getByTestId("crew-cover-instagram")).toBeVisible();
    await expect(page.getByTestId("report-open")).toHaveCount(0);
    await shot(page, "chef-vignette-390-sable");
  });

  test("membre : « Signaler » est dans la feuille de la couverture, plus au bas de l'espace", async ({ page }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.lea.email, `/app/crew?crew=${crew.slug}`);
    await expect(page.getByTestId("crew-sub")).toHaveText("2 membres · tu es membre");
    await expect(page.getByTestId("crew-invite")).toHaveCount(0);
    await expect(page.getByTestId("crew-settings")).toHaveCount(0);
    await expect(page.getByTestId("report-open")).toBeHidden();
    await page.getByTestId("crew-cover-open").click();
    await expect(page.getByTestId("report-open")).toBeVisible();
    await shot(page, "membre-vignette-390");
  });

  test("les onglets sont collés sous la barre du haut ; « Publier » sur un autre onglet mène au Fil, fenêtre ouverte", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const crew = await r5Crew(unique());
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}&onglet=membres`);
    const pub = page.getByTestId("crew-feed-publish");
    await expect(pub).toHaveAttribute("href", `/app/crew?crew=${crew.slug}&publier=1`);
    await pub.click();
    await expect(page.getByTestId("crew-publish")).toBeVisible({ timeout: 20_000 });
    // Une fois la fenêtre ouverte, l'adresse perd `publier` (navigation du routeur) : un F5 ne la rouvre pas.
    await expect.poll(() => new URL(page.url()).searchParams.has("publier")).toBe(false);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("crew-publish")).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("crew-head")).toBeVisible();
    await expect(page.getByTestId("crew-publish")).toBeHidden();
  });
});

/** Le haut et le bas de la rangée d'onglets collée, dans la fenêtre. */
async function bar(page: Page) {
  const b = await page.locator(".crw-tabsbar").boundingBox();
  expect(b).not.toBeNull();
  return b as { y: number; height: number };
}

test.describe("tour 1", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la rangée d'onglets reste à sa place réelle après défilement, et un début d'onglet est dessous", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const crew = await r5Crew(unique());
    for (let i = 1; i <= 10; i += 1)
      await postText(crew, crew.chef, `Publication n° ${i} : rendez-vous à Thuir à 9 h.`);
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}`);
    await expect(page.getByTestId("crew-post").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 1500));
    // Collée juste sous la barre du haut (--bar-top : 64 px), pas ailleurs dans la page : la condition géométrique est attendue
    // (la rangée se pose quand le défilement est fini), pas une durée fixe.
    await expect
      .poll(async () => Math.abs((await bar(page)).y - 64), { message: "rangée collée à 64 px" })
      .toBeLessThanOrEqual(2);
    await expect(page.getByTestId("crew-cover-open")).not.toBeInViewport();
    // Changer d'onglet (un nouveau document, ~600 ms sous charge) : le début du nouvel onglet est sous la rangée.
    await page.getByTestId("crew-tab-membres").click();
    await expect(page.getByTestId("crew-members")).toBeVisible();
    await expect
      .poll(
        async () => {
          const m = (await page.getByTestId("crew-members").boundingBox()) as { y: number };
          const b2 = await bar(page);
          return m.y >= b2.y + b2.height - 2 && m.y < 600;
        },
        { message: "le début de l'onglet des membres est sous la rangée" },
      )
      .toBe(true);
  });

  test("la pastille des nouvelles publications ramène la publication sous la rangée d'onglets", async ({ page }) => {
    test.setTimeout(240_000);
    const crew = await r5Crew(unique());
    for (let i = 1; i <= 14; i += 1)
      await postText(crew, crew.chef, `Publication n° ${i} : rendez-vous à Thuir à 9 h.`);
    await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}`);
    await expect(page.getByTestId("crew-post").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const fresh = `Nouveauté du bas ${unique()}`;
    await postText(crew, crew.lea, fresh);
    await expect(page.getByTestId("crew-feed-new")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("crew-feed-new").click();
    const post = page.getByTestId("crew-post").filter({ hasText: fresh });
    await expect(post).toHaveCount(1, { timeout: 15_000 });
    await page.waitForTimeout(1200);
    const pb = (await post.boundingBox()) as { y: number };
    const b = await bar(page);
    expect(pb.y, "le début de la publication est sous la rangée collée").toBeGreaterThanOrEqual(b.y + b.height - 2);
    expect(pb.y).toBeLessThan(500);
  });

  test("« Mes crews » passe au-dessus de la rangée collée : chaque choix est cliquable", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, "theo@orasso.local", "/app/crew");
    await page.getByTestId("crew-selector").click();
    const links = page.locator('[data-testid="crew-selector-list"] a');
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i += 1) {
      const covered = await links.nth(i).evaluate((a) => {
        const r = a.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !top || !a.contains(top);
      });
      expect(covered, `le choix n° ${i + 1} est recouvert`).toBe(false);
    }
    await shot(page, "multi-selecteur-390");
  });
});

// Petit lot de fin, partie B1 : les retouches du site relevées par la relecture de la partie E.
test.describe("partie B1", () => {
  test.describe("grand écran (1 280 px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("?onglet=sorties : « Sorties » est masqué et « Fil » porte le soulignement", async ({ page }) => {
      test.setTimeout(180_000);
      const crew = await r5Crew(unique());
      await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}&onglet=sorties`);
      await expect(page.getByTestId("crew-tab-sorties")).toBeHidden();
      const underline = (id: string) =>
        page.getByTestId(id).evaluate((el) => {
          const after = getComputedStyle(el, "::after");
          return { content: after.content, height: after.height };
        });
      // Le soulignement moutarde de 3 px sous « Fil » (même rendu que l'onglet choisi), absent sous « Membres ».
      expect(await underline("crew-tab-fil")).toEqual({ content: '""', height: "3px" });
      expect((await underline("crew-tab-membres")).content).not.toBe('""');
      await expect(page.getByTestId("crew-propose-outing")).toBeVisible();
      await shot(page, "sorties-1280-onglet-fil-souligne");
    });

    test("un seul « Proposer une sortie » dans la page", async ({ page }) => {
      test.setTimeout(180_000);
      const crew = await r5Crew(unique());
      await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}`);
      await expect(page.getByTestId("crew-propose-outing")).toHaveCount(1);
      await expect(page.getByTestId("crew-propose-outing-wide")).toHaveCount(0);
    });
  });

  test.describe("téléphone (390 px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("un seul « Proposer une sortie », sur l'onglet Sorties, en secondaire", async ({ page }) => {
      test.setTimeout(180_000);
      const crew = await r5Crew(unique());
      await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}&onglet=sorties`);
      await expect(page.getByTestId("crew-propose-outing")).toHaveCount(1);
      await expect(page.getByTestId("crew-propose-outing")).toBeVisible();
    });

    test("« Publier » depuis un autre onglet : retirer `publier` de l'adresse ne relance aucun chargeur", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const crew = await r5Crew(unique());
      await open(page, crew.chef.email, `/app/crew?crew=${crew.slug}&onglet=membres`);
      // Les lectures des chargeurs passent par `*.data` (une par route de la page) : on les compte à partir de l'arrivée.
      const loads: string[] = [];
      page.on("request", (r) => {
        if (/\.data(\?|$)/.test(r.url())) loads.push(r.url());
      });
      await page.getByTestId("crew-feed-publish").click();
      await expect(page.getByTestId("crew-publish")).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => new URL(page.url()).searchParams.has("publier")).toBe(false);
      await page.waitForTimeout(1_500);
      // Le chargeur de la page (mes crews, le crew, ses membres, ses demandes) ne se relit pas : aucune lecture ne le nomme (`_routes`
      // absent = tous les chargeurs). Seuls les chargeurs parents (`root`, `layouts/app`) se relisent, c'est leur règle.
      // (L'arrivée sur le Fil, `publier=1`, est une vraie navigation : le chargeur y relit. On ne compte que ce qui suit, sans `publier`.)
      const crewReads = loads.filter((u) => {
        const { searchParams } = new URL(u);
        if (searchParams.has("publier")) return false;
        const routes = searchParams.get("_routes");
        return routes === null || routes.split(",").includes("routes/app-crew");
      });
      expect(
        crewReads,
        `lectures du chargeur de la page après le retrait de publier : ${crewReads.join(" | ")}`,
      ).toEqual([]);
    });
  });
});

test.describe("partie B1, tour 1 : page demandée que le compte ne tient pas", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("site : ?auteur= d'une page non tenue : message et choix explicite, aucun repli sur « Moi »", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setTheme(page, "beton");
    await loginInBrowser(
      page,
      "damien@orasso.local",
      undefined,
      "/app/story/publier?auteur=s%3A11111111-1111-4111-8111-111111111111",
    );
    await expect(page.getByTestId("story-author-lost")).toBeVisible();
    await expect(page.getByTestId("story-author-lost")).toContainText("Tu n'as plus accès à cette page");
    // Aucun formulaire de publication : la photo ne peut pas partir.
    await expect(page.getByTestId("story-choose")).toHaveCount(0);
    await expect(page.getByTestId("story-publish")).toHaveCount(0);
    await shot(page, "story-page-perdue-390");
    // Le choix explicite ouvre l'écran de la personne.
    await page.getByTestId("story-author-lost-me").click();
    await page.waitForURL(/auteur=me/);
    await expect(page.getByTestId("story-author-lost")).toHaveCount(0);
  });
});

test.describe("partie B1, tour 2 : le compte change pendant le retrait de `publier`", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("site : rien du Crew de A n'est affiché sous B ; la page se relit", async ({ browser }) => {
    test.setTimeout(240_000);
    const crew = await r5Crew(unique());
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Aucune annonce de session n'arrive : seul le chargeur parent relu dit que le compte a changé.
    await ctx.addInitScript(() => {
      class Silent {
        onmessage = null;
        postMessage() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
      }
      (window as unknown as { BroadcastChannel: unknown }).BroadcastChannel = Silent;
      window.addEventListener("storage", (e) => e.stopImmediatePropagation(), true);
    });
    const a = await ctx.newPage();
    // La relecture des chargeurs parents (déclenchée par le retrait de `publier`) attend que B soit connecté.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let parentRead: () => void = () => undefined;
    const parentReading = new Promise<void>((resolve) => {
      parentRead = resolve;
    });
    await a.route(/\/app\/crew\.data/, async (route) => {
      const routes = new URL(route.request().url()).searchParams.get("_routes");
      if (routes !== null && !routes.split(",").includes("routes/app-crew")) {
        parentRead();
        await held;
      }
      return route.continue();
    });
    await setTheme(a, "beton");
    await loginInBrowser(a, crew.chef.email, undefined, "/app/fil");
    // (Pas de `loginInBrowser` ici : sa fin d'attente `networkidle` ne viendrait jamais avec la lecture retenue.)
    await a.goto(`/app/crew?crew=${crew.slug}&publier=1`);
    await parentReading;
    // La page de A (ses sorties) est affichée tant que rien n'a changé.
    await expect(a.getByTestId("crew-outings")).toBeAttached();
    // B se connecte dans un autre onglet (le cookie de session change), puis la relecture parent répond pour B.
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await loginInBrowser(await other.newPage(), "sarah@orasso.local", undefined, "/app/fil");
    const cookies = await other.cookies();
    await other.close();
    await ctx.clearCookies();
    await ctx.addCookies(cookies);
    release();
    // B n'a aucun crew : la page se relit sous B (le chargeur ne rend plus le crew de A) et montre « Pas encore de crew ».
    await expect
      .poll(
        () =>
          a
            .evaluate(() => {
              const st = (
                window as unknown as {
                  __reactRouterDataRouter?: { state: { loaderData: Record<string, { mode?: string }> } };
                }
              ).__reactRouterDataRouter?.state.loaderData;
              return st?.["routes/app-crew"]?.mode;
            })
            // Le Crew se recharge en entier (tour 6) : pendant le rechargement, le contexte est détruit ; le sondage reprend.
            .catch(() => undefined),
        { timeout: 30_000 },
      )
      .toBe("none");
    await expect(a.getByTestId("crew-outings")).toHaveCount(0);
    await ctx.close();
  });
});

/** B se connecte (dans un autre contexte), puis ses cookies remplacent ceux de A d'un coup ; un onglet de B annonce alors le compte à A. */
async function signInOther(browser: Browser, ctx: BrowserContext, email: string) {
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await loginInBrowser(await other.newPage(), email, undefined, "/app/fil");
  const cookies = await other.cookies();
  await other.close();
  await ctx.clearCookies();
  await ctx.addCookies(cookies);
  const b = await ctx.newPage();
  await b.goto("/app/fil");
}

// Aides communes aux recettes de l'annonce de session (tours 3 et 6).
const loadedUser = (page: Page) =>
  page
    .evaluate(
      () =>
        (
          window as unknown as {
            __reactRouterDataRouter?: { state: { loaderData: Record<string, { userId?: string }> } };
          }
        ).__reactRouterDataRouter?.state.loaderData["routes/app-crew"]?.userId ?? null,
    )
    // Le Crew se recharge en entier (tour 6) : pendant le rechargement, le contexte de la page est détruit ; le sondage reprend.
    .catch(() => null);

const announce = (page: Page, userId: string | null) =>
  page.evaluate((id) => {
    const c = new BroadcastChannel("orasso-session");
    c.postMessage({ userId: id });
    c.close();
  }, userId);

test.describe("partie B1, tour 3 : le compte annoncé par un autre onglet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("l'annonce de B arrive pendant le retrait de `publier` : la page se relit sous B, jamais « Mise à jour… » à vie", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const crew = await r5Crew(unique());
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let parentRead: () => void = () => undefined;
    const parentReading = new Promise<void>((resolve) => {
      parentRead = resolve;
    });
    let armed = false;
    await a.route(/\/app\/crew\.data/, async (route) => {
      const routes = new URL(route.request().url()).searchParams.get("_routes");
      if (armed && routes !== null && !routes.split(",").includes("routes/app-crew")) {
        armed = false;
        parentRead();
        await held;
      }
      return route.continue();
    });
    await setTheme(a, "beton");
    await loginInBrowser(a, crew.chef.email, undefined, "/app/fil");
    armed = true;
    await a.goto(`/app/crew?crew=${crew.slug}&publier=1`);
    await parentReading;
    // L'annonce de B arrive PENDANT cette navigation (les annonces ne sont pas neutralisées).
    await signInOther(browser, ctx, crew.paul.email);
    release();
    await expect.poll(() => loadedUser(a), { timeout: 30_000 }).toBe(crew.paul.id);
    await expect(a.getByTestId("crew-refreshing")).toHaveCount(0, { timeout: 30_000 });
    await expect(a.getByTestId("crew-outings")).toHaveCount(0);
    await ctx.close();
  });
});

// Tour 6 : le Crew ne réconcilie plus, il se recharge. Un observateur du DOM (installé avant tout script de la page, valable aussi
// après un rechargement : il lit sessionStorage) note, à n'importe quel moment, qu'un élément interdit est apparu.
const FORBID = "__b1forbid";
const LEAK = "__b1leak";
const SEEN = "__b1seen";

async function watchLeaks(ctx: BrowserContext) {
  await ctx.addInitScript(
    ([forbidKey, leakKey, seenKey]) => {
      const check = () => {
        try {
          const seen = new Set<string>(JSON.parse(sessionStorage.getItem(seenKey as string) ?? "[]"));
          for (const id of ["crew-refreshing", "crew-refresh-failed"]) {
            if (document.querySelector(`[data-testid="${id}"]`)) seen.add(id);
          }
          sessionStorage.setItem(seenKey as string, JSON.stringify([...seen]));
          // Armé seulement quand la page a montré « Mise à jour… » (ou l'échec) : avant, les données de A sont légitimes et une
          // mutation du DOM sans rapport ne doit pas être prise pour une fuite.
          const armed = seen.has("crew-refreshing") || seen.has("crew-refresh-failed");
          const raw = sessionStorage.getItem(forbidKey as string);
          const rule = raw ? (JSON.parse(raw) as { sel: string; origin: number | null }) : null;
          // `origin` : l'interdiction ne vaut que pour le document qui l'a posée (le rechargé sous le même compte retrouve ses données).
          if (
            armed &&
            rule &&
            (rule.origin === null || rule.origin === performance.timeOrigin) &&
            document.querySelector(rule.sel)
          ) {
            sessionStorage.setItem(leakKey as string, rule.sel);
          }
        } catch {
          // Stockage indisponible : rien à noter.
        }
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true });
      document.addEventListener("DOMContentLoaded", check);
      window.addEventListener("load", check);
    },
    [FORBID, LEAK, SEEN],
  );
}
const forbid = (page: Page, selector: string) =>
  page.evaluate(
    ([k, v]) => sessionStorage.setItem(k as string, JSON.stringify({ sel: v, origin: null })),
    [FORBID, selector],
  );
const leaked = (page: Page) => page.evaluate((k) => sessionStorage.getItem(k), LEAK);
/** Les écrans « Mise à jour… » / « Recharger la page » vus à un moment quelconque (survit aux rechargements). */
const seen = (page: Page) => page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? "[]") as string[], SEEN);
/** Annonce d'un autre compte (une autre fenêtre) ET interdit un élément, dans le même instant : rien n'est interdit avant l'annonce. */
const announceForbidding = (page: Page, userId: string | null, selector: string, thisDocumentOnly = false) =>
  page.evaluate(
    ([id, k, sel, only]) => {
      sessionStorage.setItem(k as string, JSON.stringify({ sel, origin: only ? performance.timeOrigin : null }));
      const c = new BroadcastChannel("orasso-session");
      c.postMessage({ userId: id });
      c.close();
    },
    [userId, FORBID, selector, thisDocumentOnly],
  );

/** Les cookies de session d'un compte (connexion dans un contexte jetable). */
async function cookiesOf(browser: Browser, email: string) {
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await loginInBrowser(await other.newPage(), email, undefined, "/app/fil");
  const cookies = await other.cookies();
  await other.close();
  return cookies;
}
async function swapCookies(ctx: BrowserContext, cookies: Awaited<ReturnType<typeof cookiesOf>>) {
  await ctx.clearCookies();
  await ctx.addCookies(cookies);
}

/** Retient le prochain chargement de document de /app/crew (le rechargement) jusqu'à `release()`. */
async function holdNextDocument(page: Page, prepare = false) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let armed = false;
  // La réponse préparée par le serveur sous le compte courant (statut et corps), pour l'inspecter pendant qu'elle est retenue.
  let response: { status: number; body: string } | null = null;
  await page.route(/\/app\/crew(\?|$)/, async (route) => {
    if (armed && route.request().resourceType() === "document") {
      armed = false;
      if (prepare) {
        // La réponse est RÉELLEMENT préparée par le serveur sous le compte courant (B) puis retenue : le cookie change ensuite.
        // Sans suivre les redirections : une redirection (vers la connexion) ne se prendrait pas pour la réponse de B.
        const prepared = await route.fetch({ maxRedirects: 0 });
        response = { status: prepared.status(), body: await prepared.text() };
        reached();
        await held;
        return route.fulfill({ response: prepared });
      }
      reached();
      await held;
    }
    return route.continue();
  });
  return {
    arm: () => {
      armed = true;
    },
    arrived,
    release,
    prepared: () => response,
  };
}

/**
 * La réponse retenue est bien celle de B (200, et l'identifiant de B y figure : c'est ce que dit une page préparée sous sa session) et
 * ne contient, ni dans le HTML ni dans les données sérialisées, les données du Crew de B (son identifiant, son adresse, son nom, les
 * clés `crews`, `members` et `invitations` que le chargeur ne renvoie que hors rechargement) ni le pseudo de la personne dont la
 * page se rechargeait. Elle ne prouve rien d'autre que l'absence de ces chaînes : la mise en page a sa propre recette.
 */
function expectNoPrivateData(
  held: { status: number; body: string } | null,
  crew: { id: string; slug: string; name: string },
  prepared: { userId: string; foreignPseudo: string },
) {
  expect(held, "la réponse retenue").not.toBeNull();
  const { status, body } = held as { status: number; body: string };
  expect(status).toBe(200);
  expect(body.includes(prepared.userId), "la réponse retenue est celle de B (son identifiant y figure)").toBe(true);
  for (const secret of [crew.id, crew.slug, crew.name, prepared.foreignPseudo]) {
    expect(body.includes(secret), `la réponse retenue contient « ${secret} »`).toBe(false);
  }
  for (const key of ["crews", "members", "invitations"]) {
    expect(body.includes(`"${key}"`), `la réponse retenue contient la clé « ${key} »`).toBe(false);
  }
}

const INVITATION = '[data-testid="crew-tab-invitation"]';
const OUTINGS = '[data-testid="crew-outings"]';

test.describe("partie B1, tour 6 : le Crew se recharge au lieu de se réconcilier", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Sarah est invitée par le chef (ses invitations sont les données privées de A) ; Paul n'a ni crew ni invitation. */
  async function setup(browser: Browser) {
    const crew = await r5Crew(unique());
    expect(
      (await apiCall(crew.chef.cookie, "POST", `/crews/${crew.id}/invitations`, { pseudo: crew.sarah.pseudo })).status,
    ).toBe(201);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await watchLeaks(ctx);
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    await loginInBrowser(a, crew.sarah.email, undefined, "/app/crew");
    await expect(a.getByTestId("crew-tab-invitation")).toHaveCount(1);
    return { crew, ctx, a };
  }

  test("A → annonce de B : les données de A sont masquées tout de suite, la page finit sous B", async ({ browser }) => {
    test.setTimeout(240_000);
    const { crew, ctx, a } = await setup(browser);
    const hold = await holdNextDocument(a);
    const paul = await cookiesOf(browser, crew.paul.email);
    hold.arm();
    await swapCookies(ctx, paul);
    await announceForbidding(a, crew.paul.id, INVITATION);
    // Le rechargement est parti mais pas revenu : rien de A n'est affiché (l'observateur le vérifie à chaque changement du DOM).
    await hold.arrived;
    hold.release();
    await expect.poll(() => loadedUser(a), { timeout: 30_000 }).toBe(crew.paul.id);
    await expect(a.getByTestId("crew-tab-none")).toBeVisible();
    await expect(a.getByTestId("crew-tab-invitation")).toHaveCount(0);
    await expect(a.getByTestId("crew-refreshing")).toHaveCount(0);
    await expect(a.getByTestId("crew-refresh-failed")).toHaveCount(0);
    expect(await leaked(a), "une donnée de A est apparue sous B").toBeNull();
    expect(await seen(a), "« Mise à jour… » a été affiché").toContain("crew-refreshing");
    await ctx.close();
  });

  test("tour 11 : page restaurée (vrai pageshow persisté) pendant un rechargement : « Mise à jour… » reste et le bouton s'ajoute dessous", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { crew, ctx, a } = await setup(browser);
    const hold = await holdNextDocument(a);
    const paul = await cookiesOf(browser, crew.paul.email);
    // Pendant la navigation retenue, la page ne répond plus aux appels du test : elle se signale par la console, et un vrai
    // événement `pageshow` persisté part de la fenêtre 300 ms après qu'elle a affiché « Mise à jour… » (rechargement réellement lancé) ;
    // le bouton doit venir de la restauration, donc avant 10 s (le minuteur de « Recharger la page » est de 15 s).
    const events: string[] = [];
    // Dates (performance.now() du document) du `pageshow` envoyé et de l'apparition du bouton : l'écart dit que le bouton vient de la
    // restauration, pas du minuteur de 15 s ni d'un hasard de la marge.
    const at: Record<string, number> = {};
    a.on("console", (m) => {
      const text = m.text();
      if (!text.startsWith("b1seen:")) return;
      const [id, t] = text.slice(7).split("@");
      events.push(id as string);
      at[id as string] = Number(t);
    });
    await a.evaluate(() => {
      const seen = new Set<string>();
      const look = () => {
        for (const id of ["crew-refreshing", "crew-refresh-slow"]) {
          if (!seen.has(id) && document.querySelector(`[data-testid="${id}"]`)) {
            seen.add(id);
            console.log(`b1seen:${id}@${performance.now()}`);
            if (id === "crew-refreshing") {
              setTimeout(() => {
                console.log(`b1seen:pageshow@${performance.now()}`);
                window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
              }, 300);
            }
          }
        }
      };
      new MutationObserver(look).observe(document, { childList: true, subtree: true });
    });
    hold.arm();
    await swapCookies(ctx, paul);
    await announceForbidding(a, crew.paul.id, INVITATION);
    await hold.arrived;
    // « Mise à jour… » d'abord, sans bouton ; puis, à la restauration, le bouton s'ajoute dessous sans que « Mise à jour… » parte.
    await expect.poll(() => events, { timeout: 10_000 }).toEqual(["crew-refreshing", "pageshow", "crew-refresh-slow"]);
    // Le bouton arrive tout de suite après la restauration (moins de 2 s), bien avant le minuteur de 15 s.
    const gap = (at["crew-refresh-slow"] as number) - (at.pageshow as number);
    expect(gap, `écart entre le pageshow et le bouton : ${gap} ms`).toBeGreaterThanOrEqual(0);
    expect(gap, `écart entre le pageshow et le bouton : ${gap} ms`).toBeLessThan(2_000);
    hold.release();
    await expect.poll(() => loadedUser(a), { timeout: 30_000 }).toBe(crew.paul.id);
    await expect(a.getByTestId("crew-refresh-slow")).toHaveCount(0);
    await ctx.close();
  });

  test("A → B → C rapprochés : la réponse préparée sous B, rendue sous C : jamais les données de B, la page finit sous C", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { crew, ctx, a } = await setup(browser);
    const hold = await holdNextDocument(a, true);
    const other = await ctx.newPage();
    await other.goto("/app/fil");
    const chef = await cookiesOf(browser, crew.chef.email);
    const paul = await cookiesOf(browser, crew.paul.email);
    // Ni les invitations de A (Sarah) ni le crew de B (le chef) ne doivent jamais s'afficher.
    hold.arm();
    await swapCookies(ctx, chef);
    await announceForbidding(a, crew.chef.id, `${INVITATION}, ${OUTINGS}`);
    // Le serveur a rendu le rechargement sous B (réponse lue par `route.fetch()`) ; elle est retenue pendant que C se connecte et
    // s'annonce : l'ANCIEN document reçoit l'annonce de C, le nouveau n'est pas encore là.
    await hold.arrived;
    expectNoPrivateData(hold.prepared(), crew, { userId: crew.chef.id, foreignPseudo: crew.sarah.pseudo });
    await swapCookies(ctx, paul);
    await announce(other, crew.paul.id);
    hold.release();
    await expect.poll(() => loadedUser(a), { timeout: 30_000 }).toBe(crew.paul.id);
    await expect(a.getByTestId("crew-tab-none")).toBeVisible();
    await expect(a.getByTestId("crew-refreshing")).toHaveCount(0);
    await expect(a.getByTestId("crew-refresh-failed")).toHaveCount(0);
    expect(await leaked(a), "une donnée de A ou de B est apparue sous C").toBeNull();
    expect(await seen(a), "« Mise à jour… » a été affiché").toContain("crew-refreshing");
    await ctx.close();
  });

  test("A → B, la réponse préparée sous B est retenue, B se déconnecte : jamais les données de B, la page de connexion", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { crew, ctx, a } = await setup(browser);
    const hold = await holdNextDocument(a, true);
    const other = await ctx.newPage();
    await other.goto("/app/fil");
    const chef = await cookiesOf(browser, crew.chef.email);
    // Ni les invitations de A (Sarah) ni le crew de B (le chef) ne doivent jamais s'afficher.
    hold.arm();
    await swapCookies(ctx, chef);
    await announceForbidding(a, crew.chef.id, `${INVITATION}, ${OUTINGS}`);
    await hold.arrived;
    expectNoPrivateData(hold.prepared(), crew, { userId: crew.chef.id, foreignPseudo: crew.sarah.pseudo });
    // Pendant que la réponse de B est retenue : B se déconnecte (plus de session) et l'annonce.
    await ctx.clearCookies();
    await announce(other, null);
    hold.release();
    await a.waitForURL(/connexion/, { timeout: 60_000 });
    expect(await leaked(a), "une donnée de A ou de B est apparue après la déconnexion").toBeNull();
    expect(await seen(a), "« Mise à jour… » a été affiché").toContain("crew-refreshing");
    await ctx.close();
  });

  test("A → B → A : la page finit sous A, sans « Recharger la page »", async ({ browser }) => {
    test.setTimeout(240_000);
    const { crew, ctx, a } = await setup(browser);
    const hold = await holdNextDocument(a);
    const other = await ctx.newPage();
    await other.goto("/app/fil");
    const paul = await cookiesOf(browser, crew.paul.email);
    const sarah = await cookiesOf(browser, crew.sarah.email);
    await forbid(a, '[data-testid="crew-refresh-failed"]');
    hold.arm();
    await swapCookies(ctx, paul);
    await announce(a, crew.paul.id);
    await hold.arrived;
    await swapCookies(ctx, sarah);
    await announce(other, crew.sarah.id);
    hold.release();
    await expect.poll(() => loadedUser(a), { timeout: 30_000 }).toBe(crew.sarah.id);
    await expect(a.getByTestId("crew-tab-invitation")).toHaveCount(1);
    await expect(a.getByTestId("crew-refreshing")).toHaveCount(0);
    await expect(a.getByTestId("crew-refresh-failed")).toHaveCount(0);
    expect(await leaked(a), "« Recharger la page » est apparu").toBeNull();
    await ctx.close();
  });

  test("une annonce d'un autre compte sans changement de session : masquée, puis la page de A revient", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { crew, ctx, a } = await setup(browser);
    const hold = await holdNextDocument(a);
    hold.arm();
    await announceForbidding(a, "un-autre-compte", INVITATION, true);
    await hold.arrived;
    hold.release();
    await expect.poll(() => loadedUser(a), { timeout: 30_000 }).toBe(crew.sarah.id);
    await expect(a.getByTestId("crew-tab-invitation")).toHaveCount(1);
    await expect(a.getByTestId("crew-refresh-failed")).toHaveCount(0);
    expect(await leaked(a), "une invitation de A est apparue pendant la mise à jour").toBeNull();
    expect(await seen(a)).toContain("crew-refreshing");
    await ctx.close();
  });

  test("déconnexion annoncée : la page de connexion, jamais les invitations de A", async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, a } = await setup(browser);
    await ctx.clearCookies();
    await announceForbidding(a, null, INVITATION);
    await a.waitForURL(/connexion/, { timeout: 60_000 });
    expect(await leaked(a), "une invitation de A est apparue après la déconnexion").toBeNull();
    await ctx.close();
  });

  test("l'annonce de sa propre fenêtre (la mise en page) n'entraîne ni masquage ni rechargement", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, a } = await setup(browser);
    // Cette recette montre seulement que l'annonce de sa propre mise en page (même compte que les données) ne déclenche rien ; le cas
    // qui discrimine (une annonce de cette fenêtre qui dirait un AUTRE compte reste ignorée) est couvert par `sessionReload.test.ts`
    // (`nextAnnounced`, `isForeign`) et `sessionChannel.test.ts` (`self`).
    // Un rechargement de la page fait annoncer de nouveau son compte par la mise en page : l'annonce arrive au Crew comme un message
    // BroadcastChannel de la même fenêtre.
    let loads = 0;
    a.on("load", () => {
      loads += 1;
    });
    await forbid(a, '[data-testid="crew-refreshing"]');
    await a.reload();
    await expect(a.getByTestId("crew-tab-invitation")).toHaveCount(1);
    // Attente fixe : on prouve une absence (aucun signal ne marque la fin de la livraison asynchrone de l'annonce).
    await a.waitForTimeout(1500);
    expect(loads, "chargements de la page : le nôtre seul").toBe(1);
    await expect(a.getByTestId("crew-refreshing")).toHaveCount(0);
    expect(await leaked(a), "« Mise à jour… » est apparu").toBeNull();
    // Aucun rechargement automatique n'a été noté.
    expect(await a.evaluate(() => sessionStorage.getItem("orasso-reloads:crew"))).toBeNull();
    await ctx.close();
  });

  test("boucle forcée : après trois chargements, erreur et « Recharger la page » (qui remet le compteur à zéro)", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, a } = await setup(browser);
    // Chaque page chargée reçoit sans fin l'annonce d'un autre compte : le rechargement ne résout jamais la discordance.
    await ctx.addInitScript(() => {
      setInterval(() => {
        const c = new BroadcastChannel("orasso-session");
        c.postMessage({ userId: "un-autre-compte" });
        c.close();
      }, 300);
    });
    let docs = 0;
    a.on("request", (r) => {
      if (r.isNavigationRequest() && /\/app\/crew(\?|$)/.test(r.url())) docs += 1;
    });
    await a.goto("/app/crew");
    await expect(a.getByTestId("crew-refresh-failed")).toBeVisible({ timeout: 60_000 });
    await expect(a.getByTestId("crew-refresh-failed")).toContainText("Impossible de mettre ton compte à jour");
    await expect(a.getByRole("button", { name: "Recharger la page" })).toBeVisible();
    await expect(a.getByTestId("crew-refreshing")).toHaveCount(0);
    await expect(a.getByTestId("crew-tab-invitation")).toHaveCount(0);
    // Le chargement de départ et deux rechargements automatiques, pas un de plus.
    expect(docs).toBe(3);
    // Le compteur (clé `orasso-reloads:crew`) a noté exactement ces deux rechargements.
    const stamps = await a.evaluate(
      () => JSON.parse(sessionStorage.getItem("orasso-reloads:crew") ?? "[]") as number[],
    );
    expect(stamps).toHaveLength(2);
    // Le geste de l'utilisateur remet le compteur à zéro : un rechargement manuel, puis de nouveau deux automatiques.
    await a.getByRole("button", { name: "Recharger la page" }).click();
    await expect.poll(() => docs, { timeout: 60_000 }).toBe(6);
    await expect(a.getByTestId("crew-refresh-failed")).toBeVisible({ timeout: 60_000 });
    expect(docs).toBe(6);
    await ctx.close();
  });

  test("stockage indisponible : un seul rechargement automatique, puis « Recharger la page »", async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, a } = await setup(browser);
    await ctx.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new Error("stockage bloqué");
        },
      });
      setInterval(() => {
        const c = new BroadcastChannel("orasso-session");
        c.postMessage({ userId: "un-autre-compte" });
        c.close();
      }, 300);
    });
    let docs = 0;
    a.on("request", (r) => {
      if (r.isNavigationRequest() && /\/app\/crew(\?|$)/.test(r.url())) docs += 1;
    });
    await a.goto("/app/crew");
    await expect(a.getByTestId("crew-refresh-failed")).toBeVisible({ timeout: 60_000 });
    await expect(a.getByRole("button", { name: "Recharger la page" })).toBeVisible();
    await expect(a.getByTestId("crew-tab-invitation")).toHaveCount(0);
    // Le chargement de départ et un seul rechargement automatique.
    expect(docs).toBe(2);
    await ctx.close();
  });
});

test.describe("partie B1, tour 4 : composeur de story du site", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function toSend(page: Page, email: string, caption: string) {
    await loginInBrowser(page, email, undefined, "/app/story/publier");
    await page.getByTestId("story-file").setInputFiles(landscape());
    await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("story-plate-none").click();
    await page.getByTestId("story-plate-none-yes").click();
    await page.getByTestId("story-caption").fill(caption);
    await expect(page.getByTestId("story-publish-send")).toBeEnabled();
  }

  test("l'annonce de B pendant l'envoi : le brouillon de A est masqué tout de suite, état neutre, puis l'issue", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const author = await who("StB1Neutre");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    const SECRET = "Brouillon secret de A";
    await toSend(a, author.email, SECRET);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      reached = resolve;
    });
    await a.route(/\/api\/me\/stories$/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      reached();
      await held;
      return route.continue();
    });
    await a.getByTestId("story-publish-send").click();
    await arrived;
    await signInOther(browser, ctx, "sarah@orasso.local");
    // Pendant l'envoi encore en cours : rien du brouillon de A (photo, légende) n'est affiché.
    await expect(a.getByTestId("story-stale-sending")).toBeVisible({ timeout: 30_000 });
    await expect(a.getByTestId("story-caption")).toHaveCount(0);
    await expect(a.getByTestId("story-fit")).toHaveCount(0);
    await expect(a.getByText(SECRET)).toHaveCount(0);
    release();
    // L'issue : l'API refuse (la session est celle de B) ; aucune donnée de A.
    await expect(a.getByTestId("story-stale")).toBeVisible({ timeout: 60_000 });
    await expect(a.getByText(SECRET)).toHaveCount(0);
    await ctx.close();
  });

  test("un envoi enregistré dont la réponse se perd, puis un refus, puis le changement de compte : « peut-être publiée »", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const author = await who("StB1Perte");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    await toSend(a, author.email, "Envoi à réponse perdue");
    let calls = 0;
    let created: { status: number; id: string | null } = { status: 0, id: null };
    await a.route(/\/api\/me\/stories$/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      if (calls === 1) {
        // La création est réellement enregistrée (201 et identifiant vérifiés plus bas), la réponse se perd.
        const real = await route.fetch();
        created = {
          status: real.status(),
          id: ((await real.json().catch(() => null)) as { id?: string } | null)?.id ?? null,
        };
        return route.abort("failed");
      }
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "forbidden", message: "Accès refusé" } }),
      });
    });
    await a.getByTestId("story-publish-send").click();
    await expect(a.getByTestId("story-error")).toBeVisible({ timeout: 60_000 });
    await expect(a.getByTestId("story-publish-send")).toBeEnabled();
    await a.getByTestId("story-publish-send").click();
    await expect.poll(() => calls, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    await expect(a.getByTestId("story-publish-send")).toBeEnabled({ timeout: 60_000 });
    await signInOther(browser, ctx, "sarah@orasso.local");
    await expect(a.getByTestId("story-stale")).toContainText("a peut-être été publiée", { timeout: 30_000 });
    await expect(a.getByTestId("story-stale")).not.toContainText("recharge la page avant de publier");
    // La première création était bien enregistrée (201, identifiant) : la story existe, une seule.
    expect(created.status).toBe(201);
    expect(created.id).toBeTruthy();
    const stories = await storiesOf(author, author.id);
    expect(stories.map((x) => x.id)).toEqual([created.id]);
    await ctx.close();
  });

  test("un 409 account_changed reçu sans annonce de session verrouille l'écran : rien du brouillon de A n'est affiché", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const author = await who("StB1Conflit");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    const SECRET = "Brouillon de A sous un 409";
    await toSend(a, author.email, SECRET);
    await a.route(/\/api\/me\/stories$/, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: { code: "account_changed", message: "La session n'est plus celle de ce brouillon." },
            }),
          })
        : route.continue(),
    );
    await a.getByTestId("story-publish-send").click();
    // Aucune annonce n'est arrivée : le 409 suffit à verrouiller l'écran, sans message d'erreur ni brouillon.
    await expect(a.getByTestId("story-stale")).toBeVisible({ timeout: 60_000 });
    // Le message est celui du compte changé (recharge la page), pas « peut-être publiée » : aucun envoi antérieur n'est incertain.
    await expect(a.getByTestId("story-stale")).toContainText(feedPublishLabels.accountChanged);
    await expect(a.getByTestId("story-stale")).not.toContainText("peut-être");
    await expect(a.getByTestId("story-error")).toHaveCount(0);
    await expect(a.getByTestId("story-caption")).toHaveCount(0);
    await expect(a.getByText(SECRET)).toHaveCount(0);
    await ctx.close();
  });

  test("un envoi enregistré dont la réponse se perd, puis un 409 account_changed sans annonce : « peut-être publiée »", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const author = await who("StB1Perte409");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    const SECRET = "Brouillon de A, réponse perdue puis 409";
    await toSend(a, author.email, SECRET);
    let calls = 0;
    let created: { status: number; id: string | null } = { status: 0, id: null };
    await a.route(/\/api\/me\/stories$/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls += 1;
      if (calls === 1) {
        // La création est réellement enregistrée (201 et identifiant vérifiés plus bas), la réponse se perd.
        const real = await route.fetch();
        created = {
          status: real.status(),
          id: ((await real.json().catch(() => null)) as { id?: string } | null)?.id ?? null,
        };
        return route.abort("failed");
      }
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "account_changed", message: "La session n'est plus celle de ce brouillon." },
        }),
      });
    });
    await a.getByTestId("story-publish-send").click();
    await expect(a.getByTestId("story-error")).toBeVisible({ timeout: 60_000 });
    await expect(a.getByTestId("story-publish-send")).toBeEnabled();
    await a.getByTestId("story-publish-send").click();
    // Aucune annonce de session : le 409 verrouille l'écran, et l'envoi antérieur reste incertain.
    await expect(a.getByTestId("story-stale")).toBeVisible({ timeout: 60_000 });
    await expect(a.getByTestId("story-stale")).toContainText("a peut-être été publiée");
    await expect(a.getByTestId("story-stale")).not.toContainText("recharge la page avant de publier");
    await expect(a.getByText(SECRET)).toHaveCount(0);
    expect(calls).toBe(2);
    expect(created.status).toBe(201);
    expect(created.id).toBeTruthy();
    const stories = await storiesOf(author, author.id);
    expect(stories.map((x) => x.id)).toEqual([created.id]);
    await ctx.close();
  });
});

// B2a : le POST de publication d'une story a un délai (20 s) ; au délai, l'issue est « incertaine » (la story est peut-être publiée),
// jamais un échec certain ni un état neutre sans fin.
test.describe("B2a : une publication de story qui ne répond pas", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function toSend(page: Page, email: string, caption: string) {
    await loginInBrowser(page, email, undefined, "/app/story/publier");
    await page.getByTestId("story-file").setInputFiles(landscape());
    await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("story-plate-none").click();
    await page.getByTestId("story-plate-none-yes").click();
    await page.getByTestId("story-caption").fill(caption);
    await expect(page.getByTestId("story-publish-send")).toBeEnabled();
  }

  /** Le POST de la story est retenu sans fin (aucune réponse, jamais d'erreur réseau) ; compte les envois. */
  async function neverAnswer(page: Page) {
    const sent = { posts: 0 };
    await page.route(/\/api\/me\/stories$/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      sent.posts += 1;
      await new Promise<void>(() => undefined);
    });
    return sent;
  }

  test("sans réponse : au délai, « Ta story a peut-être été publiée » (pas un échec certain), et l'envoi peut être repris", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const author = await who("StB2aDelai");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    await toSend(a, author.email, "Envoi sans réponse");
    const sent = await neverAnswer(a);
    await a.getByTestId("story-publish-send").click();
    // L'envoi est en cours (le bouton est désactivé) tant que le délai de 20 s n'est pas écoulé.
    await expect(a.getByTestId("story-publish-send")).toBeDisabled();
    // Le délai du POST est de 20 s : l'issue arrive après lui, pas avant.
    const startedAt = Date.now();
    await expect(a.getByTestId("story-error")).toBeVisible({ timeout: 60_000 });
    const waited = Date.now() - startedAt;
    expect(waited, `l'issue est arrivée après ${waited} ms`).toBeGreaterThan(15_000);
    await expect(a.getByTestId("story-error")).toContainText("Ta story a peut-être été publiée");
    await expect(a.getByTestId("story-error")).not.toContainText("Connexion impossible");
    await expect(a.getByTestId("story-publish-send")).toBeEnabled();
    expect(sent.posts).toBe(1);
    await ctx.close();
  });

  test("reprise réelle : la 1re publication aboutit après le délai, le nouvel essai (même clé) ne crée pas de 2e story", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const author = await who("StB2aReprise");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    await toSend(a, author.email, "Reprise après le délai");
    const keys: string[] = [];
    let posts = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await a.route(/\/api\/me\/stories$/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts += 1;
      keys.push((route.request().postDataJSON() as { uploadKey?: string }).uploadKey ?? "");
      if (posts > 1) return route.continue();
      // 1re requête : retenue au-delà du délai de 20 s du composeur, PUIS livrée à l'API (la story est créée, la réponse est perdue).
      await gate;
      try {
        await route.fetch();
        await route.abort();
      } catch {
        // La page a déjà abandonné la requête : la livraison à l'API a eu lieu avant.
      }
    });
    await a.getByTestId("story-publish-send").click();
    await expect(a.getByTestId("story-error")).toBeVisible({ timeout: 60_000 });
    const message = await a.getByTestId("story-error").innerText();
    expect(message).toContain("Ta story a peut-être été publiée");
    expect(message).toContain("pas publiée deux fois");
    expect(message).not.toContain("profil");
    // La 1re requête aboutit maintenant, côté API, après l'abandon du composeur.
    release();
    await expect.poll(async () => (await storiesOf(author, author.id)).length, { timeout: 30_000 }).toBe(1);
    const first = (await storiesOf(author, author.id))[0];
    // Le composeur est toujours là, le brouillon intact : on réessaie ici, avec la même clé.
    await expect(a.getByTestId("story-publish-send")).toBeEnabled();
    const secondResponse = a.waitForResponse(
      (r) => /\/api\/me\/stories$/.test(r.url()) && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await a.getByTestId("story-publish-send").click();
    const replay = await secondResponse;
    expect(replay.status()).toBe(201);
    const replayed = (await replay.json()) as { id: string; replayed?: boolean; audience?: string };
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]?.length ?? 0).toBeGreaterThan(0);
    // Le nouvel essai ABOUTIT : l'écran de réussite d'une reprise, la même story, le vrai public rendu par l'API.
    await expect(a.getByTestId("story-done")).toBeVisible({ timeout: 30_000 });
    await expect(a.getByTestId("story-done")).toContainText("Ta story est déjà partie");
    expect(posts).toBe(2);
    expect(replayed.replayed).toBe(true);
    expect(replayed.audience).toBeTruthy();
    expect(replayed.id).toBe(first?.id);
    const stories = await storiesOf(author, author.id);
    expect(stories.map((x) => x.id)).toEqual([first?.id]);
    await ctx.close();
  });

  test("l'annonce de B pendant un envoi sans réponse : l'état neutre se termine au délai, « peut-être publiée »", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const author = await who("StB2aNeutre");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctx.newPage();
    await setTheme(a, "beton");
    const SECRET = "Brouillon secret de A, envoi sans réponse";
    await toSend(a, author.email, SECRET);
    const sent = await neverAnswer(a);
    await a.getByTestId("story-publish-send").click();
    await expect.poll(() => sent.posts, { timeout: 30_000 }).toBe(1);
    await signInOther(browser, ctx, "sarah@orasso.local");
    await expect(a.getByTestId("story-stale-sending")).toBeVisible({ timeout: 30_000 });
    await expect(a.getByText(SECRET)).toHaveCount(0);
    // Sans le délai, cet état durait sans fin : au délai, l'issue incertaine s'affiche (aucune donnée de A).
    await expect(a.getByTestId("story-stale")).toBeVisible({ timeout: 60_000 });
    await expect(a.getByTestId("story-stale")).toContainText("a peut-être été publiée");
    await expect(a.getByTestId("story-stale-sending")).toHaveCount(0);
    await expect(a.getByText(SECRET)).toHaveCount(0);
    await ctx.close();
  });
});

// B2a : la mise en page (`layouts/app`) sous la marque `?apres-rechargement=1`. Le document préparé sous B et rendu sous C ne porte
// rien de privé de B (accès le plus proche, pastilles, suspension, état de l'e-mail) et ne l'annonce pas aux autres onglets.
test.describe("B2a : la mise en page sous la marque", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("réponse préparée sous B, rendue sous C : rien de privé de B dans la mise en page, et B n'est jamais annoncé", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const crew = await r5Crew(unique());
    const KENJI = "kenji@orasso.local";
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    // Idempotent : une passe tuée avant son `finally` aurait laissé Kenji suspendu et non vérifié ; on le remet à l'état du seed AVANT de le lire.
    await db.query('update "user" set email_verified = true where email = $1', [KENJI]);
    await db.query(
      'update profiles set suspended_until = null where user_id = (select id from "user" where email = $1)',
      [KENJI],
    );
    const found = await db.query<{ id: string; email_verified: boolean; suspended_until: Date | null }>(
      'select u.id, u.email_verified, p.suspended_until from "user" u join profiles p on p.user_id = u.id where u.email = $1',
      [KENJI],
    );
    const was = found.rows[0];
    if (!was) throw new Error("Kenji (seed) introuvable");
    const until = new Date(Math.floor(Date.now() / 1000) * 1000 + 9 * 86_400_000);
    try {
      // B : un e-mail à confirmer et une suspension (en plus de son accès proche et de ses pastilles, qui viennent du seed).
      await db.query('update "user" set email_verified = false where id = $1', [was.id]);
      await db.query("update profiles set suspended_until = $2 where user_id = $1", [was.id, until]);

      // Précondition : sous sa propre session, la mise en page de B montre bien tout cela (sinon la recette ne prouverait rien).
      const bCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const bPage = await bCtx.newPage();
      await loginInBrowser(bPage, KENJI, undefined, "/app/explorer");
      await expect(bPage.getByTestId("near-access")).toHaveCount(1);
      const nearTitle = (await bPage.locator(".near__text strong").first().innerText()).trim();
      expect(nearTitle.length).toBeGreaterThan(3);
      // L'adresse de l'accès (ASCII : le titre peut être sérialisé avec des échappements) : son dernier segment identifie la sortie.
      const nearHref = (await bPage.getByTestId("near-access").getAttribute("href")) ?? "";
      const nearKey = nearHref.split("/").filter(Boolean).pop()?.split("?")[0] ?? "";
      expect(nearKey.length).toBeGreaterThan(3);
      await expect(bPage.getByTestId("verify-banner")).toBeVisible();
      await expect(bPage.getByTestId("suspended-banner")).toBeVisible();
      const badges = await bPage.locator('[aria-label*="non lu"]').count();
      expect(badges, "pastilles de B (Activité ou Messages)").toBeGreaterThan(0);
      await bCtx.close();

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      // Les annonces de session reçues par un autre onglet de la fenêtre (le canal est partagé par les pages d'un même contexte).
      await ctx.addInitScript(() => {
        try {
          const c = new BroadcastChannel("orasso-session");
          c.onmessage = (e) => {
            const log = JSON.parse(sessionStorage.getItem("__b2alog") ?? "[]") as unknown[];
            log.push((e.data as { userId?: string | null } | null)?.userId ?? null);
            sessionStorage.setItem("__b2alog", JSON.stringify(log));
          };
        } catch {
          // Pas de canal : rien à noter.
        }
      });
      const a = await ctx.newPage();
      await setTheme(a, "beton");
      await loginInBrowser(a, crew.sarah.email, undefined, "/app/crew");
      await expect(a.getByTestId("crew-tab-none")).toBeVisible();
      const w = await ctx.newPage();
      await w.goto("/app/fil");
      await expect(w.getByTestId("verify-banner")).toBeVisible();
      const heard = () =>
        w.evaluate(() => JSON.parse(sessionStorage.getItem("__b2alog") ?? "[]") as Array<string | null>);

      const hold = await holdNextDocument(a, true);
      const kenji = await cookiesOf(browser, KENJI);
      const paul = await cookiesOf(browser, crew.paul.email);
      hold.arm();
      await swapCookies(ctx, kenji);
      // Seule la page A reçoit l'annonce de B (événement `storage`) : l'onglet témoin ne doit entendre B que si un document l'annonce.
      await a.evaluate((id) => {
        window.dispatchEvent(
          new StorageEvent("storage", { key: "orasso-session", newValue: JSON.stringify({ userId: id, from: "x" }) }),
        );
      }, was.id);
      await hold.arrived;
      const held = hold.prepared();
      expect(held, "la réponse retenue").not.toBeNull();
      const { status, body } = held as { status: number; body: string };
      expect(status).toBe(200);
      expect(body.includes(was.id), "la réponse retenue est celle de B (son identifiant y figure)").toBe(true);
      expect(body.includes(nearTitle), "l'accès le plus proche de B (titre)").toBe(false);
      expect(body.includes(nearKey), "l'accès le plus proche de B (adresse)").toBe(false);
      expect(body.includes("near-access"), "l'accès flottant").toBe(false);
      expect(body.includes("Vérifie ton e-mail"), "l'état de l'e-mail de B").toBe(false);
      expect(body.includes("verify-banner")).toBe(false);
      expect(body.includes("suspended-banner"), "le bandeau de suspension de B").toBe(false);
      expect(body.includes(until.toISOString().slice(0, 16)), "la date de suspension de B").toBe(false);
      expect(body.includes("non lu"), "les pastilles de B").toBe(false);
      // C se connecte pendant que la réponse de B est retenue, puis elle est rendue sous C.
      await swapCookies(ctx, paul);
      hold.release();
      await expect.poll(() => loadedUser(a), { timeout: 30_000 }).toBe(crew.paul.id);
      await expect(a.getByTestId("crew-tab-none")).toBeVisible();
      await expect(a.getByTestId("near-access")).toHaveCount(0);
      await expect(a.getByTestId("suspended-banner")).toHaveCount(0);
      // Le compte de C est bien annoncé (la mise en page a confirmé par /me puis annoncé) ; celui de B ne l'a jamais été.
      await expect.poll(heard, { timeout: 20_000 }).toContain(crew.paul.id);
      expect(await heard(), "B a été annoncé aux autres onglets").not.toContain(was.id);
      await ctx.close();
    } finally {
      await db.query('update "user" set email_verified = $2 where id = $1', [was.id, was.email_verified]);
      await db.query("update profiles set suspended_until = $2 where user_id = $1", [was.id, was.suspended_until]);
      await db.end();
    }
  });
});
