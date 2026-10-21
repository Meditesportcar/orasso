// Vues du média (lot 45) : titulaire et administration, public, contenus (D26 : plus de numéro de carte de presse).
import {
  instagramUrl,
  type MediaContentView,
  type MediaFormat,
  type MediaProfileView,
  type MediaPublic,
  mediaProfileIssue,
} from "@orasso/shared";

import type { events, mediaContents, mediaProfiles } from "../../db/schema";
import { storage } from "../../lib/storage";

export type MediaProfileRow = typeof mediaProfiles.$inferSelect;
export type MediaContentRow = typeof mediaContents.$inferSelect;
type EventRow = typeof events.$inferSelect;

/** Titulaire ou administration seulement. */
export function ownerView(p: MediaProfileRow): MediaProfileView {
  return {
    id: p.id,
    name: p.name,
    formats: p.formats as MediaFormat[],
    description: p.description,
    website: p.website,
    instagram: p.instagram,
    youtube: p.youtube,
    logoUrl: storage.url(p.logoKey),
    verifiedAt: p.pressCardVerifiedAt?.toISOString() ?? null,
    departments: p.departments,
    issue: mediaProfileIssue(p),
    createdAt: p.createdAt.toISOString(),
  };
}

export function publicView(p: MediaProfileRow): MediaPublic {
  return {
    id: p.id,
    name: p.name,
    formats: p.formats as MediaFormat[],
    description: p.description,
    website: p.website,
    instagram: instagramUrl(p.instagram),
    youtube: p.youtube,
    logoUrl: storage.url(p.logoKey),
    departments: p.departments,
    verified: p.pressCardVerifiedAt !== null,
  };
}

export function contentView(
  c: MediaContentRow,
  e: Pick<EventRow, "id" | "slug" | "title" | "startsAt">,
  m: MediaProfileRow,
): MediaContentView {
  return {
    id: c.id,
    eventId: c.eventId,
    event: { id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt.toISOString() },
    kind: c.kind,
    title: c.title,
    url: c.url,
    platform: c.platform,
    photos: c.photoKeys.map((key) => ({ key, url: storage.url(key) ?? "" })),
    featured: c.featuredAt !== null,
    views: c.views,
    publishedAt: c.publishedAt.toISOString(),
    media: { id: m.id, name: m.name, logoUrl: storage.url(m.logoKey) },
  };
}
