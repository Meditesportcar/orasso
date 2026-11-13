import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser } from "./helpers";
import { sql } from "./lotr7f2-setup";

// Lot R9h, partie 1, tour 3 : « Publier en mon nom » quand la casquette choisie disparaît pendant la rédaction, avec un envoi
// incertain (panne réseau puis perte des droits). Le changement d'auteur passe par la vérification de « Modifier ma publication » :
// publication retrouvée → confirmation, rien ne change ; absence confirmée → « Moi » et nouvel identifiant. Jamais un « Moi » affiché
// alors que la requête rejouée porte encore la page.
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.use({ actionTimeout: 30_000, viewport: { width: 1280, height: 900 } });

type Router = { __reactRouterDataRouter: { revalidate: () => Promise<void> } };
const revalidate = (page: Page) =>
  page.evaluate(() => (window as unknown as Router).__reactRouterDataRouter.revalidate());

async function openAsStructure(page: Page) {
  const structure = (await sql("select id from structures where slug = 'roues-libres-66'")) as { id: string }[];
  const to = `/app/fil/publier?auteur=s%3A${structure[0]?.id}`;
  await loginInBrowser(page, "sarah@orasso.local", undefined, to);
  await page.goto(to);
  await expect(page.locator('[data-testid^="fil-publish-as-structure:"][aria-pressed="true"]')).toContainText(
    "Roues Libres 66",
  );
}

/** Une photo, « aucune plaque », puis un envoi dont la réponse se perd (`reachServer` : la publication est créée côté serveur). */
async function lostThenUncertain(page: Page, reachServer: boolean) {
  await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  await page.getByTestId("fil-publish-caption").fill(`Annonce de la page ${Date.now()}`);
  await page.route("**/api/me/feed-posts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (reachServer) await route.fetch();
    await route.abort("failed");
  });
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
  await page.unroute("**/api/me/feed-posts");
}

async function withSuspension(run: () => Promise<void>) {
  const before = (await sql(
    "select verification, suspended_reason from structures where slug = 'roues-libres-66'",
  )) as {
    verification: string;
    suspended_reason: string | null;
  }[];
  try {
    await run();
  } finally {
    const was = before[0];
    if (was) {
      await sql(
        `update structures set verification = '${was.verification}', suspended_reason = ${
          was.suspended_reason ? `'${was.suspended_reason}'` : "null"
        } where slug = 'roues-libres-66'`,
      );
    }
  }
}

const suspend = () =>
  sql(
    "update structures set verification = 'suspended', suspended_reason = 'moderation' where slug = 'roues-libres-66'",
  );

test("Publier : panne réseau puis perte de la page, rien n'est arrivé : « Publier en mon nom » vérifie, libère, puis « Moi »", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await withSuspension(async () => {
    await openAsStructure(page);
    await lostThenUncertain(page, false);
    await suspend();
    await revalidate(page);
    const lost = page.getByTestId("fil-publish-author-lost-me");
    await expect(lost).toBeVisible({ timeout: 30_000 });
    // Aucun « Moi » affiché alors que la requête rejouée porterait encore la page : rien n'est marqué choisi, l'envoi reste incertain.
    await expect(page.locator('[data-testid^="fil-publish-as-"][aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
    await lost.click();
    // Absence confirmée (la requête n'est jamais arrivée) : l'envoi n'est plus incertain, « Moi » est choisi.
    await expect(page.getByTestId("fil-publish-uncertain")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("fil-publish-as-me")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("fil-publish-author-lost-me")).toHaveCount(0);
  });
});

test("Publier : la publication était partie et la structure reste suspendue : « Publier en mon nom » la tient pour retrouvée (409 post_unavailable), ne change rien", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await withSuspension(async () => {
    await openAsStructure(page);
    await lostThenUncertain(page, true);
    await suspend();
    await revalidate(page);
    const lost = page.getByTestId("fil-publish-author-lost-me");
    await expect(lost).toBeVisible({ timeout: 30_000 });
    // La structure reste suspendue : la publication existe mais ne se relit pas (409 `post_unavailable`, pas un 404) : elle est tenue pour
    // retrouvée, jamais pour absente (R9h, tour 4) : l'envoi n'est pas renouvelé, rien n'est republié sous « Moi ».
    const check = page.waitForResponse((r) => r.url().includes("/api/me/feed-posts/by-client/"));
    await lost.click();
    expect((await check).status()).toBe(409);
    await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 30_000 });
    // Un état distinct du succès (tour 5) : un message vrai (masquée tant que la page est suspendue), jamais « Publié » ni « en ligne ».
    await expect(page.getByTestId("fil-publish-hidden")).toContainText(
      "Publication enregistrée, mais masquée tant que la page est suspendue.",
    );
    await expect(page.getByText("Publié dans le Fil")).toHaveCount(0);
    await expect(page.getByText("Ta publication est en ligne.")).toHaveCount(0);
    const rows = (await sql("select persona from feed_posts order by created_at desc limit 1")) as {
      persona: string;
    }[];
    // Confirmation : la publication est celle de la page, rien n'est renvoyé ni republié sous « Moi ».
    expect(rows[0]?.persona).toBe("organizer");
    expect(
      (
        (await sql(
          "select count(*)::int as n from feed_posts where persona = 'fan' and caption like 'Annonce de la page %'",
        )) as { n: number }[]
      )[0]?.n,
    ).toBe(0);
  });
});

test("Publier : vérification impossible (réseau) : le verrou est maintenu, aucun changement d'auteur, aucun « Moi » affiché", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await withSuspension(async () => {
    await openAsStructure(page);
    await lostThenUncertain(page, false);
    await suspend();
    await revalidate(page);
    const lost = page.getByTestId("fil-publish-author-lost-me");
    await expect(lost).toBeVisible({ timeout: 30_000 });
    await page.route("**/api/me/feed-posts/by-client/**", (route) => route.abort("failed"));
    // On attend la tentative interceptée, puis la fin de la vérification (message d'incertitude, bouton réactivé), avant de contrôler.
    const attempt = page.waitForEvent("requestfailed", (r) => r.url().includes("/api/me/feed-posts/by-client/"));
    await lost.click();
    await attempt;
    await expect(page.getByText("Impossible de vérifier l'envoi pour l'instant")).toBeVisible();
    await expect(page.getByTestId("fil-publish-author-lost-me")).toBeEnabled();
    await expect(page.getByTestId("fil-publish-uncertain")).toBeVisible();
    await expect(page.getByTestId("fil-publish-author-lost-me")).toBeVisible();
    await expect(page.locator('[data-testid^="fil-publish-as-"][aria-pressed="true"]')).toHaveCount(0);
    await page.unroute("**/api/me/feed-posts/by-client/**");
  });
});
