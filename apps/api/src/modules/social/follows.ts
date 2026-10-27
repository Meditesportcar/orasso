// Lot R4c (maquettes 10.2, R4.6, R4.6b), lot R6b (D37, maquettes R6.1 et R6.2) : suivre une personne, comme sur
// Instagram. Compte public : abonnement accepté d'un toucher, notification « X te suit » (regroupée). Compte privé :
// demande (`pending`), notification « X demande à te suivre » ; la personne accepte (« X a accepté ta demande ») ou
// refuse sans prévenir (la ligne disparaît). L'abonné accepté voit ce que voyait l'ami (profil complet d'un compte privé,
// Journal, messagerie directe vers lui). Un compte qui passe de privé à public accepte toutes ses demandes en attente.
// Les listes (abonnés, abonnements, demandes) ne sont lisibles que par leur titulaire (routes `/me/...` uniquement) ;
// les autres ne voient que les nombres. Les comptes supprimés, bannis ou suspendus ne figurent dans aucune liste ni
// aucun nombre, et une action vers eux répond comme pour un compte inconnu (404).
import {
  canFollowUser,
  effectiveMainVehicleId,
  FOLLOW_PAGE_SIZE,
  followAcceptedNotificationBody,
  followAcceptedNotificationTitle,
  type FollowedPage,
  type FollowersPage,
  type FollowingKind,
  type FollowingPage,
  type FollowPerson,
  type FollowRelation,
  type FollowRequestsPage,
  type FollowResult,
  type FollowState,
  followNotificationBody,
  followNotificationTitle,
  followRequestNotificationBody,
  followRequestNotificationTitle,
  followStatusFor,
  type NetworkCounts,
  networkLabels,
  socialLabels,
} from "@orasso/shared";
import { type AnyColumn, and, asc, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  notifications,
  proFollows,
  profiles,
  proProfiles,
  structureFollows,
  structures,
  userFollows,
  vehicleMakes,
  vehicleModels,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound, validation } from "../../lib/errors";
import { decodeCursor, encodeCursor, escapeLike } from "../../lib/pagination";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { inboxService, registerInboxCounter } from "../messaging/inbox";
import { notificationsService } from "../notifications/service";
import { type Profile, profilesRepo } from "../profiles/repo";
import { vehicleBriefLabel } from "../vehicles/serializers";

/** Compte qui ne paraît nulle part : supprimé, banni, ou suspendu en ce moment. */
const unavailable = (p: Pick<Profile, "deletedAt" | "bannedAt" | "suspendedUntil">, at: Date) =>
  Boolean(p.deletedAt || p.bannedAt || (p.suspendedUntil && p.suspendedUntil > at));

/** Filtre SQL des profils visibles dans les listes et les nombres. */
const visibleProfile = (at: Date) =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

const accepted = eq(userFollows.status, "accepted");

const pseudoStarts = (q: string | undefined) =>
  q ? sql`lower(${profiles.pseudo}) like ${`${escapeLike(q.toLowerCase())}%`}` : undefined;

const nameContains = (column: SQL | typeof structures.name | typeof proProfiles.name, q: string | undefined) =>
  q ? sql`lower(${column}) like ${`%${escapeLike(q.toLowerCase())}%`}` : undefined;

/**
 * Tour 2 : rang strictement après le curseur (date décroissante, puis identifiant). Le curseur porte la date à la
 * milliseconde ; la base la garde à la microseconde : la comparaison se fait à la milliseconde, sinon des lignes de la
 * même milliseconde (suivis posés ensemble) disparaîtraient entre deux pages.
 */
function beyondCursor(at: SQL | AnyColumn, id: SQL | AnyColumn, c: { createdAt: Date; id: string }) {
  const ms = sql`date_trunc('milliseconds', ${at})`;
  return or(sql`${ms} < ${c.createdAt}`, and(sql`${ms} = ${c.createdAt}`, sql`${id} < ${c.id}`));
}

