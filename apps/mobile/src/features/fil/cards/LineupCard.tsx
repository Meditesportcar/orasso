// Carte « plateau » : « Le plateau de X se remplit », le nombre de voitures et une mosaïque de photos (plaques déjà
// floutées par l'API), « Le plateau » ouvre la page du plateau de l'événement.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L } from "@orasso/shared";
import { Image, StyleSheet, View } from "react-native";
import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { useCardRouter } from "../openFromCard";
import { CardShell } from "./CardShell";
import { OrgLogo, reasonLine } from "./parts";
import type { CardProps } from "./types";

export function LineupCard({ card, onMenu, faded }: CardProps<"lineup">) {
  const { t } = useTheme();
  const router = useCardRouter();
  const { event, count, photoUrls } = card.payload;
  const photos = photoUrls.slice(0, 4);
  return (
    <CardShell
      card={card}
      head={<OrgLogo url={event.structure.logoUrl} name={event.structure.name} />}
      title={L.lineupTitle(event.title)}
      reason={reasonLine(card)}
      onMenu={onMenu}
      faded={faded}
      actions={
        <>
          <View style={styles.grow} />
          <SmButton
            kind="s"
            icon="grid"
            onPress={() => router.push(`/e/${event.slug}/plateau`)}
            testID="feed-lineup-open"
          >
            {L.seeLineup}
          </SmButton>
        </>
      }
    >
      <Text variant="body" color={t.color.ink} style={styles.text}>
        <Text variant="bodyStrong">{L.lineupCount(count)}</Text>
        {event.city ? ` · ${event.city}` : ""}
      </Text>
      {photos.length ? (
        <View style={styles.grid}>
          {photos.map((url) => (
            <View key={url} style={[styles.cell, { backgroundColor: t.color.night }]}>
              <Image source={mediaSource(url)} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />
            </View>
          ))}
        </View>
      ) : null}
    </CardShell>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 20 },
  grow: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cell: { width: "49%", height: 110, borderRadius: tokens.radius.radiusMd - 2, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
});
