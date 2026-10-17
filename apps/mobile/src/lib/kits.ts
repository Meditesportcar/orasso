// Kit « jour J » : tout ce qu'il faut pour entrer sans réseau (QR d'inscription signé, infos de l'événement, zone,
// consignes, dernière météo connue). Enregistré dès que la candidature est retenue, rafraîchi à chaque ouverture
// de l'appli avec du réseau (donc la veille aussi), effacé à J+1 ou quand la place n'est plus valide.

import type { EventOutlook, EventWeather, MyApplication } from "@orasso/shared";
import { api } from "./api";
import { now as clockNow } from "./clock";
import { jourJClosesAt } from "./jourj";
import { kvDel, kvGetJson, kvSetJson } from "./kv";
import { mergeWeather } from "./weather";

export type AccessKit = {
  applicationId: string;
  /** Dernier rafraîchissement réussi. */
  savedAt: string;
  pseudo: string;
  status: MyApplication["status"];
  vehicleLabel: string | null;
  zone: { code: string; name: string } | null;
  checkedInAt: string | null;
  /**
   * Lot 26 : jour choisi d'un événement sur plusieurs jours (`null` = tout l'événement), et l'événement est-il sur
   * plusieurs jours. Absents des kits enregistrés avant le lot 26 (= événement d'un jour).
   */
  day?: { date: string; startsAt: string; endsAt: string } | null;
  multiDay?: boolean;
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
  /** Dernière météo connue de l'événement (cache de l'API, lot 28) ; `null` si aucune (hors des 7 jours, ou jamais reçue). */
  weather: EventWeather | null;
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

/**
 * Météo de l'événement, depuis l'API d'Orasso (cache en base, attribution comprise) : l'appli n'appelle jamais un
 * fournisseur météo elle-même. `undefined` : l'API n'a pas répondu (on garde l'ancienne) ; `null` : pas de météo.
 */
async function fetchWeather(slug: string): Promise<EventWeather | null | undefined> {
  try {
    return await api.eventWeather(slug);
  } catch {
    return undefined;
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
  const weather = mergeWeather(await fetchWeather(event.slug), previous?.weather);
  const kit: AccessKit = {
    applicationId: app.id,
    savedAt: new Date().toISOString(),
    pseudo,
    status: app.status,
    vehicleLabel: app.vehicle?.label ?? null,
    zone: app.zone,
    checkedInAt: app.checkedInAt,
    day: app.day ? { date: app.day.date, startsAt: app.day.startsAt, endsAt: app.day.endsAt } : null,
    multiDay: (event.days?.length ?? 0) > 1,
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
  const now = clockNow();
  const accepted = apps.filter((a) => a.status === "accepted" && now < jourJClosesAt(a.event));
  const acceptedIds = new Set(accepted.map((a) => a.id));
  const known = (await kvGetJson<string[]>(INDEX_KEY)) ?? [];
  for (const id of known) {
    if (acceptedIds.has(id)) continue;
    const kit = await loadKit(id);
    // Place perdue (désistement, refus, annulation) ou événement terminé : le QR n'a plus de raison d'être ici.
    if (!kit || apps.some((a) => a.id === id) || clockNow() >= jourJClosesAt(kit.event, kit.event.timezone)) {
      await dropKit(id);
    }
  }
  await Promise.all(accepted.map((app) => refreshKit(app, pseudo).catch(() => null)));
}
