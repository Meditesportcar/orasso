// Lot R4c (maquettes 10.2, R4.6, R4.6b) : suivre une personne, sans acceptation, et les listes du réseau.
// Règles de vie privée : « Suivre » seulement vers un compte public (un compte privé n'a que « Ajouter en ami ») ;
// suivre ne montre rien de plus que le profil déjà visible ; les listes (abonnés, abonnements, amis) ne sont lisibles que
// par leur titulaire (routes `/me/...` uniquement) ; les autres ne voient que les nombres, aux audiences de `friendsCount`.
// Les comptes supprimés, bannis ou suspendus ne figurent dans aucune liste ni aucun nombre.
import {
  canFollowUser,
  effectiveMainVehicleId,
  FOLLOW_PAGE_SIZE,
  type FollowedPage,
  type FollowersPage,
  type FollowingKind,
  type FollowingPage,
  type FollowPerson,
  type FollowResult,
  followNotificationBody,
  followNotificationTitle,
  type NetworkCounts,
  networkLabels,
  socialLabels,
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";

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
import { AppError, notFound, validation } from "../../lib/errors";
import { decodeCursor, encodeCursor, escapeLike } from "../../lib/pagination";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { type Profile, profilesRepo } from "../profiles/repo";
import { vehicleBriefLabel } from "../vehicles/serializers";
import { socialRepo } from "./repo";

/** Compte qui ne paraît nulle part : supprimé, banni, ou suspendu en ce moment. */
const unavailable = (p: Pick<Profile, "deletedAt" | "bannedAt" | "suspendedUntil">, at: Date) =>
  Boolean(p.deletedAt || p.bannedAt || (p.suspendedUntil && p.suspendedUntil > at));

/** Filtre SQL des profils visibles dans les listes et les nombres. */
const visibleProfile = (at: Date) =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

const pseudoStarts = (q: string | undefined) =>
  q ? sql`lower(${profiles.pseudo}) like ${`${escapeLike(q.toLowerCase())}%`}` : undefined;

const nameContains = (column: SQL | typeof structures.name | typeof proProfiles.name, q: string | undefined) =>
  q ? sql`lower(${column}) like ${`%${escapeLike(q.toLowerCase())}%`}` : undefined;

async function countOf(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? 0;
}

/** Abonnés visibles d'une personne. */
function followersCount(userId: string, at: Date, q?: string) {
  return countOf(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
      .where(and(eq(userFollows.followedId, userId), visibleProfile(at), pseudoStarts(q))),
  );
}

function followingPeopleCount(userId: string, at: Date, q?: string) {
  return countOf(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .innerJoin(profiles, eq(profiles.userId, userFollows.followedId))
      .where(and(eq(userFollows.followerId, userId), visibleProfile(at), pseudoStarts(q))),
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
        vehicleBriefLabel({
          make: { name: main.makeName, isOther: main.makeOther },
          model: { name: main.modelName, isOther: main.modelOther },
        } as Parameters<typeof vehicleBriefLabel>[0]),
      );
    }
  }
  return out;
}

/** Cartes des personnes d'une liste, vues par `viewerId` (ami, déjà suivie, « Suivre aussi » possible). */
async function personCards(viewerId: string, people: Profile[]): Promise<FollowPerson[]> {
  const ids = people.map((p) => p.userId);
  const [labels, friends, mine] = await Promise.all([
    mainVehicleLabels(people),
    socialRepo.friendIds(viewerId),
    ids.length
      ? db
          .select({ id: userFollows.followedId })
          .from(userFollows)
          .where(and(eq(userFollows.followerId, viewerId), inArray(userFollows.followedId, ids)))
      : Promise.resolve([]),
  ]);
  const friendSet = new Set(friends);
  const followed = new Set(mine.map((r) => r.id));
  return people.map((p) => ({
    userId: p.userId,
    pseudo: p.pseudo,
    avatarUrl: storage.url(p.avatarKey),
    grade: p.grade,
    vehicle: labels.get(p.userId) ?? null,
    friend: friendSet.has(p.userId),
    following: followed.has(p.userId),
    canFollow: canFollowUser({ isSelf: p.userId === viewerId, visibility: p.visibility }),
  }));
}

