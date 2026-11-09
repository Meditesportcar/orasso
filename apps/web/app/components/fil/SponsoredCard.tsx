// Carte « Sponsorisé » du Fil sur le site (lot R7k2, maquette R7.6 `p-fil`) : mêmes règles et mêmes mots que l'appli.
// L'étiquette « Sponsorisé » remplace la ligne de raison. L'affichage est compté quand 50 % de la carte est visible (30 % d'une carte plus haute que la fenêtre ;
// `IntersectionObserver`), une fois par emplacement et par page ; le clic est compté ; un refus de l'API (409, 404)
// retire la carte. Le lien d'un annonceur s'ouvre dans un autre onglet (`rel="noopener noreferrer nofollow sponsored"`) ; la fiche
// d'un pro de la plateforme s'ouvre sur le site.
import { Icon } from "@orasso/design-system/web";
import {
  createDayWatcher,
  createImpressionWatcher,
  feedScreenLabels as L,
  parisDayOf,
  type SendOutcome,
  sponsoredSessionKeyForDay,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { type CardProps, OrgLogo, Shell } from "./Shell";
import { countsAsSeen, impressionSession, isImpressionRefused } from "./sponsoredSession";

/** La carte est vue : 50 % de sa hauteur dans la fenêtre (30 % pour une carte plus haute que la fenêtre). */
const seen = (e: IntersectionObserverEntry) => {
  const root = e.rootBounds ?? { top: 0, bottom: window.innerHeight };
  return countsAsSeen(e.boundingClientRect.top, e.boundingClientRect.height, root.top, root.bottom);
};

// 101 seuils : l'observateur rappelle à chaque centième de la carte, la part exigée (50 % ou 30 %) est donc relue de près.
const THRESHOLDS = Array.from({ length: 101 }, (_, i) => i / 100);

export function SponsoredCard({ card, onMenu, faded, onRemoved, userId }: CardProps<"sponsored">) {
  const p = card.payload;
  const ref = useRef<HTMLDivElement>(null);
  const removed = useRef(onRemoved);
  removed.current = onRemoved;
  // Le jour de Paris, réactif (tour 3) : réévalué à minuit et au retour de l'onglet au premier plan.
  const [day, setDay] = useState(() => parisDayOf(new Date()));
  useEffect(() => {
    const watcher = createDayWatcher({ onChange: setDay });
    const onVisible = () => {
      if (document.visibilityState === "visible") watcher.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      watcher.stop();
    };
  }, []);
  const sessionKey = sponsoredSessionKeyForDay(userId ?? null, p.id, day);
  const sendImpression = useCallback(
    async (keepalive = false): Promise<SendOutcome> => {
      const r = await apiFetch(`/sponsored/${p.id}/impression`, {
        method: "POST",
        json: { surface: "feed" },
        keepalive,
      });
      return r.ok ? { ok: true } : { ok: false, status: r.status };
    },
    [p.id],
  );
  // Un emplacement déjà refusé (plafond atteint, arrêté) ne se réaffiche pas : ni cette carte ni ses reprises plus bas.
  const refused = isImpressionRefused(sessionKey);
  useEffect(() => {
    if (refused) removed.current?.(card);
  }, [refused, card]);

  useEffect(() => {
    const el = ref.current;
    if (refused || !el || typeof IntersectionObserver === "undefined") return;
    // Vue : l'affichage part ; après une panne temporaire, l'observation repart (30 s, puis 60 s, trois essais) et la
    // visibilité est revérifiée ; au changement de jour, l'effet repart avec la nouvelle clé.
    const watcher = createImpressionWatcher({
      session: impressionSession,
      key: sessionKey,
      send: sendImpression,
      onRefused: () => removed.current?.(card),
      rearm: () => io.observe(el),
    });
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some(seen)) return;
        io.unobserve(el);
        watcher.onSeen();
      },
      { threshold: THRESHOLDS },
    );
    io.observe(el);
    return () => {
      watcher.dispose();
      io.disconnect();
    };
  }, [sessionKey, card, refused, sendImpression]);

  // `keepalive` : la requête survit à la navigation vers la fiche du pro (ou vers l'annonceur). Tour 3 : le clic n'est
  // accepté par l'API qu'après l'affichage ; enregistré, il part tout de suite ; sinon l'affichage part d'abord (ou on
  // attend celui en cours, 3 s au plus), puis le clic. La navigation, elle, n'attend rien.
  const count = () => {
    const post = () =>
      void apiFetch(`/sponsored/${p.id}/click`, { method: "POST", json: { surface: "feed" }, keepalive: true });
    const key = sessionKey;
    if (impressionSession.isRecorded(key)) post();
    else
      void impressionSession.beforeClick(key, sendImpression).then((r) => {
        if (r !== "refused") post();
      });
  };
  const href = p.pro ? `/p/${p.pro.slug}` : p.linkUrl;
  const ext = p.pro ? {} : { target: "_blank", rel: "noopener noreferrer nofollow sponsored" };
  const mention = [p.disclosure, p.domain].filter(Boolean).join(" · ");
  if (refused) return null;
  return (
    <div ref={ref}>
      <Shell
        card={card}
        head={<OrgLogo url={p.pro?.logoUrl ?? null} name={p.advertiserName} />}
        title={p.advertiserName}
        href={p.pro ? href : undefined}
        onTitle={p.pro ? count : undefined}
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
