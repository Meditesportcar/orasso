import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme, signUpApi, unique } from "./helpers";
import { portraitPhoto } from "./publications-helpers";
import { publishLandscapeAsStructure } from "./r8g-helpers";
import { RELAIS } from "./relais";

// Lot R8g (D40, maquettes R8.6 `pu-publi` et R9.3 `n-page`), côté site : la page d'une structure et la fiche d'un pro, vues d'un
// visiteur. L'en-tête compact, les onglets soulignés (lus dans `?onglet=`), « Publications » ouvert par défaut, le filtre « Tout ·
// Événements · Hors événement », « Mentions · N » (jamais une publication d'un compte privé), la structure sans publication qui
// s'ouvre sur « Événements », la fiche d'un pro (« Présentation » complète), suivre / signaler / stories comme avant, **sans
// session** (la structure montre ses publications, le pro seulement sa présentation, aucun appel qui exige une session) et la
// responsable qui masque une mention de sa page. Comptes du seed ; site et API lancés.
test.use({ actionTimeout: 30_000 });
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8g-captures/apres/recette-site`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

type Counts = {
  id: string;
  stories?: { count: number };
  publications?: { count: number };
  mentions?: { count: number };
};
const page = async (cookie: string | null, kind: "structures" | "pros", slug: string) =>
  (await apiCall<Counts>(cookie, "GET", `/${kind}/by-slug/${slug}`)).data;
const selected = (p: Page) => p.getByTestId("page-tabs").getByRole("tab", { selected: true });

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

test("la page d'une structure : en-tête compact, onglets, « Publications » par défaut, filtre, « Mentions », lien partagé", async ({
  page: p,
}) => {
  test.setTimeout(300_000);
  const sarah = await login("sarah@orasso.local");
  const rl = await page(sarah, "structures", "roues-libres-66");
  const offEvent = await publishAsStructure(sarah, rl.id, `Vie du club ${unique()}`);
  try {
    await setTheme(p, "beton");
    await loginInBrowser(p, "kenji@orasso.local", undefined, "/o/roues-libres-66");
    const kenji = await login("kenji@orasso.local");
    const served = await page(kenji, "structures", "roues-libres-66");
    for (const width of [390, 1280]) {
      await p.setViewportSize({ width, height: 900 });
      await p.goto("/o/roues-libres-66");
      // L'en-tête compact : nom, type, vérification, « Suivre », trois compteurs.
      await expect(p.getByTestId("page-name")).toHaveText("Roues Libres 66");
      await expect(p.getByTestId("page-type")).toHaveText("Organisateur");
      await expect(p.getByTestId("verified-badge")).toHaveText("Vérifié");
      await expect(p.getByTestId("follow-button")).toBeVisible();
      await expect(p.getByTestId("page-counts").locator("small")).toHaveText([
        /^abonnés?$/,
        /^événements?$/,
        /^partenaires?$/,
      ]);
      // Les onglets : « Événements », « Publications » (ouvert), « Mentions · N ».
      await expect(p.getByTestId("page-tabs").getByRole("tab")).toHaveText([
        "Événements",
        "Publications",
        `Mentions · ${served.mentions?.count}`,
      ]);
      await expect(selected(p)).toHaveAccessibleName("Publications");
      await expect(p.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
      await expect(p.getByTestId("publications-count")).toHaveText(`${served.publications?.count} publications`);
      // Jamais de bouton « Publier » ici.
      await expect(p.getByTestId("publications-publish")).toHaveCount(0);
      await shot(p, `structure-publications-${width}`);
    }

    // Le filtre : « Hors événement » ne garde que les publications sans événement ; « Événements » les autres.
    const none = await apiCall<{ items: { id: string; attach: unknown }[] }>(
      kenji,
      "GET",
      `/authors/s:${rl.id}/feed-posts?filter=no_event`,
    );
    expect(none.data.items.map((i) => i.id)).toContain(offEvent);
    expect(none.data.items.every((i) => i.attach === null)).toBe(true);
    await p.setViewportSize({ width: 390, height: 900 });
    await p.goto("/o/roues-libres-66");
    await p.getByTestId("page-filter-no_event").click();
    await expect(p).toHaveURL(/filtre=hors-evenement/);
    await expect(p.getByTestId("publication-tile")).toHaveCount(none.data.items.length, { timeout: 30_000 });
    await shot(p, "structure-filtre-hors-evenement");
    await p.getByTestId("page-filter-event").click();
    const withEvent = await apiCall<{ items: { id: string }[] }>(
      kenji,
      "GET",
      `/authors/s:${rl.id}/feed-posts?filter=event`,
    );
    await expect(p.getByTestId("publication-tile")).toHaveCount(withEvent.data.items.length, { timeout: 30_000 });
    expect(withEvent.data.items.map((i) => i.id)).not.toContain(offEvent);
    await p.getByTestId("page-filter-all").click();
    await expect(p.getByTestId("publication-tile")).toHaveCount(served.publications?.count ?? -1, { timeout: 30_000 });

    // « Mentions » : ceux qui citent la page ; jamais une publication d'un compte privé (Marc_66).
    const list = await apiCall<{ items: { post: { id: string; author: { name: string } } }[] }>(
      kenji,
      "GET",
      `/authors/s:${rl.id}/mentions`,
    );
    await p.getByTestId("page-tab-mentions").click();
    await expect(p).toHaveURL(/onglet=mentions/);
    await expect(selected(p)).toHaveAccessibleName(`Mentions · ${list.data.items.length}`);
    await expect(p.getByTestId("mention-row")).toHaveCount(list.data.items.length, { timeout: 30_000 });
    const names = await p.getByTestId("mention-author").allInnerTexts();
    // (Les noms sont écrits en capitales par le style : on compare sans la casse.)
    expect(names.join(" ")).toMatch(/La Brasa/i);
    expect(names.join(" ")).not.toMatch(/Marc_66/i);
    // La carte reste chez son auteur : la ligne ouvre la publication.
    await expect(p.getByTestId("mention-open").first()).toHaveAttribute("href", /\/app\/publication\//);
    // Un visiteur qui n'est pas responsable n'a pas de « … ».
    await expect(p.getByTestId("mention-more")).toHaveCount(0);
    await shot(p, "structure-mentions");

    // Un lien partagé ouvre le bon onglet ; un paramètre invalide est ignoré.
    await p.goto("/o/roues-libres-66?onglet=evenements");
    await expect(selected(p)).toHaveAccessibleName("Événements");
    await expect(p.getByTestId("structure-upcoming").or(p.getByText("Aucun événement à venir"))).toBeVisible();
    await shot(p, "structure-evenements");
    await p.goto("/o/roues-libres-66?onglet=garage");
    await expect(selected(p)).toHaveAccessibleName("Publications");
  } finally {
    await apiCall(sarah, "DELETE", `/me/feed-posts/${offEvent}`);
  }
});

test("une structure sans publication s'ouvre sur « Événements » ; état vide des publications", async ({ page: p }) => {
  test.setTimeout(120_000);
  await setTheme(p, "beton");
  await loginInBrowser(p, "kenji@orasso.local", undefined, "/o/ecurie-du-canigou");
  const kenji = await login("kenji@orasso.local");
  const ec = await page(kenji, "structures", "ecurie-du-canigou");
  expect(ec.publications?.count).toBe(0);
  await p.goto("/o/ecurie-du-canigou");
  await expect(selected(p)).toHaveAccessibleName("Événements");
  await p.getByTestId("page-tab-publications").click();
  await expect(p.getByTestId("publications-empty")).toContainText("Pas encore de publication", { timeout: 30_000 });
  await expect(p.getByTestId("publications-empty")).toContainText("n'a rien publié pour l'instant");
  await shot(p, "structure-publications-vide");
  await p.getByTestId("page-tab-mentions").click();
  await expect(p.getByTestId("mentions-empty")).toHaveText("Personne n'a encore cité cette page.", { timeout: 30_000 });
});

test("la fiche d'un pro : « Présentation » complète, « Publications », « Mentions » ; suivre et signaler comme avant", async ({
  page: p,
}) => {
  test.setTimeout(240_000);
  await setTheme(p, "beton");
  await loginInBrowser(p, "kenji@orasso.local", undefined, "/p/atelier-covering-66");
  const kenji = await login("kenji@orasso.local");
  const ac = await page(kenji, "pros", "atelier-covering-66");
  for (const width of [390, 1280]) {
    await p.setViewportSize({ width, height: 900 });
    // Lot R9c : Atelier Covering 66 a des publications (offres) : « Présentation » est demandée par l'adresse.
    await p.goto("/p/atelier-covering-66?onglet=presentation");
    await expect(p.getByTestId("page-name")).toHaveText("Atelier Covering 66");
    await expect(p.getByTestId("page-type")).toHaveText("Pro");
    await expect(p.getByTestId("verified-badge")).toHaveText("Pro vérifié");
    await expect(p.getByTestId("page-tabs").getByRole("tab")).toHaveText([
      "Présentation",
      "Publications",
      "Offres",
      `Mentions · ${ac.mentions?.count}`,
    ]);
    // Avec des publications, « Publications » s'ouvre par défaut (R9c) ; « Présentation » garde tout le contenu d'hier.
    expect(ac.publications?.count).toBeGreaterThan(0);
    await expect(selected(p)).toHaveAccessibleName("Présentation");
    await expect(p.getByTestId("pro-presentation")).toBeVisible();
    await expect(p.getByTestId("pro-photos").locator("img").first()).toBeVisible();
    await expect(p.getByTestId("pro-discounts")).toContainText("−5 %");
    // R9c : avec une session, les anciennes offres sont dans l'onglet « Offres » (déplacées, pas dupliquées).
    await expect(p.getByTestId("pro-posts")).toHaveCount(0);
    await expect(p.getByTestId("call")).toBeVisible();
    await expect(p.getByTestId("route")).toBeVisible();
    await shot(p, `pro-presentation-${width}`);
  }
  await p.goto("/p/detailing-pyrenees?onglet=publications");
  await expect(p.getByTestId("publications-empty")).toContainText("Pas encore de publication", { timeout: 30_000 });
  await p.getByTestId("page-tab-mentions").click();
  await expect(selected(p)).toHaveAccessibleName(/^Mentions/);
  await expect(p.getByTestId("mention-row").or(p.getByTestId("mentions-empty"))).toBeVisible({ timeout: 30_000 });
  await shot(p, "pro-mentions");
  // L'icône « Itinéraire » du haut est comptée et s'ouvre dans un nouvel onglet.
  await p.goto("/p/atelier-covering-66");
  await expect(p.getByTestId("route-icon")).toHaveAttribute("target", "_blank");
  const counted = p.waitForRequest((r) => r.url().includes("/track") && (r.postData() ?? "").includes("route"));
  await p.getByTestId("route-icon").click();
  await counted;

  // Suivre : « Suivre » puis « Suivi », et on le rend.
  const pseudo = `Hg${unique()}`;
  await signUpApi(pseudo);
  const fan = await p
    .context()
    .browser()
    ?.newContext({ viewport: { width: 390, height: 900 } });
  if (!fan) throw new Error("navigateur indisponible");
  const f = await fan.newPage();
  await setTheme(f, "beton");
  await loginInBrowser(f, `${pseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, "/p/garage-du-port");
  await f.goto("/p/garage-du-port");
  await f.getByTestId("follow-button").click();
  await expect(f.getByTestId("follow-button")).toHaveText("Suivi", { timeout: 20_000 });
  await f.getByTestId("follow-button").click();
  await expect(f.getByTestId("follow-button")).toHaveText("Suivre", { timeout: 20_000 });
  // Signaler : la feuille s'ouvre depuis « Plus ».
  await f.getByTestId("page-more").locator("summary").click();
  await f.getByTestId("report-open").click();
  await expect(f.getByTestId("report-dialog")).toBeVisible({ timeout: 20_000 });
  await fan.close();
});

