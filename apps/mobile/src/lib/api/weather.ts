// Météo (lot 28) : cache de l'API uniquement, l'appli n'appelle jamais un fournisseur météo elle-même.
import type {
  CitySuggestion,
  EventOutlook,
  EventWeather,
  LatLng,
  MyWeather,
  MyWeatherPlaces,
  PlaceCoords,
  WeatherAt,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const weatherApi = {
  /** Météo d'un événement (≤ 7 jours avant, avec attribution) ; `null` sinon. */
  eventWeather: (slug: string) =>
    request<EventWeather | null>(`/api/events/by-slug/${encodeURIComponent(slug)}/weather`),
  /** Météo de l'Accueil : prochain événement accepté, sinon le département du profil (widget du lot 30). */
  myWeather: () => request<MyWeather | null>("/api/me/weather"),
  /** Lot R8m : « Ma météo », les lieux (choisis, sinon la préfecture du département) avec leur météo. */
  myWeatherPlaces: () => request<MyWeatherPlaces>("/api/me/weather/places"),
  /** Lot R8m : remplace les villes choisies (0 à 2). */
  saveWeatherPlaces: (places: PlaceCoords[]) =>
    request<MyWeatherPlaces>("/api/me/weather/places", { method: "PUT", body: { places } }),
  /**
   * Lot R8m : « Utiliser ma position ». La position part arrondie à 0,1° (l'appelant l'arrondit avant), en corps de
   * requête et jamais dans l'adresse ; l'API ne l'enregistre pas.
   */
  weatherAt: (position: LatLng) => request<WeatherAt>("/api/weather/at", { method: "POST", body: position }),
  /** Lot R8m : communes à choisir dans « Changer de lieu ». */
  searchCities: (q: string) => request<{ cities: CitySuggestion[] }>(`/api/geo/cities${qs({ q })}`),
  /** Lot R8r : la météo du département seule (relecture unique de l'Accueil au premier chargement). */
  myPlaceWeather: () => request<MyWeather | null>("/api/me/weather?place=1"),
  /** Bascule Maintenu / Incertain (organisateur, double authentification exigée par l'API). */
  setOutlook: (eventId: string, outlook: EventOutlook) =>
    request<{ outlook: EventOutlook }>(`/api/events/${eventId}/outlook`, { method: "PATCH", body: { outlook } }),
};
