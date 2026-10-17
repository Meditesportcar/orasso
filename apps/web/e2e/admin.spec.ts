import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  login,
  randomPlate,
  signUpApi,
  simulateSettle,
  unique,
} from "./helpers";

// Administration (lot 33) sur le site, critère de fin : accueil avec compteurs non nuls ; fiche d'un utilisateur →
// réinitialisation de la double authentification tracée ; base véhicules : un « Autre » rattaché à une marque créée,
// propriétaire prévenu ; mode assistance : écriture refusée dans /orga/meditesportcar, l'organisateur demande l'aide,
// l'écriture passe et le journal la porte ; réglages : malus à −15 → le prochain règlement l'applique ; newsletter de test
// reçue (transport journal, .data/mail), planifiée puis envoyée aux abonnés, désinscription par le lien sans connexion ;
// le modérateur ne voit que la file des signalements. Avec CAPTURES=1 : écrans dans les deux thèmes (l'administration
// suit le thème de l'utilisateur), bureau et 390 px, avec le contrôle du système de design.
// Prérequis : site et API lancés (DEV_SKIP_2FA=true, tâches pg-boss actives) sur la base locale avec le seed.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-33-captures/site";
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const MAIL_DIR = resolve(import.meta.dirname, "../../../", process.env.DATA_DIR ?? ".data", "mail");
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;

