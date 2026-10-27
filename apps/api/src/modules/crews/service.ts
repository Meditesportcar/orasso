// Crews (lot 19, ARCHITECTURE-SUITE § 4) : création, fiche, logo, demandes, invitations, départs, dissolution, et
// synchronisation de la discussion de groupe (conversation `crew`) avec les membres actifs.
//
// Verrous, toujours dans cet ordre : la ligne du crew (`FOR UPDATE`), puis le verrou consultatif de la personne
// (`crews:user:<id>`, limite de 5 crews), puis la conversation. Une ligne `crew_members` par paire (clé primaire) :
// une seule demande ou invitation ouverte, un seul membre par paire.

import { randomBytes } from "node:crypto";
import {
  CREW_CREATIONS_PER_DAY,
  CREW_REQUESTS_PER_DAY,
  CREWS_PER_PERSON,
  type CrewCard,
  type CrewCreate,
  type CrewInboxRequest,
  type CrewMemberView,
  type CrewPendingList,
  type CrewPerson,
  type CrewSearchQuery,
  type CrewUpdate,
  type CrewView,
  canProposeCrewOuting,
  crewErrors,
  crewInviteLabels,
  crewJoinOutcome,
  crewLabels,
  crewViewerState,
  MEMBERS_PER_CREW,
  MESSAGE_PREVIEW_MAX,
  type MyCrew,
  messagePreview,
  type NotificationType,
  notificationTypes,
  type Page,
  PENDING_INVITATIONS_PER_CREW,
  type PlateRect,
  shorten,
} from "@orasso/shared";
import { and, asc, count, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import {
  conversationParticipants,
  conversations,
  crewMembers,
  crews,
  messages,
  notifications,
  profiles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { escapeLike } from "../../lib/pagination";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { uniqueSlug } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { eventInvitesService } from "../event-invites/service";
import { activeCrewMembers, crewRules } from "../messaging/access/crew";
import { publishToConversation, serializeMessage, unreadCountOf } from "../messaging/core";
import { inboxService } from "../messaging/inbox";
import { nextMessageAt } from "../messaging/service";
import { notificationsService } from "../notifications/service";
import { type Profile, profilesRepo } from "../profiles/repo";
import { uploadsService } from "../uploads/service";
import { blurPlateRegions, MAX_INPUT_PIXELS, removeOrRetry } from "../vehicles/photos-blur";
import { MAX_PHOTO_BYTES } from "../vehicles/service";
import { withdrawAwaitingForCrew } from "./awaiting";
import { purgeCrewFeed } from "./feed/service";
import {
  activeMembersOf,
  bannerFor,
  crewBannerKey,
  crewEvents,
  crewGarage,
  crewOutingViews,
  detailedFor,
  mainVehicleLabels,
  reachableProfileSql,
  vitrineMembers,
} from "./page";

/** Bannière : mêmes formats que les photos de véhicule, 2 048 px au plus, WebP. */
const BANNER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const BANNER_MAX_SIDE = 2048;

export type CrewRow = typeof crews.$inferSelect;
export type CrewMemberRow = typeof crewMembers.$inferSelect;
type After = (cb: () => unknown) => void;

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

const crewKey = (crewId: string) => `crew:${crewId}`;
// Lot R5c1 : `publier` (écran « Publier dans le crew » de l'appli, `/crew/publier`). Lot R5c2 : `/crew/sortie` et
// `/crew/reglages` (écrans de l'appli).
const RESERVED_SLUGS = new Set(["nouveau", "inscription", "search", "by-slug", "publier", "sortie", "reglages"]);
const crewPath = (crew: Pick<CrewRow, "slug">) => `/c/${crew.slug}`;

export function crewCard(crew: CrewRow): CrewCard {
  return {
    id: crew.id,
    slug: crew.slug,
    name: crew.name,
    logoUrl: storage.url(crew.logoKey),
    department: crew.department,
    membersCount: crew.membersCount,
  };
}

const personOf = (p: Pick<Profile, "userId" | "pseudo" | "avatarKey" | "grade">): CrewPerson => ({
  userId: p.userId,
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
  grade: p.grade,
});

const actorOf = (p: Pick<Profile, "userId" | "pseudo" | "avatarKey">) => ({
  userId: p.userId,
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
});

/** Écritures interdites à un compte suspendu (lecture seule, ARCHITECTURE-SUITE § 0.4). */
export function assertWritable(v: Viewer) {
  if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
    throw forbidden("Ton compte est suspendu : lecture seule.");
  }
}

/** Personne joignable : ni supprimée ni suspendue (404 sinon, comme un profil inconnu). */
function reachable(p: Profile | undefined | null): Profile {
  if (!p || p.deletedAt || (p.suspendedUntil && p.suspendedUntil > now())) throw notFound("Profil introuvable");
  return p;
}

async function findCrew(ex: Executor, id: string): Promise<CrewRow> {
  const [row] = await ex.select().from(crews).where(eq(crews.id, id));
  if (!row) throw notFound(crewErrors.notFound);
  return row;
}

/** Ligne du crew verrouillée ; un crew dissous ne bouge plus (404 pour qui n'en est pas membre, 409 sinon). */
export async function lockCrew(tx: Tx, id: string): Promise<CrewRow> {
  const [row] = await tx.select().from(crews).where(eq(crews.id, id)).for("update");
  if (!row) throw notFound(crewErrors.notFound);
  if (row.deletedAt) throw conflict("conflict", crewErrors.archived);
  return row;
}

export async function memberRow(ex: Executor, crewId: string, userId: string): Promise<CrewMemberRow | null> {
  const [row] = await ex
    .select()
    .from(crewMembers)
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)));
  return row ?? null;
}

/**
 * Lot R6c : la démarche vient de la personne (sa demande, ou l'invitation d'un membre qu'elle a acceptée, « à confirmer
 * par le chef »), et non d'une invitation qu'elle n'a pas encore acceptée. Sert au refus silencieux et au délai de 30 jours.
 */
const byPerson = (r: Pick<CrewMemberRow, "invitedBy" | "inviteAcceptedAt">) =>
  r.invitedBy === null || r.inviteAcceptedAt !== null;

async function requireLeader(tx: Tx, crewId: string, v: Viewer): Promise<CrewRow> {
  const crew = await lockCrew(tx, crewId);
  const me = await memberRow(tx, crewId, v.user.id);
  if (me?.role !== "leader" || me.status !== "active") throw forbidden(crewErrors.leaderOnly);
  return crew;
}

/** Verrou consultatif d'une personne : la limite de 5 crews tient face à deux acceptations simultanées. */
async function lockPerson(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crews:user:${userId}`}))`);
}

/** Crews actifs (non dissous) dont la personne est membre active. */
async function activeCrewCount(ex: Executor, userId: string): Promise<number> {
  const [row] = await ex
    .select({ n: count() })
    .from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .where(and(eq(crewMembers.userId, userId), eq(crewMembers.status, "active"), isNull(crews.deletedAt)));
  return row?.n ?? 0;
}

