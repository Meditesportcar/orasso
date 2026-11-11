// Météo des événements (lot 28, ARCHITECTURE-SUITE § 12). La tâche `weather.refresh` (toutes les 3 h) interroge le
// fournisseur pour les événements publiés commençant dans 7 jours au plus (ou en cours), garde le résultat dans
// `event_weather` et, si la météo annoncée est mauvaise, suggère aux organisateurs de passer en Incertain.
// Les routes et le rappel de la veille ne lisent que cette base : jamais d'appel au fournisseur par requête, jamais
// bloquant (sans météo, tout fonctionne comme avant).
import {
  addDays,
  departmentCentroids,
  describeWeather,
  type EventWeather,
  eventDates,
  forecastForEvent,
  fromWallTime,
  isBadWeather,
  type MyWeather,
  type OutingWeather,
  SET_OUTLOOK_UNCERTAIN_ACTION,
  type StoredForecast,
  shouldSuggestUncertain,
  type WeatherSummary,
  wallTime,
  weatherAttributions,
  weatherVisible,
} from "@orasso/shared";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, eventWeather, structureMembers, structures, weatherDepartments } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { fetchForecast, type ProviderForecast, weatherEnabled } from "../../lib/weather";
import type { EventRow } from "../events/repo";
import { notificationsService } from "../notifications/service";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Un rappel n'affiche pas une prévision plus vieille que ça (le rafraîchissement a échoué toute la journée). */
const REMINDER_MAX_AGE_MS = 12 * HOUR;
/** Durée de validité du cache d'un département. */
const DEPARTMENT_TTL_MS = 3 * HOUR;

type StoredRow = typeof eventWeather.$inferSelect;
type Position = { lat: number; lng: number };

const sameSpot = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) < 1e-6;

/** La prévision stockée correspond-elle encore à la position de l'événement ? (adresse modifiée → invalidée) */
function validFor(row: StoredRow | undefined, e: Pick<EventRow, "lat" | "lng">): row is StoredRow {
  return Boolean(row && sameSpot(row.lat, e.lat) && sameSpot(row.lng, e.lng));
}

/** Prévision du fournisseur réduite à l'événement : ses jours et ses heures seulement (jsonb léger). */
function storedFor(e: EventRow, forecast: ProviderForecast): StoredForecast {
  const dates = eventDates(e);
  const from = e.startsAt.getTime();
  const to = e.endsAt.getTime();
  return {
    days: forecast.daily.filter((d) => dates.includes(d.date)),
    hours: forecast.hourly.filter((h) => {
      const t = Date.parse(h.time);
      return t + HOUR > from && t < to;
    }),
  };
}

