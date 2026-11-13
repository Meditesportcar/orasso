import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { landscape } from "./lotr7f3-setup";

// Lot R9h, partie 1, tour 1 : le composeur de story d'une page se bloque au changement de compte ; la lecture enchaînée d'une story reste
// dans la barre de la casquette et ✕ revient au Fil de la page ; « Profil » de la barre du passionné s'éteint sous la sous-navigation.
test.use({ actionTimeout: 30_000 });

type Me = { personas: { kind: string; id: string }[] };

async function open(page: import("@playwright/test").Page, email: string, to: string) {
  await page.context().clearCookies();
  await loginInBrowser(page, email, undefined, to);
  await page.goto(to);
}

test("Story : le composeur d'une page se bloque quand un autre compte se connecte dans un autre onglet (A puis B avant l'envoi)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const me = (await apiCall<Me>(await login("leo@orasso.local"), "GET", "/me")).data;
  const media = me.personas.find((p) => p.kind === "media");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await ctx.newPage();
  await open(a, "leo@orasso.local", `/app/story/publier?auteur=m%3A${media?.id}`);
  await a.getByTestId("story-file").setInputFiles(landscape());
  await expect(a.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
  await expect(a.getByText("en tant que Sud Cars")).toBeVisible();
  // Un autre onglet du même navigateur connecte B.
  const b = await ctx.newPage();
  await ctx.clearCookies();
  await loginInBrowser(b, "sarah@orasso.local", undefined, "/app/fil");
  await expect(a.getByTestId("story-stale")).toBeVisible({ timeout: 30_000 });
  await expect(a.getByTestId("story-publish-send")).toHaveCount(0);
  await ctx.close();
});

test("Story d'une page : la lecture enchaînée reste dans la barre de la casquette et ✕ revient au Fil de la page", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "sarah@orasso.local", "/orga/roues-libres-66/fil");
  const bar = page.getByTestId("stories-bar");
  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-testid^="stories-author-"]').first()).toBeVisible({ timeout: 30_000 });
  const keys = (
    await bar
      .locator('[data-testid^="stories-author-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))
  ).map((id) => (id ?? "").replace("stories-author-", ""));
  expect(keys.length, "la barre de la structure a des auteurs (seed R9a)").toBeGreaterThan(0);
  const structure = (await sql("select id from structures where slug = 'roues-libres-66'")) as { id: string }[];
  const own = `s:${structure[0]?.id}`;
  // Deux réseaux distincts : la barre personnelle de Sarah (sans acteur) a au moins un auteur absent de la barre de la structure.
  const personalBar = (
    await apiCall<{ authors: { key: string }[] }>(await login("sarah@orasso.local"), "GET", "/stories/bar")
  ).data;
  expect(
    personalBar.authors.some((a) => !keys.includes(a.key)),
    "la barre personnelle a un auteur absent de celle de la structure",
  ).toBe(true);
  await bar.locator('[data-testid^="stories-author-"] a').first().click();
  await page.waitForURL(/\/app\/story\//);
  // Le contexte de la barre d'origine est dans l'adresse (la page, pas la personne).
  expect(decodeURIComponent(page.url())).toContain(`barre=${own}`);
  const keyOfUrl = () => decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
  const visited = [keyOfUrl()];
  for (let i = 0; i < 6; i++) {
    const next = page.getByTestId("story-author-next");
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(700);
    visited.push(keyOfUrl());
  }
  const personal = (await sql("select id from \"user\" where email = 'sarah@orasso.local'")) as { id: string }[];
  // Jamais le réseau personnel de la titulaire : ni sa clé `u:`, ni un auteur qui n'est pas dans la barre de la structure.
  expect(visited).not.toContain(`u:${personal[0]?.id}`);
  for (const k of visited) expect([...keys, own], `auteur ${k} hors de la barre de la structure`).toContain(k);
  expect(decodeURIComponent(page.url())).toContain(`barre=${own}`);
  // Ouverte sans historique, la visionneuse se ferme sur le Fil de la page.
  await page.goto(`/app/story/${encodeURIComponent(keys[0] ?? "")}?suite=barre&barre=${encodeURIComponent(own)}`);
  await page.getByTestId("story-close").first().click();
  await page.waitForURL(/\/orga\/roues-libres-66\/fil/, { timeout: 30_000 });
  // Une clé de barre qui n'est pas une page tenue : ignorée (retour au Fil du passionné).
  await page.goto(
    `/app/story/${encodeURIComponent(keys[0] ?? "")}?suite=barre&barre=s%3A00000000-0000-0000-0000-000000000000`,
  );
  await page.getByTestId("story-close").first().click();
  await page.waitForURL(/\/app\/fil/, { timeout: 30_000 });
  await ctx.close();
});

