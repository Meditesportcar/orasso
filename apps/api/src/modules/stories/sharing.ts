// Ce que le regard peut faire d'une story où il est identifié (lot R7h) : la reprendre dans la sienne (une structure ou un
// pro qu'il gère, ou lui-même), ou retirer la copie déjà faite. Décidé ici, jamais par l'écran. Une story de crew, d'un
// compte privé, la mienne et une copie n'offrent rien (même règle que `shareRefusal` : une copie n'élargit jamais le public).
import type { StoryShareOption, StorySharing } from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { proProfiles, stories, storyTags, structureMembers, structures } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import { audienceStoryOf, type StoryRow } from "./common";

/** Les structures que je gère (propriétaire ou co-organisateur actif, non supprimées) : id → nom. */
export async function managedStructures(userId: string, ex: Executor = db): Promise<Map<string, string>> {
  const rows = await ex
    .select({ id: structures.id, name: structures.name })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .where(
      and(
        eq(structureMembers.userId, userId),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
        isNull(structures.deletedAt),
      ),
    );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Mes fiches pro (non supprimées) : id → nom. */
export async function ownedPros(userId: string, ex: Executor = db): Promise<Map<string, string>> {
  const rows = await ex
    .select({ id: proProfiles.id, name: proProfiles.name })
    .from(proProfiles)
    .where(and(eq(proProfiles.ownerUserId, userId), isNull(proProfiles.deletedAt)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function sharingOf(v: Viewer, rows: readonly StoryRow[], at: Date): Promise<Map<string, StorySharing>> {
  const out = new Map<string, StorySharing>();
  const candidates = rows.filter(
    (r) =>
      r.story.authorId !== v.user.id &&
      !r.story.sharedFromStoryId &&
      r.story.audience !== "crew" &&
      audienceStoryOf(r, at).authorVisibility === "public",
  );
  if (!candidates.length) return out;
  const ids = candidates.map((r) => r.story.id);
  const [tags, structs, pros] = await Promise.all([
    db
      .select({ storyId: storyTags.storyId, kind: storyTags.targetKind, target: storyTags.targetId })
      .from(storyTags)
      .where(and(inArray(storyTags.storyId, ids), isNull(storyTags.removedAt))),
    managedStructures(v.user.id),
    ownedPros(v.user.id),
  ]);
  // Lot R7m2 : le pro cité en « Collaboration commerciale » compte comme identifié (il peut reprendre la story).
  const cited = candidates.flatMap((r) =>
    r.story.commercialPartnerId && pros.has(r.story.commercialPartnerId)
      ? [{ storyId: r.story.id, kind: "pro" as const, target: r.story.commercialPartnerId }]
      : [],
  );
  const mine = [
    ...tags,
    ...cited.filter((c) => !tags.some((t) => t.storyId === c.storyId && t.kind === "pro" && t.target === c.target)),
  ].filter(
    (t) =>
      (t.kind === "user" && t.target === v.user.id) ||
      (t.kind === "structure" && structs.has(t.target)) ||
      (t.kind === "pro" && pros.has(t.target)),
  );
  if (!mine.length) return out;
  // Les copies déjà faites : au nom d'une de mes structures / fiches, ou en mon nom.
  const copies = await db
    .select({
      id: stories.id,
      from: stories.sharedFromStoryId,
      persona: stories.persona,
      structureId: stories.structureId,
      proId: stories.proId,
      authorId: stories.authorId,
    })
    .from(stories)
    .where(and(inArray(stories.sharedFromStoryId, ids), isNull(stories.deletedAt), sql`${stories.expiresAt} > ${at}`));
  for (const r of candidates) {
    const id = r.story.id;
    const options: StoryShareOption[] = [];
    let taggedMe = false;
    for (const t of mine.filter((m) => m.storyId === id)) {
      if (t.kind === "user") {
        taggedMe = true;
        const copy = copies.find((c) => c.from === id && c.persona === "fan" && c.authorId === v.user.id);
        options.push({ as: "fan", id: null, name: v.profile.pseudo, copyId: copy?.id ?? null });
      } else if (t.kind === "structure") {
        const copy = copies.find((c) => c.from === id && c.persona === "organizer" && c.structureId === t.target);
        options.push({ as: "structure", id: t.target, name: structs.get(t.target) ?? "", copyId: copy?.id ?? null });
      } else {
        const copy = copies.find((c) => c.from === id && c.persona === "pro" && c.proId === t.target);
        options.push({ as: "pro", id: t.target, name: pros.get(t.target) ?? "", copyId: copy?.id ?? null });
      }
    }
    if (options.length) out.set(id, { taggedMe, options });
  }
  return out;
}
