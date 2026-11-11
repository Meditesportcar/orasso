// Météo des événements (lot 28, ARCHITECTURE-SUITE § 12). La tâche `weather.refresh` (toutes les 3 h) interroge le
// fournisseur pour les événements publiés commençant dans 7 jours au plus (ou en cours), garde le résultat dans
// `event_weather` et, si la météo annoncée est mauvaise, suggère aux organisateurs de passer en Incertain.
// Les routes et le rappel de la veille ne lisent que cette base : jamais d'appel au fournisseur par requête, jamais
// bloquant (sans météo, tout fonctionne comme avant).
import {
  departmentCentroids,
  departmentPrefectures,
  describeWeather,
  type EventWeather,
  eventDates,
  forecastForEvent,
  isBadWeather,
  type MyWeather,
  type MyWeatherPlaces,
  myWeatherPlaces,
  type OutingWeather,
  type PlaceWeather,
  placeForecast,
  roundPlace,
  SET_OUTLOOK_UNCERTAIN_ACTION,
  type StoredForecast,
  shouldSuggestUncertain,
  trimForecast,
  WEATHER_PLACES_MAX,
  type WeatherAt,
  type WeatherCell,
  type WeatherSummary,
  wallTime,
  weatherAttributions,
  weatherCell,
  weatherVisible,
} from "@orasso/shared";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  events,
  eventWeather,
  profiles,
  profileWeatherPlaces,
  structureMembers,
  structures,
  weatherDepartments,
  weatherPlacesCache,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { reverseCity } from "../../lib/geocode";
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
/** Lot R8m : cases de 0,1° en cours de récupération (un seul appel par case à la fois) et dernier échec par case. */
const cellFlights = new Map<string, Promise<typeof weatherPlacesCache.$inferSelect | null>>();
const cellFailures = new Map<string, number>();
/** Une case plus vieille que ça est rafraîchie par la tâche (elle passe toutes les 3 h : une marge évite de la rater d'une seconde). */
const CELL_REFRESH_AFTER_MS = 2 * HOUR;
/** Cases rafraîchies par passage au plus, et durée de garde d'une case que personne ne lit plus. */
const CELLS_PER_PASS = 300;
const CELL_KEEP_MS = 7 * DAY;
/** Dernier échec du fournisseur par département (lot 30) et délai avant de réessayer. */
const departmentFailures = new Map<string, number>();
const DEPARTMENT_RETRY_MS = 10 * 60_000;