test("sans session : la structure montre ses publications, le pro sa présentation ; aucun appel qui exige une session", async ({
  page: p,
}) => {
  test.setTimeout(240_000);
  await setTheme(p, "beton");
  const denied: string[] = [];
  p.on("response", (r) => {
    if (r.status() === 401 && r.url().includes("/api/")) denied.push(r.url());
  });
  await p.setViewportSize({ width: 390, height: 900 });
  await p.goto("/o/roues-libres-66");
  await expect(p.getByTestId("page-tabs").getByRole("tab")).toHaveText(["Événements", "Publications"]);
  await expect(selected(p)).toHaveAccessibleName("Publications");
  // Liste blanche : la photo, la date, le lieu, la légende ; ni flamme, ni commentaires, ni menu.
  await expect(p.getByTestId("public-publication").first()).toBeVisible();
  await expect(p.getByTestId("feed-card-feed_post")).toHaveCount(0);
  await expect(p.getByTestId("publication-tile")).toHaveCount(0);
  await expect(p.getByTestId("page-tab-mentions")).toHaveCount(0);
  await expect(p.getByTestId("follow-button")).toHaveAttribute("href", /connexion/);
  await shot(p, "structure-sans-session");
  await p.goto("/p/atelier-covering-66");
  await expect(p.getByTestId("page-tabs").getByRole("tab")).toHaveText(["Présentation"]);
  await expect(p.getByTestId("pro-presentation")).toBeVisible();
  // Un lien vers « Publications » ou « Mentions » du pro retombe sur sa présentation.
  await p.goto("/p/atelier-covering-66?onglet=publications");
  await expect(selected(p)).toHaveAccessibleName("Présentation");
  await p.goto("/p/atelier-covering-66?onglet=mentions");
  await expect(selected(p)).toHaveAccessibleName("Présentation");
  await shot(p, "pro-sans-session");
  expect(denied, denied.join(", ")).toEqual([]);
  // Côté API : le visiteur n'obtient ni les mentions ni les publications d'un pro.
  const rl = await page(null, "structures", "roues-libres-66");
  expect((await apiCall(null, "GET", `/authors/s:${rl.id}/mentions`)).status).toBe(401);
  const ac = await page(null, "pros", "atelier-covering-66");
  expect((await apiCall(null, "GET", `/authors/p:${ac.id}/feed-posts`)).status).toBe(401);
  expect(ac.publications).toBeUndefined();
  expect(ac.mentions).toBeUndefined();
});

