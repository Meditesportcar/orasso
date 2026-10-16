// Registre des cibles : une ligne par sorte de contenu signalable (ARCHITECTURE-SUITE § 15.3).
import type { ReportTarget } from "@orasso/shared";

import { crewTarget, proTarget, providerTarget } from "./community";
import { announcementTarget, eventTarget, reviewTarget } from "./event";
import { messageTarget } from "./message";
import { profileTarget } from "./profile";
import type { TargetRules } from "./types";
import { photoTarget, vehicleTarget } from "./vehicle";

const registry: Record<ReportTarget, TargetRules> = {
  profile: profileTarget,
  vehicle: vehicleTarget,
  photo: photoTarget,
  message: messageTarget,
  event: eventTarget,
  review: reviewTarget,
  crew: crewTarget,
  pro: proTarget,
  provider: providerTarget,
  announcement: announcementTarget,
};

export const targetOf = (type: ReportTarget): TargetRules => registry[type];

export type { ReportRow, TargetRules } from "./types";
