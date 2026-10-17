import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, deliverNow, login, SEED_PASSWORD, samplePhoto } from "./helpers";

// Appli dans le navigateur (lot 35a, décision D20) : Équipe, structure, bannissements, modèles, export et notes. Parcours
// de la fiche : une demande de staff arrive, l'organisateur l'accepte depuis l'appli, change le rôle de la personne, la
// retire, crée un modèle, exporte les participants avec un motif (tracé), ajoute une note. Puis les mêmes écrans dans
// le thème Sable et un contrôle des règles du système de design sur chaque écran capturé.
// Lancer avec APP_URL=http://localhost:<relais> (Metro derrière apps/mobile/scripts/web-isolated.mjs, EXPO_PUBLIC_API_URL,
// EXPO_PUBLIC_SITE_URL et CORS_ORIGINS posés). Captures à 390 px dans les deux thèmes.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-35a-captures";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";

async function openApp(browser: import("@playwright/test").Browser, email: string, theme: Theme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: APP,
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((th) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", th);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function chooseOrganizer(page: Page, name: string) {
  await page.getByRole("button", { name: "Moi et mes casquettes" }).click();
  await page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
}

/** Ouvre une adresse de l'appli et attend la fin de l'ouverture animée (le logo passe sur l'écran à chaque chargement). */
async function go(page: Page, path: string) {
  await page.goto(path);
  await page.waitForTimeout(3500);
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

type Audit = { greens: string[]; truncated: string[]; horizontalScroll: boolean; noIcon: string[] };

/** Règles du système de design vérifiables dans le DOM de l'appli web : pas de vert, rien de tronqué, pas de défilement horizontal. */
async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const isGreen = (color: string) => {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return false;
      const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      if (a < 0.2) return false;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 40 || max !== g) return false;
      let h = 60 * ((b - r) / (max - min)) + 120;
      if (h < 0) h += 360;
      return h > 85 && h < 165;
    };
    const all = [...document.querySelectorAll("body *")].filter(visible);
    const greens = new Set<string>();
    for (const el of all) {
      const s = getComputedStyle(el);
      for (const c of [s.color, s.backgroundColor, s.borderTopColor]) if (isGreen(c)) greens.add(`${el.tagName} ${c}`);
    }
    const label = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    return {
      greens: [...greens].slice(0, 10),
      truncated: all
        .filter((el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        .map(label),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      // Un bouton du système (rôle « button » avec un libellé) sans pictogramme : les pastilles et les puces n'ont pas de libellé long.
      noIcon: all
        .filter(
          (el) =>
            el.getAttribute("role") === "button" &&
            !el.querySelector("svg") &&
            label(el).length > 0 &&
            getComputedStyle(el).textTransform === "uppercase",
        )
        .map(label),
    };
  });
}

const results: Record<string, Audit> = {};

