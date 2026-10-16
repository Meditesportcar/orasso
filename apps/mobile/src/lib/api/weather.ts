// Météo (lot 28) : cache de l'API uniquement, l'appli n'appelle jamais un fournisseur météo elle-même.
import type { EventOutlook, EventWeather, MyWeather } from "@orasso/shared";

import { request } from "../http";

export const weatherApi = {
  /** Météo d'un événement (≤ 7 jours avant, avec attribution) ; `null` sinon. */
  eventWeather: (slug: string) =>
    request<EventWeather | null>(`/api/events/by-slug/${encodeURIComponent(slug)}/weather`),
  /** Météo de l'Accueil : prochain événement accepté, sinon le département du profil (widget du lot 30). */
  myWeather: () => request<MyWeather | null>("/api/me/weather"),
  /** Bascule Maintenu / Incertain (organisateur, double authentification exigée par l'API). */
  setOutlook: (eventId: string, outlook: EventOutlook) =>
    request<{ outlook: EventOutlook }>(`/api/events/${eventId}/outlook`, { method: "PATCH", body: { outlook } }),
};
