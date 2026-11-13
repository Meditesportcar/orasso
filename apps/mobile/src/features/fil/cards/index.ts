// Le registre des cartes du Fil : un fichier par genre (`kind`), `{ kind → Card }`. Un genre que l'API produit et que ce
// registre ne connaît pas rend `UnknownCard` (jamais une carte vide, jamais un plantage). Les trois genres réservés
// (`spot_meetup` R7i, `memory` R7j, `sponsored` R7k2) pointent sur des fichiers que ces lots remplacent.
import { type FeedCardKind, feedCardKinds } from "@orasso/shared";
import type { ComponentType } from "react";

import { AlbumCard } from "./AlbumCard";
import { AnnouncementCard } from "./AnnouncementCard";
import { EventRecommendedCard } from "./EventRecommendedCard";
import { FeedPostCard } from "./FeedPostCard";
import { LineupCard } from "./LineupCard";
import { MemoryCard } from "./MemoryCard";
import { ProCard } from "./ProCard";
import { SponsoredCard } from "./SponsoredCard";
import { SpotMeetupCard } from "./SpotMeetupCard";
import type { CardProps } from "./types";
import { UnknownCard } from "./UnknownCard";
import { VehiclePublicCard } from "./VehiclePublicCard";
import { VoteResultCard } from "./VoteResultCard";

// biome-ignore lint/suspicious/noExplicitAny: chaque carte reçoit la carte de son genre (`CardProps<K>`), le registre les range ensemble.
export const cardRegistry: { [K in FeedCardKind]: ComponentType<CardProps<any>> } = {
  event_recommended: EventRecommendedCard,
  vehicle_public: VehiclePublicCard,
  lineup: LineupCard,
  vote_result: VoteResultCard,
  announcement: AnnouncementCard,
  pro: ProCard,
  spot_meetup: SpotMeetupCard,
  feed_post: FeedPostCard,
  memory: MemoryCard,
  sponsored: SponsoredCard,
  // Lot R9e : la carte « album » (l'API ne la sert qu'à qui envoie `?cards=album`, ce que fait cette appli).
  album: AlbumCard,
};

/** Le composant d'un genre ; `UnknownCard` pour un genre que ce registre ne connaît pas. */
export function cardFor(kind: string): ComponentType<CardProps> {
  const known = (feedCardKinds as readonly string[]).includes(kind);
  return (known ? cardRegistry[kind as FeedCardKind] : UnknownCard) as ComponentType<CardProps>;
}
