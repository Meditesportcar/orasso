import { mkdirSync, writeFileSync } from "node:fs";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  type Cookie,
  createEvent,
  decideApi,
  login,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  simulateSettle,
  unique,
} from "./helpers";

// Captures des écrans du site dans les deux thèmes et sur téléphone (390 px) : `CAPTURES=1 pnpm test:e2e captures`.
// Dossier : CAPTURES_DIR, ou celui du relais du chantier.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-07-captures";
test.skip(!process.env.CAPTURES, "Captures : lancer avec CAPTURES=1");

const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;

// Contrôle du système de design écran par écran (lot 12) : écrit dans audit.json à la fin.
const audits: Record<string, Audit> = {};

async function shot(page: Page, theme: string, view: string, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

async function themed(context: BrowserContext, theme: string, baseURL: string) {
  await context.addCookies([{ name: "orasso-theme", value: theme, url: baseURL }]);
}

test("captures du parcours", async ({ browser, baseURL }) => {
  mkdirSync(DIR, { recursive: true });
  test.setTimeout(600_000);
  const url = baseURL ?? "http://localhost:5173";
  const organizer = await login("damien@orasso.local");
  const julie = await login("julie@orasso.local");
  const suffix = unique();
  const make = async (pseudo: string) => {
    const cookie = await signUpApi(pseudo);
    return {
      pseudo,
      cookie,
      email: `${pseudo.toLowerCase()}@e2e.orasso.test`,
      vehicleId: await addVehicleApi(cookie, randomPlate()),
    };
  };

  // Le passionné des captures : retenu (QR), en liste d'attente avec offre, absent (malus), présent (points).
  const main = await make(`Kenji_${suffix}`);
  const e1 = await createEvent(organizer, { title: `Nocturne ${suffix}`, capacity: 5 });
  const app1 = await applyApi(main.cookie, e1.id, main.vehicleId);
  await decideApi(organizer, e1.id, app1, "accept");

  const e2 = await createEvent(organizer, { title: `Expo ${suffix}`, capacity: 1 });
  const other = await make(`Lea_${suffix}`);
  const otherApp = await applyApi(other.cookie, e2.id, other.vehicleId);
  await decideApi(organizer, e2.id, otherApp, "accept");
  const app2 = await applyApi(main.cookie, e2.id, main.vehicleId);
  await decideApi(organizer, e2.id, app2, "waitlist");
  await apiCall(other.cookie, "POST", `/applications/${otherApp}/withdraw`, {});

  const e3 = await createEvent(organizer, { title: `Rassemblement absent ${suffix}`, capacity: 5 });
  await decideApi(organizer, e3.id, await applyApi(main.cookie, e3.id, main.vehicleId), "accept");
  const e4 = await createEvent(organizer, { title: `Cars & coffee présent ${suffix}`, capacity: 5 });
  const app4 = await applyApi(main.cookie, e4.id, main.vehicleId);
  await decideApi(organizer, e4.id, app4, "accept");
  await apiCall(julie, "POST", `/events/${e4.id}/checkins`, { applicationId: app4, method: "manual" });
  simulateSettle(e3.slug);
  simulateSettle(e4.slug);

  // Tri, liste et jour J : un événement avec des candidatures de tous les statuts et des entrées.
  const e5 = await createEvent(organizer, { title: `Salon des préparations ${suffix}`, capacity: 6 });
  const crowd: { id: string; cookie: Cookie }[] = [];
  for (const name of ["Marc", "Nina", "Theo", "Julie", "Sarah", "Hugo", "Ines", "Yann"]) {
    const f = await make(`${name}_${suffix}`);
    crowd.push({ id: await applyApi(f.cookie, e5.id, f.vehicleId), cookie: f.cookie });
  }
  await decideApi(organizer, e5.id, crowd[0]?.id ?? "", "accept");
  await decideApi(organizer, e5.id, crowd[1]?.id ?? "", "accept");
  await decideApi(organizer, e5.id, crowd[2]?.id ?? "", "waitlist");
  await decideApi(organizer, e5.id, crowd[3]?.id ?? "", "refuse");
  await apiCall(julie, "POST", `/events/${e5.id}/checkins`, { applicationId: crowd[0]?.id, method: "manual" });
  const hold = await make(`Cap_${suffix}`);
  await applyApi(hold.cookie, e1.id, hold.vehicleId);

  // Avis (lot 12) : un événement passé avec trois avis (moyenne affichée) et une réponse de l'organisateur.
  const e6 = await createEvent(organizer, { title: `Nocturne avis ${suffix}`, capacity: 6 });
  const reviewers = [main, await make(`Avis1_${suffix}`), await make(`Avis2_${suffix}`)];
  const reviewApps: string[] = [];
  for (const r of reviewers) {
    const id = await applyApi(r.cookie, e6.id, r.vehicleId);
    await decideApi(organizer, e6.id, id, "accept");
    await apiCall(julie, "POST", `/events/${e6.id}/checkins`, { applicationId: id, method: "manual" });
    reviewApps.push(id);
  }
  simulateSettle(e6.slug);
  const comments = [
    "Accueil au top, parking bien rangé, ambiance détendue.",
    "Belle soirée, un peu d'attente à l'entrée.",
    "Super lieu, on revient l'an prochain.",
  ];
  for (const [i, r] of reviewers.entries()) {
    await apiCall(r.cookie, "POST", `/applications/${reviewApps[i]}/review`, {
      rating: [3, 2, 3][i],
      comment: comments[i],
    });
  }
  const orgaReviews = await apiCall<{ items: { id: string; pseudo: string }[] }>(
    organizer,
    "GET",
    `/events/${e6.id}/reviews`,
  );
  const toReply = orgaReviews.data.items.find((r) => r.pseudo === reviewers[1]?.pseudo);
  await apiCall(organizer, "PUT", `/reviews/${toReply?.id}/reply`, {
    reply: "Merci ! Deux files à l'entrée la prochaine fois.",
  });

  for (const theme of THEMES) {
    for (const view of VIEWS) {
      const size = { width: view.width, height: view.height };
      // --- Visiteur ---
      const visitor = await browser.newContext({ viewport: size });
      await themed(visitor, theme, url);
      const v = await visitor.newPage();
      await v.goto(`/e/${e1.slug}`);
      await shot(v, theme, view.id, "01-evenement-visiteur");
      await v.goto("/connexion");
      await shot(v, theme, view.id, "02-connexion");
      await v.goto("/inscription");
      await shot(v, theme, view.id, "03-inscription");
      await visitor.close();

      // --- Passionné ---
      const fan = await browser.newContext({ viewport: size });
      await themed(fan, theme, url);
      const p = await fan.newPage();
      await loginInBrowser(p, main.email, SEED_PASSWORD, "/app");
      await shot(p, theme, view.id, "04-app-accueil");
      await p.goto(`/e/${e1.slug}`);
      await shot(p, theme, view.id, "05-evenement-candidat");
      await p.goto("/app/acces");
      await expect(p.getByTestId("pass-qr")).toBeVisible();
      await shot(p, theme, view.id, "06-acces-qr-offre");
      await p.goto("/app/acces?vue=passes");
      await shot(p, theme, view.id, "07-acces-carnet-de-route");
      await p.goto("/app/garage");
      await shot(p, theme, view.id, "08-garage");
      await p.goto("/app/garage/nouveau");
      await shot(p, theme, view.id, "09-garage-ajout");
      await p.goto(`/e/${e5.slug}/candidater`);
      await shot(p, theme, view.id, "10-candidature-1-vehicule");
      await p.getByRole("checkbox").first().check();
      await p.getByRole("button", { name: "Continuer" }).click();
      await shot(p, theme, view.id, "11-candidature-2-reglement");
      await p.getByLabel("J'ai lu le règlement").check();
      await p.getByRole("button", { name: "Continuer" }).click();
      await shot(p, theme, view.id, "12-candidature-3-envoi");
      await fan.close();

      // --- Organisateur (Sable imposé : capturé avec la préférence du moment, il reste Sable) ---
      const org = await browser.newContext({ viewport: size });
      await themed(org, theme, url);
      const o = await org.newPage();
      await loginInBrowser(o, "damien@orasso.local", SEED_PASSWORD, "/app");
      await o.goto("/orga/meditesportcar");
      await shot(o, theme, view.id, "13-orga-evenements");
      await o.goto(`/orga/meditesportcar/e/${e5.id}/candidatures`);
      await expect(o.getByTestId("triage-card")).toBeVisible();
      await shot(o, theme, view.id, "14-orga-tri-file");
      await expect(o.getByTestId("counters")).toHaveAttribute("data-live", "on");
      await o.keyboard.press("r");
      await shot(o, theme, view.id, "15-orga-tri-motifs");
      await o.goto(`/orga/meditesportcar/e/${e5.id}/candidatures?vue=liste`);
      await shot(o, theme, view.id, "16-orga-vue-liste");
      await o.goto(`/orga/meditesportcar/e/${e5.id}/candidatures?vue=attente`);
      await shot(o, theme, view.id, "17-orga-liste-attente");
      await o.goto(`/orga/meditesportcar/e/${e5.id}/jour-j`);
      await shot(o, theme, view.id, "18-orga-jour-j");
      await o.goto(`/orga/meditesportcar/e/${e6.id}/jour-j`);
      await expect(o.getByTestId("orga-reviews")).toBeVisible();
      await shot(o, theme, view.id, "20-orga-apres-avis");
      await org.close();

      // --- Avis : page publique après l'événement ---
      const after = await browser.newContext({ viewport: size });
      await themed(after, theme, url);
      const a = await after.newPage();
      await a.goto(`/e/${e6.slug}`);
      await expect(a.getByTestId("reviews-average")).toBeVisible();
      await shot(a, theme, view.id, "19-evenement-avis");
      await after.close();
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
});
