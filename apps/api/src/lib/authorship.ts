// Agir au nom d'une casquette (vague R8, lot R8a1, ARCHITECTURE-R8 § 2.3) : le **seul** endroit où l'on décide qu'un compte
// peut parler au nom d'une page (publier, épingler, masquer, « Info importante », accepter une collaboration, supprimer un
// commentaire sous une publication de la page). Reprend `checkPersona` des stories :
// - structure : propriétaire ou co-organisateur actif d'une structure ni supprimée ni suspendue, **puis** second facteur
//   (`requireOrganizer`, dont l'erreur remonte telle quelle) ;
// - fiche pro : propriétaire de la fiche non supprimée ;
// - prestataire, média : titulaire du profil non supprimé (l'identifiant est résolu par le serveur, jamais reçu).
import { type AuthorKind, authorKeyOf, publicationErrors, type StoryPersona } from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { mediaProfiles, proProfiles, providerProfiles, structureMembers, structures } from "../db/schema";
import { requireOrganizer } from "./access";
import { AppError, validation } from "./errors";
import type { Viewer } from "./session";
import type { Executor } from "./tx";

export type Authorship = { key: string; kind: AuthorKind; id: string };
export type AuthorshipInput = { persona: StoryPersona; structureId?: string | null; proId?: string | null };

const denied = () => new AppError(403, "persona_forbidden", publicationErrors.persona_forbidden);

/** Les colonnes d'une publication qui disent à qui elle appartient. */
export type PostPageColumns = {
  persona: StoryPersona;
  authorId: string;
  structureId: string | null;
  proId: string | null;
  providerId: string | null;
  mediaId: string | null;
};

/**
 * Le compte peut-il parler au nom de cette casquette ? Rend la clé de l'auteur. 403 `persona_forbidden` sinon ; les
 * autres erreurs (second facteur manquant, identifiant manquant) remontent telles quelles.
 */
export async function requireAuthorship(v: Viewer, input: AuthorshipInput, ex: Executor = db): Promise<Authorship> {
  const userId = v.user.id;
  const { persona } = input;
  if (persona === "fan") {
    if (input.structureId || input.proId) throw validation(publicationErrors.unexpectedPage);
    return { key: authorKeyOf("user", userId), kind: "user", id: userId };
  }
  if (persona === "organizer") {
    if (input.proId) throw validation(publicationErrors.unexpectedPage);
    if (!input.structureId) throw validation(publicationErrors.choosePage, { field: "structureId" });
    const [m] = await ex
      .select({ role: structureMembers.role })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(
        and(
          eq(structureMembers.structureId, input.structureId),
          eq(structureMembers.userId, userId),
          eq(structureMembers.status, "active"),
          inArray(structureMembers.role, ["owner", "co_organizer"]),
          isNull(structures.deletedAt),
          sql`${structures.verification} <> 'suspended'`,
        ),
      );
    if (!m) throw denied();
    // Second facteur : publier au nom d'une structure l'exige, comme le repartage et le retrait (lot R7h, tour 3).
    await requireOrganizer(v, input.structureId);
    return { key: authorKeyOf("structure", input.structureId), kind: "structure", id: input.structureId };
  }
  if (persona === "pro") {
    if (input.structureId) throw validation(publicationErrors.unexpectedPage);
    if (!input.proId) throw validation(publicationErrors.choosePage, { field: "proId" });
    const [p] = await ex
      .select({ id: proProfiles.id })
      .from(proProfiles)
      .where(and(eq(proProfiles.id, input.proId), eq(proProfiles.ownerUserId, userId), isNull(proProfiles.deletedAt)));
    if (!p) throw denied();
    return { key: authorKeyOf("pro", p.id), kind: "pro", id: p.id };
  }
  if (input.structureId || input.proId) throw validation(publicationErrors.unexpectedPage);
  if (persona === "provider") {
    const [p] = await ex
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(and(eq(providerProfiles.userId, userId), isNull(providerProfiles.deletedAt)))
      .limit(1);
    if (!p) throw denied();
    return { key: authorKeyOf("provider", p.id), kind: "provider", id: p.id };
  }
  const [m] = await ex
    .select({ id: mediaProfiles.id })
    .from(mediaProfiles)
    .where(and(eq(mediaProfiles.userId, userId), isNull(mediaProfiles.deletedAt)))
    .limit(1);
  if (!m) throw denied();
  return { key: authorKeyOf("media", m.id), kind: "media", id: m.id };
}

/** La page d'une publication (type et identifiant), ou `null` pour un passionné. */
export function pageOf(post: PostPageColumns): { kind: AuthorKind; id: string } | null {
  if (post.persona === "organizer" && post.structureId) return { kind: "structure", id: post.structureId };
  if (post.persona === "pro" && post.proId) return { kind: "pro", id: post.proId };
  if (post.persona === "provider" && post.providerId) return { kind: "provider", id: post.providerId };
  if (post.persona === "media" && post.mediaId) return { kind: "media", id: post.mediaId };
  return null;
}

/**
 * Le compte peut-il gérer cette publication (la retirer, plus tard l'épingler ou masquer) ? `fan` : son auteur ; page :
 * `requireAuthorship` au nom de **cette** page (faux sur `persona_forbidden` ; les autres erreurs remontent, par exemple le
 * second facteur manquant).
 */
export async function canManagePost(v: Viewer, post: PostPageColumns, ex: Executor = db): Promise<boolean> {
  const page = pageOf(post);
  if (!page) return post.persona === "fan" && post.authorId === v.user.id;
  try {
    const a = await requireAuthorship(
      v,
      { persona: post.persona, structureId: post.structureId, proId: post.proId },
      ex,
    );
    return a.kind === page.kind && a.id === page.id;
  } catch (error) {
    if (error instanceof AppError && error.code === "persona_forbidden") return false;
    throw error;
  }
}

/**
 * Les clés des pages que ce compte gère, **pour l'affichage seulement** (`mine`, « Mes publications ») : sans second
 * facteur. Toute écriture repasse par `requireAuthorship`.
 */
export async function managedPageKeys(userId: string, ex: Executor = db): Promise<Set<string>> {
  const [structs, pros, providers, medias] = await Promise.all([
    ex
      .select({ id: structureMembers.structureId })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(
        and(
          eq(structureMembers.userId, userId),
          eq(structureMembers.status, "active"),
          inArray(structureMembers.role, ["owner", "co_organizer"]),
          isNull(structures.deletedAt),
          sql`${structures.verification} <> 'suspended'`,
        ),
      ),
    ex
      .select({ id: proProfiles.id })
      .from(proProfiles)
      .where(and(eq(proProfiles.ownerUserId, userId), isNull(proProfiles.deletedAt))),
    ex
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(and(eq(providerProfiles.userId, userId), isNull(providerProfiles.deletedAt))),
    ex
      .select({ id: mediaProfiles.id })
      .from(mediaProfiles)
      .where(and(eq(mediaProfiles.userId, userId), isNull(mediaProfiles.deletedAt))),
  ]);
  return new Set([
    ...structs.map((r) => authorKeyOf("structure", r.id)),
    ...pros.map((r) => authorKeyOf("pro", r.id)),
    ...providers.map((r) => authorKeyOf("provider", r.id)),
    ...medias.map((r) => authorKeyOf("media", r.id)),
  ]);
}
