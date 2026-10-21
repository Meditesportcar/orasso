import { expect, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  fillArrivee,
  login,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  unique,
} from "./helpers";

// Lot 13 : site public, structure, création d'événement par étapes, inscription express.
// Le test principal suit le critère de fin : créer une structure → la vérifier (admin) → créer un Rassemblement par
// étapes → publier → visible dans /evenements et sur la carte → inscription express de bout en bout.
// Il appelle deux services publics de l'État (registre SIRET, géocodage) ; s'ils ne répondent pas, il prend le
// chemin de repli prévu par le produit (pièce d'identité d'un club non déclaré, position posée à la main).

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const POSTER = samplePhoto([60, 70, 90]);

const parisDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

test("créer une structure, la vérifier, créer un Rassemblement par étapes, publier, express de bout en bout", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const pseudo = `Orga_${s}`;
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const structureName = `Club E2E ${s}`;
  const eventTitle = `Rassemblement du port ${s}`;
  const ownerCookie = await signUpApi(pseudo);

  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const owner = await ownerCtx.newPage();
  await loginInBrowser(owner, email, SEED_PASSWORD, "/organisateurs");

  // --- 1. Créer la structure -------------------------------------------------------------------------------------
  await owner.getByRole("link", { name: "Créer ma structure" }).click();
  await expect(owner.getByTestId("structure-form")).toBeVisible();
  await owner.getByLabel("Nom", { exact: true }).fill(structureName);
  await owner.getByLabel("Description").fill("Club de voitures anciennes de la côte catalane.");
  await owner.getByLabel("Adresse", { exact: true }).fill("Place de la République");
  await owner.getByLabel("Code postal").fill("66140");
  await owner.getByLabel("Ville").fill("Canet-en-Roussillon");
  await owner.getByLabel("Départements couverts").fill("66");
  await owner.getByLabel("Logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: POSTER });
  await owner.getByRole("button", { name: "Créer la structure" }).click();
  await owner.waitForURL(/\/orga\/[^/]+\/structure/);
  const slug = new URL(owner.url()).pathname.split("/")[2] ?? "";
  await expect(owner.getByTestId("verification-state")).toHaveText("Non vérifiée");
  const verification = owner.getByTestId("verification");

  // Publier est impossible tant que la structure n'est pas vérifiée (mais le brouillon se prépare).
  await owner.goto(`/orga/${slug}`);
  await expect(owner.getByTestId("unverified-note")).toBeVisible();
  await owner.goto(`/orga/${slug}/structure`);

  // --- 2. Vérification : contrôle SIRET (registre public), justificatif, envoi ---------------------------------------
  await verification.getByLabel(/SIRET/).fill("356 000 000 00048");
  await verification.getByRole("button", { name: "Contrôler" }).click();
  await expect(owner.getByTestId("registry-result")).toBeVisible();
  const registryResult = (await owner.getByTestId("registry-result").textContent()) ?? "";
  const registryDown = registryResult.includes("Registre indisponible");
  if (!registryDown) expect(registryResult).toContain("Trouvé et actif");
  await verification.getByLabel("Nature du document").selectOption(registryDown ? "identity" : "statutes");
  await verification
    .getByLabel("Fichier")
    .setInputFiles({ name: "justificatif.pdf", mimeType: "application/pdf", buffer: PDF });
  await verification.getByRole("button", { name: "Ajouter le justificatif" }).click();
  await expect(owner.getByTestId("documents")).toContainText("justificatif.pdf");
  await verification.getByRole("button", { name: "Envoyer pour vérification" }).click();
  await expect(owner.getByTestId("verification-pending")).toBeVisible();
  await expect(owner.getByTestId("verification-state")).toHaveText("Vérification en cours");

  // --- 3. Administration : valider à la main ---------------------------------------------------------------------
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage();
  await loginInBrowser(admin, "damien@orasso.local", SEED_PASSWORD, "/admin/verification");
  const card = admin.getByTestId("admin-structure").filter({ hasText: structureName });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("admin-registry")).toBeVisible();
  const docLink = card.getByRole("link", { name: "justificatif.pdf" });
  const docHref = (await docLink.getAttribute("href")) ?? "";
  const docRes = await adminCtx.request.get(docHref);
  expect(docRes.status()).toBe(200);
  expect(docRes.headers()["content-type"]).toContain("application/pdf");
  await card.getByLabel(/Note/).fill("Statuts reçus, structure sérieuse.");
  await card.getByRole("button", { name: "Valider" }).click();
  await expect(admin.getByTestId("admin-empty")).toBeVisible();
  // Le justificatif n'est lisible ni sans connexion ni par le propriétaire.
  const anon = await browser.newContext();
  expect((await anon.request.get(docHref)).status()).toBe(401);
  expect((await ownerCtx.request.get(docHref)).status()).toBe(403);
  await anon.close();
  await adminCtx.close();

  await owner.goto(`/orga/${slug}/structure`);
  await expect(owner.getByTestId("verification-state")).toHaveText("Structure vérifiée");

  // --- 4. Créer un Rassemblement par étapes -------------------------------------------------------------------------
  await owner.goto(`/orga/${slug}`);
  await owner.getByRole("link", { name: "Nouvel événement" }).click();
  const step = owner.getByTestId("wizard-step");
  // Lot 53 : huit temps (type, lieu, arrivées, critères, avant-première, règlement, affiche, tout est prêt).
  await expect(step).toContainText("Étape 1 sur 8 · Type");
  await owner.waitForLoadState("networkidle"); // hydratation : l'assistant est un composant du navigateur
  // Validation du temps : un titre est exigé.
  await owner.getByRole("button", { name: "Continuer" }).click();
  await expect(owner.getByTestId("wizard-error")).toContainText("titre");
  await owner.getByRole("button", { name: "Rassemblement", exact: true }).click();
  await owner.getByLabel("Titre").fill(eventTitle);
  await owner.getByLabel("Description et programme").fill("Rendez-vous du soir sur le port, voitures anciennes.");
  // Demain 18 h : la fenêtre du staff est ouverte (de la veille à la fin), l'inscription express est donc possible.
  await owner.getByLabel("Date", { exact: true }).fill(parisDay(1));
  await owner.getByLabel("Début").fill("18:00");
  await owner.getByLabel("Fin").fill("23:00");
  // Volet « Public et places » : véhicules et places.
  await owner.getByText("Public et places").click();
  await owner.getByLabel("Moto").check({ force: true });
  await owner.getByRole("button", { name: "Avec une limite" }).click();
  await owner.getByLabel("Nombre de places").fill("30");
  await owner.getByRole("button", { name: "Continuer" }).click();

  await expect(step).toContainText("Lieu");
  await owner.getByLabel("Adresse", { exact: true }).fill("Place de la République");
  await owner.getByLabel("Code postal").fill("66140");
  await owner.getByLabel("Ville").fill("Canet-en-Roussillon");
  await owner.getByTestId("wizard-geocode").click();
  const suggestion = owner.getByTestId("wizard-suggestion");
  const geocoded = await suggestion.isVisible({ timeout: 20_000 }).catch(() => false);
  if (geocoded) await suggestion.click();
  // Volet « Sur place » : zones et prestataires attendus.
  await owner.getByText("Sur place", { exact: true }).click();
  await owner.getByRole("button", { name: "Ajouter une zone" }).click();
  await owner.getByLabel("Code").fill("A");
  await owner.getByLabel("Nom", { exact: true }).fill("Allée A");
  await owner.getByLabel("Food truck").check({ force: true });
  await owner.getByLabel("Un autre type").fill("Glacier");
  await owner.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(owner.getByLabel("Glacier")).toBeChecked();
  await owner.getByRole("button", { name: "Continuer" }).click();

  await expect(step).toContainText("Arrivées");
  await owner.getByText("Public", { exact: true }).last().click();
  await owner.getByRole("button", { name: "Entrée libre" }).click();
  await owner.getByRole("button", { name: "Continuer" }).click();

  await expect(step).toContainText("Critères");
  await owner.getByRole("button", { name: "Sur filtration" }).click();
  await owner.getByRole("button", { name: "Japonaise" }).click();
  await owner.getByLabel("Précisions (facultatif)").fill("Voitures d'avant 2000.");
  await owner.getByRole("button", { name: "Continuer" }).click();

  await expect(step).toContainText("Avant-première");
  await owner.getByLabel("Combien de temps avant").selectOption("48");
  await owner.getByRole("button", { name: "Continuer" }).click();

  await expect(step).toContainText("Règlement");
  await expect(owner.getByRole("textbox", { name: "Règlement" })).toHaveValue(/Règlement de l'événement/);
  await owner.getByLabel("Consignes aux retenus").fill("Entrée par le parking nord, arrivée dès 17 h 30.");
  await owner.getByRole("button", { name: "Continuer" }).click();

  await expect(step).toContainText("Affiche");
  await owner.getByTestId("wizard-own-poster").locator("input").setInputFiles({
    name: "affiche.png",
    mimeType: "image/png",
    buffer: POSTER,
  });
  await owner.getByRole("button", { name: "Continuer" }).click();

  await expect(step).toContainText("Tout est prêt");
  await expect(owner.getByTestId("wizard-recap")).toContainText(eventTitle);
  await owner.getByRole("button", { name: "Brouillon" }).click();
  await owner.waitForURL(/\/orga\/[^/]+\/e\/[0-9a-f-]{36}/);
  const eventId = new URL(owner.url()).pathname.split("/")[4] ?? "";
  await expect(owner.getByTestId("event-title")).toHaveText(eventTitle);
  await expect(owner.getByTestId("event-status")).toHaveText("Brouillon");
  const detail = await apiCall<{
    slug: string;
    lat: number | null;
    vendorTypes: string[];
    zones: { code: string }[];
    posterUrl: string | null;
    department: string | null;
  }>(ownerCookie, "GET", `/events/${eventId}`);
  expect(detail.data).toMatchObject({ vendorTypes: ["Food truck", "Glacier"], department: "66" });
  expect(detail.data.zones.map((z) => z.code)).toEqual(["A"]);
  expect(detail.data.posterUrl).toBeTruthy();
  // Repli si le géocodage public ne répond pas : la position est posée directement (l'API la garde telle quelle).
  if (!geocoded || detail.data.lat === null) {
    const patched = await apiCall(ownerCookie, "PATCH", `/events/${eventId}`, { lat: 42.7058, lng: 3.0072 });
    expect(patched.status).toBe(200);
  }

  // Brouillon : introuvable pour le public.
  expect((await apiCall(null, "GET", `/events/by-slug/${detail.data.slug}`)).status).toBe(404);

  // --- 5. Publier ---------------------------------------------------------------------------------------------------
  await owner.getByRole("button", { name: "Publier l'événement" }).click();
  await expect(owner.getByTestId("published-note")).toBeVisible();
  await expect(owner.getByTestId("event-status")).toHaveText("Publié");

  // --- 6. Visible dans /evenements et sur la carte --------------------------------------------------------------
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const v = await visitor.newPage();
  await v.goto("/evenements");
  await v.getByLabel("Recherche").fill(eventTitle);
  await v.getByRole("button", { name: "Filtrer" }).click();
  const tile = v.getByTestId("event-tile").filter({ hasText: eventTitle });
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText("Rassemblement");
  await expect(tile).toContainText("Canet-en-Roussillon");
  const map = v.getByTestId("events-map");
  await expect(map).toHaveAttribute("data-count", "1");
  await expect(map.locator('[data-testid="map-marker"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(map.locator('[data-testid="map-marker"]')).toHaveAttribute("aria-label", eventTitle);
  // Filtres : un autre format ne le montre pas.
  await v.goto(`/evenements?q=${encodeURIComponent(eventTitle)}&format=exhibition`);
  await expect(v.getByTestId("events-empty")).toBeVisible();

  // Page événement : prestataires, organisateur vérifié.
  await v.goto(`/e/${detail.data.slug}`);
  await expect(v.getByTestId("vendors")).toContainText("Glacier");
  await expect(v.getByTestId("vendors")).toContainText("Food truck");
  // Page structure.
  await v.goto(`/o/${slug}`);
  await expect(v.getByTestId("verified-badge")).toBeVisible();
  await expect(v.getByTestId("structure-upcoming")).toContainText(eventTitle);
  await expect(v.locator("img[alt^='Logo de']")).toBeVisible();
  // Plan du site et robots.
  const sitemap = await visitor.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`/e/${detail.data.slug}`);
  expect(xml).toContain(`/o/${slug}`);
  const robots = await (await visitor.request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap:");
  expect(robots).toContain("Disallow: /orga/");

  // --- 7. Duplication et récurrence ---------------------------------------------------------------------------------
  await owner.getByRole("button", { name: "Dupliquer" }).click();
  await owner.waitForURL(/\/modifier$/);
  await expect(owner.getByLabel("Titre")).toHaveValue(eventTitle);
  const copyId = new URL(owner.url()).pathname.split("/")[4] ?? "";
  const copy = await apiCall<{ status: string; parentEventId: string; zones: { code: string }[] }>(
    ownerCookie,
    "GET",
    `/events/${copyId}`,
  );
  expect(copy.data).toMatchObject({ status: "draft", parentEventId: eventId });
  expect(copy.data.zones.map((z) => z.code)).toEqual(["A"]);
  await owner.goto(`/orga/${slug}/e/${eventId}`);
  await owner.waitForLoadState("networkidle");
  await owner.getByLabel("Jour", { exact: true }).selectOption({ label: "dimanche" });
  await owner.getByLabel("Nombre d'occurrences à créer").selectOption("2");
  await expect(owner.getByTestId("recurrence-preview")).toContainText("Chaque premier dimanche du mois");
  await owner.getByRole("button", { name: "Créer la série" }).click();
  await expect(owner.getByText("2 occurrences créées en brouillon.")).toBeVisible();
  const all = await apiCall<{ id: string; status: string }[]>(
    ownerCookie,
    "GET",
    `/structures/${(await apiCall<{ id: string }>(null, "GET", `/structures/by-slug/${slug}`)).data.id}/events`,
  );
  expect(all.data.filter((e) => e.status === "draft")).toHaveLength(3); // la copie + 2 occurrences
  // Une série ne se recrée pas.
  await owner.goto(`/orga/${slug}/e/${eventId}`);
  await expect(owner.getByTestId("recurrence-form")).toHaveCount(0);

  // --- 8. Inscription express de bout en bout ----------------------------------------------------------------------
  const guestEmail = `express_${s}@e2e.orasso.test`;
  const invite = await apiCall<{ url: string }>(ownerCookie, "POST", `/events/${eventId}/express-invites`, {
    email: guestEmail,
  });
  expect(invite.status).toBe(201);
  const token = invite.data.url.split("/express/")[1] ?? "";
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const g = await phone.newPage();
  await g.goto(`/express/${token}`);
  await expect(g.getByRole("heading", { name: eventTitle })).toBeVisible();
  await g.waitForLoadState("networkidle");
  const form = g.getByTestId("express-form");
  // Un mot de passe trop court ou différent est refusé avant l'envoi.
  await form.getByLabel("Pseudo").fill(`Express_${s}`);
  await form.getByLabel("Mot de passe", { exact: true }).fill("court");
  await form.getByLabel("Mot de passe, encore une fois").fill("autre");
  await form.getByLabel("Prénom").fill("Camille");
  await form.getByLabel("Nom", { exact: true }).fill("Durand");
  await form.getByLabel("Marque").selectOption({ label: "BMW" });
  await expect(form.getByLabel("Modèle").locator("option")).not.toHaveCount(1);
  await form.getByLabel("Modèle").selectOption({ index: 1 });
  await form.getByLabel("Plaque d'immatriculation").fill(randomPlate());
  await form
    .getByLabel("Photo du véhicule")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: POSTER });
  await form.getByRole("button", { name: "M'inscrire" }).click();
  await expect(g.getByText("10 caractères au moins.")).toBeVisible();
  await expect(g.getByText("Les deux mots de passe sont différents.")).toBeVisible();
  // Lot 36 : conditions générales obligatoires, refusées par le serveur sans la case.
  await expect(form.getByTestId("terms-error")).toBeVisible();
  const strong = "mot-de-passe-express-2026";
  await form.getByLabel("Mot de passe", { exact: true }).fill(strong);
  await form.getByLabel("Mot de passe, encore une fois").fill(strong);
  await form.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
  await form
    .getByLabel("Photo du véhicule")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: POSTER });
  await form.getByRole("button", { name: "M'inscrire" }).click();
  const done = g.getByTestId("express-done");
  await expect(done).toBeVisible({ timeout: 30_000 });
  // Lot 36 : l'entrée est validée, pas de QR ; l'invitation à télécharger l'appli.
  await expect(done.getByTestId("express-entry-ok")).toBeVisible();
  await expect(done.getByTestId("express-app")).toBeVisible();
  await expect(done.locator("svg[data-qr-version]")).toHaveCount(0);
  expect(done).not.toContainText("La photo n'a pas pu être envoyée");
  // Le compte est connecté : l'accès est retenu, avec son QR, et le véhicule a sa photo.
  await g.goto("/app/acces");
  await expect(g.getByTestId("application").first()).toHaveAttribute("data-status", "accepted");
  await expect(g.getByTestId("pass-qr")).toBeVisible();
  const guest = await login(guestEmail, strong);
  const vehicles = await apiCall<{ photos: unknown[] }[]>(guest, "GET", "/me/vehicles");
  expect(vehicles.data[0]?.photos.length).toBeGreaterThan(0);
  // Le lien ne sert qu'une fois.
  await g.goto(`/express/${token}`);
  await expect(g.getByRole("heading", { name: "Lien déjà utilisé" })).toBeVisible();
  // L'organisateur voit l'entrée « express ».
  const checkins = await apiCall<{ items?: { method: string }[] } | { method: string }[]>(
    ownerCookie,
    "GET",
    `/events/${eventId}/checkins`,
  );
  const rows = Array.isArray(checkins.data) ? checkins.data : (checkins.data.items ?? []);
  expect(rows.some((r) => r.method === "express")).toBe(true);

  await phone.close();
  await visitor.close();
  await ownerCtx.close();
});

