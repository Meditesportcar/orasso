// Rendez-vous au spot (lot R7i, ARCHITECTURE-R7 § 2.8). Un rendez-vous de dernière minute : 12 h au plus, un seul actif par
// personne, visible de l'auteur et de ses invités seuls (abonnés acceptés, ou membres actifs du crew). Tout est décidé
// ici : l'écran ne filtre jamais. Un rendez-vous que la personne n'a pas le droit de voir répond 404, comme un inconnu
// (on ne révèle ni son existence ni son lieu).
import {
  type AudienceRelation,
  type HomeSpotMeetup,
  meetupVisibleTo,
  r7NotificationTable,
  SPOT_PAST_MS,
  type SpotAnswer,
  type SpotAudiences,
  type SpotCrewList,
  type SpotIncoming,
  type SpotMeetupView,
  type SpotReplies,
  spotCreateSchema,
  spotErrors,
  validateSpotTimes,
} from "@orasso/shared";
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { crewMembers, crews, profiles, spotMeetupReplies, spotMeetups, userFollows } from "../../db/schema";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { parse } from "../../lib/validate";
import { requireCrewMember } from "../crews/feed/access";
import { profileOkSql, unavailable } from "../feed/access";
import { notificationsService } from "../notifications/service";
import { notifyInvitees } from "./notify";
import { purgeWhere } from "./purge";
import { buildViews, invitedSql, isOver, personOf, type SpotRow } from "./views";

/** Rendez-vous par page (reçus, passés du crew), et réponses par page. */
export const SPOT_PAGE = 20;
export const SPOT_REPLIES_PAGE = 50;
const SPOT_ACTIVE_CAP = 100;

type Cursor = { at: Date; id: string };
const encodeCursor = (c: Cursor) => Buffer.from(`${c.at.toISOString()}|${c.id}`).toString("base64url");
function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString().split("|");
    const at = new Date(iso ?? "");
    if (Number.isNaN(at.getTime()) || !id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("bad");
    return { at, id };
  } catch {
    throw validation("Curseur invalide");
  }
}

const viewerOf = (v: Viewer, at: Date) => ({ id: v.user.id, active: !unavailable(v.profile, at) });

/** Un rendez-vous (non annulé) avec le profil de son auteur ; `null` s'il n'existe pas. */
async function findRow(id: string): Promise<{ row: SpotRow; authorOk: boolean } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  const at = now();
  const [r] = await db
    .select({
      m: spotMeetups,
      ok: sql<boolean>`${profileOkSql("profiles", at)}`,
    })
    .from(spotMeetups)
    .innerJoin(profiles, eq(profiles.userId, spotMeetups.authorId))
    .where(eq(spotMeetups.id, id));
  if (!r || r.m.cancelledAt) return null;
  return { row: r.m, authorOk: r.ok };
}

/** Le lien du regard avec l'auteur et le crew du rendez-vous (une requête chacun, seulement si utile). */
async function relationOf(viewerId: string, row: SpotRow): Promise<AudienceRelation & { authorInCrew: boolean }> {
  let followAccepted = false;
  if (row.audience === "followers" && viewerId !== row.authorId) {
    const [f] = await db
      .select({ id: userFollows.followerId })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, viewerId),
          eq(userFollows.followedId, row.authorId),
          eq(userFollows.status, "accepted"),
        ),
      );
    followAccepted = Boolean(f);
  }
  let member = false;
  let authorInCrew = true;
  if (row.audience === "crew" && row.crewId) {
    const rows = await db
      .select({ userId: crewMembers.userId })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(
        and(
          eq(crewMembers.crewId, row.crewId),
          eq(crewMembers.status, "active"),
          isNull(crews.deletedAt),
          or(eq(crewMembers.userId, viewerId), eq(crewMembers.userId, row.authorId)),
        ),
      );
    member = rows.some((m) => m.userId === viewerId);
    authorInCrew = rows.some((m) => m.userId === row.authorId);
  }
  return { followAccepted, crewMemberActive: (id) => id === row.crewId && member, authorInCrew };
}

/**
 * Le rendez-vous, s'il est visible du regard ; 404 sinon (inconnu, annulé, pas invité, compte écarté : même réponse).
 * Rejoue la règle pure `meetupVisibleTo`.
 */
async function visibleRow(v: Viewer, id: string, at: Date): Promise<SpotRow> {
  const found = await findRow(id);
  if (!found) throw notFound(spotErrors.notFound);
  const rel = await relationOf(v.user.id, found.row);
  const ok = meetupVisibleTo(
    viewerOf(v, at),
    {
      authorId: found.row.authorId,
      audience: found.row.audience,
      crewId: found.row.crewId,
      authorActive: found.authorOk && rel.authorInCrew,
    },
    rel,
  );
  if (!ok) throw notFound(spotErrors.notFound);
  return found.row;
}

