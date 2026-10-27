// Lot R6c (maquettes R6.3 à R6.6, validées par Damien le 27/10) : « Qui y va », inviter du monde à un événement, ce que
// reçoit la personne invitée, et couper les invitations d'une personne. Règles et libellés : `rules/eventInvites.ts`.
//
// Vie privée :
// - « Qui y va » : seulement les personnes que je suis (abonnement accepté) ; jamais un refusé, un retiré, un absent ;
//   rien pour un événement privé, annulé, brouillon ou fini ; pseudo et avatar seulement.
// - La liste « Inviter du monde » ne montre que mon réseau (abonnés, abonnements acceptés) et les membres de mes crews.
//   « y va déjà » n'apparaît que si je peux le savoir ailleurs : la personne que je suis, ou un compte public dont le
//   profil montre ses sorties (candidature retenue). Sinon la ligne reste cochable et l'envoi répond comme pour les
//   autres, sans rien lui envoyer.
// - Une personne qui a coupé mes invitations reçoit la même réponse : l'invitation est enregistrée, sans notification.
// Concurrence : un verrou consultatif par auteur (plafond de 30 par 24 h), un par invité et par événement (regroupement
// de la notification) ; l'unicité (événement, invité, auteur) est en base.
import {
  EVENT_INVITE_PAGE_SIZE,
  EVENT_INVITES_PER_DAY,
  type EventInviteCandidatesQuery,
  type EventInviteCreate,
  type EventInviteResult,
  eventInvitedTitle,
  eventInviteLabels,
  type FollowingGoing,
  GOING_FACES,
  goingApplicationStatuses,
  type InvitationMute,
  type InviteCandidate,
  type InviteCandidateState,
  type InviteCandidatesPage,
  type InviteCrew,
  inviteCaption,
  type ReceivedEventInvitation,
} from "@orasso/shared";
import { and, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventPeerInvitations, events, invitationMutes, notifications, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { escapeLike } from "../../lib/pagination";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { canSeeEvent, inviteOnlyError } from "../invitations/access";
import { notificationsService, registerDeliveryGuard } from "../notifications/service";
import { profilesRepo } from "../profiles/repo";

const DAY = 86_400_000;

/** Écritures interdites à un compte suspendu (lecture seule, comme les crews). */
function assertWritable(v: Viewer) {
  if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
    throw forbidden("Ton compte est suspendu : lecture seule.");
  }
}

type EventRow = typeof events.$inferSelect;

const list = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

/** Compte en règle (ni supprimé, ni banni, ni suspendu) : alias `p` de `profiles`. */
const reachableSql = (at: Date) =>
  sql`p.deleted_at is null and p.banned_at is null and (p.suspended_until is null or p.suspended_until <= ${at})`;

const goingStatuses = list(goingApplicationStatuses);

/** L'événement se partage entre passionnés : publié, ni « sur invitation », ni annulé, pas fini. */
function shareable(e: Pick<EventRow, "status" | "admission" | "endsAt">, at: Date): boolean {
  return e.status === "published" && e.admission !== "invite_only" && e.endsAt.getTime() > at.getTime();
}

async function eventOf(id: string, ex: Executor = db): Promise<EventRow> {
  const e = await ex.query.events.findFirst({ where: eq(events.id, id) });
  if (!e) throw notFound("Événement introuvable");
  return e;
}

/** Erreur claire quand l'événement ne se partage pas (sur invitation, ou passé, annulé, non publié). */
function assertShareable(e: EventRow, at: Date) {
  if (e.admission === "invite_only") throw forbidden(eventInviteLabels.inviteOnly);
  if (!shareable(e, at)) throw new AppError(409, "conflict", eventInviteLabels.closed, { reason: "closed" });
}

/**
 * Qui, parmi ces personnes, y va : candidature retenue ou en cours (`goingApplicationStatuses`, toute casquette), ou
 * billet valable ou utilisé. `accepted` : une candidature retenue (ce que montre le profil d'un compte public).
 */
