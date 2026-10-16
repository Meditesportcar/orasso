import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";

// Recette du mode staff hors ligne dans l'appli (navigateur, lot 12) : Julie (scan) synchronise la liste du Salon du
// seed, le réseau est coupé (navigateur hors ligne), elle lit un QR valide et un QR falsifié, la lecture part en file,
// puis le réseau revient et la file se vide seule ; l'organisateur voit l'entrée.
// Lancer avec APP_URL=http://localhost:8111 (Metro derrière apps/mobile/scripts/web-isolated.mjs).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-12-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

test("mode staff hors ligne : synchro, scan sans réseau, file envoyée au retour", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const julie = await login("julie@orasso.local");
  const damien = await login("damien@orasso.local");
  const staffEvents = await apiCall<{ event: { id: string; title: string } }[]>(julie, "GET", "/me/staff-events");
  const salon = staffEvents.data.find((s) => s.event.title.includes("Salon"))?.event;
  expect(salon).toBeTruthy();
  const list = await apiCall<{ applicationId: string; pseudo: string; checkedInAt: string | null }[]>(
    damien,
    "GET",
    `/events/${salon?.id}/checkins`,
  );
  // Un pilote du seed retenu et pas encore entré : son QR (lu comme le ferait son téléphone).
  let target: { pseudo: string; payload: string; applicationId: string } | null = null;
  for (const item of list.data.filter((i) => !i.checkedInAt && /^Pilote_\d+$/.test(i.pseudo))) {
    const n = Number(item.pseudo.split("_")[1]);
    const cookie = await login(`pilote${n}@orasso.local`).catch(() => null);
    if (!cookie) continue;
    const pass = await apiCall<{ payload: string | null }>(cookie, "GET", `/applications/${item.applicationId}/pass`);
    if (pass.status === 200 && pass.data.payload) {
      target = { pseudo: item.pseudo, payload: pass.data.payload, applicationId: item.applicationId };
      break;
    }
  }
  expect(target).toBeTruthy();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "sable");
  });
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill("julie@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  await page.goto(`/staff/${salon?.id}`);
  await page.getByRole("button", { name: "Synchroniser la liste" }).click();
  await expect(page.getByRole("button", { name: "Ouvrir le scan" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/10-staff-entree-synchro-sable.png` });

  await page.getByRole("button", { name: "Ouvrir le scan" }).click();
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.evaluate((p) => {
    (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = true;
    (globalThis as unknown as { __orassoScan: (x: string) => void }).__orassoScan(p);
  }, target?.payload ?? "");
  await expect(page.getByText(target?.pseudo ?? "—").first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${DIR}/11-staff-scan-hors-ligne-ok-sable.png` });
  await page.waitForTimeout(1500);
  // QR falsifié : un caractère de la signature changé.
  const forged = `${target?.payload.slice(0, -3)}${target?.payload.endsWith("A") ? "B" : "A"}${target?.payload.slice(-2)}`;
  await page.evaluate((p) => (globalThis as unknown as { __orassoScan: (x: string) => void }).__orassoScan(p), forged);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/12-staff-scan-falsifie-sable.png` });
  await page.evaluate(() => {
    (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold = false;
  });
  await page.waitForTimeout(2000);
  await page.goBack();
  await expect(page.getByText(/en attente|à envoyer/i).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${DIR}/13-staff-file-hors-ligne-sable.png` });

  // Réseau rétabli : la file part seule ; l'organisateur voit l'entrée.
  await ctx.setOffline(false);
  await expect
    .poll(
      async () => {
        const after = await apiCall<{ applicationId: string; checkedInAt: string | null }[]>(
          damien,
          "GET",
          `/events/${salon?.id}/checkins`,
        );
        return after.data.find((i) => i.applicationId === target?.applicationId)?.checkedInAt ?? null;
      },
      { timeout: 90_000, intervals: [3_000] },
    )
    .not.toBeNull();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/14-staff-file-envoyee-sable.png` });
  await ctx.close();
});