test("Story : A puis B par revalidation, annonce de session retardée : le brouillon de A ne survit pas et n'est jamais publié sous B", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const me = (await apiCall<Me>(await login("leo@orasso.local"), "GET", "/me")).data;
  const media = me.personas.find((p) => p.kind === "media");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // L'annonce de session est retardée : aucune fenêtre ne l'entend (ni canal, ni événement de stockage).
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
  await open(a, "leo@orasso.local", `/app/story/publier?auteur=m%3A${media?.id}`);
  await a.getByTestId("story-file").setInputFiles(landscape());
  await expect(a.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
  await a.getByTestId("story-plate-none").click();
  await a.getByTestId("story-plate-none-yes").click();
  await expect(a.getByText("en tant que Sud Cars")).toBeVisible();
  // B se connecte dans un autre onglet ; A relit ses données (revalidation) avant d'avoir reçu l'annonce.
  const b = await ctx.newPage();
  await ctx.clearCookies();
  await loginInBrowser(b, "sarah@orasso.local", undefined, "/app/fil");
  await a.evaluate(() =>
    (
      window as unknown as { __reactRouterDataRouter: { revalidate: () => Promise<void> } }
    ).__reactRouterDataRouter.revalidate(),
  );
  // Le formulaire est remonté pour B : plus de photo, plus de page de A, rien à envoyer.
  await expect(a.getByTestId("story-fit")).toHaveCount(0, { timeout: 30_000 });
  await expect(a.getByText("en tant que Sud Cars")).toHaveCount(0);
  await expect(a.getByTestId("story-publish-send")).toBeDisabled();
  await ctx.close();
});

test("Publier : la structure est suspendue pendant la rédaction : l'envoi est bloqué avec un message, jamais de repli silencieux sur « Moi »", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const before = (await sql(
    "select verification, suspended_reason from structures where slug = 'roues-libres-66'",
  )) as {
    verification: string;
    suspended_reason: string | null;
  }[];
  const structure = (await sql("select id from structures where slug = 'roues-libres-66'")) as { id: string }[];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await open(page, "sarah@orasso.local", `/app/fil/publier?auteur=s%3A${structure[0]?.id}`);
    await expect(page.locator('[data-testid^="fil-publish-as-structure:"][aria-pressed="true"]')).toContainText(
      "Roues Libres 66",
    );
    await sql(
      "update structures set verification = 'suspended', suspended_reason = 'moderation' where slug = 'roues-libres-66'",
    );
    await page.evaluate(() =>
      (
        window as unknown as { __reactRouterDataRouter: { revalidate: () => Promise<void> } }
      ).__reactRouterDataRouter.revalidate(),
    );
    await expect(page.getByTestId("fil-publish-missing")).toContainText(
      "Tu n'as plus accès à Roues Libres 66 : la publication ne peut pas partir en son nom.",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("fil-publish-send")).toBeDisabled();
    // Rien n'est choisi à la place : ni « Moi » ni aucune autre casquette n'est marquée.
    await expect(page.locator('[data-testid^="fil-publish-as-"][aria-pressed="true"]')).toHaveCount(0);
    // Le choix explicite de « Moi » rend la main.
    await page.getByTestId("fil-publish-author-lost-me").click();
    await expect(page.getByTestId("fil-publish-as-me")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("fil-publish-author-lost-me")).toHaveCount(0);
  } finally {
    const was = before[0];
    if (was) {
      await sql(
        `update structures set verification = '${was.verification}', suspended_reason = ${
          was.suspended_reason ? `'${was.suspended_reason}'` : "null"
        } where slug = 'roues-libres-66'`,
      );
    }
    await ctx.close();
  }
});

test("Média : sous la sous-navigation de la casquette, « Profil » de la barre du passionné n'est pas actif", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await open(page, "leo@orasso.local", "/app/media");
  await expect(page.getByTestId("casquette-tabs").getByRole("tab", { selected: true })).toHaveText("Accueil");
  await expect(page.getByRole("navigation", { name: "Mon compte" }).locator('[aria-current="page"]')).toHaveCount(0);
  await ctx.close();
});
