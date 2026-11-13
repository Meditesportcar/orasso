import { z } from "zod";

// Activité de la structure (lot R9d) : la cloche de la casquette organisateur. Formes servies par
// `modules/activity/structure.ts` ; la page de `GET /structures/:id/activity` est celle de `GET /me/activity`.

export const structureActivityFilters = ["all", "triage", "mentions", "comments", "collaborations"] as const;
export type StructureActivityFilter = (typeof structureActivityFilters)[number];

/** `GET /structures/:id/activity?cursor=&filter=` */
export const structureActivityQuery = z.object({
  cursor: z.string().max(200).optional(),
  filter: z.enum(structureActivityFilters).default("all"),
});

/** `GET /structures/:id/activity/count` : non vus depuis mon dernier passage, et demandes en attente. */
export type StructureActivityCount = { unseen: number; requests: { staff: number; coauthor: number } };
