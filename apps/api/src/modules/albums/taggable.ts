// Qui est identifiable sur une photo d'un album (lot R9f, T37 et T5). Deux ensembles, calculés ici une fois et lus par la route
// `GET /albums/:id/taggable`, par la pose d'une identification et par « C'est ma voiture » :
// - les **voitures** : candidature de véhicule retenue **avec un pointage** (`checkins`), compte en règle, véhicule actif, quel que
//   soit le moment (T37). Un événement sans **aucun** pointage (organisateur sans scan) : repli, toutes les voitures retenues ;
// - les **personnes** (recherche par pseudo, au moins 2 caractères, jamais l'annuaire) : celles qui avaient une place (candidature de
//   véhicule retenue ou billet `valid | used`) ou une présence validée (`event_presences`), compte en règle.
// Rien ici ne fait une liste de personnes sans texte à chercher : « aucune fonction ne rend une liste de personnes » (`presence/repo`).
import {
  ALBUM_TAG_SEARCH_MIN,
  maskedPhoto,
  type Taggable,
  type TaggablePerson,
  type TaggableQuery,
  type TaggableVehicle,
  type TagRole,
} from "@orasso/shared";
import { and, asc, desc, eq, exists, isNull, lte, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, checkins, profiles, vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { vehiclesRepo } from "../vehicles/repo";
import { makeNameOf, modelNameOf, vehicleLabel } from "../vehicles/serializers";
import { actorOf, roleOf, visibleAlbum } from "./tag-visibility";

/** Compte en règle : ni supprimé, ni banni, ni suspendu. */
const accountOk = (t: Date) =>
  and(
    isNull(profiles.deletedAt),
    isNull(profiles.bannedAt),
    or(isNull(profiles.suspendedUntil), lte(profiles.suspendedUntil, t)),
  ) as SQL;

/** Entrée pointée (scan, pointage, express) de la candidature. */
const checkedIn = () =>
  exists(db.select({ one: sql`1` }).from(checkins).where(eq(checkins.applicationId, applications.id)));

/** Y a-t-il au moins un pointage à cet événement ? Sinon : repli, toutes les voitures retenues. */
export async function eventHasCheckins(ex: Executor, eventId: string): Promise<boolean> {
  const res = await ex.execute(sql`select 1 from checkins where event_id = ${eventId} limit 1`);
  return res.rows.length > 0;
}

export type EligibleVehicle = {
  vehicleId: string;
  ownerId: string;
  pseudo: string;
  accountPrivate: boolean;
  mine: boolean;
};

/** Plafond de voitures lues pour un plateau (un événement compte quelques centaines de voitures au plus). */
const MAX_ELIGIBLE = 1000;

/**
 * Les voitures identifiables à l'événement (T37), ma voiture en tête puis dans l'ordre des acceptations. `ownerId` : seulement
 * les voitures de cette personne (l'intéressé) ; `vehicleId` : une voiture précise (la pose).
 */
export async function eligibleVehicles(
  ex: Executor,
  eventId: string,
  viewerId: string,
  opts: { ownerId?: string; vehicleId?: string } = {},
): Promise<{ rows: EligibleVehicle[]; fallback: boolean }> {
  const at = now();
  const fallback = !(await eventHasCheckins(ex, eventId));
  const mine = sql<boolean>`bool_or(${vehicles.ownerId} = ${viewerId})`;
  const firstAt = sql`min(coalesce(${applications.decidedAt}, ${applications.createdAt}))`;
  const rows = await ex
    .select({
      vehicleId: vehicles.id,
      ownerId: vehicles.ownerId,
      pseudo: profiles.pseudo,
      visibility: profiles.visibility,
      mine,
    })
    .from(applications)
    .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .innerJoin(profiles, eq(profiles.userId, vehicles.ownerId))
    .where(
      and(
        eq(applications.eventId, eventId),
        eq(applications.kind, "vehicle"),
        eq(applications.status, "accepted"),
        eq(vehicles.status, "active"),
        accountOk(at),
        fallback ? undefined : checkedIn(),
        opts.ownerId ? eq(vehicles.ownerId, opts.ownerId) : undefined,
        opts.vehicleId ? eq(vehicles.id, opts.vehicleId) : undefined,
      ),
    )
    .groupBy(vehicles.id, vehicles.ownerId, profiles.userId)
    .orderBy(desc(mine), asc(firstAt), asc(vehicles.id))
    .limit(MAX_ELIGIBLE);
  return {
    rows: rows.map((r) => ({
      vehicleId: r.vehicleId,
      ownerId: r.ownerId,
      pseudo: r.pseudo,
      accountPrivate: r.visibility === "private",
      mine: Boolean(r.mine),
    })),
    fallback,
  };
}

/** « a une place ou une présence » : candidature de véhicule retenue, billet valable ou contrôlé, présence validée (GPS). */
const hadAPlace = (eventId: string) => sql`(
  exists (select 1 from applications a where a.event_id = ${eventId} and a.user_id = ${profiles.userId}
    and a.kind = 'vehicle' and a.status = 'accepted')
  or exists (select 1 from tickets t where t.event_id = ${eventId} and t.user_id = ${profiles.userId}
    and t.status in ('valid', 'used'))
  or exists (select 1 from event_presences g where g.event_id = ${eventId} and g.user_id = ${profiles.userId}))`;

/** Cette personne peut-elle être identifiée par son pseudo à cet événement ? (une place ou une présence, compte en règle) */
export async function isPersonTaggable(ex: Executor, eventId: string, userId: string): Promise<boolean> {
  const rows = await ex
    .select({ id: profiles.userId })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), accountOk(now()), hadAPlace(eventId)))
    .limit(1);
  return rows.length > 0;
}

