// Explorer national du média (lot 45, `s-agenda`) : filtres « accréditation ouverte » et région de `GET /events`, et
// état de l'accréditation et temps de route sur chaque carte. Appelé par `events/explore.ts` (deux lignes).
import {
  type ApplicationStatus,
  activeApplicationStatuses,
  type EventCard,
  type EventListQuery,
  regionDepartments,
  travelMinutes,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, eventPressSettings, events, mediaProfiles } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";

/** Accréditation ouverte maintenant : réglage posé, ouvert, date limite non passée. */
export function pressOpenSql(at: Date): SQL {
  return sql`exists (select 1 from ${eventPressSettings} where ${eventPressSettings.eventId} = ${events.id}
    and ${eventPressSettings.accreditationOpen} and (${eventPressSettings.deadline} is null or ${eventPressSettings.deadline} > ${at.toISOString()}::timestamptz))`;
}

/** Filtres ajoutés à la liste : `accreditationOpen=1`, `region=<code>`. */
export function mediaExploreFilters(q: EventListQuery): SQL[] {
  const out: SQL[] = [];
  if (q.accreditationOpen) out.push(pressOpenSql(now()));
  if (q.region) out.push(inArray(events.department, [...regionDepartments(q.region)]));
  return out;
}

const ACTIVE = activeApplicationStatuses as readonly ApplicationStatus[];

/**
 * Cartes d'un média (ou de toute personne qui filtre par accréditation ou région) : `accreditation {open, mine}` et
 * `travelMinutes` depuis le secteur du profil (à défaut, la zone couverte par le média).
 */
export async function decorateForMedia(items: EventCard[], q: EventListQuery, viewer: Viewer | null): Promise<void> {
  if (!items.length) return;
  const profile = viewer
    ? await db.query.mediaProfiles.findFirst({
        where: and(eq(mediaProfiles.userId, viewer.user.id), isNull(mediaProfiles.deletedAt)),
      })
    : undefined;
  if (!profile && q.accreditationOpen === undefined && !q.region) return;
  const t = now();
  const ids = items.map((i) => i.id);
  const settings = await db.select().from(eventPressSettings).where(inArray(eventPressSettings.eventId, ids));
  const openOf = new Map(
    settings.map((s) => [s.eventId, s.accreditationOpen && (!s.deadline || s.deadline > t)] as const),
  );
  const mine = profile
    ? await db
        .select({ eventId: applications.eventId, status: applications.status })
        .from(applications)
        .where(and(eq(applications.mediaProfileId, profile.id), inArray(applications.eventId, ids)))
        .orderBy(desc(applications.createdAt))
    : [];
  const sector = viewer?.profile.departments.length ? viewer.profile.departments : (profile?.departments ?? []);
  for (const item of items) {
    const apps = mine.filter((a) => a.eventId === item.id);
    const app = apps.find((a) => ACTIVE.includes(a.status)) ?? apps[0];
    item.accreditation = { open: openOf.get(item.id) ?? false, mine: app?.status ?? null };
    const to = item.lat !== null && item.lng !== null ? { lat: item.lat, lng: item.lng } : null;
    item.travelMinutes = travelMinutes(sector, to);
  }
}
