// Demandes (lot R7c1) : tout ce qu'on attend de moi, réuni en une liste. Une requête par source, chacune avec ses
// propres règles de regard (les services d'origine) ; les actions restent sur leurs routes (`/me/follow-requests/:userId/
// accept`, `/contact-requests/:id/accept`, `/me/crew-invitations/:crewId/accept`…). Rien d'autre que la liste blanche
// ci-dessous ne sort : pas de plaque, pas d'e-mail, pas d'identifiant de plus que celui qu'utilise l'action.
import type { InboxRequestCounts, RequestFrom, RequestItem } from "@orasso/shared";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, plateTransferRequests, profiles, userFollows, vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { crewRegistrationService } from "../crews/registration";
import { crewsService } from "../crews/service";
import { eventInvitesService } from "../event-invites/service";
import { invitationsService } from "../invitations/service";
import { contactsService } from "../messaging/contacts";
import { registerInboxExtras } from "../messaging/inbox";
import { staffRequestsService } from "../staff/requests";
import { plateTransferService } from "../vehicles/plate-transfer";
import { activityService } from "./service";

/** Au plus ce nombre de demandes par sorte (la liste n'est pas un annuaire). */
const PER_KIND = 50;

const person = (pseudo: string, avatarKey: string | null): RequestFrom => ({
  type: "person",
  pseudo,
  avatarUrl: storage.url(avatarKey),
});

const visibleProfile = (at: Date) =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

/** Demandes d'abonnement reçues (compte privé) : l'action est `/me/follow-requests/:userId/accept`, `:userId` = le demandeur. */
async function followItems(me: string): Promise<RequestItem[]> {
  const rows = await db
    .select({ p: profiles, at: userFollows.createdAt })
    .from(userFollows)
    .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
    .where(and(eq(userFollows.followedId, me), eq(userFollows.status, "pending"), visibleProfile(now())))
    .orderBy(desc(userFollows.createdAt))
    .limit(PER_KIND);
  return rows.map(({ p, at }) => ({
    kind: "follow",
    id: p.userId,
    from: person(p.pseudo, p.avatarKey),
    at: at.toISOString(),
    payload: { grade: p.grade },
  }));
}

/**
 * Crews : la demande d'une personne à rejoindre mon crew (je suis chef, `crew`), l'invitation que j'ai reçue
 * (`crew_invitation`, action `/me/crew-invitations/:crewId/accept`) et la venue en crew à confirmer (`crew`, variante
 * `confirmation`).
 */
async function crewItems(v: Viewer): Promise<RequestItem[]> {
  const [requests, confirmations] = await Promise.all([
    crewsService.inboxRequests(v),
    crewRegistrationService.confirmations(v.user.id),
  ]);
  const items: RequestItem[] = requests.slice(0, PER_KIND).map((r) =>
    r.kind === "request"
      ? {
          kind: "crew",
          id: r.crew.id,
          from: { type: "person", pseudo: r.person.pseudo, avatarUrl: r.person.avatarUrl },
          at: r.createdAt,
          payload: {
            variant: "join_request",
            crew: { slug: r.crew.slug, name: r.crew.name, logoUrl: r.crew.logoUrl },
            requesterId: r.person.userId,
            message: r.message,
            invitedBy: r.invitedBy ?? null,
          },
        }
      : {
          kind: "crew_invitation",
          id: r.crew.id,
          from: { type: "person", pseudo: r.person.pseudo, avatarUrl: r.person.avatarUrl },
          at: r.createdAt,
          payload: {
            crew: { slug: r.crew.slug, name: r.crew.name, logoUrl: r.crew.logoUrl },
            leaderConfirms: r.leaderConfirms ?? false,
          },
        },
  );
  const ids = confirmations.slice(0, PER_KIND).map((c) => c.applicationId);
  const dates = ids.length
    ? await db
        .select({ id: applications.id, at: applications.createdAt })
        .from(applications)
        .where(inArray(applications.id, ids))
    : [];
  const at = new Map(dates.map((d) => [d.id, d.at]));
  for (const c of confirmations.slice(0, PER_KIND)) {
    items.push({
      kind: "crew",
      id: c.applicationId,
      from: { type: "structure", name: c.crew.name, logoUrl: c.crew.logoUrl },
      at: (at.get(c.applicationId) ?? new Date(c.confirmBefore)).toISOString(),
      payload: {
        variant: "confirmation",
        crew: { slug: c.crew.slug, name: c.crew.name },
        leaderPseudo: c.leaderPseudo,
        event: { slug: c.event.slug, title: c.event.title, startsAt: c.event.startsAt, city: c.event.city },
        vehicleLabel: c.vehicleLabel,
        confirmBefore: c.confirmBefore,
      },
    });
  }
  return items;
}

/**
 * Invitations à un événement : celles d'un organisateur (`source organizer`, action `/event-invitations/:id/accept`) et
 * celles de passionnés (`source peer` : `id` = l'événement ; on y répond sur sa fiche, « Kenji_66 et Julie_66 t'invitent »).
 */
