// L'Activité (la cloche) et les Demandes (lot R7c2) : les routes de `modules/activity`. Les actions d'une demande restent
// sur les routes de leur domaine (`api.acceptFollow`, `api.acceptContact`…).
import type { ActivityPage, RequestsPage } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const activityApi = {
  activity: (cursor?: string) => request<ActivityPage>(`/api/me/activity${qs({ cursor })}`),
  /** La cloche vient d'être ouverte : la pastille « non vus » tombe. */
  markActivitySeen: () => request<unknown>("/api/me/activity/seen", { method: "POST" }),
  requests: (cursor?: string) => request<RequestsPage>(`/api/me/requests${qs({ cursor })}`),
};
