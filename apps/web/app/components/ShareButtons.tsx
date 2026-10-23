import { Button, Chip } from "@orasso/design-system/web";
import {
  SHARE_DEFAULT_STYLE,
  type ShareFormat,
  type ShareStyle,
  shareFormatLabels,
  shareFormats,
  shareSheetLabels,
  shareStyleLabels,
  shareStyles,
} from "@orasso/shared";
import { useState } from "react";

/** Partager la page : copier le lien, WhatsApp, Instagram (le lien se colle dans une story). */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function copy(note: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(note);
    } catch {
      setMessage(url);
    }
  }

  return (
    <div className="s-stack s-stack--tight">
      <div className="ev__share">
        <Button variant="secondary" icon="share" onClick={() => copy("Lien copié.")}>
          Copier
        </Button>
        <Button
          variant="secondary"
          icon="chat"
          href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </Button>
        <Button variant="secondary" icon="instagram" onClick={() => copy("Lien copié : colle-le dans ta story.")}>
          Instagram
        </Button>
      </div>
      <p className="o-t-caption s-muted" role="status">
        {message ?? url}
      </p>
    </div>
  );
}

/**
 * Affiche à partager d'un véhicule (lot 57, parité de l'appli ; lot M6, maquettes 2.1 à 2.3) : story 9:16 par défaut ou
 * post 4:5, trois styles, l'aperçu du format choisi (zones masquées par Instagram en story), et le téléchargement.
 * Rendue par l'API (`GET /me/vehicles/:id/share-image`), même composition que l'appli : le nom du véhicule sur une
 * ligne, jamais de fausse plaque (la photo garde la plaque floutée par le serveur).
 */
export function ShareCard({ vehicleId, version }: { vehicleId: string; version: string }) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [style, setStyle] = useState<ShareStyle>(SHARE_DEFAULT_STYLE);
  const [safe, setSafe] = useState(false);
  const src = (download: boolean) =>
    `/api/me/vehicles/${encodeURIComponent(vehicleId)}/share-image?format=${format}&style=${style}${download ? "&download=1" : ""}&v=${encodeURIComponent(version)}`;
  return (
    <div className="s-stack s-stack--tight" data-testid="share-card">
      <p className="s-muted">
        {shareSheetLabels.subtitle}. {shareSheetLabels.help}
      </p>
      <div className="s-row" role="radiogroup" aria-label="Format">
        {shareFormats.map((f) => (
          <Chip key={f} selected={format === f} onClick={() => setFormat(f)} data-testid={`share-format-${f}`}>
            {shareFormatLabels[f]}
          </Chip>
        ))}
      </div>
      <div className="s-row" role="radiogroup" aria-label="Style">
        {shareStyles.map((s) => (
          <Chip key={s} selected={style === s} onClick={() => setStyle(s)} data-testid={`share-style-${s}`}>
            {shareStyleLabels[s]}
          </Chip>
        ))}
      </div>
      <figure className={`g-share g-share--${format}`}>
        <img
          src={src(false)}
          alt={`${shareSheetLabels.title} · ${shareFormatLabels[format]} · ${shareStyleLabels[style]}`}
          loading="lazy"
        />
        {safe && format === "story" && (
          <>
            <span className="g-share__safe g-share__safe--top o-t-caption">{shareSheetLabels.maskedByInstagram}</span>
            <span className="g-share__safe g-share__safe--bottom o-t-caption">
              {shareSheetLabels.maskedByInstagram}
            </span>
          </>
        )}
      </figure>
      <p className="o-t-caption s-muted">{shareSheetLabels.plateServer}</p>
      {format === "story" && (
        <button type="button" className="s-linkbutton o-t-caption" onClick={() => setSafe((v) => !v)}>
          {safe ? shareSheetLabels.hideSafe : shareSheetLabels.showSafe}
        </button>
      )}
      <div className="s-row" data-testid="share-links">
        <Button variant="secondary" icon="export" href={src(true)} data-testid="share-story">
          {`Télécharger · ${shareFormatLabels[format]}`}
        </Button>
      </div>
    </div>
  );
}
