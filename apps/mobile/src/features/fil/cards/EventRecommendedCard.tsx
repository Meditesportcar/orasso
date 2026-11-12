// Carte « événement recommandé » (maquette R7.6 `p-fil fd_full`, la même que celle du site) : le rond de l'organisateur,
// le titre de l'événement, la raison et « ⋯ » dans l'en-tête (comme toutes les cartes du Fil), puis l'affiche avec sa date
// en pastille, une ligne qui dit qui ouvre quoi, et « Voir la fiche ». `EventCardV2` reste la carte de l'Explorer.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L } from "@orasso/shared";
import { Image, StyleSheet, View } from "react-native";
import { stubOf } from "@/features/explorer/EventCardV2";
import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { useCardRouter } from "../openFromCard";
import { CardShell } from "./CardShell";
import { OrgLogo, reasonLine } from "./parts";
import type { CardProps } from "./types";

export function EventRecommendedCard({ card, onMenu, faded }: CardProps<"event_recommended">) {
  const { t } = useTheme();
  const c = t.color;
  const router = useCardRouter();
  const event = card.payload.event;
  const stub = stubOf(event.startsAt);
  const source = mediaSource(event.photoUrl ?? event.posterUrl);
  return (
    <CardShell
      card={card}
      head={<OrgLogo url={event.structure.logoUrl} name={event.structure.name} />}
      title={event.title}
      reason={reasonLine(card)}
      onMenu={onMenu}
      faded={faded}
      testID="feed-card-event_recommended"
      actions={
        <>
          <View style={styles.grow} />
          <SmButton kind="s" icon="next" onPress={() => router.push(`/e/${event.slug}`)} testID="feed-event-open">
            {L.seeEvent}
          </SmButton>
        </>
      }
    >
      {source ? (
        <View style={[styles.media, { backgroundColor: c.night }]}>
          <Image source={source} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={[styles.stub, { backgroundColor: c.accent }]} testID="feed-event-stub">
            <Text variant="label" color={c.accentInk} style={styles.stubDay}>
              {stub.day}
            </Text>
            <Text variant="numberNarrow" color={c.accentInk} style={styles.stubDate}>
              {stub.date}
            </Text>
            <Text variant="label" color={c.accentInk} style={styles.stubDay}>
              {stub.month}
            </Text>
          </View>
        </View>
      ) : null}
      <Text variant="body" color={c.ink} style={styles.text}>
        <Text variant="bodyStrong">{event.structure.name}</Text>
        {event.city ? ` · ${event.city}` : ""}
      </Text>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  media: { width: "100%", aspectRatio: 1.7, borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  stub: {
    position: "absolute",
    top: 10,
    left: 10,
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: tokens.radius.radiusSm,
    alignItems: "center",
  },
  stubDay: { fontSize: 10, lineHeight: 12, textTransform: "uppercase" },
  stubDate: { fontSize: 22, lineHeight: 24 },
  text: { fontSize: 14, lineHeight: 20 },
});
