import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, login, loginInBrowser, randomPlate, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7m1, côté site : les partenariats pro ↔ passionné. Un pro vérifié (Garage_Port, du seed) propose depuis le profil d'un
// passionné neuf (« Proposer un partenariat », formulaire sans JavaScript) → « Proposition envoyée » ; le passionné la trouve
// dans Activité › Demandes (texte, voiture) et l'accepte → la ligne « Partenaires » de Mon compte, « Ses partenaires » sur la
// fiche du pro (rien sans compte connecté) → « Mettre fin » (confirmation) → tout disparaît. Côté pro : retirer une proposition
// sans réponse, mettre fin à un partenariat. Réglage de la date de l'abonnement dans l'administration.
// Prérequis : site et API lancés sur la base locale avec le seed (DEV_SKIP_2FA=true).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7m1-captures/apres/recette-site`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function newMember() {
  const pseudo = `Pt_${unique()}`;
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo);
  const vehicleId = await addVehicleApi(cookie, randomPlate());
  return { pseudo, email, cookie, vehicleId };
}

for (const theme of ["beton", "sable"] as const) {
  for (const [width, height] of [
    [390, 900],
    [1280, 900],
  ] as const) {
    test(`partenariat de bout en bout sur le site (${theme}, ${width} px)`, async ({ browser }) => {
      test.setTimeout(300_000);
      const tag = `${theme}-${width}`;
      const member = await newMember();
      const proCookie = await login("garage@orasso.local");
      const proId = (await apiCall<{ id: string }>(proCookie, "GET", "/me/pro")).data.id;

      // 1. Le pro propose depuis le profil du passionné.
      {
        const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, "garage@orasso.local", undefined, "/app");
        await page.goto(`/u/${member.pseudo}`);
        await expect(page.getByTestId("partnership-propose")).toBeVisible();
        await shot(page, `pp_profil-${tag}`);
        await page.getByTestId("partnership-propose").locator("summary").click();
        await page.locator("#partnership-message").fill("Covering offert, on te suit sur la saison");
        await page.locator(`input[name="vehicleId"][value="${member.vehicleId}"]`).check();
        await shot(page, `pp_feuille-${tag}`);
        await page.getByTestId("partnership-send").click();
        await expect(page.getByTestId("partnership-pending")).toBeVisible({ timeout: 20_000 });
        await shot(page, `pp_sent-${tag}`);
        await ctx.close();
      }

      // 2. Le passionné la trouve dans Demandes et l'accepte.
      const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, member.email, undefined, "/app");
      await page.goto("/app/activite/demandes");
      const card = page.getByTestId("request-partnership");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Garage du Port te propose un partenariat");
      await expect(card).toContainText("Covering offert, on te suit sur la saison");
      await expect(page.getByTestId("request-partnership-vehicle")).toContainText("Partenaire : Garage du Port");
      await shot(page, `pq_dem-${tag}`);
      await card.getByRole("button", { name: "Accepter" }).click();
      await expect(page.getByTestId("request-partnership")).toHaveCount(0, { timeout: 20_000 });

      // 3. Mon compte : la ligne « Partenaires » ; la fiche du pro : « Ses partenaires » (connecté seulement).
      await page.goto("/app/moi");
      // Lot R8b1 : les partenaires sont le 4e compteur de la bande ; il mène à la liste.
      await expect(page.getByTestId("profil-count-partenaires")).toContainText("1");
      await page.getByTestId("profil-count-partenaires").click();
      const line = page.getByTestId("partners-line");
      await expect(line).toContainText("Partenaires · 1");
      await expect(line).toContainText("Garage du Port");
      await shot(page, `pq_pro-${tag}`);
      {
        const other = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
        const op = await other.newPage();
        await setTheme(op, theme);
        await op.goto("/p/garage-du-port");
        await expect(op.locator("#pro-title")).toHaveText("Garage du Port");
        // Sans compte connecté : aucun passionné cité.
        await expect(op.getByTestId("pro-member-partners")).toHaveCount(0);
        await other.close();
        const kenji = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
        const kp = await kenji.newPage();
        await setTheme(kp, theme);
        await loginInBrowser(kp, "kenji@orasso.local", undefined, "/app");
        await kp.goto("/p/garage-du-port");
        await expect(kp.getByTestId("pro-member-partners")).toContainText(member.pseudo);
        await shot(kp, `pp_fiche-${tag}`);
        await kenji.close();
      }

      // 4. « Mettre fin » : confirmation, puis la ligne disparaît et le pro est prévenu.
      await line.locator("[data-testid=partnership-end] summary").click();
      await shot(page, `pq_end-${tag}`);
      await page.getByTestId("partnership-end-confirm").click();
      await expect(page.getByTestId("partners-line")).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByRole("status").filter({ hasText: "Partenariat terminé" })).toBeVisible();
      await ctx.close();
      const after = await apiCall<{ memberPartners: { pseudo: string }[] }>(
        member.cookie,
        "GET",
        "/pros/by-slug/garage-du-port",
      );
      expect(after.data.memberPartners.map((p) => p.pseudo)).not.toContain(member.pseudo);

      // 5. Côté pro : retirer une proposition sans réponse ; mettre fin à un partenariat ; la date de l'abonnement.
      if (theme === "beton" && width === 1280) {
        const waiting = await newMember();
        const active = await newMember();
        const sent = await apiCall<{ id: string }>(proCookie, "POST", `/pros/${proId}/partnerships`, {
          userPseudo: waiting.pseudo,
          message: "En attente",
        });
        expect(sent.status).toBe(201);
        const second = await apiCall<{ id: string }>(proCookie, "POST", `/pros/${proId}/partnerships`, {
          userPseudo: active.pseudo,
          message: "À accepter",
        });
        await apiCall(active.cookie, "POST", `/me/partnerships/${second.data.id}/accept`);

        const pc = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", baseURL: WEB });
        const pp = await pc.newPage();
        await setTheme(pp, "sable");
        await loginInBrowser(pp, "garage@orasso.local", undefined, "/app");
        await pp.goto("/pro/garage-du-port");
        const rows = pp.getByTestId("partnership-row");
        await expect(rows.filter({ hasText: waiting.pseudo })).toBeVisible();
        await expect(rows.filter({ hasText: active.pseudo })).toBeVisible();
        await shot(pp, "pro-fiche-partenaires-sable-1280");
        await rows.filter({ hasText: waiting.pseudo }).getByTestId("partnership-withdraw").click();
        await expect(rows.filter({ hasText: waiting.pseudo })).toHaveCount(0, { timeout: 20_000 });
        await rows.filter({ hasText: active.pseudo }).locator("[data-testid=partnership-end] summary").click();
        await rows.filter({ hasText: active.pseudo }).getByTestId("partnership-end-confirm").click();
        await expect(rows.filter({ hasText: active.pseudo })).toHaveCount(0, { timeout: 20_000 });
        // Le passionné est prévenu de la fin ; la proposition retirée a disparu de ses Demandes.
        const notes = await apiCall(active.cookie, "GET", "/me/notifications");
        expect(JSON.stringify(notes.data)).toContain("partnership_ended");
        expect((await apiCall<{ items: unknown[] }>(waiting.cookie, "GET", "/me/requests")).data.items).toEqual([]);
        await pc.close();
      }
    });
  }
}

