// Professionnels (docs/01 « Professionnels », lot 14) : fiche, vérification SIRET automatique, remises par grade,
// photos, publications limitées par mois, abonnés, statistiques, partenaires des organisateurs.
// Abonnement en présentation : « gratuit jusqu'au 21 juin 2027 », aucun prix, aucun paiement.
import { randomBytes } from "node:crypto";
import {
  discountsOutOfOrder,
  type Grade,
  grades,
  monthBounds,
  type Page,
  PRO_MAX_PHOTOS,
  PRO_POSTS_PER_MONTH,
  type ProActivity,
  type ProCard,
  type ProCreate,
  type ProDiscounts,
  type ProDiscountsInput,
  type ProOwner,
  type ProPartner,
  type ProPartnerLink,
  type ProPostCreate,
  type ProPostView,
  type ProPublic,
  type ProStats,
  type ProTrackKind,
  type ProUpdate,
  parseRegistryNumber,
  postsRemaining,
  proSubscription,
  type StructurePartnerRow,
  wallTime,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import {
  proDailyStats,
  proDiscounts,
  proDiscountUses,
  proFollows,
  proPartnerLinks,
  proPhotos,
  proPosts,
  proProfiles,
  structures,
} from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { escapeLike } from "../../lib/pagination";
import { rateLimit } from "../../lib/rateLimit";
import { lookupRegistry } from "../../lib/registry";
import type { Viewer } from "../../lib/session";
import { uniqueSlug } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { locate } from "../structures/service";

export type ProRow = typeof proProfiles.$inferSelect;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Jour calendaire à Paris, `AAAA-MM-JJ`. */
export function parisDay(at: Date): string {
  const w = wallTime(at);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

const slugTaken = async (slug: string) =>
  Boolean(await db.query.proProfiles.findFirst({ where: eq(proProfiles.slug, slug), columns: { id: true } }));

async function proById(id: string): Promise<ProRow> {
  const p = await db.query.proProfiles.findFirst({
    where: and(eq(proProfiles.id, id), isNull(proProfiles.deletedAt)),
  });
  if (!p) throw notFound("Fiche pro introuvable");
  return p;
}

/** Fiche dont le viewer est le propriétaire. */
async function ownedPro(v: Viewer, id: string): Promise<ProRow> {
  const p = await proById(id);
  if (p.ownerUserId !== v.user.id) throw forbidden("Cette fiche n'est pas la tienne");
  return p;
}

/** Fiche pro d'un compte (`null` s'il n'en a pas). */
export async function proOfUser(userId: string): Promise<ProRow | null> {
  const p = await db.query.proProfiles.findFirst({
    where: and(eq(proProfiles.ownerUserId, userId), isNull(proProfiles.deletedAt)),
  });
  return p ?? null;
}

async function followersCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ proId: proFollows.proId, n: count() })
    .from(proFollows)
    .where(inArray(proFollows.proId, ids))
    .groupBy(proFollows.proId);
  return new Map(rows.map((r) => [r.proId, r.n]));
}

function toCard(p: ProRow, followers: number): ProCard {
  return {
    slug: p.slug,
    name: p.name,
    logoUrl: storage.url(p.logoKey),
    activities: p.activities as ProActivity[],
    city: p.city,
    department: p.department,
    lat: p.lat,
    lng: p.lng,
    interventionDepartments: p.interventionDepartments,
    verified: p.verifiedAt !== null,
    registryName: p.verifiedAt !== null ? (p.registryCheck?.name ?? null) : null,
    followersCount: followers,
  };
}

async function discountsOf(proId: string): Promise<ProDiscounts> {
  const rows = await db.query.proDiscounts.findMany({ where: eq(proDiscounts.proId, proId) });
  const out: ProDiscounts = {};
  for (const g of grades) {
    const r = rows.find((x) => x.grade === g);
    if (r) out[g] = r.percent;
  }
  return out;
}

/** Remise de ce pro pour un grade (0 = aucune) : utilisée par la vérification du QR de compte. */
export async function discountPercent(proId: string, grade: Grade): Promise<number> {
  const r = await db.query.proDiscounts.findFirst({
    where: and(eq(proDiscounts.proId, proId), eq(proDiscounts.grade, grade)),
  });
  return r?.percent ?? 0;
}

