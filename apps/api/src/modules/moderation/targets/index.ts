// Registre des cibles : une ligne par sorte de contenu signalable (ARCHITECTURE-SUITE § 15.3).
import type { ReportTarget } from "@orasso/shared";
import { storyTarget } from "../../stories/moderation";
import { crewTarget, proTarget, providerTarget } from "./community";
import { crewCommentTarget, crewPostTarget } from "./crewFeed";
import { announcementTarget, eventTarget, reviewTarget } from "./event";
import { feedCommentTarget } from "./feedComment";
import { feedPostTarget } from "./feedPost";
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
  crew_post: crewPostTarget,
  crew_comment: crewCommentTarget,
  feed_post: feedPostTarget,
  story: storyTarget,
  feed_comment: feedCommentTarget,
};

export const targetOf = (type: ReportTarget): TargetRules => registry[type];

export type { ReportRow, TargetRules } from "./types";
