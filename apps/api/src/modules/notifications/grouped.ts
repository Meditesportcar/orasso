// Notifications qui citent des personnes (lot R7c1, tour 2) : lecture des personnes citées, visibilité (compte supprimé,
// suspendu ou banni), recomposition du titre et du corps, anonymisation d'un compte supprimé. Une notification regroupée
// garde ses personnes dans `data._actorIds` (jamais renvoyé) et un résumé dans `data.actors` / `data.count` ; ses textes
// sont gardés en modèle (`data._text`, le pseudo remplacé par `{name}`) pour être recomposés sans la personne partie.
import { ACTIVITY_MAX_ACTORS, type ActivityActor, r7DefaultContent, r7NotificationTable } from "@orasso/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import { notifications, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { storage } from "../../lib/storage";
import type { Executor, Tx } from "../../lib/tx";

type NotificationRow = typeof notifications.$inferSelect;

/** Personnes vérifiées par ligne (le maximum gardé par `notify`) : toutes, pour que la liste et la pastille s'accordent. */
export const ACTORS_CHECKED = 500;

type Shape = {
  _actorIds?: unknown;
  actorIds?: unknown;
  actor?: { userId?: unknown };
  count?: unknown;
  _text?: { title?: unknown; body?: unknown };
};

/** Identifiants des personnes citées par une notification, la plus récente d'abord (regroupée, ancienne ou unique). */
export function actorIdsOf(data: Record<string, unknown>): string[] {
  const d = data as Shape;
  const ids = Array.isArray(d._actorIds) ? d._actorIds : Array.isArray(d.actorIds) ? d.actorIds : null;
  if (ids) return ids.filter((x): x is string => typeof x === "string");
  const one = d.actor?.userId;
  return typeof one === "string" ? [one] : [];
}

/** Compte en règle : ni supprimé, ni banni, ni suspendu à l'instant `at`. */
export const visibleProfile = (at: Date) =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

/**
 * Reste-t-il au moins une personne en règle parmi celles que cite la notification ? (vrai sans personne citée). C'est le
 * critère de la liste de l'Activité ; la pastille et l'ancien Journal l'appliquent aussi, pour ne pas compter ce qui ne
 * s'affiche pas. `onlyGrouped` : seulement les notifications regroupées (`_actorIds`), pour ne pas changer l'ancien Journal.
 */
