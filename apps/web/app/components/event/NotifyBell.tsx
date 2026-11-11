import { Icon } from "@orasso/design-system/web";
import { type EventNotificationPrefsView, eventNotifyLabels as L } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import "../../styles/event-notify.css";
import { EssentialBlock, NotifySwitch } from "./NotifySignup";

/**
 * La cloche de la fiche (lot R8n2, maquette R8.11, vue « fiche ») : visible seulement quand la personne a une place
 * (`hasPlace`, lu par l'API à l'arrivée sur la fiche). Elle ouvre « Notifications de cet événement » : l'Essentiel et
 * « Nouveautés de l'événement », enregistré au changement. Place perdue entre-temps (403 `no_place`) : le message, puis
 * la cloche disparaît à la fermeture de la fenêtre. Sans session ou sans place : rien.
 */
export function NotifyBell({ eventId, stamp }: { eventId: string; stamp?: string }) {
  const [hasPlace, setHasPlace] = useState(false);
  const [news, setNews] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  // `stamp` : l'état des candidatures de la fiche (la place est relue quand il change).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` relance la lecture, il n'est pas lu.
  useEffect(() => {
    let alive = true;
    void apiFetch<EventNotificationPrefsView>(`/me/events/${encodeURIComponent(eventId)}/notification-prefs`).then(
      (res) => {
        if (!alive || !res.ok) return;
        setHasPlace(res.data.hasPlace);
        setNews(res.data.news);
        setGone(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [eventId, stamp]);

  if (!hasPlace) return null;

  async function change(next: boolean) {
    setNews(next);
    setMessage(null);
    const res = await apiFetch<EventNotificationPrefsView>(
      `/me/events/${encodeURIComponent(eventId)}/notification-prefs`,
      { method: "PUT", json: { news: next } },
    );
    if (res.ok) return setNews(res.data.news);
    setNews(!next);
    if (res.status === 403 && res.error.code === "no_place") {
      setMessage(L.noPlace);
      setGone(true);
    } else setMessage(res.error.message || L.ficheSaveFailed);
  }

  return (
    <>
      <button
        type="button"
        className="en-bell"
        aria-label={L.bellLabel}
        onClick={() => {
          setMessage(null);
          dialog.current?.showModal();
        }}
        data-testid="notify-bell"
      >
        <Icon name="bell" size={22} />
      </button>
      <dialog
        ref={dialog}
        className="en-dialog"
        aria-labelledby="notify-bell-title"
        onClose={() => {
          if (gone) setHasPlace(false);
        }}
        data-testid="notify-sheet"
      >
        <div className="en-box">
          <div className="en-dialog__head">
            <h2 id="notify-bell-title" className="o-t-poster-m">
              {L.bellLabel}
            </h2>
            <button type="button" className="en-bell" aria-label="Fermer" onClick={() => dialog.current?.close()}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <EssentialBlock />
          <NotifySwitch
            title={L.eventNewsTitle}
            help={L.eventNewsHelpOnFiche}
            checked={news}
            onChange={(v) => void change(v)}
            testId="notify-news-switch"
          />
          {message ? (
            <p className="en-error" role="alert" data-testid="notify-message">
              {message}
            </p>
          ) : (
            <p className="en-note o-t-caption">{L.ficheNote}</p>
          )}
        </div>
      </dialog>
    </>
  );
}
