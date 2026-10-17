// Profil d'un autre et fiche d'un véhicule d'un autre, selon l'audience (ARCHITECTURE-SUITE § 2.2).
// Jamais la plaque. Nom, prénom, téléphone et e-mail : audience `organizer` seulement.
import {
  friendshipState,
  type OtherVehicle,
  type ProfileAudience,
  type ProfileVehicle,
  profileAudience,
  profileFields,
  type UserProfileView,
} from "@orasso/shared";
import { and, asc, desc, eq, gt, gte, lt, ne, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, structures, user, vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { crewsService } from "../crews/service";
import { type Profile, profilesRepo } from "../profiles/repo";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleBrief, vehicleLabel, vehiclePublic } from "../vehicles/serializers";
import { socialRepo } from "./repo";

const DAY = 86_400_000;

/**
 * Organisateur (propriétaire ou co-organisateur actif) d'une structure en règle (ni supprimée ni suspendue) dont la
 * personne est abonnée, ou à un événement de laquelle elle a une candidature en cours (en attente, retenue, liste
 * d'attente, offre) dont l'événement n'est pas fini depuis plus de 7 jours (docs/01 : « pendant l'événement et
 * jusqu'à J+7 »). Une candidature refusée, retirée ou expirée n'ouvre rien.
 */
export async function isOrganizerOf(viewerId: string, targetId: string, at: Date = now()): Promise<boolean> {
  const result = await db.execute(sql`
    select 1
    from structure_members m
    join structures s on s.id = m.structure_id
    where m.user_id = ${viewerId}
      and s.deleted_at is null
      and s.verification <> 'suspended'
      and m.status = 'active'
      and m.role in ('owner', 'co_organizer')
      and (
        exists (
          select 1 from applications a join events e on e.id = a.event_id
          where a.user_id = ${targetId} and e.structure_id = m.structure_id
            and a.status in ('pending', 'accepted', 'waitlisted', 'offered')
            and e.ends_at >= ${new Date(at.getTime() - 7 * DAY)}
        )
        or exists (select 1 from structure_follows sf where sf.structure_id = m.structure_id and sf.user_id = ${targetId})
      )
    limit 1`);
  return result.rows.length > 0;
}

export async function audienceFor(
  viewer: Viewer,
  target: Profile,
  opts: { asStranger?: boolean } = {},
): Promise<{ audience: ProfileAudience; friendshipId: string | null; state: ReturnType<typeof friendshipState> }> {
  if (opts.asStranger) {
    return {
      audience: profileAudience({ isSelf: false, isFriend: false, isOrganizer: false, visibility: target.visibility }),
      friendshipId: null,
      state: "none",
    };
  }
  const isSelf = target.userId === viewer.user.id;
  const row = isSelf ? null : await socialRepo.pair(viewer.user.id, target.userId);
  const state = friendshipState(row, viewer.user.id, now());
  const isOrganizer = isSelf ? false : await isOrganizerOf(viewer.user.id, target.userId);
  return {
    audience: profileAudience({ isSelf, isFriend: state === "friends", isOrganizer, visibility: target.visibility }),
    friendshipId: row && row.status !== "declined" ? row.id : null,
    state,
  };
}

async function profileEvents(userId: string, at: Date) {
  const upcoming = await db
    .select({
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      city: events.city,
      posterKey: events.posterKey,
      structureName: structures.name,
    })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .innerJoin(structures, eq(structures.id, events.structureId))
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.status, "accepted"),
        eq(events.status, "published"),
        ne(events.admission, "invite_only"),
        gt(events.endsAt, at),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(20);
  const past = await db
    .select({ title: events.title })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.status, "accepted"),
        eq(events.status, "published"),
        ne(events.admission, "invite_only"),
        lt(events.endsAt, at),
        gte(events.endsAt, new Date(at.getTime() - 365 * DAY)),
      ),
    )
    .orderBy(desc(events.endsAt));
  return {
    upcoming: upcoming.map((e) => ({
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      city: e.city,
      posterUrl: storage.url(e.posterKey),
      structureName: e.structureName,
    })),
    past: { count: past.length, titles: past.slice(0, 5).map((e) => e.title) },
  };
}