/** Tri qui va avec `beyondCursor` : date à la milliseconde décroissante, puis identifiant décroissant. */
const newestFirst = (at: SQL | AnyColumn, id: SQL | AnyColumn) => [
  desc(sql`date_trunc('milliseconds', ${at})`),
  desc(id),
];

async function countOf(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? 0;
}

/** Abonnés acceptés visibles d'une personne. */
function followersCount(userId: string, at: Date, q?: string) {
  return countOf(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
      .where(and(eq(userFollows.followedId, userId), accepted, visibleProfile(at), pseudoStarts(q))),
  );
}

function followingPeopleCount(userId: string, at: Date, q?: string) {
  return countOf(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .innerJoin(profiles, eq(profiles.userId, userFollows.followedId))
      .where(and(eq(userFollows.followerId, userId), accepted, visibleProfile(at), pseudoStarts(q))),
  );
}

/** Demandes reçues en attente, d'auteurs visibles. */
function requestsCount(userId: string, at: Date, q?: string, ex: Executor = db) {
  return countOf(
    ex
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
      .where(
        and(
          eq(userFollows.followedId, userId),
          eq(userFollows.status, "pending"),
          visibleProfile(at),
          pseudoStarts(q),
        ),
      ),
  );
}

function followingStructuresCount(userId: string, q?: string) {
  return countOf(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(structureFollows)
      .innerJoin(structures, eq(structures.id, structureFollows.structureId))
      .where(and(eq(structureFollows.userId, userId), isNull(structures.deletedAt), nameContains(structures.name, q))),
  );
}

function followingProsCount(userId: string, q?: string) {
  return countOf(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(proFollows)
      .innerJoin(proProfiles, eq(proProfiles.id, proFollows.proId))
      .where(and(eq(proFollows.userId, userId), isNull(proProfiles.deletedAt), nameContains(proProfiles.name, q))),
  );
}

/** Marque et modèle du véhicule principal de chacune de ces personnes (jamais la plaque, jamais l'année). */
async function mainVehicleLabels(people: Pick<Profile, "userId" | "mainVehicleId">[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!people.length) return out;
  const rows = await db
    .select({
      id: vehicles.id,
      ownerId: vehicles.ownerId,
      status: vehicles.status,
      makeName: vehicleMakes.name,
      makeOther: vehicleMakes.isOther,
      modelName: vehicleModels.name,
      modelOther: vehicleModels.isOther,
      proposedMake: vehicles.proposedMake,
      proposedModel: vehicles.proposedModel,
      version: vehicles.version,
    })
    .from(vehicles)
    .innerJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .where(
      and(
        inArray(
          vehicles.ownerId,
          people.map((p) => p.userId),
        ),
        eq(vehicles.status, "active"),
      ),
    )
    .orderBy(asc(vehicles.createdAt));
  for (const p of people) {
    const mine = rows.filter((r) => r.ownerId === p.userId);
    const main = mine.find((r) => r.id === effectiveMainVehicleId(mine, p.mainVehicleId));
    if (main) {
      out.set(
        p.userId,
        // Vague R4 : le nom tapé (lot R4a) quand la marque ou le modèle vaut « Autre ».
        vehicleBriefLabel({
          make: { name: main.makeName, isOther: main.makeOther },
          model: { name: main.modelName, isOther: main.modelOther },
          proposedMake: main.proposedMake,
          proposedModel: main.proposedModel,
          version: main.version,
        } as Parameters<typeof vehicleBriefLabel>[0]),
      );
    }
  }
  return out;
}

/** Mes liens avec chacune de ces personnes : mon abonnement vers elle, et si elle me suit (accepté). */
async function relationsWith(viewerId: string, ids: string[], ex: Executor = db): Promise<Map<string, FollowRelation>> {
  const out = new Map<string, FollowRelation>(ids.map((id) => [id, { mine: "none", followsMe: false }]));
  if (!ids.length) return out;
  const rows = await ex
    .select({ follower: userFollows.followerId, followed: userFollows.followedId, status: userFollows.status })
    .from(userFollows)
    .where(
      or(
        and(eq(userFollows.followerId, viewerId), inArray(userFollows.followedId, ids)),
        and(eq(userFollows.followedId, viewerId), inArray(userFollows.followerId, ids), accepted),
      ),
    );
  for (const r of rows) {
    if (r.follower === viewerId) {
      const cur = out.get(r.followed);
      if (cur) cur.mine = r.status;
    } else {
      const cur = out.get(r.follower);
      if (cur) cur.followsMe = true;
    }
  }
  return out;
}

