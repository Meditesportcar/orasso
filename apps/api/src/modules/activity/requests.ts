// Demandes (lot R7c1) : tout ce qu'on attend de moi, réuni en une liste. Une requête par source, chacune avec ses
// propres règles de regard (les services d'origine) ; les actions restent sur leurs routes (`/me/follow-requests/:userId/
// accept`, `/contact-requests/:id/accept`, `/me/crew-invitations/:crewId/accept`…). Rien d'autre que la liste blanche
// ci-dessous ne sort : pas de plaque, pas d'e-mail, pas d'identifiant de plus que celui qu'utilise l'action.
import type { InboxRequestCounts, RequestFrom, RequestItem, RequestsPage } from "@orasso/shared";
import { and, count, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, plateTransferRequests, profiles, userFollows, vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import { validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { crewRegistrationService } from "../crews/registration";
import { crewsService } from "../crews/service";
import { eventInvitesService } from "../event-invites/service";
import { invitationsService } from "../invitations/service";
import { contactsService } from "../messaging/contacts";
import { inboxService, registerInboxExtras } from "../messaging/inbox";
import { staffRequestsService } from "../staff/requests";
import { plateTransferService } from "../vehicles/plate-transfer";
import { activityService } from "./service";

/** Demandes par page de `GET /me/requests` (tour 2 : la suite se charge par `nextCursor`). */
export const REQUESTS_PAGE_SIZE = 50;

/** Une demande et son identifiant de tri, unique dans sa sorte (celui de l'action n'y suffit pas : voir `crewItems`). */
type Keyed = { item: RequestItem; key: string };
/** Position dans la liste : date, sorte, identifiant de tri. C'est le contenu du curseur. */
type Position = { at: string; kind: string; key: string };
const keyed = (item: RequestItem, key: string = item.id): Keyed => ({ item, key });
const positionOf = ({ item, key }: Keyed): Position => ({ at: item.at, kind: item.kind, key });

const person = (pseudo: string, avatarKey: string | null): RequestFrom => ({
  type: "person",
  pseudo,
  avatarUrl: storage.url(avatarKey),
});

const visibleProfile = (at: Date) =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

/** Demandes d'abonnement reçues en attente, d'un compte en règle (les mêmes lignes pour la liste, la page et le total). */
const pendingFollows = (me: string) =>
  and(eq(userFollows.followedId, me), eq(userFollows.status, "pending"), visibleProfile(now()));

/** Date de la demande à la milliseconde, comme dans la liste (les dates des éléments sont en ISO, à la milliseconde). */
const followAt = sql`date_trunc('milliseconds', ${userFollows.createdAt})`;
const followKey = sql`${userFollows.followerId} collate "C"`;

/**
 * Demandes d'abonnement reçues (compte privé) : l'action est `/me/follow-requests/:userId/accept`, `:userId` = le demandeur.
 * Le curseur s'applique dans la requête, avant la limite de la page : seules les `limit` demandes qui suivent sont lues.
 */
async function followItems(me: string, after: Position | null, limit: number): Promise<Keyed[]> {
  // Même ordre que la liste (date, sorte `follow`, identifiant du demandeur), l'identifiant comparé octet par octet.
  const past = after
    ? "follow" < after.kind
      ? sql`${followAt} <= ${new Date(after.at)}`
      : "follow" === after.kind
        ? sql`(${followAt} < ${new Date(after.at)} or (${followAt} = ${new Date(after.at)} and ${followKey} < ${after.key} collate "C"))`
        : sql`${followAt} < ${new Date(after.at)}`
    : undefined;
  const rows = await db
    .select({ p: profiles, at: userFollows.createdAt })
    .from(userFollows)
    .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
    .where(and(pendingFollows(me), past))
    .orderBy(sql`${followAt} desc`, sql`${followKey} desc`)
    .limit(limit);
  return rows.map(({ p, at }) =>
    keyed({
      kind: "follow",
      id: p.userId,
      from: person(p.pseudo, p.avatarKey),
      at: at.toISOString(),
      payload: { grade: p.grade },
    }),
  );
}

/** Nombre de demandes d'abonnement en attente (indépendant de la page et de sa limite). */
async function followCount(me: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(userFollows)
    .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
    .where(pendingFollows(me));
  return row?.n ?? 0;
}

/**
 * Crews : la demande d'une personne à rejoindre mon crew (je suis chef, `crew`), l'invitation que j'ai reçue
 * (`crew_invitation`, action `/me/crew-invitations/:crewId/accept`) et la venue en crew à confirmer (`crew`, variante
 * `confirmation`).
 */
async function crewItems(v: Viewer): Promise<Keyed[]> {
  const [requests, confirmations] = await Promise.all([
    crewsService.inboxRequests(v),
    crewRegistrationService.confirmations(v.user.id),
  ]);
  const items: Keyed[] = requests.map((r) =>
    r.kind === "request"
      ? // Plusieurs demandes d'un même crew portent le même `id` (le crew) et souvent la même date : le demandeur
        // départage, sinon le curseur sauterait ou répéterait l'une d'elles.
        keyed(
          {
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
          },
          `${r.crew.id}:${r.person.userId}`,
        )
      : keyed({
          kind: "crew_invitation",
          id: r.crew.id,
          from: { type: "person", pseudo: r.person.pseudo, avatarUrl: r.person.avatarUrl },
          at: r.createdAt,
          payload: {
            crew: { slug: r.crew.slug, name: r.crew.name, logoUrl: r.crew.logoUrl },
            leaderConfirms: r.leaderConfirms ?? false,
          },
        }),
  );
  const ids = confirmations.map((c) => c.applicationId);
  const dates = ids.length
    ? await db
        .select({ id: applications.id, at: applications.createdAt })
        .from(applications)
        .where(inArray(applications.id, ids))
    : [];
  const at = new Map(dates.map((d) => [d.id, d.at]));
  for (const c of confirmations) {
    items.push(
      keyed({
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
      }),
    );
  }
  return items;
}

/**
 * Invitations à un événement : celles d'un organisateur (`source organizer`, action `/event-invitations/:id/accept`) et
 * celles de passionnés (`source peer` : `id` = l'événement ; on y répond sur sa fiche, « Kenji_66 et Julie_66 t'invitent »).
 * Sans plafond (`all`) : le curseur, lui, borne ce qui sort.
 */
async function eventInvitationItems(v: Viewer): Promise<Keyed[]> {
  const [organizers, peers] = await Promise.all([
    invitationsService.mine(v, { all: true }),
    eventInvitesService.receivedAll(v.user.id, db, { all: true }),
  ]);
  const fromOrganizers = organizers.map((i) =>
    keyed({
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
  const fromPeers = peers.map((i) =>
    keyed({
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
async function staffItems(v: Viewer): Promise<Keyed[]> {
  const invitations = await staffRequestsService.myInvitations(v);
  return invitations.map((i) =>
    keyed({
      kind: "staff",
      id: i.structureId,
      from: { type: "structure", name: i.structureName, logoUrl: i.logoUrl },
      at: i.invitedAt,
      payload: { role: i.role, structureSlug: i.structureSlug, invitedBy: i.invitedBy },
    }),
  );
}

/**
 * Transferts de plaque que je dois traiter (je suis l'ancien propriétaire). La plaque n'est pas dans la liste (elle est
 * sur la fiche du véhicule). La demande d'un compte qui n'est plus en règle n'apparaît pas.
 */
async function plateTransferItems(v: Viewer): Promise<Keyed[]> {
  const { incoming } = await plateTransferService.listMine(v);
  if (!incoming.length) return [];
  const people = await db
    .select({ pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
    .from(profiles)
    .where(and(inArray(profiles.pseudo, [...new Set(incoming.map((t) => t.requesterPseudo))]), visibleProfile(now())));
  const byPseudo = new Map(people.map((p) => [p.pseudo, p]));
  return incoming.flatMap((t): Keyed[] => {
    const requester = byPseudo.get(t.requesterPseudo);
    if (!requester) return [];
    return [
      keyed({
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
      }),
    ];
  });
}

/** Demandes de message reçues (« Demandes de message ») : action `/contact-requests/:id/accept`. */
async function contactItems(v: Viewer): Promise<Keyed[]> {
  const { items } = await contactsService.list(v, "in");
  return items.map((r) =>
    keyed({
      kind: "contact",
      id: r.id,
      from: { type: "person", pseudo: r.person.pseudo, avatarUrl: r.person.avatarUrl },
      at: r.createdAt,
      payload: { message: r.message, grade: r.person.grade },
    }),
  );
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

/** Ordre de la liste : la plus récente d'abord, puis par sorte et identifiant de tri (stable d'une page à l'autre). */
const compare = (a: Position, b: Position) =>
  a.at < b.at
    ? 1
    : a.at > b.at
      ? -1
      : a.kind < b.kind
        ? 1
        : a.kind > b.kind
          ? -1
          : a.key < b.key
            ? 1
            : a.key > b.key
              ? -1
              : 0;

/** Curseur : la position (date, sorte, identifiant de tri) du dernier élément servi. Illisible ou faux : 400. */
const encodeRequestCursor = (p: Position) => Buffer.from(JSON.stringify([p.at, p.kind, p.key])).toString("base64url");
function decodeRequestCursor(cursor: string): Position {
  try {
    const [at, kind, key] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown[];
    if (
      typeof at === "string" &&
      typeof kind === "string" &&
      typeof key === "string" &&
      !Number.isNaN(Date.parse(at))
    ) {
      return { at, kind, key };
    }
  } catch {
    // curseur illisible : même réponse que faux
  }
  throw validation("Curseur invalide.");
}

export const requestsService = {
  /**
   * `GET /me/requests?cursor=` : `{ total, items, nextCursor }`, la plus récente d'abord, 50 par page. `total` est le
   * nombre de toutes les demandes en attente, pas la longueur de la page ni de ce qui a été lu. `partnership` est prévu,
   * vide jusqu'au lot R7m1. Le curseur s'applique dans chaque source avant sa limite (les 51 suivantes au plus), puis
   * les sources sont fusionnées : aucune demande n'est cachée par un plafond, quelle que soit la page.
   */
  async list(v: Viewer, cursor?: string): Promise<RequestsPage> {
    const after = cursor ? decodeRequestCursor(cursor) : null;
    const window = (list: Keyed[]) =>
      list
        .filter((x) => !after || compare(after, positionOf(x)) < 0)
        .sort((a, b) => compare(positionOf(a), positionOf(b)))
        .slice(0, REQUESTS_PAGE_SIZE + 1);
    const [follows, followTotal, ...others] = await Promise.all([
      followItems(v.user.id, after, REQUESTS_PAGE_SIZE + 1),
      followCount(v.user.id),
      crewItems(v),
      eventInvitationItems(v),
      staffItems(v),
      plateTransferItems(v),
      contactItems(v),
    ]);
    const rest = [...follows, ...others.flatMap(window)].sort((a, b) => compare(positionOf(a), positionOf(b)));
    const items = rest.slice(0, REQUESTS_PAGE_SIZE);
    const last = items.at(-1);
    const { pendingRequests } = await inboxService.summary(v.user.id, { includeStructure: false });
    return {
      total: Math.max(pendingRequests, followTotal + others.reduce((n, list) => n + list.length, 0)),
      items: items.map((x) => x.item),
      nextCursor: rest.length > REQUESTS_PAGE_SIZE && last ? encodeRequestCursor(positionOf(last)) : null,
    };
  },
};

// Pastille « Demandes · 3 » de la Boîte : les compteurs déjà déclarés par chaque domaine, plus les deux sortes qui n'en
// avaient pas (transferts de plaque, invitations entre passionnés). L'activité non vue vient du service de la cloche.
registerInboxExtras(async (userId, requests: InboxRequestCounts, ex) => {
  const [plate, peers] = await Promise.all([
    pendingPlateTransfers(userId, ex),
    eventInvitesService.receivedAll(userId, ex, { all: true }).then((x) => x.length),
  ]);
  const sum = Object.values(requests).reduce((a, b) => a + b, 0);
  return { unseenActivity: await activityService.unseenCount(userId, ex), pendingRequests: sum + plate + peers };
});
