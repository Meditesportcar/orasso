// Carte « Sponsorisé » du Fil sur le site (lot R7k2, maquette R7.6 `p-fil`) : mêmes règles et mêmes mots que l'appli.
// L'étiquette « Sponsorisé » remplace la ligne de raison. L'affichage est compté quand 50 % de la carte est visible dans la
// zone utile (sous la barre du haut, au-dessus des onglets ; 30 % d'une carte plus haute que la zone ; `IntersectionObserver`
// avec un `rootMargin` sur cette zone, relayé par le défilement pour les très grandes cartes), une fois par emplacement et par page ; le clic est compté ; un refus de l'API (409, 404)
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
import { Link } from "react-router";

import { apiFetch } from "../../lib/api.client";
import { type CardProps, OrgLogo, Shell } from "./Shell";
import { impressionSession, isImpressionRefused } from "./sponsoredSession";
import { createScrollRelay, readZone, rootMarginFor, seenIn } from "./sponsoredZone";

/** La carte est vue : 50 % de sa hauteur dans la zone utile (30 % pour une carte plus haute que la zone). */
const seen = (e: IntersectionObserverEntry) => {
  const root = e.rootBounds ?? readZone(document, window);
  return seenIn(e.boundingClientRect.top, e.boundingClientRect.height, root);
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
  const sendImpression = useCallback(async (): Promise<SendOutcome> => {
    const r = await apiFetch(`/sponsored/${p.id}/impression`, {
      method: "POST",
      json: { surface: "feed" },
      // Toujours `keepalive` (tour 4) : l'affichage envoyé derrière un clic survit à la navigation vers la fiche du pro.
      keepalive: true,
    });
    return r.ok ? { ok: true } : { ok: false, status: r.status };
  }, [p.id]);
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
    // Tour 4 : l'observateur mesure la zone utile (sous `.app__bar`, au-dessus de `.app__tabs`), recalculée au
    // redimensionnement ; une carte qui touche la zone sans être comptée (très grande carte) est relayée par le défilement.
    const target: HTMLDivElement = el;
    let io: IntersectionObserver | undefined;
    let frame = 0;
    // Faux entre « vue » et le nouvel essai programmé : un redimensionnement (barre d'adresse du téléphone) ne relance pas
    // l'observation, sinon il court-circuiterait la temporisation de 30 s / 60 s et le plafond de trois essais.
    let watching = true;
    const relay = createScrollRelay({
      measure: () => {
        const r = target.getBoundingClientRect();
        return { top: r.top, height: r.height, zone: readZone(document, window) };
      },
      onSeen: () => found(),
      onActive: (on) => {
        if (on) window.addEventListener("scroll", onScroll, { passive: true });
        else {
          window.removeEventListener("scroll", onScroll);
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
        }
      },
    });
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        relay.tick();
      });
    }
    const watcher = createImpressionWatcher({
      session: impressionSession,
      key: sessionKey,
      send: sendImpression,
      onRefused: () => removed.current?.(card),
      rearm: () => {
        watching = true;
        observe();
      },
    });
    function found() {
      watching = false;
      io?.disconnect();
      relay.stop();
      watcher.onSeen();
    }
    function observe() {
      io?.disconnect();
      const zone = readZone(document, window);
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some(seen)) return found();
          if (entries.some((e) => e.isIntersecting)) {
            relay.touch();
            relay.tick();
          } else relay.stop();
        },
        { threshold: THRESHOLDS, rootMargin: rootMarginFor(zone, window.innerHeight) },
      );
      io.observe(target);
    }
    const onResize = () => {
      if (!watching) return;
      relay.stop();
      observe();
    };
    window.addEventListener("resize", onResize);
    observe();
    return () => {
      window.removeEventListener("resize", onResize);
      watcher.dispose();
      relay.stop();
      io?.disconnect();
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
  const ext = { target: "_blank", rel: "noopener noreferrer nofollow sponsored" };
  // Tour 4 : la fiche d'un pro s'ouvre par une navigation côté client (`<Link>`), la page n'est pas rechargée et le clic
  // différé part ; le lien d'un annonceur s'ouvre dans un autre onglet.
  const anchor = (className: string, testId: string, children: React.ReactNode) =>
    p.pro ? (
      <Link
        className={className}
        to={href}
        onClick={count}
        aria-label={L.seeAdFor(p.advertiserName)}
        data-testid={testId}
      >
        {children}
      </Link>
    ) : (
      <a
        className={className}
        href={href}
        {...ext}
        onClick={count}
        aria-label={L.seeAdFor(p.advertiserName)}
        data-testid={testId}
      >
        {children}
      </a>
    );
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
        clientNav
        tag={L.sponsoredTag}
        onMenu={onMenu}
        faded={faded}
        actions={anchor(
          "fil-link",
          "feed-sponsored-open",
          <>
            <Icon name="next" size={16} /> {L.seeAd}
          </>,
        )}
      >
        {p.imageUrl ? (
          anchor("fil-ad-media", "feed-sponsored-image", <img src={p.imageUrl} alt="" loading="lazy" />)
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
