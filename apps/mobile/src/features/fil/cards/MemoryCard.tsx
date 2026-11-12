// Carte « souvenir » du Fil (lot R7j, registre R7e2) : personnelle, visible de moi seul. « Il y a un an, tu étais à … »,
// la photo masquée de ma voiture (sinon l'affiche), « Voir » ouvre la page du souvenir.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { memoryLabels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import { MemoryPhoto } from "@/features/memories/MemoryPhoto";
import { SmButton } from "@/ui/Kit";
import { useCardRouter } from "../openFromCard";
import { CardShell } from "./CardShell";
import { reasonLine } from "./parts";
import type { CardProps } from "./types";

export function MemoryCard({ card, onMenu, faded }: CardProps<"memory">) {
  const { t } = useTheme();
  const router = useCardRouter();
  const { memory } = card.payload;
  return (
    <CardShell
      card={card}
      head={
        <View style={[styles.head, { backgroundColor: t.color.surfaceRaised }]}>
          <Icon name="spark" size={20} color={t.color.accentText} />
        </View>
      }
      title={memoryLabels.cardTitle(memory.yearsAgo, memory.title)}
      reason={reasonLine(card)}
      onMenu={onMenu}
      faded={faded}
      actions={
        <>
          <View style={styles.grow} />
          <SmButton
            kind="s"
            icon="stamp"
            onPress={() => router.push({ pathname: "/souvenir/[eventId]", params: { eventId: memory.eventId } })}
            testID="feed-memory-open"
          >
            {memoryLabels.see}
          </SmButton>
          <SmButton
            kind="s"
            icon="grid"
            onPress={() => router.push({ pathname: "/e/[slug]/plateau", params: { slug: memory.slug } })}
            testID="feed-memory-plateau"
          >
            {memoryLabels.seePlateau}
          </SmButton>
        </>
      }
    >
      <View style={styles.photo}>
        <MemoryPhoto memory={memory} height={190} stamp={64} />
      </View>
      <Text variant="caption" color={t.color.inkMuted}>
        {memoryLabels.eyebrow(memory.yearsAgo)}
      </Text>
      {memory.car ? (
        <Text variant="caption" color={t.color.inkMuted} testID="feed-memory-car">
          {memoryLabels.plateauLine(memory.car.label, memory.car.rank, memory.car.total)}
        </Text>
      ) : null}
    </CardShell>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  head: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.radiusPill,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
});
