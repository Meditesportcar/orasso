// Modération (lot 32) : signaler un contenu, mes sanctions, contester.
import type { MySanction, ReportReason, ReportTarget } from "@orasso/shared";

import { request } from "../http";

export const moderationApi = {
  report: (body: {
    targetType: ReportTarget;
    targetId: string;
    reason: ReportReason;
    details: string | null;
    screenshotKey: string | null;
  }) => request<{ id: string }>("/api/reports", { method: "POST", body }),
  mySanctions: () => request<MySanction[]>("/api/me/sanctions"),
  contestSanction: (id: string, message: string) =>
    request<MySanction>(`/api/sanctions/${id}/contest`, { method: "POST", body: { message } }),
};
