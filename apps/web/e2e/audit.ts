import type { Page } from "@playwright/test";

// Contrôle automatique des règles du système de design sur l'écran affiché (CLAUDE.md, règle 2) : un seul bouton
// principal, un seul néon moutarde, tout bouton porte une icône, pas de vert, aucun texte tronqué par des points de
// suspension, pas de défilement horizontal. Sert à la recette (lot 12) ; ne remplace pas le regard sur les captures.
// Lot 38 (DA v2, écart 1) : tout texte visible posé sur une photo ou sur le fond animé (`.o-cover`, `[data-onbg]`) porte
// le contour couleur du fond (`-webkit-text-stroke`) : `unoutlinedOnPhoto` liste ceux qui n'en ont pas.
export type Audit = {
  primaryButtons: number;
  neonAccent: number;
  buttonsWithoutIcon: string[];
  greens: string[];
  truncated: string[];
  horizontalScroll: boolean;
  unoutlinedOnPhoto: string[];
};

export async function auditPage(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
    };
    const probe = document.createElement("div");
    probe.style.boxShadow = "var(--neon-accent)";
    document.body.appendChild(probe);
    const neon = getComputedStyle(probe).boxShadow;
    probe.remove();
    const all = [...document.querySelectorAll("body *")].filter(visible);
    const label = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
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
      for (const c of [s.color, s.backgroundColor, s.borderTopColor]) if (isGreen(c)) greens.add(`${el.tagName} ${c}`);
    }
    return {
      primaryButtons: all.filter((el) => el.classList.contains("o-button--primary")).length,
      neonAccent: neon && neon !== "none" ? all.filter((el) => getComputedStyle(el).boxShadow === neon).length : 0,
      buttonsWithoutIcon: all.filter((el) => el.classList.contains("o-button") && !el.querySelector("svg")).map(label),
      greens: [...greens].slice(0, 10),
      truncated: all
        .filter((el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        .map(label),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      unoutlinedOnPhoto: [...document.querySelectorAll(".o-cover, [data-onbg]")]
        .flatMap((zone) => [zone, ...zone.querySelectorAll("*")])
        .filter((el) => visible(el) && !el.closest("svg"))
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim()))
        .filter((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("-webkit-text-stroke-width")) <= 0)
        .map(label)
        .slice(0, 10),
    };
  });
}