/** Cartes des personnes d'une liste, vues par `viewerId` (« Te suit », « Abonné », « Suivre en retour »). */
async function personCards(viewerId: string, people: Profile[]): Promise<FollowPerson[]> {
  const [labels, relations] = await Promise.all([
    mainVehicleLabels(people),
    relationsWith(
      viewerId,
      people.map((p) => p.userId),
    ),
  ]);
  return people.map((p) => ({
    userId: p.userId,
    pseudo: p.pseudo,
    avatarUrl: storage.url(p.avatarKey),
    grade: p.grade,
    vehicle: labels.get(p.userId) ?? null,
    mine: relations.get(p.userId)?.mine ?? "none",
    followsMe: relations.get(p.userId)?.followsMe ?? false,
    canFollow: canFollowUser({ isSelf: p.userId === viewerId }),
    visibility: p.visibility,
  }));
}

/**
 * Page de personnes reliées par `user_follows` : mes abonnés acceptés (`followers`), mes abonnements acceptés
 * (`following`), ou les demandes reçues en attente (`requests`).
 */
async function peoplePage(
  viewer: Viewer,
  side: "followers" | "following" | "requests",
  q: string | undefined,
  cursor: string | undefined,
) {
  const at = now();
  const me = viewer.user.id;
  const other = side === "following" ? userFollows.followedId : userFollows.followerId;
  const mineCol = side === "following" ? userFollows.followerId : userFollows.followedId;
  const status = side === "requests" ? eq(userFollows.status, "pending") : accepted;
  // Abonnés et abonnements : rangés par date d'acceptation (une demande acceptée hier passe devant) ; demandes : par
  // date de la demande.
  const at0 = side === "requests" ? userFollows.createdAt : sql`coalesce(${userFollows.acceptedAt}, ${userFollows.createdAt})`;
  const c = decodeCursor(cursor);
  const rows = await db
    .select({ profile: profiles, createdAt: sql<Date>`${at0}`.mapWith(userFollows.createdAt) })
    .from(userFollows)
    .innerJoin(profiles, eq(profiles.userId, other))
    .where(
      and(eq(mineCol, me), status, visibleProfile(at), pseudoStarts(q), c ? beyondCursor(at0, other, c) : undefined),
    )
    .orderBy(...newestFirst(at0, other))
    .limit(FOLLOW_PAGE_SIZE + 1);
  const page = rows.slice(0, FOLLOW_PAGE_SIZE);
  const last = page.at(-1);
  const total =
    side === "followers"
      ? await followersCount(me, at, q)
      : side === "following"
        ? await followingPeopleCount(me, at, q)
        : await requestsCount(me, at, q);
  return {
    items: await personCards(
      me,
      page.map((r) => r.profile),
    ),
    nextCursor: rows.length > FOLLOW_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.profile.userId) : null,
    total,
  };
}