async function goingInfo(
  ex: Executor,
  eventId: string,
  ids: readonly string[],
): Promise<Map<string, { accepted: boolean }>> {
  const out = new Map<string, { accepted: boolean }>();
  if (!ids.length) return out;
  const result = await ex.execute(sql`
    select x.user_id, bool_or(x.accepted) as accepted from (
      select a.user_id, a.status = 'accepted' as accepted from applications a
        where a.event_id = ${eventId} and a.status in (${goingStatuses})
      union all
      select t.user_id, false from tickets t where t.event_id = ${eventId} and t.status in ('valid', 'used')
    ) x
    where x.user_id in (${list(ids)})
    group by x.user_id`);
  for (const r of result.rows as { user_id: string; accepted: boolean }[]) {
    out.set(r.user_id, { accepted: Boolean(r.accepted) });
  }
  return out;
}

/** Le réseau de `me` : abonnements et abonnés acceptés, membres actifs de ses crews (non dissous). Alias `n`. */
const networkCte = (me: string) => sql`
  net as (
    select f.followed_id as uid, false as crew, true as i_follow, false as follows_me
      from user_follows f where f.follower_id = ${me} and f.status = 'accepted'
    union all
    select f.follower_id, false, false, true
      from user_follows f where f.followed_id = ${me} and f.status = 'accepted'
    union all
    select m2.user_id, true, false, false
      from crew_members m1
      join crews c on c.id = m1.crew_id and c.deleted_at is null
      join crew_members m2 on m2.crew_id = m1.crew_id and m2.status = 'active' and m2.user_id <> ${me}
      where m1.user_id = ${me} and m1.status = 'active'
  )`;

type NetRow = {
  user_id: string;
  pseudo: string;
  avatar_key: string | null;
  visibility: "public" | "private";
  in_crew: boolean;
  i_follow: boolean;
  follows_me: boolean;
};

/** Personnes de mon réseau, avec leurs liens (page, ou ces identifiants). */
async function networkRows(
  ex: Executor,
  me: string,
  at: Date,
  opts: { ids?: readonly string[]; q?: string; limit?: number; offset?: number },
): Promise<NetRow[]> {
  if (opts.ids && !opts.ids.length) return [];
  const q = opts.q?.trim().toLowerCase();
  const result = await ex.execute(sql`
    with ${networkCte(me)}
    select p.user_id, p.pseudo, p.avatar_key, p.visibility,
      bool_or(n.crew) as in_crew, bool_or(n.i_follow) as i_follow, bool_or(n.follows_me) as follows_me
    from net n join profiles p on p.user_id = n.uid
    where ${reachableSql(at)}
      ${opts.ids ? sql`and p.user_id in (${list(opts.ids)})` : sql``}
      ${q ? sql`and lower(p.pseudo) like ${`${escapeLike(q)}%`}` : sql``}
    group by p.user_id, p.pseudo, p.avatar_key, p.visibility
    order by bool_or(n.crew) desc, lower(p.pseudo), p.user_id
    ${opts.limit ? sql`limit ${opts.limit} offset ${opts.offset ?? 0}` : sql``}`);
  return result.rows as NetRow[];
}

/** Mes crews actifs et leurs membres actifs en règle (moi exclu). */
async function myCrews(me: string, at: Date) {
  const result = await db.execute(sql`
    select c.id, c.name, c.logo_key, m2.user_id
    from crew_members m1
    join crews c on c.id = m1.crew_id and c.deleted_at is null
    left join crew_members m2 on m2.crew_id = c.id and m2.status = 'active' and m2.user_id <> ${me}
    left join profiles p on p.user_id = m2.user_id
    where m1.user_id = ${me} and m1.status = 'active' and (m2.user_id is null or (${reachableSql(at)}))
    order by m1.joined_at, c.id`);
  const crews = new Map<string, { id: string; name: string; logoKey: string | null; memberIds: string[] }>();
  for (const r of result.rows as { id: string; name: string; logo_key: string | null; user_id: string | null }[]) {
    const c = crews.get(r.id) ?? { id: r.id, name: r.name, logoKey: r.logo_key, memberIds: [] };
    if (r.user_id) c.memberIds.push(r.user_id);
    crews.set(r.id, c);
  }
  return [...crews.values()];
}

