import { expect, test } from "@playwright/test";
import { apiCall, login } from "./helpers";
import { sql } from "./helpers/lot48";
import { closeSheet, open, rules, shot, signIn, THEMES, tab, toOrganizer } from "./helpers/lot52";

// Lot 52, côté appli (version web de recette) : la casquette Organisateur en DA v2. Cinq onglets : Événements (créer,
// brouillon qui dit ce qui manque, anciens derrière « … », duplication et invitation expliquée), Tri (grande photo, note
// d'arrivée, segments dont Prestataires par mission avec emplacement, et Presse), Direct (jour J, puis hors événement),
// Équipe (bulles de tailles différentes, historique et actions, rôles par événement), Structure (sceau tournant et
// pastille au O quand elle est validée, message clair quand elle est en vérification). Deux thèmes, captures à 390 px,
// audit des règles du système de design sur chaque écran.
// Lancer avec APP_URL=http://localhost:8371 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée. Le Direct
// hors événement (horloge avancée) est dans `appli-zz-horloge-direct.spec.ts`, qui passe en dernier.
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 20_000 });

for (const theme of THEMES) {
  test(`Événements : créer, brouillon avec ce qui manque, anciens derrière « … », duplication (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await toOrganizer(page, "MéditeSportCar");
    await tab(page, "Événements");

    // Le grand titre, l'unique bouton principal, les deux segments.
    await expect(page.getByRole("heading", { name: "Événements", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("orga-create-event")).toBeVisible();
    await expect(page.getByText(/^En cours · \d+$/)).toBeVisible();
    await expect(page.getByText(/^Brouillons · \d+$/)).toBeVisible();
    // Une carte publiée : statut « Publié · J-N » ou date, et les trois compteurs.
    const card = page.getByTestId("orga-event-row").filter({ hasText: "Nocturne de Canet" }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/^Publié · /)).toBeVisible();
    await expect(card.getByText("candidatures", { exact: true })).toBeVisible();
    await expect(card.getByText("retenues", { exact: true })).toBeVisible();
    await expect(card.getByText("à trier", { exact: true })).toBeVisible();
    // Chaque carte porte sa vignette : l'affiche générée ou le gabarit « Minimal ».
    await expect(card.getByTestId("orga-event-thumb")).toBeVisible();
    await rules(page, theme, "Événements");
    await shot(page, "evenements", theme);

    // Le brouillon dit ce qui manque.
    await page.getByText(/^Brouillons · \d+$/).click();
    const draft = page.getByTestId("orga-event-draft").filter({ hasText: "Expo de printemps" });
    await expect(draft).toBeVisible();
    await expect(draft.getByTestId("orga-draft-missing")).toHaveText("Il manque : adresse, affiche.", {
      timeout: 30_000,
    });
    await expect(draft.getByTestId("orga-draft-resume")).toBeVisible();
    await rules(page, theme, "Événements · brouillons");
    await shot(page, "evenements-brouillons", theme);

    // « … » : les anciens événements, avec « Dupliquer ».
    await page.getByTestId("orga-events-more").click();
    await expect(page.getByText("Anciens événements", { exact: true })).toBeVisible();
    const older = page.getByTestId("orga-older-row").filter({ hasText: "Béziers Night" });
    await expect(older).toBeVisible();
    await expect(older.getByTestId("orga-older-duplicate")).toBeVisible();
    await shot(page, "evenements-anciens", theme);

    // La duplication (une seule fois, dans le premier thème) arrive sur la page de la copie, qui explique l'invitation.
    if (theme === "beton") {
      await older.getByTestId("orga-older-duplicate").click();
      await expect(page).toHaveURL(/\/evenement\//, { timeout: 60_000 });
      await expect(page.getByTestId("orga-reinvite")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Inviter les retenus de l'édition précédente", { exact: true })).toBeVisible();
      await shot(page, "evenements-copie", theme);
    }
    await ctx.close();
  });

  test(`Tri : grande photo, note d'arrivée, segments, Prestataires par mission avec emplacement, Presse (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    // La note d'arrivée de la première candidature à trier de la Nocturne de Canet (le seed la place sur d'autres).
    await sql(
      `update applications set arrival_note = $1 where id = (
         select a.id from applications a join events e on e.id = a.event_id
         where e.slug = 'nocturne-de-canet-2026' and a.kind = 'vehicle' and a.status = 'pending'
         order by a.created_at asc limit 1)`,
      ["J'arriverai vers 19 h 30 à cause du travail."],
    );
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await toOrganizer(page, "MéditeSportCar");
    await tab(page, "Tri");
    const pick = async (title: string) => {
      await page.getByTestId("triage-event-picker").click();
      await page.getByTestId("triage-event-choice").filter({ hasText: title }).click();
      await expect(page.getByTestId("triage-counters")).toBeVisible({ timeout: 30_000 });
    };
    await pick("Nocturne de Canet");

    // Les segments du prototype.
    for (const label of ["Candidatures", "Liste d'attente", "En liste"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/^Prestataires/).first()).toBeVisible();
    await expect(page.getByText("Presse", { exact: true }).first()).toBeVisible();
    // Grande photo, nom en entier, note de l'exposant visible avant de décider.
    await expect(page.getByTestId("triage-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("triage-vehicle").first()).toBeVisible();
    await expect(page.getByTestId("triage-arrival-note")).toContainText("J'arriverai vers 19 h 30", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("triage-accept")).toBeVisible();
    await expect(page.getByTestId("triage-waitlist")).toBeVisible();
    await expect(page.getByTestId("triage-refuse")).toBeVisible();
    await rules(page, theme, "Tri");
    await shot(page, "tri", theme);

    // Prestataires par mission, à l'Expo Rivesaltes : « Food truck · 1 place sur 2 ».
    await pick("Expo Rivesaltes");
    await page
      .getByText(/^Prestataires/)
      .first()
      .click();
    const missions = page.getByTestId("triage-missions");
    await expect(missions).toContainText("Food truck · 1 place sur 2", { timeout: 30_000 });
    await expect(page.getByTestId("triage-card")).toBeVisible({ timeout: 30_000 });
    await rules(page, theme, "Tri · Prestataires");
    await shot(page, "tri-prestataires", theme);

    // L'emplacement d'un prestataire retenu (Nocturne de Canet : La Brasa, B2) s'attribue puis se rétablit.
    await pick("Nocturne de Canet");
    await page
      .getByText(/^Prestataires/)
      .first()
      .click();
    await page.getByTestId("triage-spots-open").click();
    const row = page.getByTestId("triage-spot-row").filter({ hasText: "La Brasa" });
    await expect(row).toContainText("Emplacement B2", { timeout: 30_000 });
    await row.getByTestId("triage-spot-edit").click();
    await page.getByTestId("triage-spot-label").fill("C4");
    await page.getByTestId("triage-spot-save").click();
    await expect(page.getByText("Emplacement enregistré.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("triage-spot-row").filter({ hasText: "La Brasa" })).toContainText("Emplacement C4");
    await shot(page, "tri-emplacement", theme);
    await page.getByTestId("triage-spot-row").filter({ hasText: "La Brasa" }).getByTestId("triage-spot-edit").click();
    await page.getByTestId("triage-spot-label").fill("B2");
    await page.getByTestId("triage-spot-save").click();
    await expect(page.getByTestId("triage-spot-row").filter({ hasText: "La Brasa" })).toContainText("Emplacement B2", {
      timeout: 30_000,
    });
    await closeSheet(page);

    // Presse : l'accréditation de Sud Cars au C&C Perpignan, avec ses deux choix (aucune décision prise ici).
    await pick("C&C Perpignan");
    await page.getByText("Presse", { exact: true }).first().click();
    const press = page.getByTestId("triage-press-card").filter({ hasText: "Sud Cars" });
    await expect(press).toBeVisible({ timeout: 30_000 });
    await expect(press.getByTestId("triage-press-accept")).toBeVisible();
    await expect(press.getByTestId("triage-press-refuse")).toBeVisible();
    await rules(page, theme, "Tri · Presse");
    await shot(page, "tri-presse", theme);
    await press.getByTestId("triage-press-refuse").click();
    await expect(page.getByText("Motif du refus", { exact: false }).first()).toBeVisible();
    await closeSheet(page);
    await ctx.close();
  });

  test(`Direct : le jour J puis les cinq onglets gardent leur barre (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await toOrganizer(page, "MéditeSportCar");
    await expect(page.getByRole("tab")).toHaveCount(5, { timeout: 30_000 });
    // L'onglet central est le Direct (le O) : il a son grand titre et ses compteurs ou le prochain événement.
    await expect(page.getByRole("heading", { name: "Direct", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("topbar-logo").first()).toBeVisible();
    await expect(page.getByTestId("orga-direct-counters").or(page.getByTestId("orga-direct-next"))).toBeVisible({
      timeout: 30_000,
    });
    await rules(page, theme, "Direct");
    await shot(page, "direct", theme);
    await ctx.close();
  });

  test(`Équipe : bulles de tailles différentes, historique et actions, rôles par événement (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await toOrganizer(page, "MéditeSportCar");
    await tab(page, "Équipe");
    await expect(page.getByRole("heading", { name: "L'équipe", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("team-bubbles-hint")).toContainText(
      "La taille d'une bulle suit le nombre d'événements tenus",
    );
    const bubbles = page.getByTestId("team-bubble");
    await expect(bubbles.first()).toBeVisible({ timeout: 30_000 });

    // Julie (au moins 3 événements tenus) est plus grande que Marc (1) : la taille suit l'engagement.
    const size = async (pseudo: string) => {
      const box = await page
        .getByRole("button", { name: new RegExp(`^${pseudo}, \\d+ événements? tenus?`) })
        .first()
        .boundingBox();
      if (!box) throw new Error(`${pseudo} : bulle introuvable`);
      return box.width;
    };
    const julie = await size("Julie_66");
    const theo = await size("Theo_66");
    const marc = await size("Marc_66");
    expect(julie, "Julie plus grande que Marc").toBeGreaterThan(marc);
    expect(julie).toBeGreaterThanOrEqual(theo);
    expect(theo).toBeGreaterThanOrEqual(marc);
    expect(marc).toBeGreaterThanOrEqual(36); // Lot C4a : bulles de 36 à 96 px (artefact `s-ostaff`).
    expect(julie).toBeLessThanOrEqual(96);
    await rules(page, theme, "Équipe");
    await shot(page, "equipe", theme);

    // Un toucher : historique et actions.
    await page
      .getByRole("button", { name: /^Julie_66, / })
      .first()
      .click();
    await expect(page.getByText("Historique", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("team-history-row").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("team-give-role")).toBeVisible();
    await shot(page, "equipe-bulle", theme);
    await closeSheet(page);

    // Les rôles de l'événement : quatre rôles, ce que chacun permet (lot 48 : seuls certains rôles pointent).
    const scan = page.getByTestId("team-role-scan");
    await scan.scrollIntoViewIfNeeded();
    await expect(scan).toContainText("Accueil et scan");
    await expect(scan).toContainText("Pointe les entrées");
    await expect(page.getByTestId("team-role-placement")).toContainText("Ne pointe pas les entrées");
    await expect(page.getByTestId("team-role-shop")).toContainText("Contrôle des billets");
    await expect(page.getByTestId("team-role-filtering")).toContainText("Filtration");
    await shot(page, "equipe-roles", theme);

    // Donner puis retirer un rôle d'un toucher (Placement au premier membre qui ne l'a pas).
    await page.getByTestId("team-role-add-placement").click();
    const candidate = page.getByTestId("team-role-candidate").first();
    await expect(candidate).toBeVisible({ timeout: 30_000 });
    const pseudo = (await candidate.getByText(/_\d+$/).first().textContent()) ?? "";
    await candidate.getByTestId("team-role-give").click();
    await expect(page.getByText("Rôle donné.")).toBeVisible({ timeout: 30_000 });
    const holder = page
      .getByTestId("team-role-placement")
      .getByRole("button", { name: new RegExp(`^Retirer Placement à ${pseudo}`) });
    await expect(holder).toBeVisible({ timeout: 30_000 });
    await holder.click();
    await expect(page.getByText("Rôle retiré.")).toBeVisible({ timeout: 30_000 });
    // Le retrait s'annule quelques secondes : on le rétablit puis on le retire pour de bon.
    await page.getByTestId("team-role-undo").click();
    await expect(page.getByText("Rôle rétabli.")).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .getByTestId("team-role-placement")
        .getByRole("button", { name: new RegExp(`^Retirer Placement à ${pseudo}`) }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByTestId("team-role-placement")
      .getByRole("button", { name: new RegExp(`^Retirer Placement à ${pseudo}`) })
      .click();
    await expect(page.getByText("Rôle retiré.")).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });

  test(`Structure : validée (sceau et pastille au O), tuiles ; en vérification (message clair) (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await toOrganizer(page, "MéditeSportCar");
    await tab(page, "Structure");
    await expect(page.getByRole("heading", { name: "Ma structure", exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("structure-validated")).toHaveText("Structure validée", { timeout: 30_000 });
    await expect(page.getByTestId("structure-seal")).toBeVisible();
    await expect(page.getByTestId("structure-o")).toBeVisible();
    for (const id of ["card", "logo", "followers", "partners", "bans", "payments", "verification", "invite", "help"]) {
      await expect(page.getByTestId(`tile-${id}`)).toBeVisible();
    }
    await rules(page, theme, "Structure");
    await shot(page, "structure", theme);

    // Le sceau tourne (deux relevés à une seconde d'écart) ; sans animations il reste immobile.
    const angle = () => page.getByTestId("structure-seal").evaluate((el) => getComputedStyle(el).transform);
    const first = await angle();
    await page.waitForTimeout(1500);
    expect(await angle(), "le sceau tourne").not.toBe(first);

    // Une tuile ouvre son volet sous la grille.
    await page.getByTestId("tile-card").click();
    await expect(page.getByTestId("panel-card")).toBeVisible();
    await expect(page.getByTestId("orga-structure-name")).toBeVisible();
    await shot(page, "structure-fiche", theme);
    await page.getByTestId("tile-payments").click();
    await expect(page.getByTestId("panel-payments")).toBeVisible();
    await page.getByTestId("tile-close").click();
    await ctx.close();

    // En vérification : le message clair remplace le badge, ni sceau ni pastille.
    const second = await open(browser, theme);
    await signIn(second.page, "pres_vallespir@orasso.local");
    await toOrganizer(second.page);
    await tab(second.page, "Structure");
    await expect(second.page.getByTestId("structure-pending")).toContainText("Vérification en cours", {
      timeout: 30_000,
    });
    await expect(second.page.getByTestId("structure-pending")).toContainText("Réponse sous 72 h");
    await expect(second.page.getByTestId("structure-pending")).toContainText("restent en brouillon");
    await expect(second.page.getByTestId("structure-seal")).toHaveCount(0);
    await expect(second.page.getByTestId("structure-o")).toHaveCount(0);
    await rules(second.page, theme, "Structure · en vérification");
    await shot(second.page, "structure-verification", theme);
    // Un brouillon complet de cette structure ne peut pas partir : il dit que la vérification manque (docs/01).
    const owner = await login("pres_vallespir@orasso.local");
    const mine = await apiCall<{ memberships: { structureId: string }[] }>(owner, "GET", "/me");
    const sid = mine.data.memberships[0]?.structureId ?? "";
    const known = await apiCall<{ title: string }[]>(owner, "GET", `/structures/${sid}/events`);
    if (!known.data.some((e) => e.title === "Balade du Vallespir")) {
      const start = new Date(Date.now() + 40 * 86_400_000);
      const made = await apiCall(owner, "POST", `/structures/${sid}/events`, {
        title: "Balade du Vallespir",
        format: "gathering",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 4 * 3_600_000).toISOString(),
        addressLine: "Place de la mairie",
        postalCode: "66110",
        city: "Amélie-les-Bains",
        department: "66",
        lat: 42.48,
        lng: 2.67,
        admittedVehicleTypes: ["car"],
        capacity: 30,
        maxVehiclesPerUser: 1,
        admission: "filtered",
        publicAccess: "free",
        registrationsOpenAt: new Date(Date.now() + 86_400_000).toISOString(),
        rulesText: "Respect des riverains.",
      });
      expect(made.status).toBe(201);
    }
    await tab(second.page, "Événements");
    await second.page.getByText(/^Brouillons · \d+$/).click();
    await expect(second.page.getByTestId("orga-draft-missing").first()).toContainText(
      "la vérification de ta structure",
      {
        timeout: 30_000,
      },
    );
    await shot(second.page, "evenements-brouillon-verification", theme);
    // Les tuiles réservées au propriétaire restent à lui : ici il l'est, la tuile Paiements est active.
    await expect(second.page.getByTestId("tile-payments")).toBeEnabled();
    await second.ctx.close();
  });
}

test("Structure : le sceau reste immobile quand les animations sont réduites", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "beton", "reduce");
  await signIn(page, "damien@orasso.local");
  await toOrganizer(page, "MéditeSportCar");
  await tab(page, "Structure");
  await expect(page.getByTestId("structure-seal")).toBeVisible({ timeout: 30_000 });
  const angle = () => page.getByTestId("structure-seal").evaluate((el) => getComputedStyle(el).transform);
  const first = await angle();
  await page.waitForTimeout(1500);
  expect(await angle()).toBe(first);
  await ctx.close();
});
