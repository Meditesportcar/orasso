import {
  type CitySuggestion,
  myWeatherTexts as L,
  type MyWeatherPlaces,
  placesAfterAdd,
  placesAfterChange,
  placesAfterRemove,
  weatherPlacesInput,
} from "@orasso/shared";
import { data, redirect } from "react-router";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { MeteoDetail } from "../components/weather/MeteoDetail";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-meteo";
import "../styles/weather-r8m.css";

// Détail de « Ma météo » (lot R8m, maquette R8.8) : plein écran, mode B. La recherche d'une ville et l'enregistrement des lieux
// sont des formulaires ; la position demandée au navigateur reste en mémoire de la page (jamais enregistrée).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Ma météo · Orasso" }, { name: "robots", content: "noindex" }];
}

export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const lieu = url.searchParams.get("lieu");
  const sheet = lieu === "changer" ? ("change" as const) : lieu === "second" ? ("add" as const) : null;
  const card = Number.parseInt(url.searchParams.get("card") ?? "0", 10);
  const places = await api<MyWeatherPlaces>(request, "/me/weather/places");
  let cities: CitySuggestion[] | null = null;
  if (sheet && q.length >= 2) {
    const found = await api<{ cities: CitySuggestion[] }>(
      request,
      `/geo/cities?q=${encodeURIComponent(q.slice(0, 80))}`,
    );
    cities = found.ok ? found.data.cities : [];
  }
  return {
    places: places.ok ? places.data : null,
    index: Number.isFinite(card) && card >= 0 ? card : 0,
    sheet,
    q,
    cities,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const op = String(form.get("op") ?? "");
  const current = await api<MyWeatherPlaces>(request, "/me/weather/places");
  if (!current.ok) return data({ error: L.savedFailed }, { status: current.status });
  const city = {
    label: String(form.get("label") ?? ""),
    lat: Number(form.get("lat")),
    lng: Number(form.get("lng")),
  };
  const slotRaw = String(form.get("slot") ?? "");
  const slot = slotRaw === "" ? null : Number.parseInt(slotRaw, 10);
  let next: ReturnType<typeof placesAfterAdd>;
  if (op === "change") next = placesAfterChange(current.data.places, { slot }, city);
  else if (op === "add") next = placesAfterAdd(current.data.places, city);
  else if (op === "remove" && slot !== null) next = placesAfterRemove(current.data.places, slot);
  else return data({ error: L.savedFailed }, { status: 400 });
  // Les mêmes règles que l'API : un lieu hors de France ou mal formé n'est pas envoyé.
  if (!weatherPlacesInput.safeParse({ places: next }).success) return data({ error: L.savedFailed }, { status: 400 });
  const res = await api(request, "/me/weather/places", { method: "PUT", json: { places: next } });
  if (!res.ok) return data({ error: res.error.message || L.savedFailed }, { status: res.status });
  throw redirect("/app/meteo");
}

export default function AppMeteo({ loaderData, actionData }: Route.ComponentProps) {
  const { places, index, sheet, q, cities } = loaderData;
  return (
    <div className="s-stack">
      <FicheBar title={L.detailTitle} back="/app" closeLabel="Fermer" />
      <MeteoDetail
        places={places}
        index={index}
        sheet={sheet}
        q={q}
        cities={cities}
        error={actionData?.error ?? null}
      />
    </div>
  );
}
