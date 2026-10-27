// Fil d'un crew (lot R5c1, maquettes R5.7 et R5.10, D36) : publications (photos, texte, sondage), flamme,
// commentaires, sondages, événements automatiques. Réservé aux membres actifs (`requireCrewMember`, 404 sinon).
//
// Verrous, dans cet ordre : la ligne du crew (`FOR SHARE`, ordonnée avec les départs), puis la publication ou le
// sondage (`FOR UPDATE`), puis le reste. Les photos sont des envois `crew_post` privés, rattachés une seule fois par
// leur auteur ; retirées, elles sont effacées tout de suite (lignes puis fichiers, après la validation).
import {
  CREW_COMMENTS_PAGE,
  CREW_FEED_PAGE,
  type CrewCommentView,
  type CrewFeedItem,
  type CrewFeedPage,
  type CrewFireState,
  type CrewPostCreate,
  type CrewPostOptions,
  type CrewPostView,
  canRemoveCrewContent,
  crewErrors,
  crewPollOpen,
  type Page,
  pollEndsAtValid,
} from "@orasso/shared";
import { and, asc, eq, gte, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import {
  applications,
  crewMembers,
  crewPollOptions,
  crewPolls,
  crewPollVotes,
  crewPostComments,
  crewPostPhotos,
  crewPostReactions,
  crewPosts,
  crews,
  events,
  notifications,
  profiles,
  uploads,
  vehicles,
} from "../../../db/schema";
import { now } from "../../../lib/deps";
import { forbidden, notFound, validation } from "../../../lib/errors";
import { decodeCursor, encodeCursor } from "../../../lib/pagination";
import { rateLimit } from "../../../lib/rateLimit";
import type { Viewer } from "../../../lib/session";
import { storage } from "../../../lib/storage";
import { type Tx, withTx } from "../../../lib/tx";
import { canSeeEvent } from "../../invitations/access";
import { notificationsService, registerDeliveryGuard } from "../../notifications/service";
import { uploadsService } from "../../uploads/service";
import { vehicleLabel } from "../../vehicles/serializers";
import { signalCrew } from "../live";
import {
  type FeedAccess,
  isUuid,
  raceToConflict,
  requireCrewMember,
  requireOwnContentAccess,
  visibleProfile,
} from "./access";
import { CREW_POST_FOLDER, loadPostViews, personOf } from "./posts";
import { decodeFeedCursor, encodeFeedCursor, feedSources, readFeedRows } from "./sources";

const crewPath = (slug: string) => `/c/${slug}`;
const postGone = () => notFound("Publication introuvable");
const commentGone = () => notFound("Commentaire introuvable");

/**
 * Publication du crew, non retirée, verrouillée pour l'écriture. Son auteur doit être visible (ni supprimé ni
 * suspendu), sauf `anyAuthor` (tour 2 : le chef retire aussi la publication d'un auteur suspendu).
 */
async function lockPost(tx: Tx, crewId: string, postId: string, anyAuthor = false) {
  if (!isUuid(postId)) throw postGone();
  const [post] = await tx
    .select()
    .from(crewPosts)
    .where(and(eq(crewPosts.id, postId), eq(crewPosts.crewId, crewId), isNull(crewPosts.deletedAt)))
    .for("update");
  if (!post) throw postGone();
  if (!anyAuthor && !(await authorVisible(tx, post.authorId))) throw postGone();
  return post;
}

/** Auteur ni supprimé ni suspendu. */
async function authorVisible(ex: Tx | typeof db, userId: string): Promise<boolean> {
  const [author] = await ex.select().from(profiles).where(eq(profiles.userId, userId));
  const at = now();
  return Boolean(author && !author.deletedAt && !(author.suspendedUntil && author.suspendedUntil > at));
}

/** Membre actif et visible d'un crew non dissous (destinataire d'une notification du fil). */
export async function activeVisibleMember(ex: Tx | typeof db, crewId: string, userId: string): Promise<boolean> {
  const [row] = await ex
    .select({ userId: crewMembers.userId })
    .from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
    .where(
      and(
        eq(crewMembers.crewId, crewId),
        eq(crewMembers.userId, userId),
        eq(crewMembers.status, "active"),
        isNull(crews.deletedAt),
        sql`${visibleProfile("profiles", now())}`,
      ),
    );
  return Boolean(row);
}

/** Tour 2 : texte d'une notification de commentaires regroupés (personnes distinctes, la dernière nommée). */
export function commentNotificationBody(commenter: string, othersCount: number, crewName: string): string {
  if (othersCount <= 0) return `${commenter} a commenté ta publication dans « ${crewName} ».`;
  const others = othersCount === 1 ? "1 autre personne" : `${othersCount} autres personnes`;
  return `${commenter} et ${others} ont commenté ta publication dans « ${crewName} ».`;
}

/** Tour 2 : la publication déjà créée par cet auteur avec cet identifiant d'appareil, dans ce crew. */
async function sameClientPost(tx: Tx, authorId: string, crewId: string, clientId: string | null | undefined) {
  if (!clientId) return null;
  const [row] = await tx
    .select({ id: crewPosts.id, crewId: crewPosts.crewId })
    .from(crewPosts)
    .where(and(eq(crewPosts.authorId, authorId), eq(crewPosts.clientId, clientId)));
  if (!row) return null;
  if (row.crewId !== crewId) throw validation("Identifiant de publication déjà utilisé.");
  return row.id;
}

/** Une publication telle que la voit ce membre (404 si elle n'est pas visible). */
async function viewOf(access: FeedAccess, postId: string, ex: Tx | typeof db = db): Promise<CrewPostView> {
  const [view] = await loadPostViews(ex, [postId], access, now());
  if (!view) throw postGone();
  return view;
}

/** Retire une publication (dans la transaction de l'appelant) ; rend les clés des photos à effacer après validation. */
export async function softDeletePost(tx: Tx, postId: string, by: string | null): Promise<string[]> {
  await tx.update(crewPosts).set({ deletedAt: now(), deletedBy: by }).where(eq(crewPosts.id, postId));
  const photos = await tx
    .delete(crewPostPhotos)
    .where(eq(crewPostPhotos.postId, postId))
    .returning({ key: crewPostPhotos.storageKey });
  const keys = photos.map((p) => p.key);
  if (keys.length) await tx.delete(uploads).where(inArray(uploads.key, keys));
  return keys;
}

async function removeFiles(keys: string[]) {
  for (const k of keys) await storage.remove(k).catch(() => undefined);
}

/**
 * Notification calme d'un commentaire (famille `social`) : regroupée avec la précédente sur la même publication tant
 * qu'elle n'est pas lue (le texte change, la livraison ne se rejoue pas). Jamais le texte du commentaire ni d'image.
 */
async function notifyComment(tx: Tx, post: typeof crewPosts.$inferSelect, access: FeedAccess, commenter: string) {
  if (post.authorId === access.viewerId) return;
  // Tour 2 : seulement un auteur encore membre actif du crew (revérifié à la livraison).
  if (!(await activeVisibleMember(tx, access.crew.id, post.authorId))) return;
  const crewName = access.crew.name;
  const link = crewPath(access.crew.slug);
  const [open] = await tx
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, post.authorId),
        eq(notifications.type, "crew_post_comment"),
        sql`${notifications.data} ->> 'postId' = ${post.id}`,
        isNull(notifications.readAt),
      ),
    )
    .for("update");
  if (open) {
    const data = open.data as { actorIds?: string[] };
    // `actorIds` : les personnes distinctes qu'elle cite (effacée si l'une d'elles supprime son compte).
    const actorIds = [...new Set([...(data.actorIds ?? []), access.viewerId])];
    const others = actorIds.length - 1;
    await tx
      .update(notifications)
      .set({ body: commentNotificationBody(commenter, others, crewName), data: { ...open.data, others, actorIds } })
      .where(eq(notifications.id, open.id));
    return;
  }
  await notificationsService.notify(tx, post.authorId, "crew_post_comment", {
    title: "Nouveau commentaire",
    body: commentNotificationBody(commenter, 0, crewName),
    data: { crewId: access.crew.id, postId: post.id, others: 0, actorIds: [access.viewerId], link },
    link: { label: "Voir le crew", path: link },
  });
}

