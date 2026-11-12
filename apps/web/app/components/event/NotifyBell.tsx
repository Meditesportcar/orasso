import { Icon } from "@orasso/design-system/web";
import {
  createSerialWriter,
  type EventNotificationPrefsView,
  eventNotifyLabels as L,
  type SerialWriter,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import "../../styles/event-notify.css";
import { EssentialBlock, NotifySwitch, useSessionGuard } from "./NotifySignup";

class NoPlaceError extends Error {}

/**
 * La cloche de la fiche (lot R8n2, maquette R8.11, vue « fiche ») : visible seulement quand la personne a une place
 * (`hasPlace`, lu par l'API à l'arrivée sur la fiche). Elle ouvre « Notifications de cet événement » : l'Essentiel et
 * « Nouveautés de l'événement », enregistré au changement. Place perdue entre-temps (403 `no_place`) : le message, puis
 * la cloche disparaît à la fermeture de la fenêtre. Sans session ou sans place : rien.
 */
export function NotifyBell({ eventId, userId, stamp }: { eventId: string; userId: string | null; stamp?: string }) {
  const [hasPlace, setHasPlace] = useState(false);
  const [news, setNews] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const writer = useRef<SerialWriter<boolean> | null>(null);
  const guard = useSessionGuard(userId);
  const url = `/me/events/${encodeURIComponent(eventId)}/notification-prefs`;
  // Un écrivain neuf à chaque lecture de la place : envois sérialisés, dernier choix gardé, réponses périmées ignorées.
  const startWriter = (initial: boolean) => {
    writer.current = createSerialWriter<boolean>({
      initial,
      alive: guard.alive,
      write: async (value) => {
        const saved = await apiFetch<EventNotificationPrefsView>(url, { method: "PUT", json: { news: value } });
        if (saved.ok) return saved.data.news;
        if (saved.status === 403 && saved.error.code === "no_place") throw new NoPlaceError();
        throw new Error(saved.error.message || L.ficheSaveFailed);
      },
      onSettled: setNews,
      onError: (confirmed, e) => {
        setNews(confirmed);
        if (e instanceof NoPlaceError) {
          setMessage(L.noPlace);
          setGone(true);
        } else setMessage(e instanceof Error && e.message ? e.message : L.ficheSaveFailed);
      },
    });
    guard.watch(writer.current);
  };

  // `stamp` : l'état des candidatures de la fiche (la place est relue quand il change).
  // Le compte de la page change sans démontage (A -> B sur la même fiche) : `guard` change, l'écrivain est recréé avec la garde de
  // B et les préférences de B sont relues.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` relance la lecture, il n'est pas lu.
  useEffect(() => {
    let alive = true;
    void apiFetch<EventNotificationPrefsView>(`/me/events/${encodeURIComponent(eventId)}/notification-prefs`).then(
      (res) => {
        if (!alive || !res.ok) return;
        setHasPlace(res.data.hasPlace);
        setNews(res.data.news);
        startWriter(res.data.news);
        setGone(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [eventId, stamp, guard]);

  if (!hasPlace) return null;

  function change(next: boolean) {
    setNews(next);
    setMessage(null);
    writer.current?.set(next);
  }

  return (
    <>
      <button
        type="button"
        className="en-bell"
        aria-label={L.bellLabel}
        onClick={() => {
          // Un échec tardif arrivé fenêtre fermée reste à lire : le message s'efface à la fermeture, pas à l'ouverture.
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
          setMessage(null);
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
            onChange={change}
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
