// Carte « résultat de vote » : le podium (rang, véhicule jamais coupé, pseudo sauf compte privé non suivi, voix),
// « Le vote » ouvre le Prix du public de l'événement.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Image, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { CardShell } from "./CardShell";
import { reasonLine, TrophyHead } from "./parts";
import type { CardProps } from "./types";

export function VoteResultCard({ card, onMenu, faded }: CardProps<"vote_result">) {
  const { t } = useTheme();
  const router = useRouter();
  const { event, podium } = card.payload;
  const first = podium[0];
  return (
    <CardShell
      card={card}
      head={<TrophyHead />}
      title={L.voteResult(event.title)}
      reason={reasonLine(card)}
      onMenu={onMenu}
      faded={faded}
      actions={
        <>
          <View style={styles.grow} />
          <SmButton
            kind="s"
            icon="trophy"
            onPress={() => router.push({ pathname: "/vote/[id]", params: { id: event.id, titre: event.title } })}
            testID="feed-vote-open"
          >
            {L.seeVote}
          </SmButton>
        </>
      }
    >
      {first?.photoUrl ? (
        <View style={[styles.photo, { backgroundColor: t.color.night }]}>
          <Image
            source={mediaSource(first.photoUrl)}
            style={styles.img}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}
      {podium.map((p) => (
        <View key={p.rank} style={styles.row} testID="feed-podium-row">
          <Text variant="numberNarrow" color={t.color.accentText} style={styles.rank}>
            {String(p.rank)}
          </Text>
          <View style={styles.grow}>
            <Text variant="bodyStrong" color={t.color.ink} style={styles.name}>
              {p.vehicleLabel}
            </Text>
            {p.pseudo ? (
              <Text variant="caption" color={t.color.inkMuted}>
                {p.pseudo}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" color={t.color.inkMuted}>
            {L.votes(p.votes)}
          </Text>
        </View>
      ))}
    </CardShell>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  photo: { height: 190, borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.space3 },
  rank: { width: 24, fontSize: 24, lineHeight: 26 },
  name: { fontSize: 14, lineHeight: 18 },
});
