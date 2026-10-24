import { mkdirSync } from "node:fs";
import { tokens } from "@orasso/design-system";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { auditApp } from "./helpers/lot43";
import { RELAIS } from "./relais";

// Lot 42, côté appli (version web de recette) : les six tutos par profil, au « tu » (31 diapos : exposant 7, visiteur 6,
// pro 4, organisateur 6, prestataire 4, média 4). Chaque tuto défile avec le bon nombre de points, le texte de sa
// première et de sa dernière diapo, « Passer » et « C'est parti » ; réduction des animations (image fixe de l'état
// final) ; rejouable depuis Mon profil › Aide ; tuile « Découvre ce qu'il y a de nouveau » de l'Accueil ; deux thèmes ;
// règles du système de design ; captures à 390 px (chaque diapo de l'exposant, une diapo par autre profil).
// Lancer avec APP_URL=http://localhost:8271 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-42-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
// Lot C7 : la trace de Playwright (gardée en cas d'échec, donc enregistrée à chaque essai) se fige sur la page du
// tuto en mouvement réduit, et l'attente de la fin de l'ouverture dépassait le délai ; sans trace, la recette passe en
// quelques secondes. L'appli reste fluide (règles CSS, nœuds et animations stables, mesurés au lot C7). `trace` ne se
// règle que pour tout le fichier.
test.use({ trace: "off" });

type Theme = "beton" | "sable";
type Profile = "exhibitor" | "visitor" | "pro" | "organizer" | "provider" | "media";

/** Les tutos du prototype : nombre de diapos, jour + titre de chaque diapo, texte de la première et de la dernière. */
const TUTOS: Record<Profile, { titles: string[]; first: string; last: string }> = {
  exhibitor: {
    titles: [
      "Tu trouves un rasso",
      "Tu candidates avec ta voiture",
      "Ta voiture est retenue",
      "On te guide jusqu'à ta place",
      "Des points et des souvenirs",
      "Tes points t'ouvrent des remises",
      "Tu retrouves ta bande",
    ],
    first: "Explorer liste tout ce qui se passe autour de toi, du plus proche au plus loin.",
    last: "Explorer montre aussi les personnes et les crews du coin. Tu suis tes amis, tu rejoins un crew, vous vous écrivez et vous candidatez ensemble.",
  },
  visitor: {
    titles: [
      "Tu trouves une expo",
      "Tu réserves ton entrée",
      "Un scan, un tampon",
      "Tu votes pour ta préférée",
      "Tes points t'ouvrent des remises",
      "Tu retrouves ta bande",
    ],
    first:
      "Explorer liste les rassemblements et les expos autour de toi. Pas besoin de voiture pour venir voir celles des autres.",
    last: "Explorer montre aussi les personnes et les crews du coin. Tu suis tes amis et tes crews préférés, vous vous écrivez, et tu vois qui va où.",
  },
  pro: {
    titles: [
      "Tu montes la fiche de ton atelier",
      "Les passionnés du coin te trouvent",
      "Un scan, la remise",
      "Tu vois ce que ça rapporte",
    ],
    first: "Activités, zone, réalisations et surtout tes remises par grade : ta fiche se remplit en quelques touches.",
    last: "Vues de ta fiche, remises accordées, clics vers ton site : tes statistiques, grade par grade.",
  },
  organizer: {
    titles: [
      "Tu crées ton événement",
      "Tu tries d'un geste",
      "Tu places ton équipe",
      "Tu préviens tout le monde",
      "Le jour J, en direct",
      "Les points partent tout seuls",
    ],
    first:
      "L'assistant te guide en huit temps : format, adresse, arrivées, critères, règlement… et l'affiche se génère toute seule, en plusieurs styles.",
    last: "Le pointage de ton staff fait foi : chaque présent reçoit ses points, l'absent non excusé un malus. La personne peut contester, c'est toi qui tranches.",
  },
  provider: {
    titles: [
      "Tu trouves une mission",
      "Tu proposes ta prestation",
      "Ton emplacement t'attend",
      "Les avis font ta vitrine",
    ],
    first:
      "Missions liste les événements qui cherchent un food truck, une animation ou un stand près de chez toi, selon ton métier.",
    last: "L'organisateur laisse un avis. Ta vitrine affiche tes événements et tes notes : les missions suivantes viennent plus vite.",
  },
  media: {
    titles: [
      "Tu repères quoi couvrir",
      "Tu demandes ton accréditation",
      "Badge presse et zones photo",
      "Tes vidéos mises en avant",
    ],
    first:
      "Explorer cherche dans toute la France, accréditation ouverte en tête. Tu gardes ceux que tu veux couvrir dans ton agenda.",
    last: "Tu déposes tes liens et ta galerie. La page de l'événement les met en avant, les participants les retrouvent.",
  },
};
const PROFILES = Object.keys(TUTOS) as Profile[];