async function viewOf(row: SpotRow, viewerId: string, at: Date): Promise<SpotMeetupView> {
  const [view] = await buildViews(db, [row], viewerId, at);
  if (!view) throw notFound(spotErrors.notFound);
  return view;
}

/** Le rendez-vous actif d'un auteur (ni annulé, ni effacé, pas fini), ou `null`. */
async function activeOf(
  ex: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  authorId: string,
  at: Date,
) {
  const [row] = await ex
    .select()
    .from(spotMeetups)
    .where(
      and(
        eq(spotMeetups.authorId, authorId),
        isNull(spotMeetups.cancelledAt),
        isNull(spotMeetups.purgedAt),
        gt(spotMeetups.endsAt, at),
      ),
    );
  return row ?? null;
}

/** Les rendez-vous reçus (invité, pas moi), en cours ou à venir, du plus proche au plus loin ; `limit` lignes au plus. */
async function incomingRows(v: Viewer, at: Date, cursor: Cursor | null, limit: number): Promise<SpotRow[]> {
  if (unavailable(v.profile, at)) return [];
  const rows = await db
    .select({ m: spotMeetups })
    .from(spotMeetups)
    .innerJoin(profiles, eq(profiles.userId, spotMeetups.authorId))
    .where(
      and(
        isNull(spotMeetups.cancelledAt),
        isNull(spotMeetups.purgedAt),
        gt(spotMeetups.endsAt, at),
        sql`${spotMeetups.authorId} <> ${v.user.id}`,
        profileOkSql("profiles", at),
        invitedSql(v.user.id),
        cursor
          ? sql`(${spotMeetups.startsAt}, ${spotMeetups.id}) > (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(spotMeetups.startsAt), asc(spotMeetups.id))
    .limit(limit);
  return rows.map((r) => r.m);
}

export const spotMeetupsService = {
  /** Lancer un rendez-vous. 409 `meetup_active` s'il en a déjà un ; 400 si les heures ne vont pas (12 h au plus). */
  async create(v: Viewer, input: unknown): Promise<SpotMeetupView> {
    const data = parse(spotCreateSchema, input);
    rateLimit("spotLaunch", v.user.id);
    const at = now();
    const bad = validateSpotTimes(data.startsAt, data.endsAt, at);
    if (bad)
      throw validation(spotErrors[bad], {
        fields: { [bad === "start_in_past" || bad === "start_too_far" ? "startsAt" : "endsAt"]: spotErrors[bad] },
      });
    const row = await withTx(async (tx, after) => {
      // Un seul actif par personne : la ligne du profil est verrouillée, deux lancements simultanés s'ordonnent.
      await tx.select({ id: profiles.userId }).from(profiles).where(eq(profiles.userId, v.user.id)).for("update");
      // Un rendez-vous fini depuis moins de 5 minutes (la tâche n'est pas encore passée) ne bloque pas un nouveau.
      await purgeWhere(tx, and(eq(spotMeetups.authorId, v.user.id), lte(spotMeetups.endsAt, at)) ?? sql`false`, at);
      const active = await activeOf(tx, v.user.id, at);
      if (active) throw conflict("meetup_active", spotErrors.active, { meetupId: active.id });
      let crewId: string | null = null;
      if (data.audience === "crew") {
        // Membre actif d'un crew non dissous (404 sinon, comme le fil du crew).
        const access = await requireCrewMember(tx, v, data.crewId ?? "", "write");
        crewId = access.crew.id;
      }
      const [created] = await tx
        .insert(spotMeetups)
        .values({
          authorId: v.user.id,
          audience: data.audience,
          crewId,
          placeLabel: data.placeLabel,
          lat: data.lat,
          lng: data.lng,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          note: data.note,
          createdAt: at,
        })
        .returning();
      if (!created) throw new Error("Rendez-vous non enregistré");
      await notifyInvitees(tx, after, v, created);
      return created;
    });
    return viewOf(row, v.user.id, at);
  },

  /** Annuler : tout disparaît tout de suite (lieu, liste, notifications pas encore livrées). 404 si ce n'est pas le sien. */
  async cancel(v: Viewer, id: string): Promise<{ ok: true }> {
    const at = now();
    await withTx(async (tx) => {
      const [row] = await tx.select().from(spotMeetups).where(eq(spotMeetups.id, id)).for("update");
      if (!row || row.authorId !== v.user.id || row.cancelledAt || row.purgedAt) throw notFound(spotErrors.notFound);
      await tx.update(spotMeetups).set({ cancelledAt: at }).where(eq(spotMeetups.id, id));
      await purgeWhere(tx, eq(spotMeetups.id, id), at);
    });
    return { ok: true };
  },

  async get(v: Viewer, id: string): Promise<SpotMeetupView> {
    rateLimit("spotRead", v.user.id);
    const at = now();
    return viewOf(await visibleRow(v, id, at), v.user.id, at);
  },

  /** « Je viens » / « Peut-être » (modifiable tant que le rendez-vous dure). Pas pour son propre rendez-vous. */
  async reply(v: Viewer, id: string, answer: SpotAnswer): Promise<SpotMeetupView> {
    rateLimit("spotReply", v.user.id);
    const at = now();
    const seen = await visibleRow(v, id, at);
    if (seen.authorId === v.user.id) throw forbidden("C'est ton rendez-vous.");
    await withTx(async (tx, after) => {
      // Ordonné avec l'effacement : la ligne en partage, relue (un effacement passé juste avant est vu).
      const [row] = await tx.select().from(spotMeetups).where(eq(spotMeetups.id, id)).for("share");
      if (!row || row.cancelledAt) throw notFound(spotErrors.notFound);
      if (isOver(row, at)) throw conflict("conflict", "Ce rendez-vous est terminé.");
      const [saved] = await tx
        .insert(spotMeetupReplies)
        .values({ meetupId: id, userId: v.user.id, answer, answeredAt: at })
        .onConflictDoUpdate({
          target: [spotMeetupReplies.meetupId, spotMeetupReplies.userId],
          set: { answer, answeredAt: at },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      // L'auteur n'est prévenu qu'à la première réponse d'une personne (pas quand elle change d'avis).
      if (saved?.inserted) {
        const t = r7NotificationTable.spot_meetup_reply;
        await notificationsService.notify(tx, row.authorId, "spot_meetup_reply", {
          title: t.title,
          body: t.body,
          actor: { userId: v.user.id, pseudo: v.profile.pseudo, avatarUrl: personOf(v.profile).avatarUrl },
          groupKey: `spot_meetup_reply:${id}`,
          data: { meetupId: id, link: `/app/spot/${id}` },
          after,
        });
      }
    });
    return viewOf((await findRow(id))?.row ?? seen, v.user.id, now());
  },

  /** Retirer sa réponse. */
  async unreply(v: Viewer, id: string): Promise<SpotMeetupView> {
    rateLimit("spotReply", v.user.id);
    const at = now();
    const seen = await visibleRow(v, id, at);
    await db
      .delete(spotMeetupReplies)
      .where(and(eq(spotMeetupReplies.meetupId, id), eq(spotMeetupReplies.userId, v.user.id)));
    return viewOf(seen, v.user.id, now());
  },

  /** Qui vient : pseudos des réponses, pour l'auteur et les invités ; vide une fois le rendez-vous fini. */
  async replies(v: Viewer, id: string, cursorRaw?: string): Promise<SpotReplies> {
    rateLimit("spotRead", v.user.id);
    const at = now();
    const row = await visibleRow(v, id, at);
    if (isOver(row, at)) return { items: [], yesCount: 0, maybeCount: 0, nextCursor: null };
    const cursor = decodeCursor(cursorRaw);
    const rows = await db
      .select({
        userId: spotMeetupReplies.userId,
        answer: spotMeetupReplies.answer,
        answeredAt: spotMeetupReplies.answeredAt,
        pseudo: profiles.pseudo,
        avatarKey: profiles.avatarKey,
      })
      .from(spotMeetupReplies)
      .innerJoin(profiles, eq(profiles.userId, spotMeetupReplies.userId))
      .where(
        and(
          eq(spotMeetupReplies.meetupId, id),
          profileOkSql("profiles", at),
          cursor
            ? sql`(${spotMeetupReplies.answeredAt}, ${spotMeetupReplies.userId}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(desc(spotMeetupReplies.answeredAt), desc(spotMeetupReplies.userId))
      .limit(SPOT_REPLIES_PAGE + 1);
    const page = rows.slice(0, SPOT_REPLIES_PAGE);
    const last = page.at(-1);
    const [view] = await buildViews(db, [row], v.user.id, at);
    return {
      items: page.map((r) => ({
        person: personOf(r),
        answer: r.answer,
        answeredAt: r.answeredAt.toISOString(),
      })),
      yesCount: view?.yesCount ?? 0,
      maybeCount: view?.maybeCount ?? 0,
      nextCursor:
        rows.length > SPOT_REPLIES_PAGE && last ? encodeCursor({ at: last.answeredAt, id: last.userId }) : null,
    };
  },

  /** Les rendez-vous reçus qui durent encore (carte du Fil, liste), du plus proche au plus loin. */
  async incoming(v: Viewer, cursorRaw?: string): Promise<SpotIncoming> {
    rateLimit("spotRead", v.user.id);
    const at = now();
    const rows = await incomingRows(v, at, decodeCursor(cursorRaw), SPOT_PAGE + 1);
    const page = rows.slice(0, SPOT_PAGE);
    const last = page.at(-1);
    return {
      items: await buildViews(db, page, v.user.id, at),
      nextCursor: rows.length > SPOT_PAGE && last ? encodeCursor({ at: last.startsAt, id: last.id }) : null,
    };
  },

  /** Bloc « Au spot » de l’Accueil : le prochain rendez-vous reçu, sinon le mien (la limite de débit est celle de l’Accueil). */
  async homeBlock(v: Viewer): Promise<HomeSpotMeetup | null> {
    const at = now();
    const rows = await incomingRows(v, at, null, SPOT_PAGE);
    const first = rows[0];
    if (first) {
      const [meetup] = await buildViews(db, [first], v.user.id, at);
      return meetup ? { meetup, others: rows.length - 1 } : null;
    }
    const mine = await activeOf(db, v.user.id, at);
    const [meetup] = mine ? await buildViews(db, [mine], v.user.id, at) : [];
    return meetup ? { meetup, others: 0 } : null;
  },

  /** Mon rendez-vous actif, ou `null`. */
  async mine(v: Viewer): Promise<SpotMeetupView | null> {
    rateLimit("spotRead", v.user.id);
    const at = now();
    const row = await activeOf(db, v.user.id, at);
    return row ? viewOf(row, v.user.id, at) : null;
  },

  /** L'onglet Spots d'un crew : les rendez-vous en cours, puis les 30 derniers jours sans lieu. Membres actifs seulement. */
  async crewList(v: Viewer, crewId: string, cursorRaw?: string): Promise<SpotCrewList> {
    rateLimit("spotRead", v.user.id);
    const at = now();
    const access = await requireCrewMember(db, v, crewId);
    const cursor = decodeCursor(cursorRaw);
    const base = and(
      eq(spotMeetups.crewId, access.crew.id),
      eq(spotMeetups.audience, "crew"),
      isNull(spotMeetups.cancelledAt),
      profileOkSql("profiles", at),
      sql`exists (select 1 from crew_members am where am.crew_id = ${spotMeetups.crewId} and am.user_id = ${spotMeetups.authorId} and am.status = 'active')`,
    );
    let active: SpotRow[] = [];
    if (!cursor) {
      active = (
        await db
          .select({ m: spotMeetups })
          .from(spotMeetups)
          .innerJoin(profiles, eq(profiles.userId, spotMeetups.authorId))
          .where(and(base, isNull(spotMeetups.purgedAt), gt(spotMeetups.endsAt, at)))
          .orderBy(asc(spotMeetups.startsAt), asc(spotMeetups.id))
          .limit(SPOT_ACTIVE_CAP)
      ).map((r) => r.m);
    }
    const pastRows = await db
      .select({ m: spotMeetups })
      .from(spotMeetups)
      .innerJoin(profiles, eq(profiles.userId, spotMeetups.authorId))
      .where(
        and(
          base,
          or(sql`${spotMeetups.purgedAt} is not null`, lte(spotMeetups.endsAt, at)),
          gt(spotMeetups.endsAt, new Date(at.getTime() - SPOT_PAST_MS)),
          cursor
            ? sql`(${spotMeetups.endsAt}, ${spotMeetups.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(spotMeetups.endsAt), desc(spotMeetups.id))
      .limit(SPOT_PAGE + 1);
    const past = pastRows.slice(0, SPOT_PAGE).map((r) => r.m);
    const last = past.at(-1);
    return {
      active: await buildViews(db, active, v.user.id, at),
      past: await buildViews(db, past, v.user.id, at),
      nextCursor: pastRows.length > SPOT_PAGE && last ? encodeCursor({ at: last.endsAt, id: last.id }) : null,
    };
  },

  /** Qui peut être prévenu (pour l'écran « Lancer »), et le rendez-vous déjà actif. */
  async audiences(v: Viewer): Promise<SpotAudiences> {
    rateLimit("spotRead", v.user.id);
    const at = now();
    const [followers] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
      .where(
        and(eq(userFollows.followedId, v.user.id), eq(userFollows.status, "accepted"), profileOkSql("profiles", at)),
      );
    const mine = await db
      .select({ id: crews.id, name: crews.name, slug: crews.slug, members: crews.membersCount })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(and(eq(crewMembers.userId, v.user.id), eq(crewMembers.status, "active"), isNull(crews.deletedAt)))
      .orderBy(asc(crews.name));
    const active = await activeOf(db, v.user.id, at);
    return { followers: followers?.n ?? 0, crews: mine, activeMeetupId: active?.id ?? null };
  },
};