/** Le motif d'une recherche : le texte tel quel, jamais une expression (`%`, `_` et `\` sont des caractères). */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

const PEOPLE_MAX = 20;

/** La recherche par pseudo : au moins 2 caractères, ceux qui avaient une place ou une présence, le pseudo qui commence par `q` d'abord. */
export async function searchPeople(
  ex: Executor,
  eventId: string,
  q: string,
  viewerId: string,
): Promise<TaggablePerson[]> {
  const at = now();
  const rows = await ex
    .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
    .from(profiles)
    .where(and(accountOk(at), hadAPlace(eventId), sql`${profiles.pseudo} ilike ${likePattern(q)}`))
    .orderBy(sql`(${profiles.pseudo} ilike ${`${q.replace(/[\\%_]/g, "\\$&")}%`}) desc`, asc(profiles.pseudo))
    .limit(PEOPLE_MAX);
  return rows.map((r) => ({
    userId: r.userId,
    pseudo: r.pseudo,
    avatarUrl: storage.url(r.avatarKey),
    mine: r.userId === viewerId,
  }));
}

export const taggableService = {
  /**
   * `GET /albums/:id/taggable?q=&category=&cursor=&limit=` : le plateau à choisir et la recherche par pseudo. Le média auteur et
   * l'organisateur voient tout l'ensemble ; toute autre personne connectée, seulement **ses** voitures et son propre pseudo.
   */
  async list(v: Viewer, albumId: string, q: TaggableQuery): Promise<Taggable> {
    const join = await visibleAlbum(db, v, albumId);
    const role: TagRole = await roleOf(db, v, join, await actorOf(db, v, join));
    const search = q.q && q.q.length >= ALBUM_TAG_SEARCH_MIN ? q.q : undefined;
    if (search) rateLimit("peopleSearch", v.user.id);
    const eventId = join.e.id;
    const { rows, fallback } = await eligibleVehicles(db, eventId, v.user.id, {
      ownerId: role === "owner" ? v.user.id : undefined,
    });
    const full = new Map((await vehiclesRepo.findFullByIds(rows.map((r) => r.vehicleId))).map((x) => [x.id, x]));
    // Les puces de catégorie : celles de tout le plateau proposé (ni le texte ni la puce choisie ne les réduisent).
    const facets = new Map<string, { slug: string; label: string; count: number }>();
    const needle = q.q?.toLowerCase();
    const cars: TaggableVehicle[] = [];
    for (const r of rows) {
      const x = full.get(r.vehicleId);
      if (!x) continue;
      const cats = x.categories.map((c) => c.category).filter((c) => c.active);
      for (const c of cats) {
        const f = facets.get(c.slug) ?? { slug: c.slug, label: c.label, count: 0 };
        f.count += 1;
        facets.set(c.slug, f);
      }
      if (q.category && !cats.some((c) => c.slug === q.category)) continue;
      const label = vehicleLabel(x);
      // Le texte cherche le nom de la voiture, et le pseudo d'un compte **public** seulement : celui d'un compte privé ne se devine pas.
      if (needle) {
        const byName = label.toLowerCase().includes(needle);
        const byPseudo = (!r.accountPrivate || r.mine) && r.pseudo.toLowerCase().includes(needle);
        if (!byName && !byPseudo) continue;
      }
      cars.push({
        vehicleId: x.id,
        label,
        makeName: makeNameOf(x),
        modelName: modelNameOf(x),
        // La règle de plaque des photos de voiture : jamais une photo dont la plaque n'est ni floutée ni confirmée absente.
        photoUrl: storage.url(maskedPhoto(x.photos, x.unregistered)?.storageKey ?? null),
        pseudo: r.accountPrivate && !r.mine ? null : r.pseudo,
        private: r.accountPrivate && !r.mine,
        mine: r.mine,
        categories: cats.map((c) => c.slug),
      });
    }
    const start = q.cursor ?? 0;
    const page = cars.slice(start, start + q.limit);
    let people: TaggablePerson[] = [];
    if (search) {
      people =
        role === "owner"
          ? // Un intéressé : lui seul, si son pseudo correspond et s'il avait une place ou une présence.
            (await searchPeople(db, eventId, search, v.user.id)).filter((p) => p.mine)
          : await searchPeople(db, eventId, search, v.user.id);
    } else if (role === "owner" && (await isPersonTaggable(db, eventId, v.user.id))) {
      // « C'est ma voiture » / « C'est moi » : mon propre pseudo est proposé, jamais celui d'un autre sans recherche.
      people = [
        {
          userId: v.user.id,
          pseudo: v.profile.pseudo,
          avatarUrl: storage.url(v.profile.avatarKey),
          mine: true,
        },
      ];
    }
    return {
      role,
      vehicles: page,
      people,
      categories: [...facets.values()].sort((a, b) => a.label.localeCompare(b.label, "fr")),
      fallback,
      nextCursor: start + q.limit < cars.length ? start + q.limit : null,
    };
  },
};
