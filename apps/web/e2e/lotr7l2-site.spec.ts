import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme } from "./helpers";
import { cars, cleanVotes, createHandVote, draftEvent, dropDraft, lydia, manage } from "./helpers/lotr7l2";

// Lot R7l2, site : les votes à thème côté organisateur et staff.
//  - l'éditeur passe à neuf étapes : « Votes du public » (après « Règlement ») ; « Toutes catégories » est là d'office, se
//    retire (sans voix) et se remet par « Ajouter » avec son modèle ; un vote à la main se crée (jamais « au premier
//    pointage ») ; un brouillon d'avant (huit étapes) reste ouvrable ;
//  - l'écran « Votes » du Direct : état de chaque vote, « Lancer le vote » refusé tant qu'il n'y a pas deux candidats entrés,
//    candidats par la recherche (une voiture pas encore entrée est marquée), Lancer, Clore (avec confirmation) ;
//  - le staff lit la liste sans aucun bouton, et l'API lui refuse les écritures.
// API et site lancés sur la base seedée (événement en cours « Rassemblement du Lydia »).
test.use({ locale: "fr-FR", timezoneId: "Europe/Paris" });
test.setTimeout(240_000);

const TITLE = "Recette R7l2 site";

test("éditeur : étape Votes (neuf étapes), Toutes catégories retiré puis remis, vote à la main, brouillon d'avant ouvrable", async ({
  page,
}) => {
  const draft = await draftEvent(`${TITLE} éditeur ${Date.now().toString(36)}`);
  try {
    await setTheme(page, "sable");
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
    const edit = `/orga/${draft.structureSlug}/e/${draft.id}/modifier`;

    // Un brouillon mémorisé à huit étapes (index 6 = « affiche » dans l'ancien découpage) s'ouvre sans erreur, au temps
    // calculé (jamais sur « Votes » par un décalage d'index), avec sa saisie.
    await page.goto(edit);
    await page.evaluate((id) => {
      localStorage.setItem(
        `orasso-wizard-memo:${id}`,
        JSON.stringify({ v: 1, steps: 8, reached: 6, recurrence: null }),
      );
    }, draft.id);
    await page.goto(edit);
    await expect(page.getByTestId("event-wizard")).toBeVisible();
    await expect(page.getByTestId("wizard-step")).toContainText("sur 9");
    await expect(page.getByTestId("wizard-step")).not.toContainText("Votes");

    await page.goto(`${edit}?temps=votes`);
    await expect(page.getByTestId("wizard-step")).toContainText("Étape 7 sur 9 · Votes");
    const votes = page.getByTestId("wizard-votes");
    await expect(votes).toBeVisible();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("1 vote prévu");
    const start = await manage(draft.id, "damien@orasso.local");
    const all = start.items.find((v) => v.kind === "all_categories");
    expect(all?.rareStamp).toBe(true);
    await expect(page.getByTestId(`wizard-vote-${all?.id}`)).toContainText("Toutes catégories");

    // Retiré (sans voix), puis remis par « Ajouter » : le modèle « Toutes catégories » est en tête des modèles.
    await page.getByTestId(`wizard-vote-menu-${all?.id}`).click();
    await page.getByTestId(`wizard-vote-remove-${all?.id}`).click();
    await page.getByTestId("wizard-vote-remove-yes").click();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("Aucun vote prévu");
    await page.getByTestId("wizard-vote-add").click();
    await expect(page.getByTestId("vote-form")).toBeVisible();
    await page.getByTestId("vote-templates").getByRole("button", { name: "Toutes catégories" }).click();
    await page.getByTestId("vote-form-submit").click();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("1 vote prévu");
    const back = await manage(draft.id, "damien@orasso.local");
    expect(back.items.map((v) => v.id)).toEqual([all?.id]);
    expect(back.items[0]?.rareStamp).toBe(true);

    // Un vote à la main : « Concours de rupteur » (jamais « dès les premières entrées »), 30 minutes.
    await page.getByTestId("wizard-vote-add").click();
    await page.getByTestId("vote-templates").getByRole("button", { name: "Concours de rupteur" }).click();
    await expect(page.getByTestId("vote-mode-hand")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("vote-open-mode-first_entry")).toHaveCount(0);
    await page.getByTestId("vote-form-duration").getByRole("button", { name: "30 min" }).click();
    await page.getByTestId("vote-form-submit").click();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("2 votes prévus");
    const two = await manage(draft.id, "damien@orasso.local");
    const hand = two.items.find((v) => v.title === "Concours de rupteur");
    expect(hand).toMatchObject({ openMode: "manual", durationMinutes: 30, kind: "theme" });

    // Un titre vide ou une origine sans choix ne s'enregistre pas, et le dit.
    await page.getByTestId("wizard-vote-add").click();
    await expect(page.getByTestId("vote-form-problem")).toContainText("titre");
    await expect(page.getByTestId("vote-form-submit")).toBeDisabled();
    await page.getByTestId("vote-form-title").fill("Plus belle fantaisie");
    await page.getByTestId("vote-mode-origins").click();
    await expect(page.getByTestId("vote-form-problem")).toContainText("origine");
    await page.getByTestId("vote-form-close").click();

    // Un brouillon ne lance pas : l'API le refuse, l'étape ne montre aucun « Lancer ».
    const owner = await login("damien@orasso.local");
    const refused = await apiCall<{ error: { code: string } }>(
      owner,
      "POST",
      `/events/${draft.id}/votes/${hand?.id}/open`,
    );
    expect(refused.status).toBe(409);
    expect(refused.data.error.code).toBe("event_not_published");
    await expect(page.getByTestId("votes-screen")).toHaveCount(0);
    await page.screenshot({ path: "test-results/r7l2-site-etape-votes.png", fullPage: true });
  } finally {
    await dropDraft(draft.id);
  }
});

