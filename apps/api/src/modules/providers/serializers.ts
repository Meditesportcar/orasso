// Vues du profil prestataire (lot 21) : propriétaire, public (connectés), tri de l'organisateur, fiche de l'événement.
import {
  type EventProviderPublic,
  instagramUrl,
  menuPriceRange,
  menuToText,
  type ProviderForTriage,
  type ProviderPower,
  type ProviderProfileView,
  type ProviderPublic,
  type ProviderVitrine,
  providerProfileIssue,
  providerTypeLabel,
  type VendorTypeCode,
} from "@orasso/shared";
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { proProfiles, providerPhotos, providerProfiles } from "../../db/schema";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";

export type ProviderRow = typeof providerProfiles.$inferSelect;
export type ProviderPhotoRow = typeof providerPhotos.$inferSelect;

export type ProviderWith = ProviderRow & { photos: ProviderPhotoRow[]; proSlug: string | null };

/** Profils avec leurs photos (ordre de `position`) et le slug de la fiche pro liée, chargés par lots. */
export async function loadProviders(ids: string[], ex: Executor = db): Promise<Map<string, ProviderWith>> {
  const out = new Map<string, ProviderWith>();
  if (!ids.length) return out;
  const unique = [...new Set(ids)];
  const rows = await ex.select().from(providerProfiles).where(inArray(providerProfiles.id, unique));
  const photos = await ex
    .select()
    .from(providerPhotos)
    .where(inArray(providerPhotos.providerId, unique))
    .orderBy(asc(providerPhotos.position), asc(providerPhotos.createdAt));
  const proIds = [...new Set(rows.flatMap((r) => (r.proProfileId ? [r.proProfileId] : [])))];
  const pros = proIds.length
    ? await ex
        .select({ id: proProfiles.id, slug: proProfiles.slug, publishedAt: proProfiles.publishedAt })
        .from(proProfiles)
        .where(inArray(proProfiles.id, proIds))
    : [];
  const slugOf = new Map(pros.map((p) => [p.id, p.publishedAt ? p.slug : null]));
  for (const r of rows) {
    out.set(r.id, {
      ...r,
      photos: photos.filter((p) => p.providerId === r.id),
      proSlug: r.proProfileId ? (slugOf.get(r.proProfileId) ?? null) : null,
    });
  }
  return out;
}

export async function loadProvider(id: string, ex: Executor = db): Promise<ProviderWith | null> {
  return (await loadProviders([id], ex)).get(id) ?? null;
}

const photoViews = (p: ProviderWith) => p.photos.map((x) => ({ id: x.id, url: storage.url(x.storageKey) ?? "" }));
const typeOf = (p: ProviderRow) => p.type as VendorTypeCode;

/** Vitrine (lot 46) : métiers (le principal en tête), menu et prix, besoins sur place, rayon. */
export function vitrineOf(p: ProviderRow): ProviderVitrine {
  const trades = p.trades.length ? (p.trades as VendorTypeCode[]) : [typeOf(p)];
  return {
    trades,
    tagline: p.tagline,
    teamSize: p.teamSize,
    menu: p.menu,
    menuRange: menuPriceRange(p.menu),
    powerNeed: p.powerNeed as ProviderPower | null,
    frontageM: p.frontageM,
    waterNeed: p.waterNeed,
    radiusKm: p.radiusKm,
  };
}

export function ownerView(p: ProviderWith): ProviderProfileView {
  return {
    ...vitrineOf(p),
    menuText: menuToText(p.menu),
    id: p.id,
    type: typeOf(p),
    customType: p.customType,
    typeLabel: providerTypeLabel(typeOf(p), p.customType),
    name: p.name,
    description: p.description,
    phone: p.phone,
    email: p.email,
    website: p.website,
    instagram: p.instagram,
    portfolioUrl: p.portfolioUrl,
    departments: p.departments,
    photos: photoViews(p),
    proProfileId: p.proProfileId,
    proSlug: p.proSlug,
    issue: providerProfileIssue({
      name: p.name,
      type: typeOf(p),
      photosCount: p.photos.length,
      instagram: p.instagram,
      portfolioUrl: p.portfolioUrl,
    }),
    createdAt: p.createdAt.toISOString(),
  };
}

export function publicView(p: ProviderWith): ProviderPublic {
  return {
    ...vitrineOf(p),
    id: p.id,
    type: typeOf(p),
    typeLabel: providerTypeLabel(typeOf(p), p.customType),
    name: p.name,
    description: p.description,
    website: p.website,
    instagram: instagramUrl(p.instagram),
    portfolioUrl: p.portfolioUrl,
    departments: p.departments,
    photos: photoViews(p),
    proSlug: p.proSlug,
  };
}

/**
 * Organisateur : coordonnées comprises ; staff de filtration : sans téléphone ni e-mail. Lot 46 : mission,
 * emplacement et avis de la candidature (`providerTriageExtras`).
 */
export function triageView(
  p: ProviderWith,
  accreditedMedia: boolean,
  withContact: boolean,
  extras?: Pick<ProviderForTriage, "need" | "spot" | "review">,
): ProviderForTriage {
  return {
    ...publicView(p),
    phone: withContact ? p.phone : null,
    email: withContact ? p.email : null,
    accreditedMedia,
    need: extras?.need ?? null,
    spot: extras?.spot ?? null,
    review: extras?.review ?? null,
  };
}

/** Fiche de l'événement : nom, type, Instagram (photographes), première photo, badge « Média officiel ». */
export function presentView(p: ProviderWith, accreditedMedia: boolean): EventProviderPublic {
  const photographer = typeOf(p) === "photographer";
  return {
    id: p.id,
    name: p.name,
    type: typeOf(p),
    typeLabel: providerTypeLabel(typeOf(p), p.customType),
    instagram: photographer ? instagramUrl(p.instagram) : null,
    photoUrl: p.photos[0] ? storage.url(p.photos[0].storageKey) : null,
    proSlug: p.proSlug,
    accreditedMedia,
  };
}

export const providerById = async (id: string, ex: Executor = db) =>
  ex.query.providerProfiles.findFirst({ where: eq(providerProfiles.id, id) });
