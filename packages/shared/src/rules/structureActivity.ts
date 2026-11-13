import type { StructureActivityFilter } from "../schemas/structureActivity";

// Activité de la structure (lot R9d, pur, testé) : quels types de notification entrent dans quel filtre de l'écran, et ce
// que comptent la cloche et la bulle de la barre du haut d'un organisateur. Aucun type `structure_*` : les types existants
// sont marqués d'une `structure_id` (R9a, point 9).

/** Types de chaque filtre. « Tout » est la réunion de tous, plus `staff_request` (demande de staff : filtre « Tout » seulement). */
export const structureFilterTypes: Record<Exclude<StructureActivityFilter, "all">, readonly string[]> = {
  triage: ["application_received"],
  mentions: ["feed_post_mention"],
  comments: ["feed_comment", "feed_comment_reply"],
  collaborations: ["coauthor_invited"],
};

/** Les types d'un filtre (`all` : tous les types de la structure). */
export function structureActivityTypes(filter: StructureActivityFilter): readonly string[] {
  if (filter !== "all") return structureFilterTypes[filter];
  return [...Object.values(structureFilterTypes).flat(), "staff_request"];
}

/**
 * Les notifications qui annoncent une demande en attente (staff, collaboration) : la ligne « Demandes » les porte, elles ne
 * comptent donc pas dans les « non vus » de la cloche (une demande ne compte qu'une fois, règle R7c2).
 */
export const structureRequestTypes: readonly string[] = ["staff_request", "coauthor_invited"];

/** Résumé de la Boîte d'une structure (`GET /structures/:id/inbox/summary`), anciens champs gardés pour l'APK en ligne. */
export type StructureInboxCountsInput = {
  participantMessages: number;
  staffDiscussions: number;
  staffRequests: number;
  /** Absents d'un serveur plus ancien. */
  activityUnseen?: number;
  coauthorRequests?: number;
};

/** Cloche : nouveautés non vues + demandes de staff + demandes de collaboration. Bulle : conversations seulement. */
export function structureTopBarCounts(summary: StructureInboxCountsInput | null | undefined): {
  activity: number;
  messages: number;
} {
  return {
    activity: (summary?.activityUnseen ?? 0) + (summary?.staffRequests ?? 0) + (summary?.coauthorRequests ?? 0),
    messages: (summary?.participantMessages ?? 0) + (summary?.staffDiscussions ?? 0),
  };
}
