import type { FeedCard, FeedCardKind } from "@orasso/shared";

/** Ce qu'une carte reçoit de l'écran : son contenu, le menu « ⋯ » et si « Moins de ce genre » l'a estompée. */
export type CardProps<K extends FeedCardKind = FeedCardKind> = {
  card: FeedCard<K>;
  onMenu: (card: FeedCard) => void;
  faded: boolean;
  /** Une publication supprimée (menu de ma propre publication) sort de la liste. */
  onRemoved?: (card: FeedCard) => void;
};
