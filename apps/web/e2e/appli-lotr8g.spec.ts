import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { portraitPhoto } from "./publications-helpers";
import { publishLandscapeAsStructure } from "./r8g-helpers";
import { RELAIS } from "./relais";

// Lot R8g (D40, maquettes R8.6 `pu-publi` et R9.3 `n-page`), côté appli (version web compilée de recette) : la page d'une structure
// et la fiche d'un pro, vues d'un visiteur. L'en-tête compact (le nom passe à la ligne en police ×1,3), les onglets soulignés et
// collants, « Publications » ouvert par défaut, le filtre « Tout · Événements · Hors événement », « Mentions · N » (jamais une
// publication d'un compte privé), une structure sans publication qui s'ouvre sur « Événements », la fiche d'un pro (« Présentation »
// complète), suivre / signaler / stories comme avant, **sans session** et la responsable qui masque une mention de sa page.
// Lancer avec APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8g-captures/apres/recette-appli`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function open(browser: Browser, fontScale = 1, theme: "beton" | "sable" = "beton", width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: APP });
  await ctx.addInitScript(
    ([f, th]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", th as string);
      if (f !== 1) localStorage.setItem("orasso.recette.echellePolice", String(f));
    },
    [fontScale, theme] as const,
  );
  return { ctx, page: await ctx.newPage() };
}

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
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const selected = (p: Page) => p.getByTestId("page-tabs").getByRole("tab", { selected: true });
const noOverflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

type Counts = { id: string; publications?: { count: number }; mentions?: { count: number } };
const served = async (cookie: string | null, kind: "structures" | "pros", slug: string) =>
  (await apiCall<Counts>(cookie, "GET", `/${kind}/by-slug/${slug}`)).data;