test("réglage : la date à partir de laquelle il faut l'abonnement pro (administration)", async ({ browser }) => {
  const damien = await login("damien@orasso.local");
  const read = async () =>
    (await apiCall<{ entries: { key: string; value: string }[] }>(damien, "GET", "/admin/settings")).data.entries.find(
      (e) => e.key === "partnerships.subscription_from",
    )?.value;
  expect(await read()).toBe("2027-06-21");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cookies: { name: string; value: string; url: string }[] = [];
  for (const pair of damien.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: WEB });
  }
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${WEB}/admin/reglages`);
  const form = page.getByTestId("admin-partnerships");
  await expect(form.getByLabel(/Partenariats : réservés/)).toHaveValue("2027-06-21");
  await form.getByLabel(/Partenariats : réservés/).fill("2027-12-01");
  await form.getByRole("button", { name: "Enregistrer la date" }).click();
  await expect(page.getByTestId("settings-done")).toBeVisible();
  expect(await read()).toBe("2027-12-01");
  // Une date qui n'existe pas est refusée.
  expect(
    (await apiCall(damien, "PUT", "/admin/settings/partnerships.subscription_from", { value: "2027-02-30" })).status,
  ).toBe(400);
  // Remise à la date de Damien : la recette reste rejouable.
  await apiCall(damien, "PUT", "/admin/settings/partnerships.subscription_from", { value: "2027-06-21" });
  expect(await read()).toBe("2027-06-21");
  await ctx.close();
});
