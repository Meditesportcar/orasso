import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { type SpotMeetupView, wallTime } from "@orasso/shared";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7i : captures avant / après des écrans touchés par « Rendez-vous au spot » (Accueil, Fil, onglet Spots du crew, page du
// crew), et, après le lot, les six démos de la maquette R7.9 `p-spot` (jour / soir × lancer, reçu, après). À lancer sur la
// branche telle que reçue (`CAPTURES_DIR` = …/lot-r7i-captures/avant) puis après le lot (…/apres). Damien_66 (Accueil, Fil),
// Kenji (chef du crew « Roussillon Drift » : onglet Spots). Appli à 384 px (police 1 et 1,3, Pixel de Damien) et 390 px
// (police 1), site à 390 et 1 280 px, Béton et Sable. Seulement des captures : les règles se vérifient dans `appli-lotr7i` et
// `lotr7i-site`. Après : l'horloge simulée sert aux deux moments (demain 10 h, puis demain 20 h) et revient à l'heure réelle.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7i-captures/apres`;
const AFTER = !(process.env.CAPTURES_DIR ?? "").includes("avant");
const ONLY = process.env.ONLY ?? "";
test.use({ actionTimeout: 30_000 });
const apiDir = resolve(import.meta.dirname, "../../api");
const clock = (...args: string[]) =>
  execFileSync(process.execPath, ["--import", "tsx", "scripts/dev-clock.ts", ...args], {
    cwd: apiDir,
    stdio: "pipe",
    timeout: 120_000,
  });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, email: string, theme: string, width: number, scale: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (s > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
      else localStorage.removeItem("orasso.recette.echellePolice");
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  const dismiss = page.getByTestId("whatsnew-dismiss");
  await dismiss.click({ timeout: 3_000 }).catch(() => undefined);
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await page.waitForTimeout(1_500);
}

async function tap(page: Page, id: string): Promise<boolean> {
  const el = page.getByTestId(id).first();
  if (!(await el.count())) return false;
  await el.click();
  await page.waitForTimeout(900);
  return true;
}

test("R7i : captures avant / après (Accueil, Fil, onglet Spots, page du crew ; appli et site)", async ({ browser }) => {
  test.setTimeout(2_400_000);
  mkdirSync(DIR, { recursive: true });

  if (APP && ONLY !== "site") {
    for (const theme of ["beton", "sable"] as const) {
      for (const [width, scale] of [
        [384, 1],
        [384, 1.3],
        [390, 1],
      ] as const) {
        const tag = `${width}-x${scale}-${theme}`;
        let page = await appLogin(browser, "damien@orasso.local", theme, width, scale);
        await go(page, "/accueil");
        await shot(page, `appli-accueil-${tag}`);
        await go(page, "/fil");
        await shot(page, `appli-fil-${tag}`);
        await page.context().close();

        page = await appLogin(browser, "kenji@orasso.local", theme, width, scale);
        await go(page, "/crew");
        await shot(page, `appli-crew-${tag}`);
        if (await tap(page, "crew-tab-spots")) await shot(page, `appli-crew-spots-${tag}`);
        await page.context().close();
      }
    }
  }

  for (const theme of ONLY === "app" ? [] : (["beton", "sable"] as const)) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
      for (const [name, path] of [
        ["accueil", "/app"],
        ["fil", "/app/fil"],
      ] as const) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await shot(page, `site-${name}-${tag}`);
      }
      await ctx.close();

      const ctxK = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const pageK = await ctxK.newPage();
      await setTheme(pageK, theme);
      await loginInBrowser(pageK, "kenji@orasso.local", undefined, "/app");
      for (const [name, path] of [
        ["crew", "/app/crew"],
        ["crew-spots", "/app/crew?onglet=spots"],
      ] as const) {
        await pageK.goto(path);
        await pageK.waitForLoadState("networkidle");
        await shot(pageK, `site-${name}-${tag}`);
      }
      await ctxK.close();
    }
  }
});

// --- Après le lot : les six démos de la maquette `p-spot` (jour / soir × lancer, reçu, après) --------------------------------

type Moment = { id: "jour" | "soir"; at: (day: string) => string; place: string; note: string; hours: number };
const MOMENTS: Moment[] = [
  { id: "jour", at: (d) => `${d}T10:00`, place: "Port de Saint-Cyprien", note: "Café au port, qui vient ?", hours: 2 },
  {
    id: "soir",
    at: (d) => `${d}T20:00`,
    place: "Parking de la plage · Canet",
    note: "Petit tour après le boulot, qui vient ?",
    hours: 0,
  },
];