test("la responsable masque une mention de sa page, puis la remet", async ({ page: p }) => {
  test.setTimeout(240_000);
  await setTheme(p, "beton");
  await p.setViewportSize({ width: 390, height: 900 });
  await loginInBrowser(p, "sarah@orasso.local", undefined, "/o/roues-libres-66");
  const sarah = await login("sarah@orasso.local");
  const rl = await page(sarah, "structures", "roues-libres-66");
  type List = { items: { post: { id: string }; hidden: boolean }[] };
  const read = (hidden: boolean) =>
    apiCall<List>(sarah, "GET", `/authors/s:${rl.id}/mentions${hidden ? "?hidden=1" : ""}`).then((r) => r.data);
  // La responsable voit toutes les mentions de sa page, les masquées comprises (`hidden=1`) ; la page suit cet ordre.
  const all = await read(true);
  const index = all.items.findIndex((i) => !i.hidden);
  expect(index, "une mention visible à masquer").toBeGreaterThanOrEqual(0);
  const target = all.items[index]?.post.id ?? "";
  try {
    await p.goto("/o/roues-libres-66?onglet=mentions");
    await expect(p.getByTestId("mention-row")).toHaveCount(all.items.length, { timeout: 30_000 });
    const row = p.getByTestId("mention-row").nth(index);
    await row.getByTestId("mention-more").click();
    await row.getByTestId("mention-hide").click();
    await expect(row.getByTestId("mention-hidden")).toHaveText("Masquée", { timeout: 20_000 });
    // Le nombre de l'onglet suit.
    await expect(p.getByTestId("page-tab-mentions")).toContainText(
      `· ${all.items.filter((i) => !i.hidden).length - 1}`,
    );
    await shot(p, "structure-mention-masquee");
    expect((await read(false)).items.map((i) => i.post.id)).not.toContain(target);
    // Un autre visiteur ne la voit plus sur la page ; la publication de son auteur existe toujours.
    const kenji = await login("kenji@orasso.local");
    const other = await apiCall<List>(kenji, "GET", `/authors/s:${rl.id}/mentions`);
    expect(other.data.items.map((i) => i.post.id)).not.toContain(target);
    expect((await apiCall(kenji, "GET", `/feed-posts/${target}`)).status).toBe(200);
    // Remettre sur la page.
    await row.getByTestId("mention-more").click();
    await expect(row.getByTestId("mention-hide")).toHaveText("Remettre sur la page");
    await row.getByTestId("mention-hide").click();
    await expect(row.getByTestId("mention-hidden")).toHaveCount(0, { timeout: 20_000 });
    expect((await read(false)).items.map((i) => i.post.id)).toContain(target);
  } finally {
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
  }
});

