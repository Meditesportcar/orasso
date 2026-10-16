// Prestataires (docs/01 « Prestataires », ARCHITECTURE-SUITE § 6, lot 21) : profil et photos, candidatures hors capacité
// (mêmes transitions que les véhicules, via `ApplicationService`), accréditation « média officiel », « Prestataires
// présents » de la fiche d'un événement, stand d'un pro.
import { randomBytes } from "node:crypto";
import {
  type ApplicationStatus,
  activeApplicationStatuses,
  canAccredit,
  type EventProviderPublic,
  eventAcceptsVendorType,
  instagramUrl,
  isLocked,
  lockAt,
  type OpenEventForProvider,
  PROVIDER_MAX_PHOTOS,
  type ProviderApplicationCreate,
  type ProviderApplicationView,
  type ProviderProfileInput,
  type ProviderProfileView,
  type ProviderPublic,
  providerProfileIssue,
  type VendorTypeCode,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, max, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import {
  applicationEvents,
  applications,
  checkins,
  events,
  notifications,
  proPhotos,
  proProfiles,
  providerPhotos,
  providerProfiles,
  structureBans,
  structures,
} from "../../db/schema";
import { organizerActor, requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import {
  loadProvider,
  loadProviders,
  ownerView,
  type ProviderRow,
  type ProviderWith,
  presentView,
  publicView,
} from "./serializers";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ACTIVE = activeApplicationStatuses as readonly ApplicationStatus[];

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

async function toWebp(file: File): Promise<Buffer> {
  if (file.size === 0) throw validation("Fichier vide");
  if (file.size > MAX_IMAGE_BYTES) throw new AppError(413, "payload_too_large", "Photo trop lourde (15 Mo au plus)");
  try {
    return await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError(415, "unsupported_media_type", "Image illisible (JPEG, PNG, WebP ou HEIC)");
  }
}

/** Le profil du compte (non supprimé), avec photos. */
export async function providerOfUser(userId: string): Promise<ProviderWith | null> {
  const row = await db.query.providerProfiles.findFirst({
    where: and(eq(providerProfiles.userId, userId), isNull(providerProfiles.deletedAt)),
  });
  return row ? loadProvider(row.id) : null;
}

async function requireProfile(v: Viewer): Promise<ProviderWith> {
  const p = await providerOfUser(v.user.id);
  if (!p) throw notFound("Crée d'abord ton profil de prestataire");
  return p;
}

const fieldsOf = (input: ProviderProfileInput) => ({
  customType: input.type === "other" ? input.customType : null,
  name: input.name,
  description: input.description,
  phone: input.phone ?? null,
  email: input.email ?? null,
  website: input.website ?? null,
  instagram: input.instagram,
  portfolioUrl: input.portfolioUrl ?? null,
  departments: input.departments,
});

/** Diffusion temps réel d'un changement de candidature (tri de l'organisateur, compte du candidat). */
function announce(event: { id: string }, app: { id: string; userId: string; status: ApplicationStatus }) {
  const payload = { applicationId: app.id, eventId: event.id, status: app.status };
  realtime.publish(`event:${event.id}:triage`, "application.changed", payload);
  realtime.publish(`user:${app.userId}`, "application.changed", payload);
}

export const providersService = {
  // --- Profil -------------------------------------------------------------------------------------------------------

  async mine(v: Viewer): Promise<ProviderProfileView | null> {
    const p = await providerOfUser(v.user.id);
    return p ? ownerView(p) : null;
  },

  /** `PUT /me/provider-profile` : crée ou remplace le profil (un par compte). Le type d'un stand ne change pas. */
  async upsert(v: Viewer, input: ProviderProfileInput): Promise<ProviderProfileView> {
    rateLimit("proWrite", v.user.id);
    const existing = await providerOfUser(v.user.id);
    if (existing) {
      const type = existing.type === "stand" ? "stand" : input.type;
      await db
        .update(providerProfiles)
        .set({
          ...fieldsOf({ ...input, type: input.type }),
          type,
          customType: type === "other" ? input.customType : null,
        })
        .where(eq(providerProfiles.id, existing.id));
      return ownerView((await loadProvider(existing.id)) as ProviderWith);
    }
    try {
      const [row] = await db
        .insert(providerProfiles)
        .values({ userId: v.user.id, type: input.type, ...fieldsOf(input) })
        .returning();
      if (!row) throw new Error("Profil non enregistré");
      return ownerView((await loadProvider(row.id)) as ProviderWith);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", "Tu as déjà un profil de prestataire");
      throw error;
    }
  },

  /** `POST /me/provider-profile/photos` : photo recompressée (WebP 1600 px), 8 au plus. */
  async addPhoto(v: Viewer, file: File): Promise<ProviderProfileView> {
    rateLimit("fileUpload", v.user.id);
    const p = await requireProfile(v);
    if (p.photos.length >= PROVIDER_MAX_PHOTOS) throw conflict("conflict", `${PROVIDER_MAX_PHOTOS} photos au maximum`);
    const data = await toWebp(file);
    const key = `providers/${p.id}/photo-${randomBytes(6).toString("hex")}.webp`;
    await storage.put(key, data);
    const [agg] = await db
      .select({ maxPos: max(providerPhotos.position) })
      .from(providerPhotos)
      .where(eq(providerPhotos.providerId, p.id));
    await db.insert(providerPhotos).values({ providerId: p.id, storageKey: key, position: (agg?.maxPos ?? -1) + 1 });
    return ownerView((await loadProvider(p.id)) as ProviderWith);
  },

  async removePhoto(v: Viewer, photoId: string): Promise<ProviderProfileView> {
    const p = await requireProfile(v);
    const photo = p.photos.find((x) => x.id === photoId);
    if (!photo) throw notFound("Photo introuvable");
    await db.delete(providerPhotos).where(eq(providerPhotos.id, photoId));
    await storage.remove(photo.storageKey);
    return ownerView((await loadProvider(p.id)) as ProviderWith);
  },

  async reorderPhotos(v: Viewer, photoIds: string[]): Promise<ProviderProfileView> {
    const p = await requireProfile(v);
    const set = new Set(p.photos.map((x) => x.id));
    if (photoIds.length !== set.size || !photoIds.every((id) => set.has(id)) || new Set(photoIds).size !== set.size) {
      throw validation("La liste doit contenir toutes les photos, une fois chacune");
    }
    await db.transaction(async (tx) => {
      for (const [i, id] of photoIds.entries()) {
        await tx.update(providerPhotos).set({ position: i }).where(eq(providerPhotos.id, id));
      }
    });
    return ownerView((await loadProvider(p.id)) as ProviderWith);
  },

  /**
   * `POST /me/provider-profile/from-pro` : le stand d'un pro. Crée (ou réutilise) le profil lié à sa fiche pro
   * (`type = stand`), avec le nom, la description, les contacts, l'Instagram et les photos de la fiche.
   */
  async fromPro(v: Viewer): Promise<ProviderProfileView> {
    rateLimit("proWrite", v.user.id);
    const pro = await db.query.proProfiles.findFirst({
      where: and(eq(proProfiles.ownerUserId, v.user.id), isNull(proProfiles.deletedAt)),
    });
    if (!pro) throw forbidden("Réservé aux pros : crée d'abord ta fiche pro");
    const existing = await providerOfUser(v.user.id);
    if (existing) {
      if (existing.type !== "stand" || existing.proProfileId !== pro.id) {
        throw conflict("conflict", "Tu as déjà un profil de prestataire : un compte n'en a qu'un");
      }
      return ownerView(existing);
    }
    const proPhotoRows = await db.query.proPhotos.findMany({
      where: eq(proPhotos.proId, pro.id),
      orderBy: [asc(proPhotos.position)],
      limit: PROVIDER_MAX_PHOTOS,
    });
    const logo = pro.logoKey ? [{ storageKey: pro.logoKey }] : [];
    const sources = [...proPhotoRows, ...logo].slice(0, PROVIDER_MAX_PHOTOS);
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(providerProfiles)
        .values({
          userId: v.user.id,
          type: "stand",
          name: pro.name.slice(0, 60),
          description: pro.description ? pro.description.slice(0, 800) : null,
          phone: pro.phone,
          email: pro.email,
          website: pro.website,
          instagram: pro.socials.instagram ?? null,
          departments: pro.interventionDepartments.length
            ? pro.interventionDepartments
            : pro.department
              ? [pro.department]
              : [],
          proProfileId: pro.id,
        })
        .returning();
      if (!row) throw new Error("Stand non enregistré");
      let position = 0;
      for (const s of sources) {
        const data = await storage.get(s.storageKey);
        if (!data) continue;
        const key = `providers/${row.id}/photo-${randomBytes(6).toString("hex")}.webp`;
        await storage.put(key, data);
        await tx.insert(providerPhotos).values({ providerId: row.id, storageKey: key, position: position++ });
      }
      return row;
    });
    return ownerView((await loadProvider(created.id)) as ProviderWith);
  },

  /** `GET /providers/:id` (connectés) : profil public, jamais le téléphone ni l'e-mail. */
  async getPublic(id: string): Promise<ProviderPublic> {
    const p = await loadProvider(id);
    if (!p || p.deletedAt) throw notFound("Prestataire introuvable");
    return publicView(p);
  },

  // --- Événements ouverts ---------------------------------------------------------------------------------------------

  /** `GET /events/open-to-providers?type=` : publiés, à venir, non verrouillés, dont `vendor_types` accepte le type. */
  async openEvents(v: Viewer, typeParam?: VendorTypeCode): Promise<OpenEventForProvider[]> {
    const profile = await providerOfUser(v.user.id);
    const type = typeParam ?? (profile?.type as VendorTypeCode | undefined);
    if (!type) return [];
    const customType = profile && type === profile.type ? profile.customType : null;
    const t = now();
    const rows = await db
      .select({ e: events, structureName: structures.name })
      .from(events)
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(
        and(
          eq(events.status, "published"),
          gt(events.endsAt, t),
          sql`${events.admission} <> 'invite_only'`,
          sql`cardinality(${events.vendorTypes}) > 0`,
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(200);
    const open = rows.filter(({ e }) => !isLocked(e, t) && eventAcceptsVendorType(e.vendorTypes, type, customType));
    const mine =
      profile && open.length
        ? await db.query.applications.findMany({
            where: and(
              eq(applications.providerProfileId, profile.id),
              inArray(
                applications.eventId,
                open.map((r) => r.e.id),
              ),
            ),
            orderBy: [desc(applications.createdAt)],
          })
        : [];
    return open.map(({ e, structureName }) => {
      const app =
        mine.find((a) => a.eventId === e.id && ACTIVE.includes(a.status)) ?? mine.find((a) => a.eventId === e.id);
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        format: e.format,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        city: e.city,
        status: e.status,
        department: e.department,
        structureName,
        lockAt: lockAt(e).toISOString(),
        vendorTypes: e.vendorTypes,
        myApplication: app ? { id: app.id, status: app.status } : null,
      };
    });
  },

  // --- Candidatures ---------------------------------------------------------------------------------------------------

  /** `POST /events/:id/provider-applications` (§ 6.2) : `pending`, hors capacité, jamais admise d'office. */
  async apply(v: Viewer, eventId: string, input: ProviderApplicationCreate): Promise<ProviderApplicationView> {
    const t = now();
    try {
      const created = await withTx(async (tx, after) => {
        const event = await eventsRepo.lockForUpdate(tx, eventId);
        if (event.status === "draft") throw notFound("Événement introuvable");
        if (event.status !== "published") throw conflict("conflict", "Événement annulé");
        if (event.admission === "invite_only") throw forbidden("Événement sur invitation");
        if (isLocked(event, t)) throw new AppError(423, "locked", "Candidatures verrouillées");
        const banned = await tx.query.structureBans.findFirst({
          where: and(eq(structureBans.structureId, event.structureId), eq(structureBans.userId, v.user.id)),
        });
        if (banned) throw forbidden("Tu ne peux pas candidater aux événements de cette structure");

        const profileRow = await tx.query.providerProfiles.findFirst({
          where: and(eq(providerProfiles.userId, v.user.id), isNull(providerProfiles.deletedAt)),
        });
        if (!profileRow) throw validation("Crée d'abord ton profil de prestataire");
        const [photos] = await tx
          .select({ n: count() })
          .from(providerPhotos)
          .where(eq(providerPhotos.providerId, profileRow.id));
        const issue = providerProfileIssue({
          name: profileRow.name,
          type: profileRow.type as VendorTypeCode,
          photosCount: photos?.n ?? 0,
          instagram: profileRow.instagram,
          portfolioUrl: profileRow.portfolioUrl,
        });
        if (issue) throw validation(issue, { reason: "profile_incomplete" });
        if (!eventAcceptsVendorType(event.vendorTypes, profileRow.type as VendorTypeCode, profileRow.customType)) {
          throw validation("Cet événement n'accueille pas ce type de prestataire", { reason: "type_not_accepted" });
        }

        const [row] = await tx
          .insert(applications)
          .values({
            eventId,
            userId: v.user.id,
            kind: "provider",
            vehicleId: null,
            providerProfileId: profileRow.id,
            status: "pending",
            rulesAcceptedAt: t,
            companions: 0,
            message: input.message,
            followStructure: false,
          })
          .returning();
        if (!row) throw new Error("Candidature non enregistrée");
        await tx.insert(applicationEvents).values({
          applicationId: row.id,
          fromStatus: null,
          toStatus: "pending",
          actor: "user",
          actorUserId: v.user.id,
          at: t,
        });
        after(() => announce(event, row));
        return row;
      });
      return (await this.mineApplications(v, "all")).find((a) => a.id === created.id) as ProviderApplicationView;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", "Tu as déjà une candidature pour cet événement");
      throw error;
    }
  },

  /** `GET /me/provider-applications` : mes candidatures (à venir ou passées). */
  async mineApplications(v: Viewer, scope: "upcoming" | "past" | "all"): Promise<ProviderApplicationView[]> {
    const t = now();
    const rows = await db
      .select({ a: applications, e: events })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(
          eq(applications.userId, v.user.id),
          eq(applications.kind, "provider"),
          scope === "all" ? undefined : scope === "upcoming" ? gt(events.endsAt, t) : lte(events.endsAt, t),
        ),
      )
      .orderBy(scope === "past" ? desc(events.startsAt) : asc(events.startsAt), asc(applications.createdAt));
    if (!rows.length) return [];
    const appIds = rows.map((r) => r.a.id);
    const entries = await db.query.checkins.findMany({ where: inArray(checkins.applicationId, appIds) });
    const enteredAt = new Map(entries.map((c) => [c.applicationId, c.checkedInAt]));
    const waiting = await db
      .select({ id: applications.id, eventId: applications.eventId })
      .from(applications)
      .where(
        and(
          inArray(applications.eventId, [...new Set(rows.map((r) => r.e.id))]),
          eq(applications.kind, "provider"),
          eq(applications.status, "waitlisted"),
        ),
      )
      .orderBy(sql`${applications.waitlistRank} asc nulls last`, asc(applications.waitlistedAt));
    const rankOf = new Map<string, number>();
    const perEvent = new Map<string, number>();
    for (const w of waiting) {
      const n = (perEvent.get(w.eventId) ?? 0) + 1;
      perEvent.set(w.eventId, n);
      rankOf.set(w.id, n);
    }
    return rows.map(({ a, e }) => ({
      id: a.id,
      status: a.status,
      accreditedMedia: a.accreditedMedia,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
      waitlistRank: a.status === "waitlisted" ? (rankOf.get(a.id) ?? null) : null,
      refusalNote: a.status === "refused" && a.refusalSent ? a.refusalNote : null,
      event: {
        id: e.id,
        slug: e.slug,
        title: e.title,
        format: e.format,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        city: e.city,
        status: e.status,
      },
      checkedInAt: enteredAt.get(a.id)?.toISOString() ?? null,
      canWithdraw: ACTIVE.includes(a.status) && t < e.endsAt,
    }));
  },

  // --- Accréditation et fiche de l'événement ------------------------------------------------------------------------

  /** `PATCH /events/:id/applications/:appId/accreditation` : « Média officiel », photographe retenu, par événement. */
  async setAccreditation(v: Viewer, eventId: string, applicationId: string, accredited: boolean) {
    const event = await eventsRepo.byId(eventId);
    const access = await requireOrganizer(v, event.structureId);
    return withTx(async (tx, after) => {
      await eventsRepo.lockForUpdate(tx, eventId);
      const [app] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, applicationId), eq(applications.eventId, eventId)))
        .for("update");
      if (app?.kind !== "provider" || !app.providerProfileId) throw notFound("Candidature introuvable");
      const provider = await loadProvider(app.providerProfileId, tx);
      if (!provider || !canAccredit({ type: provider.type as VendorTypeCode }, app.status)) {
        throw validation("L'accréditation est réservée aux photographes retenus");
      }
      const [row] = await tx
        .update(applications)
        .set({ accreditedMedia: accredited })
        .where(eq(applications.id, applicationId))
        .returning();
      if (!row) throw notFound("Candidature introuvable");
      after(() => {
        announce(event, row);
        realtime.publish(`event:${eventId}:access`, "access.changed", { applicationIds: [row.id] });
      });
      return { applicationId: row.id, accreditedMedia: row.accreditedMedia, actor: organizerActor(access) };
    });
  },

  /** `GET /events/by-slug/:slug/providers` (public) : les prestataires retenus d'un événement publié. */
  async presentAtEvent(slug: string): Promise<EventProviderPublic[]> {
    const event = await db.query.events.findFirst({ where: eq(events.slug, slug) });
    if (!event || event.status === "draft" || event.admission === "invite_only")
      throw notFound("Événement introuvable");
    return this.presentAtEventId(event.id);
  },

  async presentAtEventId(eventId: string): Promise<EventProviderPublic[]> {
    const rows = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.eventId, eventId), eq(applications.kind, "provider"), eq(applications.status, "accepted")),
      )
      .orderBy(asc(applications.decidedAt), asc(applications.createdAt));
    const providers = await loadProviders(rows.flatMap((r) => (r.providerProfileId ? [r.providerProfileId] : [])));
    return rows.flatMap((r) => {
      const p = r.providerProfileId ? providers.get(r.providerProfileId) : undefined;
      return p ? [presentView(p, r.accreditedMedia)] : [];
    });
  },

  // --- Casquette ------------------------------------------------------------------------------------------------------

  /** « Décisions non vues » : notifications de décision non lues sur mes candidatures de prestataire. */
  async unseenDecisions(userId: string): Promise<number> {
    const mineIds = db
      .select({ id: sql<string>`${applications.id}::text` })
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.kind, "provider")));
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          inArray(notifications.type, ["application_accepted", "application_refused", "application_waitlisted"]),
          inArray(sql`(${notifications.data} ->> 'applicationId')`, mineIds),
        ),
      );
    return row?.n ?? 0;
  },

  instagramUrl,
};

export type { ProviderRow };
