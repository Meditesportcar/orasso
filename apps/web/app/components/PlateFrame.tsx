// Floutage de plaque à la main sur le site (lot 51) : la photo, un cadre qu'on déplace et qu'on agrandit par son coin
// (souris ou doigt, Pointer Events), 4 cadres au plus. Les cadres, normalisés 0–1, partent dans un champ caché (JSON)
// avec le formulaire ; l'API floute la photo stockée, définitivement. Pas de détection automatique sur le site : elle
// vit dans l'appli (ML Kit sur le téléphone). À réutiliser par le lot 57 (parité du garage).
// Lot 59c : le cadre se tourne (plaque penchée) ; l'API floute au flou gaussien le quadrilatère tourné.
// Lot R4a (maquette R4.1) : même logique que l'appli, à la souris. Cliquer sur le cadre passe au mode suivant
// (Déplacer → Rotation → Taille) ; Taille sans poignée, les bords s'attrapent, le curseur dit lequel ; une ligne sous la
// photo dit le mode et le geste.
import { Button, Icon, type IconName } from "@orasso/design-system/web";
import {
  DEFAULT_PLATE_FRAME,
  dragRotatePlateFrame,
  isPlateFrameTap,
  vehicleWizardLabels as L,
  MAX_PLATE_RECTS,
  movePlateFrame,
  nextPlateFrame,
  nextPlateFrameMode,
  PLATE_FRAME_FIRST_MODE,
  PLATE_FRAME_MODES,
  type PlateEdge,
  type PlateFrameHit,
  type PlateFrameMode,
  type PlateRect,
  plateFrameHit,
  resizePlateFrameEdges,
  rotateKnobBelow,
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
  prepare,
  suffix = "",
  onPicked,
}: {
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  testId?: string;
  /** Lot M1 : prépare la photo choisie (recadrage carré) ; le fichier rendu remplace celui du champ, `null` l'annule. */
  prepare?: (file: File) => Promise<File | null>;
  /**
   * Lot M1, tour 2 (plusieurs photos à la création) : suffixe des champs (`photo2`, `plateRects2`, `noPlate2`) ; vide
   * par défaut, les noms d'avant sont gardés.
   */
  suffix?: string;
  /** Lot M1, tour 2 : une photo est choisie (`true`) ou retirée (`false`). */
  onPicked?: (picked: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  // Lot M2, tour 2 (parité avec l'appli) : « Envoyer sans flouter » se confirme sur la photo, dans une boîte simple ;
  // décocher ne demande rien.
  const [noPlate, setNoPlate] = useState(false);
  const confirm = useRef<HTMLDialogElement>(null);
  return (
    <>
      <FileField
        label={label}
        name={`photo${suffix}`}
        accept="image/jpeg,image/png,image/webp"
        help={help}
        error={error}
        required={required}
        onChange={async (e) => {
          const input = e.currentTarget;
          let file = input.files?.[0] ?? null;
          setNoPlate(false);
          if (file && prepare) {
            setUrl(null);
            const prepared = await prepare(file);
            if (prepared) {
              const transfer = new DataTransfer();
              transfer.items.add(prepared);
              input.files = transfer.files;
            } else input.value = "";
            file = prepared;
          }
          setUrl(file ? URL.createObjectURL(file) : null);
          onPicked?.(file !== null);
        }}
      />
      {url ? (
        <section className="s-stack s-stack--tight" aria-label={L.blurAction}>
          <div className="o-t-label">{L.blurAction}</div>
          <PlateFrame
            key={url}
            src={url}
            alt="Photo choisie"
            name={`plateRects${suffix}`}
            initial={[]}
            testId={testId}
          />
          <label className="g-noplate o-t-body">
            <input
              type="checkbox"
              name={`noPlate${suffix}`}
              data-testid={`site-no-plate${suffix}`}
              checked={noPlate}
              onChange={(e) => {
                if (!e.currentTarget.checked) setNoPlate(false);
                else confirm.current?.showModal();
              }}
            />{" "}
            {L.noPlate}
          </label>
          <dialog
            ref={confirm}
            className="mod-dialog"
            aria-labelledby={`noplate-confirm-title${suffix}`}
            data-testid={`site-no-plate-confirm${suffix}`}
          >
            <div className="s-stack">
              <h2 id={`noplate-confirm-title${suffix}`} className="s-h2">
                {L.noPlateConfirmTitle}
              </h2>
              <p className="o-t-body">{L.noPlateConfirmBody}</p>
              <img src={url} alt="Ta prise de vue, à vérifier" className="g-noplate__photo" />
              <Button
                variant="secondary"
                icon="check"
                fullWidth
                data-testid={`site-no-plate-yes${suffix}`}
                onClick={() => {
                  setNoPlate(true);
                  confirm.current?.close();
                }}
              >
                {L.noPlateConfirm}
              </Button>
              <Button variant="plate" icon="close" fullWidth onClick={() => confirm.current?.close()}>
                Annuler
              </Button>
            </div>
          </dialog>
        </section>
      ) : null}
    </>
  );
}

/**
 * Message d'erreur si une photo part sans cadre ni « aucune plaque visible » (action du serveur), sinon null. Lot M1,
 * tour 2 : `suffix` et `n` pour la n-ième photo de l'ajout (« Photo 2 : … »).
 */
export function plateDecisionError(form: FormData, suffix = "", n?: number): string | null {
  const rects = String(form.get(`plateRects${suffix}`) ?? "").trim();
  if (rects || form.get(`noPlate${suffix}`) === "on") return null;
  return n ? L.noPlateIssue(n) : L.noPlateIssue(1).replace(/^Photo 1 : /, "Photo : ");
}

/** Le geste en cours (souris, doigt ou stylet). */
type Drag = {
  index: number;
  hit: PlateFrameHit;
  start: PlateRect;
  x: number;
  y: number;
  t0: number;
  moved: boolean;
};

const MODE_ICONS: Record<PlateFrameMode, IconName> = { move: "move", rotate: "undo", size: "crop" };

/** Curseur de la souris selon ce qu'elle survole : le bord tenu (ou le coin), la tige, le cadre. */
function cursorFor(hit: PlateFrameHit | null, dragging: boolean): string {
  if (!hit) return "";
  if (hit.kind === "size") {
    const e = [...hit.edges].sort().join("");
    if (e === "bl" || e === "rt") return "nesw-resize";
    if (e === "br" || e === "lt") return "nwse-resize";
    return e === "l" || e === "r" ? "ew-resize" : "ns-resize";
  }
  if (hit.kind) return dragging ? "grabbing" : "grab";
  return "pointer";
}

function pick(rects: readonly PlateRect[], px: number, py: number, W: number, H: number, mode: PlateFrameMode) {
  let touched: { index: number; hit: PlateFrameHit } | null = null;
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    const hit = r ? plateFrameHit(r, px, py, W, H, mode) : null;
    if (!hit) continue;
    if (hit.kind) return { index: i, hit };
    touched ??= { index: i, hit };
  }
  return touched;
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
  // Le cadre s'ouvre toujours en Déplacer (le composant est recréé à chaque photo choisie).
  const [mode, setMode] = useState<PlateFrameMode>(PLATE_FRAME_FIRST_MODE);
  const [held, setHeld] = useState<{ index: number; edges: PlateEdge[] } | null>(null);
  const [cursor, setCursor] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const point = (e: ReactPointerEvent<HTMLElement>) => {
    const r = (box.current as HTMLDivElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, W: r.width, H: r.height };
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!box.current || (e.target as HTMLElement).closest("button")) return;
    const p = point(e);
    const found = pick(rects, p.x, p.y, p.W, p.H, mode);
    const start = found ? rects[found.index] : undefined;
    if (!found || !start) return;
    e.preventDefault();
    box.current.setPointerCapture(e.pointerId);
    drag.current = { ...found, start, x: p.x, y: p.y, t0: Date.now(), moved: false };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!box.current) return;
    const p = point(e);
    const d = drag.current;
    if (!d) {
      const found = pick(rects, p.x, p.y, p.W, p.H, mode);
      setCursor(cursorFor(found?.hit ?? null, false));
      return;
    }
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    const kind = d.hit.kind;
    if (!kind) return;
    d.moved = true;
    const next =
      kind === "move"
        ? movePlateFrame(d.start, dx / p.W, dy / p.H)
        : kind === "rotate"
          ? dragRotatePlateFrame(d.start, dx, dy, p.H, undefined, rotateKnobBelow(d.start, p.H))
          : resizePlateFrameEdges(d.start, d.hit.edges, dx, dy, p.W, p.H);
    setRects((all) => all.map((r, i) => (i === d.index ? next : r)));
    setHeld(kind === "rotate" ? null : { index: d.index, edges: kind === "size" ? d.hit.edges : [] });
    setCursor(cursorFor(d.hit, true));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setHeld(null);
    if (!d || !box.current) return;
    const p = point(e);
    if (!d.moved && d.hit.inside && isPlateFrameTap(Math.hypot(p.x - d.x, p.y - d.y), Date.now() - d.t0)) {
      const next = nextPlateFrameMode(mode);
      setMode(next);
      setCursor(cursorFor(pick(rects, p.x, p.y, p.W, p.H, next)?.hit ?? null, false));
    }
  };
  const cancel = () => {
    drag.current = null;
    setHeld(null);
  };

  const step = PLATE_FRAME_MODES.indexOf(mode);
  const m = L.frameModes[mode];
  return (
    <div className="g-plate s-stack s-stack--tight" data-testid={testId}>
      {/* Toute la photo reçoit la souris : le cadre et le geste se trouvent par la logique de l'appli. */}
      <div
        className="g-plate__photo"
        ref={box}
        data-mode={mode}
        style={cursor ? { cursor } : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onPointerLeave={() => (drag.current ? undefined : setCursor(""))}
      >
        <img src={src} alt={alt} draggable={false} />
        {rects.map((r, i) => {
          const hold = held?.index === i ? held : null;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: les cadres n'ont pas d'identité propre, l'ordre suffit.
              key={i}
              className={hold ? "g-plate__frame is-drag" : "g-plate__frame"}
              role="presentation"
              data-testid="site-plate-frame"
              data-angle={r.angle ?? 0}
              title={L.frameLabel(m.name)}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                transform: r.angle ? `rotate(${r.angle}deg)` : undefined,
              }}
            >
              {mode === "size"
                ? (["t", "r", "b", "l"] as const).map((edge) => (
                    <span
                      key={edge}
                      className={
                        hold?.edges.includes(edge) ? `g-plate__edge is-${edge} is-on` : `g-plate__edge is-${edge}`
                      }
                      data-testid={`site-plate-edge-${edge}`}
                    />
                  ))
                : null}
              {mode === "rotate" ? (
                <span
                  className={
                    rotateKnobBelow(r, box.current?.clientHeight ?? 0) ? "g-plate__rot is-below" : "g-plate__rot"
                  }
                  aria-hidden="true"
                >
                  <span className="g-plate__stem" />
                  <span className="g-plate__knob" data-testid="site-plate-rotate">
                    <Icon name="undo" size={15} />
                  </span>
                </span>
              ) : null}
            </span>
          );
        })}
        <span className="g-plate__badge o-t-label">{rects.length ? L.blurredCount(rects.length) : L.placeFrame}</span>
      </div>
      {rects.length ? (
        <div className="g-plate__mode" aria-live="polite" data-testid="site-plate-mode">
          <span className="g-plate__mode-icon" aria-hidden="true">
            <Icon name={MODE_ICONS[mode]} size={18} />
          </span>
          <span className="o-t-caption">
            <strong>{m.name}</strong> : {m.mouse} · {L.frameModeSwitchMouse}
          </span>
          <span className="g-plate__dots" role="img" aria-label={L.frameModeStep(step + 1)}>
            {PLATE_FRAME_MODES.map((d, j) => (
              <span key={d} className={j === step ? "is-on" : undefined} />
            ))}
          </span>
        </div>
      ) : null}
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
