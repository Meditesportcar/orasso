import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7l3 : captures « avant » (CAP_PHASE=avant, branche vague-r7) et « après » (CAP_PHASE=apres) du vote, de la carte du
// garage et de la fiche d'un véhicule, de la fiche de l'événement, du Jour J et des Sorties. Béton et Sable ; appli : 384 px
// police 1 et 1,3, 390 px police 1 ; site : 390 et 1280 px. Appli : APP_URL (appli compilée) ; site : SITE_CAPTURES=1. L'API
// seedée (« Rassemblement du Lydia » en cours ; Béziers Night : le trophée de Kenji). Aucune plaque lisible.
const PHASE = process.env.CAP_PHASE ?? "apres";
const OUT = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7l3-captures/${PHASE}`;
const APP = process.env.APP_URL;
const AFTER = PHASE.startsWith("apres");
const SLUG = "rassemblement-du-lydia";
test.use({ actionTimeout: 30_000 });

// CAP_ONLY=jour-j,sorties : seulement ces écrans (reprise d'une capture ratée).
const ONLY = process.env.CAP_ONLY?.split(",") ?? null;
const wanted = <T extends { name: string }>(shots: T[]) => (ONLY ? shots.filter((x) => ONLY.includes(x.name)) : shots);

type Theme = "beton" | "sable";
const DAMIEN = "damien@orasso.local";
const KENJI = "kenji@orasso.local";

async function ids() {
  const kenji = await login(KENJI);
  const ev = await apiCall<{ id: string }>(kenji, "GET", `/events/by-slug/${SLUG}`);
  const mine = await apiCall<{ id: string; label: string; audiencePrizes: number }[]>(kenji, "GET", "/me/vehicles");
  const supra = mine.data.find((v) => v.audiencePrizes > 0) ?? mine.data[0];
  if (!ev.data?.id || !supra) throw new Error("Seed incomplet : lancer pnpm db:seed.");
  const votes = await apiCall<{ items: { id: string; title: string }[] }>(kenji, "GET", `/events/${ev.data.id}/votes`);
  // Le Jour J s'ouvre par l'identifiant de la candidature de Damien (son QR), pas par celui de l'événement.
  const damien = await login(DAMIEN);
  const apps = await apiCall<{ id: string; event: { id: string } }[]>(damien, "GET", "/me/applications");
  const application = apps.data.find((a) => a.event.id === ev.data.id)?.id ?? ev.data.id;
  const rupteur = votes.data.items.find((v) => /rupteur/i.test(v.title));
  return { eventId: ev.data.id, vehicleId: supra.id, rupteurId: rupteur?.id ?? null, application };
}

async function openApp(browser: Browser, theme: Theme, width: number, fontScale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 1500 }, baseURL: APP, locale: "fr-FR" });
  await ctx.addInitScript(
    ([t, f]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t as string);
      if (f !== "1") localStorage.setItem("orasso.recette.echellePolice", f as string);
    },
    [theme, String(fontScale)],
  );
  return { ctx, page: await ctx.newPage() };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function shot(page: Page, dir: string, name: string) {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${dir}/${name}.png`, fullPage: true });
}

const VARIANTS: [number, number][] = [
  [384, 1],
  [384, 1.3],
  [390, 1],
];

test("appli : captures du vote, du garage, de la fiche, du Jour J, Béton et Sable", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(1_500_000);
  const k = await ids();
  const shots: { name: string; who: string; path: string }[] = [
    { name: "vote", who: DAMIEN, path: `/vote/${k.eventId}` },
    ...(AFTER
      ? [
          { name: "votes-liste", who: DAMIEN, path: `/votes/${k.eventId}` },
          ...(k.rupteurId
            ? [{ name: "vote-rupteur", who: DAMIEN, path: `/vote/${k.eventId}?vote=${k.rupteurId}` }]
            : []),
        ]
      : []),
    { name: "fiche-evenement", who: DAMIEN, path: `/e/${SLUG}` },
    { name: "activite", who: DAMIEN, path: "/activite" },
    { name: "jour-j", who: DAMIEN, path: `/jour-j/${k.application}` },
    { name: "sorties", who: DAMIEN, path: "/sorties" },
    { name: "garage", who: KENJI, path: "/garage" },
    { name: "vehicule", who: KENJI, path: `/vehicule/${k.vehicleId}` },
  ];
  for (const theme of ["beton", "sable"] as const) {
    for (const [width, fs] of VARIANTS) {
      for (const who of [DAMIEN, KENJI]) {
        const { ctx, page } = await openApp(browser, theme, width, fs);
        await signIn(page, who);
        await afterOpening(page);
        for (const s of wanted(shots).filter((x) => x.who === who)) {
          await page.goto(s.path);
          await afterOpening(page).catch(() => undefined);
          await shot(page, "appli", `${s.name}-${theme}-${width}-f${String(fs).replace(".", "")}`);
        }
        await ctx.close();
      }
    }
  }
});

test("site : captures du vote, du garage, de la fiche, Béton et Sable, 390 et 1280 px", async ({ browser }) => {
  test.skip(!process.env.SITE_CAPTURES, "Site : lancer avec SITE_CAPTURES=1");
  test.setTimeout(1_200_000);
  const k = await ids();
  const shots: { name: string; who: string; path: string }[] = [
    { name: "vote", who: DAMIEN, path: `/app/vote/${SLUG}` },
    ...(AFTER ? [{ name: "votes-liste", who: DAMIEN, path: `/app/votes/${SLUG}` }] : []),
    ...(AFTER && k.rupteurId
      ? [{ name: "vote-rupteur", who: DAMIEN, path: `/app/vote/${SLUG}?vote=${k.rupteurId}` }]
      : []),
    { name: "fiche-evenement", who: DAMIEN, path: `/e/${SLUG}` },
    { name: "garage-vehicule", who: KENJI, path: `/app/garage/${k.vehicleId}` },
    { name: "vehicule-public", who: DAMIEN, path: `/v/${k.vehicleId}` },
  ];
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      for (const who of [DAMIEN, KENJI]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "fr-FR",
          baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`,
        });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, who, SEED_PASSWORD, "/app/moi");
        for (const s of shots.filter((x) => x.who === who)) {
          await page.goto(s.path);
          await page.waitForLoadState("networkidle");
          mkdirSync(`${OUT}/site`, { recursive: true });
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${OUT}/site/${s.name}-${theme}-${width}.png`, fullPage: true });
        }
        await ctx.close();
      }
    }
  }
});