test("lien d'invitation : le compte créé suit l'équipe organisatrice", async ({ page }) => {
  const organizer = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(organizer, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const structure = await apiCall<{ inviteToken: string; name: string }>(
    organizer,
    "GET",
    `/structures/${structureId}`,
  );
  const s = unique();
  await page.goto(`/invitation/${structure.data.inviteToken}`);
  await expect(page.getByRole("heading", { name: structure.data.name })).toBeVisible();
  await page.getByLabel("Pseudo").fill(`Fan_${s}`);
  await page.getByLabel("E-mail").fill(`fan_${s}@e2e.orasso.test`);
  await page.getByLabel("Mot de passe", { exact: true }).fill("mot-de-passe-fan-2026");
  await fillArrivee(page);
  await page.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
  await page.getByRole("button", { name: "Créer mon compte et suivre" }).click();
  await page.waitForURL("**/o/meditesportcar");
  await expect(page.getByRole("button", { name: "Tu suis cette structure" })).toBeVisible();
  // Une invitation inconnue n'existe pas.
  const unknown = await page.goto("/invitation/jeton-inconnu");
  expect(unknown?.status()).toBe(404);
});

test("référencement : titres, descriptions et aperçus de lien des pages publiques", async ({ page }) => {
  for (const path of [
    "/",
    "/evenements",
    "/organisateurs",
    "/professionnels",
    "/o/meditesportcar",
    "/e/nocturne-de-canet-2026",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(/Orasso/);
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute("content", /.{40,}/);
    await expect(page.locator('meta[property="og:title"]'), path).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:url"]'), path).toHaveAttribute("content", /^http/);
    await expect(page.locator('meta[property="og:image"]'), path).toHaveAttribute("content", /.+/);
    expect(await page.locator("h1").count(), `${path} : un seul h1`).toBe(1);
  }
  // Les liens à jeton et les espaces connectés ne sont pas indexés.
  await page.goto("/invitation/jeton-inconnu").catch(() => null);
  await page.goto("/connexion");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // Données structurées de la page événement.
  await page.goto("/e/nocturne-de-canet-2026");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
  expect(ld["@type"]).toBe("Event");
  expect(ld.name).toBe("Nocturne de Canet");
});

test("accueil : événements près de chez toi, trois entrées, appli bientôt disponible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Du rassemblement à l'entrée");
  await expect(page.getByTestId("home-events").getByTestId("event-tile").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Trouver un événement" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Découvrir l'outil" })).toHaveAttribute("href", "/organisateurs");
  await expect(page.getByRole("link", { name: "Voir la présentation" })).toHaveAttribute("href", "/professionnels");
  await expect(page.getByRole("button", { name: "Bientôt sur Android et iPhone" })).toBeDisabled();
  // Département choisi : « près de chez toi ».
  await page.goto("/?departement=66");
  await expect(page.getByRole("heading", { name: "Prochains événements près de chez toi" })).toBeVisible();
  await page.goto("/?departement=2A");
  await expect(page.getByText("Aucun événement à venir dans le 2A")).toBeVisible();
});