/** Ceux que j'ai déjà invités à cet événement, parmi ces personnes. */
async function invitedByMe(ex: Executor, eventId: string, me: string, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await ex
    .select({ id: eventPeerInvitations.inviteeId })
    .from(eventPeerInvitations)
    .where(
      and(
        eq(eventPeerInvitations.eventId, eventId),
        eq(eventPeerInvitations.inviterId, me),
        inArray(eventPeerInvitations.inviteeId, [...ids]),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** « y va déjà » se dit seulement si je peux le savoir : je la suis, ou son profil public montre la sortie (retenue). */
function goingVisible(
  going: Map<string, { accepted: boolean }>,
  person: { userId: string; iFollow: boolean; visibility: string },
) {
  const g = going.get(person.userId);
  if (!g) return false;
  return person.iFollow || (person.visibility === "public" && g.accepted);
}

async function sentToday(ex: Executor, me: string, at: Date): Promise<number> {
  const [row] = await ex
    .select({ n: count() })
    .from(eventPeerInvitations)
    .where(
      and(eq(eventPeerInvitations.inviterId, me), gt(eventPeerInvitations.createdAt, new Date(at.getTime() - DAY))),
    );
  return row?.n ?? 0;
}

/** Ligne de date de la notification : « samedi 31 octobre à 19:00 · Canet-en-Roussillon ». */
const dateLine = (e: Pick<EventRow, "startsAt" | "city">) =>
  `${formatDateTime(e.startsAt)}${e.city ? ` · ${e.city}` : ""}`;

const bodyOf = (e: Pick<EventRow, "startsAt" | "city">, note: string | null) =>
  `${dateLine(e)}${note ? `\n« ${note} »` : ""}`;

type InviteData = { actor?: unknown; actorIds?: string[]; pseudos?: string[]; note?: string | null };

/**
 * « Kenji_66 t'invite à Nocturne de Canet », regroupée par événement : une notification non lue de cet événement est
 * complétée (« Kenji_66 et Julie_66 t'invitent ») au lieu d'en créer une nouvelle. Heures calmes et préférences : celles
 * de `notificationsService` (famille `social`, type `event_invited` coupable).
 */
async function notifyInvited(
  tx: Tx,
  inviteeId: string,
  e: EventRow,
  inviter: { userId: string; pseudo: string; avatarKey: string | null },
  note: string | null,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-invited:${inviteeId}:${e.id}`}))`);
  const actor = { userId: inviter.userId, pseudo: inviter.pseudo, avatarUrl: storage.url(inviter.avatarKey) };
  const [open] = await tx
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, inviteeId),
        eq(notifications.type, "event_invited"),
        eq(notifications.eventId, e.id),
        isNull(notifications.readAt),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1)
    .for("update");
  if (open) {
    const data = open.data as InviteData;
    const actorIds = [inviter.userId, ...(data.actorIds ?? []).filter((id) => id !== inviter.userId)];
    const pseudos = [inviter.pseudo, ...(data.pseudos ?? []).filter((p) => p !== inviter.pseudo)].slice(0, 2);
    const kept = note ?? data.note ?? null;
    await tx
      .update(notifications)
      .set({
        title: eventInvitedTitle(pseudos, actorIds.length, e.title),
        body: bodyOf(e, kept),
        data: { ...open.data, actor, actorIds, pseudos, note: kept },
      })
      .where(eq(notifications.id, open.id));
    return;
  }
  await notificationsService.notify(tx, inviteeId, "event_invited", {
    title: eventInvitedTitle([inviter.pseudo], 1, e.title),
    body: bodyOf(e, note),
    eventId: e.id,
    eventStartsAt: e.startsAt,
    data: { actor, actorIds: [inviter.userId], pseudos: [inviter.pseudo], note, eventSlug: e.slug },
    link: { label: eventInviteLabels.notificationLink, path: `/e/${e.slug}` },
  });
}

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return ["23505", "40P01"].includes((e.cause ?? e).code ?? "");
};

