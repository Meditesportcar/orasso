// Page du crew (lot R5c2, maquettes R5.7 et R5.8, décisions de Damien du 26/10) : ce que la fiche d'un crew montre.
// - Tout le monde (connecté) : la vitrine, c'est-à-dire l'image du crew, la description, l'Instagram et les membres
//   (pseudo, avatar, grade, rôle ; `friend` pour les amis de la personne qui regarde). Rien d'autre.
// - Membres actifs : l'espace du crew (`CrewSpace`) : sorties, garage, « Où va le crew », non-lus de la discussion.
// Les comptes supprimés, bannis ou suspendus sont exclus partout (listes et nombres).
import {
  CREW_OUTING_VISIBLE_HOURS,
  type CrewEventView,
  type CrewFace,
  type CrewGarageVehicle,
  type CrewOutingRsvp,
  type CrewOutingView,
  type CrewRole,
  type CrewVitrineMember,
  canManageCrewOuting,
  effectiveMainVehicleId,
  garageOrder,
  HOUR,
  maskedPhoto,
} from "@orasso/shared";
import { and, asc, eq, gt, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  crewMembers,
  crewOutingReplies,
  crewOutings,
  type crews,
  events,
  profiles,
  vehicles,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import type { Profile } from "../profiles/repo";
import { socialRepo } from "../social/repo";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

type CrewRow = typeof crews.$inferSelect;

/** Profil joignable : ni supprimé, ni banni, ni suspendu à cet instant. */
export const reachableProfileSql = (at: Date): SQL =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

export type ActiveMember = { profile: Profile; role: CrewRole; joinedAt: Date | null };

/** Membres actifs joignables, le chef d'abord puis par date d'arrivée. */
export async function activeMembersOf(crewId: string, at: Date, ex: Executor = db): Promise<ActiveMember[]> {
  const rows = await ex
    .select({ p: profiles, role: crewMembers.role, joinedAt: crewMembers.joinedAt })
    .from(crewMembers)
    .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.status, "active"), reachableProfileSql(at)))
    .orderBy(sql`${crewMembers.role} = 'leader' desc`, asc(crewMembers.joinedAt), asc(profiles.pseudo));
  return rows.map((r) => ({ profile: r.p, role: r.role, joinedAt: r.joinedAt }));
}

const faceOf = (p: Pick<Profile, "pseudo" | "avatarKey">): CrewFace => ({
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
});

/** Vitrine : liste blanche (pseudo, avatar, grade, rôle, ami) ; jamais l'identifiant de compte. */
export async function vitrineMembers(members: ActiveMember[], viewerId: string): Promise<CrewVitrineMember[]> {
  const friends = new Set(await socialRepo.friendIds(viewerId));
  return members.map((m) => ({
    pseudo: m.profile.pseudo,
    avatarUrl: storage.url(m.profile.avatarKey),
    grade: m.profile.grade,
    role: m.role,
    friend: friends.has(m.profile.userId),
  }));
}

/** Bannière vue par cette personne : hors du crew, seulement si la plaque est passée par la chaîne des photos. */
export function bannerFor(crew: Pick<CrewRow, "bannerKey" | "bannerPlateCleared">, member: boolean): string | null {
  if (!crew.bannerKey) return null;
  return member || crew.bannerPlateCleared ? storage.url(crew.bannerKey) : null;
}

/** Véhicules actifs des membres, rangés par membre (le principal d'abord). */
async function vehiclesByOwner(members: ActiveMember[]) {
  const owners = members.map((m) => m.profile.userId);
  const rows = owners.length
    ? await vehiclesRepo.findFull(and(inArray(vehicles.ownerId, owners), eq(vehicles.status, "active")))
    : [];
  const byOwner = new Map<string, typeof rows>();
  for (const v of rows) byOwner.set(v.ownerId, [...(byOwner.get(v.ownerId) ?? []), v]);
  return members.map((m) => {
    const list = byOwner.get(m.profile.userId) ?? [];
    const mainId = effectiveMainVehicleId(list, m.profile.mainVehicleId);
    return { member: m, mainId, list: garageOrder(list, mainId) };
  });
}

/** Le véhicule principal de chaque membre (« Toyota Supra Mk4 »), pour la liste des membres. */
export async function mainVehicleLabels(members: ActiveMember[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const { member, list } of await vehiclesByOwner(members)) {
    out.set(member.profile.userId, list[0] ? vehicleLabel(list[0]) : null);
  }
  return out;
}

/**
 * Garage du crew (membres seulement) : les véhicules actifs des membres, en carrés. La photo ne sort que si sa plaque est
 * masquée ou « aucune plaque visible » confirmé (invariant « Plaques et photos ») ; sinon la silhouette.
 */
export async function crewGarage(members: ActiveMember[]): Promise<CrewGarageVehicle[]> {
  return (await vehiclesByOwner(members)).flatMap(({ member, mainId, list }) =>
    list.map((v) => ({
      id: v.id,
      label: vehicleLabel(v),
      vehicleType: v.vehicleType,
      photoUrl: storage.url(maskedPhoto(v.photos, v.unregistered)?.storageKey ?? null),
      ownerPseudo: member.profile.pseudo,
      isMain: v.id === mainId,
    })),
  );
}