test("audit du système de design sur les pages publiques (deux thèmes, bureau et 390 px)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const paths = [
    "/",
    "/evenements",
    "/organisateurs",
    "/professionnels",
    "/o/meditesportcar",
    "/e/nocturne-de-canet-2026",
  ];
  for (const theme of ["beton", "sable"]) {
    for (const size of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const ctx = await browser.newContext({ viewport: size });
      await ctx.addCookies([{ name: "orasso-theme", value: theme, url: baseURL ?? "http://localhost:5173" }]);
      const p = await ctx.newPage();
      for (const path of paths) {
        await p.goto(path);
        await p.waitForLoadState("networkidle");
        const a = await auditPage(p);
        const where = `${path} ${theme} ${size.width}`;
        expect(a.primaryButtons, `${where} : boutons principaux`).toBeLessThanOrEqual(1);
        expect(a.neonAccent, `${where} : néons moutarde`).toBeLessThanOrEqual(1);
        expect(a.buttonsWithoutIcon, `${where} : boutons sans icône`).toEqual([]);
        expect(a.greens, `${where} : vert`).toEqual([]);
        expect(a.truncated, `${where} : texte tronqué`).toEqual([]);
        expect(a.horizontalScroll, `${where} : défilement horizontal`).toBe(false);
      }
      await ctx.close();
    }
  }
});
