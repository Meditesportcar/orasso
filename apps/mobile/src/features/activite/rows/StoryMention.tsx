// Ligne « X t'a identifié dans sa story » (lot R7c2, fichier RÉSERVÉ au lot R7h). Maquette R7.2 : l'identification se gère
// sur place, avec « Repartager » (reprendre la story dans la sienne, l'auteur est crédité) et « Retirer » (l'identification
// tombe, la story reste). Ces deux boutons et leurs routes (`modules/stories/share.ts`, `share-to-mine`, mentions) sont au
// lot R7h : tant qu'il n'est pas fusionné, la ligne se rend sans eux, comme une ligne ordinaire. R7h remplit `actions`.
import type { ActivityItem } from "@orasso/shared";

import { ActivityLine } from "../ActivityRow";

export function StoryMentionRow({
  item,
  day,
  onPress,
}: {
  item: ActivityItem;
  day: "today" | "week" | "earlier";
  onPress?: () => void;
}) {
  return <ActivityLine item={item} day={day} onPress={onPress} testID="activity-story-mention" />;
}
