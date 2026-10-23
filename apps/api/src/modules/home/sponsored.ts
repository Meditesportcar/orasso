// Emplacement sponsorisé de l'Accueil (lot 30, ARCHITECTURE-SUITE § 13.3). Vendu directement à un pro de la plateforme,
// créé par l'administration, même apparence que le reste avec la mention « Sponsorisé ». Aucune donnée personnelle n'est
// transmise au pro : il n'a que des totaux (affichages, clics). Ciblage : départements du secteur et centres d'intérêt.
import { createHmac, randomBytes } from "node:crypto";
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
import {
  adminAuditLog,
  proProfiles,
  sponsoredDailySeen,
  sponsoredDailyStats,
  sponsoredPlacements,
} from "../../db/schema";
import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { storage } from "../../lib/storage";
import { proOwnerActive } from "../pros/explore";
import { parisDay } from "../pros/service";

type Row = typeof sponsoredPlacements.$inferSelect;

/** Identifiant de la personne pour « déjà montré » : HMAC par emplacement et par jour, non réversible sans le secret. */
function userHash(userId: string, placementId: string, day: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${userId}|${placementId}|${day}`)
    .digest("hex")
    .slice(0, 32);
}

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
   * Tirage pondéré avec une graine (personne + jour). Un affichage n'est compté qu'une fois par (emplacement, personne,
   * jour) : un nouveau chargement de l'Accueil rend le même emplacement sans rien compter (table `sponsored_daily_seen`),
   * et le plafond du jour est respecté de façon atomique au moment de compter.
   */
  async select(
    v: Viewer,
    interests: string[],
    /**
     * Lot M5 (« Pour ta … » du Garage) : seulement un emplacement ciblé sur une catégorie (`interests` = celles du
     * véhicule), jamais un emplacement ouvert à tous, qui ne serait pas « lié au véhicule ».
     */
    opts: {
      targetedOnly?: boolean;
      /**
       * Lot M5, tour 2 : ne pas compter l'affichage ici. L'écran le compte à la première apparition de l'emplacement
       * (`impression`) ; un clic n'est accepté qu'après.
       */
      deferImpression?: boolean;
    } = {},
  ): Promise<HomeSponsored | null> {
    const t = now();
    if (proVisibility(null, null, t).hidden.promotion) return null;
    // Lot 33 : interrupteur de l'administration.
    if (!(await settingsStore.get("sponsored.enabled"))) return null;
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
    const ids = rows.map((r) => r.placement.id);
    const stats = await db
      .select({ id: sponsoredDailyStats.placementId, n: sponsoredDailyStats.impressions })
      .from(sponsoredDailyStats)
      .where(and(eq(sponsoredDailyStats.day, today), inArray(sponsoredDailyStats.placementId, ids)));
    const shownToday = new Map(stats.map((s) => [s.id, s.n]));
    // Emplacements déjà montrés à cette personne aujourd'hui : on lui rend le même, sans le recompter.
    const seen = await db
      .select({ id: sponsoredDailySeen.placementId, hash: sponsoredDailySeen.userHash })
      .from(sponsoredDailySeen)
      .where(and(eq(sponsoredDailySeen.day, today), inArray(sponsoredDailySeen.placementId, ids)));
    const seenIds = new Set(seen.filter((s) => s.hash === userHash(v.user.id, s.id, today)).map((s) => s.id));
    const candidates = rows.flatMap((r) => {
      if (opts.targetedOnly && r.placement.categoryIds.length === 0) return [];
      const m = placementMatch(target(r.placement), {
        today,
        sector: v.profile.departments,
        interests,
        // Déjà montré à cette personne : le plafond ne la concerne plus.
        impressionsToday: seenIds.has(r.placement.id) ? 0 : (shownToday.get(r.placement.id) ?? 0),
      });
      return m.eligible ? [{ id: r.placement.id, weight: m.weight, row: r }] : [];
    });
    const already = candidates.filter((c) => seenIds.has(c.id));
    const picked = already.length
      ? pickWeighted(already, `${v.user.id}|${today}`)
      : pickWeighted(candidates, `${v.user.id}|${today}`);
    if (!picked) return null;
    if (
      !opts.deferImpression &&
      !seenIds.has(picked.id) &&
      !(await this.claimImpression(picked.id, v.user.id, today, picked.row.placement.dailyCap))
    ) {
      return null;
    }
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

  /**
   * Compte l'affichage de cet emplacement pour cette personne aujourd'hui, une seule fois, sous le plafond du jour. Le
   * plafond se vérifie dans l'instruction elle-même (incrément conditionnel) : deux chargements simultanés ne le dépassent
   * pas. Renvoie faux si le plafond est atteint.
   */
  async claimImpression(id: string, userId: string, day: string, cap: number | null): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(sponsoredDailySeen)
        .values({ placementId: id, userHash: userHash(userId, id, day), day })
        .onConflictDoNothing()
        .returning({ id: sponsoredDailySeen.placementId });
      if (!claimed) return true; // déjà compté (chargement simultané du même compte)
      const [daily] = await tx
        .insert(sponsoredDailyStats)
        .values({ placementId: id, day, impressions: 1 })
        .onConflictDoUpdate({
          target: [sponsoredDailyStats.placementId, sponsoredDailyStats.day],
          set: { impressions: sql`${sponsoredDailyStats.impressions} + 1` },
          ...(cap === null ? {} : { setWhere: sql`${sponsoredDailyStats.impressions} < ${cap}` }),
        })
        .returning({ n: sponsoredDailyStats.impressions });
      if (!daily) {
        // Plafond atteint : l'affichage n'est pas compté, la personne n'en garde pas trace.
        await tx
          .delete(sponsoredDailySeen)
          .where(
            and(
              eq(sponsoredDailySeen.placementId, id),
              eq(sponsoredDailySeen.userHash, userHash(userId, id, day)),
              eq(sponsoredDailySeen.day, day),
            ),
          );
        return false;
      }
      await tx
        .update(sponsoredPlacements)
        .set({ impressions: sql`${sponsoredPlacements.impressions} + 1` })
        .where(eq(sponsoredPlacements.id, id));
      return true;
    });
  },

  /**
   * `POST /sponsored/:id/impression` (lot M5, tour 2) : l'emplacement renvoyé sans être compté (Garage) vient d'apparaître
   * à l'écran. Compté une fois par (emplacement, personne, jour), sous le plafond du jour ; plafond atteint : 409, l'écran
   * le retire. Seulement pour un emplacement encore diffusé.
   */
  async impression(v: Viewer, id: string): Promise<void> {
    rateLimit("sponsoredClick", v.user.id);
    const today = parisDay(now());
    const p = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, id) });
    if (p?.status !== "active" || today < p.startsOn || today > p.endsOn) throw notFound("Emplacement introuvable");
    if (!(await this.claimImpression(id, v.user.id, today, p.dailyCap))) {
      throw new AppError(409, "conflict", "Emplacement complet pour aujourd'hui");
    }
  },

  /**
   * `POST /sponsored/:id/click` : un clic compté par (emplacement, personne, jour), seulement pour un emplacement qui lui
   * a été montré aujourd'hui (donc que `select` a choisi pour elle) et qui est encore diffusé. Un second clic est sans effet.
   */
  async click(v: Viewer, id: string): Promise<void> {
    rateLimit("sponsoredClick", v.user.id);
    const today = parisDay(now());
    const p = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, id) });
    if (p?.status !== "active" || today < p.startsOn || today > p.endsOn) {
      throw notFound("Emplacement introuvable");
    }
    const hash = userHash(v.user.id, id, today);
    const seen = await db.query.sponsoredDailySeen.findFirst({
      where: and(
        eq(sponsoredDailySeen.placementId, id),
        eq(sponsoredDailySeen.userHash, hash),
        eq(sponsoredDailySeen.day, today),
      ),
    });
    if (!seen) throw notFound("Emplacement introuvable");
    const [first] = await db
      .update(sponsoredDailySeen)
      .set({ clicked: true })
      .where(
        and(
          eq(sponsoredDailySeen.placementId, id),
          eq(sponsoredDailySeen.userHash, hash),
          eq(sponsoredDailySeen.day, today),
          eq(sponsoredDailySeen.clicked, false),
        ),
      )
      .returning({ id: sponsoredDailySeen.placementId });
    if (!first) return;
    await db
      .update(sponsoredPlacements)
      .set({ clicks: sql`${sponsoredPlacements.clicks} + 1` })
      .where(eq(sponsoredPlacements.id, id));
    await db
      .insert(sponsoredDailyStats)
      .values({ placementId: id, day: today, clicks: 1 })
      .onConflictDoUpdate({
        target: [sponsoredDailyStats.placementId, sponsoredDailyStats.day],
        set: { clicks: sql`${sponsoredDailyStats.clicks} + 1` },
      });
  },

  /** Tâche `home.purge` : les lignes « déjà montré » de plus de deux jours (elles ne servent qu'à la journée). */
  async purgeSeen(): Promise<number> {
    const cutoff = parisDay(new Date(now().getTime() - 2 * 86_400_000));
    const rows = await db
      .delete(sponsoredDailySeen)
      .where(lte(sponsoredDailySeen.day, cutoff))
      .returning({ id: sponsoredDailySeen.placementId });
    return rows.length;
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
  async adminSetImage(v: Viewer, id: string, file: File, ip: string | null): Promise<SponsoredPlacementAdmin> {
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
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "sponsored.image",
      targetType: "sponsored_placement",
      targetId: id,
      reason: null,
      ip,
    });
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
