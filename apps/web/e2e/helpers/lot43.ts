import { tokens } from "@orasso/design-system";
import type { Page } from "@playwright/test";
import { apiCall, type Cookie } from "../helpers";

// Aides de la recette du lot 43 (accès flottant, accueils par profil, Sorties) : un événement qui commence dans N jours,
// et l'audit des règles du système de design pour l'appli (version web de recette).

/** Un événement publié par MéditeSportCar qui commence dans `days` jours, à 19 h (heure locale du poste). */
export async function createEventIn(
  organizer: Cookie,
  days: number,
  title: string,
): Promise<{ id: string; slug: string; title: string }> {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(organizer, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  if (!structureId) throw new Error("Structure MéditeSportCar introuvable : le seed a-t-il tourné ?");
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(19, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 3600 * 1000);
  const created = await apiCall<{ id: string; slug: string }>(organizer, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car", "moto"],
    capacity: 40,
    maxVehiclesPerUser: 2,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Pas de burn, pas de bruit inutile, on respecte les riverains.",
    description: "Événement de test créé par la recette du lot 43.",
  });
  if (created.status !== 201) {
    throw new Error(`Création de l'événement : ${created.status} ${JSON.stringify(created.data)}`);
  }
  const published = await apiCall(organizer, "POST", `/events/${created.data.id}/publish`);
  if (published.status !== 200) throw new Error(`Publication : ${published.status} ${JSON.stringify(published.data)}`);
  return { id: created.data.id, slug: created.data.slug, title };
}

export type AppAudit = {
  primaryButtons: number;
  primaryLabels: string[];
  neon: number;
  neonLabels: string[];
  buttonsWithoutIcon: string[];
  greens: string[];
  horizontalScroll: boolean;
  unoutlinedOnPhoto: string[];
};

/**
 * Les règles du système de design sur l'écran de l'appli (version web de recette : react-native-web n'a pas les classes
 * du site, on les reconnaît à leur rendu). Bouton principal = le bouton qui porte l'ombre « néon » du thème ; néon = toute
 * pièce qui porte une des ombres néon moutarde, hors barre d'onglets et barre du haut (permanentes) ; tout bouton
 * (étiquette en capitales) porte une icône ; le texte posé sur l'affiche de l'accueil est en contour (le texte et ses
 * huit copies de contour : neuf éléments de même texte).
 */
export async function auditApp(page: Page, theme: "beton" | "sable" = "beton"): Promise<AppAudit> {
  const shadows = tokens.shadow[theme];
  return page.evaluate(
    ({ primary, neons }) => {
      // Les onglets voisins restent montés (hors de l'écran, ou masqués) : seul ce qui se voit compte.
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        const onScreen = r.right > 0 && r.left < window.innerWidth;
        return (
          r.width > 0 &&
          r.height > 0 &&
          onScreen &&
          el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        );
      };
      // Un onglet voisin sous l'actif est marqué aria-hidden : il ne compte pas (les copies de contour non plus, voir plus bas).
      const visible = (el: Element) => shown(el) && !el.closest('[aria-hidden="true"]');
      const resolve = (value: string) => {
        const probe = document.createElement("div");
        probe.style.boxShadow = value;
        document.body.appendChild(probe);
        const out = getComputedStyle(probe).boxShadow;
        probe.remove();
        return out;
      };
      const primaryShadow = resolve(primary);
      const neonShadows = new Set(neons.map(resolve));
      const all = [...document.querySelectorAll("body *")].filter(visible);
      const label = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      // Barres permanentes : la barre d'onglets, et la barre du haut (pastille de la Boîte comprise, dans les 72 premiers px).
      const inBars = (el: Element) =>
        Boolean(el.closest('[role="tablist"]')) || el.getBoundingClientRect().bottom <= 72;
      const buttons = all.filter((el) => el.getAttribute("role") === "button");
      const isGreen = (color: string) => {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
        if (!m) return false;
        const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
        if (a < 0.2) return false;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 40 || max !== g) return false;
        let h = 60 * ((b - r) / (max - min)) + 120;
        if (h < 0) h += 360;
        return h > 85 && h < 165;
      };
      const greens = new Set<string>();
      for (const el of all) {
        const s = getComputedStyle(el);
        for (const c of [s.color, s.backgroundColor, s.borderTopColor]) {
          if (isGreen(c)) greens.add(`${el.tagName} ${c}`);
        }
      }
      const primaries = buttons.filter((el) => getComputedStyle(el).boxShadow === primaryShadow && !inBars(el));
      const neon = all.filter((el) => neonShadows.has(getComputedStyle(el).boxShadow) && !inBars(el));
      // Le texte de l'affiche (hors pastille du jour, posée sur un fond plein) : chaque texte et ses huit copies.
      const art = document.querySelector('[data-testid="home-hero-art"]');
      const counts = new Map<string, number>();
      if (art) {
        for (const el of art.querySelectorAll("*")) {
          if (el.closest('[data-testid="home-hero-date"]') || el.closest("svg") || !shown(el)) continue;
          const own = [...el.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent ?? "").trim())
            .join("");
          if (own) counts.set(own, (counts.get(own) ?? 0) + 1);
        }
      }
      // Étiquette d'un bouton du système : Archivo large (Expanded) en capitales ; les cartes cliquables n'en ont pas.
      const upper = (el: Element) =>
        [el, ...el.querySelectorAll("*")].some((c) => {
          const st = getComputedStyle(c);
          return st.textTransform === "uppercase" && /Expanded/.test(st.fontFamily);
        });
      return {
        primaryButtons: primaries.length,
        primaryLabels: primaries.map(label),
        neon: neon.length,
        neonLabels: neon.map(label),
        buttonsWithoutIcon: buttons
          .filter((el) => el.tagName === "BUTTON" && upper(el) && !inBars(el) && !el.querySelector("svg") && label(el))
          .map(label),
        greens: [...greens].slice(0, 10),
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        unoutlinedOnPhoto: [...counts].filter(([, n]) => n < 9).map(([text]) => text),
      };
    },
    { primary: shadows.neonAccent, neons: [shadows.neonAccent, shadows.neonAccentSoft, shadows.neonScan] },
  );
}