const postView = (p: typeof proPosts.$inferSelect): ProPostView => ({
  id: p.id,
  title: p.title,
  body: p.body,
  createdAt: p.createdAt.toISOString(),
});

async function publishBlock(p: ProRow): Promise<string | null> {
  if (p.activities.length === 0) return "Choisis au moins une activité.";
  const hasAddress = Boolean(p.city || p.addressLine);
  if (!hasAddress && p.interventionDepartments.length === 0) {
    return "Indique une adresse ou ta zone d'intervention.";
  }
  return null;
}

async function toPublic(p: ProRow, viewer: Viewer | null): Promise<ProPublic> {
  const isOwner = viewer?.user.id === p.ownerUserId;
  const [followers, photos, discounts, partnerRows, postCount, following] = await Promise.all([
    followersCounts([p.id]),
    db.query.proPhotos.findMany({ where: eq(proPhotos.proId, p.id), orderBy: [asc(proPhotos.position)] }),
    discountsOf(p.id),
    db
      .select({ s: structures })
      .from(proPartnerLinks)
      .innerJoin(structures, eq(structures.id, proPartnerLinks.structureId))
      .where(
        and(
          eq(proPartnerLinks.proId, p.id),
          isNotNull(proPartnerLinks.acceptedAt),
          isNull(structures.deletedAt),
          eq(structures.verification, "verified"),
        ),
      )
      .orderBy(asc(structures.name)),
    db.select({ n: count() }).from(proPosts).where(eq(proPosts.proId, p.id)),
    viewer
      ? db.query.proFollows.findFirst({
          where: and(eq(proFollows.proId, p.id), eq(proFollows.userId, viewer.user.id)),
        })
      : Promise.resolve(undefined),
  ]);
  const partners: ProPartner[] = partnerRows.map(({ s }) => ({
    slug: s.slug,
    name: s.name,
    logoUrl: storage.url(s.logoKey),
    city: s.city,
  }));
  const canSeePosts = isOwner || Boolean(following);
  const posts = canSeePosts
    ? (
        await db.query.proPosts.findMany({
          where: eq(proPosts.proId, p.id),
          orderBy: [desc(proPosts.createdAt)],
          limit: 20,
        })
      ).map(postView)
    : null;
  return {
    ...toCard(p, followers.get(p.id) ?? 0),
    id: p.id,
    published: p.publishedAt !== null,
    description: p.description,
    addressLine: p.addressLine,
    postalCode: p.postalCode,
    phone: p.phone,
    email: p.email,
    website: p.website,
    socials: p.socials,
    hours: p.hours,
    photos: photos.map((x) => ({ id: x.id, url: storage.url(x.storageKey) ?? "" })),
    discounts,
    partners,
    postsCount: postCount[0]?.n ?? 0,
    posts,
    isFollowing: viewer ? Boolean(following) : null,
    isOwner,
  };
}

async function postsUsedThisMonth(
  proId: string,
  ex: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
): Promise<number> {
  const { start, end } = monthBounds(now());
  const [row] = await ex
    .select({ n: count() })
    .from(proPosts)
    .where(and(eq(proPosts.proId, proId), gte(proPosts.createdAt, start), lt(proPosts.createdAt, end)));
  return row?.n ?? 0;
}

async function toOwner(p: ProRow, v: Viewer): Promise<ProOwner> {
  const base = await toPublic(p, v);
  const used = await postsUsedThisMonth(p.id);
  const block = await publishBlock(p);
  const links = await db
    .select({ s: structures, acceptedAt: proPartnerLinks.acceptedAt })
    .from(proPartnerLinks)
    .innerJoin(structures, eq(structures.id, proPartnerLinks.structureId))
    .where(eq(proPartnerLinks.proId, p.id))
    .orderBy(asc(structures.name));
  const partnerLinks: ProPartnerLink[] = links.map(({ s, acceptedAt }) => ({
    structureSlug: s.slug,
    structureName: s.name,
    logoUrl: storage.url(s.logoKey),
    status: acceptedAt ? "accepted" : "pending",
  }));
  return {
    ...base,
    published: p.publishedAt !== null,
    siret: p.siret,
    registryCheck: p.registryCheck,
    verifiedAt: p.verifiedAt?.toISOString() ?? null,
    canPublish: block === null,
    publishBlockedReason: block,
    subscription: proSubscription(now()),
    postsUsed: used,
    postsLimit: PRO_POSTS_PER_MONTH,
    postsRemaining: postsRemaining(used),
    partnerLinks,
  };
}

