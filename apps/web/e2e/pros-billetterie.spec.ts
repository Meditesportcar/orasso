import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  accountQr,
  apiCall,
  type Cookie,
  createEvent,
  login,
  loginInBrowser,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  unique,
} from "./helpers";

// Lot 14. Parcours 6 (docs/02) : fiche pro → QR de compte du passionné → scan par le pro → remise comptée dans les
// statistiques. Billets gratuits : réservation → QR → contrôle. Billetterie payante en mode présentation : « bientôt »
// tant que les clés Stripe de test ne sont pas renseignées (la voie complète est testée dans l'API avec Stripe simulé).
// Le scan du pro dans l'appli elle-même est dans `appli-pro.spec.ts` (APP_URL).

/** Les liens « appeler » et « itinéraire » ouvrent une application tierce : on neutralise la navigation, pas le compteur. */
async function disableExternalNavigation(page: Page) {
  await page.evaluate(() => {
    for (const a of document.querySelectorAll('[data-testid="call"], [data-testid="route"]')) {
      a.addEventListener("click", (e) => e.preventDefault());
    }
  });
}

test("parcours 6 : fiche pro vérifiée et publiée, annuaire, remises, QR de compte scanné, remise comptée dans les statistiques", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const proPseudo = `Garage_${s}`;
  const proName = `Garage E2E ${s}`;
  const proCookie = await signUpApi(proPseudo);
  const fanPseudo = `Passionne_${s}`;
  const fanCookie = await signUpApi(fanPseudo);

  // --- 1. Créer la fiche pro depuis la page « Professionnels » ---------------------------------------------------
  const proCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pro = await proCtx.newPage();
  await loginInBrowser(pro, `${proPseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, "/professionnels");
  await pro.getByTestId("pro-cta").click();
  await pro.waitForURL(/\/app\/pro\/nouvelle/);
  const create = pro.getByTestId("pro-create");
  await create.getByLabel("Nom de l'activité").fill(proName);
  await create.getByLabel("Garage et mécanique").check();
  await create.getByLabel("Detailing et lavage").check();
  await create.getByLabel("Adresse", { exact: true }).fill("12 avenue du Port");
  await create.getByLabel("Code postal").fill("66140");
  await create.getByLabel("Ville").fill("Canet-en-Roussillon");
  await create.getByLabel("Téléphone").fill("04 68 00 12 34");
  await create.getByRole("button", { name: "Créer ma fiche" }).click();
  await pro.waitForURL(/\/pro\/[^/]+\?creee=1/);
  const slug = new URL(pro.url()).pathname.split("/")[2] ?? "";
  await expect(pro.getByTestId("pro-state")).toHaveText("Brouillon");

  // Brouillon : invisible du public, annuaire sans lui.
  const visitor = await browser.newContext();
  const anon = await visitor.newPage();
  expect((await anon.goto(`/p/${slug}`))?.status()).toBe(404);

  // --- 2. Vérification SIRET automatique → badge « Pro vérifié » ------------------------------------------------
  const siret = pro.getByTestId("pro-siret");
  await siret.getByLabel(/SIRET/).fill("356 000 000 00048");
  await siret.getByRole("button", { name: "Contrôler" }).click();
  await expect(siret.getByRole("status")).toBeVisible();
  const verified = await pro.getByTestId("pro-verified-chip").isVisible();
  // Si le registre public de l'État ne répond pas, le badge reste absent : le test continue sans lui.
  if (verified) await expect(pro.getByTestId("pro-verified-chip")).toHaveText("Pro vérifié");

  // --- 3. Remises par grade, photo de réalisation, publication -----------------------------------------------------
  const discounts = pro.getByTestId("pro-discounts-form");
  await discounts.getByLabel("Rodage (%)").fill("5");
  await discounts.getByLabel("Route (%)").fill("8");
  await discounts.getByLabel("Sport (%)").fill("10");
  await discounts.getByLabel("Légende (%)").fill("20");
  await discounts.getByRole("button", { name: "Enregistrer les remises" }).click();
  await expect(discounts.getByRole("status")).toHaveText("Remises enregistrées.");
  // Un grade supérieur moins remisé qu'un grade inférieur est refusé.
  await discounts.getByLabel("Circuit (%)").fill("3");
  await discounts.getByRole("button", { name: "Enregistrer les remises" }).click();
  await expect(discounts.getByRole("alert")).toContainText("plus faible");
  await discounts.getByLabel("Circuit (%)").fill("");

  const photos = pro.getByTestId("pro-photos-form");
  await photos
    .getByLabel(/Ajouter une photo/)
    .setInputFiles({ name: "realisation.png", mimeType: "image/png", buffer: samplePhoto([40, 90, 140]) });
  await photos.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(photos.getByRole("status")).toHaveText("Photo ajoutée.");

  await pro.getByTestId("pro-publish").getByRole("button", { name: "Publier ma fiche" }).click();
  await expect(pro.getByTestId("pro-publish").getByRole("status")).toContainText("publiée");
  await expect(pro.getByTestId("pro-state")).toHaveText("Publiée");

  // --- 4. Annuaire et fiche publique (visiteur anonyme) ------------------------------------------------------------
  await anon.goto(`/pros?q=${encodeURIComponent(proName)}`);
  const tile = anon.getByTestId("pro-tile").filter({ hasText: proName });
  await expect(tile).toHaveCount(1);
  await expect(anon.getByTestId("pros-map")).toBeVisible();
  await tile.getByRole("link").first().click();
  await anon.waitForURL(`**/p/${slug}`);
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText(proName);
  await expect(anon.getByTestId("pro-discounts")).toContainText("−5 %");
  await expect(anon.getByTestId("pro-discounts")).toContainText("−20 %");
  await expect(anon.getByTestId("pro-photos").locator("img")).toHaveCount(1);
  if (verified) await expect(anon.getByTestId("verified-badge")).toHaveText("Pro vérifié");
  // Publications : réservées aux abonnés.
  await expect(anon.getByTestId("pro-posts")).toContainText("Suis ce pro");
  // Filtre par activité absente : la fiche n'y est pas.
  await anon.goto(`/pros?activite=covering&q=${encodeURIComponent(proName)}`);
  await expect(anon.getByTestId("pros-empty")).toBeVisible();
  const audit = await (async () => {
    await anon.goto(`/p/${slug}`);
    return auditPage(anon);
  })();
  expect(audit.horizontalScroll).toBe(false);

  // --- 5. Le passionné suit le pro, ses vues et clics sont comptés ---------------------------------------------------
  const fanCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const fan = await fanCtx.newPage();
  await loginInBrowser(fan, `${fanPseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, `/p/${slug}`);
  await expect(fan.getByRole("heading", { level: 1 })).toHaveText(proName);
  await disableExternalNavigation(fan);
  await fan.getByTestId("call").click();
  await fan.getByTestId("route").click();
  await fan.getByRole("button", { name: "Suivre" }).click();
  await expect(fan.getByRole("button", { name: "Tu suis ce pro" })).toBeVisible();

  // --- 6. Publication du pro, visible de l'abonné seulement ---------------------------------------------------------
  await pro.goto(`/pro/${slug}/publications`);
  await expect(pro.getByTestId("posts-counter")).toHaveText("0 / 4 ce mois-ci");
  await pro.getByTestId("post-form").getByLabel("Titre").fill("Offre d'automne");
  await pro.getByTestId("post-form").getByLabel("Texte").fill("Contrôle des freins offert avant le 15 novembre.");
  await pro.getByTestId("post-form").getByRole("button", { name: "Publier" }).click();
  await expect(pro.getByTestId("posts-counter")).toHaveText("1 / 4 ce mois-ci");
  await expect(pro.getByTestId("post")).toContainText("Offre d'automne");
  await fan.goto(`/p/${slug}`);
  await expect(fan.getByTestId("pro-post")).toContainText("Offre d'automne");
  await anon.goto(`/p/${slug}`);
  await expect(anon.getByTestId("pro-posts")).not.toContainText("Offre d'automne");

  // --- 7. QR de compte du passionné → scan par le pro (API, comme l'appli) → remise selon le grade -----------------
  // Un compte sans fiche pro ne peut pas lire un QR de compte.
  const refused = await apiCall(fanCookie, "POST", "/account-qr/verify", { payload: await accountQr(proCookie) });
  expect(refused.status).toBe(403);
  const fanQr = await accountQr(fanCookie);
  const scan = await apiCall<{ valid: boolean; pseudo: string; grade: string; discount: { percent: number } | null }>(
    proCookie,
    "POST",
    "/account-qr/verify",
    { payload: fanQr },
  );
  expect(scan.status).toBe(200);
  expect(scan.data).toEqual({ valid: true, pseudo: fanPseudo, grade: "rodage", discount: { percent: 5 } });
  // Le même code ne passe pas deux fois.
  const replay = await apiCall(proCookie, "POST", "/account-qr/verify", { payload: fanQr });
  expect(replay.data).toEqual({ valid: false, reason: "replayed" });

  // --- 8. Statistiques du pro : vues, clics, abonnés, remise utilisée ---------------------------------------------------
  await pro.goto(`/pro/${slug}/statistiques?jours=7`);
  const counters = pro.getByTestId("pro-stats");
  await expect(counters).toContainText("1"); // abonné, appel, remise...
  const stats = await apiCall<{ views: number; calls: number; routes: number; followers: number; discounts: number }>(
    proCookie,
    "GET",
    `/me/pro`,
  );
  expect(stats.status).toBe(200);
  await expect(pro.getByTestId("pro-stats-discounts")).toContainText("Rodage");
  await expect(pro.getByTestId("pro-stats-discounts")).toContainText("1");
  const apiStats = await apiCall<{
    views: number;
    calls: number;
    routes: number;
    followers: number;
    discounts: number;
  }>(proCookie, "GET", `/pros/${(stats.data as unknown as { id: string }).id}/stats?days=7`);
  expect(apiStats.data).toMatchObject({ calls: 1, routes: 1, followers: 1, discounts: 1 });
  expect(apiStats.data.views).toBeGreaterThanOrEqual(1);

  // --- 9. Abonnement en présentation : aucun prix, aucun paiement ---------------------------------------------------
  await pro.goto(`/pro/${slug}/abonnement`);
  await expect(pro.getByTestId("subscription-state")).toHaveText("Gratuit jusqu'au 21 juin 2027");
  const text = (await pro.locator("main").textContent()) ?? "";
  expect(text).not.toMatch(/€|\beuros?\b/i);
  await expect(pro.getByRole("button", { name: /payer|acheter|souscrire|s'abonner/i })).toHaveCount(0);
  await expect(pro.locator('a[href*="stripe"], a[href*="paiement"], a[href*="checkout"]')).toHaveCount(0);

  await Promise.all([proCtx.close(), visitor.close(), fanCtx.close()]);
});

test("billets gratuits : interrupteur de l'événement, réservation, QR, contrôle à l'entrée, interrupteur général", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const damien = await login("damien@orasso.local");
  const ev = await createEvent(damien, {
    title: `Cars & Coffee billets ${s}`,
    publicAccess: "free_reservation",
    admission: "open",
  });

  const orgaCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const orga = await orgaCtx.newPage();
  await loginInBrowser(orga, "damien@orasso.local", SEED_PASSWORD, `/orga/meditesportcar/e/${ev.id}`);
  const panel = orga.getByTestId("ticketing");
  await expect(panel.getByTestId("ticketing-state")).toHaveText("La billetterie n'est pas ouverte pour cet événement");

  const fanPseudo = `Visiteur_${s}`;
  const fanCookie = await signUpApi(fanPseudo);
  const fanCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fan = await fanCtx.newPage();
  await loginInBrowser(fan, `${fanPseudo.toLowerCase()}@e2e.orasso.test`, SEED_PASSWORD, `/e/${ev.slug}`);
  // Deuxième niveau fermé : la réservation n'est pas ouverte.
  await expect(fan.getByTestId("ticket-block")).toContainText("pas ouverte");

  // L'organisateur ouvre la billetterie (3 places).
  await panel.getByLabel("Ouvrir la billetterie pour cet événement").check();
  await panel.getByLabel("Places pour les visiteurs").fill("3");
  await panel.getByRole("button", { name: "Enregistrer la billetterie" }).click();
  await orga.waitForURL(/billets=1/);
  await expect(orga.getByTestId("ticketing-state")).toHaveText("Ouverte");

  // Interrupteur général de l'administration : éteint, la réservation se ferme partout.
  await orga.goto("/admin");
  const general = orga.getByTestId("setting-ticketing.free_enabled");
  await expect(general).toContainText("activé");
  await general.getByRole("button", { name: "Désactiver" }).click();
  await expect(orga.getByTestId("setting-ticketing.free_enabled")).toContainText("désactivé");
  await fan.reload();
  await expect(fan.getByTestId("ticket-block")).toContainText("momentanément indisponible");
  await orga.getByTestId("setting-ticketing.free_enabled").getByRole("button", { name: "Activer" }).click();
  await expect(orga.getByTestId("setting-ticketing.free_enabled")).toContainText("activé");
  // Le mode présentation est imposé : on ne peut pas le désactiver.
  await expect(
    orga.getByTestId("setting-ticketing.presentation_mode").getByRole("button", { name: "Désactiver" }),
  ).toBeDisabled();

  // Réservation par le passionné → QR de billet.
  await fan.reload();
  await expect(fan.getByTestId("ticket-price")).toHaveText("Gratuit");
  await fan.getByLabel("Nombre de billets").selectOption("2");
  await fan.getByRole("button", { name: "Réserver gratuitement" }).click();
  await fan.waitForURL(/\/app\/billets\?reserve=ok/);
  await expect(fan.getByTestId("reserved-notice")).toBeVisible();
  await expect(fan.getByTestId("ticket")).toHaveCount(2);
  const qr = fan.getByTestId("ticket-qr").first().locator("svg");
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute("data-qr-version")).toBe("6");
  const mine = await apiCall<{ id: string; payload: string }[]>(fanCookie, "GET", "/me/tickets");
  expect(mine.data).toHaveLength(2);
  expect(mine.data[0]?.payload).toMatch(/^OR1[A-Z2-7]+$/);

  // Contrôle à l'entrée par l'organisation : OK, puis déjà entré.
  await orga.goto(`/orga/meditesportcar/e/${ev.id}/billets`);
  await expect(orga.getByTestId("ticket-counters")).toContainText("0");
  const form = orga.getByTestId("ticket-check-form");
  await form.getByLabel("QR du billet").fill(mine.data[0]?.payload ?? "");
  await form.getByRole("button", { name: "Valider" }).click();
  await expect(orga.getByTestId("ticket-result")).toHaveAttribute("data-result", "ok");
  await expect(orga.getByTestId("ticket-result")).toContainText(fanPseudo);
  await form.getByLabel("QR du billet").fill(mine.data[0]?.payload ?? "");
  await form.getByRole("button", { name: "Valider" }).click();
  await expect(orga.getByTestId("ticket-result")).toHaveAttribute("data-result", "already");
  await form.getByLabel("QR du billet").fill("OR1FAUX");
  await form.getByRole("button", { name: "Valider" }).click();
  await expect(orga.getByTestId("ticket-result")).toHaveAttribute("data-result", "refused");
  await expect(orga.getByTestId("ticket-list")).toContainText(fanPseudo);

  // Un passionné qui n'est pas du staff ne peut pas contrôler.
  const denied = await apiCall(fanCookie, "POST", `/events/${ev.id}/tickets/check`, {
    payload: mine.data[1]?.payload,
  });
  expect(denied.status).toBe(403);
  // Rendre un billet libère la place (une seule place restante sur 3 puis deux).
  await fan.goto("/app/billets");
  fan.once("dialog", (d) => d.accept());
  await fan
    .getByTestId("ticket")
    .filter({ hasText: "Valable" })
    .getByRole("button", { name: "Rendre ce billet" })
    .click();
  await expect(fan.getByTestId("ticket")).toHaveCount(1);

  await Promise.all([orgaCtx.close(), fanCtx.close()]);
});

test("billets payants : « bientôt » sans clés Stripe, aucun paiement possible, structure sans compte à connecter", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const s = unique();
  const damien = await login("damien@orasso.local");
  const ev = await createEvent(damien, {
    title: `Nuit payante ${s}`,
    publicAccess: "paid_orasso",
    admission: "open",
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const orga = await ctx.newPage();
  await loginInBrowser(orga, "damien@orasso.local", SEED_PASSWORD, `/orga/meditesportcar/e/${ev.id}`);
  const panel = orga.getByTestId("ticketing");
  await expect(panel.getByTestId("stripe-soon")).toBeVisible();
  await panel.getByLabel("Ouvrir la billetterie pour cet événement").check();
  await panel.getByLabel("Prix du billet (€)").fill("12,50");
  await panel.getByRole("button", { name: "Enregistrer la billetterie" }).click();
  await orga.waitForURL(/billets=1/);
  await expect(orga.getByTestId("ticketing-state")).toHaveText("Billetterie payante bientôt disponible");

  // Le public voit le prix, un bouton désactivé et le message « bientôt », sans erreur.
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  const res = await page.goto(`/e/${ev.slug}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("ticket-price")).toContainText("12,50");
  await expect(page.getByTestId("ticket-blocked")).toBeDisabled();
  await expect(page.getByTestId("ticket-block")).toContainText("bientôt disponible");

  // Page de la structure : Stripe « bientôt », rien à connecter.
  await orga.goto("/orga/meditesportcar/structure");
  await expect(orga.getByTestId("stripe").getByTestId("stripe-soon")).toBeVisible();
  await expect(orga.getByRole("button", { name: "Connecter mon compte Stripe" })).toHaveCount(0);
  await visitor.close();
  await ctx.close();
});

test("système de design : annuaire, fiche pro, événements à billets, dans les deux thèmes (bureau et 390 px)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const pages = ["/pros", "/p/garage-du-port", "/professionnels", "/e/cars-and-coffee-plage", "/e/nuit-des-moteurs"];
  for (const theme of ["beton", "sable"]) {
    for (const view of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const ctx = await browser.newContext({ viewport: view });
      await ctx.addCookies([
        { name: "orasso-theme", value: theme, url: `http://localhost:${process.env.WEB_PORT ?? 5173}` },
      ]);
      const page = await ctx.newPage();
      for (const path of pages) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const a = await auditPage(page);
        const where = `${path} ${theme} ${view.width}px`;
        expect(a.primaryButtons, `${where} : un seul bouton principal`).toBeLessThanOrEqual(1);
        expect(a.neonAccent, `${where} : un seul néon moutarde`).toBeLessThanOrEqual(1);
        expect(a.buttonsWithoutIcon, `${where} : tout bouton porte une icône`).toEqual([]);
        expect(a.greens, `${where} : pas de vert`).toEqual([]);
        expect(a.truncated, `${where} : aucun texte tronqué`).toEqual([]);
        expect(a.horizontalScroll, `${where} : pas de défilement horizontal`).toBe(false);
      }
      await ctx.close();
    }
  }
});
