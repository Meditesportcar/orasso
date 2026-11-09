// L'icône d'une ligne de vote (lot R7l2) : le trophée pour « Toutes catégories », sinon selon les candidats.
import type { IconName } from "@orasso/design-system/web";
import type { VoteManageItem } from "@orasso/shared";

export function voteIconName(v: Pick<VoteManageItem, "kind" | "candidateMode">): IconName {
  if (v.kind === "all_categories") return "trophy";
  return v.candidateMode === "hand" ? "qr" : v.candidateMode === "zone" ? "place" : "flag";
}