async function recount(tx: Tx, crewId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(crewMembers)
    .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.status, "active"), sql`${profiles.deletedAt} is null`));
  const n = row?.n ?? 0;
  await tx.update(crews).set({ membersCount: n }).where(eq(crews.id, crewId));
  return n;
}

async function conversationOf(ex: Executor, crewId: string) {
  const [row] = await ex
    .select()
    .from(conversations)
    .where(eq(conversations.directKey, crewKey(crewId)));
  return row ?? null;
}

/**
 * Discussion du crew : participants = membres actifs (le chef en `admin`), les autres sont marqués partis. Crée la
 * conversation si elle manque. Rend son identifiant.
 */
async function syncConversation(tx: Tx, crew: CrewRow): Promise<string> {
  let conversation = await conversationOf(tx, crew.id);
  if (!conversation) {
    const [created] = await tx
      .insert(conversations)
      .values({ kind: "crew", directKey: crewKey(crew.id), crewId: crew.id, createdBy: crew.createdBy })
      .onConflictDoNothing({ target: conversations.directKey })
      .returning();
    conversation = created ?? (await conversationOf(tx, crew.id));
  }
  if (!conversation) throw new Error("Discussion du crew introuvable");
  const at = now();
  const active = await activeCrewMembers(tx, crew.id);
  const activeIds = active.map((m) => m.userId);
  for (const m of active) {
    await tx
      .insert(conversationParticipants)
      .values({ conversationId: conversation.id, userId: m.userId, role: m.role === "leader" ? "admin" : "member" })
      .onConflictDoUpdate({
        target: [conversationParticipants.conversationId, conversationParticipants.userId],
        set: { leftAt: null },
      });
  }
  await tx
    .update(conversationParticipants)
    .set({ leftAt: at })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversation.id),
        isNull(conversationParticipants.leftAt),
        activeIds.length ? notInArray(conversationParticipants.userId, activeIds) : undefined,
      ),
    );
  return conversation.id;
}

/**
 * Message d'information dans la discussion (« Léa a rejoint le crew. ») : corps JSON `{code, pseudo}`, sans expéditeur,
 * jamais compté comme non lu. Diffusé après la validation aux membres du moment.
 */
async function systemMessage(
  tx: Tx,
  after: After,
  conversationId: string,
  code: string,
  person: { userId: string; pseudo: string } | null,
) {
  const [locked] = await tx
    .select({ lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .for("update");
  const at = nextMessageAt(locked?.lastMessageAt ?? null);
  // `userId` permet d'effacer le pseudo si le compte est supprimé (anonymisation).
  const body = JSON.stringify({ code, userId: person?.userId ?? null, pseudo: person?.pseudo || null });
  const [row] = await tx
    .insert(messages)
    .values({ conversationId, senderId: null, kind: "system", body, createdAt: at })
    .returning();
  if (!row) throw new Error("Message non enregistré");
  await tx
    .update(conversations)
    .set({
      lastMessageAt: at,
      lastMessagePreview: shorten(messagePreview({ kind: "system", body, deleted: false }), MESSAGE_PREVIEW_MAX),
      messagesCount: sql`${conversations.messagesCount} + 1`,
    })
    .where(eq(conversations.id, conversationId));
  after(async () => {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!conversation) return;
    const readers = await crewRules.readers(db, conversation);
    publishToConversation(conversationId, readers, "message.new", { message: serializeMessage(row, null, null) });
    for (const r of readers) realtime.publish(`user:${r.userId}`, "conversation.updated", { conversationId });
  });
}

/** La notification d'une demande ou d'une invitation n'a plus à rester « non lue » une fois traitée. */
async function closeNotification(
  tx: Tx,
  userId: string,
  type: "crew_request" | "crew_invitation",
  crewId: string,
  actorId?: string,
) {
  await tx
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        sql`${notifications.data} ->> 'crewId' = ${crewId}`,
        actorId ? sql`${notifications.data} -> 'actor' ->> 'userId' = ${actorId}` : undefined,
        isNull(notifications.readAt),
      ),
    );
}

/**
 * Anti-harcèlement (en base, comme les demandes d'ami du lot 17) : au plus une notification de demande ou d'invitation
 * par paire et par 24 h — y compris après une annulation suivie d'une nouvelle demande. Comptée sur l'horloge de la
 * base, comme la date de création des notifications.
 */
async function assertNoRecentNotification(
  tx: Tx,
  to: string,
  type: "crew_request" | "crew_invitation",
  crewId: string,
  actorId: string,
) {
  const [recent] = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, to),
        eq(notifications.type, type),
        sql`${notifications.data} ->> 'crewId' = ${crewId}`,
        sql`${notifications.data} -> 'actor' ->> 'userId' = ${actorId}`,
        sql`${notifications.createdAt} > now() - interval '24 hours'`,
      ),
    )
    .limit(1);
  if (recent) {
    throw new AppError(429, "rate_limited", "Une demande a déjà été envoyée aujourd'hui : réessaie demain.", {
      retryAfter: 86_400,
    });
  }
}

function joinError(code: "already_member" | "already_pending" | "cooldown") {
  const message = {
    already_member: crewLabels.alreadyMember,
    already_pending: crewLabels.alreadyPending,
    cooldown: crewLabels.alreadyPending,
  }[code];
  // Le refus reste silencieux : pendant 30 jours, une nouvelle demande répond comme si la première était en cours.
  return conflict("conflict", message, { reason: code === "cooldown" ? "already_pending" : code });
}

/** Limites S14 au moment d'une arrivée (crew verrouillé, personne verrouillée). */
async function assertCanJoin(tx: Tx, crew: CrewRow, userId: string) {
  await lockPerson(tx, userId);
  if ((await activeCrewCount(tx, userId)) >= CREWS_PER_PERSON) {
    throw conflict("conflict", crewLabels.limitCrews, { reason: "crews_per_person" });
  }
  const [members] = await tx
    .select({ n: count() })
    .from(crewMembers)
    .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.status, "active")));
  if ((members?.n ?? 0) >= MEMBERS_PER_CREW) {
    throw conflict("conflict", crewLabels.limitMembers, { reason: "members_per_crew" });
  }
}

/** Arrivée d'un membre : ligne active, compteur, discussion, message d'information. */
async function join(tx: Tx, after: After, crew: CrewRow, person: Pick<Profile, "userId" | "pseudo">) {
  const at = now();
  await assertCanJoin(tx, crew, person.userId);
  await tx
    .update(crewMembers)
    .set({ status: "active", role: "member", respondedAt: at, joinedAt: at })
    .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, person.userId)));
  await recount(tx, crew.id);
  const conversationId = await syncConversation(tx, crew);
  await systemMessage(tx, after, conversationId, "crew_member_joined", person);
  return conversationId;
}

/** Départ (parti, retiré) : ligne, compteur, discussion, message d'information. */
/** Types de notification d'un crew (`crew_…` : demandes, invitations, fil, sorties, dissolution). */
const CREW_NOTIFICATION_TYPES = (Object.keys(notificationTypes) as NotificationType[]).filter((t) =>
  t.startsWith("crew_"),
);

