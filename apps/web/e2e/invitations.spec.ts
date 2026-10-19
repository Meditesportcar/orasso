import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  createEvent,
  fillArrivee,
  login,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";

// Invitations nominatives et événement privé (lot 25) sur le site, critère de fin : l'organisateur crée un événement
// « Sur invitation », invite Kenji (pseudo) et une adresse e-mail depuis `/orga/…/invitations` ; Kenji accepte dans
// Accès avec sa voiture (retenu, QR) ; un non-invité ne voit ni la liste ni la page ; l'adresse e-mail s'inscrit par le
// lien reçu et accepte avec un véhicule. Avec CAPTURES=1 : écrans du lot dans les deux thèmes, au bureau et à 390 px,
// avec le contrôle du système de design. Prérequis : site et API lancés (DEV_SKIP_2FA=true) sur la base avec le seed.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-25-captures/site";
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const MAIL_DIR = resolve(import.meta.dirname, "../../..", process.env.DATA_DIR ?? ".data", "mail");
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;

async function context(
  browser: Browser,
  cookie: string,
  opts: { theme?: string; width?: number; height?: number } = {},
) {
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

/** Lien `/invitation-evenement/<jeton>` du dernier e-mail envoyé à `to` (attend jusqu'à 15 s). */
async function invitationLink(to: string, since: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const files = readdirSync(MAIL_DIR)
      .map((name) => ({ name, at: statSync(resolve(MAIL_DIR, name)).mtimeMs }))
      .filter((f) => f.at >= since - 1000)
      .sort((a, b) => b.at - a.at);
    for (const f of files) {
      const html = readFileSync(resolve(MAIL_DIR, f.name), "utf8");
      if (!html.startsWith(`<!-- À : ${to} -->`)) continue;
      const m = /href="https?:\/\/[^"]*(\/invitation-evenement\/[A-Za-z0-9_-]+)"/.exec(html);
      if (m?.[1]) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Aucune invitation par e-mail pour ${to}`);
}

test("événement privé : invitations par pseudo et par e-mail, acceptation avec QR, invisible pour les autres", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const kenji = `Kenji_${s}`.slice(0, 24);
  const email = `invite-${s}@orasso.test`;
  const kCookie = await signUpApi(kenji);
  await addVehicleApi(kCookie, randomPlate());
  const outsider = await signUpApi(`Intrus_${s}`.slice(0, 24));
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer, { title: `Soirée privée ${s}`, admission: "invite_only" });

  // L'organisateur invite Kenji et une adresse e-mail.
  const since = Date.now();
  const ctxO = await context(browser, organizer, { theme: "sable" });
  const pageO = await ctxO.newPage();
  await pageO.goto(`/orga/meditesportcar/e/${event.id}`);
  await pageO.getByTestId("orga-invitations-link").click();
  await pageO.waitForURL(/\/invitations$/);
  await pageO.getByLabel("Par pseudo").fill(kenji);
  await pageO.getByLabel("Par e-mail").fill(email);
  await pageO.getByLabel("Message (facultatif)").fill("On compte sur toi !");
  await pageO.getByTestId("invite-send").click();
  await expect(pageO.getByTestId("invitations-ok")).toContainText("2 invitations envoyées");
  await expect(pageO.getByTestId("invitation-row")).toHaveCount(2);

  // Un non-invité ne voit ni la liste ni la page.
  const ctxX = await context(browser, outsider);
  const pageX = await ctxX.newPage();
  await pageX.goto(`/evenements`);
  await expect(pageX.getByText(event.title)).toHaveCount(0);
  await pageX.goto(`/e/${event.slug}`);
  await expect(pageX.getByTestId("private-event")).toBeVisible();
  await expect(pageX.getByText(event.title)).toHaveCount(0);

  // Kenji accepte dans Accès : retenu avec son QR.
  const ctxK = await context(browser, kCookie);
  const pageK = await ctxK.newPage();
  await pageK.goto("/app/acces");
  const card = pageK.getByTestId("received-invitation");
  await expect(card).toContainText(event.title);
  await expect(card).toContainText("On compte sur toi !");
  await card.getByTestId("invitation-accept").click();
  await expect(pageK.getByTestId("acces-ok")).toContainText("tu es retenu");
  await expect(pageK.getByTestId("received-invitation")).toHaveCount(0);
  await expect(pageK.locator('[data-testid="application"][data-status="accepted"]')).toContainText(event.title);
  await expect(pageK.getByTestId("pass-qr")).toBeVisible();
  await pageK.goto(`/e/${event.slug}`);
  await expect(pageK.getByTestId("invite-only")).toHaveCount(0);
  await expect(pageK.getByRole("heading", { name: event.title })).toBeVisible();

  // L'adresse e-mail s'inscrit par le lien reçu puis accepte avec un véhicule.
  const link = await invitationLink(email, since);
  const ctxE = await browser.newContext();
  const pageE = await ctxE.newPage();
  await pageE.goto(link);
  await expect(pageE.getByTestId("invitation-link")).toContainText(event.title);
  await pageE.getByLabel("Pseudo").fill(`Invite_${s}`.slice(0, 24));
  await pageE.getByLabel("E-mail").fill(email);
  await pageE.getByRole("textbox", { name: "Mot de passe" }).fill(SEED_PASSWORD);
  await fillArrivee(pageE);
  await pageE.getByLabel("J'accepte les conditions générales d'utilisation d'Orasso").check();
  await pageE.getByRole("button", { name: "Créer un compte" }).click();
  await expect(pageE.getByTestId("received-invitation")).toBeVisible();
  const eCookie = (await ctxE.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  await addVehicleApi(eCookie, randomPlate());
  await pageE.reload();
  await pageE.getByTestId("invitation-accept").click();
  await pageE.waitForURL(/\/app\/acces/);
  await expect(pageE.locator('[data-testid="application"][data-status="accepted"]')).toContainText(event.title);

  const list = await apiCall<{ status: string }[]>(organizer, "GET", `/events/${event.id}/invitations`);
  expect(list.data.map((i) => i.status).sort()).toEqual(["accepted", "accepted"]);
  for (const ctx of [ctxO, ctxX, ctxK, ctxE]) await ctx.close();

  if (process.env.CAPTURES !== "1") return;
  mkdirSync(DIR, { recursive: true });
  const audits: Record<string, Audit> = {};
  // Une invitation en attente (Accès, Demandes), un lien non ouvert, un événement avec avant-premières.
  const nina = await signUpApi(`Nina_${s}`.slice(0, 24));
  await addVehicleApi(nina, randomPlate());
  const since2 = Date.now();
  await apiCall(organizer, "POST", `/events/${event.id}/invitations`, {
    pseudos: [`Nina_${s}`.slice(0, 24)],
    emails: [`autre-${s}@orasso.test`],
    message: "Merci pour ta fidélité, on t'attend.",
  });
  const pendingLink = await invitationLink(`autre-${s}@orasso.test`, since2);
  const open = await createEvent(organizer, { title: `Expo avant-premières ${s}` });
  await apiCall(organizer, "PATCH", `/events/${open.id}`, {
    previewHours: 24,
    highGradePreviewHours: 48,
    highGradePriority: true,
  });
  const shots: { name: string; cookie: string; path: string }[] = [
    { name: "01-orga-invitations", cookie: organizer, path: `/orga/meditesportcar/e/${event.id}/invitations` },
    { name: "02-acces-invitation", cookie: nina, path: "/app/acces" },
    { name: "03-demandes", cookie: nina, path: "/app/boite/demandes" },
    { name: "04-evenement-prive", cookie: outsider, path: `/e/${event.slug}` },
    { name: "05-lien-invitation", cookie: "", path: pendingLink },
    { name: "06-evenement-invite", cookie: nina, path: `/e/${event.slug}` },
    { name: "07-avant-premieres", cookie: outsider, path: `/e/${open.slug}` },
  ];
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      for (const shot of shots) {
        const ctx = await context(browser, shot.cookie, { theme, width: view.width, height: view.height });
        const page = await ctx.newPage();
        await page.goto(shot.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${DIR}/${shot.name}-${theme}-${view.id}.png`, fullPage: true });
        audits[`${shot.name}-${theme}-${view.id}`] = await auditPage(page);
        await ctx.close();
      }
    }
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  for (const [key, audit] of Object.entries(audits)) {
    expect(audit.buttonsWithoutIcon, key).toEqual([]);
    expect(audit.greens, key).toEqual([]);
    expect(audit.truncated, key).toEqual([]);
    expect(audit.horizontalScroll, key).toBe(false);
    expect(audit.primaryButtons, key).toBeLessThanOrEqual(1);
  }
});