/** Image réduite en WebP ; 415 si le fichier n'est pas une image lisible. */
async function toWebp(file: File, size: number, fit: "inside" | "cover"): Promise<Buffer> {
  if (file.size === 0) throw validation("Fichier vide");
  if (file.size > MAX_IMAGE_BYTES) throw new AppError(413, "payload_too_large", "Image de 10 Mo au plus");
  try {
    return await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(size, size, { fit, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError(415, "unsupported_media_type", "Image illisible (JPEG, PNG ou WebP)");
  }
}

export const prosService = {
  /** `POST /pros` : une fiche par compte, créée en brouillon. */
  async create(v: Viewer, input: ProCreate): Promise<ProOwner> {
    rateLimit("proWrite", v.user.id);
    if (await proOfUser(v.user.id)) throw conflict("conflict", "Tu as déjà une fiche pro");
    const slug = await uniqueSlug(input.name, slugTaken);
    const located = await locate(input);
    const [p] = await db
      .insert(proProfiles)
      .values({ ...input, ...located, slug, ownerUserId: v.user.id })
      .returning();
    if (!p) throw new Error("Fiche non créée");
    return toOwner(p, v);
  },

  /** `GET /me/pro` */
  async mine(v: Viewer): Promise<ProOwner | null> {
    const p = await proOfUser(v.user.id);
    return p ? toOwner(p, v) : null;
  },

  /** `PATCH /pros/:id` */
  async update(v: Viewer, id: string, input: ProUpdate): Promise<ProOwner> {
    rateLimit("proWrite", v.user.id);
    const current = await ownedPro(v, id);
    const addressChanged = ["addressLine", "postalCode", "city", "department", "lat", "lng"].some((k) => k in input);
    const located = addressChanged ? await locate({ ...current, ...input }) : {};
    const [p] = await db
      .update(proProfiles)
      // Le badge « Pro vérifié » certifie un nom : un nouveau nom demande un nouveau contrôle du SIRET.
      .set({
        ...input,
        ...located,
        ...(input.name !== undefined && input.name !== current.name ? { verifiedAt: null } : {}),
      })
      .where(eq(proProfiles.id, id))
      .returning();
    if (!p) throw notFound("Fiche pro introuvable");
    // Une fiche qui ne peut plus être publiée repasse en brouillon.
    if (p.publishedAt && (await publishBlock(p))) {
      await db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, id));
    }
    return toOwner((await proById(id)) ?? p, v);
  },

  /** `PUT /pros/:id/published` */
  async setPublished(v: Viewer, id: string, published: boolean): Promise<ProOwner> {
    const p = await ownedPro(v, id);
    if (published) {
      const block = await publishBlock(p);
      if (block) throw validation(block);
    }
    const [row] = await db
      .update(proProfiles)
      .set({ publishedAt: published ? (p.publishedAt ?? now()) : null })
      .where(eq(proProfiles.id, id))
      .returning();
    return toOwner(row ?? p, v);
  },

  /** `POST /pros/:id/logo` : carré WebP 512 px. */
  async setLogo(v: Viewer, id: string, file: File): Promise<ProOwner> {
    rateLimit("fileUpload", v.user.id);
    const p = await ownedPro(v, id);
    const data = await toWebp(file, 512, "inside");
    const key = `pros/${id}/logo-${randomBytes(6).toString("hex")}.webp`;
    await storage.put(key, data);
    const [row] = await db.update(proProfiles).set({ logoKey: key }).where(eq(proProfiles.id, id)).returning();
    if (p.logoKey) await storage.remove(p.logoKey);
    return toOwner(row ?? p, v);
  },

  /** `POST /pros/:id/photos` : photo de réalisation (WebP 1600 px), 12 au plus. */
  async addPhoto(v: Viewer, id: string, file: File): Promise<ProOwner> {
    rateLimit("fileUpload", v.user.id);
    const p = await ownedPro(v, id);
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(proPhotos).where(eq(proPhotos.proId, id));
    if (n >= PRO_MAX_PHOTOS) throw conflict("conflict", `${PRO_MAX_PHOTOS} photos au maximum`);
    const data = await toWebp(file, 1600, "inside");
    const key = `pros/${id}/photo-${randomBytes(6).toString("hex")}.webp`;
    await storage.put(key, data);
    await db.insert(proPhotos).values({ proId: id, storageKey: key, position: n });
    return toOwner(p, v);
  },

  /** `DELETE /pros/:id/photos/:photoId` */
  async removePhoto(v: Viewer, id: string, photoId: string): Promise<ProOwner> {
    const p = await ownedPro(v, id);
    const photo = await db.query.proPhotos.findFirst({
      where: and(eq(proPhotos.id, photoId), eq(proPhotos.proId, id)),
    });
    if (!photo) throw notFound("Photo introuvable");
    await db.delete(proPhotos).where(eq(proPhotos.id, photoId));
    await storage.remove(photo.storageKey);
    return toOwner(p, v);
  },

  /** `PUT /pros/:id/discounts` : remplace les remises par grade (absent ou `null` = pas de remise). */
  async setDiscounts(v: Viewer, id: string, input: ProDiscountsInput): Promise<ProOwner> {
    rateLimit("proWrite", v.user.id);
    const p = await ownedPro(v, id);
    const next: ProDiscounts = {};
    for (const g of grades) {
      const percent = input.discounts[g];
      if (percent) next[g] = percent;
    }
    const wrong = discountsOutOfOrder(next);
    if (wrong) throw validation("Un grade supérieur ne peut pas avoir une remise plus faible qu'un grade inférieur.");
    await db.transaction(async (tx) => {
      await tx.delete(proDiscounts).where(eq(proDiscounts.proId, id));
      const rows = grades.flatMap((g) => (next[g] ? [{ proId: id, grade: g, percent: next[g] }] : []));
      if (rows.length) await tx.insert(proDiscounts).values(rows);
    });
    return toOwner(p, v);
  },

  /**
   * `POST /pros/:id/siret/check` : contrôle automatique du SIRET dans le registre public (même contrôle que les
   * structures, lot 13). Établissement trouvé et actif → badge « pro vérifié », sans validation manuelle.
   */
  async checkSiret(v: Viewer, id: string, number: string): Promise<ProOwner> {
    const p = await ownedPro(v, id);
    const parsed = parseRegistryNumber(number);
    if ("error" in parsed) throw validation(parsed.error, { fields: { number: parsed.error } });
    if (parsed.source !== "siret") throw validation("Un professionnel se vérifie avec son SIRET (14 chiffres).");
    rateLimit("registryCheck", v.user.id);
    const check = await lookupRegistry("siret", parsed.value);
    // Registre injoignable : rien ne change (un badge déjà obtenu n'est pas retiré par une panne).
    if (check.status === "unavailable") {
      if (p.verifiedAt) return toOwner(p, v);
      const [kept] = await db
        .update(proProfiles)
        .set({ registryCheck: check })
        .where(eq(proProfiles.id, id))
        .returning();
      return toOwner(kept ?? p, v);
    }
    const matched = check.status === "matched";
    const siret = matched || check.status === "closed" ? (check.siret ?? parsed.value) : p.siret;
    try {
      const [row] = await db
        .update(proProfiles)
        .set({ registryCheck: check, siret, verifiedAt: matched ? now() : null })
        .where(eq(proProfiles.id, id))
        .returning();
      return toOwner(row ?? p, v);
    } catch (error) {
      // Index unique partiel sur le SIRET : une fiche par établissement.
      if (
        (error as { code?: string; cause?: { code?: string } }).code === "23505" ||
        (error as { cause?: { code?: string } }).cause?.code === "23505"
      ) {
        throw conflict("conflict", "Ce SIRET est déjà utilisé par une autre fiche pro.");
      }
      throw error;
    }
  },

  // --- Annuaire et fiche publique -------------------------------------------------------------------------------

  /** `GET /pros` : fiches publiées, tri alphabétique, filtres activité / département / texte. */
  async list(q: {
    limit: number;
    cursor?: string;
    q?: string;
    activity?: ProActivity;
    department?: string;
  }): Promise<Page<ProCard>> {
    const offset = q.cursor ? Math.max(0, Number(Buffer.from(q.cursor, "base64url").toString()) || 0) : 0;
    const where = and(
      isNull(proProfiles.deletedAt),
      isNotNull(proProfiles.publishedAt),
      q.activity ? sql`${q.activity} = any(${proProfiles.activities})` : undefined,
      q.department
        ? or(
            eq(proProfiles.department, q.department),
            sql`${q.department} = any(${proProfiles.interventionDepartments})`,
          )
        : undefined,
      q.q
        ? or(
            ilike(proProfiles.name, `%${escapeLike(q.q)}%`),
            ilike(proProfiles.city, `%${escapeLike(q.q)}%`),
            ilike(proProfiles.description, `%${escapeLike(q.q)}%`),
          )
        : undefined,
    );
    const rows = await db
      .select()
      .from(proProfiles)
      .where(where)
      .orderBy(desc(sql`${proProfiles.verifiedAt} is not null`), asc(proProfiles.name), asc(proProfiles.id))
      .limit(q.limit + 1)
      .offset(offset);
    const page = rows.slice(0, q.limit);
    const followers = await followersCounts(page.map((p) => p.id));
    return {
      items: page.map((p) => toCard(p, followers.get(p.id) ?? 0)),
      nextCursor: rows.length > q.limit ? Buffer.from(String(offset + q.limit)).toString("base64url") : null,
    };
  },

  /** `GET /pros/by-slug/:slug` : une fiche publiée (ou la fiche du propriétaire, même en brouillon). */
  async getPublic(slug: string, viewer: Viewer | null): Promise<ProPublic> {
    const p = await db.query.proProfiles.findFirst({
      where: and(eq(proProfiles.slug, slug), isNull(proProfiles.deletedAt)),
    });
    if (!p || (!p.publishedAt && viewer?.user.id !== p.ownerUserId)) throw notFound("Fiche pro introuvable");
    return toPublic(p, viewer);
  },

  /** `POST /pros/by-slug/:slug/track` : vue de la fiche, clic « appeler » ou « itinéraire » (jamais ceux du pro). */
  async track(slug: string, kind: ProTrackKind, viewer: Viewer | null, visitor: string): Promise<void> {
    const p = await db.query.proProfiles.findFirst({
      where: and(eq(proProfiles.slug, slug), isNull(proProfiles.deletedAt), isNotNull(proProfiles.publishedAt)),
      columns: { id: true, ownerUserId: true },
    });
    if (!p) throw notFound("Fiche pro introuvable");
    if (viewer?.user.id === p.ownerUserId) return;
    rateLimit("proTrack", `${visitor}|${p.id}|${kind}`);
    const day = parisDay(now());
    const inc = { views: kind === "view" ? 1 : 0, calls: kind === "call" ? 1 : 0, routes: kind === "route" ? 1 : 0 };
    await db
      .insert(proDailyStats)
      .values({ proId: p.id, day, ...inc })
      .onConflictDoUpdate({
        target: [proDailyStats.proId, proDailyStats.day],
        set: {
          views: sql`${proDailyStats.views} + ${inc.views}`,
          calls: sql`${proDailyStats.calls} + ${inc.calls}`,
          routes: sql`${proDailyStats.routes} + ${inc.routes}`,
        },
      });
  },

  /** `POST /pros/:id/follow` */
  async follow(v: Viewer, id: string): Promise<void> {
    const p = await proById(id);
    if (!p.publishedAt) throw notFound("Fiche pro introuvable");
    if (p.ownerUserId === v.user.id) throw validation("Tu ne peux pas suivre ta propre fiche");
    await db.insert(proFollows).values({ proId: id, userId: v.user.id }).onConflictDoNothing();
  },

  /** `DELETE /pros/:id/follow` */
  async unfollow(v: Viewer, id: string): Promise<void> {
    await db.delete(proFollows).where(and(eq(proFollows.proId, id), eq(proFollows.userId, v.user.id)));
  },

  // --- Publications --------------------------------------------------------------------------------------------

  /** `POST /pros/:id/posts` : limite mensuelle `PRO_POSTS_PER_MONTH` (compteur affiché dans l'appli). */
  async createPost(v: Viewer, id: string, input: ProPostCreate): Promise<ProPostView> {
    rateLimit("proWrite", v.user.id);
    const p = await ownedPro(v, id);
    if (!p.publishedAt) throw validation("Publie ta fiche avant de publier une offre ou une actualité.");
    // Verrou par fiche : deux publications simultanées ne dépassent pas la limite du mois.
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pro-posts:${id}`}, 0))`);
      if (postsRemaining(await postsUsedThisMonth(id, tx)) === 0) {
        throw conflict("conflict", `Limite atteinte : ${PRO_POSTS_PER_MONTH} publications par mois.`, {
          limit: PRO_POSTS_PER_MONTH,
        });
      }
      const [created] = await tx
        .insert(proPosts)
        .values({ proId: id, ...input })
        .returning();
      return created;
    });
    if (!row) throw new Error("Publication non créée");
    return postView(row);
  },

  /** `DELETE /pros/:id/posts/:postId` (le compteur du mois ne se libère pas : seule la limite compte). */
  async deletePost(v: Viewer, id: string, postId: string): Promise<void> {
    await ownedPro(v, id);
    await db.delete(proPosts).where(and(eq(proPosts.id, postId), eq(proPosts.proId, id)));
  },

  // --- Statistiques ---------------------------------------------------------------------------------------------

  /** `GET /pros/:id/stats?days=30` : vues, clics, abonnés, remises utilisées. */
  async stats(v: Viewer, id: string, days: number): Promise<ProStats> {
    await ownedPro(v, id);
    const t = now();
    const since = new Date(t.getTime() - (days - 1) * 86_400_000);
    const sinceDay = parisDay(since);
    const rows = await db.query.proDailyStats.findMany({
      where: and(eq(proDailyStats.proId, id), gte(proDailyStats.day, sinceDay)),
    });
    const uses = await db.query.proDiscountUses.findMany({
      where: and(eq(proDiscountUses.proId, id), gte(proDiscountUses.usedAt, new Date(`${sinceDay}T00:00:00+02:00`))),
    });
    const byDay = new Map<string, { views: number; calls: number; routes: number; discounts: number }>();
    for (let i = 0; i < days; i++) {
      byDay.set(parisDay(new Date(since.getTime() + i * 86_400_000)), { views: 0, calls: 0, routes: 0, discounts: 0 });
    }
    for (const r of rows) {
      const d = byDay.get(r.day);
      if (d) {
        d.views += r.views;
        d.calls += r.calls;
        d.routes += r.routes;
      }
    }
    const discountsByGrade: Partial<Record<Grade, number>> = {};
    for (const u of uses) {
      const d = byDay.get(parisDay(u.usedAt));
      if (d) d.discounts++;
      discountsByGrade[u.grade] = (discountsByGrade[u.grade] ?? 0) + 1;
    }
    const series = [...byDay.entries()].map(([day, x]) => ({ day, ...x }));
    const sum = (k: "views" | "calls" | "routes" | "discounts") => series.reduce((a, x) => a + x[k], 0);
    return {
      days,
      views: sum("views"),
      calls: sum("calls"),
      routes: sum("routes"),
      discounts: sum("discounts"),
      discountsByGrade,
      followers: (await followersCounts([id])).get(id) ?? 0,
      series,
    };
  },

  // --- Partenaires des organisateurs -----------------------------------------------------------------------------

  /** `POST /pros/:id/partners` : le pro propose un partenariat à une structure vérifiée ; l'organisateur accepte. */
  async requestPartner(v: Viewer, id: string, structureSlug: string): Promise<ProOwner> {
    const p = await ownedPro(v, id);
    const s = await db.query.structures.findFirst({
      where: and(eq(structures.slug, structureSlug), isNull(structures.deletedAt)),
    });
    if (s?.verification !== "verified") throw notFound("Organisateur introuvable");
    await db.insert(proPartnerLinks).values({ proId: id, structureId: s.id }).onConflictDoNothing();
    return toOwner(p, v);
  },

  /** `DELETE /pros/:id/partners/:structureSlug` */
  async removePartner(v: Viewer, id: string, structureSlug: string): Promise<ProOwner> {
    const p = await ownedPro(v, id);
    const s = await db.query.structures.findFirst({ where: eq(structures.slug, structureSlug) });
    if (s) {
      await db.delete(proPartnerLinks).where(and(eq(proPartnerLinks.proId, id), eq(proPartnerLinks.structureId, s.id)));
    }
    return toOwner(p, v);
  },

  /** `GET /structures/:id/partners` : demandes et partenaires, vus par l'organisateur. */
  async partnersOfStructure(v: Viewer, structureId: string): Promise<StructurePartnerRow[]> {
    await requireOrganizer(v, structureId);
    const rows = await db
      .select({ p: proProfiles, acceptedAt: proPartnerLinks.acceptedAt })
      .from(proPartnerLinks)
      .innerJoin(proProfiles, eq(proProfiles.id, proPartnerLinks.proId))
      .where(and(eq(proPartnerLinks.structureId, structureId), isNull(proProfiles.deletedAt)))
      .orderBy(asc(proProfiles.name));
    return rows.map(({ p, acceptedAt }) => ({
      proSlug: p.slug,
      proName: p.name,
      logoUrl: storage.url(p.logoKey),
      status: acceptedAt ? "accepted" : "pending",
    }));
  },

  /** `PUT /structures/:id/partners/:proSlug` : l'organisateur accepte. */
  async acceptPartner(v: Viewer, structureId: string, proSlug: string): Promise<StructurePartnerRow[]> {
    await requireOrganizer(v, structureId);
    const p = await db.query.proProfiles.findFirst({ where: eq(proProfiles.slug, proSlug) });
    if (!p) throw notFound("Fiche pro introuvable");
    const [row] = await db
      .update(proPartnerLinks)
      .set({ acceptedAt: now() })
      .where(and(eq(proPartnerLinks.proId, p.id), eq(proPartnerLinks.structureId, structureId)))
      .returning();
    if (!row) throw notFound("Aucune demande de ce pro");
    return this.partnersOfStructure(v, structureId);
  },

  /** `DELETE /structures/:id/partners/:proSlug` : refuse ou retire. */
  async dropPartner(v: Viewer, structureId: string, proSlug: string): Promise<StructurePartnerRow[]> {
    await requireOrganizer(v, structureId);
    const p = await db.query.proProfiles.findFirst({ where: eq(proProfiles.slug, proSlug) });
    if (p) {
      await db
        .delete(proPartnerLinks)
        .where(and(eq(proPartnerLinks.proId, p.id), eq(proPartnerLinks.structureId, structureId)));
    }
    return this.partnersOfStructure(v, structureId);
  },

  /** Partenaires acceptés d'une structure, par son slug (page publique de la structure). */
  async partnersPublicBySlug(slug: string): Promise<ProCard[]> {
    const s = await db.query.structures.findFirst({
      where: and(eq(structures.slug, slug), isNull(structures.deletedAt)),
      columns: { id: true, verification: true },
    });
    if (!s || s.verification === "suspended") throw notFound("Structure introuvable");
    return this.partnersPublic(s.id);
  },

  /** Partenaires acceptés d'une structure (page publique de la structure). */
  async partnersPublic(structureId: string): Promise<ProCard[]> {
    const rows = await db
      .select({ p: proProfiles })
      .from(proPartnerLinks)
      .innerJoin(proProfiles, eq(proProfiles.id, proPartnerLinks.proId))
      .where(
        and(
          eq(proPartnerLinks.structureId, structureId),
          isNotNull(proPartnerLinks.acceptedAt),
          isNotNull(proProfiles.publishedAt),
          isNull(proProfiles.deletedAt),
        ),
      )
      .orderBy(asc(proProfiles.name));
    const followers = await followersCounts(rows.map((r) => r.p.id));
    return rows.map(({ p }) => toCard(p, followers.get(p.id) ?? 0));
  },
};