/** Organisateurs ou pros suivis (onglet Abonnements). */
async function pagesPage(
  viewer: Viewer,
  kind: "structures" | "pros",
  q: string | undefined,
  cursor: string | undefined,
): Promise<{ items: FollowedPage[]; nextCursor: string | null; total: number }> {
  const me = viewer.user.id;
  const c = decodeCursor(cursor);
  if (kind === "structures") {
    const rows = await db
      .select({ s: structures, createdAt: structureFollows.createdAt })
      .from(structureFollows)
      .innerJoin(structures, eq(structures.id, structureFollows.structureId))
      .where(
        and(
          eq(structureFollows.userId, me),
          isNull(structures.deletedAt),
          nameContains(structures.name, q),
          c ? beyondCursor(structureFollows.createdAt, structures.id, c) : undefined,
        ),
      )
      .orderBy(...newestFirst(structureFollows.createdAt, structures.id))
      .limit(FOLLOW_PAGE_SIZE + 1);
    const page = rows.slice(0, FOLLOW_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map(({ s }) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        logoUrl: storage.url(s.logoKey),
        caption: [networkLabels.structureCaption, s.city].filter(Boolean).join(" · "),
      })),
      nextCursor: rows.length > FOLLOW_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.s.id) : null,
      total: await followingStructuresCount(me, q),
    };
  }
  const rows = await db
    .select({ p: proProfiles, createdAt: proFollows.createdAt })
    .from(proFollows)
    .innerJoin(proProfiles, eq(proProfiles.id, proFollows.proId))
    .where(
      and(
        eq(proFollows.userId, me),
        isNull(proProfiles.deletedAt),
        nameContains(proProfiles.name, q),
        c ? beyondCursor(proFollows.createdAt, proProfiles.id, c) : undefined,
      ),
    )
    .orderBy(...newestFirst(proFollows.createdAt, proProfiles.id))
    .limit(FOLLOW_PAGE_SIZE + 1);
  const page = rows.slice(0, FOLLOW_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map(({ p }) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      logoUrl: storage.url(p.logoKey),
      caption: [networkLabels.proCaption, p.city].filter(Boolean).join(" · "),
    })),
    nextCursor: rows.length > FOLLOW_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.p.id) : null,
    total: await followingProsCount(me, q),
  };
}

const actorOf = (p: Pick<Profile, "userId" | "pseudo" | "avatarKey">) => ({
  userId: p.userId,
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
});

/** Une alerte de ce type, de cette personne, vers cette cible, dans les dernières 24 h ? */
async function notifiedRecently(tx: Tx, type: string, actorId: string, targetId: string, actorPath: "actorIds" | "actor") {
  const who =
    actorPath === "actorIds"
      ? sql`${notifications.data} -> 'actorIds' @> jsonb_build_array(${actorId}::text)`
      : sql`${notifications.data} -> 'actor' ->> 'userId' = ${actorId}`;
  const [recent] = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, targetId),
        eq(notifications.type, type),
        who,
        sql`${notifications.createdAt} > now() - interval '24 hours'`,
      ),
    )
    .limit(1);
  return Boolean(recent);
}

/**
 * « Kenji_66 te suit », regroupée : une notification non lue des dernières 24 h est complétée (« … et 2 autres
 * personnes te suivent ») au lieu d'en créer une nouvelle ; au plus une alerte par paire et par 24 h (suivre, ne plus
 * suivre, suivre). Préférences (famille `social`, type coupable) et heures calmes : celles de `notificationsService`.
 */
async function notifyFollow(tx: Tx, follower: Profile, targetId: string): Promise<boolean> {
  // Tour 2 : deux suivis simultanés vers la même personne ne créent pas deux notifications (lecture puis écriture
  // sérialisées par destinataire).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`user-followed:${targetId}`}))`);
  if (await notifiedRecently(tx, "user_followed", follower.userId, targetId, "actorIds")) return false;
  const window = sql`${notifications.createdAt} > now() - interval '24 hours'`;
  const actor = actorOf(follower);
  const [open] = await tx
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, targetId),
        eq(notifications.type, "user_followed"),
        isNull(notifications.readAt),
        window,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1)
    .for("update");
  if (open) {
    const data = open.data as { actorIds?: string[]; pseudos?: string[] };
    const actorIds = [follower.userId, ...(data.actorIds ?? [])];
    const pseudos = [follower.pseudo, ...(data.pseudos ?? [])].slice(0, 2);
    await tx
      .update(notifications)
      .set({
        body: followNotificationBody(pseudos, actorIds.length),
        data: { ...open.data, actor, actorIds, pseudos, link: "/app/reseau", linkLabel: "Voir mes abonnés" },
      })
      .where(eq(notifications.id, open.id));
    return true;
  }
  await notificationsService.notify(tx, targetId, "user_followed", {
    title: followNotificationTitle,
    body: followNotificationBody([follower.pseudo], 1),
    data: { actor, actorIds: [follower.userId], pseudos: [follower.pseudo] },
    link: { label: "Voir son profil", path: `/u/${follower.pseudo}` },
  });
  return true;
}

