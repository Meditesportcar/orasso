import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  applyApi,
  type Cookie,
  decideApi,
  login,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R5b (maquettes R5.4, R5.5, R5.6 validées le 26/10, remarque 6 de Damien), côté appli (version web compilée) :
//   - onglet Profil : roue dentée → « Réglages » (les réglages quittent l'onglet), photo touchable → « Ta photo de
//     profil », description sous le nom ;
//   - « Modifier mon profil » : réseaux vérifiés pendant la saisie (refus d'une publication), « Enregistrer » ;
//   - profil d'un membre : tête, réseaux, nombres, un seul bouton « Suivre » (lot R6b : plus d'« Ajouter en ami »),
//     « Écrire » et « ⋯ » en haut, « Sa voiture » en carré, « Prochaine sortie » avec « Toi aussi », « Son garage » ; compte privé réduit ; aperçu ;
//   - titres « SON » et boutons coupés : à 384 px (Pixel de Damien), aucun mot perdu ni coupé, chaque titre de section
//     a de la marge à droite de son texte, l'aide reste à sa droite à police normale (tour 2) ; police agrandie
//     ×1,15 et ×1,3 **simulée dans la page** : c'est un contrôle web, pas une preuve (l'appli web ignore le `fontScale`
//     d'Android) ; la vraie preuve se fait sur l'APK, au téléphone (coordinateur).
// Béton et Sable, 390 px. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5b-captures/apres/recette`;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function open(browser: Browser, theme: Theme, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 1400 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/**
 * Contrôle web de la police agrandie (tour 2, relecture Opus 4) : chaque texte multiplie son corps et son interligne,
 * comme le ferait `fontScale` d'Android. Ce n'est pas le rendu natif (ni `onTextLayout`, ni la mesure d'Android) :
 * la preuve sur l'appareil reste à faire sur l'APK.
 */
async function scaleFonts(page: Page, k: number) {
  await page.evaluate((scale) => {
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.dataset.scaled) continue;
      const s = getComputedStyle(el);
      const fs = Number.parseFloat(s.fontSize);
      const lh = Number.parseFloat(s.lineHeight);
      el.dataset.scaled = "1";
      if (fs > 0) el.style.setProperty("font-size", `${fs * scale}px`, "important");
      if (lh > 0) el.style.setProperty("line-height", `${lh * scale}px`, "important");
    }
  }, k);
  await page.waitForTimeout(400);
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.brokenWords, JSON.stringify(a.brokenWords)).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

/**
 * Défaut « SON » : chaque titre de section (`role=heading` en Archivo large) garde tous ses mots, et sa boîte est plus
 * large que son texte (le titre prend la place de la rangée : sur Android, la marge évite le dernier mot caché).
 */
async function titlesKeepTheirWords(page: Page, titles: string[]) {
  for (const title of titles) {
    const h = page.getByRole("heading", { name: title, exact: true }).first();
    await expect(h).toBeVisible();
    const m = await h.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const box = el.getBoundingClientRect();
      const textRight = Math.max(...rects.map((r) => r.right));
      return {
        text: (el.textContent ?? "").trim(),
        slack: box.right - textRight,
        clipped: el.scrollHeight > el.clientHeight + 1,
        lines: new Set(rects.map((r) => Math.round(r.top))).size,
      };
    });
    expect(m.text.toLowerCase()).toBe(title.toLowerCase());
    expect(m.clipped, `${title} coupé en hauteur`).toBe(false);
    if (m.lines === 1) expect(m.slack, `${title} : pas de marge à droite`).toBeGreaterThan(4);
  }
}

/**
 * Tour 2 (relecture Opus 4) : le libellé d'un bouton est entier, pas seulement présent. Son texte est exactement
 * `label`, chacun de ses mots tient sur une seule ligne (jamais « AJOUT » / « ER »), et rien ne déborde de sa boîte.
 */
async function labelWhole(page: Page, testID: string, label: RegExp) {
  const m = await page.getByTestId(testID).evaluate((el) => {
    const range = document.createRange();
    const split: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const w of (node.textContent ?? "").matchAll(/[\p{L}\p{N}]+/gu)) {
        range.setStart(node, w.index ?? 0);
        range.setEnd(node, (w.index ?? 0) + w[0].length);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size > 1) split.push(w[0]);
      }
    }
    const box = el.getBoundingClientRect();
    range.selectNodeContents(el);
    const text = [...range.getClientRects()].filter((r) => r.width > 0);
    const overflow = text.some((r) => r.left < box.left - 1 || r.right > box.right + 1);
    return { text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), split, overflow };
  });
  expect(m.text).toMatch(label);
  expect(m.split, `${testID} : mot coupé`).toEqual([]);
  expect(m.overflow, `${testID} : libellé hors du bouton`).toBe(false);
}

