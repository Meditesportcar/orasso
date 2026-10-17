// Accueil complet (lot 30, ARCHITECTURE-SUITE § 13.3) : `GET /me/home` agrège ce que l'écran affiche, en requêtes
// parallèles bornées. Les widgets masqués ne sont pas calculés (aucun appel de source externe pour un widget caché).
//
// Position : celle de l'appareil (envoyée pour cette requête, ramenée au dixième de degré par `resolvePosition`, jamais
// enregistrée ni journalisée) ou le centre du premier département de secteur. Les listes « autour de moi » ne portent
// que des données publiques (événements publiés, stations) ; aucune position de personne n'en sort.
import {
  type CachedFuelStation,
  type CachedPlace,
  distanceKm,
  type EventCard,
  type EventListQuery,
  type FuelStation,
  HOME_NEARBY_LIMIT,
  HOME_PLACES_LIMIT,
  HOME_RADIUS,
  type HomeData,
  type HomeFavoriteGarage,
  type HomeNudgeKind,
  type HomeQuery,
  type HomeWidgetId,
  type HomeWidgetsConfig,
  homeNudgeOrder,
  type LatLng,
  type MyApplication,
  type NearbyPlace,
  nearestDepartment,
  normalizeHomeWidgets,
  proVisibility,
  resolvePosition,
  visibleHomeWidgets,
} from "@orasso/shared";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { crewMembers, crews, proFollows, profileInterests, profiles, proProfiles, vehicles } from "../../db/schema";
import { twoFactorRequired } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound, validation } from "../../lib/errors";
import { withinBudget } from "../../lib/external/cache";
import { fuelNear } from "../../lib/external/fuel";
import { washNear } from "../../lib/external/overpass";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { applicationsQueries } from "../applications/queries";
import { exploreEvents } from "../events/explore";
import { proOwnerActive } from "../pros/explore";
import { weatherService } from "../weather/service";
import { sponsoredService } from "./sponsored";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Candidature à mettre en tête : la première retenue, sinon la première en cours (comme l'appli). */
export function pickNextAccess(upcoming: MyApplication[]): MyApplication | null {
  return (
    upcoming.find((a) => a.status === "accepted") ??
    upcoming.find((a) => a.status === "pending" || a.status === "waitlisted" || a.status === "offered") ??
    null
  );
}

/** Les stations les plus proches de `from`, avec leur distance (`limit` au plus). */
export function nearestPlaces<T extends CachedPlace>(places: T[], from: LatLng, limit = HOME_PLACES_LIMIT) {
  return places
    .map((p) => ({ ...p, distanceKm: round1(distanceKm(from, p)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export const homeService = {
  async get(v: Viewer, q: HomeQuery): Promise<HomeData> {
    rateLimit("homeRead", v.user.id);

    // Rayon : celui du profil ; `?radiusKm=` ne sert qu'à cet affichage (une lecture n'écrit pas : le curseur enregistre par
    // `PATCH /me/settings`, et un compte suspendu, en lecture seule, voit quand même le rayon qu'il règle).
    let radiusKm: number = q.radiusKm ?? v.profile.radiusKm;
    radiusKm = Math.min(HOME_RADIUS.max, Math.max(HOME_RADIUS.min, radiusKm));

    const widgets = normalizeHomeWidgets(v.profile.homeWidgets);
    const shown = new Set<HomeWidgetId>(visibleHomeWidgets(widgets));
    const located = resolvePosition({ lat: q.lat, lng: q.lng }, v.profile.departments);

    const upcomingPromise = applicationsQueries.mine(v, "upcoming");
    const interestsPromise = db
      .select({ id: profileInterests.categoryId })
      .from(profileInterests)
      .where(eq(profileInterests.userId, v.user.id));

    const [upcoming, interests, nearby, weather, favoriteGarage, wash, fuel, nudge] = await Promise.all([
      upcomingPromise,
      interestsPromise,
      shown.has("nearby") ? this.nearby(v, q, radiusKm, located, upcomingPromise) : Promise.resolve(null),
      shown.has("weather")
        ? withinBudget(
            weatherService.mine(v).catch(() => null),
            null,
          )
        : Promise.resolve(null),
      shown.has("favorite_garage") ? this.favoriteGarage(v) : Promise.resolve(null),
      shown.has("wash") ? this.wash(v, located) : Promise.resolve([] as NearbyPlace[]),
      shown.has("fuel") ? this.fuel(v, located) : Promise.resolve([] as FuelStation[]),
      this.nudge(v),
    ]);
    // L'emplacement sponsorisé n'est compté (affichage) que s'il est vraiment renvoyé.
    const sponsored = await sponsoredService.select(
      v,
      interests.map((i) => i.id),
    );

    return {
      nextAccess: pickNextAccess(upcoming),
      pendingStatuses: upcoming.filter((a) => ["pending", "waitlisted", "offered"].includes(a.status)),
      nearby,
      weather,
      favoriteGarage,
      wash,
      fuel,
      agenda: upcoming.slice(0, 6),
      counts: {
        pending: upcoming.filter((a) => a.status === "pending").length,
        retained: upcoming.filter((a) => a.status === "accepted").length,
      },
      nudge,
      sponsored,
      widgets,
    };
  },

  /** « Autour de moi » : événements à venir à moins de `radiusKm`, par affinités, sans ceux où je suis déjà candidat. */
  async nearby(
    v: Viewer,
    q: HomeQuery,
    radiusKm: number,
    located: ReturnType<typeof resolvePosition>,
    upcomingPromise: Promise<MyApplication[]>,
  ): Promise<NonNullable<HomeData["nearby"]>> {
    if (!located) return { radiusKm, source: null, events: [] };
    const mine = new Set((await upcomingPromise).map((a) => a.event.id));
    const query: EventListQuery = {
      limit: Math.min(20, HOME_NEARBY_LIMIT + mine.size),
      scope: "upcoming",
      sort: "affinity",
      radiusKm,
      lat: q.lat,
      lng: q.lng,
    };
    const page = await exploreEvents(query, v);
    const events: EventCard[] = page.items.filter((e) => !mine.has(e.id)).slice(0, HOME_NEARBY_LIMIT);
    return { radiusKm, source: located.source, events };
  },

  /** Clé de cache d'une source externe : département de la position (celui du secteur, ou le plus proche d'un point). */
  placeDepartment(v: Viewer, located: ReturnType<typeof resolvePosition>): string | null {
    if (!located) return null;
    return located.source === "sector" ? (v.profile.departments[0] ?? null) : nearestDepartment(located.position);
  },

  async wash(v: Viewer, located: ReturnType<typeof resolvePosition>): Promise<NearbyPlace[]> {
    const dept = this.placeDepartment(v, located);
    if (!dept || !located) return [];
    const places = await withinBudget(washNear(dept), [] as CachedPlace[]);
    return nearestPlaces(places, located.position);
  },

  async fuel(v: Viewer, located: ReturnType<typeof resolvePosition>): Promise<FuelStation[]> {
    const dept = this.placeDepartment(v, located);
    if (!dept || !located) return [];
    const stations = await withinBudget(fuelNear(dept), [] as CachedFuelStation[]);
    return nearestPlaces(stations, located.position);
  },

  /** Garage favori : le pro suivi et marqué, s'il est publié, en règle et si la fiche complète est encore visible. */
  async favoriteGarage(v: Viewer): Promise<HomeFavoriteGarage | null> {
    const t = now();
    if (proVisibility(null, null, t).hidden.favoriteGarage) return null;
    const [row] = await db
      .select({ p: proProfiles })
      .from(proFollows)
      .innerJoin(proProfiles, eq(proProfiles.id, proFollows.proId))
      .where(
        and(
          eq(proFollows.userId, v.user.id),
          eq(proFollows.favorite, true),
          isNull(proProfiles.deletedAt),
          isNotNull(proProfiles.publishedAt),
          proOwnerActive(t),
        ),
      )
      .limit(1);
    if (!row) return null;
    const p = row.p;
    return {
      slug: p.slug,
      name: p.name,
      logoUrl: storage.url(p.logoKey),
      activities: p.activities as HomeFavoriteGarage["activities"],
      city: p.city,
      department: p.department,
      lat: p.lat,
      lng: p.lng,
      verified: p.verifiedAt !== null,
      phone: p.phone,
    };
  },

  /** Une seule incitation à la fois : la première qui s'applique (sécurité d'abord). */
  async nudge(v: Viewer): Promise<HomeNudgeKind | null> {
    for (const kind of homeNudgeOrder) {
      if (kind === "verify_email" && !v.user.emailVerified) return kind;
      if (kind === "enable_2fa" && v.user.emailVerified && (await twoFactorRequired(v))) return kind;
      if (kind === "add_vehicle") {
        const [n] = await db
          .select({ n: count() })
          .from(vehicles)
          .where(and(eq(vehicles.ownerId, v.user.id), eq(vehicles.status, "active")));
        if (!n?.n) return kind;
      }
      if (kind === "create_crew") {
        const [n] = await db
          .select({ n: count() })
          .from(crewMembers)
          .innerJoin(crews, eq(crews.id, crewMembers.crewId))
          .where(and(eq(crewMembers.userId, v.user.id), eq(crewMembers.status, "active"), isNull(crews.deletedAt)));
        if (!n?.n) return kind;
      }
    }
    return null;
  },

  /** `PUT /me/home/widgets` : l'ordre et les widgets masqués (normalisés : « Prochain accès » en tête, jamais masqué). */
  async setWidgets(v: Viewer, input: HomeWidgetsConfig): Promise<HomeWidgetsConfig> {
    rateLimit("homeWrite", v.user.id);
    const config = normalizeHomeWidgets(input);
    await db.update(profiles).set({ homeWidgets: config }).where(eq(profiles.userId, v.user.id));
    return config;
  },

  /**
   * `POST /pros/:id/favorite` : marque ce pro comme garage favori (un seul par personne, suivi s'il ne l'était pas).
   * Réservé aux pros visibles : fiche publiée, titulaire en règle, et fiche complète (`proVisibility`, lot 21).
   */
  async setFavorite(v: Viewer, proId: string): Promise<void> {
    rateLimit("homeWrite", v.user.id);
    const t = now();
    const p = await db.query.proProfiles.findFirst({
      where: and(eq(proProfiles.id, proId), isNull(proProfiles.deletedAt), isNotNull(proProfiles.publishedAt)),
    });
    const owner = p ? await db.query.profiles.findFirst({ where: eq(profiles.userId, p.ownerUserId) }) : null;
    if (!p || !owner || owner.deletedAt || (owner.suspendedUntil && owner.suspendedUntil > t)) {
      throw notFound("Fiche pro introuvable");
    }
    if (p.ownerUserId === v.user.id) throw validation("Tu ne peux pas choisir ta propre fiche");
    if (proVisibility(p, null, t).hidden.favoriteGarage) throw forbidden("Garage favori réservé aux pros abonnés");
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(proFollows)
          .set({ favorite: false })
          .where(and(eq(proFollows.userId, v.user.id), eq(proFollows.favorite, true)));
        await tx
          .insert(proFollows)
          .values({ proId, userId: v.user.id, favorite: true })
          .onConflictDoUpdate({ target: [proFollows.proId, proFollows.userId], set: { favorite: true } });
      });
    } catch (error) {
      // Deux choix simultanés : l'index unique partiel (un favori par personne) refuse le second.
      if ((error as { code?: string; cause?: { code?: string } }).cause?.code === "23505") {
        throw conflict("conflict", "Réessaie : un autre choix vient d'être enregistré.");
      }
      throw error;
    }
  },

  /** `DELETE /pros/:id/favorite` : ne retire que le marquage (le pro reste suivi). */
  async unsetFavorite(v: Viewer, proId: string): Promise<void> {
    rateLimit("homeWrite", v.user.id);
    await db
      .update(proFollows)
      .set({ favorite: false })
      .where(and(eq(proFollows.userId, v.user.id), eq(proFollows.proId, proId)));
  },
};
