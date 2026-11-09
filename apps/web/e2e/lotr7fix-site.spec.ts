import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  apiCall,
  type Cookie,
  createEvent,
  login,
  loginInBrowser,
  MOBILE,
  SEED_PASSWORD,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R7-fix-invite, côté site : le « ⋯ » de la carte d'invitation d'un passionné sur les Demandes (`/app/activite/demandes`)
// propose de couper les invitations de chacun des inviteurs (geste du lot R6c, perdu à la fusion du Fil). Kenji et Nina
// invitent Julie : une carte regroupée, un « ⋯ » à deux lignes « Couper les invitations de … ». Couper Kenji le fait sortir
// de la carte, Nina reste ; couper Nina fait partir la carte. `R7FIX_AVANT=1` : captures de la carte seule (état « avant »).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7fix-captures/apres`;
const AVANT = process.env.R7FIX_AVANT === "1";
const DESKTOP = { width: 1280, height: 900 };
test.use({ actionTimeout: 30_000 });

type Who = { pseudo: string; email: string; cookie: Cookie; id: string };

async function person(prefix: string): Promise<Who> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility: "public" });
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  return { pseudo, email, cookie, id: me.data.user.id };
}

const follow = async (a: Who, b: Who) => {
  expect((await apiCall(a.cookie, "POST", `/users/${b.pseudo}/follow`)).status).toBe(200);
};

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["beton", "sable"] as const) {
  test(`R7-fix-invite site (${theme}) : le « ⋯ » de la carte d'invitation des Demandes coupe chaque inviteur`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const orga = await login("damien@orasso.local");
    const event = await createEvent(orga, { title: `Nocturne R7fix ${unique()}`.slice(0, 40) });
    const kenji = await person("R7fKen");
    const julie = await person("R7fJul");
    const nina = await person("R7fNin");
    await follow(kenji, julie);
    await follow(nina, julie);
    await follow(julie, kenji);
    await follow(julie, nina);
    for (const [from, note] of [
      [kenji, "On y va, viens !"],
      [nina, "Viens aussi !"],
    ] as const) {
      const sent = await apiCall(from.cookie, "POST", `/events/${event.id}/peer-invitations`, {
        userIds: [julie.id],
        note,
      });
      expect(sent.status).toBe(200);
    }

    for (const [size, viewport] of [
      ["390", MOBILE],
      ["1280", DESKTOP],
    ] as const) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, julie.email, SEED_PASSWORD, "/app/activite/demandes");
      const card = page.getByTestId("request-event-invitation-peer").filter({ hasText: event.title });
      await expect(card).toContainText("t'invitent");
      await expect(card).toContainText(kenji.pseudo);
      await expect(card).toContainText(nina.pseudo);
      if (AVANT) {
        await shot(page, `demandes-invitation-${theme}-${size}`);
        await ctx.close();
        continue;
      }
      await shot(page, `demandes-invitation-${theme}-${size}`);
      await card.getByTestId("request-invite-more").click();
      await expect(card.getByTestId("invite-menu")).toBeVisible();
      await expect(card.getByTestId("invite-mute")).toHaveCount(2);
      await shot(page, `demandes-invitation-menu-${theme}-${size}`);
      if (size === "390") {
        // Couper Kenji : il sort de la carte, Nina reste, le message de confirmation s'affiche.
        await card.getByTestId("invite-mute").filter({ hasText: kenji.pseudo }).click();
        await expect(page.getByTestId("invite-muted")).toContainText(`Les invitations de ${kenji.pseudo}`);
        await expect(card).toContainText(`${nina.pseudo} t'invite`);
        await expect(card).not.toContainText(kenji.pseudo);
        const mutes = await apiCall<{ userId: string }[]>(julie.cookie, "GET", "/me/invitation-mutes");
        expect(mutes.data.map((m) => m.userId)).toEqual([kenji.id]);
        await shot(page, `demandes-invitation-coupee-${theme}-${size}`);
        // Couper Nina : plus aucune invitation, la carte part.
        // Le menu reste ouvert après un geste (comme sur la fiche) : on ne le referme pas en recliquant.
        if (!(await card.getByTestId("invite-menu").isVisible())) await card.getByTestId("request-invite-more").click();
        await card.getByTestId("invite-mute").click();
        await expect(card).toHaveCount(0);
        await apiCall(julie.cookie, "DELETE", `/me/invitation-mutes/${kenji.id}`);
        await apiCall(julie.cookie, "DELETE", `/me/invitation-mutes/${nina.id}`);
      }
      await ctx.close();
    }
  });
}
