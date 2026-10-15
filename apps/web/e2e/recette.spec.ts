import { createHmac, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
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

// Recette du parcours n° 1 (lot 12) : un organisateur (Damien), deux staffs (Julie scan, Marc contrôle), cinq
// passionnés. Liste d'attente avec place libérée, désistement, scan staff (envoi différé de l'appli simulé par l'API),
// pointage par plaque, absent → malus → contestation tranchée par l'organisateur sur le site, avis après
// l'événement et droit de réponse, page publique.
test("recette du parcours n° 1 : cinq passionnés, deux staffs, avis", async ({ browser }) => {
  const damien = await login("damien@orasso.local");
  const julie = await login("julie@orasso.local");
  const marc = await login("marc@orasso.local");
  const event = await createEvent(damien, { capacity: 3 });
  const s = unique();
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((n) => `${n}_${s}`);
  const fans: { pseudo: string; email: string; cookie: Cookie; plate: string; applicationId: string }[] = [];
  for (const pseudo of names) {
    const cookie = await signUpApi(pseudo);
    const plate = randomPlate();
    const applicationId = await applyApi(cookie, event.id, await addVehicleApi(cookie, plate));
    fans.push({ pseudo, email: `${pseudo.toLowerCase()}@e2e.orasso.test`, cookie, plate, applicationId });
  }
  const [alpha, bravo, charlie, delta, echo] = fans as [
    (typeof fans)[0],
    (typeof fans)[0],
    (typeof fans)[0],
    (typeof fans)[0],
    (typeof fans)[0],
  ];

  // Tri : trois retenus (complet), deux en liste d'attente (Delta 1er, Echo 2e).
  for (const f of [alpha, bravo, charlie]) await decideApi(damien, event.id, f.applicationId, "accept");
  for (const f of [delta, echo]) await decideApi(damien, event.id, f.applicationId, "waitlist");
  const full = await apiCall<{ remaining: number | null }>(null, "GET", `/events/by-slug/${event.slug}`);
  expect(full.data.remaining).toBe(0);

  // Désistement de Bravo (avant le verrouillage, sans pénalité) → place libérée proposée à Delta.
  const fanCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await fanCtx.newPage();
  await loginInBrowser(page, bravo.email);
  page.once("dialog", (d) => void d.accept());
  const bravoCard = page.getByTestId("application").first();
  await bravoCard.getByRole("button", { name: "Me désister" }).click();
  await expect(page.getByTestId("application").first()).toHaveAttribute("data-status", "withdrawn");
  await page.context().clearCookies();

  await loginInBrowser(page, delta.email);
  const deltaCard = page.getByTestId("application").first();
  await expect(deltaCard).toHaveAttribute("data-status", "offered");
  await expect(deltaCard).toContainText("Une place s'est libérée");
  await deltaCard.getByRole("button", { name: "Accepter la place" }).click();
  await expect(page.getByTestId("application").first()).toHaveAttribute("data-status", "accepted");
  await expect(page.getByTestId("pass-qr")).toBeVisible();
  await page.context().clearCookies();

  // Echo reste 1er en liste d'attente.
  const echoCards = await apiCall<{ status: string; waitlistRank: number | null }[]>(
    echo.cookie,
    "GET",
    "/me/applications?scope=upcoming",
  );
  expect(echoCards.data[0]).toMatchObject({ status: "waitlisted", waitlistRank: 1 });

  // Jour J. Marc (contrôle) : son appli synchronise la liste signée, scanne Alpha hors ligne puis envoie la file au
  // retour du réseau (simulé ici par l'appel direct) ; le même QR relu par Julie est un doublon.
  const sync = await apiCall<{ entries: { passId: string; applicationId: string; pseudo: string }[] }>(
    marc,
    "GET",
    `/events/${event.id}/staff/sync`,
  );
  expect(sync.status).toBe(200);
  const alphaPass = sync.data.entries.find((e) => e.applicationId === alpha.applicationId);
  expect(alphaPass).toBeTruthy();
  expect(JSON.stringify(sync.data)).not.toContain(alpha.plate); // la plaque n'est jamais dans la liste du staff
  const marcDevice = await apiCall<{ id: string }>(marc, "POST", "/me/devices", {
    platform: "android",
    name: "Recette",
  });
  const scanned = await apiCall<{ results: { result: string }[] }>(marc, "POST", `/events/${event.id}/scans`, {
    deviceId: marcDevice.data.id,
    items: [
      {
        kind: "scan",
        id: randomUUID(),
        passId: alphaPass?.passId,
        decision: "ok",
        scannedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
    ],
  });
  expect(scanned.status).toBe(200);
  expect(scanned.data.results[0]?.result).toBe("accepted");
  const julieDevice = await apiCall<{ id: string }>(julie, "POST", "/me/devices", { platform: "ios", name: "Recette" });
  const dup = await apiCall<{ results: { result: string }[] }>(julie, "POST", `/events/${event.id}/scans`, {
    deviceId: julieDevice.data.id,
    items: [
      {
        kind: "scan",
        id: randomUUID(),
        passId: alphaPass?.passId,
        decision: "ok",
        scannedAt: new Date().toISOString(),
      },
    ],
  });
  expect(dup.data.results[0]?.result).toMatch(/^duplicate/);

  // Julie pointe Delta par sa plaque, sur le site (« Jour J et après »).
  const staffCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const staffPage = await staffCtx.newPage();
  await loginInBrowser(staffPage, "julie@orasso.local", SEED_PASSWORD, `/orga/meditesportcar/e/${event.id}/jour-j`);
  await staffPage.getByLabel(/Plaques/).fill(delta.plate);
  await staffPage.getByRole("button", { name: "Pointer" }).first().click();
  await expect(staffPage.getByTestId("plate-outcome")).toContainText(delta.pseudo);
  // Le staff ne voit ni avis ni contestations (réservés à l'organisation).
  await expect(staffPage.getByTestId("orga-reviews")).toHaveCount(0);
  await staffCtx.close();

  // Charlie ne vient pas. J+2 : +20 pour Alpha et Delta, −10 pour Charlie, rien pour Bravo et Echo.
  simulateSettle(event.slug);
  const pointsOf = async (c: Cookie) =>
    (await apiCall<{ points: number | null }[]>(c, "GET", "/me/applications?scope=past")).data[0]?.points ?? null;
  expect(await pointsOf(alpha.cookie)).toBe(20);
  expect(await pointsOf(delta.cookie)).toBe(20);
  expect(await pointsOf(charlie.cookie)).toBe(-10);
  expect(await pointsOf(bravo.cookie)).toBeNull();
  expect(await pointsOf(echo.cookie)).toBeNull();

  // Charlie conteste ; il n'a pas été pointé : pas d'avis possible.
  await loginInBrowser(page, charlie.email, SEED_PASSWORD, "/app/acces?vue=passes");
  const charlieCard = page.getByTestId("application").first();
  await expect(charlieCard.getByTestId("review-form")).toHaveCount(0);
  await charlieCard.getByLabel(/Contester ce malus/).fill("Panne sur la route, j'ai prévenu l'organisateur.");
  await charlieCard.getByRole("button", { name: "Contester le malus" }).click();
  await expect(charlieCard.getByText("Contesté")).toBeVisible();
  await page.context().clearCookies();

  // Alpha (3 étoiles) et Delta (2 étoiles) laissent leur avis depuis le carnet de route.
  for (const [f, stars, comment] of [
    [alpha, 3, "Accueil au top, parking bien rangé."],
    [delta, 2, "Belle soirée, un peu d'attente à l'entrée."],
  ] as const) {
    await loginInBrowser(page, f.email, SEED_PASSWORD, "/app/acces?vue=passes");
    const card = page.getByTestId("application").first();
    const form = card.getByTestId("review-form");
    await expect(form).toBeVisible();
    await expect(form.getByRole("button", { name: "Envoyer mon avis" })).toBeDisabled();
    await form.getByRole("button", { name: `${stars} étoile${stars > 1 ? "s" : ""} sur 3` }).click();
    await form.getByLabel("Ton commentaire").fill(comment);
    await form.getByRole("button", { name: "Envoyer mon avis" }).click();
    await expect(card.getByTestId("review-given")).toContainText(comment);
    await page.context().clearCookies();
  }

  // Un deuxième avis du même participant est refusé par l'API.
  const again = await apiCall(alpha.cookie, "POST", `/applications/${alpha.applicationId}/review`, {
    rating: 1,
    comment: "Encore",
  });
  expect(again.status).toBe(409);

  // L'organisateur (site, « Jour J et après ») répond à Delta et annule le malus de Charlie.
  const orgaCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const orga = await orgaCtx.newPage();
  await loginInBrowser(orga, "damien@orasso.local", SEED_PASSWORD, `/orga/meditesportcar/e/${event.id}/jour-j`);
  await expect(orga.getByTestId("orga-reviews")).toContainText("Avis · 2");
  const deltaReview = orga.getByTestId("orga-review").filter({ hasText: delta.pseudo });
  await deltaReview.getByLabel(/Réponse publique/).fill("Merci ! Deux files à l'entrée la prochaine fois.");
  await deltaReview.getByRole("button", { name: "Publier la réponse" }).click();
  await expect(deltaReview).toContainText("Ta réponse publique");
  const contest = orga.getByTestId("orga-contest").filter({ hasText: charlie.pseudo });
  await contest.getByRole("button", { name: "Annuler le malus" }).click();
  await expect(contest).toContainText("Contestation acceptée");
  expect(await pointsOf(charlie.cookie)).toBe(0);
  await orgaCtx.close();

  // Page publique : deux avis avec pseudo, réponse, pas encore de moyenne (3 avis minimum).
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pub = await visitor.newPage();
  await pub.goto(`/e/${event.slug}`);
  const section = pub.getByTestId("reviews");
  await expect(section.getByTestId("review")).toHaveCount(2);
  await expect(section).toContainText(alpha.pseudo);
  await expect(section).toContainText("Deux files à l'entrée");
  await expect(section.getByTestId("reviews-average")).toContainText("à partir de 3 avis");
  await expect(section.getByRole("img", { name: "3 étoiles sur 3" })).toBeVisible();
  await expect(section).not.toContainText(alpha.plate);
  await visitor.close();
  await fanCtx.close();
});

/** Code TOTP (RFC 6238 : HMAC-SHA1, 30 s, 6 chiffres) d'un secret base32, comme une appli d'authentification. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => Number.parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = (h[h.length - 1] ?? 0) & 0xf;
  const n = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

async function fillCode(page: Page, label: string, secret: string) {
  await page.getByLabel(label).fill(totp(secret));
}

// Double authentification réelle (sans DEV_SKIP_2FA côté connexion) : activation par code TOTP calculé, puis
// connexion qui exige le code.
test("double authentification : activation et connexion avec un code TOTP", async ({ browser }) => {
  const pseudo = `Totp_${unique()}`;
  await signUpApi(pseudo);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, email, SEED_PASSWORD, "/app/securite");
  await page.getByLabel("Ton mot de passe").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Activer" }).click();
  const keyText = await page.getByText(/^Clé : /).textContent();
  const secret = (keyText ?? "").replace("Clé : ", "").trim();
  expect(secret.length).toBeGreaterThan(10);
  await fillCode(page, "Code à 6 chiffres", secret);
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("La double authentification est activée")).toBeVisible();

  await ctx.clearCookies();
  await page.goto("/connexion?retour=/app/acces");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/connexion\/verification/);
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: /Vérifier|Valider|Confirmer/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await fillCode(page, "Code", secret);
  await page.getByRole("button", { name: /Vérifier|Valider|Confirmer/ }).click();
  await page.waitForURL(/\/app\/acces/);
  await ctx.close();
});