test("Direct : Lancer refusé sans deux candidats entrés, candidats par la recherche, Lancer, Clore ; le staff lit sans bouton", async ({
  page,
  browser,
}) => {
  const ev = await lydia();
  const stamp = Date.now().toString(36);
  const title = `${TITLE} ${stamp}`;
  const { entered, outside } = await cars(ev.id);
  test.skip(entered.length < 2, "Le Lydia n'a pas deux voitures entrées (lancer pnpm db:seed).");
  const voteId = await createHandVote(ev.id, title);
  try {
    await setTheme(page, "sable");
    await loginInBrowser(page, "sarah@orasso.local", undefined, "/app");
    const base = `/orga/${ev.structure.slug}/e/${ev.id}`;

    // Le lien « Votes » depuis la fiche et depuis le Jour J.
    await page.goto(base);
    await expect(page.getByTestId("orga-votes-link")).toHaveAttribute("href", `${base}/votes`);
    await page.goto(`${base}/jour-j`);
    await expect(page.getByTestId("jourj-votes-link")).toHaveAttribute("href", `${base}/votes`);
    await page.getByTestId("jourj-votes-link").click();
    await expect(page.getByTestId("votes-screen")).toBeVisible();

    // « Toutes catégories » ouvert, le vote de recette prévu : sans candidat, « Lancer » dit pourquoi et reste inactif.
    const card = page.getByTestId(`vote-card-${voteId}`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId(`vote-status-${voteId}`)).toContainText("À lancer");
    await expect(page.getByTestId(`vote-launch-${voteId}`)).toBeDisabled();
    await expect(card).toContainText("deux candidats entrés");
    const list = await manage(ev.id);
    const allCat = list.items.find((v) => v.kind === "all_categories");
    await expect(page.getByTestId(`vote-status-${allCat?.id}`)).toContainText(/Ouvert · \d+ voix · ferme/);

    // Candidats par la recherche : deux voitures entrées, puis une retenue pas encore entrée (marquée).
    await page.getByTestId(`vote-open-${voteId}`).click();
    for (const car of entered.slice(0, 2)) {
      await page.getByTestId("vote-search").fill(car.pseudo);
      await page.getByTestId(`vote-hit-add-${car.applicationId}`).click();
      await expect(page.getByTestId(`vote-candidate-${car.applicationId}`)).toContainText("entrée");
    }
    if (outside) {
      await page.getByTestId("vote-search").fill(outside.item.pseudo);
      await page.getByTestId(`vote-hit-add-${outside.item.applicationId}`).click();
      await expect(page.getByTestId(`vote-candidate-${outside.item.applicationId}`)).toContainText("pas encore entrée");
    }
    await page.getByTestId("vote-search").fill("");
    await expect(page.getByTestId("vote-candidates-count")).toContainText(
      /\d+ entrées sur \d+|2 voitures, toutes entrées/,
    );
    const hand = (await manage(ev.id)).items.find((v) => v.id === voteId);
    expect(hand?.handCandidates?.every((c) => c.source === "hand")).toBe(true);

    // Un autre onglet (le staff) ne voit aucun bouton, et l'API lui refuse Lancer.
    const ctx = await browser.newContext({ locale: "fr-FR", timezoneId: "Europe/Paris" });
    const staff = await ctx.newPage();
    await loginInBrowser(staff, "damien@orasso.local", undefined, "/app");
    await staff.goto(`${base}/votes`);
    await expect(staff.getByTestId("votes-screen")).toBeVisible();
    await expect(staff.getByTestId(`vote-card-${voteId}`)).toBeVisible();
    await expect(staff.locator("[data-testid^=vote-launch-]")).toHaveCount(0);
    await expect(staff.locator("[data-testid^=vote-close-]")).toHaveCount(0);
    await expect(staff.locator("[data-testid^=vote-remove-]")).toHaveCount(0);
    await expect(staff.getByTestId("votes-add")).toHaveCount(0);
    await expect(staff.getByText("en lecture seule")).toBeVisible();
    const staffCookie = await login("damien@orasso.local");
    for (const [method, path] of [
      ["POST", `/events/${ev.id}/votes/${voteId}/open`],
      ["POST", `/events/${ev.id}/votes/${voteId}/close`],
      ["DELETE", `/events/${ev.id}/votes/${voteId}`],
    ] as const) {
      expect((await apiCall(staffCookie, method, path)).status).toBe(403);
    }
    await ctx.close();

    // Lancer (avec confirmation), puis Clore.
    await page.goto(`${base}/votes`);
    await expect(page.getByTestId(`vote-launch-${voteId}`)).toBeEnabled();
    await page.getByTestId(`vote-launch-${voteId}`).click();
    await expect(page.getByTestId("vote-confirm")).toContainText("Lancer");
    await page.getByTestId("vote-confirm-yes").click();
    await expect(page.getByTestId("votes-notice")).toContainText("Vote lancé");
    await expect(page.getByTestId(`vote-status-${voteId}`)).toContainText(/Ouvert · 0 voix · ferme/);
    await expect(page.getByTestId(`vote-launch-${voteId}`)).toHaveCount(0);
    // Ouvert : ses candidats ne changent plus (plus de recherche).
    await page.getByTestId(`vote-open-${voteId}`).click();
    await expect(page.getByTestId("vote-search")).toHaveCount(0);
    await page.screenshot({ path: "test-results/r7l2-site-votes-ouvert.png", fullPage: true });
    await page.getByTestId(`vote-close-${voteId}`).click();
    await page.getByTestId("vote-confirm-yes").click();
    await expect(page.getByTestId(`vote-status-${voteId}`)).toContainText("Clos · 0 voix");
  } finally {
    await cleanVotes(ev.id, TITLE);
  }
});
