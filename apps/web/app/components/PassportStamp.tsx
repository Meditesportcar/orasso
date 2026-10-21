// Un tampon du passeport, côté site (lot 57) : le même dessin que l'appli (lot 50), calculé par `stampArt` (shared) :
// forme selon le format, encre selon le département (jeton `--stamp-ink-<dept>`), usure tirée de `seed`, dorure pour
// les rares. SVG pur, sans animation (le tampon qui tombe au scan est un geste de l'appli).
import {
  lineFontSize,
  PAGE_BOX,
  ringFontSize,
  STAMP_BOX,
  STAMP_GOLD,
  STAMP_RING_PATH,
  type PassportStamp as StampData,
  silhouetteOf,
  stampLook,
  stampPlacement,
  stampShapeArt,
  stampText,
} from "@orasso/shared";
import { useId } from "react";

export function PassportStamp({ stamp, size, paper }: { stamp: StampData; size: number; paper?: string }) {
  const id = `st${useId().replaceAll(":", "")}`;
  const art = stampShapeArt(silhouetteOf(stamp));
  const look = stampLook(stamp.seed);
  const text = stampText(stamp);
  const ink = stamp.rare ? `url(#${id}g)` : `var(--stamp-ink-${stamp.ink})`;
  const page = paper ?? "var(--surface)";
  const drawing = (
    <>
      {art.strokes.map((s) => (
        <path key={s.d} d={s.d} fill="none" stroke={ink} strokeWidth={s.width} strokeLinejoin="round" />
      ))}
      {art.fills.map((d) => (
        <path key={d} d={d} fill={ink} />
      ))}
      {art.ring ? (
        <text fill={ink} className="pp-stamp__text" fontSize={ringFontSize(text.ring)} letterSpacing={1.6}>
          <textPath href={`#${id}p`} startOffset="2%">
            {text.ring}
          </textPath>
        </text>
      ) : (
        <text
          x={60}
          y={art.titleY}
          textAnchor="middle"
          fill={ink}
          className="pp-stamp__text"
          fontSize={lineFontSize(text.short, art.titleWidth)}
          letterSpacing={0.6}
        >
          {text.short}
        </text>
      )}
      <text x={60} y={art.dateY} textAnchor="middle" fill={ink} className="pp-stamp__text" fontSize={art.dateSize}>
        {text.date}
      </text>
      <text
        x={60}
        y={art.yearY}
        textAnchor="middle"
        fill={ink}
        className="pp-stamp__text"
        fontSize={8}
        letterSpacing={1.5}
      >
        {text.year}
      </text>
    </>
  );
  return (
    <svg
      className="o-stamp pp-stamp"
      width={size}
      height={size}
      viewBox={`0 0 ${STAMP_BOX} ${STAMP_BOX}`}
      role="img"
      aria-label={`Tampon ${stamp.event.title}, ${text.date}`}
      data-testid="passport-stamp"
      data-rare={stamp.rare ? "true" : undefined}
    >
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={STAMP_GOLD.from} />
          <stop offset="0.5" stopColor={STAMP_GOLD.mid} />
          <stop offset="1" stopColor={STAMP_GOLD.to} />
        </linearGradient>
        <path id={`${id}p`} d={STAMP_RING_PATH} />
      </defs>
      <g transform={`rotate(${look.angle} 60 60)`} opacity={look.opacity}>
        <g
          opacity={look.bleed.alpha}
          transform={`translate(${look.bleed.x} ${look.bleed.y}) translate(60 60) scale(${look.bleed.scale}) translate(-60 -60)`}
        >
          {drawing}
        </g>
        {drawing}
        {look.specks.map((s) => (
          <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} fill={page} opacity={0.85} />
        ))}
      </g>
    </svg>
  );
}

/** Une page de huit tampons, placés comme dans l'appli (deux colonnes décalées, chaque tampon bouge selon sa `seed`). */
export function PassportPage({ stamps, label }: { stamps: StampData[]; label: string }) {
  return (
    <figure className="pp-page" aria-label={label} data-testid="passport-page">
      <div className="pp-page__box" style={{ aspectRatio: `${PAGE_BOX.width} / ${PAGE_BOX.height}` }}>
        {stamps.map((s, i) => {
          const spot = stampPlacement(i, s.seed);
          return (
            <a
              key={s.id}
              href={`/e/${s.event.slug}`}
              className="pp-page__spot"
              style={{
                left: `${(spot.x / PAGE_BOX.width) * 100}%`,
                top: `${(spot.y / PAGE_BOX.height) * 100}%`,
                width: `${(spot.size / PAGE_BOX.width) * 100}%`,
              }}
            >
              <PassportStamp stamp={s} size={spot.size} />
            </a>
          );
        })}
      </div>
      <figcaption className="o-t-caption s-muted">{label}</figcaption>
    </figure>
  );
}
