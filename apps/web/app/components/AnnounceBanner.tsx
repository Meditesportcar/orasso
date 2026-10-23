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
  /** `false` : la notification est coupée par le compte (elle reste au Journal), pas de bandeau. */
  delivered?: boolean;
};

/** Seuls les chemins internes du site (« /app/… ») : ni `//hôte`, ni `/\hôte`, ni lien externe. */
export function internalPath(link: unknown): string | null {
  return typeof link === "string" && /^\/[^/\\]/.test(link) ? link : null;
}

/** Une notification du canal → une annonce (ou rien). Sur le site, « Retenue » s'annonce aussi : pas d'autre écho. */
export function announcementOf(payload: unknown): SiteAnnouncement | null {
  const n = payload as NotificationPayload;
  if (!n?.id || !n.type || !n.title) return null;
  if (n.delivered === false) return null;
  if (n.type !== "application_accepted" && !notificationAnnounced(n.type)) return null;
  return {
    id: n.id,
    tone: announceToneOf(n.type),
    title: n.title,
    text: n.body ?? null,
    href: internalPath(n.data?.link),
  };
}

/**
 * File des annonces du site : `push` en ajoute une, le bandeau montre la première. La file appartient à un compte
 * (`userId`) : si le compte change sans que le layout soit remonté, elle est vidée, jamais montrée à un autre.
 */
export function useAnnouncements(userId: string) {
  const [state, setState] = useState<{ userId: string; queue: SiteAnnouncement[] }>({ userId, queue: [] });
  const queue = state.userId === userId ? state.queue : [];
  const push = useCallback(
    (a: SiteAnnouncement) =>
      setState((s) => {
        const q = s.userId === userId ? s.queue : [];
        return { userId, queue: q.some((x) => x.id === a.id) ? q : [...q, a] };
      }),
    [userId],
  );
  const drop = useCallback(
    () => setState((s) => (s.userId === userId ? { userId, queue: s.queue.slice(1) } : { userId, queue: [] })),
    [userId],
  );
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