export const citedPeopleRemain = (at: Date, onlyGrouped = false) => sql`(
  coalesce((
    select jsonb_array_length(x.ids) = 0 or exists (
      select 1 from jsonb_array_elements_text(x.ids) as a(id)
      join ${profiles} on ${profiles.userId} = a.id
      where ${visibleProfile(at)}
    )
    from (
      select case
        when jsonb_typeof(${notifications.data} -> '_actorIds') = 'array' then ${notifications.data} -> '_actorIds'
        ${
          onlyGrouped
            ? sql``
            : sql`when jsonb_typeof(${notifications.data} -> 'actorIds') = 'array' then ${notifications.data} -> 'actorIds'
        when jsonb_typeof(${notifications.data} #> '{actor,userId}') = 'string'
          then jsonb_build_array(${notifications.data} #> '{actor,userId}')`
        }
      end as ids
    ) x
    where x.ids is not null
  ), true)
)`;

/** Modèle d'un texte : le pseudo de la personne remplacé par `{name}`. */
export const textTemplate = (text: string, pseudo: string): string => text.replaceAll(pseudo, "{name}");

const fillTemplate = (template: string, pseudo: string): string => template.replaceAll("{name}", pseudo);

/** Vue d'une notification qui cite des personnes : seules celles dont le compte est en règle, textes recomposés. */
export type CitedView = {
  actors: ActivityActor[];
  people: string[];
  visible: number;
  count: number;
  title: string;
  body: string;
};

/**
 * Vue de chaque notification d'après ses personnes citées, relues à l'instant (pseudo et avatar du jour). `null` : plus
 * aucune personne en règle, la ligne n'est pas montrée. Les notifications sans personne citée sont absentes du résultat.
 */
export async function citedViews(
  rows: readonly NotificationRow[],
  ex: Executor,
): Promise<Map<string, CitedView | null>> {
  const at = now();
  const wanted = new Map(rows.map((n) => [n.id, actorIdsOf(n.data).slice(0, ACTORS_CHECKED)]));
  const all = [...new Set([...wanted.values()].flat())];
  const people = all.length
    ? await ex
        .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
        .from(profiles)
        .where(and(inArray(profiles.userId, all), visibleProfile(at)))
    : [];
  const byId = new Map(people.map((p) => [p.userId, p]));
  const result = new Map<string, CitedView | null>();
  for (const n of rows) {
    const checked = wanted.get(n.id) ?? [];
    const ids = actorIdsOf(n.data);
    if (!ids.length) continue;
    const visible = checked.flatMap((id) => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
    if (!visible.length) {
      result.set(n.id, null);
      continue;
    }
    const stored = (n.data as Shape).count;
    const tpl = (n.data as Shape)._text;
    const first = visible[0];
    result.set(n.id, {
      actors: visible
        .slice(0, ACTIVITY_MAX_ACTORS)
        .map((p) => ({ pseudo: p.pseudo, avatarUrl: storage.url(p.avatarKey) })),
      people: visible.map((p) => p.pseudo),
      visible: visible.length,
      count: Math.max(
        1,
        visible.length + Math.max(0, (typeof stored === "number" ? stored : ids.length) - checked.length),
      ),
      // Texte recomposé avec la personne la plus récente restée en règle ; sans modèle, le texte enregistré.
      title: first && typeof tpl?.title === "string" ? fillTemplate(tpl.title, first.pseudo) : n.title,
      body: first && typeof tpl?.body === "string" ? fillTemplate(tpl.body, first.pseudo) : n.body,
    });
  }
  return result;
}

/**
 * Compte supprimé : il sort des notifications regroupées des autres (`_actorIds`). Les autres personnes restent, avec
 * leur résumé (`actors`, `count`) et leurs textes recomposés ; plus aucune personne (ou un texte qu'on ne sait pas
 * recomposer) : la notification est supprimée. Appelé par `accountService.anonymize`, dans sa transaction.
 */
export async function anonymizeGroupedNotificationsForDeletedAccount(tx: Tx, userId: string): Promise<void> {
  const cited = await tx
    .select()
    .from(notifications)
    .where(sql`${notifications.data} -> '_actorIds' ? ${userId}`)
    .for("update");
  for (const n of cited) {
    const data = n.data as Shape & Record<string, unknown>;
    const ids = actorIdsOf(n.data).filter((id) => id !== userId);
    const people = ids.length
      ? await tx
          .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
          .from(profiles)
          .where(and(inArray(profiles.userId, ids), sql`${profiles.deletedAt} is null`))
      : [];
    const byId = new Map(people.map((p) => [p.userId, p]));
    const remaining = ids.filter((id) => byId.has(id));
    const first = remaining[0] ? byId.get(remaining[0]) : undefined;
    const tpl = data._text;
    const known = n.type in r7NotificationTable;
    if (!first || (typeof tpl?.title !== "string" && !known)) {
      await tx.delete(notifications).where(eq(notifications.id, n.id));
      continue;
    }
    const text =
      typeof tpl?.title === "string" && typeof tpl?.body === "string"
        ? { title: fillTemplate(tpl.title, first.pseudo), body: fillTemplate(tpl.body, first.pseudo) }
        : r7DefaultContent(n.type as Parameters<typeof r7DefaultContent>[0], first.pseudo);
    await tx
      .update(notifications)
      .set({
        title: text.title,
        body: text.body,
        data: {
          ...n.data,
          _actorIds: remaining,
          actors: remaining.slice(0, ACTIVITY_MAX_ACTORS).map((id) => ({
            pseudo: byId.get(id)?.pseudo ?? "",
            avatarUrl: storage.url(byId.get(id)?.avatarKey ?? null),
          })),
          count: Math.max(1, remaining.length),
        },
      })
      .where(eq(notifications.id, n.id));
  }
}
