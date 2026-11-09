// Carte « Sponsorisé » du Fil sur le site (lot R7k2, maquette R7.6 `p-fil`) : mêmes règles et mêmes mots que l'appli.
// L'étiquette « Sponsorisé » remplace la ligne de raison. L'affichage est compté quand la moitié de la carte est visible
// (`IntersectionObserver`), une fois par emplacement et par page ; le clic est compté ; un refus de l'API (409, 404)
// retire la carte. Le lien d'un annonceur s'ouvre dans un autre onglet (`rel="noopener nofollow sponsored"`) ; la fiche
// d'un pro de la plateforme s'ouvre sur le site.
import { Icon } from "@orasso/design-system/web";
import { feedScreenLabels as L } from "@orasso/shared";
import { useEffect, useRef } from "react";

import { apiFetch } from "../../lib/api.client";
import { type CardProps, OrgLogo, Shell } from "./Shell";
import { claimImpression, isRefusalStatus, refuseImpression, releaseImpression } from "./sponsoredSession";

/** La moitié de la carte est visible, ou la moitié de la fenêtre (une carte plus haute que deux fenêtres). */
const halfSeen = (e: IntersectionObserverEntry) =>
  e.isIntersecting &&
  (e.intersectionRatio >= 0.5 || (e.rootBounds !== null && e.intersectionRect.height >= e.rootBounds.height / 2));

export function SponsoredCard({ card, onMenu, faded, onRemoved }: CardProps<"sponsored">) {
  const p = card.payload;
  const ref = useRef<HTMLDivElement>(null);
  const removed = useRef(onRemoved);
  removed.current = onRemoved;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some(halfSeen)) return;
        io.disconnect();
        if (!claimImpression(p.id)) return;
        void apiFetch(`/sponsored/${p.id}/impression`, { method: "POST", json: { surface: "feed" } }).then((r) => {
          if (r.ok) return;
          if (isRefusalStatus(r.status)) {
            refuseImpression(p.id);
            removed.current?.(card);
          } else releaseImpression(p.id);
        });
      },
      { threshold: [0.1, 0.25, 0.5, 0.75, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [p.id, card]);

  const count = () => void apiFetch(`/sponsored/${p.id}/click`, { method: "POST", json: { surface: "feed" } });
  const href = p.pro ? `/p/${p.pro.slug}` : p.linkUrl;
  const ext = p.pro ? {} : { target: "_blank", rel: "noopener nofollow sponsored" };
  const mention = [p.disclosure, p.domain].filter(Boolean).join(" · ");
  return (
    <div ref={ref}>
      <Shell
        card={card}
        head={<OrgLogo url={p.pro?.logoUrl ?? null} name={p.advertiserName} />}
        title={p.advertiserName}
        href={p.pro ? href : undefined}
        tag={L.sponsoredTag}
        onMenu={onMenu}
        faded={faded}
        actions={
          <a
            className="fil-link"
            href={href}
            {...ext}
            onClick={count}
            aria-label={L.seeAdFor(p.advertiserName)}
            data-testid="feed-sponsored-open"
          >
            <Icon name="next" size={16} /> {L.seeAd}
          </a>
        }
      >
        {p.imageUrl ? (
          <a
            className="fil-ad-media"
            href={href}
            {...ext}
            onClick={count}
            aria-label={L.seeAdFor(p.advertiserName)}
            data-testid="feed-sponsored-image"
          >
            <img src={p.imageUrl} alt="" loading="lazy" />
          </a>
        ) : (
          <div className="fil-ad-block" data-testid="feed-sponsored-block">
            <strong className="o-t-poster-m">{p.title}</strong>
          </div>
        )}
        {p.imageUrl ? (
          <p className="o-t-strong" data-testid="feed-sponsored-title">
            {p.title}
          </p>
        ) : null}
        {p.body ? (
          <p className="o-t-body" data-testid="feed-sponsored-body">
            {p.body}
          </p>
        ) : null}
        {mention ? (
          <p className="o-t-caption" data-testid="feed-sponsored-mention">
            {mention}
          </p>
        ) : null}
      </Shell>
    </div>
  );
}