/** La météo d'un département : la journée d'aujourd'hui (Paris) de la prévision gardée ; pas de journée d'aujourd'hui, rien. */
function placeWeather(
  department: string,
  row: typeof weatherDepartments.$inferSelect | null | undefined,
): MyWeather | null {
  if (!row) return null;
  const w = wallTime(now(), "Europe/Paris");
  const today = `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
  const summary = row.forecast.days.find((d) => d.date === today);
  if (!summary) return null;
  return {
    kind: "place",
    department,
    provider: row.provider,
    attribution: weatherAttributions[row.provider],
    summary,
  };
}

const spotKey = (p: Position) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

async function organizerIds(structureId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: structureMembers.userId })
    .from(structureMembers)
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
      ),
    );
  return rows.map((r) => r.userId);
}

/** Départements en cours de récupération (une seule requête au fournisseur par département à la fois). */
const departmentFlights = new Map<string, Promise<typeof weatherDepartments.$inferSelect | null>>();
/** Dernier échec du fournisseur par département (lot 30) et délai avant de réessayer. */
const departmentFailures = new Map<string, number>();
const DEPARTMENT_RETRY_MS = 10 * 60_000;

export const weatherService = {
  /**
   * Rafraîchit la météo des événements concernés (ou d'un seul : `eventId`) puis envoie les suggestions dues.
   * Renvoie le nombre d'événements mis à jour et de suggestions envoyées.
   */
  async refresh(eventId?: string): Promise<{ refreshed: number; suggested: number }> {
    const t = now();
    const rows = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, "published"),
          sql`${events.lat} is not null and ${events.lng} is not null`,
          lte(events.startsAt, new Date(t.getTime() + 7 * DAY)),
          gte(events.endsAt, t),
          eventId ? eq(events.id, eventId) : undefined,
        ),
      )
      .orderBy(asc(events.startsAt));
    // Un seul appel par position (événements d'un même lieu) pendant un passage.
    const calls = new Map<string, ReturnType<typeof fetchForecast>>();
    let refreshed = 0;
    let suggested = 0;
    for (const e of rows) {
      if (e.lat === null || e.lng === null) continue;
      const key = spotKey({ lat: e.lat, lng: e.lng });
      let call = calls.get(key);
      if (!call) {
        call = fetchForecast(e.lat, e.lng);
        calls.set(key, call);
      }
      const result = await call;
      // Fournisseur indisponible : on garde l'ancienne prévision (jamais bloquant), le prochain passage réessaie.
      if (!result) continue;
      const stored = storedFor(e, result.forecast);
      const summary = forecastForEvent(stored, e);
      if (!summary) continue;
      await db
        .insert(eventWeather)
        .values({
          eventId: e.id,
          provider: result.provider,
          lat: e.lat,
          lng: e.lng,
          fetchedAt: t,
          forecast: stored,
          badWeather: isBadWeather(summary),
        })
        .onConflictDoUpdate({
          target: eventWeather.eventId,
          set: {
            provider: result.provider,
            lat: e.lat,
            lng: e.lng,
            fetchedAt: t,
            forecast: stored,
            badWeather: isBadWeather(summary),
          },
        });
      refreshed += 1;
      if (await this.suggestUncertain(e, summary)) suggested += 1;
    }
    return { refreshed, suggested };
  },

  /**
   * Suggestion « Météo annoncée mauvaise : passer en Incertain ? » aux organisateurs : événement maintenu, à 72 h
   * du début au plus, une fois par 24 h. Le créneau est réservé en base (mise à jour conditionnelle) avant l'envoi :
   * deux passages simultanés n'envoient qu'une fois.
   */
  async suggestUncertain(e: EventRow, summary: WeatherSummary): Promise<boolean> {
    const t = now();
    const current = await db.query.eventWeather.findFirst({ where: eq(eventWeather.eventId, e.id) });
    if (
      !shouldSuggestUncertain({
        summary,
        outlook: e.outlook,
        startsAt: e.startsAt,
        lastSuggestedAt: current?.suggestedUncertainAt ?? null,
        now: t,
      })
    ) {
      return false;
    }
    const structure = await db.query.structures.findFirst({ where: eq(structures.id, e.structureId) });
    if (!structure || structure.deletedAt) return false;
    const recipients = await organizerIds(e.structureId);
    return withTx(async (tx, after) => {
      const [claimed] = await tx
        .update(eventWeather)
        .set({ suggestedUncertainAt: t })
        .where(
          and(
            eq(eventWeather.eventId, e.id),
            or(
              isNull(eventWeather.suggestedUncertainAt),
              lt(eventWeather.suggestedUncertainAt, new Date(t.getTime() - DAY)),
            ),
          ),
        )
        .returning({ eventId: eventWeather.eventId });
      if (!claimed) return false;
      for (const userId of recipients) {
        await notificationsService.notify(tx, userId, "event_weather_suggest_uncertain", {
          title: "Météo annoncée mauvaise",
          body: `« ${e.title} » : ${describeWeather(summary)}. Passer l'événement en Incertain ?`,
          eventId: e.id,
          data: { eventId: e.id, action: SET_OUTLOOK_UNCERTAIN_ACTION },
          link: { label: "Ouvrir l'événement", path: `/orga/${structure.slug}/e/${e.id}` },
        });
      }
      after(() => notificationsService.kick());
      return true;
    });
  },

  /** Météo valable d'un événement (position inchangée), avec son résumé ; `null` sinon. */
  async stored(e: EventRow): Promise<{ row: StoredRow; summary: WeatherSummary } | null> {
    const row = await db.query.eventWeather.findFirst({ where: eq(eventWeather.eventId, e.id) });
    if (!validFor(row, e)) return null;
    const summary = forecastForEvent(row.forecast, e);
    return summary ? { row, summary } : null;
  },

  /** `GET /events/by-slug/:slug/weather` (public) : `null` au-delà de 7 jours, après la fin ou sans prévision. */
  async forEvent(slug: string): Promise<EventWeather | null> {
    const e = await db.query.events.findFirst({ where: eq(events.slug, slug) });
    if (!e || e.status === "draft") throw notFound("Événement introuvable");
    // Événement privé sur invitation (lot 25) : la route est publique et mise en cache, rien n'en sort.
    if (e.status !== "published" || e.admission === "invite_only" || !weatherVisible(e, now())) return null;
    const found = await this.stored(e);
    if (!found) return null;
    return {
      provider: found.row.provider,
      attribution: weatherAttributions[found.row.provider],
      fetchedAt: found.row.fetchedAt.toISOString(),
      summary: found.summary,
      days: found.row.forecast.days,
    };
  },

  /** Ligne ajoutée au rappel de la veille : « Météo : 14–21 °C, averses probables (70 %) (Open-Meteo) », ou `null`. */
  async reminderLine(e: EventRow): Promise<string | null> {
    const found = await this.stored(e).catch(() => null);
    if (!found || now().getTime() - found.row.fetchedAt.getTime() > REMINDER_MAX_AGE_MS) return null;
    const name = weatherAttributions[found.row.provider].replace(/^Météo : /, "");
    return `Météo : ${describeWeather(found.summary)} (${name})`;
  },

  /** Météo du jour J d'un événement donné (accueil du prestataire : l'événement de sa mission), `null` si elle n'est pas encore visible. */
  async dayJForEvent(eventId: string): Promise<MyWeather | null> {
    const e = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    if (e?.status !== "published" || !weatherVisible(e, now())) return null;
    const found = await this.stored(e);
    if (!found) return null;
    return {
      kind: "event",
      event: { id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt.toISOString() },
      provider: found.row.provider,
      attribution: weatherAttributions[found.row.provider],
      summary: found.summary,
    };
  },

  /** `GET /me/weather` : prochain événement accepté (≤ 7 jours) ; sinon météo du jour au centre du 1er département. */
  async mine(v: Viewer): Promise<MyWeather | null> {
    const t = now();
    const [next] = await db
      .select({ e: events })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(
          eq(applications.userId, v.user.id),
          eq(applications.status, "accepted"),
          eq(events.status, "published"),
          gt(events.endsAt, t),
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(1);
    if (next && weatherVisible(next.e, t)) {
      const found = await this.stored(next.e);
      if (found) {
        return {
          kind: "event",
          event: { id: next.e.id, slug: next.e.slug, title: next.e.title, startsAt: next.e.startsAt.toISOString() },
          provider: found.row.provider,
          attribution: weatherAttributions[found.row.provider],
          summary: found.summary,
        };
      }
    }
    return this.mineAtHome(v);
  },

  /**
   * Lot R8e1 : la météo du département du compte, sans jamais celle d'un événement (bloc « Météo » de l'Accueil : « Chez toi,
   * aujourd'hui ») ; `GET /me/weather` garde sa réponse (`mine`).
   */
  async mineAtHome(v: Viewer): Promise<MyWeather | null> {
    const department = v.profile.departments[0];
    if (!department) return null;
    // Lot R8r : un stock récent sans la journée d'aujourd'hui est renouvelé (relecture de l'Accueil au premier chargement).
    return placeWeather(department, await this.departmentWeather(department, { needToday: true }));
  },

  /**
   * Lot R8e1, tour 2 : la même météo pour `GET /me/home`, qui ne lit que le stock : jamais d'attente du fournisseur. Pas de
   * prévision fraîche : la journée stockée si elle est d'aujourd'hui, sinon rien ; le rafraîchissement part sans être attendu
   * (requêtes simultanées regroupées, échec retenté au plus toutes les 10 minutes, erreur journalisée), pour que la prochaine
   * ouverture l'ait.
   */
  async mineFromStock(v: Viewer): Promise<{ weather: MyWeather | null; pending: boolean }> {
    const department = v.profile.departments[0];
    if (!department) return { weather: null, pending: false };
    const row = await db.query.weatherDepartments.findFirst({ where: eq(weatherDepartments.department, department) });
    const weather = placeWeather(department, row);
    // Lot R8r : un stock récent qui n'a pas la journée d'aujourd'hui (veille, minuit passé) est à renouveler comme un stock périmé.
    const refreshing = !row || weather === null || now().getTime() - row.fetchedAt.getTime() >= DEPARTMENT_TTL_MS;
    if (refreshing) {
      void this.departmentWeather(department, { needToday: weather === null }).catch((error) =>
        console.warn("Météo du département non rafraîchie :", error instanceof Error ? error.message : error),
      );
    }
    // Lot R8r : sans journée d'aujourd'hui en stock, l'Accueil dit « en cours de chargement » (champ `weatherPending`) tant
    // qu'un rafraîchissement est réellement lancé : fournisseur actif, département connu, pas d'échec dans les 10 dernières minutes.
    const failedAt = departmentFailures.get(department);
    const pending =
      weather === null &&
      weatherEnabled() &&
      Boolean(departmentCentroids[department]) &&
      (failedAt === undefined || now().getTime() - failedAt >= DEPARTMENT_RETRY_MS);
    return { weather, pending };
  },

  /**
   * Lot R8e1 : la météo des sorties de « Prochaine sortie » (`GET /me/home`, `outingsWeather`), clé = identifiant de
   * l'événement. Une lecture des événements et une des prévisions pour toute la liste ; seulement le stock, jamais le
   * fournisseur. Un événement non publié, hors des 7 jours avant le début, fini ou sans prévision valable n'a pas d'entrée.
   */
  async forOutings(eventIds: string[]): Promise<Record<string, OutingWeather>> {
    const ids = [...new Set(eventIds)];
    if (ids.length === 0) return {};
    const t = now();
    const [rows, stored] = await Promise.all([
      db.select().from(events).where(inArray(events.id, ids)),
      db.select().from(eventWeather).where(inArray(eventWeather.eventId, ids)),
    ]);
    const byEvent = new Map(stored.map((r) => [r.eventId, r]));
    const out: Record<string, OutingWeather> = {};
    for (const e of rows) {
      if (e.status !== "published" || !weatherVisible(e, t)) continue;
      const row = byEvent.get(e.id);
      if (!validFor(row, e)) continue;
      const aggregate = forecastForEvent(row.forecast, e);
      if (!aggregate) continue;
      // Lot R8r : un événement commencé montre la journée d'aujourd'hui (Paris), pas celle du début ; pas encore commencé :
      // son premier jour. Commencé, le résumé porte sur la part d'aujourd'hui de l'événement (ses heures d'aujourd'hui quand on
      // les a, sinon la journée) : un événement d'un seul jour garde exactement ses heures, nuit exclue.
      const started = e.startsAt.getTime() <= t.getTime();
      const w = wallTime(started ? t : e.startsAt, "Europe/Paris");
      const day = `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
      let summary: WeatherSummary | null = aggregate;
      if (started) {
        const dayStart = fromWallTime({ ...w, hour: 0, minute: 0 }, "Europe/Paris");
        const dayEnd = fromWallTime({ ...addDays(w, 1), hour: 0, minute: 0 }, "Europe/Paris");
        const today = {
          startsAt: new Date(Math.max(e.startsAt.getTime(), dayStart.getTime())),
          endsAt: new Date(Math.min(e.endsAt.getTime(), dayEnd.getTime() - 1)),
          timezone: "Europe/Paris",
        };
        // Seulement les données d'aujourd'hui : sans elles (prévision partielle ou ancienne), pas de ligne plutôt qu'une autre journée.
        summary = forecastForEvent(row.forecast, today);
      }
      if (!summary) continue;
      out[e.id] = {
        day,
        summary,
        provider: row.provider,
        attribution: weatherAttributions[row.provider],
        uncertain: e.outlook === "uncertain",
      };
    }
    return out;
  },

  /**
   * Cache du centre d'un département (3 h). Au plus une requête au fournisseur par département et par passage
   * (requêtes simultanées regroupées) : aucune requête par utilisateur. Indisponible : l'ancien cache, sinon `null`.
   */
  async departmentWeather(department: string, opts: { needToday?: boolean } = {}) {
    const cached = await db.query.weatherDepartments.findFirst({
      where: eq(weatherDepartments.department, department),
    });
    // `needToday` : un stock récent mais sans la journée d'aujourd'hui n'est pas servi tel quel (lot R8r).
    const lacksToday = Boolean(opts.needToday && placeWeather(department, cached) === null);
    if (cached && !lacksToday && now().getTime() - cached.fetchedAt.getTime() < DEPARTMENT_TTL_MS) return cached;
    const centre = departmentCentroids[department];
    if (!centre) return cached ?? null;
    // Lot 30 : après un échec du fournisseur, on ne le réinterroge pas avant 10 minutes (l'Accueil appelle cette fonction
    // à chaque chargement : sans cela, chaque chargement attendrait le délai d'attente du fournisseur en panne).
    const failedAt = departmentFailures.get(department);
    if (failedAt !== undefined && now().getTime() - failedAt < DEPARTMENT_RETRY_MS) return cached ?? null;
    let flight = departmentFlights.get(department);
    if (!flight) {
      flight = (async () => {
        const result = await fetchForecast(centre.lat, centre.lng);
        if (!result) {
          if (weatherEnabled()) departmentFailures.set(department, now().getTime());
          return cached ?? null;
        }
        departmentFailures.delete(department);
        const values = {
          department,
          provider: result.provider,
          fetchedAt: now(),
          forecast: { days: result.forecast.daily, hours: [] } satisfies StoredForecast,
        };
        try {
          const [saved] = await db
            .insert(weatherDepartments)
            .values(values)
            .onConflictDoUpdate({ target: weatherDepartments.department, set: values })
            .returning();
          // Réponse sans la journée d'aujourd'hui : même retenue de 10 minutes (pas de rappel à chaque Accueil).
          if (placeWeather(department, saved) === null) departmentFailures.set(department, now().getTime());
          return saved ?? null;
        } catch (error) {
          // Lot R8r : le fournisseur a répondu mais le stock n'a pas pu être écrit : même retenue de 10 minutes qu'après un échec du
          // fournisseur (sinon chaque Accueil le rappellerait), et l'erreur remonte aux appelants comme avant.
          departmentFailures.set(department, now().getTime());
          throw error;
        }
      })().finally(() => departmentFlights.delete(department));
      departmentFlights.set(department, flight);
    }
    return flight;
  },
};
