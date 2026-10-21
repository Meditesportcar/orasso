// Photos d'une galerie de contenu média, côté site (lot 57) : une photo à la fois, envoyée à `POST /me/uploads`
// (`purpose = media_content`). D28 (Damien, 21/10/2026) : le floutage des plaques est proposé à chaque photo (cadres
// posés à la main, outils du lot 51, flou appliqué par l'API, irréversible), mais au choix du média : « Envoyer sans
// flouter » passe sans blocage ni avertissement. Les clés envoyées partent dans le champ caché `photoKeys` (JSON).
import { Button, Chip } from "@orasso/design-system/web";
import { mediaAppLabels as L, MEDIA_GALLERY_MAX_PHOTOS, type PlateRect, vehicleWizardLabels } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { FileField } from "./Fields";
import { PlateFrame } from "./PlateFrame";

type Sent = { key: string; preview: string; blurred: boolean };

/**
 * Aperçu d'une photo floutée (relecture du lot 57) : la photo, avec les cadres de plaque pixellisés, comme le fera
 * l'API. Sert uniquement à l'écran ; l'original ne part jamais sans flou quand des cadres sont posés.
 */
async function blurredPreview(src: string, rects: PlateRect[]): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, width, height);
  const small = document.createElement("canvas");
  const sctx = small.getContext("2d");
  if (!sctx) return src;
  for (const r of rects) {
    const x = Math.round(r.x * width);
    const y = Math.round(r.y * height);
    const w = Math.max(1, Math.round(r.w * width));
    const h = Math.max(1, Math.round(r.h * height));
    small.width = Math.max(1, Math.round(w / 12));
    small.height = Math.max(1, Math.round(h / 12));
    sctx.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  }
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function MediaGalleryPicker({ onPendingChange }: { onPendingChange?: (pending: boolean) => void }) {
  const [sent, setSent] = useState<Sent[]>([]);
  const [file, setFile] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLDivElement>(null);
  useEffect(() => () => (file ? URL.revokeObjectURL(file.url) : undefined), [file]);
  // « Publier » reste bloqué tant qu'une photo est choisie sans être ajoutée, ou en cours d'envoi (relecture du lot 57).
  const pending = busy || file !== null;
  useEffect(() => onPendingChange?.(pending), [pending, onPendingChange]);

  async function send(blur: boolean) {
    if (!file) return;
    const rects = blur
      ? (frame.current?.querySelector<HTMLInputElement>('input[name="galleryPlateRects"]')?.value ?? "")
      : "";
    if (blur && !rects) {
      setError(vehicleWizardLabels.placeFrame);
      return;
    }
    const body = new FormData();
    body.set("purpose", "media_content");
    body.set("file", file.file);
    if (rects) body.set("plateRects", rects);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/uploads", { method: "POST", body, credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { key?: string; error?: { message?: string } } | null;
      if (!res.ok || !json?.key) {
        setError(json?.error?.message ?? L.uploadFailed);
        return;
      }
      const key = json.key;
      let preview = file.url;
      if (rects) {
        try {
          preview = await blurredPreview(file.url, JSON.parse(rects) as PlateRect[]);
        } catch {
          preview = "";
        }
      }
      setSent((all) => [...all, { key, preview, blurred: Boolean(rects) }]);
      setFile(null);
      const picker = input.current?.querySelector<HTMLInputElement>('input[type="file"]');
      if (picker) picker.value = "";
    } catch {
      setError(L.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="s-stack s-stack--tight md-gallery" data-testid="media-gallery-picker">
      <legend className="o-t-label">
        {L.addPhotos} · {L.addPhotosCount(sent.length, MEDIA_GALLERY_MAX_PHOTOS)}
      </legend>
      <input type="hidden" name="photoKeys" value={JSON.stringify(sent.map((s) => s.key))} />
      {sent.length > 0 && (
        <ul className="md-thumbs md-thumbs--edit" data-testid="media-gallery-sent">
          {sent.map((s) => (
            <li key={s.key}>
              {s.preview ? <img src={s.preview} alt="" /> : null}
              {s.blurred && <Chip variant="accent">{L.addPhotosBlurred}</Chip>}
              <Button
                type="button"
                variant="secondary"
                icon="close"
                onClick={() => setSent((all) => all.filter((x) => x.key !== s.key))}
              >
                {L.addPhotosRemove}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {sent.length < MEDIA_GALLERY_MAX_PHOTOS && (
        <div ref={input}>
          <FileField
            label={L.addPhotosPick}
            name="galleryFile"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              setError(null);
              setFile(f ? { file: f, url: URL.createObjectURL(f) } : null);
            }}
          />
        </div>
      )}
      {file && (
        <section className="s-stack s-stack--tight" aria-label={L.addPhotosBlurTitle} ref={frame}>
          <div className="o-t-label">{L.addPhotosBlurTitle}</div>
          <p className="o-t-caption">{L.addPhotosBlurHint}</p>
          <PlateFrame
            key={file.url}
            src={file.url}
            alt="Photo choisie"
            name="galleryPlateRects"
            initial={[]}
            testId="media-plate-editor"
          />
          <div className="s-row">
            <Button
              type="button"
              variant="secondary"
              icon="check"
              loading={busy}
              onClick={() => void send(true)}
              data-testid="media-photo-blur"
            >
              {L.addPhotosBlurSend}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="send"
              loading={busy}
              onClick={() => void send(false)}
              data-testid="media-photo-plain"
            >
              {L.addPhotosPlainSend}
            </Button>
          </div>
        </section>
      )}
      {busy && (
        <p className="o-t-caption s-muted" role="status" data-testid="media-photo-sending">
          {L.addPhotosSending}
        </p>
      )}
      {!busy && file && (
        <p className="o-t-caption s-muted" data-testid="media-photo-pending">
          {L.addPhotosPending}
        </p>
      )}
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
