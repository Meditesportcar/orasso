// Casquettes du compte (lot 16, ARCHITECTURE-SUITE § 7.1) : le passionné (toujours en premier), les structures dont on
// est propriétaire ou co-organisateur (actif), la fiche pro, puis ce que les autres domaines ajoutent (le profil
// prestataire du lot 21 déclare sa source ici avec `registerPersonaSource`). `badge` = « quelque chose à traiter »,
// calculé domaine par domaine ; 0 tant qu'aucun domaine n'a de quoi le remplir.
import type { PersonaEntry } from "@orasso/shared";
import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, proProfiles, structureMembers, structures } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";

/** Une source de casquettes : ajoute zéro, une ou plusieurs entrées (jamais le passionné, posé ici). */
export type PersonaSource = (v: Viewer) => Promise<PersonaEntry[]>;

/** Un compteur « à traiter » pour la casquette d'une structure (candidatures, messages, demandes de staff…). */
export type OrganizerBadgeHook = (structureId: string, v: Viewer) => Promise<number>;

const organizerBadgeHooks: OrganizerBadgeHook[] = [];
/** Les lots 18 (messages des participants) et 24 (demandes de staff) ajoutent leur compteur ici. */
export const registerOrganizerBadge = (hook: OrganizerBadgeHook) => {
  organizerBadgeHooks.push(hook);
};

/** Candidatures `pending` de la structure (qui attendent le tri) : le premier « à traiter » de l'organisateur. */
const pendingApplicationsBadge: OrganizerBadgeHook = async (structureId) => {
  const [row] = await db
    .select({ n: count() })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(and(eq(events.structureId, structureId), eq(applications.status, "pending")));
  return row?.n ?? 0;
};
registerOrganizerBadge(pendingApplicationsBadge);

async function organizerPersonas(v: Viewer): Promise<PersonaEntry[]> {
  const rows = await db
    .select({ id: structures.id, name: structures.name, logoKey: structures.logoKey })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .where(
      and(
        eq(structureMembers.userId, v.user.id),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
        isNull(structures.deletedAt),
      ),
    )
    .orderBy(structures.name);
  return Promise.all(
    rows.map(async (s) => ({
      kind: "organizer" as const,
      id: s.id,
      label: s.name,
      logoUrl: storage.url(s.logoKey),
      badge: (await Promise.all(organizerBadgeHooks.map((hook) => hook(s.id, v)))).reduce((a, b) => a + b, 0),
    })),
  );
}

async function proPersonas(v: Viewer): Promise<PersonaEntry[]> {
  const pro = await db.query.proProfiles.findFirst({
    where: and(eq(proProfiles.ownerUserId, v.user.id), isNull(proProfiles.deletedAt)),
  });
  // Casquette Pro : rien à traiter (pas de Boîte avant le lot 18).
  return pro ? [{ kind: "pro", id: pro.id, label: pro.name, logoUrl: storage.url(pro.logoKey), badge: 0 }] : [];
}

const sources: PersonaSource[] = [organizerPersonas, proPersonas];
export const registerPersonaSource = (source: PersonaSource) => {
  sources.push(source);
};

export async function personasOf(v: Viewer): Promise<PersonaEntry[]> {
  const fan: PersonaEntry = {
    kind: "fan",
    id: "fan",
    label: "Passionné",
    logoUrl: storage.url(v.profile.avatarKey),
    badge: 0,
  };
  const others = await Promise.all(sources.map((source) => source(v)));
  return [fan, ...others.flat()];
}