export const socialProfile = {
  /** `GET /users/:pseudo` (et l'aperçu `/me/public-preview` avec `asStranger`). */
  async view(viewer: Viewer, pseudo: string, opts: { asStranger?: boolean } = {}): Promise<UserProfileView> {
    const target = await profilesRepo.byPseudo(pseudo);
    // Lot 32 (relecture) : un compte banni n'est plus consultable par lien, sauf par lui-même.
    if (!target || target.deletedAt || (target.bannedAt && target.userId !== viewer.user.id)) {
      throw notFound("Profil introuvable");
    }
    const { audience, friendshipId, state } = await audienceFor(viewer, target, opts);
    const fields = profileFields(audience);
    const at = now();

    const garage = await vehiclesRepo.findFull(and(eq(vehicles.ownerId, target.userId), eq(vehicles.status, "active")));
    const profileVehicles: ProfileVehicle[] = garage.map((g) =>
      fields.vehicleDetails
        ? {
            id: g.id,
            label: vehicleLabel(g),
            makeName: g.make.name,
            modelName: g.model.name,
            photoUrl: storage.url(g.photos[0]?.storageKey ?? null),
            detailed: true,
          }
        : {
            id: g.id,
            label: vehicleBrief(g).label,
            makeName: g.make.name,
            modelName: g.model.name,
            photoUrl: null,
            detailed: false,
          },
    );

    const ev = fields.upcomingEvents || fields.pastEvents ? await profileEvents(target.userId, at) : null;
    let contact: UserProfileView["contact"] = null;
    if (fields.contact) {
      const account = await db.query.user.findFirst({ where: eq(user.id, target.userId), columns: { email: true } });
      contact = {
        firstName: target.firstName,
        lastName: target.lastName,
        phone: target.phone,
        email: account?.email ?? null,
      };
    }

    return {
      userId: target.userId,
      audience,
      pseudo: target.pseudo,
      avatarUrl: storage.url(target.avatarKey),
      grade: target.grade,
      visibility: target.visibility,
      bio: fields.bio ? target.bio : null,
      departments: fields.departments ? target.departments : null,
      friendsCount: fields.friendsCount ? target.friendsCount : null,
      vehicles: profileVehicles,
      upcomingEvents: fields.upcomingEvents && ev ? ev.upcoming : null,
      pastEvents: fields.pastEvents && ev ? ev.past : null,
      // Crews actifs (lot 19), pour les audiences qui voient tout le profil (docs/01 : public = profil complet).
      crews: fields.crews ? await crewsService.ofUser(target.userId) : null,
      contact,
      friendship: { state, id: friendshipId },
    };
  },

  /** `GET /vehicles/:id` : fiche d'un véhicule d'un autre, complète ou réduite selon le compte de son propriétaire. */
  async vehicleOf(viewer: Viewer, id: string): Promise<OtherVehicle> {
    const row = await vehiclesRepo.findFullById(id);
    if (!row) throw notFound("Véhicule introuvable");
    const owner = await profilesRepo.byUserId(row.ownerId);
    if (!owner || owner.deletedAt || (owner.bannedAt && owner.userId !== viewer.user.id)) {
      throw notFound("Véhicule introuvable");
    }
    // Un véhicule archivé (vendu, accidenté…) n'est plus visible que de son propriétaire.
    if (row.status !== "active" && row.ownerId !== viewer.user.id) throw notFound("Véhicule introuvable");
    const { audience } = await audienceFor(viewer, owner);
    const detailed = profileFields(audience).vehicleDetails;
    return {
      ...(detailed ? vehiclePublic(row) : vehicleBrief(row)),
      detailed,
      owner: {
        userId: owner.userId,
        pseudo: owner.pseudo,
        avatarUrl: storage.url(owner.avatarKey),
        grade: owner.grade,
      },
    };
  },

  /** Niveau de détail des véhicules d'un propriétaire pour `viewer` (recherche, propriétaires près de chez moi). */
  async vehicleDetailFor(viewer: Viewer, owner: Profile): Promise<boolean> {
    const { audience } = await audienceFor(viewer, owner);
    return profileFields(audience).vehicleDetails;
  },
};