export const crewFeedService = {
  /** `GET /crews/:id/feed?cursor` : publications et événements automatiques, 20 par page, curseur stable. */
  async feed(v: Viewer, crewId: string, cursor?: string): Promise<CrewFeedPage> {
    const access = await requireCrewMember(db, v, crewId);
    const at = now();
    const { rows, more } = await readFeedRows(access, at, decodeFeedCursor(cursor), CREW_FEED_PAGE);
    const items = new Map<string, CrewFeedItem>();
    for (const source of feedSources) {
      const mine = rows.filter((r) => r.type === source.type);
      if (!mine.length) continue;
      for (const [k, item] of await source.hydrate(db, mine, access, at)) items.set(k, item);
    }
    const last = rows.at(-1);
    return {
      items: rows.flatMap((r) => {
        const item = items.get(`${r.type}:${r.id}`);
        return item ? [item] : [];
      }),
      nextCursor: more && last ? encodeFeedCursor(last) : null,
    };
  },

  /**
   * `GET /crews/:id/posts/:postId` (lot R6a) : une publication, telle que le fil la montre à ce membre (mêmes champs,
   * mêmes droits). La page du crew la relit à un signal (flamme, commentaire, voix, clôture) ; 404 si elle n'est plus
   * visible.
   */
  async post(v: Viewer, crewId: string, postId: string): Promise<CrewPostView> {
    const access = await requireCrewMember(db, v, crewId);
    if (!isUuid(postId)) throw postGone();
    return viewOf(access, postId);
  },

  /** `GET /crews/:id/post-options` : de quoi remplir le composeur (mes véhicules actifs, mes événements proches). */
  async postOptions(v: Viewer, crewId: string): Promise<CrewPostOptions> {
    const access = await requireCrewMember(db, v, crewId);
    const at = now();
    const mine = await db.query.vehicles.findMany({
      where: and(eq(vehicles.ownerId, v.user.id), eq(vehicles.status, "active")),
      with: { make: true, model: true, generation: true },
      orderBy: [asc(vehicles.createdAt)],
    });
    const main = v.profile.mainVehicleId;
    mine.sort((a, b) => Number(b.id === main) - Number(a.id === main));
    // Événements où je vais (ou suis allé il y a moins de 30 jours) ou où le crew est inscrit : 10 au plus.
    const from = new Date(at.getTime() - 30 * 86_400_000);
    const to = new Date(at.getTime() + 180 * 86_400_000);
    const eventRows = await db
      .selectDistinct({
        id: events.id,
        title: events.title,
        startsAt: events.startsAt,
        admission: events.admission,
        structureId: events.structureId,
      })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(
          or(eq(applications.userId, v.user.id), eq(applications.crewId, access.crew.id)),
          notInArray(applications.status, ["refused", "withdrawn", "expired", "cancelled"]),
          eq(events.status, "published"),
          gte(events.startsAt, from),
          lte(events.startsAt, to),
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(10);
    // Tour 2 : un événement privé n'est proposé qu'à qui peut le voir.
    const visibleEvents: typeof eventRows = [];
    for (const e of eventRows) if (await canSeeEvent(e, v)) visibleEvents.push(e);
    return {
      crew: {
        id: access.crew.id,
        slug: access.crew.slug,
        name: access.crew.name,
        membersCount: access.crew.membersCount,
      },
      me: personOf(v.profile),
      vehicles: mine.map((x) => ({ id: x.id, label: vehicleLabel(x), vehicleType: x.vehicleType })),
      events: visibleEvents.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt.toISOString() })),
    };
  },

  /** `POST /crews/:id/posts` : photos (1 à 6), texte seul, ou sondage. Tout membre actif publie. */
  async create(v: Viewer, crewId: string, input: CrewPostCreate): Promise<CrewPostView> {
    rateLimit("crewPost", v.user.id);
    const at = now();
    if (input.kind === "poll" && input.poll.endsAt && !pollEndsAtValid(new Date(input.poll.endsAt), at)) {
      throw validation("La fin du sondage doit être dans les 90 prochains jours.");
    }
    const run = () =>
      withTx(async (tx, after) => {
        const access = await requireCrewMember(tx, v, crewId, "write");
        // Tour 2 : une publication déjà créée avec cet identifiant (réponse perdue, nouvel essai) est rendue telle quelle.
        const done = await sameClientPost(tx, v.user.id, crewId, input.clientId);
        if (done) return { id: done, access };
        const links = input.kind === "poll" ? { vehicleId: null, eventId: null } : input;
        if (links.vehicleId) {
          const [vehicle] = await tx
            .select({ id: vehicles.id })
            .from(vehicles)
            .where(
              and(eq(vehicles.id, links.vehicleId), eq(vehicles.ownerId, v.user.id), eq(vehicles.status, "active")),
            );
          if (!vehicle) throw validation("Ce véhicule n'est pas dans ton garage.");
        }
        if (links.eventId) {
          const [event] = await tx
            .select({ id: events.id, admission: events.admission, structureId: events.structureId })
            .from(events)
            .where(and(eq(events.id, links.eventId), eq(events.status, "published")));
          // Tour 2 : un événement privé seulement pour qui peut le voir (même réponse qu'un événement inconnu).
          if (!event || !(await canSeeEvent(event, v, tx))) throw validation("Événement introuvable.");
        }
        const [post] = await tx
          .insert(crewPosts)
          .values({
            crewId,
            authorId: v.user.id,
            kind: input.kind,
            text: input.kind === "poll" ? null : input.text,
            vehicleId: links.vehicleId ?? null,
            eventId: links.eventId ?? null,
            clientId: input.clientId ?? null,
            createdAt: at,
          })
          .returning();
        if (!post) throw new Error("Publication non enregistrée");
        if (input.kind === "photo") {
          let position = 0;
          for (const key of input.photoKeys) {
            const upload = await uploadsService.consume(tx, v.user.id, key, "crew_post");
            if (!upload?.width || !upload.height || !key.startsWith(CREW_POST_FOLDER)) {
              throw validation("Photo inconnue ou déjà utilisée : envoie-la de nouveau.");
            }
            await tx.insert(crewPostPhotos).values({
              postId: post.id,
              storageKey: key,
              width: upload.width,
              height: upload.height,
              position: position++,
            });
          }
        }
        if (input.kind === "poll") {
          await tx.insert(crewPolls).values({
            postId: post.id,
            question: input.poll.question,
            endsAt: input.poll.endsAt ? new Date(input.poll.endsAt) : null,
          });
          await tx
            .insert(crewPollOptions)
            .values(input.poll.options.map((label, position) => ({ postId: post.id, label, position })));
          // Un nouveau sondage : les autres membres actifs, une fois (jamais une notification par photo).
          const members = await tx
            .select({ userId: crewMembers.userId })
            .from(crewMembers)
            .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
            .where(
              and(
                eq(crewMembers.crewId, crewId),
                eq(crewMembers.status, "active"),
                ne(crewMembers.userId, v.user.id),
                sql`${visibleProfile("profiles", at)}`,
              ),
            );
          const crew = access.crew;
          await notificationsService.notifyMany(
            tx,
            members.map((m) => m.userId),
            "crew_poll_new",
            {
              title: `Nouveau sondage dans « ${crew.name} »`,
              body: `${v.profile.pseudo} demande : « ${input.poll.question} »`,
              data: { crewId, postId: post.id, link: crewPath(crew.slug) },
              link: { label: "Voter", path: crewPath(crew.slug) },
            },
          );
          after(() => notificationsService.kick());
        }
        // Lot R6a : les pages ouvertes du crew relisent leur fil (après la validation, jamais après une annulation).
        signalCrew(after, crewId, "post.created", { postId: post.id }, v.user.id);
        return { id: post.id, access };
      });
    const { id, access } = await run().catch(async (error) => {
      // Deux envois simultanés du même identifiant : le second rend la publication du premier.
      const e = error as { code?: string; cause?: { code?: string } };
      if (input.clientId && (e.cause ?? e).code === "23505") return run();
      return raceToConflict(error);
    });
    return viewOf(access, id);
  },

  /**
   * `DELETE /crews/:id/posts/:postId` : l'auteur ou le chef ; les photos sont effacées tout de suite. Tour 2 : le chef
   * retire aussi la publication d'un auteur suspendu ; un ancien membre retire encore **ses** publications.
   */
  async remove(v: Viewer, crewId: string, postId: string): Promise<void> {
    const keys = await withTx(async (tx, after) => {
      const access = await requireOwnContentAccess(tx, v, crewId);
      const post = await lockPost(tx, crewId, postId, true);
      const mine = post.authorId === v.user.id;
      // Ni membre ni auteur : rien à voir ici (404, comme un crew inconnu).
      if (!access.member && !mine) throw notFound(crewErrors.notFound);
      // Un membre ne voit pas la publication d'un auteur suspendu ; le chef la retire quand même.
      if (!mine && !access.leader && !(await authorVisible(tx, post.authorId))) throw postGone();
      if (!canRemoveCrewContent(post.authorId, { userId: v.user.id, leader: access.leader })) {
        throw forbidden("Seuls son auteur et le chef du crew peuvent retirer cette publication.");
      }
      signalCrew(after, crewId, "post.removed", { postId: post.id }, v.user.id);
      return softDeletePost(tx, post.id, v.user.id);
    });
    await removeFiles(keys);
  },

  /** `PUT` / `DELETE /crews/:id/posts/:postId/reaction` : la flamme (une par personne). */
  async fire(v: Viewer, crewId: string, postId: string, on: boolean): Promise<CrewFireState> {
    rateLimit("crewReact", v.user.id);
    const access = await withTx(async (tx, after) => {
      const a = await requireCrewMember(tx, v, crewId, "write");
      const post = await lockPost(tx, crewId, postId);
      signalCrew(after, crewId, "post.fire", { postId: post.id }, v.user.id);
      if (on) {
        await tx.insert(crewPostReactions).values({ postId: post.id, userId: v.user.id }).onConflictDoNothing();
      } else {
        await tx
          .delete(crewPostReactions)
          .where(and(eq(crewPostReactions.postId, post.id), eq(crewPostReactions.userId, v.user.id)));
      }
      return a;
    }).catch(raceToConflict);
    const view = await viewOf(access, postId);
    return { firesCount: view.firesCount, firedByMe: view.firedByMe };
  },

  /** `GET /crews/:id/posts/:postId/comments?cursor` : du plus ancien au plus récent, 50 par page. */
  async comments(v: Viewer, crewId: string, postId: string, cursor?: string): Promise<Page<CrewCommentView>> {
    const access = await requireCrewMember(db, v, crewId);
    await viewOf(access, postId);
    const at = now();
    const after = decodeCursor(cursor);
    const rows = await db
      .select({ c: crewPostComments, p: profiles })
      .from(crewPostComments)
      .innerJoin(profiles, eq(profiles.userId, crewPostComments.authorId))
      .where(
        and(
          eq(crewPostComments.postId, postId),
          isNull(crewPostComments.deletedAt),
          sql`${visibleProfile("profiles", at)}`,
          after
            ? sql`(${crewPostComments.createdAt}, ${crewPostComments.id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(crewPostComments.createdAt), asc(crewPostComments.id))
      .limit(CREW_COMMENTS_PAGE + 1);
    const shown = rows.slice(0, CREW_COMMENTS_PAGE);
    const last = shown.at(-1);
    return {
      items: shown.map(({ c, p }) => ({
        id: c.id,
        author: personOf(p),
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        mine: c.authorId === v.user.id,
        canRemove: canRemoveCrewContent(c.authorId, { userId: v.user.id, leader: access.leader }),
      })),
      nextCursor: rows.length > CREW_COMMENTS_PAGE && last ? encodeCursor(last.c.createdAt, last.c.id) : null,
    };
  },

  /** `POST /crews/:id/posts/:postId/comments {text}` : 300 caractères ; l'auteur de la publication est prévenu. */
  async comment(v: Viewer, crewId: string, postId: string, text: string): Promise<CrewCommentView> {
    rateLimit("crewComment", v.user.id);
    const at = now();
    const row = await withTx(async (tx, after) => {
      const access = await requireCrewMember(tx, v, crewId, "write");
      const post = await lockPost(tx, crewId, postId);
      const [created] = await tx
        .insert(crewPostComments)
        .values({ postId: post.id, authorId: v.user.id, text, createdAt: at })
        .returning();
      if (!created) throw new Error("Commentaire non enregistré");
      await notifyComment(tx, post, access, v.profile.pseudo);
      after(() => notificationsService.kick());
      signalCrew(after, crewId, "comment.created", { postId: post.id, commentId: created.id }, v.user.id);
      return { created, leader: access.leader };
    }).catch(raceToConflict);
    return {
      id: row.created.id,
      author: personOf(v.profile),
      text: row.created.text,
      createdAt: row.created.createdAt.toISOString(),
      mine: true,
      canRemove: true,
    };
  },

  /** `DELETE /crews/:id/comments/:commentId` : son auteur ou le chef. */
  async removeComment(v: Viewer, crewId: string, commentId: string): Promise<void> {
    if (!isUuid(commentId)) throw commentGone();
    await withTx(async (tx, after) => {
      // Tour 2 : un ancien membre retire encore ses commentaires ; personne d'autre hors du crew.
      const access = await requireOwnContentAccess(tx, v, crewId);
      const [row] = await tx
        .select({ c: crewPostComments })
        .from(crewPostComments)
        .innerJoin(crewPosts, eq(crewPosts.id, crewPostComments.postId))
        .where(
          and(
            eq(crewPostComments.id, commentId),
            eq(crewPosts.crewId, crewId),
            isNull(crewPosts.deletedAt),
            isNull(crewPostComments.deletedAt),
          ),
        )
        .for("update", { of: crewPostComments });
      if (!row) throw commentGone();
      if (!access.member && row.c.authorId !== v.user.id) throw notFound(crewErrors.notFound);
      if (!canRemoveCrewContent(row.c.authorId, { userId: v.user.id, leader: access.leader })) {
        throw forbidden("Seuls son auteur et le chef du crew peuvent retirer ce commentaire.");
      }
      await tx
        .update(crewPostComments)
        .set({ deletedAt: now(), deletedBy: v.user.id })
        .where(eq(crewPostComments.id, commentId));
      signalCrew(after, crewId, "comment.removed", { postId: row.c.postId, commentId }, v.user.id);
    });
  },

  /** `PUT /crews/:id/posts/:postId/vote {optionId}` : une voix, modifiable tant que le sondage est ouvert. */
  async vote(v: Viewer, crewId: string, postId: string, optionId: string): Promise<CrewPostView> {
    rateLimit("crewReact", v.user.id);
    const access = await withTx(async (tx, after) => {
      const a = await requireCrewMember(tx, v, crewId, "write");
      const post = await lockPost(tx, crewId, postId);
      const [poll] = await tx.select().from(crewPolls).where(eq(crewPolls.postId, post.id)).for("update");
      if (!poll) throw postGone();
      if (!crewPollOpen(poll, now())) throw validation("Ce sondage est clos.");
      signalCrew(after, crewId, "poll.voted", { postId: post.id }, v.user.id);
      const [option] = await tx
        .select({ id: crewPollOptions.id })
        .from(crewPollOptions)
        .where(and(eq(crewPollOptions.id, optionId), eq(crewPollOptions.postId, post.id)));
      if (!option) throw validation("Réponse inconnue.");
      await tx
        .insert(crewPollVotes)
        .values({ postId: post.id, userId: v.user.id, optionId })
        .onConflictDoUpdate({ target: [crewPollVotes.postId, crewPollVotes.userId], set: { optionId } });
      return a;
    }).catch(raceToConflict);
    return viewOf(access, postId);
  },

  /** `POST /crews/:id/posts/:postId/close` : l'auteur ou le chef clôt le sondage. */
  async close(v: Viewer, crewId: string, postId: string): Promise<CrewPostView> {
    const access = await withTx(async (tx, after) => {
      const a = await requireCrewMember(tx, v, crewId, "write");
      const post = await lockPost(tx, crewId, postId);
      const [poll] = await tx.select().from(crewPolls).where(eq(crewPolls.postId, post.id)).for("update");
      if (!poll) throw postGone();
      if (!canRemoveCrewContent(post.authorId, { userId: v.user.id, leader: a.leader })) {
        throw forbidden("Seuls son auteur et le chef du crew peuvent clore ce sondage.");
      }
      if (!poll.closedAt) {
        await tx.update(crewPolls).set({ closedAt: now(), closedBy: v.user.id }).where(eq(crewPolls.postId, post.id));
        signalCrew(after, crewId, "poll.closed", { postId: post.id }, v.user.id);
      }
      return a;
    });
    return viewOf(access, postId);
  },

  /**
   * Tour 2, `DELETE /me/crew-content/left-crews` (Réglages › Confidentialité) : retire mes publications et mes
   * commentaires des crews que j'ai quittés (ou dont j'ai été retiré). Les crews dissous n'en ont plus (par leur chef)
   * ou les gardent pour la modération : on n'y touche pas.
   */
  async withdrawFromLeftCrews(v: Viewer): Promise<{ posts: number; comments: number }> {
    const left = sql`(select c.id from crews c
      where c.deleted_at is null
        and not exists (select 1 from crew_members m
          where m.crew_id = c.id and m.user_id = ${v.user.id} and m.status = 'active'))`;
    const { keys, posts, comments } = await withTx(async (tx, after) => {
      const mine = await tx
        .select({ id: crewPosts.id, crewId: crewPosts.crewId })
        .from(crewPosts)
        .where(and(eq(crewPosts.authorId, v.user.id), isNull(crewPosts.deletedAt), sql`${crewPosts.crewId} in ${left}`))
        .for("update");
      const keys: string[] = [];
      for (const p of mine) {
        keys.push(...(await softDeletePost(tx, p.id, v.user.id)));
        signalCrew(after, p.crewId, "post.removed", { postId: p.id });
      }
      const removed = await tx
        .update(crewPostComments)
        .set({ deletedAt: now(), deletedBy: v.user.id })
        .where(
          and(
            eq(crewPostComments.authorId, v.user.id),
            isNull(crewPostComments.deletedAt),
            sql`${crewPostComments.postId} in (select p.id from crew_posts p where p.crew_id in ${left})`,
          ),
        )
        .returning({ id: crewPostComments.id, postId: crewPostComments.postId });
      // Lot R6a : les pages ouvertes de ces crews retirent les commentaires et relisent leurs nombres.
      const postIds = [...new Set(removed.map((c) => c.postId))];
      const crewOf = new Map(
        postIds.length
          ? (
              await tx
                .select({ id: crewPosts.id, crewId: crewPosts.crewId })
                .from(crewPosts)
                .where(inArray(crewPosts.id, postIds))
            ).map((p) => [p.id, p.crewId])
          : [],
      );
      for (const c of removed) {
        const crewId = crewOf.get(c.postId);
        if (crewId) signalCrew(after, crewId, "comment.removed", { postId: c.postId, commentId: c.id });
      }
      return { keys, posts: mine.length, comments: removed.length };
    });
    await removeFiles(keys);
    return { posts, comments };
  },

  /**
   * `GET /crews/:id/photos/:nom` : une photo du fil, au membre actif seulement, à chaque lecture (D36). Un membre qui
   * part perd l'accès tout de suite ; jamais d'adresse publique (`/api/files` refuse `private/`).
   */
  async photo(v: Viewer, crewId: string, name: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}\.webp$/.test(name)) throw notFound("Photo introuvable");
    const access = await requireCrewMember(db, v, crewId);
    const at = now();
    const [row] = await db
      .select({ key: crewPostPhotos.storageKey })
      .from(crewPostPhotos)
      .innerJoin(crewPosts, eq(crewPosts.id, crewPostPhotos.postId))
      .innerJoin(profiles, eq(profiles.userId, crewPosts.authorId))
      .where(
        and(
          eq(crewPostPhotos.storageKey, `${CREW_POST_FOLDER}${name}`),
          eq(crewPosts.crewId, access.crew.id),
          isNull(crewPosts.deletedAt),
          sql`${visibleProfile("profiles", at)}`,
        ),
      );
    const data = row ? await storage.get(row.key) : null;
    if (!data) throw notFound("Photo introuvable");
    return data;
  },
};

/**
 * Tour 2 : dissolution d'un crew par son chef (ou parce qu'il a supprimé son compte) : ses publications partent, avec
 * leurs photos (lignes, envois ; fichiers effacés par l'appelant après la validation) et les notifications qui les
 * citent. Un retrait par la modération garde tout pour la modération (le fil répond 404 à tous).
 */
export async function purgeCrewFeed(tx: Tx, crewId: string): Promise<string[]> {
  const posts = await tx.select({ id: crewPosts.id }).from(crewPosts).where(eq(crewPosts.crewId, crewId));
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);
  const keys = (
    await tx.select({ key: crewPostPhotos.storageKey }).from(crewPostPhotos).where(inArray(crewPostPhotos.postId, ids))
  ).map((r) => r.key);
  if (keys.length) await tx.delete(uploads).where(inArray(uploads.key, keys));
  await tx
    .delete(notifications)
    .where(
      and(
        inArray(notifications.type, ["crew_post_comment", "crew_poll_new"]),
        sql`${notifications.data} ->> 'crewId' = ${crewId}`,
      ),
    );
  await tx.delete(crewPosts).where(eq(crewPosts.crewId, crewId));
  return keys;
}

// Tour 2 : une notification du fil différée (heures calmes) n'est livrée qu'à un membre encore actif du crew ; sinon
// elle est supprimée sans être envoyée.
registerDeliveryGuard(["crew_post_comment", "crew_poll_new"], async (n) => {
  const crewId = (n.data as { crewId?: unknown }).crewId;
  return typeof crewId === "string" && isUuid(crewId) && activeVisibleMember(db, crewId, n.userId);
});