async function open(browser: Browser, theme: Theme, options: { reduce?: boolean; seen?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto("/");
  await page.evaluate(
    ({ t, reduce, seen }) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (reduce) localStorage.setItem("orasso.reduceMotion", "1");
      // Tuile « Nouveau » de l'Accueil : déjà vue sauf pour la recette de la tuile.
      if (seen)
        for (const p of ["exhibitor", "visitor", "pro", "provider", "media"])
          localStorage.setItem(`orasso.tuto_${p}`, "1");
    },
    { t: theme, reduce: Boolean(options.reduce), seen: options.seen !== false },
  );
  return { ctx, page, errors };
}

/** Un chargement de page rejoue l'ouverture de l'appli : un toucher la passe, sinon on attend la fin. */
async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 30_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|direct/, { timeout: 60_000 });
}

async function openTuto(page: Page, profile: Profile) {
  await page.goto(`/tuto/${profile}`);
  await afterOpening(page);
  await expect(page.getByTestId(`tuto-${profile}`)).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string, wait = 900) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Règles du système de design à l'écran du tuto : un seul bouton principal, un seul néon, pas de vert, pas de défilement horizontal. */
/**
 * Aucun faux bouton moutarde dans les illustrations : un aplat moutarde en forme de bouton (≥ 160 px de large, 32 à 64 px
 * de haut) dans le cadre d'une illustration serait pris pour un second bouton principal. Les étiquettes, barres, bulles et la
 * barre de scan sont plus petites ; l'écran carré « Scan OK » du lecteur (artefact `.tz-ok`, lot C3) n'a pas la forme d'un
 * bouton, ni une étiquette inclinée, ni une bulle de discussion.
 */
async function noBigAccentFill(page: Page, theme: Theme, label: string) {
  const accent = tokens.color[theme].accent;
  const found = await page.evaluate((hex) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = hex;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return (
      [...document.querySelectorAll('[data-testid="tuto-art"] *')]
        .filter((el) => getComputedStyle(el).backgroundColor === rgb)
        // Une étiquette inclinée (`.tag`, skewX(−8°) : « Scan OK · zone JDM » de l'artefact) n'est pas un bouton (droit).
        .filter((el) => {
          const m = getComputedStyle(el).transform.match(/^matrix\(([^)]+)\)$/);
          return !m || Math.abs(Number(m[1]?.split(",")[2] ?? 0)) < 0.01;
        })
        // Une bulle de discussion (`.tz-msg.me` : un coin pointu) n'est pas un bouton (quatre coins égaux).
        .filter((el) => {
          const cs = getComputedStyle(el);
          return (
            cs.borderTopLeftRadius === cs.borderBottomRightRadius &&
            cs.borderTopRightRadius === cs.borderBottomLeftRadius
          );
        })
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width >= 160 && r.height >= 32 && r.height <= 64)
        .map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`)
    );
  }, accent);
  expect(found, `${label} : pas de faux bouton moutarde dans l'illustration`).toEqual([]);
}

async function checkRules(page: Page, theme: Theme, label: string) {
  const audit = await auditApp(page, theme);
  expect(
    audit.primaryButtons,
    `${label} : un seul bouton principal (${audit.primaryLabels.join(" | ")})`,
  ).toBeLessThanOrEqual(1);
  expect(audit.neon, `${label} : un seul néon (${audit.neonLabels.join(" | ")})`).toBeLessThanOrEqual(1);
  expect(audit.buttonsWithoutIcon, `${label} : tout bouton porte une icône`).toEqual([]);
  expect(audit.greens, `${label} : pas de vert`).toEqual([]);
  expect(audit.horizontalScroll, `${label} : pas de défilement horizontal`).toBe(false);
  await noBigAccentFill(page, theme, label);
}

