import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { dropStory, publishStory, sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R7h (la story de l'organisateur « En cours »), côté appli (version compilée de recette) : Kenji identifie Roues Libres
// 66 → « Mentions » dans le Direct de Sarah → « Ajouter à ma story » → l'anneau « EN COURS » dans la barre de Damien_66, la
// visionneuse avec le crédit → « Retirer » ; Kenji supprime → la copie disparaît ; « Repartager » par un identifié (Activité).
// APP_URL = l'appli compilée ; API et seed lancés ; le Lydia doit être en cours (horloge simulée dans ses heures).
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7h-captures/apres/recette-appli`).replaceAll("\\", "/");
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.setTimeout(420_000);

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton", scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|moi|direct/, { timeout: 60_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string, full = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
}

async function toDirect(page: Page) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").filter({ hasText: "Roues Libres" }).first().click();
  await page.waitForURL(/\/direct/, { timeout: 60_000 });
}

/** État de départ : plus de copie, identifications de Kenji rétablies, une story neuve de Kenji qui identifie la structure. */
async function setup() {
  await sql("delete from stories where shared_from_story_id is not null");
  await sql("update story_tags set removed_at = null");
  await sql("delete from story_views");
  const kenji = await login("kenji@orasso.local");
  const structure =
    (await sql<{ id: string }>("select id from structures where slug = 'roues-libres-66'"))[0]?.id ?? "";
  const id = await publishStory(kenji, {
    audience: "public",
    caption: "Recette R7h",
    tags: [{ kind: "structure", id: structure }],
  });
  return { kenji, structure, id };
}

test("Mentions → Ajouter à ma story → anneau EN COURS et crédit chez Damien → Retirer ; Kenji supprime : disparue", async ({
  browser,
}) => {
  const { kenji, structure, id } = await setup();
  try {
    // Sarah, casquette organisateur : le Direct annonce les mentions.
    const sarah = await open(browser, "sarah@orasso.local", "beton");
    await toDirect(sarah.page);
    await expect(sarah.page.getByTestId("orga-direct-mentions")).toContainText(/Mentions · \d+/, { timeout: 40_000 });
    await shot(sarah.page, "direct-mentions", true);
    await sarah.page.getByTestId("orga-direct-mentions").click();
    await expect(sarah.page.getByTestId("mentions-list")).toBeVisible({ timeout: 30_000 });
    await expect(sarah.page.getByTestId("mention-row").filter({ hasText: "Kenji_66" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(sarah.page, "mentions-liste-beton", true);
    await sarah.page.getByTestId("mention-row").filter({ hasText: "Kenji_66" }).first().click();
    await expect(sarah.page.getByTestId("mention-add")).toBeVisible({ timeout: 30_000 });
    await shot(sarah.page, "mention-ajouter-beton");
    await sarah.page.getByTestId("mention-add").click();
    await expect(sarah.page.getByTestId("mention-remove")).toBeVisible({ timeout: 30_000 });
    await shot(sarah.page, "mention-ajoutee-beton");
    const copies = await sql<{ id: string; audience: string; persona: string }>(
      "select id, audience, persona from stories where shared_from_story_id = $1 and deleted_at is null",
      [id],
    );
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ audience: "public", persona: "organizer" });
    await sarah.ctx.close();

    // Damien (retenu, entré) : l'anneau « EN COURS » dans sa barre, la visionneuse avec le crédit, l'Accueil.
    for (const theme of ["beton", "sable"] as const) {
      await sql("delete from story_views");
      const damien = await open(browser, "damien@orasso.local", theme);
      await damien.page.goto("/fil");
      await afterOpening(damien.page);
      const entry = damien.page.getByTestId(`stories-author-s:${structure}`);
      await expect(entry.getByTestId("stories-ring-live")).toBeVisible({ timeout: 40_000 });
      await expect(entry.getByTestId("stories-live-label")).toBeVisible();
      await shot(damien.page, `fil-en-cours-${theme}`);
      await entry.getByLabel(/Voir les stories de/).click();
      await expect(damien.page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      await expect(damien.page.getByTestId("story-shared-by")).toContainText(
        "Story de Kenji_66, ajoutée par Roues Libres 66",
        { timeout: 30_000 },
      );
      await shot(damien.page, `visionneuse-credit-${theme}`);
      await damien.page.goto("/accueil");
      await afterOpening(damien.page);
      await expect(damien.page.getByTestId("home-live-organizer-story")).toBeVisible({ timeout: 40_000 });
      await shot(damien.page, `accueil-story-organisateur-${theme}`, true);
      await damien.ctx.close();
    }

    // Police agrandie : le Direct et la liste tiennent.
    const big = await open(browser, "sarah@orasso.local", "sable", 1.3);
    await toDirect(big.page);
    await expect(big.page.getByTestId("orga-direct-mentions")).toBeVisible({ timeout: 40_000 });
    await shot(big.page, "direct-mentions-sable-x13", true);
    await big.ctx.close();

    // « Ma story » puis « Retirer » (la copie seule ; l'originale reste chez Kenji).
    const sarah2 = await open(browser, "sarah@orasso.local", "sable");
    await toDirect(sarah2.page);
    await sarah2.page.getByTestId("orga-direct-mystory").click();
    await expect(sarah2.page.getByTestId("mystory-credit").first()).toContainText("Story de Kenji_66", {
      timeout: 30_000,
    });
    await shot(sarah2.page, "ma-story-sable", true);
    sarah2.page.once("dialog", (d) => void d.accept());
    await sarah2.page
      .getByTestId("mystory-row")
      .filter({ hasText: "Story de Kenji_66" })
      .getByTestId("mystory-remove")
      .click();
    await expect
      .poll(
        async () =>
          (await sql("select 1 from stories where shared_from_story_id = $1 and deleted_at is null", [id])).length,
        { timeout: 30_000 },
      )
      .toBe(0);
    expect((await sql("select 1 from stories where id = $1 and deleted_at is null", [id])).length).toBe(1);
    await sarah2.ctx.close();

    // Ajout de nouveau, puis Kenji supprime son original : la copie disparaît avec lui.
    const sarahCookie = await login("sarah@orasso.local");
    const again = await apiCall<{ id: string }>(sarahCookie, "POST", `/stories/${id}/share-to-mine`, {
      asStructureId: structure,
    });
    expect(again.status).toBe(201);
    await apiCall(kenji, "DELETE", `/me/stories/${id}`);
    expect((await sql("select 1 from stories where id = $1 and deleted_at is null", [again.data.id])).length).toBe(0);
  } finally {
    await dropStory(kenji, id);
    await sql("delete from stories where shared_from_story_id is not null");
  }
});

test("Activité de Damien : « Repartager » et « Retirer » sur une identification reçue", async ({ browser }) => {
  await sql("delete from stories where shared_from_story_id is not null");
  await sql("update story_tags set removed_at = null");
  // Une identification neuve (la notification porte `data.target`) : Kenji identifie Damien dans une story publique.
  const kenji = await login("kenji@orasso.local");
  const damienId = (await sql<{ user_id: string }>("select user_id from profiles where pseudo = 'Damien_66'"))[0]
    ?.user_id;
  const fresh = await publishStory(kenji, {
    audience: "public",
    caption: "Recette identifié",
    tags: [{ kind: "user", id: damienId }],
  });
  const damien = await open(browser, "damien@orasso.local", "beton");
  await damien.page.goto("/activite");
  await afterOpening(damien.page);
  const row = damien.page.getByTestId("activity-story-mention").first();
  await expect(row).toBeVisible({ timeout: 40_000 });
  await expect(damien.page.getByTestId("story-mention-reshare").first()).toBeVisible();
  await shot(damien.page, "activite-identifie-beton", true);
  await damien.page.getByTestId("story-mention-reshare").first().click();
  await expect(damien.page.getByTestId("story-mention-done").first()).toContainText(/Repartagée/, { timeout: 30_000 });
  const copies = await sql<{ persona: string; audience: string }>(
    "select persona, audience from stories where shared_from_story_id is not null and deleted_at is null",
  );
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({ persona: "fan", audience: "followers" });
  await shot(damien.page, "activite-repartagee-beton");
  await damien.ctx.close();
  await sql("delete from stories where shared_from_story_id is not null");
  await dropStory(kenji, fresh);
});
