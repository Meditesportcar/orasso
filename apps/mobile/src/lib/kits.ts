// Kit « jour J » : tout ce qu'il faut pour entrer sans réseau (QR d'inscription signé, infos de l'événement, zone,
// consignes, dernière météo connue). Enregistré dès que la candidature est retenue, rafraîchi à chaque ouverture
// de l'appli avec du réseau (donc la veille aussi), effacé à J+1 ou quand la place n'est plus valide.
import type { EventOutlook, MyApplication } from "@orasso/shared";

import { api } from "./endpoints";
import { jourJClosesAt, weatherLabel } from "./jourj";
import { kvDel, kvGetJson, kvSetJson } from "./kv";

export type AccessKit = {
  applicationId: string;
  /** Dernier rafraîchissement réussi. */
  savedAt: string;
  pseudo: string;
  status: MyApplication["status"];
  vehicleLabel: string | null;
  zone: { code: string; name: string } | null;
  checkedInAt: string | null;
  event: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
    outlook: EventOutlook;
    cancelled: boolean;
    instructions: string | null;
  };
  pass: { passId: string; payload: string; issuedAt: string };
  weather: { label: string; temperature: number; at: string } | null;
};

const INDEX_KEY = "kits";
const kitKey = (applicationId: string) => `kit.${applicationId}`;

export const loadKit = (applicationId: string) => kvGetJson<AccessKit>(kitKey(applicationId));

async function saveKit(kit: AccessKit) {
  await kvSetJson(kitKey(kit.applicationId), kit);
  const ids = (await kvGetJson<string[]>(INDEX_KEY)) ?? [];
  if (!ids.includes(kit.applicationId)) await kvSetJson(INDEX_KEY, [...ids, kit.applicationId]);
}

export async function dropKit(applicationId: string) {
  await kvDel(kitKey(applicationId));
  const ids = (await kvGetJson<string[]>(INDEX_KEY)) ?? [];
  await kvSetJson(
    INDEX_KEY,
    ids.filter((id) => id !== applicationId),
  );
}

export async function clearKits() {
  const ids = (await kvGetJson<string[]>(INDEX_KEY)) ?? [];
  await Promise.all(ids.map((id) => kvDel(kitKey(id))));
  await kvDel(INDEX_KEY);
}

/** Météo à l'heure de début (Open-Meteo, sans clé) ; `null` hors de la fenêtre de prévision ou sans réseau. */
async function fetchWeather(lat: number, lng: number, startsAt: string, timezone: string) {
  try {
    const day = new Date(startsAt).toLocaleDateString("sv-SE", { timeZone: timezone });
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,weather_code&timezone=${encodeURIComponent(timezone)}&start_date=${day}&end_date=${day}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const json = (await res.json()) as {
      hourly?: { time: string[]; temperature_2m: number[]; weather_code: number[] };
    };
    const hourly = json.hourly;
    if (!hourly) return null;
    const hour = new Date(startsAt)
      .toLocaleTimeString("sv-SE", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" })
      .slice(0, 2);
    const index = hourly.time.findIndex((t) => t.slice(11, 13) === hour);
    const temperature = hourly.temperature_2m[index];
    const code = hourly.weather_code[index];
    if (index < 0 || temperature === undefined || code === undefined) return null;
    return { label: weatherLabel(code), temperature: Math.round(temperature), at: new Date().toISOString() };
  } catch {
    return null;
  }
}

/** Récupère le QR et les infos de l'événement ; garde l'ancienne météo si la nouvelle n'est pas disponible. */
export async function refreshKit(app: MyApplication, pseudo: string): Promise<AccessKit | null> {
  const [pass, event, previous] = await Promise.all([
    api.pass(app.id),
    api.eventBySlug(app.event.slug),
    loadKit(app.id),
  ]);
  if (!pass.payload) {
    await dropKit(app.id);
    return null;
  }
  const weather =
    event.lat !== null && event.lng !== null
      ? ((await fetchWeather(event.lat, event.lng, event.startsAt, event.timezone)) ?? previous?.weather ?? null)
      : null;
  const kit: AccessKit = {
    applicationId: app.id,
    savedAt: new Date().toISOString(),
    pseudo,
    status: app.status,
    vehicleLabel: app.vehicle?.label ?? null,
    zone: app.zone,
    checkedInAt: app.checkedInAt,
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      addressLine: event.addressLine,
      postalCode: event.postalCode,
      city: event.city,
      lat: event.lat,
      lng: event.lng,
      outlook: event.outlook,
      cancelled: event.status === "cancelled",
      instructions: event.instructions,
    },
    pass: { passId: pass.passId, payload: pass.payload, issuedAt: pass.issuedAt },
    weather,
  };
  await saveKit(kit);
  return kit;
}

/**
 * Met à jour les kits de toutes les places retenues à venir ; efface ceux dont la place n'est plus valide
 * ou dont l'événement est passé depuis J+1. Une panne réseau laisse les kits en place (c'est tout l'intérêt).
 */
export async function syncKits(apps: MyApplication[], pseudo: string): Promise<void> {
  // Une place retenue dont le mode jour J est fermé (J+1 passé) n'a plus besoin de kit.
  const now = new Date();
  const accepted = apps.filter((a) => a.status === "accepted" && now < jourJClosesAt(a.event));
  const acceptedIds = new Set(accepted.map((a) => a.id));
  const known = (await kvGetJson<string[]>(INDEX_KEY)) ?? [];
  for (const id of known) {
    if (acceptedIds.has(id)) continue;
    const kit = await loadKit(id);
    // Place perdue (désistement, refus, annulation) ou événement terminé : le QR n'a plus de raison d'être ici.
    if (!kit || apps.some((a) => a.id === id) || new Date() >= jourJClosesAt(kit.event, kit.event.timezone)) {
      await dropKit(id);
    }
  }
  await Promise.all(accepted.map((app) => refreshKit(app, pseudo).catch(() => null)));
}