export const eventInvitesService = {
  /**
   * `GET /events/:id/following-going` : les personnes que je suis qui y vont (trois visages, et le nombre). Événement
   * privé, brouillon, annulé ou fini : personne (rien n'est montré après la fin, les absents ne se déduisent pas).
   */
  async followingGoing(viewer: Viewer, eventId: string): Promise<FollowingGoing> {
    rateLimit("eventInviteRead", viewer.user.id);
    const at = now();
    const e = await eventOf(eventId);
    if (!(await canSeeEvent(e, viewer))) throw inviteOnlyError();
    if (!shareable(e, at)) return { people: [], total: 0 };
    const result = await db.execute(sql`
      select p.pseudo, p.avatar_key, count(*) over () as total
      from (
        select a.user_id, a.created_at as at from applications a
          where a.event_id = ${e.id} and a.status in (${goingStatuses})
        union all
        select t.user_id, t.created_at from tickets t where t.event_id = ${e.id} and t.status in ('valid', 'used')
      ) x
      join user_follows f on f.followed_id = x.user_id and f.follower_id = ${viewer.user.id} and f.status = 'accepted'
      join profiles p on p.user_id = x.user_id
      where ${reachableSql(at)}
      group by p.user_id, p.pseudo, p.avatar_key
      order by min(x.at), p.user_id
      limit ${GOING_FACES}`);
    const rows = result.rows as { pseudo: string; avatar_key: string | null; total: string | number }[];
    return {
      people: rows.map((r) => ({ pseudo: r.pseudo, avatarUrl: storage.url(r.avatar_key) })),
      total: Number(rows[0]?.total ?? 0),
    };
  },

  /**
   * `GET /events/:id/peer-invitations/candidates?q=&cursor=` : mes crews (première page), puis mon réseau, membres de mes
   * crews d'abord, recherche par début de pseudo, 30 par page. Chaque ligne dit si on peut la cocher.
   */
  async candidates(viewer: Viewer, eventId: string, query: EventInviteCandidatesQuery): Promise<InviteCandidatesPage> {
    rateLimit("eventInviteRead", viewer.user.id);
    const at = now();
    const me = viewer.user.id;
    const e = await eventOf(eventId);
    if (!(await canSeeEvent(e, viewer))) throw inviteOnlyError();
    assertShareable(e, at);
    const decoded = query.cursor ? Number(Buffer.from(query.cursor, "base64url").toString()) : 0;
    const offset = Number.isSafeInteger(decoded) && decoded >= 0 ? decoded : 0;
    const rows = await networkRows(db, me, at, { q: query.q, limit: EVENT_INVITE_PAGE_SIZE + 1, offset });
    const page = rows.slice(0, EVENT_INVITE_PAGE_SIZE);
    const crews = offset === 0 && !query.q ? await myCrews(me, at) : [];
    const crewMemberIds = [...new Set(crews.flatMap((c) => c.memberIds))];
    // Les états de toutes les personnes montrées : la page, et tous les membres de mes crews (la ligne « Tout <crew> »).
    const extra = crewMemberIds.filter((id) => !page.some((r) => r.user_id === id));
    const all = [...page, ...(await networkRows(db, me, at, { ids: extra }))];
    const ids = all.map((r) => r.user_id);
    const [going, invited] = await Promise.all([goingInfo(db, e.id, ids), invitedByMe(db, e.id, me, ids)]);
    const stateOf = (r: NetRow): InviteCandidateState =>
      invited.has(r.user_id)
        ? "invited"
        : goingVisible(going, { userId: r.user_id, iFollow: r.i_follow, visibility: r.visibility })
          ? "going"
          : "available";
    const byId = new Map(all.map((r) => [r.user_id, r]));
    const people: InviteCandidate[] = page.map((r) => {
      const state = stateOf(r);
      return {
        userId: r.user_id,
        pseudo: r.pseudo,
        avatarUrl: storage.url(r.avatar_key),
        caption: inviteCaption(state, { inCrew: r.in_crew, followsMe: r.follows_me, iFollow: r.i_follow }),
        state,
        crewIds: crews.filter((c) => c.memberIds.includes(r.user_id)).map((c) => c.id),
      };
    });
    const crewViews: InviteCrew[] = crews.map((c) => {
      const members = c.memberIds.map((id) => byId.get(id)).filter((r): r is NetRow => Boolean(r));
      return {
        id: c.id,
        name: c.name,
        logoUrl: storage.url(c.logoKey),
        membersCount: members.length + 1,
        going: members.filter((r) => stateOf(r) === "going").length,
        invitable: members.filter((r) => stateOf(r) === "available").map((r) => r.user_id),
      };
    });
    return {
      crews: crewViews,
      people,
      nextCursor:
        rows.length > EVENT_INVITE_PAGE_SIZE
          ? Buffer.from(String(offset + EVENT_INVITE_PAGE_SIZE)).toString("base64url")
          : null,
      remainingToday: Math.max(0, EVENT_INVITES_PER_DAY - (await sentToday(db, me, at))),
    };
  },

  /**
   * `POST /events/:id/peer-invitations {userIds, note}` : inviter des personnes de mon réseau ou de mes crews. Toute
   * personne hors de ce réseau (ou inconnue) refuse tout l'envoi, sans dire laquelle. Un doublon est ignoré et dit ; une
   * personne qui y va déjà (et je peux le savoir) aussi. 30 invitations par 24 h.
   */
  async invite(viewer: Viewer, eventId: string, input: EventInviteCreate): Promise<EventInviteResult> {
    assertWritable(viewer);
    const me = viewer.user.id;
    rateLimit("eventInviteWrite", me);
    const at = now();
    const e = await eventOf(eventId);
    if (!(await canSeeEvent(e, viewer))) throw inviteOnlyError();
    assertShareable(e, at);
    const ids = [...new Set(input.userIds)];
    if (ids.includes(me)) throw validation(eventInviteLabels.selfInvite);
    const net = await networkRows(db, me, at, { ids });
    if (net.length !== ids.length) throw forbidden(eventInviteLabels.notInNetwork);
    // L'invité doit pouvoir voir l'événement (un événement « sur invitation » est déjà refusé ci-dessus).
    for (const id of ids) {
      if (!(await canSeeEvent(e, { user: { id, email: "", emailVerified: false } }))) {
        throw forbidden(eventInviteLabels.notInNetwork);
      }
    }
    return withTx(async (tx, after) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event-invites:${me}`}))`);
      const remaining = Math.max(0, EVENT_INVITES_PER_DAY - (await sentToday(tx, me, at)));
      const [already, going] = await Promise.all([invitedByMe(tx, e.id, me, ids), goingInfo(tx, e.id, ids)]);
      const visibleGoing = net
        .filter((r) => goingVisible(going, { userId: r.user_id, iFollow: r.i_follow, visibility: r.visibility }))
        .map((r) => r.user_id);
      const toInsert = ids.filter((id) => !already.has(id) && !visibleGoing.includes(id));
      if (toInsert.length > remaining) {
        throw new AppError(429, "rate_limited", eventInviteLabels.perDay(remaining), { remaining });
      }
      if (toInsert.length) {
        await tx
          .insert(eventPeerInvitations)
          .values(
            toInsert.map((inviteeId) => ({ eventId: e.id, inviterId: me, inviteeId, note: input.note, createdAt: at })),
          )
          .onConflictDoNothing();
        // Rien n'est envoyé à qui y va déjà, ni à qui a coupé mes invitations : la réponse, elle, est la même.
        const muted = await tx
          .select({ id: invitationMutes.userId })
          .from(invitationMutes)
          .where(and(eq(invitationMutes.mutedUserId, me), inArray(invitationMutes.userId, toInsert)));
        const mutedIds = new Set(muted.map((r) => r.id));
        const notifiable = toInsert.filter((id) => !going.has(id) && !mutedIds.has(id));
        for (const id of notifiable) await notifyInvited(tx, id, e, viewer.profile, input.note);
        if (notifiable.length) after(() => notificationsService.kick());
      }
      return {
        invited: toInsert.length,
        alreadyInvited: ids.filter((id) => already.has(id)),
        going: visibleGoing,
        remainingToday: remaining - toInsert.length,
      };
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw new AppError(409, "conflict", "Envoi en cours : réessaie.");
      throw error;
    });
  },

  /**
   * `GET /events/:id/peer-invitations/received` : le bandeau « Kenji_66 t'invite » et son mot. Les invitations de
   * personnes que j'ai coupées, ou dont le compte n'est plus en règle, ne comptent pas. Événement qui ne se partage plus :
   * rien.
   */
  async received(viewer: Viewer, eventId: string): Promise<ReceivedEventInvitation | null> {
    rateLimit("eventInviteRead", viewer.user.id);
    const at = now();
    const e = await eventOf(eventId);
    if (!(await canSeeEvent(e, viewer))) throw inviteOnlyError();
    if (!shareable(e, at)) return null;
    const result = await db.execute(sql`
      select i.inviter_id, p.pseudo, p.avatar_key, i.note
      from event_peer_invitations i
      join profiles p on p.user_id = i.inviter_id
      where i.event_id = ${e.id} and i.invitee_id = ${viewer.user.id} and ${reachableSql(at)}
        and not exists (
          select 1 from invitation_mutes m where m.user_id = ${viewer.user.id} and m.muted_user_id = i.inviter_id
        )
      order by i.created_at desc, i.id
      limit 20`);
    const rows = result.rows as {
      inviter_id: string;
      pseudo: string;
      avatar_key: string | null;
      note: string | null;
    }[];
    if (!rows.length) return null;
    return {
      inviters: rows.map((r) => ({ userId: r.inviter_id, pseudo: r.pseudo, avatarUrl: storage.url(r.avatar_key) })),
      note: rows.find((r) => r.note)?.note ?? null,
    };
  },

  /** `GET /me/invitation-mutes` : les personnes dont j'ai coupé les invitations (moi seul). */
  async mutes(viewer: Viewer): Promise<InvitationMute[]> {
    const rows = await db
      .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
      .from(invitationMutes)
      .innerJoin(profiles, eq(profiles.userId, invitationMutes.mutedUserId))
      .where(and(eq(invitationMutes.userId, viewer.user.id), isNull(profiles.deletedAt)))
      .orderBy(desc(invitationMutes.createdAt));
    return rows.map((r) => ({ userId: r.userId, pseudo: r.pseudo, avatarUrl: storage.url(r.avatarKey) }));
  },

  /** `POST /me/invitation-mutes {userId}` : « Ne plus recevoir d'invitations de Kenji_66 » (idempotent). */
  async mute(viewer: Viewer, userId: string): Promise<{ muted: true }> {
    rateLimit("invitationMute", viewer.user.id);
    if (userId === viewer.user.id) throw validation(eventInviteLabels.selfInvite);
    const target = await profilesRepo.byUserId(userId);
    if (!target || target.deletedAt) throw notFound("Profil introuvable");
    await db.insert(invitationMutes).values({ userId: viewer.user.id, mutedUserId: userId }).onConflictDoNothing();
    return { muted: true };
  },

  /** `DELETE /me/invitation-mutes/:userId` : recevoir de nouveau ses invitations. */
  async unmute(viewer: Viewer, userId: string): Promise<{ muted: false }> {
    rateLimit("invitationMute", viewer.user.id);
    await db
      .delete(invitationMutes)
      .where(and(eq(invitationMutes.userId, viewer.user.id), eq(invitationMutes.mutedUserId, userId)));
    return { muted: false };
  },

  /** La personne `userId` a-t-elle coupé les invitations de `fromId` ? (crew : invitation d'un membre). */
  async isMuted(userId: string, fromId: string, ex: Executor = db): Promise<boolean> {
    const [row] = await ex
      .select({ id: invitationMutes.userId })
      .from(invitationMutes)
      .where(and(eq(invitationMutes.userId, userId), eq(invitationMutes.mutedUserId, fromId)))
      .limit(1);
    return Boolean(row);
  },

  shareable,
  goingInfo,
};

