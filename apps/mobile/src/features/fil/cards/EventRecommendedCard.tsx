// Carte « événement recommandé » : la carte d'événement de l'Explorer (`EventCardV2`, portrait), sans jauge de places
// (le Fil ne connaît pas la capacité), et sous elle la raison et « ⋯ ».
import type { EventCard, FeedEventSummary } from "@orasso/shared";
import { useRouter } from "expo-router";

import { EventCardV2 } from "@/features/explorer/EventCardV2";
import { CardRow } from "./CardRow";
import type { CardProps } from "./types";

/** Le résumé d'événement du Fil, au format que la carte de l'Explorer lit (rien d'inventé : capacité et distance absentes). */
export function eventCardOf(e: FeedEventSummary): EventCard {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    city: e.city,
    department: e.department,
    lat: null,
    lng: null,
    posterUrl: e.posterUrl,
    generatedPosterUrl: e.posterUrl,
    photoUrl: e.photoUrl,
    status: "published",
    outlook: "maintained",
    structure: { id: "", slug: e.structure.slug, name: e.structure.name, logoUrl: e.structure.logoUrl },
    capacity: null,
    remaining: null,
  };
}

export function EventRecommendedCard({ card, onMenu, faded }: CardProps<"event_recommended">) {
  const router = useRouter();
  const event = card.payload.event;
  return (
    <CardRow card={card} title={event.title} onMenu={onMenu} faded={faded} testID="feed-card-event_recommended">
      <EventCardV2 event={eventCardOf(event)} portrait hideSeats onPress={() => router.push(`/e/${event.slug}`)} />
    </CardRow>
  );
}
