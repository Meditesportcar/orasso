import { useId } from "react";
import { THEME_IDS, type ThemeId, tokens } from "../../tokens";

type Texture = {
  readonly baseFrequency: number | string;
  readonly numOctaves: number;
  readonly color: readonly number[];
  readonly alpha: number;
};

// feColorMatrix : la couleur est constante, seul l'alpha vient du bruit (grain et brossage des jetons).
function matrix(t: Texture): string {
  const [r, g, b] = t.color;
  return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${t.alpha} 0`;
}

function TextureSvg({ texture, theme, className }: { texture: Texture; theme: ThemeId; className: string }) {
  const id = `${useId().replaceAll(":", "")}-${theme}`;
  return (
    <svg aria-hidden="true" focusable="false" className={`${className} ${className}--${theme}`}>
      <filter id={id}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency={texture.baseFrequency}
          numOctaves={texture.numOctaves}
          stitchTiles="stitch"
        />
        <feColorMatrix values={matrix(texture)} />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

/** Le grain d'asphalte du fond (feTurbulence 0,9, deux octaves). Un SVG par thème, CSS affiche le bon. */
export function Grain() {
  return THEME_IDS.map((theme) => (
    <TextureSvg key={theme} texture={tokens.grain[theme]} theme={theme} className="o-grain" />
  ));
}

/** Le brossage des barres (feTurbulence très étiré), à poser en z-index −1 dans un conteneur isolé. */
export function Brush() {
  return THEME_IDS.map((theme) => (
    <TextureSvg key={theme} texture={tokens.barBrush[theme]} theme={theme} className="o-brush" />
  ));
}
