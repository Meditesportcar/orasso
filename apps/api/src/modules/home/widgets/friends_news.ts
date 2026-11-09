// Bloc « Du nouveau chez tes potes » de l'Accueil (lot R7a2, maquette R7.4) : les 3 dernières nouveautés du Journal social
// (`friend_going_event`, `friend_new_vehicle`, `story_published`) ; la suite est dans Le Fil. L'Accueil reste un tableau de
// bord, jamais un fil : trois lignes au plus, aucune pagination.
//
// Regard, relu À LA LECTURE (une notification posée il y a trois jours peut ne plus être permise) :
//  - une nouveauté d'une personne n'est montrée que si je la suis toujours (abonnement accepté : un compte privé que je ne
//    suis pas, ou plus, n'apparaît pas) et si son compte est actif (ni supprimé, ni banni, ni suspendu) ;
//  - « va à » : l'événement est publié, ouvert (jamais sur invitation) et pas fini ;
//  - « a ajouté » : le véhicule est toujours actif (jamais de photo ici : une plaque pourrait y figurer) ;
//  - une story : elle existe encore (24 h), je peux toujours la voir (même règle que la barre), je suis toujours abonné à
//    son auteur (un compte public se voit sans abonnement, mais l'ancienne nouveauté d'un compte quitté n'a plus sa place
//    ici), son auteur n'est pas en « ne plus voir ses stories ». Jamais une story de crew.
// Les lectures sont groupées (événements, véhicules, stories, abonnements) : jamais une lecture par ligne.
// Une seule ligne par personne et par sorte de nouveauté.
import {
  HOME_FRIENDS_NEWS_LIMIT,
  type HomeFriendNews,
  type HomeFriendsNews,
  storyDenial,
  storyLabels,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "../../../db/client";
import { events, notifications, profiles, stories, storyMutes } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { formatDateTime } from "../../../lib/format";
import type { Viewer } from "../../../lib/session";
import { storage } from "../../../lib/storage";
import { followsService } from "../../social/follows";
import {
  accountActive,
  audienceStoryOf,
  authorDisplay,
  authorKeyOf,
  relationOf,
  rowLive,
  selectStories,
  setsFor,
  viewerOf,
} from "../../stories/common";
import { vehiclesRepo } from "../../vehicles/repo";

const TYPES = ["friend_going_event", "friend_new_vehicle", "story_published"] as const;
/** Lignes lues avant filtrage : de quoi garder 3 nouveautés valides sans lire tout le Journal. */
const CANDIDATES = 40;

type Data = {
  actor?: { userId?: string; pseudo?: string; avatarUrl?: string | null };
  subjectId?: string;
  vehicleId?: string;
  storyId?: string;
  authorKey?: string;
};

export async function friendsNewsWidget(v: Viewer): Promise<HomeFriendsNews | null> {
  const t = now();
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, v.user.id),
        inArray(notifications.type, [...TYPES]),
        isNotNull(notifications.deliveredAt),
        eq(notifications.inJournal, true),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(CANDIDATES);
  if (!rows.length) return null;

  const following = new Set(await followsService.followingIds(v.user.id));
  const actorIds = [
    ...new Set(rows.map((r) => (r.data as Data | null)?.actor?.userId).filter((x): x is string => !!x)),
  ];
  const people = actorIds.length
    ? await db
        .select({
          userId: profiles.userId,
          pseudo: profiles.pseudo,
          avatarKey: profiles.avatarKey,
          deletedAt: profiles.deletedAt,
          bannedAt: profiles.bannedAt,
          suspendedUntil: profiles.suspendedUntil,
        })
        .from(profiles)
        .where(inArray(profiles.userId, actorIds))
    : [];
  const personById = new Map(people.map((p) => [p.userId, p]));
  const mutes = await db.select().from(storyMutes).where(eq(storyMutes.userId, v.user.id));
  const muted = new Set(mutes.map((m) => `${m.authorKind}:${m.authorId}`));

  // Lectures groupées de ce que les lignes désignent.
  const dataOf = (r: (typeof rows)[number]) => (r.data ?? {}) as Data;
  const eventIds = [...new Set(rows.flatMap((r) => (r.type === "friend_going_event" && r.eventId ? [r.eventId] : [])))];
  const eventById = new Map(
    (eventIds.length ? await db.select().from(events).where(inArray(events.id, eventIds)) : []).map((e) => [e.id, e]),
  );
  const vehicleIdOf = (r: (typeof rows)[number]) => dataOf(r).vehicleId ?? dataOf(r).subjectId;
  const vehicleIds = [
    ...new Set(
      rows.flatMap((r) => {
        const id = r.type === "friend_new_vehicle" ? vehicleIdOf(r) : undefined;
        return id ? [id] : [];
      }),
    ),
  ];
  const vehicleById = new Map((await vehiclesRepo.findFullByIds(vehicleIds)).map((x) => [x.id, x]));
  const storyIds = [
    ...new Set(
      rows.flatMap((r) => {
        const id = r.type === "story_published" ? dataOf(r).storyId : undefined;
        return id ? [id] : [];
      }),
    ),
  ];
  const storyRows = storyIds.length ? await selectStories(inArray(stories.id, storyIds)) : [];
  const storyById = new Map(storyRows.map((s) => [s.story.id, s]));
  const sets = await setsFor(v.user.id, storyRows);

  const items: HomeFriendNews[] = [];
  const seen = new Set<string>();
  for (const n of rows) {
    if (items.length >= HOME_FRIENDS_NEWS_LIMIT) break;
    const d = (n.data ?? {}) as Data;
    const person = d.actor?.userId ? personById.get(d.actor.userId) : undefined;

    if (n.type === "story_published") {
      if (!d.storyId) continue;
      const row = storyById.get(d.storyId);
      if (!row || !rowLive(row, t) || row.story.audience === "crew") continue;
      const relation = relationOf(sets, row);
      if (!relation.followAccepted) continue;
      if (storyDenial(viewerOf(v), audienceStoryOf(row, t), relation)) continue;
      const author = authorKeyOf(row);
      if (!author || muted.has(`${author.kind}:${author.id}`)) continue;
      const dedupe = `story:${author.key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const display = authorDisplay(row, (key) => storage.url(key));
      items.push({
        id: n.id,
        kind: "story",
        actor: { pseudo: display.name, avatarUrl: display.avatarUrl },
        text: storyLabels.published(display.name),
        caption: null,
        at: n.createdAt.toISOString(),
        target: { type: "story", authorKey: author.key },
      });
      continue;
    }

    // Personne suivie : toujours suivie (abonnement accepté) et compte actif.
    if (!person || !following.has(person.userId) || !accountActive(person, t)) continue;
    const actor = { pseudo: person.pseudo, avatarUrl: storage.url(person.avatarKey) };

    if (n.type === "friend_going_event") {
      if (!n.eventId) continue;
      const event = eventById.get(n.eventId);
      if (event?.status !== "published" || event.admission === "invite_only" || event.endsAt <= t) continue;
      const dedupe = `going:${person.userId}:${event.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      items.push({
        id: n.id,
        kind: "going",
        actor,
        text: n.title,
        caption: formatDateTime(event.startsAt),
        at: n.createdAt.toISOString(),
        target: { type: "event", slug: event.slug },
      });
    } else {
      const vehicleId = vehicleIdOf(n);
      if (!vehicleId) continue;
      const vehicle = vehicleById.get(vehicleId);
      if (vehicle?.status !== "active") continue;
      const dedupe = `vehicle:${vehicleId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      items.push({
        id: n.id,
        kind: "new_vehicle",
        actor,
        text: n.title,
        caption: null,
        at: n.createdAt.toISOString(),
        target: { type: "vehicle", id: vehicleId },
      });
    }
  }
  return items.length ? { items } : null;
}