test("les six tutos défilent : points, premier et dernier texte, Passer et C'est parti (deux thèmes, captures)", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of ["beton", "sable"] as Theme[]) {
    const { ctx, page, errors } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    for (const profile of PROFILES) {
      const tuto = TUTOS[profile];
      await openTuto(page, profile);
      // Les points de progression : un par diapo, la première active.
      await expect(page.getByTestId("tuto-dot")).toHaveCount(tuto.titles.length);
      await expect(page.getByTestId("tuto-dots")).toHaveAttribute("aria-label", `Diapo 1 sur ${tuto.titles.length}`);
      await expect(page.getByRole("button", { name: "Passer" })).toBeVisible();
      // Lot C3 (artefact `s-tuto`) : le bouton carré « précédent » est là dès la première diapo, sans effet (désactivé).
      await expect(page.getByRole("button", { name: "Précédent" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Précédent" })).toBeDisabled();
      await expect(page.getByText(tuto.first, { exact: true })).toBeVisible();
      for (let i = 0; i < tuto.titles.length; i++) {
        await expect(page.getByTestId(`tuto-slide-${i + 1}`)).toBeVisible();
        await expect(page.getByRole("heading", { name: tuto.titles[i], exact: true })).toBeVisible();
        await expect(page.getByTestId("tuto-dots")).toHaveAttribute(
          "aria-label",
          `Diapo ${i + 1} sur ${tuto.titles.length}`,
        );
        // Chaque diapo a son illustration (cadre décrit pour les lecteurs d'écran).
        await expect(page.getByTestId("tuto-art")).toHaveCount(1);
        // Une seule diapo montée à la fois (les autres sont démontées : rien ne tourne en coulisse).
        await expect(page.locator('[data-testid^="tuto-slide-"]')).toHaveCount(1);
        const capture = profile === "exhibitor" || i === Math.min(2, tuto.titles.length - 1);
        if (capture) {
          await shot(page, `${profile}-${String(i + 1).padStart(2, "0")}-${theme}`, 4500);
          await checkRules(page, theme, `${profile} diapo ${i + 1}`);
        }
        const last = i === tuto.titles.length - 1;
        if (!last) {
          await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible();
          await expect(page.getByRole("button", { name: "C'est parti" })).toHaveCount(0);
          await page.getByRole("button", { name: "Suivant" }).click();
        }
      }
      await expect(page.getByText(tuto.last, { exact: true })).toBeVisible();
      // « Précédent » ramène à la diapo d'avant.
      await expect(page.getByRole("button", { name: "Précédent" })).toBeVisible();
      await page.getByRole("button", { name: "Précédent" }).click();
      await expect(page.getByRole("heading", { name: tuto.titles[tuto.titles.length - 2], exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Suivant" }).click();
      // « C'est parti » quitte le tuto.
      await expect(page.getByRole("button", { name: "C'est parti" })).toBeVisible();
      await page.getByRole("button", { name: "C'est parti" }).click();
      await expect(page.getByTestId(`tuto-${profile}`)).toHaveCount(0, { timeout: 30_000 });
    }
    // « Passer » quitte aussi, dès la première diapo.
    await openTuto(page, "pro");
    await page.getByRole("button", { name: "Passer" }).click();
    await expect(page.getByTestId("tuto-pro")).toHaveCount(0, { timeout: 30_000 });
    expect(errors, "aucune erreur de page").toEqual([]);
    await ctx.close();
  }
});

test("un nom de profil inconnu ramène à l'Accueil", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, "kenji@orasso.local");
  await page.goto("/tuto/administrateur");
  await afterOpening(page);
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  await expect(page.getByTestId("tuto-exhibitor")).toHaveCount(0);
  await ctx.close();
});

test("animations réduites : l'illustration est à l'état final, sans attendre (diapos d'état et de compteurs)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const { ctx, page } = await open(browser, "beton", { reduce: true });
  await signIn(page, "kenji@orasso.local");

  // Exposant, diapo 3 : « En attente » est déjà devenu « Retenue » et le QR est là, sans délai.
  await openTuto(page, "exhibitor");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { name: "Ta voiture est retenue", exact: true })).toBeVisible();
  await expect(page.getByText("Retenue", { exact: true })).toBeVisible({ timeout: 1500 });
  await expect(page.getByText("En attente", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("QR d'accès (exemple)")).toBeVisible({ timeout: 1500 });
  await shot(page, "reduit-exhibitor-03-beton", 300);

  // Pro, diapo 4 : les compteurs affichent déjà leur valeur finale.
  await openTuto(page, "pro");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { name: "Tu vois ce que ça rapporte", exact: true })).toBeVisible();
  await expect(page.getByText("1 284", { exact: true })).toBeVisible({ timeout: 1500 });
  await expect(page.getByText("37", { exact: true })).toBeVisible({ timeout: 1500 });
  await shot(page, "reduit-pro-04-beton", 300);
  await ctx.close();
});

