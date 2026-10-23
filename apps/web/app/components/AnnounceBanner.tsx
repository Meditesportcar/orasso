// Bandeau d'annonce du site (lot M6, parité de l'appli, maquette 9.1) : une notification reçue pendant qu'on utilise le
// site (canal temps réel `user:<id>`) s'affiche en haut, toujours au même endroit, environ 4 s ; moutarde pour une bonne
// nouvelle (retenue, place libérée…), sobre pour une information ; toucher = ouvrir son lien, ✕ = fermer. Mêmes règles
// que l'appli (`announceToneOf`, `ANNOUNCE_MS` de `packages/shared`). L'actualité du Journal n'a pas de bandeau.
import { Icon } from "@orasso/design-system/web";
import { ANNOUNCE_MS, type AnnounceTone, announceToneOf, notificationAnnounced } from "@orasso/shared";
import { useCallback, useEffect, useState } from "react";

export type SiteAnnouncement = {
  id: string;
  tone: AnnounceTone;
  title: string;
  text: string | null;
  href: string | null;
};

type NotificationPayload = {
  id?: string;
  type?: string;
  title?: string;
  body?: string | null;
  data?: { link?: unknown };
};

/** Une notification du canal → une annonce (ou rien). Sur le site, « Retenue » s'annonce aussi : pas d'autre écho. */
export function announcementOf(payload: unknown): SiteAnnouncement | null {
  const n = payload as NotificationPayload;
  if (!n?.id || !n.type || !n.title) return null;
  if (n.type !== "application_accepted" && !notificationAnnounced(n.type)) return null;
  const link = typeof n.data?.link === "string" && n.data.link.startsWith("/") ? n.data.link : null;
  return { id: n.id, tone: announceToneOf(n.type), title: n.title, text: n.body ?? null, href: link };
}

/** File des annonces du site : `push` en ajoute une, le bandeau montre la première. */
export function useAnnouncements() {
  const [queue, setQueue] = useState<SiteAnnouncement[]>([]);
  const push = useCallback(
    (a: SiteAnnouncement) => setQueue((q) => (q.some((x) => x.id === a.id) ? q : [...q, a])),
    [],
  );
  const drop = useCallback(() => setQueue((q) => q.slice(1)), []);
  return { current: queue[0] ?? null, push, drop };
}

export function AnnounceBanner({ item, onDone }: { item: SiteAnnouncement | null; onDone: () => void }) {
  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(onDone, ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [item, onDone]);
  if (!item) return null;
  const good = item.tone === "good";
  const body = (
    <>
      <span className="ann__icon" aria-hidden="true">
        <Icon name={good ? "o" : "bell"} />
      </span>
      <span className="ann__text">
        <b className={good ? "ann__title ann__title--good" : "ann__title"}>{item.title}</b>
        {item.text && <span className="o-t-caption ann__line">{item.text}</span>}
      </span>
    </>
  );
  return (
    <div
      key={item.id}
      className={good ? "ann ann--good" : "ann ann--info"}
      role="status"
      aria-live="polite"
      data-testid={`announce-${item.tone}`}
    >
      {item.href ? (
        <a className="ann__main" href={item.href} onClick={onDone}>
          {body}
          <Icon name="next" />
        </a>
      ) : (
        <div className="ann__main">{body}</div>
      )}
      <button type="button" className="ann__close" onClick={onDone} aria-label="Fermer">
        <Icon name="close" />
      </button>
      <i className="ann__timer" aria-hidden="true" />
    </div>
  );
}