/** Après un saut d’horloge l’API rattrape ses tâches : on attend qu’elle réponde de nouveau. */
async function apiReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${process.env.API_PORT ?? 4351}/api/health`);
      if (res.ok) return;
    } catch {
      // pas encore
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

async function cancelActive(cookie: string) {
  const mine = await apiCall<{ meetup: SpotMeetupView | null }>(cookie, "GET", "/me/spot-meetups/active");
  if (mine.data.meetup) await apiCall(cookie, "DELETE", `/me/spot-meetups/${mine.data.meetup.id}`);
}

test("R7i après : les six démos (jour / soir × lancer, reçu, après), appli et site", async ({ browser }) => {
  test.skip(!AFTER, "Seulement après le lot");
  test.setTimeout(3_000_000);
  const real = new Date();
  // Demain à 10 h, puis demain à 20 h : l'horloge ne fait qu'avancer, `reset` la remet à l'heure réelle à la fin.
  const tomorrow = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(
    new Date(real.getTime() + 24 * 3_600_000),
  );
  const damien = await login("damien@orasso.local");
  const lea = await login("lea@orasso.local");
  const nina = await login("nina@orasso.local");
  const kenji = await login("kenji@orasso.local");
  for (const c of [lea, nina]) await apiCall(c, "POST", "/users/Damien_66/follow");
  for (const c of [damien, lea, nina, kenji]) await cancelActive(c);
  const sizes: [number, number][] = [
    [384, 1],
    [384, 1.3],
    [390, 1],
  ];
  try {
    for (const m of MOMENTS) {
      if (process.env.MOMENT && process.env.MOMENT !== m.id) continue;
      clock("to", m.at(tomorrow));
      await apiReady();
      const sim = new Date((await apiCall<{ now: string }>(damien, "GET", "/dev/clock")).data.now);
      expect(wallTime(sim).hour).toBe(m.id === "jour" ? 10 : 20);
      // LANCER : le formulaire rempli (lieu placé, mot) avant d'envoyer.
      for (const theme of ["beton", "sable"] as const) {
        for (const [width, scale] of m.id === "soir" ? sizes : [sizes[0] as [number, number]]) {
          if (APP && ONLY !== "site") {
            const page = await appLogin(browser, "damien@orasso.local", theme, width, scale);
            await go(page, "/spot/nouveau");
            const map = page.getByTestId("wizard-map-canvas");
            await map.waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1_500);
            const box = await map.boundingBox();
            if (box) await page.mouse.click(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50);
            await page.getByTestId("spot-place-name").fill(m.place);
            await page.getByTestId("spot-note").fill(m.note);
            await shot(page, `p-spot-nouveau-${m.id}-appli-${width}-x${scale}-${theme}`);
            await page.context().close();
          }
        }
        for (const width of m.id === "soir" ? [390, 1280] : [1280]) {
          if (ONLY === "app") continue;
          const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
          const page = await ctx.newPage();
          await setTheme(page, theme);
          await loginInBrowser(page, "damien@orasso.local", undefined, "/app/spot/nouveau");
          const mapEl = page.getByTestId("event-map");
          await mapEl.waitFor({ timeout: 30_000 });
          const box = await mapEl.boundingBox();
          if (box) await page.mouse.click(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50);
          await page.getByTestId("spot-place-name").fill(m.place);
          await page.getByTestId("spot-note").fill(m.note);
          await shot(page, `p-spot-nouveau-${m.id}-site-${width}-${theme}`);
          await ctx.close();
        }
      }
      // L'envoi : par l'API (le même contrat que l'écran), pour que chaque moment parte d'un état connu.
      const start = sim;
      const end = new Date(start.getTime() + (m.hours ? m.hours * 3_600_000 : 4 * 3_600_000));
      const made = await apiCall<SpotMeetupView>(damien, "POST", "/me/spot-meetups", {
        placeLabel: m.place,
        lat: 42.6,
        lng: 3.03,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        note: m.note,
        audience: "followers",
      });
      expect(made.status).toBe(201);
      const id = made.data.id;
      await apiCall(lea, "PUT", `/spot-meetups/${id}/reply`, { answer: "yes" });
      await apiCall(nina, "PUT", `/spot-meetups/${id}/reply`, { answer: "yes" });
      // Le crew : un rendez-vous pour le crew de Kenji (onglet Spots).
      const aud = await apiCall<{ crews: { id: string; slug: string }[] }>(kenji, "GET", "/me/spot-meetups/audiences");
      const crew = aud.data.crews.find((c) => c.slug === "roussillon-drift");
      if (crew) {
        await apiCall(kenji, "POST", "/me/spot-meetups", {
          placeLabel: "Parking de la plage",
          lat: 42.7,
          lng: 3.0,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          note: "Sortie du dimanche, qui vient ?",
          audience: "crew",
          crewId: crew.id,
        });
      }
      // REÇU : l'Accueil et l'écran du rendez-vous (un abonné), l'onglet Spots du crew (Théo).
      for (const theme of ["beton", "sable"] as const) {
        for (const [width, scale] of m.id === "soir" ? sizes : [sizes[0] as [number, number]]) {
          if (APP && ONLY !== "site") {
            const tag = `${width}-x${scale}-${theme}`;
            const page = await appLogin(browser, "theo@orasso.local", theme, width, scale);
            await go(page, "/crew?crew=roussillon-drift&onglet=spots");
            await shot(page, `p-spot-spots-${m.id}-appli-${tag}`);
            await page.context().close();
            const nina2 = await appLogin(browser, "nina@orasso.local", theme, width, scale);
            await go(nina2, "/accueil");
            await nina2
              .getByTestId("home-spot-meetup")
              .scrollIntoViewIfNeeded()
              .catch(() => undefined);
            await shot(nina2, `p-spot-accueil-${m.id}-appli-${tag}`);
            await go(nina2, `/spot/${id}`);
            await shot(nina2, `p-spot-recu-${m.id}-appli-${tag}`);
            await nina2.context().close();
          }
        }
        for (const width of m.id === "soir" ? [390, 1280] : [1280]) {
          if (ONLY === "app") continue;
          const tag = `${width}-${theme}`;
          const vp = { width, height: width === 390 ? 844 : 900 };
          const ctx = await browser.newContext({ viewport: vp });
          const page = await ctx.newPage();
          await setTheme(page, theme);
          await loginInBrowser(page, "nina@orasso.local", undefined, "/app");
          await page.waitForLoadState("networkidle");
          await shot(page, `p-spot-accueil-${m.id}-site-${tag}`);
          await page.goto(`/app/spot/${id}`);
          await page.getByTestId("spot-detail").waitFor({ timeout: 30_000 });
          await shot(page, `p-spot-recu-${m.id}-site-${tag}`);
          await ctx.close();
          const ctxT = await browser.newContext({ viewport: vp });
          const pageT = await ctxT.newPage();
          await setTheme(pageT, theme);
          await loginInBrowser(pageT, "theo@orasso.local", undefined, "/app/crew?crew=roussillon-drift&onglet=spots");
          await pageT.getByTestId("crew-spots").waitFor({ timeout: 30_000 });
          await shot(pageT, `p-spot-spots-${m.id}-site-${tag}`);
          await ctxT.close();
        }
      }
      // APRÈS : la fin passée, plus de lieu ni de liste.
      clock("+5h");
      await apiReady();
      for (const theme of ["beton", "sable"] as const) {
        for (const [width, scale] of m.id === "soir" ? sizes : [sizes[0] as [number, number]]) {
          if (APP && ONLY !== "site") {
            const tag = `${width}-x${scale}-${theme}`;
            let page = await appLogin(browser, "damien@orasso.local", theme, width, scale);
            await go(page, `/spot/${id}`);
            await shot(page, `p-spot-apres-${m.id}-appli-auteur-${tag}`);
            await page.context().close();
            page = await appLogin(browser, "theo@orasso.local", theme, width, scale);
            await go(page, "/crew?crew=roussillon-drift&onglet=spots");
            await shot(page, `p-spot-spots-apres-${m.id}-appli-${tag}`);
            await page.context().close();
          }
        }
        for (const width of m.id === "soir" ? [390, 1280] : [1280]) {
          if (ONLY === "app") continue;
          const tag = `${width}-${theme}`;
          const vp = { width, height: width === 390 ? 844 : 900 };
          const ctx = await browser.newContext({ viewport: vp });
          const page = await ctx.newPage();
          await setTheme(page, theme);
          await loginInBrowser(page, "damien@orasso.local", undefined, `/app/spot/${id}`);
          await page.getByTestId("spot-ended").waitFor({ timeout: 30_000 });
          await shot(page, `p-spot-apres-${m.id}-site-auteur-${tag}`);
          await page.goto("/app");
          await page.waitForLoadState("networkidle");
          await shot(page, `p-spot-accueil-apres-${m.id}-site-${tag}`);
          await ctx.close();
        }
      }
      for (const c of [damien, kenji]) await cancelActive(c);
    }
  } finally {
    try {
      clock("reset");
    } catch {
      // best effort
    }
  }
});
