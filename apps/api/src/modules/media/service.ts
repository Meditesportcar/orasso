// Média et accréditation presse (lot 45, ARCHITECTURE-DA-V2 § 5.1 ; prototype DA v2 `s-agenda`, `s-accred`,
// `s-contenus`). L'accréditation est une candidature `kind = media` : mêmes statuts, décision par les routes du tri
// (`ApplicationService`, notifications propres au média), pass d'accès = badge presse, désistement par la route
// existante. Les contenus ne se publient que si le média est accrédité sur l'événement (V6) ; le profil média n'a plus de carte de presse : rien ne
// sort que vers son titulaire et l'administration (D26 : plus de numéro de carte de presse ; la colonne
// `press_card_verified_at` garde son nom en base et porte la vérification du profil média).
import {
  type AccreditationForOrganizer,
  type AccreditationRequest,
  type ApplicationStatus,
  activeApplicationStatuses,
  isLocked,
  localDate,
  type MediaAccreditationView,
  type MediaAgenda,
  type MediaContentCreate,
  type MediaContentsQuery,
  type MediaContentUpdate,
  type MediaContentView,
  type MediaEventBrief,
  type MediaFormat,
  type MediaProfileInput,
  type MediaProfileView,
  type MediaPublic,
  mediaLabels,
  mediaProfileIssue,
  type Page,
  type PressSettingsInput,
  type PressSettingsView,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  accessPasses,
  adminAuditLog,
  applicationEvents,
  applications,
  checkins,
  eventPressSettings,
  events,
  mediaContents,
  mediaProfiles,
  mediaSavedEvents,
  notifications,
  structureBans,
  structures,
} from "../../db/schema";
import { requireOrganizer, requireOrganizerWrite, requirePlatformRole, staffAccess } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { organizerIds } from "../after-event/helpers";
import { type EventRow, eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { uploadsService } from "../uploads/service";
import { assertPressQuota } from "./quota";
import { contentView, type MediaContentRow, type MediaProfileRow, ownerView, publicView } from "./serializers";

const ACTIVE = activeApplicationStatuses as readonly ApplicationStatus[];
const HOUR = 3_600_000;

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/** Le profil média du compte (non supprimé). */
export async function mediaOfUser(userId: string, ex: Tx | typeof db = db): Promise<MediaProfileRow | null> {
  const row = await ex.query.mediaProfiles.findFirst({
    where: and(eq(mediaProfiles.userId, userId), isNull(mediaProfiles.deletedAt)),
  });
  return row ?? null;
}

async function requireMedia(v: Viewer, ex: Tx | typeof db = db): Promise<MediaProfileRow> {
  const p = await mediaOfUser(v.user.id, ex);
  if (!p) throw notFound(mediaLabels.profileMissing);
  return p;
}

const assertWritable = (v: Viewer) => {
  if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
    throw forbidden("Ton compte est suspendu : lecture seule.");
  }
};

const fieldsOf = (input: MediaProfileInput) => ({
  name: input.name,
  formats: input.formats,
  description: input.description,
  website: input.website ?? null,
  instagram: input.instagram,
  youtube: input.youtube ?? null,
  departments: input.departments,
});

const briefOf = (e: EventRow, structureName: string): MediaEventBrief => ({
  id: e.id,
  slug: e.slug,
  title: e.title,
  format: e.format,
  startsAt: e.startsAt.toISOString(),
  endsAt: e.endsAt.toISOString(),
  city: e.city,
  department: e.department,
  structureName,
});

/** Accréditation ouverte maintenant pour ce réglage. */
const isOpen = (s: typeof eventPressSettings.$inferSelect | undefined, t: Date) =>
  Boolean(s?.accreditationOpen && (!s.deadline || s.deadline > t));