/** Lot R6b : « Kenji_66 demande à te suivre », au plus une alerte par paire et par 24 h (demander, annuler, demander). */
async function notifyFollowRequest(tx: Tx, follower: Profile, targetId: string): Promise<boolean> {
  if (await notifiedRecently(tx, "follow_request", follower.userId, targetId, "actor")) return false;
  await notificationsService.notify(tx, targetId, "follow_request", {
    title: followRequestNotificationTitle,
    body: followRequestNotificationBody(follower.pseudo),
    data: { actor: actorOf(follower), link: "/app/reseau?liste=demandes" },
    link: { label: "Voir les demandes", path: "/app/reseau?liste=demandes" },
  });
  return true;
}

/** Une demande traitée (acceptée, refusée, annulée, acceptée en passant public) : son alerte n'a plus à rester non lue. */
async function closeRequestNotifications(tx: Tx, targetId: string, followerIds?: string[]) {
  await tx
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.userId, targetId),
        eq(notifications.type, "follow_request"),
        isNull(notifications.readAt),
        followerIds
          ? inArray(sql<string>`${notifications.data} -> 'actor' ->> 'userId'`, followerIds)
          : undefined,
      ),
    );
}

async function targetOf(pseudo: string): Promise<Profile> {
  const target = await profilesRepo.byPseudo(pseudo);
  if (!target || unavailable(target, now())) throw notFound("Profil introuvable");
  return target;
}