/** Tests : oublie les cases en cours et les échecs retenus (état du module, qui survit à la remise à zéro de la base). */
export function resetPlaceCellState() {
  cellFlights.clear();
  cellFailures.clear();
}

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
    // Lot R8m : les cases des lieux de « Ma météo » (jamais bloquant pour la météo des événements).
    if (!eventId) {
      await this.refreshPlaces().catch((error) =>
        console.warn("Météo des lieux non rafraîchie :", error instanceof Error ? error.message : error),
      );
    }
    return { refreshed, suggested };
  },

  /**
   * Lot R8m : rafraîchit les cases des villes choisies et des préfectures par défaut utilisées (comptes sans lieu choisi),
   * puis purge celles que personne n'a plus demandées depuis 7 jours. Une case = un appel, quel que soit le nombre de comptes.
   */
  async refreshPlaces(): Promise<{ cells: number }> {
    const t = now();
    const wanted = new Map<string, WeatherCell>();
    const saved = await db
      .select({ lat: profileWeatherPlaces.lat, lng: profileWeatherPlaces.lng })
      .from(profileWeatherPlaces);
    for (const p of saved) {
      const cell = weatherCell(p);
      wanted.set(cell.key, cell);
    }
    const defaults = await db.execute<{ code: string }>(
      sql`select distinct ${profiles.departments}[1] as code from ${profiles}
        where ${profiles.departments}[1] is not null
          and not exists (select 1 from ${profileWeatherPlaces} w where w.user_id = ${profiles.userId})`,
    );
    for (const { code } of defaults.rows) {
      const prefecture = departmentPrefectures[code];
      if (!prefecture) continue;
      const cell = weatherCell(prefecture);
      wanted.set(cell.key, cell);
    }
    const cached = await db.select().from(weatherPlacesCache);
    const fetchedAt = new Map(cached.map((r) => [r.cell, r.fetchedAt.getTime()]));
    const due = [...wanted.values()]
      .filter((c) => t.getTime() - (fetchedAt.get(c.key) ?? 0) >= CELL_REFRESH_AFTER_MS)
      .sort((a, b) => (fetchedAt.get(a.key) ?? 0) - (fetchedAt.get(b.key) ?? 0))
      .slice(0, CELLS_PER_PASS);
    let cells = 0;
    for (const cell of due) {
      if (await this.cellForecast(cell, true)) cells += 1;
    }
    await db.delete(weatherPlacesCache).where(lt(weatherPlacesCache.fetchedAt, new Date(t.getTime() - CELL_KEEP_MS)));
    return { cells };
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
    if (!e || e.status !== "published" || !weatherVisible(e, now())) return null;
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
    return placeWeather(department, await this.departmentWeather(department));
  },

  /**
   * Lot R8e1, tour 2 : la même météo pour `GET /me/home`, qui ne lit que le stock : jamais d'attente du fournisseur. Pas de
   * prévision fraîche : la journée stockée si elle est d'aujourd'hui, sinon rien ; le rafraîchissement part sans être attendu
   * (requêtes simultanées regroupées, échec retenté au plus toutes les 10 minutes, erreur journalisée), pour que la prochaine
   * ouverture l'ait.
   */
  async mineFromStock(v: Viewer): Promise<MyWeather | null> {
    const department = v.profile.departments[0];
    if (!department) return null;
    const row = await db.query.weatherDepartments.findFirst({ where: eq(weatherDepartments.department, department) });
    if (!row || now().getTime() - row.fetchedAt.getTime() >= DEPARTMENT_TTL_MS) {
      void this.departmentWeather(department).catch((error) =>
        console.warn("Météo du département non rafraîchie :", error instanceof Error ? error.message : error),
      );
    }
    return placeWeather(department, row);
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
      const summary = forecastForEvent(row.forecast, e);
      if (!summary) continue;
      const w = wallTime(e.startsAt, "Europe/Paris");
      out[e.id] = {
        day: `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`,
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
  async departmentWeather(department: string) {
    const cached = await db.query.weatherDepartments.findFirst({
      where: eq(weatherDepartments.department, department),
    });
    if (cached && now().getTime() - cached.fetchedAt.getTime() < DEPARTMENT_TTL_MS) return cached;
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
        const [saved] = await db
          .insert(weatherDepartments)
          .values(values)
          .onConflictDoUpdate({ target: weatherDepartments.department, set: values })
          .returning();
        return saved ?? null;
      })().finally(() => departmentFlights.delete(department));
      departmentFlights.set(department, flight);
    }
    return flight;
  },

  /**
   * Lot R8m : la prévision d'une case de 0,1° (cache de 3 h, partagé par tous les comptes). Un seul appel au fournisseur par
   * case à la fois ; fournisseur indisponible : l'ancienne prévision, sinon `null`. Au fournisseur ne part que la case.
   * `force` : la tâche planifiée (ignore l'âge du cache).
   */
  async cellForecast(cell: WeatherCell, force = false) {
    const cached = await db.query.weatherPlacesCache.findFirst({ where: eq(weatherPlacesCache.cell, cell.key) });
    if (!force && cached && now().getTime() - cached.fetchedAt.getTime() < DEPARTMENT_TTL_MS) return cached;
    const failedAt = cellFailures.get(cell.key);
    if (!force && failedAt !== undefined && now().getTime() - failedAt < DEPARTMENT_RETRY_MS) return cached ?? null;
    let flight = cellFlights.get(cell.key);
    if (!flight) {
      flight = (async () => {
        const result = await fetchForecast(cell.lat, cell.lng);
        if (!result) {
          if (weatherEnabled()) cellFailures.set(cell.key, now().getTime());
          return cached ?? null;
        }
        cellFailures.delete(cell.key);
        const t = now();
        const values = {
          cell: cell.key,
          provider: result.provider,
          fetchedAt: t,
          forecast: trimForecast(result.forecast.daily, result.forecast.hourly, t),
        };
        const [saved] = await db
          .insert(weatherPlacesCache)
          .values(values)
          .onConflictDoUpdate({ target: weatherPlacesCache.cell, set: values })
          .returning();
        return saved ?? null;
      })().finally(() => cellFlights.delete(cell.key));
      cellFlights.set(cell.key, flight);
    }
    return flight;
  },

  /** La météo d'un lieu depuis une case du cache : aujourd'hui, l'heure en cours et les six suivantes, ou `null`. */
  placeWeather(row: typeof weatherPlacesCache.$inferSelect | null | undefined): PlaceWeather | null {
    if (!row) return null;
    const found = placeForecast(row.forecast, now());
    if (!found) return null;
    return {
      ...found,
      provider: row.provider,
      attribution: weatherAttributions[row.provider],
      fetchedAt: row.fetchedAt.toISOString(),
    };
  },

  /**
   * Lot R8m : `GET /me/weather/places` (`fresh`) et le champ `myWeather` de `GET /me/home` (`stock`, jamais d'attente du
   * fournisseur : une case manquante ou vieille est rafraîchie sans être attendue). Les lieux choisis, sinon la préfecture
   * du premier département (T10), sinon aucun.
   */
  async places(v: Viewer, mode: "fresh" | "stock" = "fresh"): Promise<MyWeatherPlaces> {
    const saved = await db
      .select()
      .from(profileWeatherPlaces)
      .where(eq(profileWeatherPlaces.userId, v.user.id))
      .orderBy(asc(profileWeatherPlaces.slot));
    const shown = myWeatherPlaces({ saved, departments: v.profile.departments });
    const cells = shown.map((p) => weatherCell(p));
    let rows: (typeof weatherPlacesCache.$inferSelect | null)[];
    if (mode === "fresh") {
      rows = await Promise.all(cells.map((c) => this.cellForecast(c).catch(() => null)));
    } else {
      const keys = [...new Set(cells.map((c) => c.key))];
      const stock = keys.length
        ? await db.select().from(weatherPlacesCache).where(inArray(weatherPlacesCache.cell, keys))
        : [];
      const byKey = new Map(stock.map((r) => [r.cell, r]));
      rows = cells.map((c) => byKey.get(c.key) ?? null);
      for (const c of new Map(cells.map((cell) => [cell.key, cell])).values()) {
        const row = byKey.get(c.key);
        if (!row || now().getTime() - row.fetchedAt.getTime() >= DEPARTMENT_TTL_MS) {
          void this.cellForecast(c).catch((error) =>
            console.warn("Météo du lieu non rafraîchie :", error instanceof Error ? error.message : error),
          );
        }
      }
    }
    return {
      max: WEATHER_PLACES_MAX,
      places: shown.map((p, i) => ({
        slot: p.slot,
        label: p.label,
        source: p.source,
        weather: this.placeWeather(rows[i]),
      })),
    };
  },

  /** `PUT /me/weather/places` : remplace tous les lieux choisis du compte (0 à 2), arrondis à 0,01°. */
  async savePlaces(v: Viewer, places: { label: string; lat: number; lng: number }[]): Promise<MyWeatherPlaces> {
    await withTx(async (tx) => {
      // Deux enregistrements simultanés du même compte se suivent (verrou sur son profil), jamais de conflit de clé.
      await tx.select({ id: profiles.userId }).from(profiles).where(eq(profiles.userId, v.user.id)).for("update");
      await tx.delete(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, v.user.id));
      if (places.length === 0) return;
      await tx.insert(profileWeatherPlaces).values(
        places.slice(0, WEATHER_PLACES_MAX).map((p, slot) => ({
          userId: v.user.id,
          slot,
          label: p.label,
          ...roundPlace(p),
          updatedAt: now(),
        })),
      );
    });
    return this.places(v);
  },

  /**
   * Lot R8m : `POST /weather/at` (« Utiliser ma position »). La position est arrondie à 0,1° dès la première ligne ; rien
   * d'autre que la case ne va au fournisseur, au cache ou au géocodeur, et rien n'est écrit pour le compte.
   */
  async at(position: { lat: number; lng: number }): Promise<WeatherAt> {
    const cell = weatherCell(position);
    const [city, row] = await Promise.all([reverseCity(cell), this.cellForecast(cell).catch(() => null)]);
    return { label: city ?? "Ma position", weather: this.placeWeather(row) };
  },
};
