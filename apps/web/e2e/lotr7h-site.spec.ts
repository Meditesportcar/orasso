import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { dropStory, publishStory, sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R7h, côté site : la page de l'événement de l'organisateur (Mentions, Ajouter à ma story, Ma story, Retirer), la
// visionneuse avec le crédit cliquable, l'Activité (Repartager), le bloc « En cours » de l'Accueil, la fiche ; et, par l'API,
// la vie privée : copie refusée pour un crew et un compte privé, jamais sans session. Le Lydia doit être en cours.
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7h-captures/apres/recette-site`).replaceAll("\\", "/");
test.use({ actionTimeout: 30_000 });
test.setTimeout(300_000);

async function shot(page: Page, name: string, full = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
}

async function reset() {
  await sql("delete from stories where shared_from_story_id is not null");
  await sql("update story_tags set removed_at = null");
  await sql("delete from story_views");
}

test("organisateur : Mentions, Ajouter à ma story, Ma story, Retirer ; Damien voit l'anneau, le crédit, le bloc En cours", async ({
  browser,
}) => {
  await reset();
  const kenji = await login("kenji@orasso.local");
  const structure =
    (await sql<{ id: string }>("select id from structures where slug = 'roues-libres-66'"))[0]?.id ?? "";
  const event = (
    await sql<{ id: string; slug: string }>("select id, slug from events where slug = 'rassemblement-du-lydia'")
  )[0];
  const id = await publishStory(kenji, {
    audience: "public",
    caption: "Recette site R7h",
    tags: [{ kind: "structure", id: structure }],
  });
  try {
    for (const [theme, width, height] of [
      ["beton", 1280, 900],
      ["sable", 390, 844],
    ] as const) {
      await reset();
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      await loginInBrowser(page, "sarah@orasso.local", SEED_PASSWORD, "/app");
      await setTheme(page, theme);
      await page.goto(`/orga/roues-libres-66/e/${event?.id}`);
      await page.waitForLoadState("networkidle");
      const orgaStory = page.getByTestId("orga-story");
      await expect(orgaStory).toBeVisible();
      await expect(orgaStory.getByRole("heading").first()).toContainText(/Mentions · \d+/);
      const mention = orgaStory.getByTestId("orga-mention").filter({ hasText: "Kenji_66" }).first();
      await expect(mention).toBeVisible();
      await shot(page, `orga-mentions-${theme}-${width}`, true);
      // Les aperçus sont lus dans le navigateur : aucune adresse de média dans le HTML rendu par le serveur.
      const html = await (await page.request.get(page.url())).text();
      expect(html).not.toMatch(/\/api\/stories\/[0-9a-f-]+\/media/);
      await mention.getByTestId("orga-mention-add").click();
      await expect(page.getByTestId("orga-story-notice")).toContainText("Ajoutée à ta story");
      await expect(page.getByTestId("orga-mystory-credit").first()).toContainText("Story de Kenji_66");
      await shot(page, `orga-ma-story-${theme}-${width}`, true);

      // Damien : crédit cliquable dans la visionneuse, Accueil, fiche.
      const dctx = await browser.newContext({ viewport: { width, height } });
      const damien = await dctx.newPage();
      await loginInBrowser(damien, "damien@orasso.local", SEED_PASSWORD, "/app");
      await setTheme(damien, theme);
      await damien.goto(`/app/story/${encodeURIComponent(`s:${structure}`)}`);
      await expect(damien.getByTestId("story-shared-by")).toContainText(
        "Story de Kenji_66, ajoutée par Roues Libres 66",
        {
          timeout: 30_000,
        },
      );
      await expect(damien.getByTestId("story-shared-by-author")).toHaveAttribute("href", "/u/Kenji_66");
      await shot(damien, `visionneuse-credit-${theme}-${width}`);
      await damien.goto("/app");
      await damien.waitForLoadState("networkidle");
      await expect(damien.getByTestId("home-live-organizer-story")).toBeVisible();
      await shot(damien, `accueil-story-organisateur-${theme}-${width}`, true);
      await damien.goto(`/e/${event?.slug}`);
      await damien.waitForLoadState("networkidle");
      await expect(damien.getByTestId("event-organizer-story")).toBeVisible();
      await shot(damien, `fiche-story-organisateur-${theme}-${width}`);
      await dctx.close();

      // « Retirer » : la copie seule.
      await page.goto(`/orga/roues-libres-66/e/${event?.id}`);
      await page.waitForLoadState("networkidle");
      await page
        .getByTestId("orga-mystory-row")
        .filter({ hasText: "Story de Kenji_66" })
        .getByTestId("orga-mystory-remove")
        .click();
      await expect(page.getByTestId("orga-story-notice")).toContainText("Retirée de ta story");
      expect(
        (await sql("select 1 from stories where shared_from_story_id = $1 and deleted_at is null", [id])).length,
      ).toBe(0);
      expect((await sql("select 1 from stories where id = $1 and deleted_at is null", [id])).length).toBe(1);
      await ctx.close();
    }
  } finally {
    await dropStory(kenji, id);
    await reset();
  }
});

test("Activité de Damien : « Repartager » (copie pour ses abonnés) ; vie privée par l'API", async ({ browser }) => {
  await reset();
  const damienCookie = await login("damien@orasso.local");
  // Une identification neuve (la notification porte `data.target`) : Kenji identifie Damien dans une story publique.
  const kenji = await login("kenji@orasso.local");
  const damienId = (await sql<{ user_id: string }>("select user_id from profiles where pseudo = 'Damien_66'"))[0]
    ?.user_id;
  const fresh = await publishStory(kenji, {
    audience: "public",
    caption: "Recette identifié",
    tags: [{ kind: "user", id: damienId }],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", SEED_PASSWORD, "/app");
  await page.goto("/app/activite");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("story-mention-reshare").first()).toBeVisible();
  await shot(page, "activite-identifie-390", true);
  await page.getByTestId("story-mention-reshare").first().click();
  await expect(page.getByTestId("story-mention-done").first()).toContainText("Repartagée");
  const copies = await sql<{ persona: string; audience: string }>(
    "select persona, audience from stories where shared_from_story_id is not null and deleted_at is null",
  );
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({ persona: "fan", audience: "followers" });
  await ctx.close();
  await reset();
  await dropStory(kenji, fresh);

  // Sans session : rien. Une story de crew ne se reprend pas, même identifié à la main.
  expect((await apiCall(null, "POST", "/stories/00000000-0000-4000-8000-000000000000/share-to-mine", {})).status).toBe(
    401,
  );
  const crewStory = (await sql<{ id: string }>("select id from stories where audience = 'crew' limit 1"))[0]?.id;
  if (crewStory) {
    const damien = (await sql<{ user_id: string }>("select user_id from profiles where pseudo = 'Damien_66'"))[0]
      ?.user_id;
    await sql(
      "insert into story_tags (story_id, target_kind, target_id) values ($1, 'user', $2) on conflict do nothing",
      [crewStory, damien],
    );
    const res = await apiCall(damienCookie, "POST", `/stories/${crewStory}/share-to-mine`, {});
    expect([403, 404]).toContain(res.status);
    await sql("delete from story_tags where story_id = $1 and target_id = $2", [crewStory, damien]);
  }
});
