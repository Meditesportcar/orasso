// Amis (ARCHITECTURE-SUITE § 2.1 à 2.3) : demande avec acceptation des deux côtés, QR ami, lien d'ami, retrait.
// Une seule ligne `friendships` par paire (index unique d'expression) ; un refus garde la ligne 30 jours (S7).
import { createHmac } from "node:crypto";
import {
  declineCooldownActive,
  decodeAccountQrPayload,
  type FriendItem,
  type FriendRequestResult,
  type FriendRequestView,
  type FriendSource,
  friendRequestOutcome,
  friendshipState,
  type HmacSha1,
  matchAccountQrCounter,
  socialLabels,
} from "@orasso/shared";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { accountQrUses, friendships, notifications, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import { rateAssertBelow, rateLimit, rateRecord } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { type Profile, profilesRepo } from "../profiles/repo";
import { type Friendship, socialRepo } from "./repo";

const hmacSha1: HmacSha1 = (key, message) => new Uint8Array(createHmac("sha1", key).update(message).digest());
/** Anti-rejeu : un code de QR de compte présenté une fois est refusé ensuite (traces purgées après 3 minutes). */
const QR_USE_RETENTION_MS = 3 * 60_000;

const errorMessages = {
  friendship_exists: socialLabels.alreadyRequested,
  already_friends: socialLabels.alreadyFriends,
} as const;

const actorOf = (p: Pick<Profile, "userId" | "pseudo" | "avatarKey">) => ({
  userId: p.userId,
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
});

/** Sérialise les demandes d'une même paire (deux demandes croisées simultanées). */
async function lockPair(tx: Tx, a: string, b: string) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`friendship:${lo}:${hi}`}))`);
}

/** La notification de demande d'ami n'a plus à rester « non lue » une fois la demande traitée. */
async function closeRequestNotification(tx: Tx, userId: string, friendshipId: string) {
  await tx
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "friend_request"),
        sql`${notifications.data} ->> 'friendshipId' = ${friendshipId}`,
        sql`${notifications.readAt} is null`,
      ),
    );
}

async function publishInbox(userId: string) {
  realtime.publish(`user:${userId}`, "inbox.changed", {
    requests: { friend: await socialRepo.pendingIncomingCount(userId) },
  });
}

function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
}

async function accept(tx: Tx, row: Friendship, viewer: Viewer) {
  const t = now();
  const [updated] = await tx
    .update(friendships)
    .set({ status: "accepted", respondedAt: t })
    .where(and(eq(friendships.id, row.id), eq(friendships.status, "pending")))
    .returning();
  if (!updated) throw conflict("conflict", "Cette demande a déjà été traitée");
  await socialRepo.recountFriends([row.requesterId, row.addresseeId], tx);
  await closeRequestNotification(tx, viewer.user.id, row.id);
  await notificationsService.notify(tx, row.requesterId, "friend_accepted", {
    title: "Demande d'ami acceptée",
    body: `${viewer.profile.pseudo} a accepté ta demande d'ami.`,
    data: { friendshipId: row.id, actor: actorOf(viewer.profile), link: `/u/${viewer.profile.pseudo}` },
    link: { label: "Voir son profil", path: `/u/${viewer.profile.pseudo}` },
  });
  return updated;
}