/** Page de personnes reliées par `user_follows` (abonnés : `side = followed` ; abonnements : `side = follower`). */
async function peoplePage(
  viewer: Viewer,
  side: "followers" | "following",
  q: string | undefined,
  cursor: string | undefined,
) {
  const at = now();
  const me = viewer.user.id;
  const other = side === "followers" ? userFollows.followerId : userFollows.followedId;
  const mineCol = side === "followers" ? userFollows.followedId : userFollows.followerId;
  const c = decodeCursor(cursor);
  const rows = await db
    .select({ profile: profiles, createdAt: userFollows.createdAt })
    .from(userFollows)
    .innerJoin(profiles, eq(profiles.userId, other))
    .where(
      and(
        eq(mineCol, me),
        visibleProfile(at),
        pseudoStarts(q),
        c
          ? or(lt(userFollows.createdAt, c.createdAt), and(eq(userFollows.createdAt, c.createdAt), lt(other, c.id)))
          : undefined,
      ),
    )
    .orderBy(desc(userFollows.createdAt), desc(other))
    .limit(FOLLOW_PAGE_SIZE + 1);
  const page = rows.slice(0, FOLLOW_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: await personCards(
      me,
      page.map((r) => r.profile),
    ),
    nextCursor: rows.length > FOLLOW_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.profile.userId) : null,
    total: side === "followers" ? await followersCount(me, at, q) : await followingPeopleCount(me, at, q),
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
          c
            ? or(
                lt(structureFollows.createdAt, c.createdAt),
                and(eq(structureFollows.createdAt, c.createdAt), lt(structures.id, c.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(structureFollows.createdAt), desc(structures.id))
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
        c
          ? or(
              lt(proFollows.createdAt, c.createdAt),
              and(eq(proFollows.createdAt, c.createdAt), lt(proProfiles.id, c.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(proFollows.createdAt), desc(proProfiles.id))
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

/**
 * « Kenji_66 te suit », regroupée : une notification non lue des dernières 24 h est complétée (« … et 2 autres
 * personnes te suivent ») au lieu d'en créer une nouvelle ; au plus une alerte par paire et par 24 h (suivre, ne plus
 * suivre, suivre). Préférences (famille `social`, type coupable) et heures calmes : celles de `notificationsService`.
 */
async function notifyFollow(tx: Tx, follower: Profile, targetId: string): Promise<boolean> {
  // Tour 2 : deux suivis simultanés vers la même personne ne créent pas deux notifications (lecture puis écriture
  // sérialisées par destinataire).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`user-followed:${targetId}`}))`);
  const window = sql`${notifications.createdAt} > now() - interval '24 hours'`;
  const [recent] = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, targetId),
        eq(notifications.type, "user_followed"),
        sql`${notifications.data} -> 'actorIds' @> jsonb_build_array(${follower.userId}::text)`,
        window,
      ),
    )
    .limit(1);
  if (recent) return false;
  const actor = { userId: follower.userId, pseudo: follower.pseudo, avatarUrl: storage.url(follower.avatarKey) };
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

export const followsService = {
  /** `POST /users/:pseudo/follow` : idempotent ; refusé vers un compte privé, soi-même ou un compte indisponible. */
  async follow(viewer: Viewer, pseudo: string): Promise<FollowResult> {
    const target = await profilesRepo.byPseudo(pseudo);
    const at = now();
    if (!target || unavailable(target, at)) throw notFound("Profil introuvable");
    if (target.userId === viewer.user.id) throw validation(socialLabels.selfRequest);
    if (!canFollowUser({ isSelf: false, visibility: target.visibility })) {
      throw new AppError(403, "forbidden", "Ce compte est privé : on le suit en devenant ami.", { private: true });
    }
    rateLimit("userFollow", viewer.user.id);
    await withTx(async (tx, after) => {
      const [created] = await tx
        .insert(userFollows)
        .values({ followerId: viewer.user.id, followedId: target.userId })
        .onConflictDoNothing()
        .returning({ id: userFollows.followedId });
      if (created && (await notifyFollow(tx, viewer.profile, target.userId))) {
        after(() => notificationsService.kick());
      }
    });
    return { following: true };
  },

  /** `DELETE /users/:pseudo/follow` : toujours possible (même si le compte est devenu privé entre-temps). */
  async unfollow(viewer: Viewer, pseudo: string): Promise<FollowResult> {
    const target = await profilesRepo.byPseudo(pseudo);
    // Tour 2 : un compte supprimé, banni ou suspendu répond comme un pseudo inconnu ; un compte devenu privé se quitte.
    if (!target || unavailable(target, now())) throw notFound("Profil introuvable");
    rateLimit("userFollow", viewer.user.id);
    await db
      .delete(userFollows)
      .where(and(eq(userFollows.followerId, viewer.user.id), eq(userFollows.followedId, target.userId)));
    return { following: false };
  },

  /** Je suis cette personne. */
  async isFollowing(viewerId: string, targetId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: userFollows.followedId })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, viewerId), eq(userFollows.followedId, targetId)))
      .limit(1);
    return Boolean(row);
  },

  /** Les deux nombres d'un profil : abonnés, abonnements (personnes + organisateurs + pros). */
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

  /** `GET /me/network` : les trois compteurs de l'en-tête du profil. */
  async network(viewer: Viewer): Promise<NetworkCounts> {
    const me = viewer.user.id;
    const at = now();
    const [followers, people, structuresN, pros, requests] = await Promise.all([
      followersCount(me, at),
      followingPeopleCount(me, at),
      followingStructuresCount(me),
      followingProsCount(me),
      socialRepo.pendingIncomingCount(me),
    ]);
    return {
      followers,
      following: people + structuresN + pros,
      // Tour 2 : comptés à la lecture, sans les comptes suspendus ou bannis (comme la liste).
      friends: await socialRepo.visibleFriendsCount(me),
      followingBy: { people, structures: structuresN, pros },
      friendRequestsIn: requests,
    };
  },

  /** `GET /me/followers` : mes abonnés (moi seul), 30 par page, recherche par début de pseudo. */
  followers(viewer: Viewer, q?: string, cursor?: string): Promise<FollowersPage> {
    return peoplePage(viewer, "followers", q, cursor);
  },

  /** `GET /me/following?kind=` : mes abonnements, en trois groupes (personnes, organisateurs, pros). */
  async following(viewer: Viewer, kind: FollowingKind, q?: string, cursor?: string): Promise<FollowingPage> {
    if (kind === "people") return { kind, ...(await peoplePage(viewer, "following", q, cursor)) };
    return { kind, ...(await pagesPage(viewer, kind, q, cursor)) };
  },

  /**
   * Compte supprimé (anonymisé) : ses suivis disparaissent dans les deux sens ; renvoie les personnes qu'il suivait (leurs
   * alertes « … te suit » qui le citent sont retirées par l'appelant).
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
