// Emplacement sponsorisé de l'Accueil (lot 30, ARCHITECTURE-SUITE § 13.3). Vendu directement à un pro de la plateforme,
// créé par l'administration, même apparence que le reste avec la mention « Sponsorisé ». Aucune donnée personnelle n'est
// transmise au pro : il n'a que des totaux (affichages, clics). Ciblage : départements du secteur et centres d'intérêt.
import { randomBytes } from "node:crypto";
import {
  type HomeSponsored,
  type PlacementTarget,
  pickWeighted,
  placementMatch,
  proVisibility,
  type SponsoredPlacementAdmin,
  type SponsoredPlacementCreate,
  type SponsoredPlacementUpdate,
} from "@orasso/shared";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import { adminAuditLog, proProfiles, sponsoredDailyStats, sponsoredPlacements } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { proOwnerActive } from "../pros/explore";
import { parisDay } from "../pros/service";

type Row = typeof sponsoredPlacements.$inferSelect;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const target = (r: Row): PlacementTarget => ({
  id: r.id,
  status: r.status,
  startsOn: r.startsOn,
  endsOn: r.endsOn,
  departments: r.departments,
  categoryIds: r.categoryIds,
  dailyCap: r.dailyCap,
});

export const sponsoredService = {
  /**
   * Emplacement à montrer à cette personne, ou `null`. Candidats : actifs, dans leur période, pro publié dont le titulaire
   * est en règle, et fiche non réduite à la « fiche de base » (`proVisibility` : la mise en avant en fait partie, lot 21).
   * Tirage pondéré avec une graine (personne + jour) : le même emplacement toute la journée, sans compter un affichage de
   * plus à chaque rafraîchissement du tirage. L'affichage est compté à la sélection.
   */
  async select(v: Viewer, interests: string[]): Promise<HomeSponsored | null> {
    const t = now();
    if (proVisibility(null, null, t).hidden.promotion) return null;
    const today = parisDay(t);
    const rows = await db
      .select({ placement: sponsoredPlacements, pro: proProfiles })
      .from(sponsoredPlacements)
      .innerJoin(proProfiles, eq(proProfiles.id, sponsoredPlacements.proProfileId))
      .where(
        and(
          eq(sponsoredPlacements.status, "active"),
          lte(sponsoredPlacements.startsOn, today),
          gte(sponsoredPlacements.endsOn, today),
          isNull(proProfiles.deletedAt),
          sql`${proProfiles.publishedAt} is not null`,
          proOwnerActive(t),
        ),
      );
    if (!rows.length) return null;
    const stats = await db
      .select({ id: sponsoredDailyStats.placementId, n: sponsoredDailyStats.impressions })
      .from(sponsoredDailyStats)
      .where(
        and(
          eq(sponsoredDailyStats.day, today),
          inArray(
            sponsoredDailyStats.placementId,
            rows.map((r) => r.placement.id),
          ),
        ),
      );
    const shownToday = new Map(stats.map((s) => [s.id, s.n]));
    const candidates = rows.flatMap((r) => {
      const m = placementMatch(target(r.placement), {
        today,
        sector: v.profile.departments,
        interests,
        impressionsToday: shownToday.get(r.placement.id) ?? 0,
      });
      return m.eligible ? [{ id: r.placement.id, weight: m.weight, row: r }] : [];
    });
    const picked = pickWeighted(candidates, `${v.user.id}|${today}`);
    if (!picked) return null;
    await this.count(picked.id, today, "impressions");
    const { placement, pro } = picked.row;
    return {
      id: placement.id,
      title: placement.title,
      body: placement.body,
      imageUrl: storage.url(placement.imageKey),
      linkUrl: placement.linkUrl,
      pro: { slug: pro.slug, name: pro.name, logoUrl: storage.url(pro.logoKey) },
    };
  },

  /** Compte un affichage ou un clic : total de l'emplacement et du jour (le plafond quotidien lit le second). */
  async count(id: string, day: string, kind: "impressions" | "clicks"): Promise<void> {
    const inc = { impressions: kind === "impressions" ? 1 : 0, clicks: kind === "clicks" ? 1 : 0 };
    await db
      .update(sponsoredPlacements)
      .set({
        impressions: sql`${sponsoredPlacements.impressions} + ${inc.impressions}`,
        clicks: sql`${sponsoredPlacements.clicks} + ${inc.clicks}`,
      })
      .where(eq(sponsoredPlacements.id, id));
    await db
      .insert(sponsoredDailyStats)
      .values({ placementId: id, day, ...inc })
      .onConflictDoUpdate({
        target: [sponsoredDailyStats.placementId, sponsoredDailyStats.day],
        set: {
          impressions: sql`${sponsoredDailyStats.impressions} + ${inc.impressions}`,
          clicks: sql`${sponsoredDailyStats.clicks} + ${inc.clicks}`,
        },
      });
  },

  /** `POST /sponsored/:id/click` : un clic compté, seulement pour un emplacement actuellement diffusé. */
  async click(v: Viewer, id: string): Promise<void> {
    rateLimit("sponsoredClick", v.user.id);
    const today = parisDay(now());
    const p = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, id) });
    if (p?.status !== "active" || today < p.startsOn || today > p.endsOn) {
      throw notFound("Emplacement introuvable");
    }
    await this.count(id, today, "clicks");
  },

  // --- Administration (routes seulement ; la page est au lot 33) -------------------------------------------------

  async adminList(v: Viewer): Promise<SponsoredPlacementAdmin[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select({ p: sponsoredPlacements, proName: proProfiles.name })
      .from(sponsoredPlacements)
      .innerJoin(proProfiles, eq(proProfiles.id, sponsoredPlacements.proProfileId))
      .orderBy(asc(sponsoredPlacements.startsOn), asc(sponsoredPlacements.id));
    return rows.map((r) => adminView(r.p, r.proName));
  },

  async adminCreate(v: Viewer, input: SponsoredPlacementCreate, ip: string | null): Promise<SponsoredPlacementAdmin> {
    await requirePlatformRole(v, "super_admin");
    const pro = await db.query.proProfiles.findFirst({
      where: and(eq(proProfiles.id, input.proProfileId), isNull(proProfiles.deletedAt)),
    });
    if (!pro) throw validation("Fiche pro introuvable");
    const [row] = await db
      .insert(sponsoredPlacements)
      .values({
        proProfileId: input.proProfileId,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
        departments: input.departments,
        categoryIds: input.categoryIds,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        dailyCap: input.dailyCap,
        priceCents: input.priceCents ?? 0,
        status: input.status,
      })
      .returning();
    if (!row) throw new AppError(500, "internal", "Emplacement non créé");
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "sponsored.create",
      targetType: "sponsored_placement",
      targetId: row.id,
      reason: null,
      ip,
    });
    return adminView(row, pro.name);
  },

  async adminUpdate(
    v: Viewer,
    id: string,
    input: SponsoredPlacementUpdate,
    ip: string | null,
  ): Promise<SponsoredPlacementAdmin> {
    await requirePlatformRole(v, "super_admin");
    const current = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, id) });
    if (!current) throw notFound("Emplacement introuvable");
    const merged = { startsOn: input.startsOn ?? current.startsOn, endsOn: input.endsOn ?? current.endsOn };
    if (merged.startsOn > merged.endsOn) throw validation("La fin doit suivre le début");
    const [row] = await db.update(sponsoredPlacements).set(input).where(eq(sponsoredPlacements.id, id)).returning();
    if (!row) throw notFound("Emplacement introuvable");
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "sponsored.update",
      targetType: "sponsored_placement",
      targetId: id,
      reason: null,
      ip,
    });
    const pro = await db.query.proProfiles.findFirst({ where: eq(proProfiles.id, row.proProfileId) });
    return adminView(row, pro?.name ?? "");
  },

  async adminDelete(v: Viewer, id: string, ip: string | null): Promise<void> {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db.delete(sponsoredPlacements).where(eq(sponsoredPlacements.id, id)).returning();
    if (!row) throw notFound("Emplacement introuvable");
    if (row.imageKey) await storage.remove(row.imageKey);
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "sponsored.delete",
      targetType: "sponsored_placement",
      targetId: id,
      reason: null,
      ip,
    });
  },

  /** Image de l'emplacement : 1200 px au plus, WebP. */
  async adminSetImage(v: Viewer, id: string, file: File): Promise<SponsoredPlacementAdmin> {
    await requirePlatformRole(v, "super_admin");
    const current = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, id) });
    if (!current) throw notFound("Emplacement introuvable");
    if (file.size === 0) throw validation("Fichier vide");
    if (file.size > MAX_IMAGE_BYTES) throw new AppError(413, "payload_too_large", "Image de 10 Mo au plus");
    let data: Buffer;
    try {
      data = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new AppError(415, "unsupported_media_type", "Image illisible (JPEG, PNG ou WebP)");
    }
    const key = `sponsored/${id}/image-${randomBytes(6).toString("hex")}.webp`;
    await storage.put(key, data);
    const [row] = await db
      .update(sponsoredPlacements)
      .set({ imageKey: key })
      .where(eq(sponsoredPlacements.id, id))
      .returning();
    if (current.imageKey) await storage.remove(current.imageKey);
    const pro = await db.query.proProfiles.findFirst({ where: eq(proProfiles.id, current.proProfileId) });
    return adminView(row ?? current, pro?.name ?? "");
  },
};

function adminView(r: Row, proName: string): SponsoredPlacementAdmin {
  return {
    id: r.id,
    proProfileId: r.proProfileId,
    proName,
    title: r.title,
    body: r.body,
    imageUrl: storage.url(r.imageKey),
    linkUrl: r.linkUrl,
    departments: r.departments,
    categoryIds: r.categoryIds,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    dailyCap: r.dailyCap,
    priceCents: r.priceCents,
    status: r.status,
    impressions: r.impressions,
    clicks: r.clicks,
  };
}