test("Équipe, structure, modèles, export et notes depuis l'appli", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const shot = async (page: Page, name: string) => {
    // (Les feuilles glissent en 300 ms : on attend qu'elles soient en place.)
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/${name}.png` });
    results[name] = await audit(page);
  };

  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(damien, "GET", "/me");
  const structure = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("MéditeSportCar"));
  expect(structure).toBeTruthy();
  const sid = structure?.id ?? "";
  const events = await apiCall<{ id: string; title: string }[]>(damien, "GET", `/structures/${sid}/events`);
  const salon = events.data.find((e) => e.title.includes("Salon Argelès"));
  expect(salon).toBeTruthy();

  // Reste d'une recette interrompue : les modèles de test se retirent (le test se rejoue sans traîner d'état).
  const leftovers = await apiCall<{ items: { id: string; name: string; orasso: boolean }[] }>(
    damien,
    "GET",
    `/structures/${sid}/templates`,
  );
  for (const t of leftovers.data.items.filter((x) => !x.orasso && x.name.startsWith("Rappel d'arrivée"))) {
    await apiCall(damien, "DELETE", `/structures/${sid}/templates/${t.id}`);
  }

  // --- 1. Une demande pour devenir staff arrive ---------------------------------------------------------------
  type Member = { userId: string; pseudo: string; role: string; staffRoles: string[]; status: string };
  const members = () => apiCall<Member[]>(damien, "GET", `/structures/${sid}/members`).then((r) => r.data);
  let applicant: { pseudo: string } | null = null;
  for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
    const email = `pilote${n}@orasso.local`;
    const cookie = await login(email).catch(() => null);
    if (!cookie) continue;
    const mine = await apiCall<{ profile: { pseudo: string }; user: { id: string } }>(cookie, "GET", "/me");
    const already = (await members()).find((m) => m.userId === mine.data.user.id);
    if (already) continue;
    const sent = await apiCall(cookie, "POST", `/structures/${sid}/staff-requests`, { message: "Dispo le week-end." });
    if (sent.status === 201) {
      applicant = { pseudo: mine.data.profile.pseudo };
      break;
    }
  }
  expect(applicant, "un passionné du seed peut demander à rejoindre le staff").toBeTruthy();
  const pseudo = applicant?.pseudo ?? "";

  const a = await openApp(browser, "damien@orasso.local", "beton");
  const page = a.page;
  await chooseOrganizer(page, "MéditeSportCar");
  await expect(page.getByTestId("orga-direct-event")).toBeVisible({ timeout: 30_000 });

  // Le point de l'onglet Staff : une demande attend.
  await tab(page, "Staff").click();
  const request = page.getByTestId("team-request").filter({ hasText: pseudo });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Demandes reçues · \d+/)).toBeVisible();
  await shot(page, "01-equipe-demandes-beton");

  // La notification de la demande ouvre l'écran Équipe (lien profond, depuis le Journal) : on part d'un autre onglet.
  deliverNow("damien@orasso.local");
  await tab(page, "Direct").click();
  await expect(page.getByTestId("orga-direct-event")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Journal" }).click();
  await page.getByTestId("journal-item").filter({ hasText: "Demande pour rejoindre le staff" }).first().click();
  await expect(page.getByTestId("team-request").filter({ hasText: pseudo })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/staff/);

  // --- 2. L'organisateur l'accepte depuis l'appli, avec un rôle -----------------------------------------------
  await request.getByTestId("team-request-accept").click();
  await page.getByRole("checkbox", { name: "Scan accueil" }).click();
  await shot(page, "02-accepter-feuille-beton");
  await page.getByTestId("team-accept-confirm").click();
  await expect(page.getByText("Demande acceptée.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("team-request").filter({ hasText: pseudo })).toHaveCount(0);
  let added = (await members()).find((m) => m.pseudo === pseudo);
  expect(added?.status).toBe("active");
  expect(added?.staffRoles).toEqual(["scan"]);
  const row = page.getByTestId("team-member").filter({ hasText: pseudo });
  await expect(row).toBeVisible();
  await shot(page, "03-equipe-membres-beton");

  // --- 3. Il change le rôle de la personne --------------------------------------------------------------------
  await row.getByTestId("team-member-manage").click();
  await page.getByRole("checkbox", { name: "Boutique" }).click();
  await shot(page, "04-gerer-membre-beton");
  await page.getByTestId("team-member-save").click();
  await expect(page.getByText("Rôles enregistrés.")).toBeVisible({ timeout: 20_000 });
  added = (await members()).find((m) => m.pseudo === pseudo);
  expect(added?.staffRoles).toEqual(["scan", "shop"]);

  // --- 4. Il la retire (feuille de confirmation) --------------------------------------------------------------
  await row.getByTestId("team-member-manage").click();
  await page.getByTestId("team-member-remove").click();
  await shot(page, "05-retirer-confirmation-beton");
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText(/Membre retiré/)).toBeVisible({ timeout: 20_000 });
  expect((await members()).find((m) => m.pseudo === pseudo)).toBeUndefined();

  // --- 5. Il crée un modèle ------------------------------------------------------------------------------------
  await page.getByTestId("team-nav-templates").click();
  await expect(page.getByTestId("template-new")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("template-new").click();
  const templateName = `Rappel d'arrivée ${Date.now() % 100000}`;
  await page.getByTestId("template-name").fill(templateName);
  await page.getByTestId("template-subject").fill("Ton arrivée");
  await page.getByTestId("template-body").fill("Bonjour {{pseudo}}, rendez-vous à l'entrée B pour {{event.title}}.");
  await shot(page, "06-modele-feuille-beton");
  await page.getByTestId("template-save").click();
  await expect(page.getByText("Modèle enregistré.")).toBeVisible({ timeout: 20_000 });
  const card = page.getByTestId("template-card").filter({ hasText: templateName });
  await expect(card).toBeVisible();
  await shot(page, "07-modeles-beton");
  // Modification, puis suppression avec confirmation.
  await card.getByTestId("template-edit").click();
  await page.getByTestId("template-subject").fill("Ton arrivée à l'entrée B");
  await page.getByTestId("template-save").click();
  await expect(
    page.getByTestId("template-card").filter({ hasText: templateName }).filter({ hasText: "Ton arrivée à l'entrée B" }),
  ).toBeVisible({ timeout: 20_000 });
  const templates = await apiCall<{ items: { name: string; subject: string | null }[] }>(
    damien,
    "GET",
    `/structures/${sid}/templates`,
  );
  expect(templates.data.items.find((t) => t.name === templateName)?.subject).toBe("Ton arrivée à l'entrée B");

  // --- 6. Il exporte les participants avec un motif -----------------------------------------------------------
  await go(page, `/evenement/${salon?.id}/bilan`);
  await expect(page.getByTestId("orga-export")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("orga-export-reason").fill("court");
  await expect(page.getByTestId("orga-export-button")).toBeDisabled();
  const reason = `Demande de la gendarmerie, recette ${Date.now()}`;
  await page.getByTestId("orga-export-reason").fill(reason);
  await shot(page, "08-export-motif-beton");
  await page.getByTestId("orga-export-button").click();
  await shot(page, "09-export-confirmation-beton");
  const download = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("orga-confirm").click();
  const file = await download;
  const csvPath = `${DIR}/export-recette.csv`;
  await file.saveAs(csvPath);
  const csv = readFileSync(csvPath, "utf8");
  expect(csv).toContain("Export Orasso");
  expect(csv).toContain(reason);
  // Le fichier de la recette ne reste pas : il contient des données de démonstration seulement, mais on ne le garde pas.
  writeFileSync(csvPath, "supprimé après contrôle");
  await expect(page.getByTestId("orga-export-done")).toBeVisible({ timeout: 20_000 });
  // La trace côté API : qui, quand, pourquoi.
  const audit1 = await apiCall<{ items: { log: { action: string; reason: string | null } }[] }>(
    damien,
    "GET",
    "/admin/audit?limit=20",
  );
  const traced = JSON.stringify(audit1.data).includes(reason);
  expect(traced, "l'export est tracé au journal d'administration avec son motif").toBe(true);

  // --- 7. Il ajoute une note -----------------------------------------------------------------------------------
  const checkins = await apiCall<{ pseudo: string }[]>(damien, "GET", `/events/${salon?.id}/checkins`);
  const person = checkins.data.find((c) => /^Pilote_\d+$/.test(c.pseudo))?.pseudo ?? checkins.data[0]?.pseudo ?? "";
  expect(person).not.toBe("");
  await go(page, "/notes");
  await expect(page.getByTestId("notes-query")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("notes-query").fill(person);
  await page.getByTestId("notes-search").click();
  const note = `Arrivé tôt, a aidé au placement ${Date.now() % 100000}`;
  // La personne cherchée : son groupe de notes, ou le formulaire « note à cette personne » (pseudos voisins exclus).
  const scope = page
    .locator('[data-testid="notes-new-person"], [data-testid="notes-person"]')
    // (Le texte des blocs est collé sans séparateur : « Pilote_001Visible… », d'où le seul garde-fou sur les chiffres.)
    .filter({ hasText: new RegExp(`${person}(?![0-9])`) })
    .first();
  await expect(scope).toBeVisible({ timeout: 20_000 });
  await scope.getByTestId("structure-note-draft").fill(note);
  await shot(page, "10-notes-beton");
  await scope.getByTestId("structure-note-add").click();
  await expect(page.getByTestId("structure-note").filter({ hasText: note })).toBeVisible({ timeout: 20_000 });
  const notes = await apiCall<{ items: { body: string }[] }>(damien, "GET", `/structures/${sid}/notes?q=${person}`);
  expect(notes.data.items.some((n) => n.body === note)).toBe(true);
  await shot(page, "11-note-ajoutee-beton");
  // Modification puis suppression (feuille de confirmation).
  await page.getByTestId("structure-note").filter({ hasText: note }).getByTestId("structure-note-edit-button").click();
  await page.getByTestId("structure-note-edit").fill(`${note} (corrigé)`);
  await page.getByTestId("structure-note-save").click();
  await expect(page.getByTestId("structure-note").filter({ hasText: "(corrigé)" })).toBeVisible({ timeout: 20_000 });
  await page
    .getByTestId("structure-note")
    .filter({ hasText: "(corrigé)" })
    .getByTestId("structure-note-delete")
    .click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByTestId("structure-note").filter({ hasText: "(corrigé)" })).toHaveCount(0, { timeout: 20_000 });

  // Notes depuis la fiche de tri : l'onglet Tri montre la prochaine candidature ; sa fiche complète porte les notes.
  await tab(page, "Tri").click();
  // L'événement du jour n'a plus rien à trier : on prend celui qui a des candidatures en attente (« Salon de printemps »).
  await page.getByRole("button", { name: /Événement à trier/ }).click();
  await page.getByText("Salon de printemps").last().click();
  await expect(page.getByTestId("triage-full")).toBeEnabled({ timeout: 30_000 });
  // (La carte du tri bouge en continu : le bouton n'est jamais « stable » au sens de Playwright, d'où `force`.)
  await page.getByTestId("triage-full").click({ force: true });
  // (L'écran « Notes internes » reste monté derrière : on cherche dans la feuille seulement.)
  const sheet = page.getByTestId("triage-full-notes");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const sheetNote = `Note depuis la fiche de tri ${Date.now() % 100000}`;
  await sheet.getByTestId("structure-note-draft").fill(sheetNote);
  await sheet.getByTestId("structure-note-add").click();
  const sheetItem = sheet.getByTestId("structure-note").filter({ hasText: sheetNote });
  await expect(sheetItem).toBeVisible({ timeout: 20_000 });
  await shot(page, "11b-fiche-tri-notes-beton");
  await sheetItem.getByTestId("structure-note-delete").click();
  await page.getByTestId("orga-confirm").click();
  await expect(sheetItem).toHaveCount(0, { timeout: 20_000 });

  // Nettoyage du modèle de la recette (suppression avec confirmation).
  await go(page, "/modeles");
  const mine = page.getByTestId("template-card").filter({ hasText: templateName });
  await expect(mine).toBeVisible({ timeout: 30_000 });
  await mine.getByTestId("template-delete").click();
  await page.getByTestId("orga-confirm").click();
  await expect(page.getByText("Modèle supprimé.")).toBeVisible({ timeout: 20_000 });
  await a.ctx.close();

  // --- Structure (fiche, logo, vérification, badge, partenaires), bannissements : parcours de lecture et d'écriture -
  const s = await openApp(browser, "damien@orasso.local", "beton");
  await chooseOrganizer(s.page, "MéditeSportCar");
  await go(s.page, "/ma-structure");
  await expect(s.page.getByTestId("orga-verification")).toBeVisible({ timeout: 30_000 });
  await expect(s.page.getByTestId("orga-structure-name")).toBeVisible();
  await shot(s.page, "12-structure-beton");
  // La fiche : changer la description puis la remettre.
  const before = await apiCall<{ description: string | null }>(damien, "GET", `/structures/${sid}`);
  const description = `${before.data.description ?? ""}`.trim();
  await s.page.getByTestId("orga-structure-description").fill(`${description} (recette)`.trim());
  await s.page.getByTestId("orga-structure-save").click();
  await expect(s.page.getByText("Fiche enregistrée.")).toBeVisible({ timeout: 20_000 });
  const after = await apiCall<{ description: string | null }>(damien, "GET", `/structures/${sid}`);
  expect(after.data.description).toBe(`${description} (recette)`.trim());
  await apiCall(damien, "PATCH", `/structures/${sid}`, { description: before.data.description });

  await go(s.page, "/bannis");
  await expect(s.page.getByTestId("bans-pseudo")).toBeVisible({ timeout: 30_000 });
  await s.page.getByTestId("bans-pseudo").fill(person);
  await s.page.getByTestId("bans-reason").fill("Recette 35a");
  await s.page.getByTestId("bans-add").click();
  await shot(s.page, "13-bannir-confirmation-beton");
  await s.page.getByTestId("orga-confirm").click();
  await expect(s.page.getByText("Personne bannie.")).toBeVisible({ timeout: 20_000 });
  const ban = s.page.getByTestId("bans-row").filter({ hasText: person });
  await expect(ban).toBeVisible();
  await shot(s.page, "14-bannissements-beton");
  await ban.getByTestId("bans-lift").click();
  await s.page.getByTestId("orga-confirm").click();
  await expect(s.page.getByText("Bannissement levé.")).toBeVisible({ timeout: 20_000 });
  await s.ctx.close();

  // --- Le staff et un passionné n'ont pas ces écrans -----------------------------------------------------------
  const julie = await login("julie@orasso.local");
  for (const path of [
    `/structures/${sid}/bans`,
    `/structures/${sid}/notes`,
    `/structures/${sid}/templates`,
    `/structures/${sid}/verification`,
  ]) {
    const refused = await apiCall(julie, "GET", path);
    expect([401, 403, 404]).toContain(refused.status);
  }
  const fan = await openApp(browser, "kenji@orasso.local", "beton");
  await go(fan.page, "/staff");
  await fan.page.waitForURL(/accueil/, { timeout: 20_000 });
  await go(fan.page, "/ma-structure");
  await fan.page.waitForURL(/accueil/, { timeout: 20_000 });
  await fan.ctx.close();

  // --- Les mêmes écrans dans le thème Sable --------------------------------------------------------------------
  const b = await openApp(browser, "damien@orasso.local", "sable");
  await chooseOrganizer(b.page, "MéditeSportCar");
  await tab(b.page, "Staff").click();
  await expect(b.page.getByTestId("team-member").first()).toBeVisible({ timeout: 30_000 });
  await shot(b.page, "20-equipe-sable");
  await b.page.getByTestId("team-invite").click();
  await shot(b.page, "21-inviter-sable");
  await b.page.keyboard.press("Escape");
  await go(b.page, "/ma-structure");
  await expect(b.page.getByTestId("orga-verification")).toBeVisible({ timeout: 30_000 });
  await shot(b.page, "22-structure-sable");
  await go(b.page, "/modeles");
  await expect(b.page.getByTestId("template-card").first()).toBeVisible({ timeout: 30_000 });
  await shot(b.page, "23-modeles-sable");
  await go(b.page, "/bannis");
  await expect(b.page.getByTestId("bans-pseudo")).toBeVisible({ timeout: 30_000 });
  await shot(b.page, "24-bannissements-sable");
  await go(b.page, "/notes");
  await expect(b.page.getByTestId("notes-query")).toBeVisible({ timeout: 30_000 });
  await shot(b.page, "25-notes-sable");
  await go(b.page, `/evenement/${salon?.id}/bilan`);
  await expect(b.page.getByTestId("orga-export")).toBeVisible({ timeout: 30_000 });
  await shot(b.page, "26-bilan-export-sable");
  await b.ctx.close();

  writeFileSync(`${DIR}/audit.json`, JSON.stringify(results, null, 2));
  for (const [name, r] of Object.entries(results)) {
    expect(r.greens, `${name} : pas de vert`).toEqual([]);
    expect(r.truncated, `${name} : rien de tronqué`).toEqual([]);
    expect(r.horizontalScroll, `${name} : pas de défilement horizontal`).toBe(false);
  }
});

test("une demande de staff refusée disparaît de l'Équipe et le compteur retombe", async ({ browser }) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(damien, "GET", "/me");
  const sid = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("MéditeSportCar"))?.id ?? "";
  type Member = { userId: string; pseudo: string; status: string };
  let pseudo = "";
  for (const n of [13, 14, 15, 16, 17, 18]) {
    const cookie = await login(`pilote${n}@orasso.local`).catch(() => null);
    if (!cookie) continue;
    const mine = await apiCall<{ profile: { pseudo: string }; user: { id: string } }>(cookie, "GET", "/me");
    const list = await apiCall<Member[]>(damien, "GET", `/structures/${sid}/members`);
    if (list.data.some((m) => m.userId === mine.data.user.id)) continue;
    const sent = await apiCall(cookie, "POST", `/structures/${sid}/staff-requests`, {});
    if (sent.status === 201) {
      pseudo = mine.data.profile.pseudo;
      break;
    }
  }
  expect(pseudo).not.toBe("");
  const a = await openApp(browser, "damien@orasso.local", "beton");
  await chooseOrganizer(a.page, "MéditeSportCar");
  await tab(a.page, "Staff").click();
  const request = a.page.getByTestId("team-request").filter({ hasText: pseudo });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await request.getByTestId("team-request-decline").click();
  await a.page.getByTestId("orga-confirm").click();
  await expect(a.page.getByText("Demande refusée.")).toBeVisible({ timeout: 20_000 });
  await expect(a.page.getByTestId("team-request").filter({ hasText: pseudo })).toHaveCount(0);
  await a.ctx.close();
});

