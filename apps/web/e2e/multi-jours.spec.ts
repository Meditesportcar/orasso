import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { addVehicleApi, apiCall, login, randomPlate, signUpApi, unique } from "./helpers";

// Événements sur plusieurs jours (lot 26) sur le site : l'organisateur crée un événement de trois jours dans
// l'assistant (« Plusieurs jours », horaires, places d'un jour, accès au choix) ; la page publique montre les jours ;
// un passionné candidate pour le jour 2 (choix du jour), sa carte Accès porte le jour ; le tri a la colonne et le filtre
// « Jour » ; le jour J a son sélecteur de jour. Avec CAPTURES=1 : captures Béton / Sable, bureau et 390 px, audit du
// système de design. Prérequis : site et API lancés (DEV_SKIP_2FA=true) sur la base avec le seed.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-26-captures/site";
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;

async function context(browser: Browser, cookie: string, opts: { theme?: string; width?: number; height?: number } = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: opts.theme ?? "beton", url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

/** Date de Paris dans `n` jours, `AAAA-MM-JJ`. */
const parisDay = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now() + n * 86_400_000));

test("plusieurs jours : assistant, page publique, candidature pour un jour, Accès, tri et jour J", async ({ browser }) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  const title = `Salon E2E ${unique()}`;

  // --- 1. Assistant : « Plusieurs jours », trois jours, places du jour 2, accès au choix -----------------------------
  const orgaCtx = await context(browser, damien, { theme: "sable" });
  const o = await orgaCtx.newPage();
  await o.goto("/orga/meditesportcar/nouvel-evenement");
  await o.waitForLoadState("networkidle");
  await o.getByRole("button", { name: "Salon", exact: true }).click();
  await o.getByLabel("Titre").fill(title);
  await o.getByLabel("Plusieurs jours").check({ force: true });
  const days = o.getByTestId("wizard-days");
  await expect(days.getByLabel("Date")).toHaveCount(2);
  await o.getByRole("button", { name: "Ajouter un jour" }).click();
  await expect(days.getByLabel("Date")).toHaveCount(3);
  for (const [i, n] of [10, 11, 12].entries()) {
    await days.getByLabel("Date").nth(i).fill(parisDay(n));
    await days.getByLabel("Début").nth(i).fill("09:00");
    await days.getByLabel("Fin").nth(i).fill("18:00");
  }
  await days.getByLabel("Places ce jour (facultatif)").nth(1).fill("2");
  await o.getByRole("button", { name: "Au choix : tout l'événement ou un jour" }).click();
  await o.getByLabel("Ville").fill("Perpignan");
  await o.getByLabel("Code postal").fill("66000");
  for (let i = 0; i < 11; i++) await o.getByRole("button", { name: "Suivant" }).click();
  await expect(o.getByTestId("wizard-step")).toContainText("Billetterie");
  await o.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await o.waitForURL(/\/orga\/meditesportcar\/e\/[0-9a-f-]{36}/);
  const eventId = /\/e\/([0-9a-f-]{36})/.exec(o.url())?.[1] ?? "";
  const saved = await apiCall<{ days: { id: string; date: string; capacity: number | null }[]; dayAccess: string; slug: string }>(
    damien,
    "GET",
    `/events/${eventId}`,
  );
  expect(saved.data.days.map((d) => d.date)).toEqual([parisDay(10), parisDay(11), parisDay(12)]);
  expect(saved.data.days.map((d) => d.capacity)).toEqual([null, 2, null]);
  expect(saved.data.dayAccess).toBe("both");
  expect((await apiCall(damien, "POST", `/events/${eventId}/publish`)).status).toBe(200);
  const slug = saved.data.slug;
  const day2 = saved.data.days[1]?.id ?? "";

  // --- 2. Page publique : les jours, les places du jour ----------------------------------------------------------------
  const s = unique();
  const pseudo = `Jour_${s}`.slice(0, 24);
  const passion = await signUpApi(pseudo);
  await addVehicleApi(passion, randomPlate());
  const pCtx = await context(browser, passion);
  const p = await pCtx.newPage();
  await p.goto(`/e/${slug}`);
  const list = p.getByTestId("event-days");
  await expect(list).toBeVisible();
  await expect(list.locator("li")).toHaveCount(3);
  await expect(list).toContainText("2 places");

  // --- 3. Candidater pour le jour 2 -------------------------------------------------------------------------------------
  await p.goto(`/e/${slug}/candidater?jour=${day2}`);
  await p.waitForLoadState("networkidle");
  const choice = p.getByTestId("day-choice");
  await expect(choice.getByRole("button", { name: "Tout l'événement" })).toBeVisible();
  await choice.getByRole("button", { name: new RegExp(dayName(parisDay(11))) }).click();
  await p.getByRole("button", { name: "Continuer" }).click();
  await p.getByLabel("J'ai lu le règlement de l'événement et je l'accepte.").check({ force: true });
  await p.getByRole("button", { name: "Continuer" }).click();
  await p.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await p.waitForURL(/\/app\/acces/);
  await expect(p.getByTestId("application-day").first()).toContainText(dayName(parisDay(11)));
  const mine = await apiCall<{ id: string; day: { id: string } | null }[]>(passion, "GET", "/me/applications");
  const app = mine.data.find((a) => a.day?.id === day2);
  expect(app).toBeTruthy();

  // --- 4. Tri : colonne et filtre du jour ; jour J : sélecteur de jour --------------------------------------------------
  await o.goto(`/orga/meditesportcar/e/${eventId}/candidatures?vue=liste&dayId=${day2}`);
  await expect(o.getByTestId("triage-row-day").first()).toContainText(dayName(parisDay(11), false));
  await expect(o.getByTestId("triage-row")).toHaveCount(1);
  await o.goto(`/orga/meditesportcar/e/${eventId}/jour-j?jour=${day2}`);
  await expect(o.getByTestId("jourj-days")).toBeVisible();
  await expect(o.getByTestId("jourj-days").getByRole("link")).toHaveCount(4);

  // --- 5. Captures et audit du système de design ------------------------------------------------------------------------
  if (process.env.CAPTURES === "1") {
    mkdirSync(DIR, { recursive: true });
    const audits: Record<string, Audit> = {};
    const shots: [string, string, string][] = [
      ["page-evenement", passion, `/e/${slug}`],
      ["candidater-jour", passion, `/e/${slug}/candidater?jour=${day2}`],
      ["acces", passion, "/app/acces"],
      ["assistant", damien, `/orga/meditesportcar/e/${eventId}/modifier`],
      ["tri-liste", damien, `/orga/meditesportcar/e/${eventId}/candidatures?vue=liste`],
      ["jour-j", damien, `/orga/meditesportcar/e/${eventId}/jour-j?jour=${day2}`],
    ];
    for (const theme of THEMES) {
      for (const view of VIEWS) {
        for (const [name, cookie, path] of shots) {
          const ctx = await context(browser, cookie, { theme, width: view.width, height: view.height });
          const page: Page = await ctx.newPage();
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          const key = `${name}-${theme}-${view.id}`;
          await page.screenshot({ path: `${DIR}/${key}.png`, fullPage: true });
          audits[key] = await auditPage(page);
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
  await pCtx.close();
  await orgaCtx.close();
});

/** « jeudi 27 octobre » (ou « 27 octobre ») comme les écrans, pour retrouver un jour. */
function dayName(date: string, weekday = true): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    ...(weekday ? { weekday: "long" } : {}),
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
