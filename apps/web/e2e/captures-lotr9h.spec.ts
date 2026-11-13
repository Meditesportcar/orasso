import { mkdirSync } from "node:fs";
import { type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9h : captures « avant » et « après » du site de chaque casquette (Béton et Sable, 390 et 1280 px). `PHASE=avant|apres`
// (avant : les pages d'aujourd'hui, prises sur la base du lot ; après : les mêmes plus le Fil de chaque casquette, la barre du haut
// d'espace et la sous-navigation Média et Prestataire). Ce n'est pas une recette : aucune attente de fond, des images.
const PHASE = process.env.PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9h-captures/${PHASE}`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: !name.includes("fil") });
}

type Me = {
  pro: { slug: string } | null;
  personas: { kind: string; id: string }[];
  memberships: { structureSlug: string }[];
};

const ACCOUNTS = {
  orga: { email: "damien@orasso.local", pages: [] as string[] },
  roues: { email: "sarah@orasso.local", pages: [] as string[] },
  pro: { email: "garage@orasso.local", pages: [] as string[] },
  media: { email: "leo@orasso.local", pages: [] as string[] },
  provider: { email: "sofia@orasso.local", pages: [] as string[] },
};

for (const theme of ["beton", "sable"] as const) {
  for (const viewport of [MOBILE, { width: 1280, height: 800 }] as const) {
    test(`captures ${PHASE} (${theme}, ${viewport.width} px)`, async ({ browser }) => {
      test.setTimeout(900_000);
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      const tag = `${theme}-${viewport.width}`;
      const meOf = async (email: string) => {
        const cookie = await login(email);
        return (await apiCall<Me>(cookie, "GET", "/me")).data;
      };
      const open = async (email: string, to: string) => {
        await ctx.clearCookies();
        await setTheme(page, theme);
        await loginInBrowser(page, email, undefined, to);
        await page.goto(to);
      };

      // Passionné : le Fil d'aujourd'hui.
      await open(ACCOUNTS.orga.email, "/app/fil");
      await shot(page, `passionne-fil-${tag}`);

      // Organisateur : la barre latérale (et, après, la barre du haut).
      await open(ACCOUNTS.orga.email, "/orga/meditesportcar");
      await shot(page, `orga-index-${tag}`);

      // Pro.
      const pro = (await meOf(ACCOUNTS.pro.email)).pro;
      if (pro) {
        await open(ACCOUNTS.pro.email, `/pro/${pro.slug}`);
        await shot(page, `pro-fiche-${tag}`);
      }

      // Média.
      const media = (await meOf(ACCOUNTS.media.email)).personas.find((p) => p.kind === "media");
      await open(ACCOUNTS.media.email, "/app/media");
      await shot(page, `media-espace-${tag}`);
      if (media) {
        await page.goto(`/m/${media.id}`);
        await shot(page, `media-publique-${tag}`);
      }

      // Prestataire.
      const provider = (await meOf(ACCOUNTS.provider.email)).personas.find((p) => p.kind === "provider");
      await open(ACCOUNTS.provider.email, "/app/prestataire");
      await shot(page, `prestataire-espace-${tag}`);
      if (provider) {
        await page.goto(`/providers/${provider.id}`);
        await shot(page, `prestataire-publique-${tag}`);
      }

      if (PHASE === "apres") {
        await open(ACCOUNTS.roues.email, "/orga/roues-libres-66/fil");
        await shot(page, `orga-fil-${tag}`);
        if (pro) {
          await open(ACCOUNTS.pro.email, `/pro/${pro.slug}/fil`);
          await shot(page, `pro-fil-${tag}`);
        }
        await open(ACCOUNTS.media.email, "/app/media/fil");
        await shot(page, `media-fil-${tag}`);
        await open(ACCOUNTS.provider.email, "/app/prestataire/fil");
        await shot(page, `prestataire-fil-${tag}`);
      }
      await ctx.close();
    });
  }
}