test("structure non vérifiée : logo et justificatifs depuis l'appli, structure suspendue en lecture", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  mkdirSync(DIR, { recursive: true });
  const shot = async (page: Page, name: string) => {
    // (Les feuilles glissent en 300 ms : on attend qu'elles soient en place.)
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/${name}.png` });
    results[name] = await audit(page);
  };
  // Un compte neuf avec sa structure (non vérifiée).
  const email = `orga-35a-${Date.now()}@orasso.test`;
  const signUp = await apiCall(null, "POST", "/auth/sign-up/email", {
    email,
    password: SEED_PASSWORD,
    name: "Orga 35a",
  });
  expect(signUp.status).toBe(200);
  const cookie = await login(email);
  const name = `Club 35a ${Date.now() % 100000}`;
  const created = await apiCall<{ id: string }>(cookie, "POST", "/structures", {
    kind: "association",
    name,
    departments: ["66"],
  });
  expect(created.status).toBe(201);

  const a = await openApp(browser, email, "beton");
  await chooseOrganizer(a.page, name);
  await go(a.page, "/ma-structure");
  await expect(a.page.getByTestId("orga-verification")).toBeVisible({ timeout: 30_000 });
  await expect(a.page.getByTestId("orga-verification-number")).toBeVisible();
  await shot(a.page, "30-structure-non-verifiee-beton");

  // Justificatif : une photo choisie dans la photothèque (sélecteur de fichier du navigateur), puis retirée.
  const chooser = a.page.waitForEvent("filechooser");
  await a.page.getByTestId("orga-verification-add").click();
  (await chooser).setFiles({ name: "justificatif.png", mimeType: "image/png", buffer: samplePhoto() });
  await expect(a.page.getByText("Justificatif ajouté.")).toBeVisible({ timeout: 30_000 });
  await expect(a.page.getByTestId("orga-verification-document")).toHaveCount(1);
  const view = await apiCall<{ documents: { kind: string }[] }>(
    cookie,
    "GET",
    `/structures/${created.data.id}/verification`,
  );
  expect(view.data.documents).toHaveLength(1);
  await shot(a.page, "31-justificatif-ajoute-beton");
  await a.page.getByTestId("orga-verification-document-remove").click();
  await a.page.getByTestId("orga-confirm").click();
  await expect(a.page.getByText("Justificatif retiré.")).toBeVisible({ timeout: 20_000 });
  await expect(a.page.getByTestId("orga-verification-document")).toHaveCount(0);

  // Logo : même sélecteur de fichier.
  const logoChooser = a.page.waitForEvent("filechooser");
  await a.page.getByTestId("orga-logo-change").click();
  (await logoChooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: samplePhoto([40, 90, 160]) });
  await expect(a.page.getByText("Logo enregistré.")).toBeVisible({ timeout: 30_000 });
  const fiche = await apiCall<{ logoUrl: string | null }>(cookie, "GET", `/structures/${created.data.id}`);
  expect(fiche.data.logoUrl).toBeTruthy();
  await a.ctx.close();

  // Badge qui expire dans 5 jours : l'écran le dit. Structure suspendue : lecture seule, message de l'API à l'écriture.
  const canigou = await openApp(browser, "pres_canigou@orasso.local", "sable");
  await chooseOrganizer(canigou.page, "Écurie du Canigou");
  await go(canigou.page, "/ma-structure");
  await expect(canigou.page.getByTestId("orga-verification")).toContainText(/expire dans/, { timeout: 30_000 });
  await shot(canigou.page, "32-badge-echeance-sable");
  await canigou.ctx.close();

  const tram = await openApp(browser, "pres_tramontane@orasso.local", "sable");
  await chooseOrganizer(tram.page, "Tramontane Auto Club");
  await tab(tram.page, "Staff").click();
  await expect(tram.page.getByText("Structure suspendue", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await tram.page.getByTestId("team-invite").click();
  await tram.page.getByTestId("team-invite-who").fill("Kenji_66");
  await tram.page.getByTestId("team-invite-send").click();
  // Le message de l'API s'affiche dans la feuille, sans plantage.
  await expect(tram.page.getByText("lecture seule. Écris à l'équipe Orasso", { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  await shot(tram.page, "33-structure-suspendue-ecriture-refusee-sable");
  await tram.page.keyboard.press("Escape");
  await go(tram.page, "/ma-structure");
  await expect(tram.page.getByTestId("orga-badge-suspended")).toBeVisible({ timeout: 30_000 });
  await shot(tram.page, "34-structure-suspendue-sable");
  await tram.ctx.close();

  writeFileSync(`${DIR}/audit.json`, JSON.stringify(results, null, 2));
  for (const [captureName, r] of Object.entries(results)) {
    expect(r.greens, `${captureName} : pas de vert`).toEqual([]);
    expect(r.truncated, `${captureName} : rien de tronqué`).toEqual([]);
    expect(r.horizontalScroll, `${captureName} : pas de défilement horizontal`).toBe(false);
  }
});
