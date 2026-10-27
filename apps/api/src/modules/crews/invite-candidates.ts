// Lot R6c (maquette R6.7) : la feuille « Inviter dans <crew> » d'un membre actif (chef compris). Mon réseau seulement
// (abonnés et abonnements acceptés, comptes en règle), recherche par début de pseudo, 30 par page ; les membres actifs
// n'y sont pas ; une invitation en cours se dit (« déjà invité(e) par Kenji_66 », « déjà invité(e) par toi »). Tour 2
// (relecture Opus 6) : une demande en cours, ou une personne que je ne peux pas inviter pour l'instant (refus ou
// retrait de moins de 30 jours), se dit « déjà en cours », sans dire lequel ; l'envoi répond de même (409). Liste
// visible par moi seul : pas un annuaire.
import {
  type CrewInviteCandidate,
  type CrewInviteCandidateState,
  type CrewInviteCandidatesPage,
  type CrewMemberStatus,
  crewErrors,
  crewInviteLabels,
  crewJoinOutcome,
  EVENT_INVITE_PAGE_SIZE,
  eventInviteLabels,
} from "@orasso/shared";
import { sql } from "drizzle-orm";

import { db } from "../../db/client";
import { now } from "../../lib/deps";
import { forbidden } from "../../lib/errors";
import { escapeLike } from "../../lib/pagination";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { byPerson, crewsService, memberInviteBlocked, memberRow } from "./service";

type Row = {
  user_id: string;
  pseudo: string;
  avatar_key: string | null;
  i_follow: boolean;
  follows_me: boolean;
  status: CrewMemberStatus | null;
  inviter: string | null;
  invited_by: string | null;
  invite_accepted_at: Date | string | null;
  responded_at: Date | string | null;
};

const dateOf = (d: Date | string | null) => (d ? new Date(d) : null);

export async function crewInviteCandidates(
  v: Viewer,
  crewId: string,
  query: { q?: string; cursor?: string },
): Promise<CrewInviteCandidatesPage> {
  rateLimit("eventInviteRead", v.user.id);
  const crew = await crewsService.findCrew(db, crewId);
  const mine = await memberRow(db, crew.id, v.user.id);
  if (mine?.status !== "active" || crew.deletedAt) throw forbidden(crewErrors.membersOnly);
  const me = v.user.id;
  const at = now();
  const decoded = query.cursor ? Number(Buffer.from(query.cursor, "base64url").toString()) : 0;
  const offset = Number.isSafeInteger(decoded) && decoded >= 0 ? decoded : 0;
  const q = query.q?.trim().toLowerCase();
  const result = await db.execute(sql`
    with net as (
      select f.followed_id as uid, true as i_follow, false as follows_me
        from user_follows f where f.follower_id = ${me} and f.status = 'accepted'
      union all
      select f.follower_id, false, true from user_follows f where f.followed_id = ${me} and f.status = 'accepted'
    )
    select p.user_id, p.pseudo, p.avatar_key, bool_or(n.i_follow) as i_follow, bool_or(n.follows_me) as follows_me,
      m.status, ip.pseudo as inviter, m.invited_by, m.invite_accepted_at, m.responded_at
    from net n
    join profiles p on p.user_id = n.uid
    left join crew_members m on m.crew_id = ${crew.id} and m.user_id = p.user_id
    left join profiles ip on ip.user_id = m.invited_by and ip.deleted_at is null
    where p.deleted_at is null and p.banned_at is null and (p.suspended_until is null or p.suspended_until <= ${at})
      and (m.status is null or m.status <> 'active')
      ${q ? sql`and lower(p.pseudo) like ${`${escapeLike(q)}%`}` : sql``}
    group by p.user_id, p.pseudo, p.avatar_key, m.status, ip.pseudo, m.invited_by, m.invite_accepted_at, m.responded_at
    order by lower(p.pseudo), p.user_id
    limit ${EVENT_INVITE_PAGE_SIZE + 1} offset ${offset}`);
  const rows = result.rows as Row[];
  const leader = mine.role === "leader";
  /** Ce que répondrait l'envoi (mêmes règles que `crewsService.invite`) : cochable, invitée, ou « déjà en cours ». */
  const stateOf = (r: Row): CrewInviteCandidateState => {
    if (r.status === "invited") return "invited";
    if (r.status === "requested") return "requested";
    if (!r.status) return "available";
    const row = {
      status: r.status,
      respondedAt: dateOf(r.responded_at),
      invitedBy: r.invited_by,
      inviteAcceptedAt: dateOf(r.invite_accepted_at),
    };
    if (!leader && memberInviteBlocked(row, at)) return "requested";
    const outcome = crewJoinOutcome({ ...row, wasInvitation: !byPerson(row) }, "invite", at);
    return outcome.kind === "error" ? "requested" : "available";
  };
  const people: CrewInviteCandidate[] = rows.slice(0, EVENT_INVITE_PAGE_SIZE).map((r) => {
    const state = stateOf(r);
    const link = r.follows_me ? eventInviteLabels.followsMe : eventInviteLabels.iFollow;
    const caption =
      state === "invited"
        ? r.invited_by === me
          ? eventInviteLabels.invitedByYou
          : r.inviter
            ? `${crewInviteLabels.alreadyInvited} par ${r.inviter}`
            : crewInviteLabels.alreadyInvited
        : state === "requested"
          ? crewInviteLabels.alreadyRequested
          : link;
    return { userId: r.user_id, pseudo: r.pseudo, avatarUrl: storage.url(r.avatar_key), caption, state };
  });
  return {
    people,
    nextCursor:
      rows.length > EVENT_INVITE_PAGE_SIZE
        ? Buffer.from(String(offset + EVENT_INVITE_PAGE_SIZE)).toString("base64url")
        : null,
  };
}
