// Consultation des coordonnées d'un participant après J+7 (lot 27, ARCHITECTURE-SUITE § 11.3, S30) : docs/01 garde les
// informations des participants au-delà de J+7 « en cas d'incident », mais l'accès est tracé. Chaque ouverture d'une
// fiche (ou d'une liste qui montre les coordonnées) écrit `participants.contact_view` au journal d'administration,
// une seule fois par fiche, par personne et par jour (heure de Paris). La clé primaire de `participant_contact_views`
// tient l'unicité sans course : la ligne du journal n'est écrite que si celle de la clé est nouvelle.
import { contactViewTraced, wallTime } from "@orasso/shared";

import { db } from "../../db/client";
import { adminAuditLog, participantContactViews } from "../../db/schema";
import { now } from "../../lib/deps";
import type { EventRow } from "../events/repo";

const pad = (n: number) => String(n).padStart(2, "0");

export const contactViews = {
  /** Trace les fiches montrées avec leurs coordonnées ; ne fait rien avant J+7 ni sans fiche. */
  async trace(viewerId: string, event: Pick<EventRow, "id" | "endsAt" | "structureId">, applicationIds: string[]) {
    const at = now();
    if (!applicationIds.length || !contactViewTraced(event, at)) return;
    const w = wallTime(at);
    const day = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
    await db.transaction(async (tx) => {
      const fresh = await tx
        .insert(participantContactViews)
        .values(applicationIds.map((applicationId) => ({ applicationId, viewerId, day, createdAt: at })))
        .onConflictDoNothing()
        .returning({ applicationId: participantContactViews.applicationId });
      if (!fresh.length) return;
      await tx.insert(adminAuditLog).values(
        fresh.map((f) => ({
          actorUserId: viewerId,
          action: "participants.contact_view",
          targetType: "application",
          targetId: f.applicationId,
          structureId: event.structureId,
          reason: `Fiche ouverte après J+7 (événement ${event.id})`,
          createdAt: at,
        })),
      );
    });
  },
};
