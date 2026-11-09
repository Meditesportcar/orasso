import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme, signUpApi, unique } from "./helpers";
import { dropMyStories, publishStory, sql, userIdOf } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R7f2 (D38), côté site : la barre de stories du Fil, la visionneuse 9:16 en superposition, l'anneau du profil ; et, par
// l'API, la vie privée de la lecture : rien sans session, compte privé et story de crew invisibles pour qui n'y a pas droit,
// jamais d'adresse de média dans le HTML rendu par le serveur, aucune photo de story publiée sans plaque traitée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7f2-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function resetViews() {
  await sql("delete from story_views");
  await sql("update stories set views_count = 0");
}

const progress = async (page: Page) =>
  (await page.getByTestId("story-bar-current").locator("> *").first().boundingBox())?.width ?? 0;

async function playing(page: Page) {
  await expect.poll(() => progress(page), { timeout: 30_000 }).toBeGreaterThan(1);
}

test("rien sans session ; compte privé et story de crew invisibles pour qui n'y a pas droit ; aucun média sans contrôle", async ({
  request,
}) => {
  test.setTimeout(180_000);
  const marc = await userIdOf("Marc_66");
  const kenji = await userIdOf("Kenji_66");
  const crewStory = (await sql<{ id: string }>("select id from stories where audience = 'crew' limit 1"))[0]?.id ?? "";
  const marcStory = (await sql<{ id: string }>("select id from stories where author_id = $1", [marc]))[0]?.id ?? "";
  const kenjiStory = (
    await sql<{ id: string; storage_key: string }>(
      "select id, storage_key from stories where author_id = $1 and audience = 'followers'",
      [kenji],
    )
  )[0];
  expect(crewStory && marcStory && kenjiStory?.id).toBeTruthy();
  const name = (kenjiStory?.storage_key ?? "").split("/").pop();

  // Sans session : 401 partout, y compris le fichier.
  expect((await apiCall(null, "GET", "/stories/bar")).status).toBe(401);
  expect((await apiCall(null, "GET", `/stories/by-author/u:${kenji}`)).status).toBe(401);
  expect((await apiCall(null, "GET", `/stories/${kenjiStory?.id}/media/${name}`)).status).toBe(401);

  // Un inconnu (inscrit, ne suit personne) : barre vide, compte privé et crew invisibles, fichiers refusés.
  const pseudo = `Zoe${unique()}`.slice(0, 14);
  const stranger = await signUpApi(pseudo);
  const bar = await apiCall<{ mine: unknown; authors: unknown[] }>(stranger, "GET", "/stories/bar");
  expect(bar.status).toBe(200);
  expect(bar.data.authors).toEqual([]);
  expect(bar.data.mine).toBeNull();
  const privateOne = await apiCall<{ author: unknown; stories: unknown[] }>(
    stranger,
    "GET",
    `/stories/by-author/u:${marc}`,
  );
  expect(privateOne.status).toBe(200);
  expect(privateOne.data).toEqual({ author: null, stories: [] });
  const kenjiSeen = await apiCall<{
    stories: { audience: string; crewName: string | null; viewsCount: number | null }[];
  }>(stranger, "GET", `/stories/by-author/u:${kenji}`);
  expect(kenjiSeen.data.stories.every((s) => s.audience !== "crew")).toBe(true);
  expect(kenjiSeen.data.stories.every((s) => s.viewsCount === null)).toBe(true);
  const marcFile = (
    await sql<{ storage_key: string }>("select storage_key from stories where id = $1", [marcStory])
  )[0];
  expect(
    (await apiCall(stranger, "GET", `/stories/${marcStory}/media/${(marcFile?.storage_key ?? "").split("/").pop()}`))
      .status,
  ).toBe(403);
  const crewFile = (
    await sql<{ storage_key: string }>("select storage_key from stories where id = $1", [crewStory])
  )[0];
  const crewRes = await apiCall<{ error: { code: string } }>(
    stranger,
    "GET",
    `/stories/${crewStory}/media/${(crewFile?.storage_key ?? "").split("/").pop()}`,
  );
  expect(crewRes.status).toBe(403);
  // Aucune vue, flamme ni réponse pour ce qu'on ne peut pas voir.
  expect((await apiCall(stranger, "POST", `/stories/${crewStory}/view`)).status).toBe(403);
  expect((await apiCall(stranger, "PUT", `/stories/${marcStory}/reaction`)).status).toBe(403);

  // Un membre du crew (Damien) voit la story du crew, avec le nom du crew ; le fichier est servi avec « no-store ».
  const damien = await login("damien@orasso.local");
  const mine = await apiCall<{ stories: { audience: string; crewName: string | null }[] }>(
    damien,
    "GET",
    `/stories/by-author/u:${kenji}`,
  );
  expect(mine.data.stories.some((s) => s.audience === "crew" && s.crewName === "Roussillon Drift")).toBe(true);
  const file = await fetch(
    `http://localhost:${process.env.API_PORT ?? 3001}/api/stories/${crewStory}/media/${(crewFile?.storage_key ?? "").split("/").pop()}`,
    { headers: { cookie: damien, origin: `http://localhost:${process.env.WEB_PORT ?? 5173}` } },
  );
  expect(file.status).toBe(200);
  expect(file.headers.get("cache-control")).toContain("no-store");
  expect(file.headers.get("content-type")).toBe("image/webp");

  // Aucune plaque lisible : toute photo publiée a sa plaque traitée (floutée ou « aucune plaque visible »).
  const bad = await sql<{ n: number }>(
    "select count(*)::int as n from stories where media_kind = 'photo' and status = 'ready' and (plate_state is null or plate_state not in ('blurred','none_confirmed'))",
  );
  expect(bad[0]?.n).toBe(0);
  // Et la fiche d'une voiture n'envoie jamais sa photo brute : la carte masquée vient de l'API (`vehicle.photoUrl` masquée ou vide).
  const withCar = await apiCall<{ stories: { vehicle: { photoUrl: string | null } | null }[] }>(
    damien,
    "GET",
    `/stories/by-author/u:${kenji}`,
  );
  for (const s of withCar.data.stories) if (s.vehicle?.photoUrl) expect(s.vehicle.photoUrl).toMatch(/^\/api\/files\//);
  void request;
});

test("le HTML rendu par le serveur ne contient jamais d'adresse de média ; sans session, on est renvoyé à la connexion", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const kenji = await userIdOf("Kenji_66");
  const url = `/app/story/${encodeURIComponent(`u:${kenji}`)}`;
  const anonymous = await request.get(url, { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(anonymous.status());
  expect(anonymous.headers().location ?? "").toContain("/connexion");
  expect(await anonymous.text()).not.toContain("/api/stories/");
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  const html = await page.context().request.get(url);
  expect(html.status()).toBe(200);
  const body = await html.text();
  expect(body).not.toContain("/api/stories/");
  expect(body).not.toContain("/media/");
  const fil = await (await page.context().request.get("/app/fil")).text();
  expect(fil).not.toContain("/api/stories/");
});

test("la barre du Fil, la visionneuse, l'anneau du profil : un parcours complet au clavier et à la souris", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  // Une seule demande de contact par paire : celle des essais précédents est retirée.
  await sql(
    "delete from contact_requests where from_user_id = (select user_id from profiles where pseudo = 'Damien_66') and to_user_id = (select user_id from profiles where pseudo = 'Lea_11')",
  );
  await dropMyStories(damien);
  const lea = await userIdOf("Lea_11");
  const kenji = await userIdOf("Kenji_66");
  await setTheme(page, "beton");
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto("/app/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stories-mine")).toContainText("Ta story");
  await expect(page.locator(".o-avring--crew")).toHaveCount(1);
  expect(await page.locator(".o-avring--followers").count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("stories-live-label")).toHaveCount(0);
  await shot(page, "barre-1280");

  // Ouvrir Léa : la superposition 9:16 centrée à 1 280 px, la barre de progression, la vue enregistrée.
  await page.getByLabel("Voir les stories de Lea_11").click();
  await expect(page).toHaveURL(/\/app\/story\//);
  const frame = page.getByTestId("story-viewer");
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await playing(page);
  const box = await frame.boundingBox();
  expect(box && Math.abs(box.width / box.height - 9 / 16) < 0.02).toBe(true);
  expect(box && Math.abs(box.x + box.width / 2 - 640) < 2).toBe(true);
  await expect(page.getByTestId("story-author")).toHaveText("Lea_11");
  await expect(page.getByTestId("story-caption")).toContainText("Premier rassemblement");
  await shot(page, "visionneuse-1280");
  await expect
    .poll(
      async () => (await sql<{ v: number }>("select views_count as v from stories where author_id = $1", [lea]))[0]?.v,
      { timeout: 15_000 },
    )
    .toBe(1);
  // Échap ferme ; l'anneau de Léa est devenu fin.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/app\/fil/);
  await expect(page.getByTestId(`stories-author-u:${lea}`).locator(".o-avring--seen")).toBeVisible({ timeout: 30_000 });
  await shot(page, "barre-1280-apres-vue");

  // Kenji : deux stories ; → passe à celle du crew (bandeau brique), ← revient ; appui long = pause.
  await page.getByLabel(/Voir les stories de Kenji_66/).click();
  // Lot R7h : Kenji_66 a une troisième story (celle du Lydia qui identifie Roues Libres 66).
  await expect(page.getByTestId("story-bars").locator("> *")).toHaveCount(3);
  await playing(page);
  // Les deux stories de Kenji ont la même date dans le seed : l'ordre n'est pas écrit, l'une des deux porte le bandeau.
  const badge = page.getByTestId("story-crew-badge");
  const crewFirst = (await badge.count()) > 0;
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("story-bar-done")).toHaveCount(1);
  await page.waitForTimeout(500);
  expect((await badge.count()) > 0).toBe(!crewFirst);
  if (!crewFirst) {
    await expect(badge).toContainText("Mon crew · Roussillon Drift");
    await shot(page, "visionneuse-crew-1280");
  }
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("story-bar-done")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect((await badge.count()) > 0).toBe(crewFirst);
  await playing(page);
  const surface = (await page.getByTestId("story-surface").boundingBox()) ?? { x: 0, y: 0, width: 400, height: 700 };
  const cx = surface.x + surface.width / 2;
  await page.mouse.move(cx, surface.y + 300);
  await page.mouse.down();
  await page.waitForTimeout(600);
  const paused = await progress(page);
  await page.waitForTimeout(900);
  expect(Math.abs((await progress(page)) - paused)).toBeLessThan(3);
  await page.mouse.up();
  await page.waitForTimeout(700);
  expect(await progress(page)).toBeGreaterThan(paused + 2);
  // Toucher à droite : la suivante.
  await page.mouse.click(surface.x + surface.width - 30, surface.y + 300);
  await expect(page.getByTestId("story-bar-done")).toHaveCount(1, { timeout: 15_000 });
  // L'identifié (Damien) est un autocollant qui mène à son profil ; la story de crew n'a pas de bouton de partage.
  await page.keyboard.press("Escape");

  // Flamme, réponse, ne plus voir : l'API le sait.
  await page.goto(`/app/story/${encodeURIComponent(`u:${lea}`)}`);
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  const leaStory = (await sql<{ id: string }>("select id from stories where author_id = $1", [lea]))[0]?.id;
  await apiCall(damien, "DELETE", `/stories/${leaStory}/reaction`);
  await page.getByTestId("story-flame").click();
  await expect(page.getByTestId("story-flame")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(
      async () =>
        (await apiCall<{ stories: { reacted: boolean }[] }>(damien, "GET", `/stories/by-author/u:${lea}`)).data
          .stories[0]?.reacted,
    )
    .toBe(true);
  await apiCall(damien, "DELETE", `/stories/${leaStory}/reaction`);
  await page.getByTestId("story-reply-input").fill("Belle photo, site !");
  const keep = await progress(page);
  await page.waitForTimeout(800);
  expect(Math.abs((await progress(page)) - keep)).toBeLessThan(3);
  await page.getByTestId("story-reply-send").click();
  await expect(page.getByTestId("story-notice")).toContainText(/Message envoyé|Envoyé en demande de message/, {
    timeout: 15_000,
  });
  await page.getByTestId("story-more").click();
  await expect(page.getByTestId("story-menu-mute")).toBeVisible();
  await expect(page.getByTestId("story-menu-report")).toBeVisible();
  await shot(page, "visionneuse-menu-1280");
  await page.getByTestId("story-menu-close").click();

  // L'anneau du profil de Kenji est un lien vers sa visionneuse.
  await page.goto("/u/Kenji_66");
  const ring = page.getByTestId("public-head").locator("a.o-avring");
  await expect(ring).toBeVisible({ timeout: 30_000 });
  expect(await ring.getAttribute("href")).toContain(`/app/story/${encodeURIComponent(`u:${kenji}`)}`);
  await shot(page, "profil-kenji-1280");
  await ring.click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
});

test("ne plus voir ses stories, ma story (vues, supprimer), story expirée, signaler", async ({ page }) => {
  test.setTimeout(300_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  const leaCookie = await login("lea@orasso.local");
  const theo = await userIdOf("Theo_66");
  await dropMyStories(damien);
  await apiCall(damien, "DELETE", `/me/story-mutes/u:${theo}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  // Mute : la barre n'a plus Théo ; son profil garde ses stories.
  await page.goto("/app/fil");
  await page.getByLabel("Voir les stories de Theo_66").click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await playing(page);
  await page.getByTestId("story-more").click();
  await page.getByTestId("story-menu-mute").click();
  await expect(page.getByTestId("story-notice")).toContainText("Tu ne verras plus ces stories");
  await expect(page).toHaveURL(/\/app\/fil/, { timeout: 15_000 });
  await expect(page.getByTestId("stories-bar")).toBeVisible();
  await expect(page.getByTestId(`stories-author-u:${theo}`)).toHaveCount(0);
  await apiCall(damien, "DELETE", `/me/story-mutes/u:${theo}`);

  // Signaler une story : la fenêtre de signalement du site.
  await page.goto("/app/fil");
  await page.getByLabel("Voir les stories de Lea_11").click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-more").click();
  await page.getByTestId("story-menu-report").getByRole("button").click();
  await expect(page.getByRole("dialog").filter({ hasText: "Signaler" }).last()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Ma story : mon anneau, « Vues », la liste pour moi seul, supprimer.
  const id = await publishStory(damien, { caption: "Ma story du site" });
  await apiCall(leaCookie, "POST", `/stories/${id}/view`);
  const me = await userIdOf("Damien_66");
  await page.goto("/app/fil");
  await expect(page.getByTestId("stories-mine-ring")).toBeVisible({ timeout: 30_000 });
  await shot(page, "barre-390-ma-story");
  await page.getByTestId("stories-mine-ring").click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-reply-input")).toHaveCount(0);
  await expect(page.getByTestId("story-views")).toContainText("Vues · 1");
  await shot(page, "visionneuse-390-ma-story");
  await page.getByTestId("story-views").click();
  await expect(page.getByTestId("story-viewers")).toContainText("Lea_11");
  await page.getByRole("button", { name: "Fermer" }).last().click();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("story-more").click();
  await page.getByTestId("story-menu-delete").click();
  await expect(page).toHaveURL(/\/app\/fil/, { timeout: 15_000 });
  expect((await apiCall<{ stories: unknown[] }>(damien, "GET", "/me/stories")).data.stories).toHaveLength(0);

  // Une story expirée : le message, rien d'autre.
  const old = await publishStory(damien, { caption: "Déjà finie" });
  await sql("update stories set expires_at = now() - interval '1 minute' where id = $1", [old]);
  await page.goto(`/app/story/${encodeURIComponent(`u:${me}`)}`);
  await expect(page.getByTestId("story-unavailable")).toContainText("Cette story n'est plus disponible", {
    timeout: 30_000,
  });
  await shot(page, "visionneuse-390-plus-disponible");
  await sql("delete from stories where id = $1", [old]);
});

test("390 px, Sable : la barre et la visionneuse tiennent à l'écran, sans défilement horizontal", async ({ page }) => {
  test.setTimeout(180_000);
  await resetViews();
  await setTheme(page, "sable");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto("/app/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".o-avring--crew")).toHaveCount(1, { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await shot(page, "barre-390-sable");
  await page.getByLabel(/Voir les stories de Kenji_66/).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await playing(page);
  const box = await page.getByTestId("story-viewer").boundingBox();
  expect(box && Math.abs(box.width - 390) < 2).toBe(true);
  await shot(page, "visionneuse-390-sable");
});

// --- Tour 2 (relectures Opus et Codex) -------------------------------------------------------------------------------------

async function openFrom(page: Page, label: string | RegExp, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto("/app/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(label).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
}

test("tour 2 : sortir pendant les 1,5 s de « Ne plus voir ses stories » ne recule qu'une fois", async ({ page }) => {
  test.setTimeout(180_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  const theo = await userIdOf("Theo_66");
  await apiCall(damien, "DELETE", `/me/story-mutes/u:${theo}`);
  await openFrom(page, "Voir les stories de Theo_66");
  await playing(page);
  await page.getByTestId("story-more").click();
  await page.getByTestId("story-menu-mute").click();
  await expect(page.getByTestId("story-notice")).toContainText("Tu ne verras plus ces stories");
  // Sortie volontaire dans les 1,5 s : un seul recul, jamais un second (la minuterie du mute est annulée).
  await page.getByTestId("story-close").click();
  await expect(page).toHaveURL(/\/app\/fil/, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(/\/app\/fil/);
  await expect(page.getByTestId("stories-bar")).toBeVisible();
  await apiCall(damien, "DELETE", `/me/story-mutes/u:${theo}`);
});

test("tour 2 : réponse perdue puis texte modifié = autre identifiant ; envoi tardif sans effet sur le brouillon suivant", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  await openFrom(page, /Voir les stories de Kenji_66/);
  // Lot R7h : Kenji_66 a une troisième story (celle du Lydia qui identifie Roues Libres 66).
  await expect(page.getByTestId("story-bars").locator("> *")).toHaveCount(3);
  const ids: string[] = [];
  let mode: "lost" | "pass" | "slow" = "lost";
  await page.route("**/api/stories/*/reply", async (route) => {
    ids.push((route.request().postDataJSON() as { clientId: string }).clientId);
    if (mode === "lost") {
      // Le serveur reçoit la réponse, mais elle est perdue avant d'arriver à l'écran.
      await route.fetch();
      await route.abort();
    } else if (mode === "slow") {
      // Réponse tardive et réussie (rendue par la recette : la règle « une seule demande de contact » est celle de l'API).
      await new Promise((r) => setTimeout(r, 2500));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "message" }) });
    } else await route.continue();
  });
  const input = page.getByTestId("story-reply-input");
  await input.fill("Belle auto");
  await page.getByTestId("story-reply-send").click();
  await expect(page.getByTestId("story-notice")).toBeVisible({ timeout: 15_000 });
  await expect(input).toHaveValue("Belle auto");
  await page.getByTestId("story-reply-send").click();
  await expect.poll(() => ids.length, { timeout: 15_000 }).toBe(2);
  // La même soumission renvoyée garde son identifiant (pas de doublon côté serveur).
  expect(ids[1]).toBe(ids[0]);
  mode = "pass";
  await input.fill("Belle auto !");
  await page.getByTestId("story-reply-send").click();
  await expect.poll(() => ids.length, { timeout: 15_000 }).toBe(3);
  expect(ids[2]).not.toBe(ids[0]);
  await expect(input).toHaveValue("", { timeout: 15_000 });

  // Envoi tardif : on passe à la story suivante pendant que la réponse part ; le brouillon suivant reste.
  mode = "slow";
  // On repart de la première story (la lecture a pu avancer pendant les essais), puis on passe à la suivante en plein envoi.
  while ((await page.getByTestId("story-bar-done").count()) > 0) {
    await page.getByTestId("story-prev").dispatchEvent("click");
    await page.waitForTimeout(200);
  }
  await input.fill("Premier");
  await page.getByTestId("story-reply-send").click();
  await page.getByTestId("story-next").dispatchEvent("click");
  await expect(page.getByTestId("story-bar-done")).toHaveCount(1);
  await input.fill("Brouillon suivant");
  // La réponse tardive réussit : elle le dit, sans effacer le brouillon de la story affichée.
  await expect(page.getByTestId("story-notice")).toContainText("Message envoyé", { timeout: 20_000 });
  await expect.poll(() => ids.length).toBe(4);
  await expect(input).toHaveValue("Brouillon suivant");
});

test("tour 2 : « Réessayer » est cliquable après une panne du média", async ({ page }) => {
  test.setTimeout(180_000);
  await resetViews();
  await page.route("**/api/stories/*/media/**", (route) => route.abort());
  await openFrom(page, "Voir les stories de Lea_11");
  const retry = page.getByRole("button", { name: "Réessayer" });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  await page.unroute("**/api/stories/*/media/**");
  await retry.click();
  await expect(page.getByTestId("story-media")).toBeVisible({ timeout: 30_000 });
  await playing(page);
});

test("tour 2 : onglet masqué = pause et aucune vue ; reculer sur la première story la rejoue", async ({ page }) => {
  test.setTimeout(240_000);
  await resetViews();
  const lea = await userIdOf("Lea_11");
  await page.addInitScript(() => {
    const w = window as unknown as { __hidden: boolean };
    // L'état « masqué » survit aux chargements de page (les liens de la barre sont de vrais liens).
    w.__hidden = sessionStorage.getItem("recette.masque") === "1";
    Object.defineProperty(document, "visibilityState", {
      get: () => (w.__hidden ? "hidden" : "visible"),
      configurable: true,
    });
  });
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      (window as unknown as { __hidden: boolean }).__hidden = h;
      sessionStorage.setItem("recette.masque", h ? "1" : "0");
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  const views = async () =>
    (await sql<{ v: number }>("select views_count as v from stories where author_id = $1", [lea]))[0]?.v;
  await openFrom(page, "Voir les stories de Lea_11");
  await playing(page);
  await expect.poll(views, { timeout: 15_000 }).toBe(1);
  // Pause en arrière-plan : la barre ne bouge plus, le temps restant est gardé.
  await setHidden(true);
  await page.waitForTimeout(300);
  const frozen = await progress(page);
  await page.waitForTimeout(1200);
  expect(Math.abs((await progress(page)) - frozen)).toBeLessThan(3);
  await setHidden(false);
  await expect.poll(() => progress(page), { timeout: 10_000 }).toBeGreaterThan(frozen + 5);
  // Reculer sur la première story : elle repart du début.
  await page.waitForTimeout(1500);
  const before = await progress(page);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  expect(await progress(page)).toBeLessThan(before - 25);
  await playing(page);
  // Une story ouverte onglet masqué n'est pas comptée vue.
  await sql("delete from story_views");
  await sql("update stories set views_count = 0");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/app\/fil/);
  await setHidden(true);
  await page.getByLabel("Voir les stories de Lea_11").click();
  await expect(page.getByTestId("story-media")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  expect(await views()).toBe(0);
  await setHidden(false);
  await expect.poll(views, { timeout: 15_000 }).toBe(1);
});

test("tour 2 : le total des vues reste vrai au-delà de 200 ; l'aperçu du profil n'ouvre pas la visionneuse", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  await dropMyStories(damien);
  const id = await publishStory(damien, { caption: "Beaucoup de vues" });
  await sql("update stories set views_count = 250 where id = $1", [id]);
  const me = await userIdOf("Damien_66");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto(`/app/story/${encodeURIComponent(`u:${me}`)}`);
  await expect(page.getByTestId("story-views")).toContainText("Vues · 250", { timeout: 30_000 });
  await page.getByTestId("story-views").click();
  await expect(page.getByTestId("story-viewers-partial")).toContainText("200", { timeout: 15_000 });
  await expect(page.getByTestId("story-viewers-dialog").getByRole("heading")).toHaveText("Vues · 250");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // L'aperçu de mon profil : l'anneau ne mène nulle part ; mon profil réel, lui, ouvre la visionneuse.
  await page.goto("/app/profil-public");
  await expect(page.getByTestId("preview-banner")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("public-head").locator("a.o-avring")).toHaveCount(0);
  await page.goto("/u/Damien_66");
  await expect(page.getByTestId("public-head").locator("a.o-avring")).toHaveCount(1, { timeout: 30_000 });
  await dropMyStories(damien);
});

// --- Tour 4 (re-relecture Codex du tour 2) ---------------------------------------------------------------------------------

/** L'état « onglet masqué » survit aux rechargements ; `setHiddenTo` rend, sans attendre, ce que la page montre. */
async function installHiddenSwitch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __hidden: boolean };
    w.__hidden = sessionStorage.getItem("recette.masque") === "1";
    Object.defineProperty(document, "visibilityState", {
      get: () => (w.__hidden ? "hidden" : "visible"),
      configurable: true,
    });
  });
}
const setHiddenTo = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    (window as unknown as { __hidden: boolean }).__hidden = h;
    sessionStorage.setItem("recette.masque", h ? "1" : "0");
    document.dispatchEvent(new Event("visibilitychange"));
    // Ce que la page montre aussitôt après l'événement (avant toute réponse du réseau).
    return {
      text: document.body.innerText,
      openDialogs: document.querySelectorAll("dialog[open]").length,
      media: document.querySelectorAll('img[data-testid="story-media"]').length,
      crewBadge: document.querySelectorAll('[data-testid="story-crew-badge"]').length,
    };
  }, hidden);

/** Dans un autre onglet du même navigateur : A se déconnecte, B se connecte. */
async function switchAccountElsewhere(page: Page, email: string) {
  const other = await page.context().newPage();
  await other.goto("/");
  await other.evaluate(() =>
    fetch("/deconnexion", { method: "POST", body: new URLSearchParams(), credentials: "same-origin" }),
  );
  await loginInBrowser(other, email, undefined, "/app");
  await other.close();
}

test("tour 4 : session changée dans un autre onglet : au retour, rien de ma story privée ni de la liste des vues", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  await dropMyStories(damien);
  const id = await publishStory(damien, { caption: "Légende privée de Damien" });
  for (const n of ["Lea_11", "Theo_66"])
    await sql("insert into story_views (story_id, viewer_id) values ($1, $2) on conflict do nothing", [
      id,
      await userIdOf(n),
    ]);
  await sql("update stories set views_count = 2 where id = $1", [id]);
  const me = await userIdOf("Damien_66");
  await installHiddenSwitch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto(`/app/story/${encodeURIComponent(`u:${me}`)}`);
  await expect(page.getByTestId("story-views")).toContainText("Vues · 2", { timeout: 30_000 });
  await page.getByTestId("story-views").click();
  await expect(page.getByTestId("story-viewer-Lea_11")).toBeVisible({ timeout: 15_000 });
  // L'onglet passe en arrière-plan avec la liste ouverte ; ailleurs, B remplace A.
  await setHiddenTo(page, true);
  await switchAccountElsewhere(page, "pilote100@orasso.local");
  // Retour au premier plan : tout est masqué dans l'instant, avant la moindre réponse du réseau.
  const back = await setHiddenTo(page, false);
  expect(back.text).not.toContain("Légende privée de Damien");
  expect(back.text).not.toContain("Lea_11");
  expect(back.text).not.toContain("Theo_66");
  expect(back.text).not.toContain("Vues ·");
  expect(back.openDialogs).toBe(0);
  expect(back.media).toBe(0);
  // La page repart sur le compte B : rien de la liste de A, ni de ses métadonnées.
  await expect(page.getByTestId("story-checking")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("story-views")).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Lea_11");
  expect(text).not.toContain("Theo_66");
  // Ce que B a le droit de voir de la story de Damien (selon l'API) est le seul contenu possible : jamais les vues de A.
  await shot(page, "tour4-changement-de-compte-onglet");
  await dropMyStories(damien);
});

test("tour 4 : session changée dans un autre onglet : la photo d'une story de crew disparaît au retour", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  await installHiddenSwitch(page);
  await openFrom(page, /Voir les stories de Kenji_66/);
  // Se place sur la story du crew (bandeau brique).
  for (let i = 0; i < 3 && (await page.getByTestId("story-crew-badge").count()) === 0; i++) {
    await page.getByTestId("story-next").dispatchEvent("click");
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId("story-crew-badge")).toBeVisible();
  await expect(page.getByTestId("story-media")).toBeVisible();
  await setHiddenTo(page, true);
  await switchAccountElsewhere(page, "pilote100@orasso.local");
  const back = await setHiddenTo(page, false);
  expect(back.crewBadge).toBe(0);
  expect(back.media).toBe(0);
  expect(back.text).not.toContain("Mon crew");
  // Rechargée pour B : B n'est pas du crew, la story de crew n'est jamais servie.
  await expect(page.getByTestId("story-checking")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("story-crew-badge")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("Mon crew");
});

// --- Tour 5 (re-relecture Codex du tour 4) --------------------------------------------------------------------------------

const focusBack = (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });

async function openOwnStory(page: Page, caption: string) {
  await resetViews();
  const damien = await login("damien@orasso.local");
  await dropMyStories(damien);
  const id = await publishStory(damien, { caption });
  const me = await userIdOf("Damien_66");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto(`/app/story/${encodeURIComponent(`u:${me}`)}`);
  await expect(page.getByTestId("story-media")).toBeVisible({ timeout: 30_000 });
  return { damien, id, me, url: page.url() };
}

test("tour 5 : deux pages visibles en même temps : B se connecte, la première ne montre plus rien de A (même avec /me retardée)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { damien, id, me } = await openOwnStory(page, "Légende privée de Damien");
  for (const n of ["Lea_11", "Theo_66"])
    await sql("insert into story_views (story_id, viewer_id) values ($1, $2) on conflict do nothing", [
      id,
      await userIdOf(n),
    ]);
  await sql("update stories set views_count = 2 where id = $1", [id]);
  await page.goto(`/app/story/${encodeURIComponent(`u:${me}`)}`);
  await expect(page.getByTestId("story-views")).toContainText("Vues · 2", { timeout: 30_000 });
  await page.getByTestId("story-views").click();
  await expect(page.getByTestId("story-viewer-Lea_11")).toBeVisible({ timeout: 15_000 });
  // La page reste visible (aucune bascule d'onglet) ; la réponse de `/me` est retenue pour voir l'état intermédiaire.
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/me", async (route) => {
    await gate;
    await route.continue();
  });
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  await switchAccountElsewhere(page, "pilote100@orasso.local");
  // Annonce reçue : tout est masqué pendant la vérification (réponse de `/me` toujours en attente).
  await expect(page.getByTestId("story-checking")).toBeVisible({ timeout: 15_000 });
  const during = await page.evaluate(() => ({
    text: document.body.innerText,
    openDialogs: document.querySelectorAll("dialog[open]").length,
    media: document.querySelectorAll('img[data-testid="story-media"]').length,
  }));
  expect(during.text).not.toContain("Légende privée de Damien");
  expect(during.text).not.toContain("Lea_11");
  expect(during.text).not.toContain("Theo_66");
  expect(during.text).not.toContain("Vues ·");
  expect(during.openDialogs).toBe(0);
  expect(during.media).toBe(0);
  release();
  await expect(page.getByTestId("story-checking")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("story-views")).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Lea_11");
  expect(text).not.toContain("Theo_66");
  await dropMyStories(damien);
});

test("tour 5 : /me retardée au retour du focus : la story ne défile pas ; panne de /me : « Réessayer », la story ne se ferme pas", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { damien, url } = await openOwnStory(page, "Une seule story");
  const here = () => new URL(page.url()).pathname;
  const path = new URL(url).pathname;
  // (b) /me retardée plus longtemps que la durée d'une photo : rien ne défile, la visionneuse ne se ferme pas.
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/me", async (route) => {
    await gate;
    await route.continue();
  });
  await focusBack(page);
  await expect(page.getByTestId("story-checking")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(7000);
  expect(here()).toBe(path);
  await expect(page.getByTestId("story-checking")).toBeVisible();
  release();
  await expect(page.getByTestId("story-checking")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("story-media")).toBeVisible();
  expect(here()).toBe(path);
  await page.unroute("**/api/me");
  // (c) Panne réseau de /me : « Réessayer », rien ne se ferme ni ne défile.
  await page.route("**/api/me", (route) => route.abort());
  await focusBack(page);
  await expect(page.getByTestId("story-unverified")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(7000);
  expect(here()).toBe(path);
  await expect(page.getByTestId("story-retry")).toBeVisible();
  await page.unroute("**/api/me");
  await page.getByTestId("story-retry").click();
  await expect(page.getByTestId("story-unverified")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("story-media")).toBeVisible();
  await dropMyStories(damien);
});

test("tour 4 : deux réponses en parallèle : un identifiant par soumission, bouton inactif pendant l'envoi, reprise sans doublon", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  await sql(
    "delete from contact_requests where from_user_id = (select user_id from profiles where pseudo = 'Damien_66') and to_user_id = (select user_id from profiles where pseudo = 'Kenji_66')",
  );
  await openFrom(page, /Voir les stories de Kenji_66/);
  // Lot R7h : Kenji_66 a une troisième story (celle du Lydia qui identifie Roues Libres 66).
  await expect(page.getByTestId("story-bars").locator("> *")).toHaveCount(3);
  const sent: { story: string; clientId: string }[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/stories/*/reply", async (route) => {
    const story = /stories\/([^/]+)\/reply/.exec(route.request().url())?.[1] ?? "";
    sent.push({ story, clientId: (route.request().postDataJSON() as { clientId: string }).clientId });
    if (sent.length === 1) {
      // Le premier envoi est tenu, puis sa réponse est perdue (le serveur l'a reçu).
      await gate;
      await route.fetch();
      await route.abort();
    } else if (sent.length === 2) {
      // Le second envoi aboutit (rendu par la recette : la règle « une seule demande de contact » est celle de l'API).
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ mode: "message" }),
      });
    } else await route.continue();
  });
  while ((await page.getByTestId("story-bar-done").count()) > 0) {
    await page.getByTestId("story-prev").dispatchEvent("click");
    await page.waitForTimeout(200);
  }
  const input = page.getByTestId("story-reply-input");
  const send = page.getByTestId("story-reply-send");
  await input.fill("Un");
  await send.click();
  await expect.poll(() => sent.length).toBe(1);
  // Sur la story suivante, un autre envoi part et aboutit pendant que le premier est encore en cours.
  await page.getByTestId("story-next").dispatchEvent("click");
  await expect(page.getByTestId("story-bar-done")).toHaveCount(1);
  await input.fill("Deux");
  await send.click();
  await expect.poll(() => sent.length).toBe(2);
  await expect(page.getByTestId("story-notice")).toContainText("Message envoyé", { timeout: 20_000 });
  expect(sent[1]?.story).not.toBe(sent[0]?.story);
  // Retour sur la première : son envoi est toujours en cours, le bouton reste inactif.
  await page.getByTestId("story-prev").dispatchEvent("click");
  await expect(page.getByTestId("story-bar-done")).toHaveCount(0);
  await input.fill("Un");
  await expect(send).toBeDisabled();
  // Sa réponse est perdue : le bouton redevient actif, et le renvoi reprend le même identifiant (pas de doublon).
  release();
  await expect(send).toBeEnabled({ timeout: 20_000 });
  await send.click();
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBe(3);
  expect(sent[2]?.story).toBe(sent[0]?.story);
  expect(sent[2]?.clientId).toBe(sent[0]?.clientId);
  expect(sent[1]?.clientId).not.toBe(sent[0]?.clientId);
});

test("tour 4 : une photo en panne ne bloque pas le passage à la suivante ; « Réessayer » reste touchable", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  const kenji = await userIdOf("Kenji_66");
  const list = await apiCall<{ stories: { id: string }[] }>(damien, "GET", `/stories/by-author/u:${kenji}`);
  const first = list.data.stories[0]?.id ?? "";
  expect(first).toBeTruthy();
  await page.route(`**/api/stories/${first}/media/**`, (route) => route.abort());
  await openFrom(page, /Voir les stories de Kenji_66/);
  const retry = page.getByTestId("story-photo-retry");
  await expect(retry).toBeVisible({ timeout: 30_000 });
  const surface = (await page.getByTestId("story-surface").boundingBox()) ?? { x: 0, y: 0, width: 390, height: 844 };
  // Le toucher à droite passe à la story suivante, malgré la photo en panne.
  await page.mouse.click(surface.x + surface.width * 0.85, surface.y + surface.height * 0.5);
  await expect(page.getByTestId("story-bar-done")).toHaveCount(1);
  await expect(page.getByTestId("story-media")).toBeVisible({ timeout: 30_000 });
  await playing(page);
  // Le toucher à gauche revient à la photo en panne : « Réessayer » la relit.
  await page.unroute(`**/api/stories/${first}/media/**`);
  await page.mouse.click(surface.x + surface.width * 0.1, surface.y + surface.height * 0.5);
  await expect(page.getByTestId("story-bar-done")).toHaveCount(0);
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await retry.click();
  await expect(page.getByTestId("story-media")).toBeVisible({ timeout: 30_000 });
  await playing(page);
});

test("tour 4 : le total des vues vient de la liste relue : des vues arrivées entre l'ouverture et la liste", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const damien = await login("damien@orasso.local");
  await dropMyStories(damien);
  const id = await publishStory(damien, { caption: "Vues fraîches" });
  const me = await userIdOf("Damien_66");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  await page.goto(`/app/story/${encodeURIComponent(`u:${me}`)}`);
  // Ouverte à zéro vue.
  await expect(page.getByTestId("story-views")).toContainText("Vues · 0", { timeout: 30_000 });
  for (const n of ["Lea_11", "Theo_66", "Kenji_66"])
    await sql("insert into story_views (story_id, viewer_id) values ($1, $2) on conflict do nothing", [
      id,
      await userIdOf(n),
    ]);
  await sql("update stories set views_count = 3 where id = $1", [id]);
  await page.getByTestId("story-views").click();
  const dialog = page.getByTestId("story-viewers-dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Vues · 3", { timeout: 15_000 });
  await expect(page.getByTestId("story-viewers").locator("li")).toHaveCount(3);
  await expect(page.getByTestId("story-viewers-partial")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Au-delà de 200 entre deux lectures : le total frais déclenche la mention de liste partielle.
  await sql("update stories set views_count = 201 where id = $1", [id]);
  await page.getByTestId("story-views").click();
  await expect(dialog.getByRole("heading")).toHaveText("Vues · 201", { timeout: 15_000 });
  await expect(page.getByTestId("story-viewers-partial")).toContainText("200");
  await dropMyStories(damien);
});

// --- Tour 6 (re-relectures du tour 5) ---------------------------------------------------------------------------------------

test("tour 6 : déconnexion par le vrai bouton : l'autre page ne l'apprend qu'après la révocation, et ne réaffiche jamais rien de A", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { damien } = await openOwnStory(page, "Légende privée de Damien");
  const caption = "Légende privée de Damien";
  const second = await page.context().newPage();
  await second.setViewportSize({ width: 390, height: 844 });
  let releaseLogout = () => {};
  const logoutGate = new Promise<void>((r) => {
    releaseLogout = r;
  });
  let releaseLoads = () => {};
  const loadsGate = new Promise<void>((r) => {
    releaseLoads = r;
  });
  let blockLoads = false;
  let logoutSeen = false;
  await second.route(/\.data(\?|$)|\/deconnexion/, async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.url().includes("/deconnexion")) {
      logoutSeen = true;
      await logoutGate;
      const res = await route.fetch();
      // La session est révoquée ; tout chargement qui suit (destination de la déconnexion) est suspendu.
      blockLoads = true;
      await route.fulfill({ response: res });
      return;
    }
    if (blockLoads) await loadsGate;
    await route.continue();
  });
  await second.goto("/app/moi");
  const out = second.getByTestId("reglage-deconnexion");
  await expect(out).toBeVisible({ timeout: 30_000 });
  await out.click();
  await expect.poll(() => logoutSeen, { timeout: 15_000 }).toBe(true);
  // Déconnexion en cours, session encore valide : rien n'est annoncé, la visionneuse de la première page ne bouge pas.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("story-checking")).toHaveCount(0);
  await expect(page.getByTestId("story-media")).toBeVisible();
  const meCheck = page.waitForRequest((r) => /\/api\/me$/.test(new URL(r.url()).pathname), { timeout: 30_000 });
  releaseLogout();
  // Annonce après la révocation : la première page se masque, relit le compte (401) et part vers la connexion.
  // La seconde page, elle, n'a pas fini de charger sa destination (suspendue) : la première ne dépend pas d'elle.
  await meCheck;
  for (let i = 0; i < 8; i++) {
    expect(await page.locator("body").innerText()).not.toContain(caption);
    expect(await page.locator('img[data-testid="story-media"]').count()).toBe(0);
    await page.waitForTimeout(500);
  }
  releaseLoads();
  await second.close();
  await dropMyStories(damien);
});

test("tour 6 : photo réaffichée seulement quand elle est chargée : média retardé après le retour du focus", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { damien, id, url } = await openOwnStory(page, "Une seule story");
  const path = new URL(url).pathname;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let mediaRequests = 0;
  await page.route(`**/api/stories/${id}/media/**`, async (route) => {
    mediaRequests++;
    await gate;
    await route.continue();
  });
  // Quelques secondes de lecture, puis le focus revient : le média est relu, et sa réponse est retardée.
  await page.waitForTimeout(3000);
  await focusBack(page);
  await expect.poll(() => mediaRequests, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId("story-checking")).toHaveCount(0, { timeout: 30_000 });
  // Plus longtemps que le temps restant d'une photo : la story ne passe pas et la visionneuse ne se ferme pas.
  await page.waitForTimeout(6500);
  expect(new URL(page.url()).pathname).toBe(path);
  release();
  await expect(page.getByTestId("story-media")).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe(path);
  await dropMyStories(damien);
});
