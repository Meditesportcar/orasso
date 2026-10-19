// Floutage de plaque à la main sur le site (lot 51) : la photo, un cadre qu'on déplace et qu'on agrandit par son coin
// (souris ou doigt, Pointer Events), 4 cadres au plus. Les cadres, normalisés 0–1, partent dans un champ caché (JSON)
// avec le formulaire ; l'API floute la photo stockée, définitivement. Pas de détection automatique sur le site : elle
// vit dans l'appli (ML Kit sur le téléphone). À réutiliser par le lot 57 (parité du garage).
import { Button } from "@orasso/design-system/web";
import {
  DEFAULT_PLATE_FRAME,
  vehicleWizardLabels as L,
  MAX_PLATE_RECTS,
  movePlateFrame,
  nextPlateFrame,
  type PlateRect,
  resizePlateFrame,
} from "@orasso/shared";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { FileField } from "./Fields";

/**
 * Champ « photo » avec la plaque (relecture du lot 51) : la photo choisie s'affiche, on y pose le cadre de la plaque
 * (floutée par l'API avant le stockage), ou on coche « Envoyer sans flouter : aucune plaque visible ». Le serveur
 * refuse une photo sans l'un ni l'autre (`plateDecisionError`).
 */
export function PhotoWithPlate({
  label,
  help,
  error,
  required,
  testId,
}: {
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  testId?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return (
    <>
      <FileField
        label={label}
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        help={help}
        error={error}
        required={required}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          setUrl(file ? URL.createObjectURL(file) : null);
        }}
      />
      {url ? (
        <section className="s-stack s-stack--tight" aria-label={L.blurAction}>
          <div className="o-t-label">{L.blurAction}</div>
          <PlateFrame key={url} src={url} alt="Photo choisie" initial={[]} testId={testId} />
          <label className="g-noplate o-t-body">
            <input type="checkbox" name="noPlate" data-testid="site-no-plate" /> {L.noPlate}
          </label>
        </section>
      ) : null}
    </>
  );
}

/** Message d'erreur si une photo part sans cadre ni « aucune plaque visible » (action du serveur), sinon null. */
export function plateDecisionError(form: FormData): string | null {
  const rects = String(form.get("plateRects") ?? "").trim();
  return rects || form.get("noPlate") === "on" ? null : L.noPlateIssue(1).replace(/^Photo 1 : /, "Photo : ");
}

export function PlateFrame({
  src,
  alt,
  name = "plateRects",
  initial = [DEFAULT_PLATE_FRAME],
  testId,
}: {
  src: string;
  alt: string;
  /** Nom du champ caché qui porte les cadres (JSON). */
  name?: string;
  initial?: PlateRect[];
  testId?: string;
}) {
  const [rects, setRects] = useState<PlateRect[]>(initial);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; kind: "move" | "resize"; x: number; y: number; start: PlateRect } | null>(null);

  const begin = (index: number, kind: "move" | "resize") => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const start = rects[index];
    if (!start) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { index, kind, x: e.clientX, y: e.clientY, start };
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = box.current;
    if (!d || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const dx = (e.clientX - d.x) / width;
    const dy = (e.clientY - d.y) / height;
    const next = d.kind === "move" ? movePlateFrame(d.start, dx, dy) : resizePlateFrame(d.start, dx, dy);
    setRects((all) => all.map((r, i) => (i === d.index ? next : r)));
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <div className="g-plate s-stack s-stack--tight" data-testid={testId}>
      <div className="g-plate__photo" ref={box}>
        <img src={src} alt={alt} draggable={false} />
        {rects.map((r, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: les cadres n'ont pas d'identité propre, l'ordre suffit.
            key={i}
            className="g-plate__frame"
            role="presentation"
            data-testid="site-plate-frame"
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            onPointerDown={begin(i, "move")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <span
              className="g-plate__handle"
              role="presentation"
              data-testid="site-plate-handle"
              onPointerDown={begin(i, "resize")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          </span>
        ))}
        <span className="g-plate__badge o-t-label">{rects.length ? L.blurredCount(rects.length) : L.placeFrame}</span>
      </div>
      <input type="hidden" name={name} value={rects.length ? JSON.stringify(rects) : ""} />
      <div className="g-plate__tools">
        <Button
          type="button"
          variant="secondary"
          icon="add"
          disabled={rects.length >= MAX_PLATE_RECTS}
          onClick={() => setRects((all) => [...all, nextPlateFrame(all)])}
        >
          {L.addFrame}
        </Button>
        {rects.length ? (
          <Button type="button" variant="secondary" icon="close" onClick={() => setRects((all) => all.slice(0, -1))}>
            {L.removeFrame}
          </Button>
        ) : null}
      </div>
      <p className="o-t-caption">{L.irreversible}</p>
    </div>
  );
}
