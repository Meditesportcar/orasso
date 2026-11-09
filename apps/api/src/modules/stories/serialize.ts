// Forme d'une story renvoyée au regard (lot R7f1) : liste blanche de champs, fichiers par la route protégée, voiture
// par sa photo masquée seulement, événement seulement si le regard peut le voir, identifications visibles seulement
// puisque la story l'est. Le nombre de vues et de flammes : l'auteur seul.
import { maskedPhoto, type StoryTagView, type StoryView } from "@orasso/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import {
  events,
  profiles,
  proProfiles,
  stories,
  storyReactions,
  storyTags,
  storyViews,
  structures,
} from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { canSeeEvent } from "../invitations/access";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { accountActive, creditOf, type StoryRow } from "./common";
import { sharingOf } from "./sharing";

export const fileNameOf = (key: string) => key.slice(key.lastIndexOf("/") + 1);

export const mediaUrlOf = (storyId: string, key: string) => `/api/stories/${storyId}/media/${fileNameOf(key)}`;
export const posterUrlOf = (storyId: string, key: string) => `/api/stories/${storyId}/poster/${fileNameOf(key)}`;

async function tagsOf(ids: string[]): Promise<Map<string, StoryTagView[]>> {
  const out = new Map<string, StoryTagView[]>();
  if (!ids.length) return out;
  const tags = await db
    .select()
    .from(storyTags)
    .where(and(inArray(storyTags.storyId, ids), isNull(storyTags.removedAt)))
    .orderBy(storyTags.createdAt);
  const userIds = tags.filter((t) => t.targetKind === "user").map((t) => t.targetId);
  const structureIds = tags.filter((t) => t.targetKind === "structure").map((t) => t.targetId);
  const proIds = tags.filter((t) => t.targetKind === "pro").map((t) => t.targetId);
  const at = now();
  const [people, structs, pros] = await Promise.all([
    userIds.length ? db.select().from(profiles).where(inArray(profiles.userId, userIds)) : [],
    structureIds.length
      ? db
          .select({
            id: structures.id,
            name: structures.name,
            slug: structures.slug,
            logoKey: structures.logoKey,
            deletedAt: structures.deletedAt,
          })
          .from(structures)
          .where(inArray(structures.id, structureIds))
      : [],
    proIds.length
      ? db
          .select({
            id: proProfiles.id,
            name: proProfiles.name,
            slug: proProfiles.slug,
            logoKey: proProfiles.logoKey,
            deletedAt: proProfiles.deletedAt,
          })
          .from(proProfiles)
          .where(inArray(proProfiles.id, proIds))
      : [],
  ]);
  const personBy = new Map(people.map((p) => [p.userId, p]));
  const structBy = new Map(structs.map((s) => [s.id, s]));
  const proBy = new Map(pros.map((p) => [p.id, p]));
  for (const t of tags) {
    let view: StoryTagView | null = null;
    if (t.targetKind === "user") {
      const p = personBy.get(t.targetId);
      if (p && accountActive(p, at))
        view = { kind: "user", id: p.userId, name: p.pseudo, slug: p.pseudo, avatarUrl: storage.url(p.avatarKey) };
    } else if (t.targetKind === "structure") {
      const s = structBy.get(t.targetId);
      if (s && !s.deletedAt)
        view = { kind: "structure", id: s.id, name: s.name, slug: s.slug, avatarUrl: storage.url(s.logoKey) };
    } else {
      const p = proBy.get(t.targetId);
      if (p && !p.deletedAt)
        view = { kind: "pro", id: p.id, name: p.name, slug: p.slug, avatarUrl: storage.url(p.logoKey) };
    }
    if (!view) continue;
    const list = out.get(t.storyId) ?? [];
    list.push(view);
    out.set(t.storyId, list);
  }
  return out;
}

