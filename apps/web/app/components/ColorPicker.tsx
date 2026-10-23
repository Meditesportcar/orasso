// Le nuancier du site (lot M1, même données que l'appli) : familles en onglets, pastilles rondes avec le reflet de leur
// finition (dégradés CSS calculés depuis `bodyColors`), nom de la teinte dessous, choix cerclé, « Autre teinte » à
// saisie libre (40 caractères). Le champ envoyé s'appelle `color` et porte le NOM de la teinte.

import { TextField } from "@orasso/design-system/web";
import {
  BODY_COLOR_LIGHT,
  BODY_COLOR_SHADE,
  type BodyColor,
  type BodyColorFamily,
  bodyColorByName,
  bodyColorFamilies,
  bodyColors,
  mixHex,
  vehicleAddLabels as V,
} from "@orasso/shared";
import { type CSSProperties, useState } from "react";

/** Fond CSS d'une pastille de peinture : reflet du vernis (sauf le mat) sur la teinte et son dégradé de finition. */
export function swatchBackground(color: BodyColor): string {
  const { hex, hex2 = hex, finish } = color;
  const gloss = `radial-gradient(ellipse 50% 30% at 36% 30%, color-mix(in srgb, ${BODY_COLOR_LIGHT} 75%, transparent), transparent)`;
  const base =
    finish === "metal"
      ? `linear-gradient(135deg, ${mixHex(hex, BODY_COLOR_LIGHT, 0.35)}, ${hex} 55%, ${mixHex(hex, BODY_COLOR_SHADE, 0.45)})`
      : finish === "pearl"
        ? `linear-gradient(135deg, ${mixHex(hex, BODY_COLOR_LIGHT, 0.3)}, ${hex} 50%, ${hex2} 80%, ${mixHex(hex, BODY_COLOR_SHADE, 0.3)})`
        : finish === "chameleon"
          ? `linear-gradient(45deg, ${hex}, ${hex2} 50%, ${mixHex(hex, BODY_COLOR_LIGHT, 0.25)})`
          : finish === "duo"
            ? `linear-gradient(to bottom, ${hex} 50%, ${hex2} 50%)`
            : hex;
  const solid = base.startsWith("#") ? `linear-gradient(${base}, ${base})` : base;
  return finish === "matte" ? solid : `${gloss}, ${solid}`;
}

export function Swatch({ color, size }: { color: BodyColor; size?: number }) {
  const style: CSSProperties = { background: swatchBackground(color) };
  if (size) Object.assign(style, { width: size, height: size });
  return <span className="g-swatch" style={style} aria-hidden="true" data-paint />;
}

export function ColorPicker({
  value,
  custom,
  onChange,
}: {
  value: string;
  /** « Autre teinte » ouvert (saisie libre). */
  custom: boolean;
  onChange: (color: string, custom: boolean) => void;
}) {
  const known = custom ? null : bodyColorByName(value);
  const [family, setFamily] = useState<BodyColorFamily>(known?.family ?? "white");
  const shown = bodyColors.filter((b) => b.family === family);
  const summary = custom
    ? value || V.colorOther
    : known
      ? `${known.name} · ${V.colorFinish[known.finish]}`
      : V.colorPick;
  return (
    <div className="g-colors s-stack s-stack--tight" data-testid="site-colors">
      <div className="g-colors__head">
        <span className="o-field__label o-t-label">{V.color}</span>
        <span className="o-t-caption g-colors__name" data-testid="site-color-name">
          {summary}
        </span>
      </div>
      <div className="g-colors__tabs" role="tablist" aria-label={V.color}>
        {bodyColorFamilies.map((f) => {
          const on = !custom && family === f;
          const dots = bodyColors.filter((b) => b.family === f).slice(0, 3);
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              className={on ? "g-tab is-on" : "g-tab"}
              data-testid={`site-color-family-${f}`}
              onClick={() => {
                setFamily(f);
                if (custom) onChange("", false);
              }}
            >
              <span className="g-tab__dots" aria-hidden="true" data-paint>
                {dots.map((d) => (
                  <span key={d.name} className="g-tab__dot" style={{ background: d.hex }} />
                ))}
              </span>
              {V.colorFamilies[f]}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={custom}
          className={custom ? "g-tab g-tab--other is-on" : "g-tab g-tab--other"}
          data-testid="site-color-other"
          onClick={() => onChange(custom ? "" : known ? "" : value, !custom)}
        >
          {V.colorOther}
        </button>
      </div>
      {custom ? (
        <TextField
          label={V.colorOtherLabel}
          name="color"
          value={value}
          maxLength={40}
          placeholder={V.colorOtherPlaceholder}
          onChange={(e) => onChange(e.currentTarget.value, true)}
        />
      ) : (
        <div className="g-swatches" role="radiogroup" aria-label={V.colorFamilies[family]}>
          {shown.map((b) => {
            const on = known?.name === b.name;
            return (
              <label key={b.name} className={on ? "g-swatches__cell g-opt is-on" : "g-swatches__cell g-opt"}>
                <input
                  type="radio"
                  name="color"
                  value={b.name}
                  checked={on}
                  aria-label={`${b.name}, ${V.colorFinish[b.finish]}`}
                  onChange={() => onChange(b.name, false)}
                  onClick={() => on && onChange("", false)}
                />
                <span className="g-swatches__ring">
                  <Swatch color={b} />
                </span>
                <span className="o-t-caption g-swatches__label">{b.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
