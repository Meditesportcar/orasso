import type { NotificationFamily } from "../enums";

/**
 * Stories (lot R7f1). Les mêmes types sont aussi déclarés par R7c1 (`notifications/r7.ts`) : le coordinateur garde ce
 * dernier à la fusion. `story_like` et `story_published` : Journal seul (ni push ni e-mail) ; `story_mention` : push.
 */
export const storyNotificationTypes = {
  story_like: "social",
  story_mention: "social",
  story_published: "social",
} as const satisfies Record<string, NotificationFamily>;

export const storyNotificationLabels: Record<keyof typeof storyNotificationTypes, string> = {
  story_like: "Une flamme sur ma story",
  story_mention: "Identifié dans une story",
  story_published: "Une personne que je suis publie une story",
};

/** Actualités du Journal : ni push, ni e-mail, livrées tout de suite. */
export const storyJournalOnlyTypes: readonly string[] = ["story_like", "story_published"];
/** Pas d'e-mail de repli pour une identification (push et Journal seulement). */
export const storyNoEmailTypes: readonly string[] = ["story_mention"];
