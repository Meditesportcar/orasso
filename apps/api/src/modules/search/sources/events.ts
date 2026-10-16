// Événements publiés à venir (ni brouillon, ni sur invitation, organisateur vérifié et en règle) : visibles sans compte.
import { type EventCard, eventListQuerySchema } from "@orasso/shared";

import { exploreEvents } from "../../events/explore";
import type { SearchSource } from "./index";

export const eventsSource: SearchSource<"events"> = {
  group: "events",
  needsAccount: false,
  run({ viewer, q, limit }): Promise<EventCard[]> {
    const query = eventListQuerySchema.parse({ q, limit: limit + 1 });
    return exploreEvents(query, viewer).then((page) => page.items);
  },
};