test("tour 3 : sans session, toutes les photos au cadrage de la publication (paysage compris)", async ({ page: p }) => {
  test.setTimeout(120_000);
  const sarah = await login("sarah@orasso.local");
  const rl = await page(sarah, "structures", "roues-libres-66");
  const id = await publishLandscapeAsStructure(sarah, rl.id, `Paysage ${unique()}`, 2);
  try {
    await setTheme(p, "beton");
    await p.setViewportSize({ width: 390, height: 900 });
    await p.goto("/o/roues-libres-66");
    const card = p.getByTestId("public-publication").filter({ hasText: "Paysage" });
    await expect(card.locator(".fil-photos__slide img")).toHaveCount(2);
    const box = await card.getByTestId("feed-post-photos").boundingBox();
    expect(Math.abs((box?.width ?? 1) / (box?.height ?? 1) - 1.25)).toBeLessThan(0.05);
    await shot(p, "structure-sans-session-paysage");
  } finally {
    await apiCall(sarah, "DELETE", `/me/feed-posts/${id}`);
  }
});

test("tour 3 : une panne à la deuxième page des mentions se reprend par « Réessayer » ; le nombre de l'onglet ne se corrige pas deux fois", async ({
  page: p,
}) => {
  test.setTimeout(180_000);
  await setTheme(p, "beton");
  await p.setViewportSize({ width: 390, height: 900 });
  await loginInBrowser(p, "sarah@orasso.local", undefined, "/o/roues-libres-66");
  const sarah = await login("sarah@orasso.local");
  const rl = await page(sarah, "structures", "roues-libres-66");
  let fail = true;
  const mentionsRoute = /\/api\/authors\/[^/]+\/mentions/;
  await p.route(mentionsRoute, async (route) => {
    const url = route.request().url();
    if (url.includes("cursor=")) {
      if (fail) return route.abort();
      return route.fulfill({ json: { items: [], nextCursor: null } });
    }
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, nextCursor: "page-2" } });
  });
  await p.goto("/o/roues-libres-66?onglet=mentions");
  await expect(p.getByTestId("mention-row").first()).toBeVisible({ timeout: 30_000 });
  await p.getByTestId("mentions-more").click();
  await expect(p.getByTestId("mentions-retry")).toBeVisible({ timeout: 20_000 });
  fail = false;
  await p.getByTestId("mentions-retry").click();
  await expect(p.getByTestId("mentions-retry")).toHaveCount(0, { timeout: 20_000 });
  await expect(p.getByTestId("mentions-more")).toHaveCount(0);
  await p.unroute(mentionsRoute);

  // Masquer, puis une relecture de la page (suivre / ne plus suivre) : le nombre ne bouge pas une seconde fois.
  type List = { items: { post: { id: string }; hidden: boolean }[] };
  const all = (await apiCall<List>(sarah, "GET", `/authors/s:${rl.id}/mentions?hidden=1`)).data;
  const visible = all.items.filter((i) => !i.hidden).length;
  const index = all.items.findIndex((i) => !i.hidden);
  const target = all.items[index]?.post.id ?? "";
  try {
    await p.goto("/o/roues-libres-66?onglet=mentions");
    await expect(p.getByTestId("mention-row")).toHaveCount(all.items.length, { timeout: 30_000 });
    const row = p.getByTestId("mention-row").nth(index);
    await row.getByTestId("mention-more").click();
    await row.getByTestId("mention-hide").click();
    await expect(p.getByTestId("page-tab-mentions")).toContainText(`· ${visible - 1}`, { timeout: 20_000 });
    await p.getByTestId("follow-button").click();
    await p.waitForTimeout(1500);
    await expect(p.getByTestId("page-tab-mentions")).toContainText(`· ${visible - 1}`);
    await p.getByTestId("follow-button").click();
  } finally {
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
  }
});