/** Sorties du crew encore à afficher (à venir, ou commencées depuis moins de 12 h), non annulées. */
export async function crewOutingViews(
  crewId: string,
  members: ActiveMember[],
  viewer: { userId: string; isLeader: boolean },
  at: Date,
  only?: string,
): Promise<CrewOutingView[]> {
  const rows = await db
    .select({ o: crewOutings, author: profiles.pseudo, authorDeleted: profiles.deletedAt })
    .from(crewOutings)
    .leftJoin(profiles, eq(profiles.userId, crewOutings.authorId))
    .where(
      and(
        eq(crewOutings.crewId, crewId),
        isNull(crewOutings.cancelledAt),
        only
          ? eq(crewOutings.id, only)
          : gt(crewOutings.startsAt, new Date(at.getTime() - CREW_OUTING_VISIBLE_HOURS * HOUR)),
      ),
    )
    .orderBy(asc(crewOutings.startsAt), asc(crewOutings.id));
  if (!rows.length) return [];
  const active = new Map(members.map((m) => [m.profile.userId, m.profile]));
  const replies = await db
    .select({
      outingId: crewOutingReplies.outingId,
      userId: crewOutingReplies.userId,
      answer: crewOutingReplies.answer,
    })
    .from(crewOutingReplies)
    .where(
      inArray(
        crewOutingReplies.outingId,
        rows.map((r) => r.o.id),
      ),
    )
    .orderBy(asc(crewOutingReplies.answeredAt));
  return rows.map(({ o, author, authorDeleted }) => {
    // Seules comptent les réponses des membres actifs du moment (un membre parti ne vient plus avec le crew).
    const mine = replies.filter((r) => r.outingId === o.id && active.has(r.userId));
    const yes = mine.filter((r) => r.answer === "yes");
    return {
      id: o.id,
      title: o.title,
      startsAt: o.startsAt.toISOString(),
      place: o.place,
      lat: o.lat,
      lng: o.lng,
      program: o.program,
      authorPseudo: author && !authorDeleted ? author : null,
      going: yes.map((r) => faceOf(active.get(r.userId) as Profile)),
      yes: yes.length,
      maybe: mine.filter((r) => r.answer === "maybe").length,
      mine: (mine.find((r) => r.userId === viewer.userId)?.answer ?? null) as CrewOutingRsvp | null,
      canManage: canManageCrewOuting({ isAuthor: o.authorId === viewer.userId, isLeader: viewer.isLeader }),
    };
  });
}

/** Statuts d'une inscription en crew encore vivante (en attente du tri, retenue, en liste d'attente, à confirmer). */
const LIVE_CREW_STATUSES = ["pending", "awaiting_member", "accepted", "waitlisted", "offered"] as const;

/**
 * « Où va le crew » : les événements Orasso à venir où des membres actifs sont retenus (candidature acceptée ; un
 * événement sur invitation seulement si c'est le crew qui y est inscrit), et ceux où le crew est inscrit.
 */
export async function crewEvents(crew: CrewRow, members: ActiveMember[], at: Date): Promise<CrewEventView[]> {
  const ids = members.map((m) => m.profile.userId);
  if (!ids.length) return [];
  const rows = await db
    .select({
      eventId: events.id,
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      city: events.city,
      userId: applications.userId,
      status: applications.status,
      crewId: applications.crewId,
    })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(
      and(
        inArray(applications.userId, ids),
        eq(events.status, "published"),
        gt(events.endsAt, at),
        or(
          and(
            eq(applications.status, "accepted"),
            or(ne(events.admission, "invite_only"), eq(applications.crewId, crew.id)),
          ),
          and(eq(applications.crewId, crew.id), inArray(applications.status, [...LIVE_CREW_STATUSES])),
        ),
      ),
    )
    .orderBy(asc(events.startsAt), asc(events.id));
  const byId = new Map(members.map((m) => [m.profile.userId, m.profile]));
  const out = new Map<string, CrewEventView & { goingIds: Set<string>; registeredIds: Set<string> }>();
  for (const r of rows) {
    let e = out.get(r.eventId);
    if (!e) {
      e = {
        slug: r.slug,
        title: r.title,
        startsAt: r.startsAt.toISOString(),
        city: r.city,
        going: [],
        registered: 0,
        goingIds: new Set(),
        registeredIds: new Set(),
      };
      out.set(r.eventId, e);
    }
    if (r.status === "accepted") e.goingIds.add(r.userId);
    if (r.crewId === crew.id) e.registeredIds.add(r.userId);
  }
  return [...out.values()].slice(0, 12).map(({ goingIds, registeredIds, ...e }) => ({
    ...e,
    going: [...goingIds].map((id) => faceOf(byId.get(id) as Profile)),
    registered: registeredIds.size,
  }));
}
