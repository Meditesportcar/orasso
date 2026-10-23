// Recadrage carré de la photo d'un véhicule sur le site (lot M1, maquette 1.2 adaptée au site) : le cadre carré est fixe,
// la photo se glisse (souris ou doigt, Pointer Events), se zoome à la molette, avec − / + ou en pinçant (×1 à ×2,5).
// Aperçus en direct « Vignette » et « Fiche ». Valider produit un JPEG carré (1 600 px au plus) rendu par un canvas ;
// les calculs sont ceux de l'appli (`squareCrop` de `@orasso/shared`).
import { Button } from "@orasso/design-system/web";
import {
  type CropView,
  centerCrop,
  clampView,
  cropFromView,
  cropPixels,
  displayScale,
  MAX_ZOOM,
  MIN_ZOOM,
  pinchZoom,
  previewPlacement,
  stepZoom,
  vehicleAddLabels as V,
} from "@orasso/shared";
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

/** Côté du cadre, en pixels CSS (le calcul de recadrage travaille dans cette échelle). */
const FRAME = 280;
/** Version du site de « Glisse la photo · pince à deux doigts pour zoomer » : souris, molette et boutons. */
const CROP_HINT = "Glisse la photo · molette ou − et + pour zoomer, pince à deux doigts sur écran tactile";
/** Côté maximal de la photo produite. */
const MAX_SIDE = 1600;

type Loaded = { url: string; width: number; height: number; image: HTMLImageElement };

export function SquareCrop({
  file,
  onDone,
  onCancel,
}: {
  file: File;
  /** Le JPEG carré, ou le fichier d'origine si la photo ne peut pas être lue (le serveur la refusera alors). */
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<Loaded | null>(null);
  const [view, setView] = useState<CropView>({ zoom: MIN_ZOOM, tx: 0, ty: 0 });
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; view: CropView; distance: number } | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `file` seul décide du chargement ; `onDone` ne change pas.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let alive = true;
    image.onload = () => {
      if (alive) setSrc({ url, width: image.naturalWidth, height: image.naturalHeight, image });
    };
    image.onerror = () => {
      if (alive) onDone(file);
    };
    image.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const w = src?.width ?? 0;
  const h = src?.height ?? 0;
  const fit = (next: CropView) => (w && h ? clampView(w, h, FRAME, next) : next);

  // Molette : zoom (écouteur natif, pour pouvoir empêcher le défilement de la page).
  const wheelState = useRef({ fit, view });
  wheelState.current = { fit, view };
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { fit: f, view: v } = wheelState.current;
      setView(f({ ...v, zoom: stepZoom(v.zoom, e.deltaY < 0 ? 1 : -1) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { x: e.clientX, y: e.clientY, view, distance: distance() };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      setView(fit({ ...g.view, zoom: pinchZoom(g.view.zoom, g.distance, distance()) }));
      return;
    }
    setView(fit({ ...g.view, tx: g.view.tx + e.clientX - g.x, ty: g.view.ty + e.clientY - g.y }));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    // Un doigt reste posé : le glissement reprend d'où il est.
    const rest = [...pointers.current.values()][0];
    gesture.current = rest ? { x: rest.x, y: rest.y, view, distance: 0 } : null;
  };

  const crop = useMemo(() => (w && h ? cropFromView(w, h, FRAME, view) : centerCrop(1, 1)), [w, h, view]);
  const place = w && h ? previewPlacement(w, h, crop) : null;
  const scale = w && h ? displayScale(w, h, FRAME, view.zoom) : 1;

  const validate = () => {
    if (!src) return;
    setBusy(true);
    const px = cropPixels(src.width, src.height, crop);
    const side = Math.min(px.width, MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    canvas.getContext("2d")?.drawImage(src.image, px.originX, px.originY, px.width, px.height, 0, 0, side, side);
    canvas.toBlob(
      (blob) => {
        if (!blob) return onDone(file);
        onDone(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  const preview = (size: number, testId: string) => (
    <div className="g-crop__thumb" style={{ width: size, height: size }} data-testid={testId}>
      {src && place ? (
        <img
          src={src.url}
          alt=""
          draggable={false}
          style={{
            width: `${place.width * 100}%`,
            height: `${place.height * 100}%`,
            left: `${place.left * 100}%`,
            top: `${place.top * 100}%`,
          }}
        />
      ) : null}
    </div>
  );

  return (
    <dialog
      ref={dialog}
      className="mod-dialog g-crop"
      aria-labelledby="crop-title"
      data-testid="site-crop"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="s-stack">
        <div className="s-stack s-stack--tight">
          <h2 id="crop-title" className="s-h2">
            {V.cropTitle}
          </h2>
          <p className="o-t-caption">{V.cropOf(1, 1)}</p>
        </div>
        <div
          ref={frame}
          className="g-crop__frame"
          style={{ width: FRAME, height: FRAME }}
          data-testid="site-crop-frame"
          data-zoom={view.zoom}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {src ? (
            <img
              src={src.url}
              alt=""
              draggable={false}
              style={{
                width: src.width * scale,
                height: src.height * scale,
                left: FRAME / 2 - (src.width * scale) / 2 + view.tx,
                top: FRAME / 2 - (src.height * scale) / 2 + view.ty,
              }}
            />
          ) : (
            <span className="g-crop__busy o-t-caption">{V.cropBusy}</span>
          )}
          <span className="g-crop__badge o-t-label">{V.cropBadge}</span>
        </div>
        <p className="o-t-caption">{CROP_HINT}</p>
        <div className="g-crop__zoom">
          <button
            type="button"
            className="g-crop__step"
            aria-label={V.zoomOut}
            data-testid="site-crop-out"
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => setView(fit({ ...view, zoom: stepZoom(view.zoom, -1) }))}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          <output className="o-t-number" data-testid="site-crop-zoom">
            {V.zoomValue(view.zoom)}
          </output>
          <button
            type="button"
            className="g-crop__step"
            aria-label={V.zoomIn}
            data-testid="site-crop-in"
            disabled={view.zoom >= MAX_ZOOM}
            onClick={() => setView(fit({ ...view, zoom: stepZoom(view.zoom, 1) }))}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="g-crop__previews">
          <figure className="g-crop__figure">
            {preview(56, "site-crop-thumb")}
            <figcaption className="o-t-label">{V.previewThumb}</figcaption>
          </figure>
          <figure className="g-crop__figure">
            {preview(120, "site-crop-card")}
            <figcaption className="o-t-label">{V.previewCard}</figcaption>
          </figure>
        </div>
        <p className="o-t-caption">{V.previewText}</p>
        <Button
          type="button"
          icon="check"
          fullWidth
          loading={busy}
          disabled={!src}
          data-testid="site-crop-validate"
          onClick={validate}
        >
          {V.cropValidate}
        </Button>
        <Button type="button" variant="secondary" icon="close" fullWidth onClick={onCancel}>
          {V.cropCancel}
        </Button>
      </div>
    </dialog>
  );
}