async function eventInvitationItems(v: Viewer): Promise<RequestItem[]> {
  const [organizers, peers] = await Promise.all([
    invitationsService.mine(v),
    eventInvitesService.receivedAll(v.user.id),
  ]);
  const fromOrganizers = organizers.slice(0, PER_KIND).map(
    (i): RequestItem => ({
      kind: "event_invitation",
      id: i.id,
      from: { type: "structure", name: i.event.structure.name, logoUrl: i.event.structure.logoUrl },
      at: i.createdAt,
      payload: {
        source: "organizer",
        message: i.message,
        event: {
          slug: i.event.slug,
          title: i.event.title,
          startsAt: i.event.startsAt,
          city: i.event.city,
          posterUrl: i.event.posterUrl,
        },
        vehicleLabel: i.vehicle?.label ?? null,
        lockAt: i.event.lockAt,
      },
    }),
  );
  const fromPeers = peers.map(
    (i): RequestItem => ({
      kind: "event_invitation",
      id: i.event.id,
      from: { type: "person", pseudo: i.inviters[0]?.pseudo ?? "", avatarUrl: i.inviters[0]?.avatarUrl ?? null },
      at: i.at.toISOString(),
      payload: {
        source: "peer",
        event: {
          slug: i.event.slug,
          title: i.event.title,
          startsAt: i.event.startsAt.toISOString(),
          city: i.event.city,
        },
        inviters: i.inviters.slice(0, 3).map((x) => ({ pseudo: x.pseudo, avatarUrl: x.avatarUrl })),
        invitersCount: i.inviters.length,
        notes: i.inviters.flatMap((x) => (x.note ? [{ pseudo: x.pseudo, note: x.note }] : [])).slice(0, 3),
      },
    }),
  );
  return [...fromOrganizers, ...fromPeers];
}

/** Invitations à rejoindre l'équipe d'une structure : `id` = la structure (action `/structures/:id/members/:me/accept`). */
async function staffItems(v: Viewer): Promise<RequestItem[]> {
  const invitations = await staffRequestsService.myInvitations(v);
  return invitations.slice(0, PER_KIND).map((i) => ({
    kind: "staff",
    id: i.structureId,
    from: { type: "structure", name: i.structureName, logoUrl: i.logoUrl },
    at: i.invitedAt,
    payload: { role: i.role, structureSlug: i.structureSlug, invitedBy: i.invitedBy },
  }));
}

/**
 * Transferts de plaque que je dois traiter (je suis l'ancien propriétaire). La plaque n'est pas dans la liste (elle est
 * sur la fiche du véhicule). La demande d'un compte qui n'est plus en règle n'apparaît pas.
 */
async function plateTransferItems(v: Viewer): Promise<RequestItem[]> {
  const { incoming } = await plateTransferService.listMine(v);
  if (!incoming.length) return [];
  const people = await db
    .select({ pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
    .from(profiles)
    .where(and(inArray(profiles.pseudo, [...new Set(incoming.map((t) => t.requesterPseudo))]), visibleProfile(now())));
  const byPseudo = new Map(people.map((p) => [p.pseudo, p]));
  return incoming.slice(0, PER_KIND).flatMap((t): RequestItem[] => {
    const requester = byPseudo.get(t.requesterPseudo);
    if (!requester) return [];
    return [
      {
        kind: "plate_transfer",
        id: t.id,
        from: person(requester.pseudo, requester.avatarKey),
        at: t.createdAt,
        payload: {
          vehicleLabel: t.holderVehicleLabel,
          requesterVehicleLabel: t.requesterVehicleLabel,
          answerBy: t.answerBy,
          note: t.note,
        },
      },
    ];
  });
}

/** Demandes de message reçues (« Demandes de message ») : action `/contact-requests/:id/accept`. */
async function contactItems(v: Viewer): Promise<RequestItem[]> {
  const { items } = await contactsService.list(v, "in");
  return items.slice(0, PER_KIND).map((r) => ({
    kind: "contact",
    id: r.id,
    from: { type: "person", pseudo: r.person.pseudo, avatarUrl: r.person.avatarUrl },
    at: r.createdAt,
    payload: { message: r.message, grade: r.person.grade },
  }));
}

/** Demandes de transfert de plaque en attente pour moi (comptage de la pastille : mêmes règles que la liste). */
async function pendingPlateTransfers(userId: string, ex: Executor): Promise<number> {
  const [row] = await ex
    .select({ n: count() })
    .from(plateTransferRequests)
    .innerJoin(vehicles, eq(vehicles.id, plateTransferRequests.fromVehicleId))
    .innerJoin(profiles, eq(profiles.userId, plateTransferRequests.toUserId))
    .where(and(eq(vehicles.ownerId, userId), eq(plateTransferRequests.status, "pending"), visibleProfile(now())));
  return row?.n ?? 0;
}

export const requestsService = {
  /** `GET /me/requests` : `{ total, items }`, la plus récente d'abord. `partnership` est prévu, vide jusqu'au lot R7m1. */
  async list(v: Viewer): Promise<{ total: number; items: RequestItem[] }> {
    const sources = await Promise.all([
      followItems(v.user.id),
      crewItems(v),
      eventInvitationItems(v),
      staffItems(v),
      plateTransferItems(v),
      contactItems(v),
    ]);
    const items = sources.flat().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { total: items.length, items };
  },
};

// Pastille « Demandes · 3 » de la Boîte : les compteurs déjà déclarés par chaque domaine, plus les deux sortes qui n'en
// avaient pas (transferts de plaque, invitations entre passionnés). L'activité non vue vient du service de la cloche.
registerInboxExtras(async (userId, requests: InboxRequestCounts, ex) => {
  const [plate, peers] = await Promise.all([
    pendingPlateTransfers(userId, ex),
    eventInvitesService.receivedAll(userId, ex).then((x) => x.length),
  ]);
  const sum = Object.values(requests).reduce((a, b) => a + b, 0);
  return { unseenActivity: await activityService.unseenCount(userId, ex), pendingRequests: sum + plate + peers };
});