/**
 * Tour 2 (décision du coordinateur) : à police normale, l'aide d'un titre de section reste à sa droite, sur la même
 * ligne, comme dans l'artefact ; le titre garde tous ses mots sur une ligne.
 */
async function hintRight(page: Page, title: string) {
  const m = await page
    .getByRole("heading", { name: title, exact: true })
    .first()
    .evaluate((h) => {
      const hint = h.nextElementSibling;
      const hb = h.getBoundingClientRect();
      const nb = hint?.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(h);
      const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      return {
        has: Boolean(hint),
        right: nb ? nb.left >= hb.right - 1 : false,
        sameRow: nb ? nb.top < hb.bottom : false,
        lines,
      };
    });
  expect(m.has, `${title} : pas d'aide`).toBe(true);
  expect(m.right && m.sameRow, `${title} : l'aide n'est pas à droite`).toBe(true);
  expect(m.lines, `${title} : le titre passe à la ligne`).toBe(1);
}

/** Un véhicule (le `index`-ième modèle BMW) avec une photo sans plaque ; renvoie son identifiant et son nom. */
async function vehicle(cookie: Cookie, index: number) {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const m = makes.data.find((x) => x.name === "BMW") ?? makes.data[0];
  const models = await apiCall<{ id: string; isOther: boolean }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${m?.id}/models`,
  );
  const model = models.data.filter((x) => !x.isOther)[index];
  const created = await apiCall<{ id: string; label: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: m?.id,
    modelId: model?.id,
    year: 1997,
    plate: randomPlate(),
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto())], { type: "image/png" }), "photo.png");
  form.set("noPlate", "true");
  const res = await fetch(`${API}/api/me/vehicles/${created.data.id}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return { id: created.data.id, label: created.data.label };
}

async function openEvent(damien: Cookie, title: string) {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date();
  start.setDate(start.getDate() + 6);
  start.setHours(9, 0, 0, 0);
  const created = await apiCall<{ id: string; slug: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 5 * 3600_000).toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car"],
    capacity: 40,
    maxVehiclesPerUser: 1,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Départs au pas, aucun burn.",
    description: "Événement de recette du lot R5b.",
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return created.data;
}

