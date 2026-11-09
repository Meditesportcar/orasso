// Bloc « Mon crew » de l'Accueil (lot R7a2, maquette R7.4) : un raccourci vers l'onglet Crew pour le crew où la personne a
// été le plus récemment active (dernière publication du fil, sinon son arrivée) : la dernière publication (le texte, ou
// « photo » : jamais l'image dans ce bloc), la prochaine sortie du crew, la Discussion avec ses messages non lus.
// Mêmes contrôles que le fil du crew (tour 2) : le lecteur doit pouvoir lire le fil (`requireCrewMember` : membre actif, ni
// suspendu ni supprimé, 404 sinon = bloc absent), et une publication, un commentaire ou une réaction d'un auteur supprimé
// ou suspendu (`visibleProfile`) n'existent pas ici, compteurs compris.
import type { HomeMyCrew } from "@orasso/shared";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import {
  conversations,
  crewMembers,
  crewOutingReplies,
  crewOutings,
  crewPostComments,
  crewPostPhotos,
  crewPosts,
  crews,
  profiles,
} from "../../../db/schema";
import { now } from "../../../lib/deps";
import { AppError } from "../../../lib/errors";
import type { Viewer } from "../../../lib/session";
import { storage } from "../../../lib/storage";
import { requireCrewMember, visibleProfile } from "../../crews/feed/access";
import { unreadCountOf } from "../../messaging/core";

export async function myCrewWidget(v: Viewer): Promise<HomeMyCrew | null> {
  const t = now();
  const mine = await db
    .select({ crew: crews, joinedAt: crewMembers.joinedAt })
    .from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .where(and(eq(crewMembers.userId, v.user.id), eq(crewMembers.status, "active"), isNull(crews.deletedAt)));
  if (!mine.length) return null;

  // Le crew le plus récemment actif : sa dernière publication non supprimée, sinon sa date d'arrivée.
  const lastPosts = await db
    .select({ crewId: crewPosts.crewId, at: sql<string>`max(${crewPosts.createdAt})` })
    .from(crewPosts)
    .innerJoin(profiles, eq(profiles.userId, crewPosts.authorId))
    .where(
      and(
        inArray(
          crewPosts.crewId,
          mine.map((m) => m.crew.id),
        ),
        isNull(crewPosts.deletedAt),
        sql`${visibleProfile("profiles", t)}`,
      ),
    )
    .groupBy(crewPosts.crewId);
  const activity = new Map(lastPosts.map((p) => [p.crewId, new Date(p.at).getTime()]));
  const activeAt = (m: (typeof mine)[number]) => activity.get(m.crew.id) ?? m.joinedAt?.getTime() ?? 0;
  const chosen = [...mine].sort((a, b) => activeAt(b) - activeAt(a) || a.crew.name.localeCompare(b.crew.name))[0];
  if (!chosen) return null;
  const crew = chosen.crew;
  // Le lecteur peut-il lire le fil de ce crew ? (suspendu ou supprimé : 404 du fil, donc rien ici.)
  try {
    await requireCrewMember(db, v, crew.id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return null;
    throw error;
  }

  const [post] = await db
    .select({
      id: crewPosts.id,
      text: crewPosts.text,
      createdAt: crewPosts.createdAt,
      pseudo: profiles.pseudo,
      avatarKey: profiles.avatarKey,
    })
    .from(crewPosts)
    .innerJoin(profiles, eq(profiles.userId, crewPosts.authorId))
    .where(and(eq(crewPosts.crewId, crew.id), isNull(crewPosts.deletedAt), sql`${visibleProfile("profiles", t)}`))
    .orderBy(desc(crewPosts.createdAt), desc(crewPosts.id))
    .limit(1);
  let lastPost: HomeMyCrew["lastPost"] = null;
  if (post) {
    const [photos] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(crewPostPhotos)
      .where(eq(crewPostPhotos.postId, post.id));
    const [replies] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(crewPostComments)
      .innerJoin(profiles, eq(profiles.userId, crewPostComments.authorId))
      .where(
        and(
          eq(crewPostComments.postId, post.id),
          isNull(crewPostComments.deletedAt),
          sql`${visibleProfile("profiles", t)}`,
        ),
      );
    lastPost = {
      author: { pseudo: post.pseudo, avatarUrl: storage.url(post.avatarKey) },
      text: post.text,
      hasPhoto: (photos?.n ?? 0) > 0,
      createdAt: post.createdAt.toISOString(),
      replies: replies?.n ?? 0,
    };
  }

  const [outing] = await db
    .select()
    .from(crewOutings)
    .where(and(eq(crewOutings.crewId, crew.id), isNull(crewOutings.cancelledAt), gt(crewOutings.startsAt, t)))
    .orderBy(asc(crewOutings.startsAt), asc(crewOutings.id))
    .limit(1);
  let nextOuting: HomeMyCrew["nextOuting"] = null;
  if (outing) {
    const [going] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(crewOutingReplies)
      .innerJoin(profiles, eq(profiles.userId, crewOutingReplies.userId))
      .where(
        and(
          eq(crewOutingReplies.outingId, outing.id),
          eq(crewOutingReplies.answer, "yes"),
          sql`${visibleProfile("profiles", t)}`,
        ),
      );
    nextOuting = {
      id: outing.id,
      title: outing.title,
      startsAt: outing.startsAt.toISOString(),
      place: outing.place,
      going: going?.n ?? 0,
    };
  }

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.kind, "crew"), eq(conversations.crewId, crew.id)))
    .limit(1);
  const unread = conversation ? await unreadCountOf(db, conversation.id, { userId: v.user.id, side: "member" }) : 0;

  return {
    crew: { slug: crew.slug, name: crew.name, logoUrl: storage.url(crew.logoKey), membersCount: crew.membersCount },
    unread,
    conversationId: conversation?.id ?? null,
    lastPost,
    nextOuting,
  };
}