export async function serializeStories(v: Viewer, rows: readonly StoryRow[]): Promise<StoryView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.story.id);
  const [seen, liked, tags, sharing] = await Promise.all([
    db
      .select({ id: storyViews.storyId })
      .from(storyViews)
      .where(and(eq(storyViews.viewerId, v.user.id), inArray(storyViews.storyId, ids))),
    db
      .select({ id: storyReactions.storyId })
      .from(storyReactions)
      .where(and(eq(storyReactions.userId, v.user.id), inArray(storyReactions.storyId, ids))),
    tagsOf(ids),
    sharingOf(v, rows, now()),
  ]);
  const seenIds = new Set(seen.map((r) => r.id));
  const likedIds = new Set(liked.map((r) => r.id));

  // Voitures : la photo masquée (plaque floutée ou « aucune plaque visible »), sinon silhouette.
  const linkedOf = (type: "event" | "vehicle") =>
    rows.flatMap((r) => (r.story.linkedType === type && r.story.linkedId ? [r.story.linkedId] : []));
  const isUuid = (x: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
  const vehicleIds = [
    ...new Set([...rows.flatMap((r) => (r.story.vehicleId ? [r.story.vehicleId] : [])), ...linkedOf("vehicle")]),
  ].filter(isUuid);
  const vehicleRows = await vehiclesRepo.findFullByIds(vehicleIds);
  const vehicleBy = new Map(vehicleRows.filter((x) => x.status === "active").map((x) => [x.id, x]));

  const eventIds = [
    ...new Set([...rows.flatMap((r) => (r.story.eventId ? [r.story.eventId] : [])), ...linkedOf("event")]),
  ].filter(isUuid);
  const eventRows = eventIds.length
    ? await db
        .select({
          id: events.id,
          slug: events.slug,
          title: events.title,
          startsAt: events.startsAt,
          status: events.status,
          admission: events.admission,
          structureId: events.structureId,
        })
        .from(events)
        .where(inArray(events.id, eventIds))
    : [];
  const eventBy = new Map<string, { id: string; slug: string; title: string; startsAt: string }>();
  for (const e of eventRows) {
    if (e.status === "draft") continue;
    if (!(await canSeeEvent(e, v))) continue;
    eventBy.set(e.id, { id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt.toISOString() });
  }

  return rows.map((r) => {
    const s = r.story;
    const mine = s.authorId === v.user.id;
    const vehicle = s.vehicleId ? vehicleBy.get(s.vehicleId) : undefined;
    const photo = vehicle ? maskedPhoto(vehicle.photos, vehicle.unregistered) : null;
    // Contenu lié : refiltré pour chaque lecteur avec les droits actuels (événement devenu privé ou brouillon, voiture
    // retirée ou changée de main) ; ce qui n'est pas visible n'est pas renvoyé, pas même son identifiant.
    const linkedVisible =
      s.linkedType && s.linkedId
        ? s.linkedType === "event"
          ? eventBy.has(s.linkedId)
          : s.linkedType === "vehicle"
            ? vehicleBy.get(s.linkedId)?.ownerId === s.authorId
            : false
        : false;
    return {
      id: s.id,
      mediaKind: s.mediaKind,
      mediaUrl: mediaUrlOf(s.id, s.storageKey),
      posterUrl: s.posterKey ? posterUrlOf(s.id, s.posterKey) : null,
      durationMs: s.durationMs,
      status: s.status,
      caption: s.caption,
      placeLabel: s.placeLabel,
      vehicle: vehicle
        ? { id: vehicle.id, label: vehicleLabel(vehicle), photoUrl: storage.url(photo?.storageKey ?? null) }
        : null,
      event: s.eventId ? (eventBy.get(s.eventId) ?? null) : null,
      tags: tags.get(s.id) ?? [],
      linked: linkedVisible && s.linkedType && s.linkedId ? { type: s.linkedType, id: s.linkedId } : null,
      commercialPartner: null,
      audience: s.audience,
      crewName: s.audience === "crew" ? r.crewName : null,
      // Le crédit d'une copie : l'identité PUBLIQUE de l'originale selon sa casquette (lot R7h, tour 2).
      sharedFrom: creditOf(r, storage.url),
      sharing: sharing.get(s.id) ?? null,
      viewed: mine || seenIds.has(s.id),
      reacted: likedIds.has(s.id),
      viewsCount: mine ? s.viewsCount : null,
      reactionsCount: mine ? s.reactionsCount : null,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    } satisfies StoryView;
  });
}