test("R5b appli : réglages, photo, réseaux, profil d'un membre, titres et boutons jamais coupés", async ({
  browser,
}) => {
  test.setTimeout(1_200_000);
  mkdirSync(DIR, { recursive: true });
  const tag = unique().slice(-6);
  const damien = await login("damien@orasso.local");
  const event = await openEvent(damien, `R5b Balade ${tag}`);

  // Julie-like : compte public, deux véhicules, réseaux, description, retenue à la sortie.
  const aPseudo = `R5bA_${tag}`;
  const a = await signUpApi(aPseudo);
  await apiCall(a, "PATCH", "/me/profile", {
    departments: ["66"],
    visibility: "public",
    bio: "E30 de 1989, MX-5 pour l'été. Toujours partante pour une balade.",
    socials: { instagram: "https://www.instagram.com/julie.e30/", tiktok: "@julie66" },
  });
  const aMain = await vehicle(a, 0);
  await vehicle(a, 1);
  await decideApi(damien, event.id, await applyApi(a, event.id, aMain.id), "accept");
  // La personne qui regarde : retenue à la même sortie (« Toi aussi » ; tour 2 : une candidature en attente ne compte
  // plus, « vous y serez » serait faux).
  const bPseudo = `R5bB_${tag}`;
  const b = await signUpApi(bPseudo);
  await apiCall(b, "PATCH", "/me/profile", { departments: ["66"] });
  const bApplication = await applyApi(b, event.id, (await vehicle(b, 0)).id);
  const pendingSeen = await apiCall<{ nextOuting: { together: boolean } | null }>(b, "GET", `/users/${aPseudo}`);
  expect(pendingSeen.data.nextOuting?.together).toBe(false);
  await decideApi(damien, event.id, bApplication, "accept");
  // Un compte privé.
  const cPseudo = `R5bC_${tag}`;
  const c = await signUpApi(cPseudo);
  await apiCall(c, "PATCH", "/me/profile", { departments: ["66"], visibility: "private" });
  await vehicle(c, 1);

  const seen = await apiCall<{ nextOuting: { together: boolean } | null; socials: unknown }>(
    b,
    "GET",
    `/users/${aPseudo}`,
  );
  expect(seen.data.nextOuting?.together).toBe(true);
  expect(seen.data.socials).toEqual({ instagram: "julie.e30", tiktok: "julie66" });

  for (const theme of ["beton", "sable"] as const) {
    // Chaque thème repart des mêmes réseaux (le passage précédent les a modifiés).
    await apiCall(a, "PATCH", "/me/profile", { socials: { instagram: "julie.e30", tiktok: "julie66" } });
    // --- R5.6 Le profil d'un membre, vu par B --------------------------------------------------------------------
    const { ctx, page } = await open(browser, theme);
    await signIn(page, `${bPseudo.toLowerCase()}@e2e.orasso.test`);
    await goto(page, `/u/${aPseudo}`);
    await expect(page.getByTestId("public-head")).toContainText(aPseudo, { timeout: 30_000 });
    await expect(page.getByTestId("profile-socials")).toContainText("julie.e30");
    await expect(page.getByTestId("profile-social-instagram")).toHaveAttribute("aria-label", "julie.e30 sur Instagram");
    await expect(page.getByTestId("public-counts")).toContainText("sortie");
    // « Écrire » et « ⋯ » dans l'en-tête.
    await expect(page.getByTestId("message-open")).toBeVisible();
    await expect(page.getByTestId("report-open-profile")).toBeVisible();
    // Lot R6b : un seul bouton, « Suivre » (B ne suit pas A et A ne suit pas B).
    await expect(page.getByTestId("follow-button")).toContainText("Suivre");
    await expect(page.getByTestId("friend-add")).toHaveCount(0);
    await expect(page.getByTestId("profile-car")).toContainText(aMain.label);
    await expect(page.getByTestId("profile-car")).toContainText("Principale");
    await expect(page.getByTestId("profile-next")).toContainText(`R5b Balade ${tag}`);
    await expect(page.getByTestId("profile-together")).toHaveText("Toi aussi : vous y serez tous les deux");
    await expect(page.getByTestId("profile-garage-vehicle")).toHaveCount(1);
    await audit(page);
    await titlesKeepTheirWords(page, ["Sa voiture", "Prochaine sortie", "Son garage"]);
    // Police normale : l'aide reste à droite du titre (comme l'artefact).
    for (const title of ["Sa voiture", "Prochaine sortie", "Son garage"]) await hintRight(page, title);
    await labelWhole(page, "follow-button", /^Suivre$/i);
    await shot(page, `membre-${theme}-390`);

    // Compte privé : la tête, les nombres, « Demander à suivre », ses véhicules en marque et modèle, la ligne.
    await goto(page, `/u/${cPseudo}`);
    await expect(page.getByTestId("profile-private-note")).toContainText(
      "Ses photos, ses sorties, son crew et ses réseaux sont pour ses abonnés.",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("profile-vehicles-private")).toBeVisible();
    await expect(page.getByTestId("follow-button")).toContainText("Demander à suivre");
    await expect(page.getByTestId("profile-car")).toHaveCount(0);
    await expect(page.getByTestId("profile-socials")).toHaveCount(0);
    await audit(page);
    await titlesKeepTheirWords(page, ["Ses véhicules"]);
    await shot(page, `membre-prive-${theme}-390`);
    await ctx.close();

    // --- Titres « SON » et « SUIVRE » : 384 px, police agrandie simulée (contrôle web ; preuve : l'APK) ---
    for (const k of [1.15, 1.3]) {
      const big = await open(browser, theme, 384);
      await signIn(big.page, `${bPseudo.toLowerCase()}@e2e.orasso.test`);
      await goto(big.page, `/u/${aPseudo}`);
      await expect(big.page.getByTestId("profile-car")).toBeVisible({ timeout: 30_000 });
      await big.page.waitForTimeout(800);
      await scaleFonts(big.page, k);
      const ab = await auditPage(big.page);
      // Le pseudo d'essai (11 signes sans espace) : son corps est ajusté par l'appli d'après `fontScale`, que la page ne
      // connaît pas (la police forcée ici l'écrase) ; il est vérifié à l'échelle 1 plus haut.
      const broken = ab.brokenWords.filter((word) => !aPseudo.includes(word));
      expect(broken, JSON.stringify(broken)).toEqual([]);
      expect(ab.horizontalScroll).toBe(false);
      await titlesKeepTheirWords(big.page, ["Sa voiture", "Prochaine sortie", "Son garage"]);
      // « Toi aussi » reste dans le ticket (la phrase passe à la ligne).
      const ticket = await big.page.getByTestId("profile-next").boundingBox();
      const both = await big.page.getByTestId("profile-together").boundingBox();
      expect((both?.x ?? 0) + (both?.width ?? 0)).toBeLessThanOrEqual((ticket?.x ?? 0) + (ticket?.width ?? 0) + 1);
      // Le libellé du bouton est entier : tout le texte, chaque mot sur une ligne, rien hors du bouton.
      await labelWhole(big.page, "follow-button", /^Suivre$/i);
      await shot(big.page, `membre-${theme}-384-police${Math.round(k * 100)}`);
      await big.ctx.close();
    }

    // --- R5.4 Onglet Profil, R5.5 Modifier mon profil (A) ----------------------------------------------------------
    const me = await open(browser, theme);
    const p = me.page;
    await signIn(p, `${aPseudo.toLowerCase()}@e2e.orasso.test`);
    await goto(p, "/profil");
    await expect(p.getByTestId("profil-gear")).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId("profil-bio")).toContainText("E30 de 1989");
    // Les réglages ont quitté l'onglet.
    await expect(p.getByTestId("reglage-compte")).toHaveCount(0);
    await expect(p.getByTestId("profil-sign-out")).toHaveCount(0);
    await audit(p);
    await shot(p, `profil-${theme}-390`);
    // Toucher la photo : « Ta photo de profil » (pas de « Retirer » sans photo).
    await p.getByTestId("profil-avatar").click();
    await expect(p.getByTestId("photo-sheet")).toBeVisible();
    await expect(p.getByTestId("photo-take")).toContainText("Prendre une photo");
    await expect(p.getByTestId("photo-pick")).toContainText("Choisir dans la galerie");
    await expect(p.getByTestId("photo-remove")).toHaveCount(0);
    await shot(p, `profil-photo-${theme}-390`);
    await p.getByTestId("photo-sheet-close").click();
    await expect(p.getByTestId("photo-sheet")).toHaveCount(0);
    // La roue dentée : « Réglages », dans l'ordre de Damien.
    await p.getByTestId("profil-gear").click();
    await expect(p.getByTestId("profil-settings")).toBeVisible({ timeout: 30_000 });
    const rows = await p
      .getByTestId("profil-settings")
      .locator(":scope > [role=button]")
      .evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").split(",")[0]));
    expect(rows).toEqual([
      "Modifier mon profil",
      "Compte",
      "Notifications",
      "Confidentialité",
      "Tes préférences",
      "Apparence",
      "Aide",
      "Se déconnecter",
    ]);
    await audit(p);
    await shot(p, `reglages-${theme}-390`);
    // « Modifier mon profil » : réseaux préremplis, pas d'e-mail.
    await p.getByTestId("reglage-profil").click();
    await expect(p.getByTestId("social-instagram")).toHaveValue("julie.e30", { timeout: 30_000 });
    await expect(p.getByTestId("moi-profile").getByText(`${aPseudo.toLowerCase()}@e2e.orasso.test`)).toHaveCount(0);
    await expect(p.getByTestId("edit-profile-missing")).toHaveText(
      "Rien n'a changé : modifie un champ pour enregistrer.",
    );
    await shot(p, `modifier-${theme}-390`);
    // Une publication est refusée, avec la phrase qui dit quoi faire ; « Enregistrer » grisé dit ce qui manque.
    await p.getByTestId("social-instagram").fill("https://www.instagram.com/p/C1abcDEF/");
    await expect(p.getByTestId("social-error-instagram")).toHaveText(
      "Ce lien mène à une publication. Mets ton pseudo Instagram, par exemple kenji.supra.",
    );
    await expect(p.getByTestId("edit-profile-missing")).toHaveText("Corrige les champs signalés pour enregistrer.");
    await expect(p.getByTestId("edit-profile-save")).toBeDisabled();
    await shot(p, `modifier-erreur-${theme}-390`);
    // Un lien de profil est ramené au pseudo à l'enregistrement.
    await p.getByTestId("social-instagram").fill(`https://www.instagram.com/julie.${theme}/`);
    await p.getByTestId("social-snapchat").fill("julie66");
    await p.getByTestId("edit-profile-save").click();
    await expect(p.getByTestId("moi-profile-message")).toHaveText("Profil enregistré.", { timeout: 20_000 });
    await expect(p.getByTestId("social-instagram")).toHaveValue(`julie.${theme}`);
    const after = await apiCall<{ profile: { socials: Record<string, string> } }>(a, "GET", "/me");
    expect(after.data.profile.socials).toEqual({ instagram: `julie.${theme}`, tiktok: "julie66", snapchat: "julie66" });
    await audit(p);

    // --- L'aperçu : le même écran, le bandeau et « Modifier » ------------------------------------------------------
    await goto(p, "/profil-public");
    await expect(p.getByTestId("preview-banner")).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId("profile-car")).toContainText(aMain.label);
    await expect(p.getByTestId("preview-actions")).toBeVisible();
    await audit(p);
    await titlesKeepTheirWords(p, ["Sa voiture", "Prochaine sortie", "Son garage"]);
    await shot(p, `apercu-${theme}-390`);
    await p.getByTestId("preview-edit").click();
    await expect(p.getByTestId("social-instagram")).toBeVisible({ timeout: 30_000 });
    await me.ctx.close();
  }
});