async function context(
  browser: Browser,
  cookie: string | null,
  opts: { width?: number; height?: number; theme?: "beton" | "sable" } = {},
) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 } });
  const url = new URL(WEB);
  const cookies: { name: string; value: string; url: string }[] = [
    { name: "orasso-theme", value: opts.theme ?? "beton", url: WEB },
  ];
  for (const pair of (cookie ?? "").split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

/** E-mails du transport journal écrits depuis `since` qui contiennent `needle`. */
function mailsSince(since: number, needle: string): string[] {
  let files: string[] = [];
  try {
    files = readdirSync(MAIL_DIR).filter((f) => statSync(resolve(MAIL_DIR, f)).mtimeMs >= since - 1000);
  } catch {
    return [];
  }
  return files.map((f) => readFileSync(resolve(MAIL_DIR, f), "utf8")).filter((c) => c.includes(needle));
}

test("administration : accueil, 2FA, base véhicules, mode assistance, barème, newsletter, modérateur", async ({
  browser,
}) => {
  test.setTimeout(1_200_000);
  const s = unique();
  const damien = await login("damien@orasso.local");
  const equipe = await login("equipe@orasso.local");
  const ctxD = await context(browser, damien);
  const pageD = await ctxD.newPage();

  // --- Accueil : toutes les files, compteurs non nuls ---------------------------------------------------------------
  await pageD.goto("/admin");
  const counts = await pageD.getByTestId("admin-overview").locator(".adm-tile__count").allInnerTexts();
  expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

  // --- Fiche d'un utilisateur → réinitialisation de la double authentification, tracée ----------------------------
  const pseudo = `Cible_${s}`;
  await signUpApi(pseudo);
  await pageD.goto(`/admin/utilisateurs?q=${pseudo}`);
  await pageD.getByTestId("user-row").getByRole("link", { name: pseudo }).click();
  await pageD.waitForURL(/\/admin\/utilisateurs\/[^/?]+$/);
  const reset = pageD.getByTestId("action-twofactor");
  await reset.getByLabel(/Motif/).fill("Téléphone perdu, identité vérifiée par visio");
  await reset.getByRole("button", { name: "Réinitialiser" }).click();
  await expect(pageD.getByTestId("user-done")).toBeVisible();
  const resetTrace = await apiCall<{ items: { reason: string; actorPseudo: string }[] }>(
    damien,
    "GET",
    "/admin/audit?action=user.reset_two_factor&limit=1",
  );
  expect(resetTrace.data.items[0]).toMatchObject({
    reason: "Téléphone perdu, identité vérifiée par visio",
    actorPseudo: "Damien_66",
  });

  // --- Base véhicules : un « Autre » rattaché à une marque créée, propriétaire prévenu -----------------------------
  const owner = await signUpApi(`Proprio_${s}`);
  const makes = await apiCall<{ id: string; name: string; isOther: boolean }[]>(
    owner,
    "GET",
    "/vehicle-reference/makes",
  );
  const otherMake = makes.data.find((m) => m.isOther);
  const otherModels = await apiCall<{ id: string }[]>(owner, "GET", `/vehicle-reference/makes/${otherMake?.id}/models`);
  const created = await apiCall<{ id: string }>(owner, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: otherMake?.id,
    modelId: otherModels.data[0]?.id,
    year: 1972,
    plate: randomPlate(),
    description: `Alpine A110 bleue ${s}`,
  });
  expect(created.status).toBe(201);
  await pageD.goto("/admin/vehicules");
  const makeForm = pageD.getByTestId("make-form");
  await makeForm.getByLabel("Nouvelle marque").fill(`Alpine ${s}`);
  await makeForm.getByLabel(/Pays/).fill("FR");
  await makeForm.getByRole("button", { name: "Créer la marque" }).click();
  await pageD.waitForURL(/fait=marque/);
  const modelForm = pageD.getByTestId("model-form");
  await modelForm.getByLabel("Nouveau modèle").fill("A110");
  await modelForm.getByRole("button", { name: "Créer le modèle" }).click();
  await pageD.waitForURL(/fait=modele/);
  const row = pageD.getByTestId("other-vehicle").filter({ hasText: `Alpine A110 bleue ${s}` });
  await row.getByRole("button", { name: "Rattacher ce véhicule" }).click();
  await pageD.waitForURL(/fait=rattache/);
  await expect(pageD.getByTestId("other-vehicle").filter({ hasText: `Alpine A110 bleue ${s}` })).toHaveCount(0);
  const notes = await apiCall<{ items: { type: string; body: string }[] }>(owner, "GET", "/me/notifications");
  expect(notes.data.items.find((n) => n.type === "vehicle_reassigned")?.body).toContain(`Alpine ${s} A110`);

  // --- Mode assistance : refus, demande de la structure, intervention tracée --------------------------------------
  const ctxE = await context(browser, equipe);
  const pageE = await ctxE.newPage();
  await pageE.goto("/orga/meditesportcar/structure");
  await expect(pageE.getByTestId("orga-assistance")).toHaveAttribute("data-mode", "read_only");
  await pageE.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(pageE.getByRole("alert").filter({ hasText: "Mode assistance : lecture seule" })).toBeVisible();
  await pageD.goto("/orga/meditesportcar/structure");
  const help = pageD.getByTestId("assistance");
  await help.getByLabel("Ce dont tu as besoin").fill(`Merci de corriger notre fiche (${s})`);
  await help.getByRole("button", { name: "Demander l'aide d'Orasso" }).click();
  await expect(pageD.getByTestId("assistance-current")).toContainText(s);
  await pageE.goto("/orga/meditesportcar/structure");
  await expect(pageE.getByTestId("orga-assistance")).toHaveAttribute("data-mode", "intervention");
  await pageE.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(pageE.getByText("Fiche enregistrée.")).toBeVisible();
  const assist = await apiCall<{ items: { assistanceRequestId: string | null; actorPseudo: string }[] }>(
    damien,
    "GET",
    "/admin/audit?action=structure.assist&limit=1",
  );
  expect(assist.data.items[0]?.assistanceRequestId).toBeTruthy();
  expect(assist.data.items[0]?.actorPseudo).toBe("Equipe_Orasso");
  // La structure ferme sa demande : la recette reste rejouable.
  await pageD.goto("/orga/meditesportcar/structure");
  await pageD.getByTestId("assistance").getByRole("button", { name: "Fermer la demande" }).click();
  await expect(pageD.getByTestId("assistance").getByText("Demande fermée.")).toBeVisible();

  // --- Réglages : malus à −15, appliqué par le prochain règlement ---------------------------------------------------
  await pageD.goto("/admin/reglages");
  const pointsForm = pageD.getByTestId("admin-points");
  await pointsForm.getByLabel("Absent sans désistement (malus)").fill("-15");
  await pointsForm.getByRole("button", { name: "Enregistrer le barème" }).click();
  await expect(pageD.getByTestId("settings-done")).toBeVisible();
  const event = await createEvent(damien, { title: `Barème ${s}` });
  const absent = await signUpApi(`Absent_${s}`);
  const vehicle = await addVehicleApi(absent, randomPlate());
  const application = await applyApi(absent, event.id, vehicle);
  await decideApi(damien, event.id, application, "accept");
  simulateSettle(event.slug);
  // Le règlement simulé bloque plusieurs secondes : la connexion gardée ouverte a pu être fermée par l'API (ECONNRESET),
  // on réessaie une fois avec une connexion neuve.
  const readPoints = () => apiCall<{ entries: { kind: string; points: number }[] }>(absent, "GET", "/me/points");
  const pts = await readPoints().catch(readPoints);
  expect(pts.data.entries.find((e) => e.kind === "malus")?.points).toBe(-15);
  await apiCall(damien, "PUT", "/admin/settings/points.malus", { value: -10 });

  // --- Newsletter : test à soi, planification, envoi aux abonnés, désinscription ------------------------------------
  const kenji = await login("kenji@orasso.local");
  await apiCall(kenji, "PATCH", "/me/profile", { newsletterOptIn: true });
  const startedAt = Date.now();
  await pageD.goto("/admin/newsletter");
  const editor = pageD.getByTestId("newsletter-editor");
  await editor.getByLabel("Objet").fill(`Nouvelles d'Orasso ${s}`);
  await editor.getByLabel("Message").fill(`# Bonjour\n\nLa **saison** reprend. ${s}`);
  await expect(pageD.getByTestId("newsletter-preview").locator("strong")).toHaveText("saison");
  await editor.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(pageD.getByTestId("newsletter-done")).toBeVisible();
  await pageD.getByTestId("newsletter-editor").getByRole("button", { name: "M'envoyer un test" }).click();
  await expect(pageD.getByTestId("newsletter-done")).toContainText("Test envoyé");
  await expect
    .poll(
      () =>
        mailsSince(startedAt, `[Test] Nouvelles d&#39;Orasso ${s}`).length +
        mailsSince(startedAt, `[Test] Nouvelles d'Orasso ${s}`).length,
    )
    .toBeGreaterThan(0);
  // « Planifier » exige une date future ; « Envoyer maintenant » demande de confirmer le nombre de destinataires.
  await pageD.getByTestId("newsletter-editor").getByRole("button", { name: "Envoyer maintenant" }).click();
  await pageD
    .getByTestId("newsletter-confirm")
    .getByRole("button", { name: /^Envoyer à \d+ personne/ })
    .click();
  await expect(pageD.getByTestId("newsletter-done")).toContainText("Envoi lancé");
  const id = new URL(pageD.url()).searchParams.get("id");
  // La tâche `newsletter.send` passe chaque minute.
  await expect
    .poll(async () => (await apiCall<{ status: string }>(damien, "GET", `/admin/newsletters/${id}`)).data.status, {
      timeout: 150_000,
      intervals: [5_000],
    })
    .toBe("sent");
  const toKenji = mailsSince(startedAt, "kenji@orasso.local").filter((m) => m.includes(s) && !m.includes("[Test]"));
  expect(toKenji.length).toBe(1);
  const link = /href="([^"]*\/desinscription\/[^"]+)"/.exec(toKenji[0] ?? "")?.[1] ?? "";
  expect(link).toContain("/desinscription/");
  const anon = await context(browser, null);
  const pageA = await anon.newPage();
  await pageA.goto(new URL(link).pathname);
  await pageA.getByRole("button", { name: "Se désinscrire" }).click();
  await expect(pageA.getByTestId("unsubscribe-done")).toBeVisible();
  const me = await apiCall<{ profile: { newsletterOptIn: boolean } }>(kenji, "GET", "/me");
  expect(me.data.profile.newsletterOptIn).toBe(false);
  await apiCall(kenji, "PATCH", "/me/profile", { newsletterOptIn: true });

  // --- Le modérateur ne voit que la file des signalements -----------------------------------------------------------
  const moderator = await login("moderatrice@orasso.local");
  const ctxM = await context(browser, moderator);
  const pageM = await ctxM.newPage();
  await pageM.goto("/admin");
  await pageM.waitForURL("**/admin/signalements");
  const links = await pageM.getByRole("navigation", { name: "Administration" }).locator("a.orga__link").allInnerTexts();
  expect(links.filter((l) => !l.startsWith("Mon compte"))).toEqual([expect.stringMatching(/^Signalements/)]);
  expect((await pageM.goto("/admin/reglages"))?.url()).toContain("/admin/signalements");

  if (process.env.CAPTURES === "1") {
    mkdirSync(DIR, { recursive: true });
    const audits: Record<string, Audit> = {};
    const userId = (await apiCall<{ items: { id: string }[] }>(damien, "GET", `/admin/users?q=${pseudo}`)).data.items[0]
      ?.id;
    const shots: [string, string, string | null][] = [
      ["01-admin-accueil", "/admin", damien],
      ["02-admin-utilisateurs", "/admin/utilisateurs", damien],
      ["03-admin-fiche-utilisateur", `/admin/utilisateurs/${userId}`, damien],
      ["04-admin-structures", "/admin/structures", damien],
      ["05-admin-pros", "/admin/pros", damien],
      ["06-admin-vehicules", "/admin/vehicules", damien],
      ["07-admin-journal", "/admin/journal", damien],
      ["08-admin-assistance", "/admin/assistance?statut=closed", damien],
      ["09-admin-reglages", "/admin/reglages", damien],
      ["10-admin-newsletter", `/admin/newsletter?id=${id}`, damien],
      ["11-admin-sponsorises", "/admin/sponsorises", damien],
      ["12-orga-mode-assistance", "/orga/meditesportcar", equipe],
      ["13-orga-demander-aide", "/orga/meditesportcar/structure", damien],
      ["14-desinscription", new URL(link).pathname, null],
    ];
    for (const theme of ["beton", "sable"] as const) {
      for (const view of VIEWS) {
        for (const [name, path, cookie] of shots) {
          const ctx = await context(browser, cookie, { width: view.width, height: view.height, theme });
          const p = await ctx.newPage();
          await p.goto(`${WEB}${path}`);
          await p.waitForTimeout(800);
          await p.screenshot({ path: `${DIR}/${name}-${theme}-${view.id}.png`, fullPage: true });
          audits[`${name}-${theme}-${view.id}`] = await auditPage(p);
          await ctx.close();
        }
      }
    }
    writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
    for (const [key, a] of Object.entries(audits)) {
      expect(a.buttonsWithoutIcon, key).toEqual([]);
      expect(a.greens, key).toEqual([]);
      expect(a.truncated, key).toEqual([]);
      expect(a.horizontalScroll, key).toBe(false);
      expect(a.primaryButtons, key).toBeLessThanOrEqual(1);
    }
  }
  for (const ctx of [ctxD, ctxE, ctxM, anon]) await ctx.close();
});
