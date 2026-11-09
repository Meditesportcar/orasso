// Emplacement sponsorisé de l'Accueil (lot 30, ARCHITECTURE-SUITE § 13.3). Vendu directement à un pro de la plateforme,
// créé par l'administration, même apparence que le reste avec la mention « Sponsorisé ». Aucune donnée personnelle n'est
// transmise au pro : il n'a que des totaux (affichages, clics). Ciblage : départements du secteur et centres d'intérêt.
import { createHmac, randomBytes } from "node:crypto";
import {
  type AdvertiserKind,
  displayDomain,
  type FeedPayloads,
  feedPlacementMatch,
  type HomeSponsored,
  type PlacementTarget,
  pickWeighted,
  placementAdvertiserProblem,
  placementMatch,
  proVisibility,
  type SponsoredPlacementAdmin,
  type SponsoredPlacementCreate,
  type SponsoredPlacementUpdate,
  type SponsoredSurface,
  sponsoredSurfaces,
} from "@orasso/shared";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
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

/** L'emplacement s'affiche sur cet endroit (colonne `surfaces`, tableau de texte). */
const onSurface = (surface: SponsoredSurface) => sql`${surface} = any(${sponsoredPlacements.surfaces})`;

/** Le jour de Paris et le réglage général : un emplacement coupé par l'administration ne compte plus rien. */
async function sponsoredOn(): Promise<boolean> {
  return Boolean(await settingsStore.get("sponsored.enabled"));
}

/**
 * Affichages du jour de chaque emplacement, **toutes surfaces confondues** : le plafond du jour est global à
 * l'emplacement (les statistiques, elles, restent par surface).
 */