/**
 * Compte supprimé (anonymisé) : ses invitations envoyées et reçues, ses invitations coupées (dans les deux sens), et les
 * notifications d'invitation des autres qui le citent disparaissent. Dans la transaction de `accountService.anonymize`.
 */
export async function anonymizeEventInvitesForDeletedAccount(tx: Tx, userId: string) {
  await tx
    .delete(eventPeerInvitations)
    .where(or(eq(eventPeerInvitations.inviterId, userId), eq(eventPeerInvitations.inviteeId, userId)));
  await tx
    .delete(invitationMutes)
    .where(or(eq(invitationMutes.userId, userId), eq(invitationMutes.mutedUserId, userId)));
  await tx
    .delete(notifications)
    .where(
      and(
        eq(notifications.type, "event_invited"),
        sql`${notifications.data} -> 'actorIds' @> jsonb_build_array(${userId}::text)`,
      ),
    );
}

/** Export RGPD : invitations envoyées (avec mon mot), reçues (sans le mot d'un autre), personnes coupées. */
export async function eventInvitesExport(userId: string) {
  const sentRows = await db.execute(sql`
    select e.title, p.pseudo, i.note, i.created_at from event_peer_invitations i
    join events e on e.id = i.event_id join profiles p on p.user_id = i.invitee_id
    where i.inviter_id = ${userId} order by i.created_at desc`);
  const receivedRows = await db.execute(sql`
    select e.title, p.pseudo, i.created_at from event_peer_invitations i
    join events e on e.id = i.event_id join profiles p on p.user_id = i.inviter_id
    where i.invitee_id = ${userId} order by i.created_at desc`);
  const mutedRows = await db.execute(sql`
    select p.pseudo, m.created_at from invitation_mutes m join profiles p on p.user_id = m.muted_user_id
    where m.user_id = ${userId} order by m.created_at desc`);
  const iso = (d: unknown) => new Date(d as string).toISOString();
  return {
    sent: (sentRows.rows as { title: string; pseudo: string; note: string | null; created_at: unknown }[]).map((r) => ({
      event: r.title,
      to: r.pseudo,
      note: r.note,
      at: iso(r.created_at),
    })),
    received: (receivedRows.rows as { title: string; pseudo: string; created_at: unknown }[]).map((r) => ({
      event: r.title,
      from: r.pseudo,
      at: iso(r.created_at),
    })),
    mutedInviters: (mutedRows.rows as { pseudo: string; created_at: unknown }[]).map((r) => ({
      pseudo: r.pseudo,
      since: iso(r.created_at),
    })),
  };
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Garde de livraison (heures calmes : la notification part plus tard) : l'événement se partage encore (publié, pas sur
 * invitation, ni annulé ni fini) et l'invité peut le voir, il n'y va pas déjà, et au moins une des personnes qui
 * l'invitent est en règle et n'a pas été coupée. Sinon la notification disparaît sans être envoyée.
 */
registerDeliveryGuard(["event_invited"], async (n) => {
  if (!n.eventId) return false;
  const e = await db.query.events.findFirst({ where: eq(events.id, n.eventId) });
  if (!e || !shareable(e, now())) return false;
  if (!(await canSeeEvent(e, { user: { id: n.userId, email: "", emailVerified: false } }))) return false;
  if ((await goingInfo(db, e.id, [n.userId])).size > 0) return false;
  const actorIds = (n.data as InviteData).actorIds;
  if (!isStringArray(actorIds) || !actorIds.length) return false;
  const at = now();
  const result = await db.execute(sql`
    select 1 from profiles p
    where p.user_id in (${list(actorIds)}) and ${reachableSql(at)}
      and not exists (select 1 from invitation_mutes m where m.user_id = ${n.userId} and m.muted_user_id = p.user_id)
    limit 1`);
  return result.rows.length > 0;
});