export const friendsService = {
  /**
   * Demande d'ami vers `target`. Si cette personne m'a déjà demandé en ami, la demande vaut acceptation (je veux la même
   * chose qu'elle) : le résultat est alors `accepted`.
   */
  async request(
    viewer: Viewer,
    target: Profile,
    opts: { message?: string | null; source: FriendSource },
  ): Promise<FriendRequestResult> {
    if (target.userId === viewer.user.id) throw validation(socialLabels.selfRequest);
    // Un compte supprimé n'existe plus ; un compte suspendu ne reçoit pas de demande.
    if (target.deletedAt || (target.suspendedUntil && target.suspendedUntil > now()))
      throw notFound("Profil introuvable");
    rateLimit("friendRequest", viewer.user.id);
    const me = viewer.user.id;

    const result = await withTx(async (tx, after) => {
      await lockPair(tx, me, target.userId);
      const row = await socialRepo.pair(me, target.userId, tx);
      // La personne m'a déjà demandé : j'accepte.
      if (row && row.status === "pending" && row.requesterId === target.userId) {
        const updated = await accept(tx, row, viewer);
        after(() => notificationsService.kick());
        after(() => publishInbox(me));
        after(() => realtime.publish(`user:${target.userId}`, "friend.accepted", { friendshipId: updated.id }));
        return { id: updated.id, status: "accepted" as const };
      }
      const outcome = friendRequestOutcome(row, me, now());
      if (outcome.kind === "error") {
        throw conflict(outcome.code, errorMessages[outcome.code], {
          friendshipId: row?.id ?? null,
          state: friendshipState(row, me),
        });
      }
      // Anti-harcèlement (en base, pas en mémoire) : au plus une notification de demande par paire et par 24 h. Cela
      // vaut aussi après le retrait d'une demande ou d'un ami : pas de nouvelle demande avant 24 h.
      const [recent] = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, target.userId),
            eq(notifications.type, "friend_request"),
            sql`${notifications.data} -> 'actor' ->> 'userId' = ${me}`,
            sql`${notifications.createdAt} > now() - interval '24 hours'`,
          ),
        )
        .limit(1);
      if (recent) {
        throw new AppError(
          429,
          "rate_limited",
          "Tu as déjà envoyé une demande à cette personne aujourd'hui : réessaie demain.",
          {
            retryAfter: 86_400,
          },
        );
      }
      const values = {
        requesterId: me,
        addresseeId: target.userId,
        status: "pending" as const,
        message: opts.message ?? null,
        source: opts.source,
        respondedAt: null,
      };
      let id: string;
      if (outcome.kind === "create") {
        const [created] = await tx.insert(friendships).values(values).returning({ id: friendships.id });
        if (!created) throw new Error("Demande d'ami non enregistrée");
        id = created.id;
      } else {
        const [reopened] = await tx
          .update(friendships)
          .set(values)
          .where(eq(friendships.id, (row as Friendship).id))
          .returning({ id: friendships.id });
        if (!reopened) throw new Error("Demande d'ami non enregistrée");
        id = reopened.id;
      }
      await notificationsService.notify(tx, target.userId, "friend_request", {
        title: "Demande d'ami",
        body: `${viewer.profile.pseudo} veut devenir ton ami.`,
        data: { friendshipId: id, actor: actorOf(viewer.profile), link: `/u/${viewer.profile.pseudo}` },
        link: { label: "Voir son profil", path: `/u/${viewer.profile.pseudo}` },
      });
      after(() => notificationsService.kick());
      after(() => realtime.publish(`user:${target.userId}`, "friend.request", { friendshipId: id }));
      after(() => publishInbox(target.userId));
      return { id, status: "pending" as const };
    }).catch((error) => {
      if (isUniqueViolation(error)) throw conflict("friendship_exists", socialLabels.alreadyRequested);
      throw error;
    });
    return { ...result, pseudo: target.pseudo };
  },

  async requestByPseudo(viewer: Viewer, input: { pseudo: string; message?: string | null; source?: FriendSource }) {
    const target = await profilesRepo.byPseudo(input.pseudo);
    if (!target || target.deletedAt) throw notFound("Profil introuvable");
    return this.request(viewer, target, { message: input.message, source: input.source ?? "profile" });
  },

  /** Lien d'ami `/ami/:token` : le jeton d'invitation du profil de l'autre. */
  async requestByInvite(viewer: Viewer, token: string) {
    const target = await db.query.profiles.findFirst({ where: eq(profiles.inviteToken, token) });
    if (!target || target.deletedAt) throw notFound("Ce lien d'ami n'existe pas ou plus");
    return this.request(viewer, target, { source: "invite_link" });
  },

  /**
   * QR de compte lu par la caméra (`OA1…`) : code valide (fenêtre ±1 minute) et jamais présenté, puis demande d'ami
   * `source = qr`. Les codes refusés sont comptés par lecteur : au-delà de 10 en 10 minutes, il est bloqué.
   */
  async requestByQr(viewer: Viewer, payload: string): Promise<FriendRequestResult> {
    rateLimit("friendQr", viewer.user.id);
    rateAssertBelow("friendQrFailure", viewer.user.id);
    const refuse = (reason: "malformed" | "unknown" | "expired" | "replayed"): never => {
      rateRecord("friendQrFailure", viewer.user.id);
      throw new AppError(
        400,
        "validation_error",
        reason === "malformed" || reason === "unknown"
          ? socialLabels.scanFriendNotAccount
          : socialLabels.scanFriendExpired,
        { reason },
      );
    };
    const decoded = decodeAccountQrPayload(payload);
    if (!decoded) return refuse("malformed");
    const target = await db.query.profiles.findFirst({
      where: eq(profiles.accountQrShortId, Buffer.from(decoded.shortId)),
    });
    if (!target || target.deletedAt || (target.suspendedUntil && target.suspendedUntil > now()))
      return refuse("unknown");
    const t = now();
    const counter = matchAccountQrCounter(target.accountQrSecret, decoded.code, t, hmacSha1);
    if (counter === null) return refuse("expired");
    await db.delete(accountQrUses).where(lt(accountQrUses.usedAt, new Date(t.getTime() - QR_USE_RETENTION_MS)));
    // Sa propre carte : rien n'est consommé.
    if (target.userId === viewer.user.id) throw validation(socialLabels.selfRequest);
    const [use] = await db
      .insert(accountQrUses)
      .values({ userId: target.userId, counter, usedAt: t })
      .onConflictDoNothing()
      .returning();
    if (!use) return refuse("replayed");
    return this.request(viewer, target, { source: "qr" });
  },

  /** Accepter une demande reçue. */
  async acceptRequest(viewer: Viewer, id: string) {
    const requesterRow = await socialRepo.byId(id);
    if (!requesterRow || requesterRow.addresseeId !== viewer.user.id) throw notFound("Demande introuvable");
    const requester = await profilesRepo.byUserId(requesterRow.requesterId);
    if (!requester || requester.deletedAt) throw notFound("Demande introuvable");
    await withTx(async (tx, after) => {
      await lockPair(tx, requesterRow.requesterId, requesterRow.addresseeId);
      const row = await socialRepo.byId(id, tx);
      if (!row || row.addresseeId !== viewer.user.id) throw notFound("Demande introuvable");
      if (row.status !== "pending") throw conflict("conflict", "Cette demande a déjà été traitée");
      await accept(tx, row, viewer);
      after(() => notificationsService.kick());
      after(() => publishInbox(viewer.user.id));
      after(() => realtime.publish(`user:${row.requesterId}`, "friend.accepted", { friendshipId: row.id }));
    });
    return { id, status: "accepted" as const, pseudo: requester.pseudo };
  },

  /** Refuser une demande reçue : le demandeur n'est pas prévenu, il ne pourra redemander qu'après 30 jours. */
  async declineRequest(viewer: Viewer, id: string) {
    await withTx(async (tx, after) => {
      const row = await socialRepo.byId(id, tx);
      if (!row || row.addresseeId !== viewer.user.id) throw notFound("Demande introuvable");
      await lockPair(tx, row.requesterId, row.addresseeId);
      const [updated] = await tx
        .update(friendships)
        .set({ status: "declined", respondedAt: now() })
        .where(and(eq(friendships.id, id), eq(friendships.status, "pending")))
        .returning();
      if (!updated) throw conflict("conflict", "Cette demande a déjà été traitée");
      await closeRequestNotification(tx, viewer.user.id, id);
      after(() => publishInbox(viewer.user.id));
    });
  },

  /**
   * `DELETE /friends/:userId` : retrait d'un ami (la ligne disparaît, aucun délai ensuite), ou retrait d'une demande
   * que j'ai envoyée et qui n'a pas reçu de réponse. Une demande reçue se refuse, un refus se garde 30 jours.
   */
  async remove(viewer: Viewer, otherId: string) {
    await withTx(async (tx, after) => {
      await lockPair(tx, viewer.user.id, otherId);
      const row = await socialRepo.pair(viewer.user.id, otherId, tx);
      // Un refus qui dure encore s'affiche « envoyée » chez le demandeur : « annuler » ne change rien (le délai reste).
      if (row?.status === "declined" && row.requesterId === viewer.user.id && declineCooldownActive(row, now())) return;
      const removable =
        row && (row.status === "accepted" || (row.status === "pending" && row.requesterId === viewer.user.id));
      if (!row || !removable) throw notFound("Cette personne n'est pas dans tes amis");
      await tx.delete(friendships).where(eq(friendships.id, row.id));
      await socialRepo.recountFriends([viewer.user.id, otherId], tx);
      if (row.status === "pending") {
        await closeRequestNotification(tx, otherId, row.id);
        after(() => publishInbox(otherId));
      }
    });
  },

  /** `GET /me/friends` : amis acceptés, hors comptes supprimés et suspendus. */
  async list(viewer: Viewer): Promise<{ items: FriendItem[]; nextCursor: null }> {
    const t = now();
    const rows = await db
      .select({
        userId: profiles.userId,
        pseudo: profiles.pseudo,
        avatarKey: profiles.avatarKey,
        grade: profiles.grade,
        since: friendships.respondedAt,
        createdAt: friendships.createdAt,
      })
      .from(friendships)
      .innerJoin(
        profiles,
        sql`${profiles.userId} = case when ${friendships.requesterId} = ${viewer.user.id} then ${friendships.addresseeId} else ${friendships.requesterId} end`,
      )
      .where(
        and(
          eq(friendships.status, "accepted"),
          or(eq(friendships.requesterId, viewer.user.id), eq(friendships.addresseeId, viewer.user.id)),
          sql`${profiles.deletedAt} is null`,
          sql`(${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${t})`,
        ),
      )
      .orderBy(asc(sql`lower(${profiles.pseudo})`));
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        pseudo: r.pseudo,
        avatarUrl: storage.url(r.avatarKey),
        grade: r.grade,
        since: (r.since ?? r.createdAt).toISOString(),
      })),
      nextCursor: null,
    };
  },

  /** `GET /me/friends/requests?direction=in|out` : demandes en attente. */
  async requests(viewer: Viewer, direction: "in" | "out" | undefined): Promise<{ items: FriendRequestView[] }> {
    const me = viewer.user.id;
    const dirs = direction ? [direction] : (["in", "out"] as const);
    const out: FriendRequestView[] = [];
    for (const dir of dirs) {
      const rows = await db
        .select({
          id: friendships.id,
          message: friendships.message,
          createdAt: friendships.createdAt,
          person: profiles,
        })
        .from(friendships)
        .innerJoin(profiles, eq(profiles.userId, dir === "in" ? friendships.requesterId : friendships.addresseeId))
        .where(
          and(
            dir === "in"
              ? eq(friendships.status, "pending")
              : // Envoyées : en attente, ou refusées depuis moins de 30 jours (le refus est silencieux).
                or(
                  eq(friendships.status, "pending"),
                  and(
                    eq(friendships.status, "declined"),
                    sql`${friendships.respondedAt} > ${new Date(now().getTime() - 30 * 86_400_000)}`,
                  ),
                ),
            eq(dir === "in" ? friendships.addresseeId : friendships.requesterId, me),
            sql`${profiles.deletedAt} is null`,
            sql`(${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${now()})`,
          ),
        )
        .orderBy(sql`${friendships.createdAt} desc`);
      for (const r of rows) {
        out.push({
          id: r.id,
          direction: dir,
          message: r.message,
          createdAt: r.createdAt.toISOString(),
          person: {
            userId: r.person.userId,
            pseudo: r.person.pseudo,
            avatarUrl: storage.url(r.person.avatarKey),
            grade: r.person.grade,
          },
        });
      }
    }
    return { items: out };
  },

  /** `GET /me/inbox/summary` (minimal : le lot 18 le complète des messages et des autres demandes). */
  async inboxSummary(viewer: Viewer) {
    return { requests: { friend: await socialRepo.pendingIncomingCount(viewer.user.id) } };
  },
};