/**
 * Lot R5c2, tour 2 : au départ et au retrait d'un membre, ses notifications du crew encore différées (heures calmes) ne
 * partiront plus ; à la dissolution, celles de tout le monde. Appelé avant d'écrire les notifications du geste lui-même.
 */
async function dropPendingCrewNotifications(tx: Tx, crewId: string, userId?: string) {
  await tx
    .delete(notifications)
    .where(
      and(
        inArray(notifications.type, CREW_NOTIFICATION_TYPES),
        isNull(notifications.deliveredAt),
        sql`${notifications.data} ->> 'crewId' = ${crewId}`,
        userId ? eq(notifications.userId, userId) : undefined,
      ),
    );
}

async function depart(
  tx: Tx,
  after: After,
  crew: CrewRow,
  person: Pick<Profile, "userId" | "pseudo">,
  status: "left" | "removed",
) {
  await dropPendingCrewNotifications(tx, crew.id, person.userId);
  await tx
    .update(crewMembers)
    .set({ status, respondedAt: now() })
    .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, person.userId)));
  await recount(tx, crew.id);
  // Ses venues encore à confirmer avec ce crew ne valent plus (relecture du lot 19).
  await withdrawAwaitingForCrew(tx, after, crew.id, person.userId);
  const conversationId = await syncConversation(tx, crew);
  await systemMessage(
    tx,
    after,
    conversationId,
    status === "left" ? "crew_member_left" : "crew_member_removed",
    person,
  );
}

function publishInbox(after: After, ...userIds: string[]) {
  after(() => {
    notificationsService.kick();
    for (const id of new Set(userIds)) inboxService.publish(id);
  });
}

/** Demandes reçues par les crews dont je suis le chef, et invitations reçues (comptes supprimés ou suspendus exclus). */
async function pendingCount(userId: string, ex: Executor = db): Promise<number> {
  const at = now();
  const result = await ex.execute(sql`
    select
      (select count(*) from crew_members r
        join crews c on c.id = r.crew_id and c.deleted_at is null
        join crew_members l on l.crew_id = c.id and l.user_id = ${userId} and l.role = 'leader' and l.status = 'active'
        join profiles p on p.user_id = r.user_id and p.deleted_at is null
          and (p.suspended_until is null or p.suspended_until <= ${at})
        where r.status = 'requested')
      +
      (select count(*) from crew_members i
        join crews c on c.id = i.crew_id and c.deleted_at is null
        where i.user_id = ${userId} and i.status = 'invited') as n`);
  return Number((result.rows[0] as { n?: number | string } | undefined)?.n ?? 0);
}

// --- Lot R6c (maquette R6.7) : invitation d'un membre, confirmée par le chef ---------------------------------------

/** La personne est dans le réseau de `me` : abonnement accepté dans un sens ou dans l'autre. */
async function inNetwork(ex: Executor, me: string, other: string): Promise<boolean> {
  const result = await ex.execute(sql`
    select 1 from user_follows f
    where f.status = 'accepted'
      and ((f.follower_id = ${me} and f.followed_id = ${other}) or (f.follower_id = ${other} and f.followed_id = ${me}))
    limit 1`);
  return result.rows.length > 0;
}

/**
 * Un membre actif invite une personne de son réseau (abonnés, abonnements acceptés). Pas de doublon : une demande ou une
 * invitation en cours répond « déjà en cours ». Une personne qui a coupé ses invitations reçoit la même réponse, sans
 * que rien ne soit écrit. Mêmes limites que le chef (20 invitations en attente, une alerte par paire et par 24 h).
 */
async function inviteByMember(tx: Tx, after: After, crewId: string, v: Viewer, target: Profile) {
  const crew = await lockCrew(tx, crewId);
  if (!(await inNetwork(tx, v.user.id, target.userId))) throw forbidden(crewInviteLabels.notInNetwork);
  const row = await memberRow(tx, crew.id, target.userId);
  const outcome = crewJoinOutcome(row && { ...row, wasInvitation: !byPerson(row) }, "invite", now());
  if (outcome.kind === "error") throw joinError(outcome.code);
  // Une demande de la personne attend déjà le chef : le membre n'a rien à y ajouter.
  if (outcome.kind === "accept") throw joinError("already_pending");
  if (await eventInvitesService.isMuted(target.userId, v.user.id, tx)) {
    return { pseudo: target.pseudo, status: "invited" as const };
  }
  const [pending] = await tx
    .select({ n: count() })
    .from(crewMembers)
    .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.status, "invited")));
  if ((pending?.n ?? 0) >= PENDING_INVITATIONS_PER_CREW) throw conflict("conflict", crewErrors.tooManyInvitations);
  await assertNoRecentNotification(tx, target.userId, "crew_invitation", crew.id, v.user.id);
  const values = {
    status: "invited" as const,
    role: "member" as const,
    message: null,
    invitedBy: v.user.id,
    inviteAcceptedAt: null,
    respondedAt: null,
    joinedAt: null,
  };
  await tx
    .insert(crewMembers)
    .values({ crewId: crew.id, userId: target.userId, ...values })
    .onConflictDoUpdate({ target: [crewMembers.crewId, crewMembers.userId], set: values });
  const leader = await profilesRepo.byUserId(crew.createdBy, tx);
  await notificationsService.notify(tx, target.userId, "crew_invitation", {
    title: "Invitation à un crew",
    body: crewInviteLabels.memberInviteBody(
      v.profile.pseudo,
      crew.name,
      leader?.pseudo ?? crewInviteLabels.leaderFallback,
    ),
    data: { crewId: crew.id, actor: actorOf(v.profile), link: "/app/boite/demandes", leaderConfirms: true },
    link: { label: "Voir l'invitation", path: "/app/boite/demandes" },
  });
  publishInbox(after, target.userId);
  return { pseudo: target.pseudo, status: "invited" as const };
}

/**
 * L'invitation d'un membre acceptée : la ligne passe « à confirmer par le chef » (`requested`, `invite_accepted_at`,
 * `invited_by` gardé), le chef est prévenu (« Marc_66 a accepté l'invitation de Julie_66 : confirme son arrivée »).
 */
async function acceptMemberInvitation(tx: Tx, after: After, crew: CrewRow, v: Viewer, inviterId: string) {
  await tx
    .update(crewMembers)
    .set({ status: "requested", inviteAcceptedAt: now(), message: null, respondedAt: null })
    .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, v.user.id)));
  await closeNotification(tx, v.user.id, "crew_invitation", crew.id);
  const inviter = await profilesRepo.byUserId(inviterId, tx);
  const inviterName = inviter && !inviter.deletedAt ? inviter.pseudo : crewInviteLabels.memberFallback;
  await notificationsService.notify(tx, crew.createdBy, "crew_request", {
    title: crewInviteLabels.confirmTitle,
    body: crewInviteLabels.confirmBody(v.profile.pseudo, inviterName, crew.name),
    data: { crewId: crew.id, actor: actorOf(v.profile), link: "/app/boite/demandes" },
    link: { label: "Voir la demande", path: "/app/boite/demandes" },
  });
  publishInbox(after, v.user.id, crew.createdBy);
}

