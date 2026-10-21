import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page } from "@playwright/test";
import { MOBILE, SEED_PASSWORD } from "../helpers";
import { RELAIS } from "../relais";
import { auditApp } from "./lot43";

// Outils communs des recettes de l'appli du lot 52 (casquette Organisateur) : ouverture d'un contexte à 390 px, connexion,
// bascule vers la casquette, captures et règles du système de design.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-52-captures/appli`;

export type Theme = "beton" | "sable";
export const THEMES: Theme[] = ["beton", "sable"];

export async function open(
  browser: Browser,
  theme: Theme,
  reducedMotion: "reduce" | "no-preference" = "no-preference",
) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP, reducedMotion });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

export async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

export async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

/** Casquette Organisateur (la première structure de la liste, ou celle dont le nom est donné). */
export async function toOrganizer(page: Page, structure?: string) {
  await page.goto("/moi");
  await afterOpening(page);
  const tile = page.getByTestId("casquette-organizer");
  await (structure ? tile.filter({ hasText: structure }) : tile).first().click();
  await page.waitForURL(/\/direct/, { timeout: 60_000 });
}

export async function tab(page: Page, label: string) {
  await page.getByRole("tab", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

export async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

/** Règles du système de design à l'écran : un seul primaire, un seul néon, icône partout, pas de vert, pas de défilement horizontal. */
export async function rules(page: Page, theme: Theme, name: string) {
  await page.waitForTimeout(1200);
  const a = await auditApp(page, theme);
  expect(a.primaryButtons, `${name} : un seul bouton principal (${a.primaryLabels.join(" | ")})`).toBeLessThanOrEqual(
    1,
  );
  expect(a.neon, `${name} : un seul néon (${a.neonLabels.join(" | ")})`).toBeLessThanOrEqual(1);
  expect(a.buttonsWithoutIcon, `${name} : tout bouton porte une icône`).toEqual([]);
  expect(a.greens, `${name} : pas de vert`).toEqual([]);
  expect(a.horizontalScroll, `${name} : pas de défilement horizontal`).toBe(false);
  expect(a.unoutlinedOnPhoto, `${name} : texte sur photo en contour`).toEqual([]);
}

export async function closeSheet(page: Page) {
  await page
    .getByRole("button", { name: "Fermer", exact: true })
    .last()
    .click({ position: { x: 60, y: 15 } });
  await page.waitForTimeout(400);
}