export const followsService = {
  /**
   * `POST /users/:pseudo/follow` (et le QR de compte, le lien de profil) : idempotent. Compte public : abonnement
   * accepté et « X te suit » ; compte privé : demande et « X demande à te suivre ». Le statut se décide sous le verrou de
   * la ligne du profil suivi : un passage de privé à public en même temps accepte la demande (pas de demande orpheline
   * vers un compte public).
   */
  async followProfile(viewer: Viewer, target: Profile): Promise<FollowResult> {
    if (unavailable(target, now())) throw notFound("Profil introuvable");
    if (target.userId === viewer.user.id) throw validation(socialLabels.selfRequest);
    rateLimit("userFollow", viewer.user.id);
    const mine = await withTx(async (tx, after) => {
      const [locked] = await tx
        .select({ visibility: profiles.visibility })
        .from(profiles)
        .where(eq(profiles.userId, target.userId))
        .for("share");
      if (!locked) throw notFound("Profil introuvable");
      const status = followStatusFor(locked.visibility);
      const t = now();
      const [created] = await tx
        .insert(userFollows)
        .values({
          followerId: viewer.user.id,
          followedId: target.userId,
          status,
          createdAt: t,
          acceptedAt: status === "accepted" ? t : null,
        })
        .onConflictDoNothing()
        .returning({ status: userFollows.status });
      if (!created) {
        const [existing] = await tx
          .select({ status: userFollows.status })
          .from(userFollows)
          .where(and(eq(userFollows.followerId, viewer.user.id), eq(userFollows.followedId, target.userId)));
        return (existing?.status ?? status) as FollowState;
      }
      const notified =
        status === "accepted"
          ? await notifyFollow(tx, viewer.profile, target.userId)
          : await notifyFollowRequest(tx, viewer.profile, target.userId);
      if (notified) after(() => notificationsService.kick());
      if (status === "pending") after(() => inboxService.publish(target.userId));
      return status as FollowState;
    });
    return { mine };
  },

  async follow(viewer: Viewer, pseudo: string): Promise<FollowResult> {
    return this.followProfile(viewer, await targetOf(pseudo));
  },

  /**
   * `DELETE /users/:pseudo/follow` : ne plus suivre, ou annuler une demande envoyée (« Demandé »). Toujours possible ;
   * une demande annulée retire son alerte chez la personne.
   */
  async unfollow(viewer: Viewer, pseudo: string): Promise<FollowResult> {
    const target = await targetOf(pseudo);
    rateLimit("userFollow", viewer.user.id);
    await withTx(async (tx, after) => {
      const [removed] = await tx
        .delete(userFollows)
        .where(and(eq(userFollows.followerId, viewer.user.id), eq(userFollows.followedId, target.userId)))
        .returning({ status: userFollows.status });
      if (removed?.status === "pending") {
        await tx
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, target.userId),
              eq(notifications.type, "follow_request"),
              sql`${notifications.data} -> 'actor' ->> 'userId' = ${viewer.user.id}`,
            ),
          );
        after(() => inboxService.publish(target.userId));
      }
    });
    return { mine: "none" };
  },

  /** `POST /me/follow-requests/:userId/accept` : la personne me suit ; elle est prévenue (« X a accepté ta demande »). */
  async acceptRequest(viewer: Viewer, followerId: string): Promise<FollowPerson> {
    const me = viewer.user.id;
    const follower = await profilesRepo.byUserId(followerId);
    if (!follower || unavailable(follower, now())) throw notFound("Demande introuvable");
    await withTx(async (tx, after) => {
      const [row] = await tx
        .update(userFollows)
        .set({ status: "accepted", acceptedAt: now() })
        .where(
          and(
            eq(userFollows.followerId, followerId),
            eq(userFollows.followedId, me),
            eq(userFollows.status, "pending"),
          ),
        )
        .returning({ id: userFollows.followerId });
      if (!row) throw notFound("Demande introuvable");
      await closeRequestNotifications(tx, me, [followerId]);
      await notificationsService.notify(tx, followerId, "follow_accepted", {
        title: followAcceptedNotificationTitle,
        body: followAcceptedNotificationBody(viewer.profile.pseudo),
        data: { actor: actorOf(viewer.profile), link: `/u/${viewer.profile.pseudo}` },
        link: { label: "Voir son profil", path: `/u/${viewer.profile.pseudo}` },
      });
      after(() => notificationsService.kick());
      after(() => inboxService.publish(me));
    });
    const [card] = await personCards(me, [follower]);
    if (!card) throw notFound("Demande introuvable");
    return card;
  },

  /** `POST /me/follow-requests/:userId/decline` : la demande disparaît, sans prévenir la personne. */
  async declineRequest(viewer: Viewer, followerId: string): Promise<void> {
    const me = viewer.user.id;
    await withTx(async (tx, after) => {
      const [row] = await tx
        .delete(userFollows)
        .where(
          and(
            eq(userFollows.followerId, followerId),
            eq(userFollows.followedId, me),
            eq(userFollows.status, "pending"),
          ),
        )
        .returning({ id: userFollows.followerId });
      if (!row) throw notFound("Demande introuvable");
      await closeRequestNotifications(tx, me, [followerId]);
      after(() => inboxService.publish(me));
    });
  },

  /**
   * Un compte qui passe de privé à public accepte toutes ses demandes en attente (dans la transaction du changement de
   * réglage, après la mise à jour de la ligne du profil). Sans notification une à une : chacun voit « Abonné » à sa
   * prochaine visite.
   */
  async acceptAllPending(tx: Tx, userId: string): Promise<number> {
    const rows = await tx
      .update(userFollows)
      .set({ status: "accepted", acceptedAt: now() })
      .where(and(eq(userFollows.followedId, userId), eq(userFollows.status, "pending")))
      .returning({ id: userFollows.followerId });
    if (rows.length) await closeRequestNotifications(tx, userId);
    return rows.length;
  },

  /** Mon lien avec cette personne : mon abonnement vers elle, et si elle me suit (accepté). */
  async relation(viewerId: string, targetId: string, ex: Executor = db): Promise<FollowRelation> {
    return (await relationsWith(viewerId, [targetId], ex)).get(targetId) ?? { mine: "none", followsMe: false };
  },

  relationsWith,

  /** `followerId` suit `followedId`, abonnement accepté. */
  async isAcceptedFollower(followerId: string, followedId: string, ex: Executor = db): Promise<boolean> {
    const [row] = await ex
      .select({ id: userFollows.followerId })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followedId, followedId), accepted))
      .limit(1);
    return Boolean(row);
  },

  /** Abonnés acceptés d'une personne (identifiants ; le Journal les prévient). */
  async followerIds(userId: string, ex: Executor = db): Promise<string[]> {
    const rows = await ex
      .select({ id: userFollows.followerId })
      .from(userFollows)
      .where(and(eq(userFollows.followedId, userId), accepted));
    return rows.map((r) => r.id);
  },

  /** Personnes que suit une personne, abonnement accepté (identifiants). */
  async followingIds(userId: string, ex: Executor = db): Promise<string[]> {
    const rows = await ex
      .select({ id: userFollows.followedId })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, userId), accepted));
    return rows.map((r) => r.id);
  },

  /** Les deux nombres d'un profil : abonnés acceptés, abonnements acceptés (personnes + organisateurs + pros). */
  async countsOf(userId: string): Promise<{ followers: number; following: number }> {
    const at = now();
    const [followers, people, structuresN, pros] = await Promise.all([
      followersCount(userId, at),
      followingPeopleCount(userId, at),
      followingStructuresCount(userId),
      followingProsCount(userId),
    ]);
    return { followers, following: people + structuresN + pros };
  },

  /** Demandes reçues en attente (pastille de la Boîte, onglet Demandes). */
  pendingIncomingCount(userId: string, ex: Executor = db): Promise<number> {
    return requestsCount(userId, now(), undefined, ex);
  },

  /** `GET /me/network` : les nombres de l'onglet Profil et les demandes en attente. */
  async network(viewer: Viewer, outings: number): Promise<NetworkCounts> {
    const me = viewer.user.id;
    const at = now();
    const [followers, people, structuresN, pros, requests] = await Promise.all([
      followersCount(me, at),
      followingPeopleCount(me, at),
      followingStructuresCount(me),
      followingProsCount(me),
      requestsCount(me, at),
    ]);
    return {
      followers,
      following: people + structuresN + pros,
      followingBy: { people, structures: structuresN, pros },
      outings,
      requestsIn: requests,
      private: viewer.profile.visibility === "private",
    };
  },

  /** `GET /me/followers` : mes abonnés acceptés (moi seul), 30 par page, recherche par début de pseudo. */
  followers(viewer: Viewer, q?: string, cursor?: string): Promise<FollowersPage> {
    return peoplePage(viewer, "followers", q, cursor);
  },

  /** `GET /me/following?kind=` : mes abonnements acceptés, en trois groupes (personnes, organisateurs, pros). */
  async following(viewer: Viewer, kind: FollowingKind, q?: string, cursor?: string): Promise<FollowingPage> {
    if (kind === "people") return { kind, ...(await peoplePage(viewer, "following", q, cursor)) };
    return { kind, ...(await pagesPage(viewer, kind, q, cursor)) };
  },

  /** `GET /me/follow-requests` : demandes reçues en attente (moi seul), les plus récentes d'abord. */
  requests(viewer: Viewer, q?: string, cursor?: string): Promise<FollowRequestsPage> {
    return peoplePage(viewer, "requests", q, cursor);
  },

  /**
   * Compte supprimé (anonymisé) : ses abonnements et demandes disparaissent dans les deux sens ; renvoie les personnes
   * qu'il suivait (leurs alertes « … te suit » qui le citent sont retirées par l'appelant).
   */
  async removeAllFor(userId: string, tx: Tx): Promise<string[]> {
    const followed = await tx
      .select({ id: userFollows.followedId })
      .from(userFollows)
      .where(eq(userFollows.followerId, userId));
    await tx.delete(userFollows).where(or(eq(userFollows.followerId, userId), eq(userFollows.followedId, userId)));
    return followed.map((r) => r.id);
  },
};

// Lot R6b : les demandes d'abonnement reçues comptent dans la pastille de la Boîte (clé `follow`).
registerInboxCounter("follow", (userId, ex) => followsService.pendingIncomingCount(userId, ex));