/** Lundi de la semaine (date locale de Paris `AAAA-MM-JJ`) d'un instant. */
function weekStartOf(instant: Date): string {
  const day = new Date(`${localDate(instant)}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

function announce(eventId: string, app: { id: string; userId: string; status: ApplicationStatus }) {
  const payload = { applicationId: app.id, eventId, status: app.status };
  realtime.publish(`event:${eventId}:triage`, "application.changed", payload);
  realtime.publish(`user:${app.userId}`, "application.changed", payload);
}

/**
 * V6 tenu dans la durée : un contenu n'est public (et ne se met en avant ni ne se modifie) que si son média est
 * accrédité (`accepted`) sur l'événement **maintenant** ; un retrait ou un refus après coup le masque.
 */
const accreditedSql = sql`exists (select 1 from ${applications} where ${applications.eventId} = ${mediaContents.eventId}
  and ${applications.mediaProfileId} = ${mediaContents.mediaProfileId} and ${applications.status} = 'accepted')`;

async function assertAccredited(tx: Tx, eventId: string, mediaProfileId: string) {
  const [accredited] = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.eventId, eventId),
        eq(applications.mediaProfileId, mediaProfileId),
        eq(applications.status, "accepted"),
      ),
    );
  if (!accredited) throw forbidden(mediaLabels.notAccredited);
}

/**
 * Vues déjà comptées : un contenu, une session, une heure (une seule instance de l'API, comme `rateLimit`). Taille
 * plafonnée : au-delà, les plus anciennes entrées sortent (une Map garde l'ordre d'insertion).
 */
export const MAX_SEEN_VIEWS = 50_000;
const seenViews = new Map<string, number>();
let lastViewPrune = 0;

/** Tests : remet à zéro les vues déjà comptées. */
export function resetMediaViews() {
  seenViews.clear();
}

async function loadContents(where: ReturnType<typeof and>): Promise<MediaContentView[]> {
  const rows = await db
    .select({ c: mediaContents, e: events, m: mediaProfiles })
    .from(mediaContents)
    .innerJoin(events, eq(events.id, mediaContents.eventId))
    .innerJoin(mediaProfiles, eq(mediaProfiles.id, mediaContents.mediaProfileId))
    .where(where)
    .orderBy(sql`${mediaContents.featuredAt} desc nulls last`, desc(mediaContents.publishedAt));
  return rows.map(({ c, e, m }) => contentView(c, e, m));
}

async function ownContent(tx: Tx, v: Viewer, id: string): Promise<{ c: MediaContentRow; m: MediaProfileRow }> {
  const m = await requireMedia(v, tx);
  const [c] = await tx
    .select()
    .from(mediaContents)
    .where(and(eq(mediaContents.id, id), eq(mediaContents.mediaProfileId, m.id), isNull(mediaContents.deletedAt)))
    .for("update");
  if (!c) throw notFound(mediaLabels.contentNotFound);
  return { c, m };
}

async function contentById(id: string): Promise<MediaContentView> {
  const [view] = await loadContents(and(eq(mediaContents.id, id)));
  if (!view) throw notFound(mediaLabels.contentNotFound);
  return view;
}

export const mediaService = {
  // --- Profil -------------------------------------------------------------------------------------------------------

  async mine(v: Viewer): Promise<MediaProfileView | null> {
    const p = await mediaOfUser(v.user.id);
    return p ? ownerView(p) : null;
  },

  /**
   * `PUT /me/media-profile` : crée ou remplace le profil (un par compte). Changer le nom, le site, Instagram, YouTube (ou le
   * logo) remet la vérification à zéro ; la description, les formats et les départements la gardent.
   */
  async upsert(v: Viewer, input: MediaProfileInput): Promise<MediaProfileView> {
    assertWritable(v);
    rateLimit("mediaWrite", v.user.id);
    const existing = await mediaOfUser(v.user.id);
    if (existing) {
      // Identité = ce que l'organisation voit pour décider : la modifier relance la vérification (usurpation sinon).
      const next = fieldsOf(input);
      const identityChanged =
        next.name !== existing.name ||
        next.website !== existing.website ||
        (next.instagram ?? null) !== existing.instagram ||
        next.youtube !== existing.youtube;
      const [row] = await db
        .update(mediaProfiles)
        .set({ ...fieldsOf(input), ...(identityChanged ? { pressCardVerifiedAt: null } : {}) })
        .where(eq(mediaProfiles.id, existing.id))
        .returning();
      // Synchro différentielle du staff : « Presse · <nom> » vient du profil.
      if (input.name !== existing.name) {
        await db
          .update(applications)
          .set({ updatedAt: now() })
          .where(and(eq(applications.mediaProfileId, existing.id), inArray(applications.status, [...ACTIVE])));
      }
      return ownerView(row as MediaProfileRow);
    }
    try {
      const [row] = await db
        .insert(mediaProfiles)
        .values({ userId: v.user.id, ...fieldsOf(input) })
        .returning();
      return ownerView(row as MediaProfileRow);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", mediaLabels.profileExists);
      throw error;
    }
  },

  /** `POST /me/media-profile/logo {key}` : clé de `POST /me/uploads purpose=media_logo` ; `DELETE` : `key = null`. */
  async setLogo(v: Viewer, key: string | null): Promise<MediaProfileView> {
    assertWritable(v);
    rateLimit("mediaWrite", v.user.id);
    const { row, old } = await withTx(async (tx) => {
      const p = await requireMedia(v, tx);
      if (key && !(await uploadsService.consume(tx, v.user.id, key, "media_logo"))) {
        throw validation(mediaLabels.imageUnknown);
      }
      const [updated] = await tx
        .update(mediaProfiles)
        .set({ logoKey: key, ...(key !== p.logoKey ? { pressCardVerifiedAt: null } : {}) })
        .where(eq(mediaProfiles.id, p.id))
        .returning();
      return { row: updated as MediaProfileRow, old: p.logoKey };
    });
    if (old && old !== key) await storage.remove(old).catch(() => undefined);
    return ownerView(row);
  },

  /** `GET /media/:id` (connectés) : fiche publique, sans donnée privée. */
  async getPublic(id: string): Promise<MediaPublic> {
    const p = await db.query.mediaProfiles.findFirst({ where: eq(mediaProfiles.id, id) });
    if (!p || p.deletedAt) throw notFound("Média introuvable");
    return publicView(p);
  },

  /** Mêmes champs et règles de publication que les contenus publics d'un événement. */
  async publicForMedia(id: string, q: MediaContentsQuery): Promise<Page<MediaContentView>> {
    await this.getPublic(id);
    const rows = await db
      .select({ c: mediaContents, e: events, m: mediaProfiles })
      .from(mediaContents)
      .innerJoin(events, eq(events.id, mediaContents.eventId))
      .innerJoin(mediaProfiles, eq(mediaProfiles.id, mediaContents.mediaProfileId))
      .where(
        and(
          eq(mediaContents.mediaProfileId, id),
          isNull(mediaContents.deletedAt),
          isNull(mediaProfiles.deletedAt),
          ne(events.status, "draft"),
          ne(events.admission, "invite_only"),
          accreditedSql,
          q.cursor ? lt(mediaContents.id, q.cursor) : undefined,
        ),
      )
      .orderBy(desc(mediaContents.id))
      .limit(q.limit + 1);
    const items = rows.slice(0, q.limit);
    return {
      items: items.map(({ c, e, m }) => contentView(c, e, m)),
      nextCursor: rows.length > q.limit ? (items.at(-1)?.c.id ?? null) : null,
    };
  },

  // --- Accréditations -------------------------------------------------------------------------------------------------

  /**
   * `POST /events/:id/accreditations` : profil complet, accréditation ouverte, date limite non passée, quota non atteint
   * (accréditations données), pas d'accréditation active. Crée une candidature `kind = media` en attente (hors capacité).
   */
  async requestAccreditation(v: Viewer, eventId: string, input: AccreditationRequest): Promise<MediaAccreditationView> {
    assertWritable(v);
    rateLimit("mediaAccreditation", v.user.id);
    const t = now();
    try {
      const created = await withTx(async (tx, after) => {
        const event = await eventsRepo.lockForUpdate(tx, eventId);
        if (event.status === "draft") throw notFound("Événement introuvable");
        if (event.status !== "published") throw conflict("conflict", "Événement annulé");
        if (event.admission === "invite_only") throw new AppError(403, "invite_only", "Événement sur invitation");
        if (t >= event.endsAt) throw new AppError(423, "locked", mediaLabels.eventEnded);
        const banned = await tx.query.structureBans.findFirst({
          where: and(eq(structureBans.structureId, event.structureId), eq(structureBans.userId, v.user.id)),
        });
        if (banned) throw forbidden("Tu ne peux pas candidater aux événements de cette structure");

        const profile = await requireMedia(v, tx);
        const issue = mediaProfileIssue(profile);
        if (issue) throw validation(issue, { reason: "profile_incomplete" });

        const settings = await tx.query.eventPressSettings.findFirst({
          where: eq(eventPressSettings.eventId, eventId),
        });
        if (!settings?.accreditationOpen) throw conflict("accreditation_closed", mediaLabels.accreditationClosed);
        if (settings.deadline && settings.deadline <= t) {
          throw conflict("accreditation_deadline_passed", mediaLabels.deadlinePassed);
        }
        // Verrouillage à H-2, comme les candidatures (une date limite plus tôt a déjà répondu au-dessus).
        if (isLocked(event, t)) throw new AppError(423, "locked", mediaLabels.requestsLocked);
        const [existing] = await tx
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.eventId, eventId),
              eq(applications.mediaProfileId, profile.id),
              inArray(applications.status, [...ACTIVE]),
            ),
          );
        if (existing) throw conflict("conflict", mediaLabels.alreadyRequested);
        await assertPressQuota(tx, eventId);

        const [row] = await tx
          .insert(applications)
          .values({
            eventId,
            userId: v.user.id,
            kind: "media",
            vehicleId: null,
            mediaProfileId: profile.id,
            mediaFormats: input.formats,
            status: "pending",
            rulesAcceptedAt: t,
            companions: 0,
            message: input.message,
            followStructure: false,
          })
          .returning();
        if (!row) throw new Error("Accréditation non enregistrée");
        await tx.insert(applicationEvents).values({
          applicationId: row.id,
          fromStatus: null,
          toStatus: "pending",
          actor: "user",
          actorUserId: v.user.id,
          at: t,
        });
        // L'organisation est prévenue (famille `staff`) : une demande à trancher.
        const structure = await tx.query.structures.findFirst({ where: eq(structures.id, event.structureId) });
        for (const userId of await organizerIds(event.structureId, tx)) {
          await notificationsService.notify(tx, userId, "accreditation_requested", {
            title: mediaLabels.requestedTitle,
            body: mediaLabels.requestedBody(profile.name, event.title),
            eventId: event.id,
            eventStartsAt: event.startsAt,
            data: { eventId: event.id, applicationId: row.id, screen: "press" },
            link: mediaLabels.linkTriage(structure?.slug ?? "", event.id),
          });
        }
        after(() => {
          announce(event.id, row);
          notificationsService.kick();
        });
        return row;
      });
      return (await this.mineAccreditations(v, "all")).find((a) => a.id === created.id) as MediaAccreditationView;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", mediaLabels.alreadyRequested);
      throw error;
    }
  },

  /** `GET /me/accreditations` : à venir (ou passées) ; badge presse, consignes, couverture (contenus et vues). */
  async mineAccreditations(v: Viewer, scope: "upcoming" | "past" | "all"): Promise<MediaAccreditationView[]> {
    const t = now();
    const rows = await db
      .select({ a: applications, e: events, structureName: structures.name })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(
        and(
          eq(applications.userId, v.user.id),
          eq(applications.kind, "media"),
          scope === "all" ? undefined : scope === "upcoming" ? gt(events.endsAt, t) : lte(events.endsAt, t),
        ),
      )
      .orderBy(scope === "past" ? desc(events.startsAt) : asc(events.startsAt), asc(applications.createdAt));
    if (!rows.length) return [];
    const appIds = rows.map((r) => r.a.id);
    const eventIds = [...new Set(rows.map((r) => r.e.id))];
    const passes = await db
      .select()
      .from(accessPasses)
      .where(inArray(accessPasses.applicationId, appIds))
      .orderBy(desc(accessPasses.issuedAt));
    const settings = await db.select().from(eventPressSettings).where(inArray(eventPressSettings.eventId, eventIds));
    const settingsOf = new Map(settings.map((s) => [s.eventId, s]));
    const entries = await db
      .select({ applicationId: checkins.applicationId, at: checkins.checkedInAt })
      .from(checkins)
      .where(inArray(checkins.applicationId, appIds));
    const profileIds = [...new Set(rows.flatMap((r) => (r.a.mediaProfileId ? [r.a.mediaProfileId] : [])))];
    const coverage = profileIds.length
      ? await db
          .select({
            profileId: mediaContents.mediaProfileId,
            eventId: mediaContents.eventId,
            n: sql<number>`count(*)::int`,
            views: sql<number>`coalesce(sum(${mediaContents.views}), 0)::int`,
          })
          .from(mediaContents)
          .where(
            and(
              inArray(mediaContents.mediaProfileId, profileIds),
              inArray(mediaContents.eventId, eventIds),
              isNull(mediaContents.deletedAt),
            ),
          )
          .groupBy(mediaContents.mediaProfileId, mediaContents.eventId)
      : [];
    return rows.map(({ a, e, structureName }) => {
      const pass = passes.find((p) => p.applicationId === a.id);
      const s = settingsOf.get(e.id);
      const cov = coverage.find((c) => c.profileId === a.mediaProfileId && c.eventId === e.id);
      return {
        id: a.id,
        status: a.status,
        formats: (a.mediaFormats ?? []) as MediaFormat[],
        message: a.message,
        createdAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
        refusalNote: a.status === "refused" && a.refusalSent ? a.refusalNote : null,
        event: briefOf(e, structureName),
        pass: pass ? { id: pass.id, valid: !pass.revokedAt } : null,
        checkedInAt: entries.find((x) => x.applicationId === a.id)?.at.toISOString() ?? null,
        briefing:
          a.status === "accepted" && s ? { zones: s.zones, instructions: s.instructions, contact: s.contact } : null,
        coverage: { contents: cov?.n ?? 0, views: cov?.views ?? 0 },
        canWithdraw: ACTIVE.includes(a.status) && t < e.endsAt,
      };
    });
  },

  /** `GET /events/:id/accreditations` (organisation, staff de filtration) : demandes avec la fiche du média. */
  async listForOrganizer(v: Viewer, eventId: string): Promise<AccreditationForOrganizer[]> {
    const event = await eventsRepo.byId(eventId);
    const access = await staffAccess(v, event.structureId, ["filtering"], event.id);
    if (!access) throw forbidden("Réservé à l'organisation");
    const rows = await db
      .select({ a: applications, m: mediaProfiles })
      .from(applications)
      .innerJoin(mediaProfiles, eq(mediaProfiles.id, applications.mediaProfileId))
      .where(and(eq(applications.eventId, eventId), eq(applications.kind, "media")))
      .orderBy(asc(applications.createdAt));
    const contents = rows.length
      ? await loadContents(and(eq(mediaContents.eventId, eventId), isNull(mediaContents.deletedAt)))
      : [];
    return rows.map(({ a, m }) => ({
      id: a.id,
      status: a.status,
      formats: (a.mediaFormats ?? []) as MediaFormat[],
      message: a.message,
      createdAt: a.createdAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
      refusalNote: a.refusalNote,
      media: publicView(m),
      contents: contents.filter((c) => c.media.id === m.id),
    }));
  },

  // --- Réglages presse (organisateur) ---------------------------------------------------------------------------------

  async pressSettings(v: Viewer, eventId: string): Promise<PressSettingsView> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    return this.pressSettingsView(eventId);
  },

  async putPressSettings(v: Viewer, eventId: string, input: PressSettingsInput): Promise<PressSettingsView> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizerWrite(v, event.structureId);
    if (event.status !== "draft" && event.status !== "published") throw conflict("conflict", "Événement annulé");
    const values = {
      accreditationOpen: input.accreditationOpen,
      quota: input.quota ?? null,
      deadline: input.deadline ?? null,
      zones: input.zones,
      instructions: input.instructions,
      contact: input.contact,
    };
    await db
      .insert(eventPressSettings)
      .values({ eventId, ...values })
      .onConflictDoUpdate({ target: eventPressSettings.eventId, set: values });
    return this.pressSettingsView(eventId);
  },

  async pressSettingsView(eventId: string): Promise<PressSettingsView> {
    const s = await db.query.eventPressSettings.findFirst({ where: eq(eventPressSettings.eventId, eventId) });
    const counts = await db
      .select({ status: applications.status, n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.eventId, eventId), eq(applications.kind, "media")))
      .groupBy(applications.status);
    const n = (status: ApplicationStatus) => counts.find((c) => c.status === status)?.n ?? 0;
    return {
      eventId,
      accreditationOpen: s?.accreditationOpen ?? false,
      quota: s?.quota ?? null,
      deadline: s?.deadline?.toISOString() ?? null,
      zones: s?.zones ?? null,
      instructions: s?.instructions ?? null,
      contact: s?.contact ?? null,
      counts: { pending: n("pending"), accepted: n("accepted") },
    };
  },

  // --- Agenda et événements gardés ------------------------------------------------------------------------------------

  /** `GET /me/media/agenda` : accréditations en cours ou données et événements gardés, à venir, par semaine. */
  async agenda(v: Viewer): Promise<MediaAgenda> {
    const profile = await requireMedia(v);
    const t = now();
    const accredited = await db
      .select({ a: applications, e: events, structureName: structures.name })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(
        and(
          eq(applications.mediaProfileId, profile.id),
          inArray(applications.status, ["pending", "accepted"]),
          gte(events.endsAt, t),
          // Événement annulé : hors de l'agenda (ses accréditations sont passées à `cancelled` par l'annulation).
          eq(events.status, "published"),
        ),
      );
    const saved = await db
      .select({ e: events, structureName: structures.name })
      .from(mediaSavedEvents)
      .innerJoin(events, eq(events.id, mediaSavedEvents.eventId))
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(
        and(eq(mediaSavedEvents.mediaProfileId, profile.id), gte(events.endsAt, t), eq(events.status, "published")),
      );
    const savedIds = new Set(saved.map((s) => s.e.id));
    const byEvent = new Map<string, { e: EventRow; structureName: string }>();
    for (const r of [...accredited, ...saved]) byEvent.set(r.e.id, { e: r.e, structureName: r.structureName });
    const ids = [...byEvent.keys()];
    const settings = ids.length
      ? await db.select().from(eventPressSettings).where(inArray(eventPressSettings.eventId, ids))
      : [];
    const items = [...byEvent.values()]
      .sort((x, y) => x.e.startsAt.getTime() - y.e.startsAt.getTime())
      .map(({ e, structureName }) => {
        const app = accredited.find((r) => r.e.id === e.id)?.a;
        return {
          weekStart: weekStartOf(e.startsAt),
          item: {
            event: briefOf(e, structureName),
            accreditation: app ? { id: app.id, status: app.status } : null,
            saved: savedIds.has(e.id),
            accreditationOpen: isOpen(
              settings.find((s) => s.eventId === e.id),
              t,
            ),
          },
        };
      });
    const weeks: MediaAgenda["weeks"] = [];
    for (const { weekStart, item } of items) {
      const last = weeks.at(-1);
      if (last?.weekStart === weekStart) last.items.push(item);
      else weeks.push({ weekStart, items: [item] });
    }
    return { weeks };
  },

  async save(v: Viewer, eventId: string): Promise<void> {
    rateLimit("mediaWrite", v.user.id);
    const profile = await requireMedia(v);
    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    if (event?.status !== "published" || event.admission === "invite_only") throw notFound("Événement introuvable");
    await db.insert(mediaSavedEvents).values({ mediaProfileId: profile.id, eventId }).onConflictDoNothing();
  },

  async unsave(v: Viewer, eventId: string): Promise<void> {
    const profile = await requireMedia(v);
    await db
      .delete(mediaSavedEvents)
      .where(and(eq(mediaSavedEvents.mediaProfileId, profile.id), eq(mediaSavedEvents.eventId, eventId)));
  },

  // --- Contenus -------------------------------------------------------------------------------------------------------

  /** `GET /me/media-contents` : mes contenus, rangés par événement (le plus récent d'abord). */
  async mineContents(v: Viewer): Promise<MediaContentView[]> {
    const profile = await mediaOfUser(v.user.id);
    if (!profile) return [];
    const rows = await loadContents(and(eq(mediaContents.mediaProfileId, profile.id), isNull(mediaContents.deletedAt)));
    return rows.sort(
      (a, b) => b.event.startsAt.localeCompare(a.event.startsAt) || b.publishedAt.localeCompare(a.publishedAt),
    );
  },

  /** `POST /me/media-contents` : seulement si le média est accrédité (`accepted`) sur l'événement (V6). */
  async createContent(v: Viewer, input: MediaContentCreate): Promise<MediaContentView> {
    assertWritable(v);
    rateLimit("mediaContent", v.user.id);
    const id = await withTx(async (tx) => {
      const profile = await requireMedia(v, tx);
      const event = await tx.query.events.findFirst({ where: eq(events.id, input.eventId) });
      if (event?.status === "cancelled") throw conflict("conflict", mediaLabels.eventCancelled);
      await assertAccredited(tx, input.eventId, profile.id);
      // Publication idempotente (lot 59d) : les clés d'une galerie servent d'identifiant de tentative. Si une première
      // tentative a été validée mais que sa réponse s'est perdue, la reprise avec les mêmes clés (déjà consommées)
      // rend le contenu déjà publié au lieu d'échouer.
      if (input.photoKeys.length > 0) {
        const [again] = await tx
          .select({ id: mediaContents.id })
          .from(mediaContents)
          .where(
            and(
              eq(mediaContents.mediaProfileId, profile.id),
              eq(mediaContents.eventId, input.eventId),
              eq(mediaContents.photoKeys, input.photoKeys),
              isNull(mediaContents.deletedAt),
            ),
          )
          .limit(1);
        if (again) return again.id;
      }
      for (const key of input.photoKeys) {
        if (!(await uploadsService.consume(tx, v.user.id, key, "media_content"))) {
          throw validation(mediaLabels.imageUnknown);
        }
      }
      const [row] = await tx
        .insert(mediaContents)
        .values({
          mediaProfileId: profile.id,
          eventId: input.eventId,
          kind: input.kind,
          title: input.title,
          url: input.kind === "link" ? input.url : null,
          platform: input.platform,
          photoKeys: input.photoKeys,
          publishedAt: now(),
        })
        .returning({ id: mediaContents.id });
      if (!row) throw new Error("Contenu non enregistré");
      return row.id;
    });
    return contentById(id);
  },

  async updateContent(v: Viewer, id: string, input: MediaContentUpdate): Promise<MediaContentView> {
    assertWritable(v);
    rateLimit("mediaWrite", v.user.id);
    await withTx(async (tx) => {
      const { c } = await ownContent(tx, v, id);
      await assertAccredited(tx, c.eventId, c.mediaProfileId);
      const url = input.url === undefined ? c.url : input.url;
      if (c.kind === "link" && !url) throw validation("Adresse du contenu");
      await tx
        .update(mediaContents)
        .set({
          title: input.title ?? c.title,
          url: c.kind === "link" ? url : null,
          platform: input.platform ?? c.platform,
        })
        .where(eq(mediaContents.id, c.id));
    });
    return contentById(id);
  },

  /** Retrait d'un contenu : la ligne reste (vues de la couverture), ses photos sont effacées. */
  async deleteContent(v: Viewer, id: string): Promise<void> {
    assertWritable(v);
    const keys = await withTx(async (tx) => {
      const { c } = await ownContent(tx, v, id);
      await tx
        .update(mediaContents)
        .set({ deletedAt: now(), photoKeys: [], featuredAt: null })
        .where(eq(mediaContents.id, c.id));
      return c.photoKeys;
    });
    for (const k of keys) await storage.remove(k).catch(() => undefined);
  },

  /** `PATCH /events/:id/media-contents/:cid/feature` : l'organisateur met en avant (ou retire) un contenu. */
  async feature(v: Viewer, eventId: string, contentId: string, featured: boolean): Promise<MediaContentView> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizerWrite(v, event.structureId);
    if (event.status === "cancelled") throw conflict("conflict", mediaLabels.eventCancelled);
    await withTx(async (tx, after) => {
      const [row] = await tx
        .select({ c: mediaContents, m: mediaProfiles })
        .from(mediaContents)
        .innerJoin(mediaProfiles, eq(mediaProfiles.id, mediaContents.mediaProfileId))
        .where(
          and(eq(mediaContents.id, contentId), eq(mediaContents.eventId, eventId), isNull(mediaContents.deletedAt)),
        )
        .for("update");
      if (!row) throw notFound(mediaLabels.contentNotFound);
      if (featured) await assertAccredited(tx, eventId, row.c.mediaProfileId);
      const was = row.c.featuredAt !== null;
      await tx
        .update(mediaContents)
        .set({ featuredAt: featured ? (row.c.featuredAt ?? now()) : null })
        .where(eq(mediaContents.id, contentId));
      if (featured && !was && !row.m.deletedAt) {
        await notificationsService.notify(tx, row.m.userId, "media_content_featured", {
          title: mediaLabels.featuredTitle,
          body: mediaLabels.featuredBody(row.c.title, event.title),
          eventId: event.id,
          eventStartsAt: event.startsAt,
          data: { eventId: event.id, contentId, screen: "media_contents" },
          link: { label: "Voir l'événement", path: `/e/${event.slug}` },
        });
        after(() => notificationsService.kick());
      }
    });
    return contentById(contentId);
  },

  /** `GET /events/by-slug/:slug/media-contents` (public) : mis en avant d'abord, puis les plus récents. */
  async publicForEvent(slug: string): Promise<MediaContentView[]> {
    const event = await db.query.events.findFirst({ where: eq(events.slug, slug) });
    if (!event || event.status === "draft" || event.admission === "invite_only") {
      throw notFound("Événement introuvable");
    }
    return loadContents(
      and(
        eq(mediaContents.eventId, event.id),
        isNull(mediaContents.deletedAt),
        isNull(mediaProfiles.deletedAt),
        accreditedSql,
      ),
    );
  },

  /** `POST /media-contents/:id/view` : +1 par session (compte ou visiteur) et par heure ; jamais le média lui-même. */
  async view(id: string, session: string, viewer: Viewer | null): Promise<{ views: number }> {
    const [row] = await db
      .select({ c: mediaContents, ownerId: mediaProfiles.userId })
      .from(mediaContents)
      .innerJoin(mediaProfiles, eq(mediaProfiles.id, mediaContents.mediaProfileId))
      .where(and(eq(mediaContents.id, id), isNull(mediaContents.deletedAt)));
    if (!row) throw notFound(mediaLabels.contentNotFound);
    if (viewer?.user.id === row.ownerId) return { views: row.c.views };
    rateLimit("mediaView", `${session}|${id}`);
    const t = now().getTime();
    if (t - lastViewPrune > 10 * 60_000) {
      for (const [k, at] of seenViews) if (t - at >= HOUR) seenViews.delete(k);
      lastViewPrune = t;
    }
    const key = `${id}|${session}|${Math.floor(t / HOUR)}`;
    if (seenViews.has(key)) return { views: row.c.views };
    seenViews.set(key, t);
    while (seenViews.size > MAX_SEEN_VIEWS) {
      const oldest = seenViews.keys().next().value;
      if (oldest === undefined) break;
      seenViews.delete(oldest);
    }
    const [updated] = await db
      .update(mediaContents)
      .set({ views: sql`${mediaContents.views} + 1` })
      .where(eq(mediaContents.id, id))
      .returning({ views: mediaContents.views });
    return { views: updated?.views ?? row.c.views };
  },

  // --- Administration -------------------------------------------------------------------------------------------------

  /** `GET /admin/media?pending=1` : profils média, ceux à vérifier avec pending=1 (administration seulement). */
  async adminList(v: Viewer, pendingOnly: boolean): Promise<MediaProfileView[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select()
      .from(mediaProfiles)
      .where(and(isNull(mediaProfiles.deletedAt), pendingOnly ? isNull(mediaProfiles.pressCardVerifiedAt) : undefined))
      .orderBy(desc(mediaProfiles.createdAt))
      .limit(200);
    return rows.map(ownerView);
  },

  /** `POST /admin/media/:id/verify {verified}` : le profil média est vérifié (D26, tracé au journal). */
  async verifyProfile(v: Viewer, id: string, verified: boolean): Promise<MediaProfileView> {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      const p = await tx.query.mediaProfiles.findFirst({ where: eq(mediaProfiles.id, id) });
      if (!p || p.deletedAt) throw notFound("Média introuvable");
      const [row] = await tx
        .update(mediaProfiles)
        .set({ pressCardVerifiedAt: verified ? now() : null })
        .where(eq(mediaProfiles.id, id))
        .returning();
      await tx.insert(adminAuditLog).values({
        actorUserId: v.user.id,
        action: verified ? "media.verify" : "media.unverify",
        targetType: "media_profile",
        targetId: id,
      });
      return ownerView(row as MediaProfileRow);
    });
  },

  // --- Casquette ------------------------------------------------------------------------------------------------------

  /** « Décisions non vues » : notifications de décision d'accréditation non lues. */
  async unseenDecisions(userId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          or(eq(notifications.type, "accreditation_accepted"), eq(notifications.type, "accreditation_refused")),
        ),
      );
    return row?.n ?? 0;
  },
};
