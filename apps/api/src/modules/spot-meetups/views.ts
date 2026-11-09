// Rendez-vous au spot (lot R7i) : les vues servies (liste blanche de champs) et les règles de visibilité en SQL. Une vue
// n'est jamais construite que pour l'auteur ou un invité : l'appelant a déjà décidé (`meetupVisibleTo`, ou le filtre
// SQL de `invitedSql`). Le lieu n'est servi que tant que le rendez-vous est en cours : dès `ends_at` (même avant que la
// tâche `spot.purge` ne passe), annulé ou effacé, `place` vaut `null`.
import { meetupPhase, SPOT_WHO_PREVIEW, type SpotAnswer, type SpotMeetupView, type SpotPerson } from "@orasso/shared";
import { and, eq, inArray, lte, type SQL, sql } from "drizzle-orm";

import { crews, profiles, spotMeetupReplies, type spotMeetups } from "../../db/schema";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { profileOkSql } from "../feed/access";

export type SpotRow = typeof spotMeetups.$inferSelect;

export const personOf = (p: { pseudo: string; avatarKey: string | null }): SpotPerson => ({
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
});

/** Fini, annulé ou effacé : le lieu et la liste ne sont plus servis. */
export const isOver = (row: Pick<SpotRow, "endsAt" | "cancelledAt" | "purgedAt">, at: Date): boolean =>
  row.purgedAt !== null || row.cancelledAt !== null || at.getTime() >= row.endsAt.getTime();

/**
 * `viewerId` est invité à ce rendez-vous (table `spot_meetups` de la requête) : l'auteur
 * en règle, et — « Mes abonnés » — un abonnement accepté, ou — « Mon crew » — un membre actif d'un crew non dissous dont
 * l'auteur est encore membre actif. Jamais « tout le monde ». Le regard est exclu (« reçu » ≠ « mien »).
 */
export function invitedSql(viewerId: string): SQL {
  return sql`(
    (spot_meetups.audience = 'followers' and exists (
      select 1 from user_follows uf
      where uf.follower_id = ${viewerId} and uf.followed_id = spot_meetups.author_id and uf.status = 'accepted'))
    or (spot_meetups.audience = 'crew' and exists (
      select 1 from crew_members cm join crews c on c.id = cm.crew_id
      where cm.crew_id = spot_meetups.crew_id and cm.user_id = ${viewerId} and cm.status = 'active' and c.deleted_at is null)
      and exists (
      select 1 from crew_members am
      where am.crew_id = spot_meetups.crew_id and am.user_id = spot_meetups.author_id and am.status = 'active'))
  )`;
}

/** Les vues de ces rendez-vous pour `viewerId` (déjà jugés visibles). Ordre conservé. */
export async function buildViews(ex: Executor, rows: SpotRow[], viewerId: string, at: Date): Promise<SpotMeetupView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const crewIds = [...new Set(rows.flatMap((r) => (r.crewId ? [r.crewId] : [])))];

  const authors = new Map(
    (
      await ex
        .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
        .from(profiles)
        .where(inArray(profiles.userId, authorIds))
    ).map((a) => [a.userId, a]),
  );
  const crewRows = crewIds.length
    ? await ex
        .select({ id: crews.id, name: crews.name, slug: crews.slug })
        .from(crews)
        .where(inArray(crews.id, crewIds))
    : [];
  const crewById = new Map(crewRows.map((c) => [c.id, c]));

  // Compteurs : seulement les comptes en règle (un compte suspendu, banni ou supprimé ne compte nulle part).
  const counts = await ex
    .select({
      meetupId: spotMeetupReplies.meetupId,
      answer: spotMeetupReplies.answer,
      n: sql<number>`count(*)::int`,
    })
    .from(spotMeetupReplies)
    .innerJoin(profiles, eq(profiles.userId, spotMeetupReplies.userId))
    .where(and(inArray(spotMeetupReplies.meetupId, ids), profileOkSql("profiles", at)))
    .groupBy(spotMeetupReplies.meetupId, spotMeetupReplies.answer);
  const tally = (id: string, answer: SpotAnswer) =>
    counts.find((c) => c.meetupId === id && c.answer === answer)?.n ?? 0;

  // Les premiers « Je viens » (trois par rendez-vous), dans l'ordre des réponses.
  const ranked = ex
    .select({
      meetupId: spotMeetupReplies.meetupId,
      pseudo: profiles.pseudo,
      avatarKey: profiles.avatarKey,
      rn: sql<number>`row_number() over (partition by ${spotMeetupReplies.meetupId} order by ${spotMeetupReplies.answeredAt}, ${spotMeetupReplies.userId})`.as(
        "rn",
      ),
    })
    .from(spotMeetupReplies)
    .innerJoin(profiles, eq(profiles.userId, spotMeetupReplies.userId))
    .where(
      and(inArray(spotMeetupReplies.meetupId, ids), eq(spotMeetupReplies.answer, "yes"), profileOkSql("profiles", at)),
    )
    .as("ranked");
  const previews = await ex.select().from(ranked).where(lte(ranked.rn, SPOT_WHO_PREVIEW));

  const mine = new Map(
    (
      await ex
        .select({ meetupId: spotMeetupReplies.meetupId, answer: spotMeetupReplies.answer })
        .from(spotMeetupReplies)
        .where(and(inArray(spotMeetupReplies.meetupId, ids), eq(spotMeetupReplies.userId, viewerId)))
    ).map((r) => [r.meetupId, r.answer]),
  );

  return rows.flatMap((r): SpotMeetupView[] => {
    const author = authors.get(r.authorId);
    if (!author) return [];
    const over = isOver(r, at);
    const crew = r.crewId ? (crewById.get(r.crewId) ?? null) : null;
    const yes = tally(r.id, "yes");
    return [
      {
        id: r.id,
        author: personOf(author),
        audience: r.audience,
        crew,
        place: over ? null : { label: r.placeLabel, lat: r.lat, lng: r.lng },
        note: r.note,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        phase: meetupPhase(r, at),
        mine: r.authorId === viewerId,
        myAnswer: over ? null : (mine.get(r.id) ?? null),
        yesCount: over ? 0 : yes,
        maybeCount: over ? 0 : tally(r.id, "maybe"),
        yesPreview: over
          ? []
          : previews
              .filter((p) => p.meetupId === r.id)
              .map((p) => personOf({ pseudo: p.pseudo, avatarKey: p.avatarKey })),
        // Fini : seulement le nombre (posé à l'effacement, sinon compté tout de suite pour les trois minutes avant la tâche).
        cameCount: over ? (r.cameCount ?? yes) : null,
      },
    ];
  });
}