/** Pseudos de ceux qui ont invité (comptes supprimés exclus). */
async function inviterPseudos(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: profiles.userId, pseudo: profiles.pseudo })
    .from(profiles)
    .where(and(inArray(profiles.userId, unique), isNull(profiles.deletedAt)));
  return new Map(rows.map((r) => [r.id, r.pseudo]));
}

export const crewsService = {
  syncConversation,
  systemMessage,
  recount,
  pendingCount,
  findCrew,

  /** `POST /crews` : la personne devient chef ; la discussion du crew est créée. */
  async create(v: Viewer, input: CrewCreate): Promise<CrewView> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    // Adresses réservées par les écrans de l'appli (`/crew/nouveau`, `/crew/inscription`).
    const slug = await uniqueSlug(
      input.name,
      async (s) =>
        RESERVED_SLUGS.has(s) ||
        Boolean(await db.query.crews.findFirst({ where: eq(crews.slug, s), columns: { id: true } })),
    );
    const id = await withTx(async (tx, after) => {
      await lockPerson(tx, v.user.id);
      const [recent] = await tx
        .select({ n: count() })
        .from(crews)
        .where(
          and(eq(crews.createdBy, v.user.id), sql`${crews.createdAt} > ${new Date(now().getTime() - 86_400_000)}`),
        );
      if ((recent?.n ?? 0) >= CREW_CREATIONS_PER_DAY) {
        throw new AppError(429, "rate_limited", "Trop de crews créés aujourd'hui : réessaie demain.");
      }
      if ((await activeCrewCount(tx, v.user.id)) >= CREWS_PER_PERSON) {
        throw conflict("conflict", crewLabels.limitCrews, { reason: "crews_per_person" });
      }
      const at = now();
      const [crew] = await tx
        .insert(crews)
        .values({
          slug,
          name: input.name,
          description: input.description,
          department: input.department,
          createdBy: v.user.id,
          membersCount: 1,
          // Horloge des services (la limite de créations par jour se compte avec elle).
          createdAt: at,
        })
        .returning();
      if (!crew) throw new Error("Crew non enregistré");
      await tx.insert(crewMembers).values({
        crewId: crew.id,
        userId: v.user.id,
        role: "leader",
        status: "active",
        respondedAt: at,
        joinedAt: at,
      });
      const conversationId = await syncConversation(tx, crew);
      await systemMessage(tx, after, conversationId, "crew_created", v.profile);
      return crew.id;
    }).catch((error) => {
      if (isUniqueViolation(error)) throw conflict("conflict", crewLabels.nameTaken, { reason: "name_taken" });
      throw error;
    });
    return this.viewById(v, id);
  },

  /** `PATCH /crews/:id` (chef). */
  async update(v: Viewer, id: string, input: CrewUpdate): Promise<CrewView> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    await withTx(async (tx) => {
      await requireLeader(tx, id, v);
      await tx
        .update(crews)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.department !== undefined ? { department: input.department } : {}),
          // Lot R5c2 : Instagram (pseudo seul) et « Les membres peuvent proposer une sortie ».
          ...(input.instagram !== undefined ? { instagram: input.instagram } : {}),
          ...(input.membersCanProposeOutings !== undefined
            ? { membersCanProposeOutings: input.membersCanProposeOutings }
            : {}),
        })
        .where(eq(crews.id, id));
    }).catch((error) => {
      if (isUniqueViolation(error)) throw conflict("conflict", crewLabels.nameTaken, { reason: "name_taken" });
      throw error;
    });
    return this.viewById(v, id);
  },

  /**
   * `POST /crews/:id/logo {key}` (chef) : clé de `POST /me/uploads purpose=crew_logo`, rattachée une seule fois par son
   * auteur ; l'ancien logo est effacé après la validation. `key = null` retire le logo.
   */
  async setLogo(v: Viewer, id: string, key: string | null): Promise<CrewView> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    const old = await withTx(async (tx) => {
      const crew = await requireLeader(tx, id, v);
      if (key) {
        const upload = await uploadsService.consume(tx, v.user.id, key, "crew_logo");
        if (!upload) throw validation("Image inconnue ou déjà utilisée");
      }
      await tx.update(crews).set({ logoKey: key }).where(eq(crews.id, id));
      return crew.logoKey;
    });
    if (old && old !== key) await storage.remove(old).catch(() => undefined);
    return this.viewById(v, id);
  },

  /**
   * `POST /crews/:id/banner` (chef, lot R5c2) : la bannière se voit hors du crew, donc elle passe par la chaîne des
   * photos de véhicule : recompressée (2 048 px, WebP, métadonnées retirées), plaque floutée avant le stockage
   * (`plateRects`, l'original n'est jamais écrit) ou « aucune plaque visible » confirmé (`noPlate`). Sans l'un ni
   * l'autre, elle est gardée mais seuls les membres la voient. `file = null` la retire.
   */
  async setBanner(
    v: Viewer,
    id: string,
    file: File | null,
    plateRects: PlateRect[] | undefined,
    noPlate: boolean,
  ): Promise<CrewView> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    // Contrôle rapide avant le traitement de l'image (refait sous verrou à l'écriture).
    const crew = await findCrew(db, id);
    const me = await memberRow(db, crew.id, v.user.id);
    if (me?.role !== "leader" || me.status !== "active") throw forbidden(crewErrors.leaderOnly);
    let key: string | null = null;
    if (file) {
      if (file.size > MAX_PHOTO_BYTES)
        throw new AppError(413, "payload_too_large", "Photo trop lourde (15 Mo au plus)");
      if (!BANNER_TYPES.includes(file.type)) {
        throw new AppError(415, "unsupported_media_type", "Formats acceptés : JPEG, PNG, WebP, HEIC");
      }
      let output: { data: Buffer; info: { width: number; height: number; size: number } };
      try {
        output = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: MAX_INPUT_PIXELS })
          .rotate()
          .resize(BANNER_MAX_SIDE, BANNER_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw new AppError(415, "unsupported_media_type", "Image illisible (HEIC : convertir en JPEG côté appli)");
      }
      if (plateRects?.length) output = await blurPlateRegions(output.data, plateRects);
      key = crewBannerKey(id, `${randomBytes(8).toString("hex")}.webp`);
      await storage.put(key, output.data);
    }
    let old: string | null;
    try {
      old = await withTx(async (tx) => {
        const locked = await requireLeader(tx, id, v);
        await tx
          .update(crews)
          .set({ bannerKey: key, bannerPlateCleared: Boolean(key && (plateRects?.length || noPlate)) })
          .where(eq(crews.id, id));
        return locked.bannerKey;
      });
    } catch (error) {
      if (key) await removeOrRetry(key);
      throw error;
    }
    // Tour 2 : l'ancienne bannière est retirée pour de bon (reprise par la tâche `storage.remove` si le stockage échoue).
    if (old && old !== key) await removeOrRetry(old);
    return this.viewById(v, id);
  },

  /**
   * `GET /crews/:id/banner/:nom` (tour 2) : la bannière, lue à chaque fois : un membre actif, ou n'importe quel compte
   * connecté si sa plaque est décidée (vitrine). Un ancien membre perd l'accès à une bannière sans décision.
   */
  async bannerFile(v: Viewer, id: string, name: string): Promise<{ data: Buffer; cleared: boolean }> {
    if (!/^[0-9a-f]{16}\.webp$/.test(name)) throw notFound("Bannière introuvable");
    const [crew] = await db.select().from(crews).where(eq(crews.id, id));
    if (!crew || crew.deletedAt || crew.bannerKey !== crewBannerKey(crew.id, name)) {
      throw notFound("Bannière introuvable");
    }
    const me = await memberRow(db, crew.id, v.user.id);
    if (!(me?.status === "active" || crew.bannerPlateCleared)) throw notFound("Bannière introuvable");
    const data = await storage.get(crew.bannerKey);
    if (!data) throw notFound("Bannière introuvable");
    return { data, cleared: crew.bannerPlateCleared };
  },

  /**
   * `DELETE /crews/:id` (chef) : le crew est dissous (`deleted_at`), son logo effacé, les demandes et invitations en
   * attente retirées ; la discussion devient lisible seulement. Les membres sont prévenus.
   */
  async archive(v: Viewer, id: string) {
    assertWritable(v);
    const keys = await withTx(async (tx, after) => {
      const crew = await requireLeader(tx, id, v);
      return this.archiveInTx(tx, after, crew, "leader");
    });
    for (const k of keys) await removeOrRetry(k);
  },

  /**
   * Dissolution dans une transaction ouverte (chef qui dissout, chef qui supprime son compte, ou retrait par la
   * modération, lot 32). Rend les fichiers.
   */
  async archiveInTx(
    tx: Tx,
    after: After,
    crew: CrewRow,
    reason: "leader" | "account_deleted" | "moderation",
  ): Promise<string[]> {
    const at = now();
    await dropPendingCrewNotifications(tx, crew.id);
    // Lot R5c2 : la bannière part avec le logo.
    await tx.update(crews).set({ deletedAt: at, logoKey: null, bannerKey: null }).where(eq(crews.id, crew.id));
    // Venues à confirmer avec ce crew : retirées (sans malus) ; les venues déjà confirmées vivent seules.
    await withdrawAwaitingForCrew(tx, after, crew.id);
    const pending = await tx
      .delete(crewMembers)
      .where(and(eq(crewMembers.crewId, crew.id), inArray(crewMembers.status, ["requested", "invited"])))
      .returning({ userId: crewMembers.userId });
    await tx
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          inArray(notifications.type, ["crew_request", "crew_invitation"]),
          sql`${notifications.data} ->> 'crewId' = ${crew.id}`,
          isNull(notifications.readAt),
        ),
      );
    const conversation = await conversationOf(tx, crew.id);
    if (conversation) {
      await systemMessage(tx, after, conversation.id, "crew_archived", null);
      await tx.update(conversations).set({ closedAt: at }).where(eq(conversations.id, conversation.id));
    }
    // Lot R5c1, tour 2 : dissous par son chef, le fil part (publications et photos) ; retiré par la modération, il
    // reste pour elle (le fil répond 404 à tous dans les deux cas).
    const feedKeys = reason === "moderation" ? [] : await purgeCrewFeed(tx, crew.id);
    const members = (await activeCrewMembers(tx, crew.id)).filter((m) => m.role !== "leader");
    for (const m of members) {
      await notificationsService.notify(tx, m.userId, "crew_archived", {
        title: crewLabels.archived,
        body:
          reason === "account_deleted"
            ? `Le chef de « ${crew.name} » a supprimé son compte : le crew est dissous. La discussion reste lisible.`
            : reason === "moderation"
              ? `« ${crew.name} » a été retiré par l'équipe Orasso. La discussion reste lisible.`
              : `« ${crew.name} » a été dissous par son chef. La discussion reste lisible.`,
        data: { crewId: crew.id, link: crewPath(crew) },
      });
    }
    publishInbox(after, ...pending.map((p) => p.userId), ...members.map((m) => m.userId));
    return [...[crew.logoKey, crew.bannerKey].filter((k): k is string => Boolean(k)), ...feedKeys];
  },

  async viewById(v: Viewer, id: string): Promise<CrewView> {
    return this.toView(v, await findCrew(db, id));
  },

  async viewBySlug(v: Viewer, slug: string): Promise<CrewView> {
    const [crew] = await db.select().from(crews).where(eq(crews.slug, slug));
    if (!crew) throw notFound(crewErrors.notFound);
    return this.toView(v, crew);
  },

  /**
   * Fiche d'un crew. Lot R5c2 (décision de Damien du 26/10) : pour un non-membre, la vitrine seule (image du crew,
   * description, Instagram, membres : pseudo, avatar, grade, rôle) ; pour un membre actif, l'espace du crew en plus
   * (sorties, garage, « Où va le crew », non-lus de la discussion) ; pour le chef, ses compteurs. Liste blanche de champs.
   */
  async toView(v: Viewer, crew: CrewRow): Promise<CrewView> {
    const at = now();
    const me = await memberRow(db, crew.id, v.user.id);
    const state = crewViewerState(
      me ? { status: me.status, respondedAt: me.respondedAt, role: me.role, requestedByMe: byPerson(me) } : null,
      at,
    );
    const isMember = state === "member" || state === "leader";
    const isLeader = state === "leader";
    // Un crew dissous n'existe plus pour qui n'en était pas membre.
    if (crew.deletedAt && !isMember) throw notFound(crewErrors.notFound);
    // Tour 2 : la vitrine d'un non-membre est limitée en débit (pas d'annuaire reconstruit par les vitrines).
    if (!isMember) rateLimit("crewVitrine", v.user.id);
    const leader = await profilesRepo.byUserId(crew.createdBy);
    const leaderShown =
      leader && !leader.deletedAt && !leader.bannedAt && !(leader.suspendedUntil && leader.suspendedUntil > at);
    let pendingRequests: number | null = null;
    let pendingInvitations: number | null = null;
    if (isLeader) {
      const rows = await db
        .select({ status: crewMembers.status, n: count() })
        .from(crewMembers)
        .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
        .where(
          and(
            eq(crewMembers.crewId, crew.id),
            inArray(crewMembers.status, ["requested", "invited"]),
            reachableProfileSql(at),
          ),
        )
        .groupBy(crewMembers.status);
      pendingRequests = rows.find((r) => r.status === "requested")?.n ?? 0;
      pendingInvitations = rows.find((r) => r.status === "invited")?.n ?? 0;
    }
    const members = await activeMembersOf(crew.id, at);
    const conversation = isMember ? await conversationOf(db, crew.id) : null;
    // Tour 2 : comptes privés, ce que la personne qui regarde voit de leurs véhicules et de leurs sorties.
    const detailed = isMember
      ? await detailedFor(
          v,
          members.map((m) => m.profile),
        )
      : new Set<string>();
    const space =
      isMember && !crew.deletedAt
        ? {
            unreadCount: conversation
              ? await unreadCountOf(db, conversation.id, { userId: v.user.id, side: "member" })
              : 0,
            membersCanProposeOutings: crew.membersCanProposeOutings,
            canProposeOuting: canProposeCrewOuting({ isLeader, membersCanPropose: crew.membersCanProposeOutings }),
            outings: await crewOutingViews(crew.id, members, { userId: v.user.id, isLeader }, at),
            garage: await crewGarage(members, detailed),
            events: await crewEvents(crew, members, at, detailed),
          }
        : null;
    return {
      ...crewCard(crew),
      // Les comptes suspendus ou bannis ne comptent pas (le compteur en cache ne retire que les comptes supprimés).
      membersCount: members.length,
      description: crew.description,
      leader: leaderShown ? { pseudo: leader.pseudo, avatarUrl: storage.url(leader.avatarKey) } : null,
      createdAt: crew.createdAt.toISOString(),
      archived: Boolean(crew.deletedAt),
      viewerState: state,
      bannerUrl: bannerFor(crew, isMember),
      instagram: crew.instagram,
      members: await vitrineMembers(members, v.user.id),
      conversationId: conversation?.id ?? null,
      space,
      pendingRequests,
      pendingInvitations,
      bannerHiddenOutside: isLeader ? Boolean(crew.bannerKey && !crew.bannerPlateCleared) : null,
    };
  },

  /** `GET /crews/search?q=&department=` : par nom et département, crews non dissous. */
  async search(v: Viewer, q: CrewSearchQuery): Promise<Page<CrewCard>> {
    rateLimit("crewSearch", v.user.id);
    const decoded = q.cursor ? Number(Buffer.from(q.cursor, "base64url").toString()) : 0;
    const offset = Number.isSafeInteger(decoded) && decoded >= 0 ? decoded : 0;
    const rows = await db
      .select()
      .from(crews)
      .where(
        and(
          isNull(crews.deletedAt),
          q.q ? ilike(crews.name, `%${escapeLike(q.q)}%`) : undefined,
          q.department ? eq(crews.department, q.department) : undefined,
          q.departments?.length ? inArray(crews.department, q.departments) : undefined,
        ),
      )
      .orderBy(desc(crews.membersCount), asc(crews.name), asc(crews.id))
      .limit(q.limit + 1)
      .offset(offset);
    const shown = rows.slice(0, q.limit);
    // Lot R3b : « Demande envoyée » vient de l'API (il survit à un rechargement de la liste).
    const mine = shown.length
      ? await db
          .select()
          .from(crewMembers)
          .where(
            and(
              eq(crewMembers.userId, v.user.id),
              inArray(
                crewMembers.crewId,
                shown.map((r) => r.id),
              ),
            ),
          )
      : [];
    const at = now();
    const requested = new Set(
      mine
        .filter(
          (m) =>
            crewViewerState(
              { status: m.status, respondedAt: m.respondedAt, role: m.role, requestedByMe: byPerson(m) },
              at,
            ) === "requested",
        )
        .map((m) => m.crewId),
    );
    return {
      items: shown.map((r) => ({ ...crewCard(r), requested: requested.has(r.id) })),
      nextCursor: rows.length > q.limit ? Buffer.from(String(offset + q.limit)).toString("base64url") : null,
    };
  },

  /** `GET /me/crews` : mes crews actifs, le rôle en plus. */
  async mine(userId: string): Promise<MyCrew[]> {
    const rows = await db
      .select({ crew: crews, role: crewMembers.role })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(and(eq(crewMembers.userId, userId), eq(crewMembers.status, "active"), isNull(crews.deletedAt)))
      .orderBy(asc(crewMembers.joinedAt));
    return rows.map((r) => ({ ...crewCard(r.crew), role: r.role }));
  },

  /** Crews d'un profil affiché à un autre (audience complète) : les mêmes que `mine`, sans le rôle. */
  async ofUser(userId: string): Promise<CrewCard[]> {
    return (await this.mine(userId)).map(({ role: _role, ...card }) => card);
  },

  /**
   * `GET /crews/:id/members` : membres actifs, réservés aux membres (S16), avec leur véhicule principal (lot R5c2).
   * Comptes supprimés, bannis ou suspendus exclus.
   */
  async members(v: Viewer, id: string): Promise<CrewMemberView[]> {
    const crew = await findCrew(db, id);
    const me = await memberRow(db, crew.id, v.user.id);
    if (me?.status !== "active") throw forbidden(crewErrors.membersOnly);
    const members = await activeMembersOf(crew.id, now());
    const vehicles = await mainVehicleLabels(
      members,
      await detailedFor(
        v,
        members.map((m) => m.profile),
      ),
    );
    return members.map((m) => ({
      ...personOf(m.profile),
      role: m.role,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      vehicleLabel: vehicles.get(m.profile.userId) ?? null,
    }));
  },

  /** `GET /crews/:id/requests` (chef) : demandes reçues et invitations envoyées en attente. */
  async pending(v: Viewer, id: string): Promise<CrewPendingList> {
    const crew = await findCrew(db, id);
    const me = await memberRow(db, crew.id, v.user.id);
    if (me?.role !== "leader" || me.status !== "active" || crew.deletedAt) throw forbidden(crewErrors.leaderOnly);
    const rows = await db
      .select({
        p: profiles,
        status: crewMembers.status,
        message: crewMembers.message,
        at: crewMembers.updatedAt,
        invitedBy: crewMembers.invitedBy,
      })
      .from(crewMembers)
      .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
      .where(
        and(
          eq(crewMembers.crewId, crew.id),
          inArray(crewMembers.status, ["requested", "invited"]),
          // Lot R5c2 : comme la Boîte, sans les comptes suspendus ou bannis.
          reachableProfileSql(now()),
        ),
      )
      .orderBy(asc(crewMembers.updatedAt));
    // Lot R5c2 (R5.8) : le chef voit le véhicule principal de qui demande (la feuille de demande le dit).
    const requesters = rows.filter((r) => r.status === "requested");
    const labels = await mainVehicleLabels(
      requesters.map((r) => ({ profile: r.p, role: "member", joinedAt: null })),
      await detailedFor(
        v,
        requesters.map((r) => r.p),
      ),
    );
    // Lot R6c : « Invitée par Julie_66 » (invitation d'un membre, acceptée ou envoyée) ; jamais le chef lui-même.
    const inviters = await inviterPseudos(rows.map((r) => (r.invitedBy === v.user.id ? null : r.invitedBy)));
    const view = (r: (typeof rows)[number]) => ({
      person: personOf(r.p),
      message: r.message,
      createdAt: r.at.toISOString(),
      vehicleLabel: null as string | null,
      invitedBy: r.invitedBy ? (inviters.get(r.invitedBy) ?? null) : null,
    });
    return {
      requests: requesters.map((r) => ({ ...view(r), vehicleLabel: labels.get(r.p.userId) ?? null })),
      invitations: rows.filter((r) => r.status === "invited").map((r) => ({ ...view(r), message: null })),
    };
  },

  /**
   * `POST /crews/:id/requests {message}` : demande pour rejoindre. Invitation déjà reçue → acceptée. Une seule demande
   * ouverte par paire ; refus silencieux (30 jours) ; 10 demandes par jour ; une notification par paire et par 24 h.
   */
  async request(v: Viewer, id: string, message: string | null): Promise<CrewView> {
    assertWritable(v);
    await withTx(async (tx, after) => {
      const crew = await lockCrew(tx, id);
      const row = await memberRow(tx, crew.id, v.user.id);
      const outcome = crewJoinOutcome(row && { ...row, wasInvitation: !byPerson(row) }, "request", now());
      if (outcome.kind === "error") throw joinError(outcome.code);
      if (outcome.kind === "accept") {
        await this.acceptInvitationInTx(tx, after, crew, v);
        return;
      }
      const [today] = await tx
        .select({ n: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.type, "crew_request"),
            sql`${notifications.data} -> 'actor' ->> 'userId' = ${v.user.id}`,
            sql`${notifications.createdAt} > now() - interval '24 hours'`,
          ),
        );
      if ((today?.n ?? 0) >= CREW_REQUESTS_PER_DAY) {
        throw new AppError(429, "rate_limited", "Trop de demandes aujourd'hui : réessaie demain.");
      }
      await assertNoRecentNotification(tx, crew.createdBy, "crew_request", crew.id, v.user.id);
      const values = {
        status: "requested" as const,
        role: "member" as const,
        message,
        invitedBy: null,
        inviteAcceptedAt: null,
        respondedAt: null,
        joinedAt: null,
      };
      await tx
        .insert(crewMembers)
        .values({ crewId: crew.id, userId: v.user.id, ...values })
        .onConflictDoUpdate({ target: [crewMembers.crewId, crewMembers.userId], set: values });
      await notificationsService.notify(tx, crew.createdBy, "crew_request", {
        title: "Demande pour rejoindre ton crew",
        body: `${v.profile.pseudo} veut rejoindre « ${crew.name} ».${message ? `\n${message}` : ""}`,
        data: { crewId: crew.id, actor: actorOf(v.profile), link: "/app/boite/demandes" },
        link: { label: "Voir la demande", path: "/app/boite/demandes" },
      });
      publishInbox(after, crew.createdBy);
    });
    return this.viewById(v, id);
  },

  /** `POST /crews/:id/requests/:userId/accept` (chef). */
  async acceptRequest(v: Viewer, id: string, userId: string) {
    assertWritable(v);
    await withTx(async (tx, after) => {
      const crew = await requireLeader(tx, id, v);
      const row = await memberRow(tx, crew.id, userId);
      if (row?.status !== "requested") throw notFound("Demande introuvable");
      const person = reachable(await profilesRepo.byUserId(userId));
      await join(tx, after, crew, person);
      await closeNotification(tx, v.user.id, "crew_request", crew.id, userId);
      await notificationsService.notify(tx, userId, "crew_request_accepted", {
        title: "Bienvenue dans le crew",
        body: `Ta demande pour rejoindre « ${crew.name} » est acceptée.`,
        data: { crewId: crew.id, actor: actorOf(v.profile), link: crewPath(crew) },
        link: { label: "Voir le crew", path: crewPath(crew) },
      });
      publishInbox(after, v.user.id, userId);
    });
  },

  /** `POST /crews/:id/requests/:userId/decline` (chef) : refus silencieux. */
  async declineRequest(v: Viewer, id: string, userId: string) {
    assertWritable(v);
    await withTx(async (tx, after) => {
      const crew = await requireLeader(tx, id, v);
      const [row] = await tx
        .update(crewMembers)
        .set({ status: "declined", respondedAt: now() })
        .where(
          and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, userId), eq(crewMembers.status, "requested")),
        )
        .returning();
      if (!row) throw notFound("Demande introuvable");
      await closeNotification(tx, v.user.id, "crew_request", crew.id, userId);
      publishInbox(after, v.user.id);
    });
  },

  /**
   * `POST /crews/:id/invitations {pseudo}` (chef) : 20 invitations en attente au plus ; demande déjà reçue de cette
   * personne → acceptée ; une notification par paire et par 24 h. Lot R6c (R6.7) : un membre actif invite aussi, une
   * personne de son réseau (`inviteByMember`) ; le chef confirme ensuite son arrivée.
   */
  async invite(v: Viewer, id: string, pseudo: string) {
    assertWritable(v);
    rateLimit("crewInvite", v.user.id);
    const target = reachable(await profilesRepo.byPseudo(pseudo));
    if (target.userId === v.user.id) throw validation("C'est ton propre compte.");
    return withTx(async (tx, after) => {
      // Lot R6c : un membre actif (pas le chef) passe par `inviteByMember`.
      const mine = await memberRow(tx, id, v.user.id);
      if (mine?.status === "active" && mine.role !== "leader") return inviteByMember(tx, after, id, v, target);
      const crew = await requireLeader(tx, id, v);
      const row = await memberRow(tx, crew.id, target.userId);
      const outcome = crewJoinOutcome(row && { ...row, wasInvitation: !byPerson(row) }, "invite", now());
      if (outcome.kind === "error") throw joinError(outcome.code);
      if (outcome.kind === "accept") {
        await join(tx, after, crew, target);
        await closeNotification(tx, v.user.id, "crew_request", crew.id, target.userId);
        await notificationsService.notify(tx, target.userId, "crew_request_accepted", {
          title: "Bienvenue dans le crew",
          body: `Ta demande pour rejoindre « ${crew.name} » est acceptée.`,
          data: { crewId: crew.id, actor: actorOf(v.profile), link: crewPath(crew) },
          link: { label: "Voir le crew", path: crewPath(crew) },
        });
        publishInbox(after, v.user.id, target.userId);
        return { pseudo: target.pseudo, status: "active" as const };
      }
      const [pending] = await tx
        .select({ n: count() })
        .from(crewMembers)
        .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.status, "invited")));
      if ((pending?.n ?? 0) >= PENDING_INVITATIONS_PER_CREW) throw conflict("conflict", crewErrors.tooManyInvitations);
      await assertNoRecentNotification(tx, target.userId, "crew_invitation", crew.id, v.user.id);
      const values = {
        status: "invited" as const,
        role: "member" as const,
        message: null,
        invitedBy: v.user.id,
        inviteAcceptedAt: null,
        respondedAt: null,
        joinedAt: null,
      };
      await tx
        .insert(crewMembers)
        .values({ crewId: crew.id, userId: target.userId, ...values })
        .onConflictDoUpdate({ target: [crewMembers.crewId, crewMembers.userId], set: values });
      await notificationsService.notify(tx, target.userId, "crew_invitation", {
        title: "Invitation à un crew",
        body: `${v.profile.pseudo} t'invite à rejoindre « ${crew.name} ».`,
        data: { crewId: crew.id, actor: actorOf(v.profile), link: "/app/boite/demandes" },
        link: { label: "Voir l'invitation", path: "/app/boite/demandes" },
      });
      publishInbox(after, target.userId);
      return { pseudo: target.pseudo, status: "invited" as const };
    });
  },

  /** `POST /me/crew-invitations/:crewId/accept`. */
  async acceptInvitation(v: Viewer, crewId: string): Promise<CrewView> {
    assertWritable(v);
    await withTx(async (tx, after) => {
      const crew = await lockCrew(tx, crewId);
      const row = await memberRow(tx, crew.id, v.user.id);
      if (row?.status !== "invited") throw notFound("Invitation introuvable");
      await this.acceptInvitationInTx(tx, after, crew, v);
    });
    return this.viewById(v, crewId);
  },

  async acceptInvitationInTx(tx: Tx, after: After, crew: CrewRow, v: Viewer) {
    // Lot R6c (R6.7) : l'invitation d'un membre acceptée attend la confirmation du chef.
    const row = await memberRow(tx, crew.id, v.user.id);
    if (row?.invitedBy && row.invitedBy !== crew.createdBy) {
      await acceptMemberInvitation(tx, after, crew, v, row.invitedBy);
      return;
    }
    await join(tx, after, crew, v.profile);
    await closeNotification(tx, v.user.id, "crew_invitation", crew.id);
    await notificationsService.notify(tx, crew.createdBy, "crew_member_joined", {
      title: "Nouveau membre",
      body: `${v.profile.pseudo} a rejoint « ${crew.name} ».`,
      data: { crewId: crew.id, actor: actorOf(v.profile), link: crewPath(crew) },
      link: { label: "Voir le crew", path: crewPath(crew) },
    });
    publishInbox(after, v.user.id, crew.createdBy);
  },

  /** `POST /me/crew-invitations/:crewId/decline` : refus silencieux pour le chef. */
  async declineInvitation(v: Viewer, crewId: string) {
    await withTx(async (tx, after) => {
      const [row] = await tx
        .update(crewMembers)
        .set({ status: "declined", respondedAt: now() })
        .where(
          and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, v.user.id), eq(crewMembers.status, "invited")),
        )
        .returning();
      if (!row) throw notFound("Invitation introuvable");
      await closeNotification(tx, v.user.id, "crew_invitation", crewId);
      publishInbox(after, v.user.id);
    });
  },

  /**
   * `DELETE /crews/:id/members/:userId`. Soi-même : quitter (membre actif ; le chef ne quitte pas, S15), annuler sa
   * demande. Le chef : retirer un membre, annuler une invitation, refuser une demande.
   */
  async removeMember(v: Viewer, id: string, userId: string) {
    assertWritable(v);
    await withTx(async (tx, after) => {
      const crew = await lockCrew(tx, id);
      const row = await memberRow(tx, crew.id, userId);
      if (!row) throw notFound("Membre introuvable");
      const self = userId === v.user.id;
      if (self) {
        if (row.status === "active" && row.role === "leader") {
          throw conflict("conflict", crewLabels.leaderCannotLeave, { reason: "leader_cannot_leave" });
        }
        if (row.status === "active") {
          await depart(tx, after, crew, v.profile, "left");
        } else if (row.status === "requested") {
          await tx.delete(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, userId)));
          await closeNotification(tx, crew.createdBy, "crew_request", crew.id, userId);
          publishInbox(after, crew.createdBy);
        } else {
          throw notFound("Membre introuvable");
        }
        return;
      }
      const me = await memberRow(tx, crew.id, v.user.id);
      if (me?.role !== "leader" || me.status !== "active") throw forbidden(crewErrors.leaderOnly);
      if (row.status === "active") {
        const person = await profilesRepo.byUserId(userId);
        await depart(tx, after, crew, { userId, pseudo: person?.deletedAt ? "" : (person?.pseudo ?? "") }, "removed");
      } else if (row.status === "invited") {
        await tx.delete(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, userId)));
        await closeNotification(tx, userId, "crew_invitation", crew.id);
        publishInbox(after, userId);
      } else if (row.status === "requested") {
        await tx
          .update(crewMembers)
          .set({ status: "declined", respondedAt: now() })
          .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, userId)));
        await closeNotification(tx, v.user.id, "crew_request", crew.id, userId);
        publishInbox(after, v.user.id);
      } else {
        throw notFound("Membre introuvable");
      }
    });
  },

  /** Boîte > Demandes : demandes reçues (chef) et invitations reçues. */
  async inboxRequests(v: Viewer): Promise<CrewInboxRequest[]> {
    const at = now();
    const led = db
      .select({ id: crewMembers.crewId })
      .from(crewMembers)
      .where(and(eq(crewMembers.userId, v.user.id), eq(crewMembers.role, "leader"), eq(crewMembers.status, "active")));
    const rows = await db
      .select({ crew: crews, m: crewMembers, p: profiles })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
      .where(
        and(
          isNull(crews.deletedAt),
          or(
            and(eq(crewMembers.status, "requested"), inArray(crewMembers.crewId, led)),
            and(eq(crewMembers.status, "invited"), eq(crewMembers.userId, v.user.id)),
          ),
          sql`${profiles.deletedAt} is null`,
          sql`(${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at} or ${crewMembers.userId} = ${v.user.id})`,
        ),
      )
      .orderBy(desc(crewMembers.updatedAt));
    const inviters = new Map<string, Profile>();
    for (const r of rows) {
      if (r.m.status === "invited") {
        const leaderId = r.m.invitedBy ?? r.crew.createdBy;
        if (!inviters.has(leaderId)) {
          const p = await profilesRepo.byUserId(leaderId);
          if (p) inviters.set(leaderId, p);
        }
      }
    }
    // Lot R6c : « Invitée par Julie_66 » sur une demande née de l'invitation d'un membre.
    const requestInviters = await inviterPseudos(rows.map((r) => (r.m.status === "requested" ? r.m.invitedBy : null)));
    return rows.flatMap((r): CrewInboxRequest[] => {
      if (r.m.status === "requested") {
        return [
          {
            kind: "request",
            crew: crewCard(r.crew),
            person: personOf(r.p),
            message: r.m.message,
            createdAt: r.m.updatedAt.toISOString(),
            invitedBy: r.m.invitedBy ? (requestInviters.get(r.m.invitedBy) ?? null) : null,
          },
        ];
      }
      const leader = inviters.get(r.m.invitedBy ?? r.crew.createdBy);
      if (!leader || leader.deletedAt) return [];
      return [
        {
          kind: "invitation",
          crew: crewCard(r.crew),
          person: personOf(leader),
          message: null,
          createdAt: r.m.updatedAt.toISOString(),
          // Lot R6c : invitation d'un membre, le chef confirmera l'arrivée.
          leaderConfirms: r.m.invitedBy !== null && r.m.invitedBy !== r.crew.createdBy,
        },
      ];
    });
  },
};