/** Une publication sans événement au nom de la structure (comme l'écran « Publier »), pour le filtre « Hors événement ». */
async function publishAsStructure(cookie: string, structureId: string, caption: string): Promise<string> {
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new Blob([new Uint8Array(portraitPhoto([40, 90, 140]))], { type: "image/png" }), "photo.png");
  const up = await fetch(`${API}/api/me/uploads`, { method: "POST", headers: { origin: WEB, cookie }, body: form });
  const { key } = (await up.json()) as { key: string };
  const res = await apiCall<{ id: string }>(cookie, "POST", "/me/feed-posts", {
    caption,
    aspect: "portrait_4_5",
    clientId: crypto.randomUUID(),
    persona: "organizer",
    structureId,
    placeLabel: "Perpignan",
    photos: [{ uploadKey: key, noPlateConfirmed: true }],
  });
  if (res.status !== 201) throw new Error(`publication de la page : ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.id;
}

test("la page d'une structure : en-tête compact, onglets collants, « Publications » par défaut, filtre, « Mentions », police ×1,3", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const sarah = await login("sarah@orasso.local");
  const kenji = await login("kenji@orasso.local");
  const rl = await served(sarah, "structures", "roues-libres-66");
  const offEvent = await publishAsStructure(sarah, rl.id, `Vie du club ${unique()}`);
  try {
    const s = await served(kenji, "structures", "roues-libres-66");
    for (const [theme, scale, width] of [
      ["beton", 1, 390],
      ["sable", 1.3, 384],
    ] as const) {
      const { ctx, page } = await open(browser, scale, theme, width);
      await signIn(page, "kenji@orasso.local");
      await go(page, "/o/roues-libres-66");
      // L'en-tête : nom (jamais tronqué), type, vérification, « Suivre » (seul bouton principal), trois compteurs.
      await expect(page.getByTestId("page-name")).toHaveText("Roues Libres 66", { timeout: 30_000 });
      await expect(page.getByTestId("page-type")).toHaveText("ORGANISATEUR");
      await expect(page.getByTestId("page-verified")).toContainText("Vérifié");
      await expect(page.getByTestId("follow")).toBeVisible();
      await expect(page.getByTestId("page-count-events")).toBeVisible();
      await expect(page.getByTestId("page-count-partners")).toBeVisible();
      expect(await noOverflow(page), `${theme} ×${scale}`).toBe(true);
      // Les onglets : « Événements », « Publications » (ouvert), « Mentions · N ».
      await expect(page.getByTestId("page-tabs").getByRole("tab")).toHaveText(
        ["Événements", "Publications", `Mentions · ${s.mentions?.count}`],
        { timeout: 30_000 },
      );
      await expect(selected(page)).toHaveAccessibleName("Publications");
      await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("publications-count")).toHaveText(`${s.publications?.count} publications`);
      await expect(page.getByTestId("publications-publish")).toHaveCount(0);
      await shot(page, `structure-publications-${theme}-${width}-x${scale}`);

      // Le filtre : « Hors événement » ne garde que les publications sans événement.
      const none = await apiCall<{ items: { id: string; attach: unknown }[] }>(
        kenji,
        "GET",
        `/authors/s:${rl.id}/feed-posts?filter=no_event`,
      );
      expect(none.data.items.map((i) => i.id)).toContain(offEvent);
      await page.getByRole("radio", { name: /Hors événement/ }).click();
      await expect(page.getByTestId("publication-tile")).toHaveCount(none.data.items.length, { timeout: 30_000 });
      await shot(page, `structure-filtre-${theme}-${width}-x${scale}`);
      await page.getByRole("radio", { name: /Tout/ }).click();
      await expect(page.getByTestId("publication-tile")).toHaveCount(s.publications?.count ?? -1, { timeout: 30_000 });

      // « Mentions » : ceux qui citent la page, jamais un compte privé.
      const list = await apiCall<{ items: { post: { id: string } }[] }>(kenji, "GET", `/authors/s:${rl.id}/mentions`);
      await page.getByTestId("page-tab-mentions").click();
      await expect(page.getByTestId("mention-row")).toHaveCount(list.data.items.length, { timeout: 30_000 });
      await expect(page.getByTestId("mention-author").filter({ hasText: "Marc_66" })).toHaveCount(0);
      await expect(page.getByTestId("mention-author").filter({ hasText: "La Brasa" })).toHaveCount(1);
      await expect(page.getByTestId("mention-more")).toHaveCount(0);
      await shot(page, `structure-mentions-${theme}-${width}-x${scale}`);

      // « Événements » : ce que la page montrait (lignes d'événements, à propos).
      await page.getByTestId("page-tab-events").click();
      await expect(page.getByTestId("event-row").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("structure-about")).toBeVisible();
      await shot(page, `structure-evenements-${theme}-${width}-x${scale}`);
      await ctx.close();
    }

    // Un lien partagé ouvre le bon onglet.
    const { ctx, page } = await open(browser);
    await signIn(page, "kenji@orasso.local");
    await go(page, "/o/roues-libres-66?onglet=mentions");
    await expect(selected(page)).toHaveAccessibleName(/^Mentions/, { timeout: 30_000 });
    await ctx.close();
  } finally {
    await apiCall(sarah, "DELETE", `/me/feed-posts/${offEvent}`);
  }
});

test("une structure sans publication s'ouvre sur « Événements » ; suivre comme avant ; « Devenir staff » dans « Plus »", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const kenji = await login("kenji@orasso.local");
  expect((await served(kenji, "structures", "club-audois-passion")).publications?.count).toBe(0);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/o/club-audois-passion");
  await expect(page.getByTestId("structure-head")).toContainText("Club Audois Passion", { timeout: 30_000 });
  await expect(selected(page)).toHaveAccessibleName("Événements");
  await expect(page.getByTestId("follow")).toContainText(/Suivi/i);
  await expect(page.getByTestId("event-row").first()).toContainText("Narbonne");
  await page.getByTestId("page-tab-publications").click();
  await expect(page.getByTestId("publications-empty")).toContainText("Pas encore de publication", { timeout: 30_000 });
  await page.getByTestId("page-tab-mentions").click();
  await expect(page.getByTestId("mentions-empty")).toHaveText("Personne n'a encore cité cette page.", {
    timeout: 30_000,
  });
  await shot(page, "structure-sans-publication");
  // « Plus » : partager et devenir staff (la demande se rend à l'API comme avant).
  await page.getByTestId("page-more").click();
  await expect(page.getByTestId("page-share")).toBeVisible();
  await expect(page.getByTestId("become-staff")).toBeVisible();
  await ctx.close();

  // Suivre / ne plus suivre, avec un compte neuf.
  const pseudo = `Hg${unique()}`;
  await signUpApi(pseudo);
  const fan = await open(browser);
  await signIn(fan.page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(fan.page, "/o/ecurie-du-canigou");
  await expect(fan.page.getByTestId("follow")).toContainText(/Suivre/i, { timeout: 30_000 });
  await fan.page.getByTestId("follow").click();
  await expect(fan.page.getByTestId("follow")).toContainText(/Suivi/i, { timeout: 20_000 });
  await fan.page.getByTestId("follow").click();
  await expect(fan.page.getByTestId("follow")).toContainText(/Suivre/i, { timeout: 20_000 });
  await fan.ctx.close();
});

test("la fiche d'un pro : « Présentation » complète, onglets collants, « Publications », « Mentions » ; suivre et signaler", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const kenji = await login("kenji@orasso.local");
  const ac = await served(kenji, "pros", "atelier-covering-66");
  for (const [theme, scale, width] of [
    ["beton", 1, 390],
    ["sable", 1.3, 384],
  ] as const) {
    const { ctx, page } = await open(browser, scale, theme, width);
    await signIn(page, "kenji@orasso.local");
    // Lot R9c : Atelier Covering 66 a maintenant des publications (offres) : « Présentation » est demandée par l'adresse.
    await go(page, "/p/atelier-covering-66?onglet=presentation");
    await expect(page.getByTestId("page-name")).toHaveText("Atelier Covering 66", { timeout: 30_000 });
    await expect(page.getByTestId("page-type")).toHaveText("PRO");
    await expect(page.getByTestId("page-verified")).toContainText("Pro vérifié");
    expect(await noOverflow(page), `${theme} ×${scale}`).toBe(true);
    await expect(page.getByTestId("page-tabs").getByRole("tab")).toHaveText([
      "Présentation",
      "Publications",
      "Offres",
      `Mentions · ${ac.mentions?.count}`,
    ]);
    // Avec des publications, « Publications » s'ouvre par défaut (R9c) ; « Présentation » garde tout le contenu d'hier.
    expect(ac.publications?.count).toBeGreaterThan(0);
    await expect(selected(page)).toHaveAccessibleName("Présentation");
    await expect(page.getByTestId("pro-presentation")).toBeVisible();
    await expect(page.getByTestId("pro-public-photos")).toBeVisible();
    await expect(page.getByTestId("pro-discounts")).toContainText("−5 %");
    await expect(page.getByTestId("pro-call")).toBeVisible();
    await expect(page.getByTestId("pro-route")).toBeVisible();
    await shot(page, `pro-presentation-${theme}-${width}-x${scale}`);
    if (scale === 1) {
      // Les onglets restent collés en haut quand la page défile.
      const before = (await page.getByTestId("page-tabs").boundingBox())?.y ?? 0;
      await page.mouse.move(200, 500);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(600);
      const after = (await page.getByTestId("page-tabs").boundingBox())?.y ?? 9_999;
      expect(after, `les onglets collent (avant ${before}, après ${after})`).toBeLessThan(before);
      expect(after).toBeLessThan(160);
    }
    // Une fiche sans publication (Detailing Pyrénées) : l'état vide.
    await go(page, "/p/detailing-pyrenees?onglet=publications");
    await expect(page.getByTestId("publications-empty")).toContainText("Pas encore de publication", {
      timeout: 30_000,
    });
    await go(page, "/p/atelier-covering-66?onglet=presentation");
    await page.getByTestId("page-tab-mentions").click();
    await expect(page.getByTestId("mention-row").or(page.getByTestId("mentions-empty"))).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, `pro-mentions-${theme}-${width}-x${scale}`);
    await ctx.close();
  }

  // Suivre, signaler, partenaires : comme avant.
  const pseudo = `Hg${unique()}`;
  await signUpApi(pseudo);
  const fan = await open(browser);
  await signIn(fan.page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(fan.page, "/p/garage-du-port");
  await expect(fan.page.getByTestId("follow-pro")).toContainText(/Suivre/i, { timeout: 30_000 });
  await fan.page.getByTestId("follow-pro").click();
  await expect(fan.page.getByTestId("follow-pro")).toContainText(/Suivi/i, { timeout: 20_000 });
  await fan.page.getByTestId("follow-pro").click();
  await expect(fan.page.getByTestId("follow-pro")).toContainText(/Suivre/i, { timeout: 20_000 });
  await expect(fan.page.getByTestId("pro-partners")).toBeVisible();
  await fan.page.getByTestId("page-more").click();
  await expect(fan.page.getByTestId("page-share")).toBeVisible();
  await fan.page.getByTestId("report-open-pro").click();
  await expect(fan.page.getByText("Signaler cette fiche pro", { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  await fan.ctx.close();
});

test("l'anneau des stories de la page ouvre la visionneuse", async ({ browser }) => {
  test.setTimeout(180_000);
  const kenji = await login("kenji@orasso.local");
  const rl = await served(kenji, "structures", "roues-libres-66");
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/o/roues-libres-66");
  const ring = page.getByTestId("page-story-ring");
  await expect(ring).toBeVisible({ timeout: 30_000 });
  await expect(ring).toHaveAccessibleName("Voir ses stories");
  await shot(page, "structure-anneau");
  await ring.click();
  await expect(page).toHaveURL(new RegExp(`story/s(%3A|:)${rl.id}`), { timeout: 20_000 });
  await ctx.close();
});

test("sans session : la structure montre ses publications, le pro sa présentation ; aucun appel qui exige une session", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  const denied: string[] = [];
  page.on("response", (r) => {
    if (r.status() === 401 && r.url().includes("/api/")) denied.push(r.url());
  });
  await go(page, "/o/roues-libres-66");
  await expect(page.getByTestId("structure-head")).toContainText("Roues Libres 66", { timeout: 30_000 });
  await expect(page.getByTestId("page-tabs").getByRole("tab")).toHaveText(["Événements", "Publications"]);
  await expect(selected(page)).toHaveAccessibleName("Publications");
  // Liste blanche : la photo, la date, le lieu, la légende ; ni flamme, ni commentaires, ni menu.
  await expect(page.getByTestId("public-publication").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("publication-tile")).toHaveCount(0);
  await expect(page.getByTestId("page-tab-mentions")).toHaveCount(0);
  await shot(page, "structure-sans-session");
  await go(page, "/p/atelier-covering-66");
  await expect(page.getByTestId("pro-head")).toContainText("Atelier Covering 66", { timeout: 30_000 });
  await expect(page.getByTestId("page-tabs").getByRole("tab")).toHaveText(["Présentation"]);
  await expect(page.getByTestId("pro-presentation")).toBeVisible();
  await shot(page, "pro-sans-session");
  expect(
    denied.filter((u) => !u.includes("/me") && !u.includes("/session")),
    denied.join(", "),
  ).toEqual([]);
  await ctx.close();
});

test("la responsable masque une mention de sa page, puis la remet", async ({ browser }) => {
  test.setTimeout(240_000);
  const sarah = await login("sarah@orasso.local");
  const rl = await served(sarah, "structures", "roues-libres-66");
  type List = { items: { post: { id: string }; hidden: boolean }[] };
  const read = (hidden: boolean) =>
    apiCall<List>(sarah, "GET", `/authors/s:${rl.id}/mentions${hidden ? "?hidden=1" : ""}`).then((r) => r.data);
  const all = await read(true);
  const index = all.items.findIndex((i) => !i.hidden);
  expect(index, "une mention visible à masquer").toBeGreaterThanOrEqual(0);
  const target = all.items[index]?.post.id ?? "";
  const { ctx, page } = await open(browser);
  try {
    await signIn(page, "sarah@orasso.local");
    await go(page, "/o/roues-libres-66?onglet=mentions");
    await expect(page.getByTestId("mention-row")).toHaveCount(all.items.length, { timeout: 30_000 });
    const row = page.getByTestId("mention-row").nth(index);
    await row.getByTestId("mention-more").click();
    await page.getByTestId("mention-hide").click();
    await expect(row.getByTestId("mention-hidden")).toBeVisible({ timeout: 20_000 });
    await shot(page, "structure-mention-masquee");
    expect((await read(false)).items.map((i) => i.post.id)).not.toContain(target);
    await row.getByTestId("mention-more").click();
    await expect(page.getByTestId("mention-hide")).toContainText("Remettre sur la page");
    await page.getByTestId("mention-hide").click();
    await expect(row.getByTestId("mention-hidden")).toHaveCount(0, { timeout: 20_000 });
    expect((await read(false)).items.map((i) => i.post.id)).toContain(target);
  } finally {
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
    await ctx.close();
  }
});

test("tour 3 : sans session toutes les photos ; retour sur la page relit les publications ; le nombre de mentions ne se corrige pas deux fois", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sarah = await login("sarah@orasso.local");
  const rl = await served(sarah, "structures", "roues-libres-66");
  const landscape = await publishLandscapeAsStructure(sarah, rl.id, `Paysage ${unique()}`, 2);
  let fresh = "";
  try {
    // Sans session : les deux photos.
    const anon = await open(browser);
    await go(anon.page, "/o/roues-libres-66");
    const card = anon.page.getByTestId("public-publication").filter({ hasText: "Paysage" });
    await expect(card).toBeVisible({ timeout: 30_000 });
    expect(await card.getByRole("img").count()).toBeGreaterThanOrEqual(2);
    await anon.ctx.close();

    // Revenir sur la page relit la liste : une publication faite entre-temps y est.
    const { ctx, page } = await open(browser);
    await signIn(page, "kenji@orasso.local");
    await go(page, "/o/roues-libres-66");
    await expect(page.getByTestId("publication-tile").first()).toBeVisible({ timeout: 30_000 });
    const before = await page.getByTestId("publication-tile").count();
    fresh = await publishLandscapeAsStructure(sarah, rl.id, `Neuve ${unique()}`, 1);
    await page.getByTestId("publication-tile-open").first().click();
    await expect(page).toHaveURL(/publication/, { timeout: 20_000 });
    await page.goBack();
    await expect(page.getByTestId("publication-tile")).toHaveCount(before + 1, { timeout: 30_000 });
    await ctx.close();
  } finally {
    await apiCall(sarah, "DELETE", `/me/feed-posts/${landscape}`);
    if (fresh) await apiCall(sarah, "DELETE", `/me/feed-posts/${fresh}`);
  }

  // Masquer puis relire la fiche (suivre / ne plus suivre) : le nombre ne bouge pas une seconde fois.
  type List = { items: { post: { id: string }; hidden: boolean }[] };
  const all = (await apiCall<List>(sarah, "GET", `/authors/s:${rl.id}/mentions?hidden=1`)).data;
  const visible = all.items.filter((i) => !i.hidden).length;
  const index = all.items.findIndex((i) => !i.hidden);
  const target = all.items[index]?.post.id ?? "";
  const { ctx, page } = await open(browser);
  try {
    await signIn(page, "sarah@orasso.local");
    await go(page, "/o/roues-libres-66?onglet=mentions");
    await expect(page.getByTestId("mention-row")).toHaveCount(all.items.length, { timeout: 30_000 });
    await page.getByTestId("mention-row").nth(index).getByTestId("mention-more").click();
    await page.getByTestId("mention-hide").click();
    await expect(page.getByTestId("page-tab-mentions")).toHaveAccessibleName(`Mentions · ${visible - 1}`);
    await page.getByTestId("follow").click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("page-tab-mentions")).toHaveAccessibleName(`Mentions · ${visible - 1}`);
    await page.getByTestId("follow").click();
  } finally {
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
    await ctx.close();
  }
});

test("tour 4 : réseau coupé, retour sur la page : la liste reste ; un nombre servi identique après masquage remet le delta à zéro", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sarah = await login("sarah@orasso.local");
  const rl = await served(sarah, "structures", "roues-libres-66");
  // 1. Page lue, réseau coupé, on ouvre une publication puis on revient : les éléments déjà lus restent affichés.
  const kenji = await open(browser);
  await signIn(kenji.page, "kenji@orasso.local");
  await go(kenji.page, "/o/roues-libres-66");
  await expect(kenji.page.getByTestId("publication-tile").first()).toBeVisible({ timeout: 30_000 });
  const before = await kenji.page.getByTestId("publication-tile").count();
  await kenji.page.getByTestId("publication-tile-open").first().click();
  await expect(kenji.page).toHaveURL(/publication/, { timeout: 20_000 });
  await kenji.ctx.setOffline(true);
  await kenji.page.goBack();
  await kenji.page.waitForTimeout(3000);
  await expect(kenji.page.getByTestId("publication-tile")).toHaveCount(before);
  await kenji.ctx.setOffline(false);
  await kenji.ctx.close();

  // 2. Masquer, puis le serveur redit le même nombre (la mention est remise ailleurs) : la relecture écrase la correction locale.
  type List = { items: { post: { id: string }; hidden: boolean }[] };
  const all = (await apiCall<List>(sarah, "GET", `/authors/s:${rl.id}/mentions?hidden=1`)).data;
  const visible = all.items.filter((i) => !i.hidden).length;
  const index = all.items.findIndex((i) => !i.hidden);
  const target = all.items[index]?.post.id ?? "";
  const { ctx, page } = await open(browser);
  try {
    await signIn(page, "sarah@orasso.local");
    await go(page, "/o/roues-libres-66?onglet=mentions");
    await expect(page.getByTestId("mention-row")).toHaveCount(all.items.length, { timeout: 30_000 });
    await page.getByTestId("mention-row").nth(index).getByTestId("mention-more").click();
    await page.getByTestId("mention-hide").click();
    await expect(page.getByTestId("page-tab-mentions")).toHaveAccessibleName(`Mentions · ${visible - 1}`);
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
    await page.getByTestId("follow").click();
    await expect(page.getByTestId("page-tab-mentions")).toHaveAccessibleName(`Mentions · ${visible}`, {
      timeout: 20_000,
    });
    await page.getByTestId("follow").click();
  } finally {
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
    await ctx.close();
  }
});