test("Mon profil › Aide : « Revoir le tuto » rejoue le tuto de chaque profil, puis revient à l'Aide", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, "kenji@orasso.local");
  await page.goto("/reglages/aide");
  await afterOpening(page);
  await expect(page.getByRole("heading", { name: "Revoir le tuto", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  // Lot M5 (maquette 7.3) : une carte par casquette, « un par casquette » à droite du titre.
  await expect(page.getByText("un par casquette", { exact: true })).toBeVisible();
  // Kenji est exposant : son tuto, et seulement ceux de ses casquettes.
  await expect(page.getByTestId("replay-tuto-exhibitor")).toBeVisible();
  await shot(page, "aide-revoir-le-tuto-beton");
  await page.getByTestId("replay-tuto-exhibitor").click();
  await expect(page.getByTestId("tuto-exhibitor")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Tu trouves un rasso", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Passer" }).click();
  await expect(page.getByTestId("tuto-exhibitor")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("replay-tuto-exhibitor")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("tuile « Nouveau » : jamais pour un compte créé avec l'arrivée (profil choisi), même sans le kv du tuto", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const pseudo = `Tuto_${unique()}`.slice(0, 24);
  await signUpApi(pseudo, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  const { ctx, page } = await open(browser, "beton", { seen: false });
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await expect(page.getByRole("tab")).toHaveCount(5, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("home-tuto").filter({ visible: true })).toHaveCount(0);
  await ctx.close();
});

test("lot C2a : plus de tuile « Découvre ce qu'il y a de nouveau » sur l'Accueil du passionné (artefact DA v2), même pour un ancien compte", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "beton", { seen: false });
  await signIn(page, "kenji@orasso.local");
  await expect(page.getByTestId("home-greeting")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("home-tuto").filter({ visible: true })).toHaveCount(0);
  await ctx.close();
});

test("petit écran (360 × 640) et texte agrandi : la diapo défile, rien n'est coupé (lot C3, tour 2)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "beton");
  await signIn(page, "kenji@orasso.local");
  await page.setViewportSize({ width: 360, height: 640 });
  await openTuto(page, "exhibitor");
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { name: "Tes points t'ouvrent des remises", exact: true })).toBeVisible();
  // Texte agrandi (équivalent de la police système agrandie) : le contenu dépasse, la zone de la diapo défile.
  await page.addStyleTag({ content: '[data-testid="tuto-slide-6"] div[dir="auto"] { font-size: 130% !important; }' });
  await page.setViewportSize({ width: 360, height: 560 });
  await page.waitForTimeout(800);
  // Le défilement est ouvert (avant : `scrollEnabled={false}`, le bas du texte devenait inaccessible au doigt).
  expect(await page.getByTestId("tuto-stage").evaluate((el) => getComputedStyle(el).overflowY)).not.toBe("hidden");
  const text = page.getByText(tutoLast("exhibitor-6"), { exact: true });
  await text.scrollIntoViewIfNeeded();
  await expect(text).toBeInViewport();
  // Les actions restent à l'écran.
  await expect(page.getByRole("button", { name: "Suivant" })).toBeInViewport();
  await page.screenshot({ path: `${DIR}/petit-ecran-exhibitor-06-beton.png` });
  await ctx.close();
});

function tutoLast(key: "exhibitor-6") {
  return {
    "exhibitor-6":
      "Plus tu participes, plus ton grade monte. Tu trouves les pros du coin (garage, prépa, detailing) et tu montres ton QR de compte en boutique : la remise de ton grade s'applique.",
  }[key];
}