async function impressionsToday(ids: string[], day: string): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({
      id: sponsoredDailyStats.placementId,
      n: sql<number>`coalesce(sum(${sponsoredDailyStats.impressions}), 0)::int`,
    })
    .from(sponsoredDailyStats)
    .where(and(eq(sponsoredDailyStats.day, day), inArray(sponsoredDailyStats.placementId, ids)))
    .groupBy(sponsoredDailyStats.placementId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/**
 * Parmi ces emplacements, ceux déjà montrés à cette personne aujourd'hui sur cette surface. L'empreinte de la personne
 * se calcule par emplacement (c'est une empreinte par emplacement et par jour) et le filtre se fait **en SQL** sur les
 * couples (emplacement, empreinte) : on ne charge jamais les lignes des autres personnes.
 */
async function seenByPerson(
  userId: string,
  ids: string[],
  day: string,
  surface: SponsoredSurface,
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const pairs = sql.join(
    ids.map((id) => sql`(${id}::uuid, ${userHash(userId, id, day)})`),
    sql`, `,
  );
  const rows = await db
    .select({ id: sponsoredDailySeen.placementId })
    .from(sponsoredDailySeen)
    .where(
      and(
        eq(sponsoredDailySeen.day, day),
        eq(sponsoredDailySeen.surface, surface),
        sql`(${sponsoredDailySeen.placementId}, ${sponsoredDailySeen.userHash}) in (${pairs})`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Annonceur externe (sans fiche), ou pro dont la fiche est publiée et dont le titulaire est en règle. */
const advertiserDiffusable = (t: Date) =>
  or(
    and(eq(sponsoredPlacements.advertiserKind, "external"), isNull(sponsoredPlacements.proProfileId)),
    and(
      eq(sponsoredPlacements.advertiserKind, "pro"),
      isNull(proProfiles.deletedAt),
      sql`${proProfiles.publishedAt} is not null`,
      proOwnerActive(t),
    ),
  );

/**
 * Le nom affiché d'un annonceur : pour un pro, **celui de sa fiche, lu à chaque fois** (un renommage se voit tout de
 * suite ; la copie de l'emplacement n'est qu'un souvenir de la création) ; pour un annonceur externe, celui saisi.
 */
function advertiserNameOf(r: Row, proName: string | null): string {
  return r.advertiserKind === "pro" ? (proName ?? r.advertiserName) : r.advertiserName;
}

/** Un emplacement montrable dans le Fil : son poids (1 + départements touchés) et le contenu de la carte. */
export type FeedSponsoredCandidate = {
  id: string;
  weight: number;
  /** L'emplacement vise des départements (la raison dit alors « choisi d'après ton département »). */
  targeted: boolean;
  payload: FeedPayloads["sponsored"];
};

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
          // Lot R7k1 : l'Accueil ne montre que les emplacements d'un pro (la carte porte sa fiche) prévus pour lui.
          eq(sponsoredPlacements.advertiserKind, "pro"),
          onSurface("home"),
          lte(sponsoredPlacements.startsOn, today),
          gte(sponsoredPlacements.endsOn, today),
          isNull(proProfiles.deletedAt),
          sql`${proProfiles.publishedAt} is not null`,
          proOwnerActive(t),
        ),
      );
    if (!rows.length) return null;
    const ids = rows.map((r) => r.placement.id);
    const shownToday = await impressionsToday(ids, today);
    // Emplacements déjà montrés à cette personne aujourd'hui : on lui rend le même, sans le recompter.
    const seenIds = await seenByPerson(v.user.id, ids, today, "home");
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
      !(await this.claimImpression(picked.id, v.user.id, today, picked.row.placement.dailyCap, "home"))
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
   * Compte l'affichage de cet emplacement pour cette personne aujourd'hui sur cet endroit, une seule fois, sous le plafond
   * du jour **de l'emplacement, toutes surfaces confondues** (les statistiques restent par endroit). La ligne de
   * l'emplacement est verrouillée le temps du comptage : deux chargements simultanés ne dépassent pas le plafond. Renvoie
   * faux si le plafond est atteint.
   */
  async claimImpression(
    id: string,
    userId: string,
    day: string,
    cap: number | null,
    surface: SponsoredSurface = "home",
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Le plafond est global à l'emplacement (toutes surfaces) : le verrou de la ligne de l'emplacement sérialise les
      // comptages concurrents, la somme du jour se lit donc sans que personne ne la dépasse entre-temps.
      // « no key update » : n'attend pas les contrôles de clé étrangère des insertions concurrentes. Sans plafond, il n'y
      // a rien à sérialiser : pas de verrou.
      if (cap !== null) {
        await tx
          .select({ id: sponsoredPlacements.id })
          .from(sponsoredPlacements)
          .where(eq(sponsoredPlacements.id, id))
          .for("no key update");
      }
      const [claimed] = await tx
        .insert(sponsoredDailySeen)
        .values({ placementId: id, userHash: userHash(userId, id, day), day, surface })
        .onConflictDoNothing()
        .returning({ id: sponsoredDailySeen.placementId });
      if (!claimed) return true; // déjà compté (chargement simultané du même compte)
      let full = false;
      if (cap !== null) {
        const [total] = await tx
          .select({ n: sql<number>`coalesce(sum(${sponsoredDailyStats.impressions}), 0)::int` })
          .from(sponsoredDailyStats)
          .where(and(eq(sponsoredDailyStats.placementId, id), eq(sponsoredDailyStats.day, day)));
        full = (total?.n ?? 0) >= cap;
      }
      if (!full) {
        await tx
          .insert(sponsoredDailyStats)
          .values({ placementId: id, day, surface, impressions: 1 })
          .onConflictDoUpdate({
            target: [sponsoredDailyStats.placementId, sponsoredDailyStats.day, sponsoredDailyStats.surface],
            set: { impressions: sql`${sponsoredDailyStats.impressions} + 1` },
          });
      }
      if (full) {
        // Plafond atteint : l'affichage n'est pas compté, la personne n'en garde pas trace.
        await tx
          .delete(sponsoredDailySeen)
          .where(
            and(
              eq(sponsoredDailySeen.placementId, id),
              eq(sponsoredDailySeen.userHash, userHash(userId, id, day)),
              eq(sponsoredDailySeen.day, day),
              eq(sponsoredDailySeen.surface, surface),
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
   * Un emplacement qui peut encore être montré **à cette personne** sur cet endroit, ou 404 (et rien ne s'écrit) : actif,
   * dans sa période, prévu pour cet endroit, avec le réglage général allumé ; pour un annonceur externe,
   * `sponsored.external_enabled` aussi ; pour un pro, une fiche publiée dont le titulaire est en règle ; et la personne
   * est dans la cible (un département de l'emplacement, s'il en vise). Lot R7k1 : rien ne se compte pour une publicité
   * coupée, retirée, ou qui ne lui aurait pas été montrée.
   */
  async diffused(v: Viewer, id: string, surface: SponsoredSurface): Promise<Row> {
    const t = now();
    const today = parisDay(t);
    const [found] = await db
      .select({ placement: sponsoredPlacements })
      .from(sponsoredPlacements)
      .leftJoin(proProfiles, eq(proProfiles.id, sponsoredPlacements.proProfileId))
      .where(and(eq(sponsoredPlacements.id, id), advertiserDiffusable(t)));
    const p = found?.placement;
    if (p?.status !== "active" || today < p.startsOn || today > p.endsOn || !p.surfaces.includes(surface)) {
      throw notFound("Emplacement introuvable");
    }
    if (!(await sponsoredOn())) throw notFound("Emplacement introuvable");
    if (p.advertiserKind === "external" && !(await settingsStore.get("sponsored.external_enabled"))) {
      throw notFound("Emplacement introuvable");
    }
    if (p.advertiserKind === "pro" && proVisibility(null, null, t).hidden.promotion) {
      throw notFound("Emplacement introuvable");
    }
    if (p.departments.length && !p.departments.some((d) => v.profile.departments.includes(d))) {
      throw notFound("Emplacement introuvable");
    }
    return p;
  },

  /**
   * `POST /sponsored/:id/impression` (lot M5, tour 2 ; lot R7k1 : `{ surface }`) : l'emplacement renvoyé sans être compté
   * (Garage, Fil) vient d'apparaître à l'écran. Compté une fois par (emplacement, personne, jour, endroit), sous le
   * plafond du jour ; plafond atteint : 409, l'écran le retire. Seulement pour un emplacement encore diffusé.
   */
  async impression(v: Viewer, id: string, surface: SponsoredSurface = "home"): Promise<void> {
    rateLimit("sponsoredImpression", v.user.id);
    const p = await this.diffused(v, id, surface);
    if (!(await this.claimImpression(id, v.user.id, parisDay(now()), p.dailyCap, surface))) {
      throw new AppError(409, "conflict", "Emplacement complet pour aujourd'hui");
    }
  },

  /**
   * `POST /sponsored/:id/click` : un clic compté par (emplacement, personne, jour, endroit), seulement pour un
   * emplacement qui lui a été montré aujourd'hui sur cet endroit et qui est encore diffusé. Un second clic est sans effet.
   */
  async click(v: Viewer, id: string, surface: SponsoredSurface = "home"): Promise<void> {
    rateLimit("sponsoredClick", v.user.id);
    const today = parisDay(now());
    await this.diffused(v, id, surface);
    const hash = userHash(v.user.id, id, today);
    const seen = await db.query.sponsoredDailySeen.findFirst({
      where: and(
        eq(sponsoredDailySeen.placementId, id),
        eq(sponsoredDailySeen.userHash, hash),
        eq(sponsoredDailySeen.day, today),
        eq(sponsoredDailySeen.surface, surface),
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
          eq(sponsoredDailySeen.surface, surface),
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
      .values({ placementId: id, day: today, surface, clicks: 1 })
      .onConflictDoUpdate({
        target: [sponsoredDailyStats.placementId, sponsoredDailyStats.day, sponsoredDailyStats.surface],
        set: { clicks: sql`${sponsoredDailyStats.clicks} + 1` },
      });
  },

  /**
   * Les emplacements que le Fil peut montrer à cette personne aujourd'hui (lot R7k1, D38 : publicité **non
   * personnalisée**, le département est le seul ciblage), avec leur poids. Vide si `sponsored.enabled` est coupé. Un
   * annonceur externe n'entre que si `sponsored.external_enabled` est allumé (avis juridique) ; un pro, comme à
   * l'Accueil, seulement avec une fiche publiée et un titulaire en règle. Ne compte rien : l'affichage se compte quand la
   * carte apparaît à l'écran (`impression`).
   */
  async feedCandidates(v: Viewer): Promise<FeedSponsoredCandidate[]> {
    const t = now();
    if (!(await sponsoredOn())) return [];
    const externalOn = Boolean(await settingsStore.get("sponsored.external_enabled"));
    const proOn = !proVisibility(null, null, t).hidden.promotion;
    const today = parisDay(t);
    const kinds: AdvertiserKind[] = [
      ...(proOn ? (["pro"] as const) : []),
      ...(externalOn ? (["external"] as const) : []),
    ];
    if (!kinds.length) return [];
    const rows = await db
      .select({ placement: sponsoredPlacements, pro: proProfiles })
      .from(sponsoredPlacements)
      .leftJoin(proProfiles, eq(proProfiles.id, sponsoredPlacements.proProfileId))
      .where(
        and(
          eq(sponsoredPlacements.status, "active"),
          onSurface("feed"),
          lte(sponsoredPlacements.startsOn, today),
          gte(sponsoredPlacements.endsOn, today),
          inArray(sponsoredPlacements.advertiserKind, kinds),
          advertiserDiffusable(t),
        ),
      );
    if (!rows.length) return [];
    const ids = rows.map((r) => r.placement.id);
    // Plafond du jour global à l'emplacement ; « déjà montré » filtré en SQL sur les couples (emplacement, empreinte).
    const shownToday = await impressionsToday(ids, today);
    const seenIds = await seenByPerson(v.user.id, ids, today, "feed");
    return rows.flatMap((r) => {
      const m = feedPlacementMatch(target(r.placement), {
        today,
        sector: v.profile.departments,
        // Déjà montré à cette personne dans le Fil aujourd'hui : le plafond ne la concerne plus.
        impressionsToday: seenIds.has(r.placement.id) ? 0 : (shownToday.get(r.placement.id) ?? 0),
      });
      if (!m.eligible) return [];
      const { placement, pro } = r;
      const payload: FeedPayloads["sponsored"] = {
        id: placement.id,
        advertiserName: advertiserNameOf(placement, pro?.name ?? null),
        advertiserKind: placement.advertiserKind,
        title: placement.title,
        body: placement.body,
        imageUrl: storage.url(placement.imageKey),
        linkUrl: placement.linkUrl,
        disclosure: placement.disclosure,
        domain: placement.advertiserKind === "external" ? placement.externalUrlDomain : null,
        pro: pro ? { slug: pro.slug, name: pro.name, logoUrl: storage.url(pro.logoKey) } : null,
      };
      return [{ id: placement.id, weight: m.weight, targeted: placement.departments.length > 0, payload }];
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
      .leftJoin(proProfiles, eq(proProfiles.id, sponsoredPlacements.proProfileId))
      .orderBy(asc(sponsoredPlacements.startsOn), asc(sponsoredPlacements.id));
    const perSurface = await surfaceStats(rows.map((r) => r.p.id));
    return rows.map((r) => adminView(r.p, r.proName, perSurface.get(r.p.id)));
  },

  async adminCreate(v: Viewer, input: SponsoredPlacementCreate, ip: string | null): Promise<SponsoredPlacementAdmin> {
    await requirePlatformRole(v, "super_admin");
    const external = input.advertiserKind === "external";
    const pro = external
      ? null
      : await db.query.proProfiles.findFirst({
          where: and(eq(proProfiles.id, input.proProfileId ?? ""), isNull(proProfiles.deletedAt)),
        });
    if (!external && !pro) throw validation("Fiche pro introuvable");
    const [row] = await db
      .insert(sponsoredPlacements)
      .values({
        advertiserKind: input.advertiserKind,
        proProfileId: pro?.id ?? null,
        advertiserName: input.advertiserName ?? pro?.name ?? "",
        disclosure: input.disclosure ?? null,
        surfaces: [...new Set(input.surfaces)],
        externalUrlDomain: external ? displayDomain(input.linkUrl) : null,
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
    return adminView(row, pro?.name ?? null, undefined);
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
    const surfaces = input.surfaces ? [...new Set(input.surfaces)] : current.surfaces;
    const problem = placementAdvertiserProblem(current.advertiserKind, {
      proProfileId: current.proProfileId,
      advertiserName: input.advertiserName ?? current.advertiserName,
      surfaces: surfaces as SponsoredSurface[],
      categoryIds: input.categoryIds ?? current.categoryIds,
    });
    if (problem) throw validation(problem);
    // Le nom d'un pro est celui de sa fiche (jamais modifié ici) ; seul un annonceur externe a un nom propre.
    const { advertiserName: nameInput, ...fields } = input;
    const [row] = await db
      .update(sponsoredPlacements)
      .set({
        ...fields,
        ...(current.advertiserKind === "external" && nameInput ? { advertiserName: nameInput } : {}),
        surfaces,
        // Le domaine affiché suit toujours le lien (jamais saisi à la main).
        ...(input.linkUrl && current.advertiserKind === "external"
          ? { externalUrlDomain: displayDomain(input.linkUrl) }
          : {}),
      })
      .where(eq(sponsoredPlacements.id, id))
      .returning();
    if (!row) throw notFound("Emplacement introuvable");
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "sponsored.update",
      targetType: "sponsored_placement",
      targetId: id,
      reason: null,
      ip,
    });
    const perSurface = await surfaceStats([id]);
    return adminView(row, await proNameOf(row.proProfileId), perSurface.get(id));
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
    const perSurface = await surfaceStats([id]);
    return adminView(row ?? current, await proNameOf(current.proProfileId), perSurface.get(id));
  },
};

type SurfaceStats = SponsoredPlacementAdmin["bySurface"];

async function proNameOf(proProfileId: string | null): Promise<string | null> {
  if (!proProfileId) return null;
  const pro = await db.query.proProfiles.findFirst({ where: eq(proProfiles.id, proProfileId) });
  return pro?.name ?? null;
}

const emptySurfaceStats = (): SurfaceStats => ({
  home: { impressions: 0, clicks: 0 },
  feed: { impressions: 0, clicks: 0 },
});

/** Affichages et clics de chaque emplacement, par endroit (somme des jours). */
async function surfaceStats(ids: string[]): Promise<Map<string, SurfaceStats>> {
  const out = new Map<string, SurfaceStats>();
  if (!ids.length) return out;
  const rows = await db
    .select({
      id: sponsoredDailyStats.placementId,
      surface: sponsoredDailyStats.surface,
      impressions: sql<number>`coalesce(sum(${sponsoredDailyStats.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${sponsoredDailyStats.clicks}), 0)::int`,
    })
    .from(sponsoredDailyStats)
    .where(inArray(sponsoredDailyStats.placementId, ids))
    .groupBy(sponsoredDailyStats.placementId, sponsoredDailyStats.surface);
  for (const r of rows) {
    if (!sponsoredSurfaces.includes(r.surface as SponsoredSurface)) continue;
    const cur = out.get(r.id) ?? emptySurfaceStats();
    cur[r.surface as SponsoredSurface] = { impressions: r.impressions, clicks: r.clicks };
    out.set(r.id, cur);
  }
  return out;
}

function adminView(r: Row, proName: string | null, bySurface: SurfaceStats | undefined): SponsoredPlacementAdmin {
  return {
    id: r.id,
    advertiserKind: r.advertiserKind,
    advertiserName: advertiserNameOf(r, proName),
    proProfileId: r.proProfileId,
    proName,
    disclosure: r.disclosure,
    externalUrlDomain: r.externalUrlDomain,
    surfaces: r.surfaces.filter((x): x is SponsoredSurface => sponsoredSurfaces.includes(x as SponsoredSurface)),
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
    bySurface: bySurface ?? emptySurfaceStats(),
  };
}