test("tour 4 : un nombre servi identique après masquage remet le delta à zéro", async ({ page: p }) => {
  test.setTimeout(180_000);
  await setTheme(p, "beton");
  await p.setViewportSize({ width: 390, height: 900 });
  await loginInBrowser(p, "sarah@orasso.local", undefined, "/o/roues-libres-66");
  const sarah = await login("sarah@orasso.local");
  const rl = await page(sarah, "structures", "roues-libres-66");
  type List = { items: { post: { id: string }; hidden: boolean }[] };
  const all = (await apiCall<List>(sarah, "GET", `/authors/s:${rl.id}/mentions?hidden=1`)).data;
  const visible = all.items.filter((i) => !i.hidden).length;
  const index = all.items.findIndex((i) => !i.hidden);
  const target = all.items[index]?.post.id ?? "";
  try {
    await p.goto("/o/roues-libres-66?onglet=mentions");
    await expect(p.getByTestId("mention-row")).toHaveCount(all.items.length, { timeout: 30_000 });
    const row = p.getByTestId("mention-row").nth(index);
    await row.getByTestId("mention-more").click();
    await row.getByTestId("mention-hide").click();
    await expect(p.getByTestId("page-tab-mentions")).toContainText(`· ${visible - 1}`, { timeout: 20_000 });
    // Le serveur redit le même nombre qu'au départ (la mention est remise ailleurs) : la relecture l'emporte.
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
    await p.getByTestId("follow-button").click();
    await expect(p.getByTestId("page-tab-mentions")).toContainText(`· ${visible}`, { timeout: 20_000 });
    await p.getByTestId("follow-button").click();
  } finally {
    await apiCall(sarah, "DELETE", `/mentions/s:${rl.id}/${target}/hidden`);
  }
});
