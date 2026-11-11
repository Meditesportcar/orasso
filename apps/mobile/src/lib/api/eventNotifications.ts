// Notifications d'un événement (lot R8n2) : les Nouveautés de l'événement (la place est lue par l'API), et l'aperçu des
// destinataires d'un changement important (organisateur). Aucune règle ici : elles sont dans l'API (R8n1).
import type { EventNotificationPrefsView, NotifyPreview } from "@orasso/shared";

import { request } from "../http";

export const eventNotificationsApi = {
  /** `{ news, hasPlace }` : la cloche de la fiche n'existe que si `hasPlace`. */
  eventNotificationPrefs: (eventId: string) =>
    request<EventNotificationPrefsView>(`/api/me/events/${encodeURIComponent(eventId)}/notification-prefs`),
  /** 403 `no_place` quand la place a été perdue entre-temps. */
  setEventNotificationPrefs: (eventId: string, news: boolean) =>
    request<EventNotificationPrefsView>(`/api/me/events/${encodeURIComponent(eventId)}/notification-prefs`, {
      method: "PUT",
      body: { news },
    }),
  /** Organisateur : combien d'inscrits un changement de date ou de lieu prévient. */
  notifyPreview: (eventId: string) =>
    request<NotifyPreview>(`/api/events/${encodeURIComponent(eventId)}/notify-preview`),
};
