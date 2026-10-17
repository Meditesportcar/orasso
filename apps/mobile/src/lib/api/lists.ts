// Listes administrables (lot 33) : motifs de refus, types de prestataires, activités des pros (`GET /settings/public`).
import type { PublicSettings } from "@orasso/shared";

import { request } from "../http";

export const listsApi = {
  publicSettings: () => request<PublicSettings>("/api/settings/public"),
};
