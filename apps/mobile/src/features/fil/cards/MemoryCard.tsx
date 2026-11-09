// Carte « souvenir » du Fil (lot R7j, registre R7e2) : personnelle, visible de moi seul. « Il y a un an, tu étais à … »,
// la photo masquée de ma voiture (sinon l'affiche), « Voir » ouvre la page du souvenir.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { memoryLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { MemoryPhoto } from "@/features/memories/MemoryPhoto";
import { SmButton } from "@/ui/Kit";
import { CardShell } from "./CardShell";
import { reasonLine } from "./parts";
import type { CardProps } from "./types";

export function MemoryCard({ card, onMenu, faded }: CardProps<"memory">) {
  const { t } = useTheme();
  const router = useRouter();
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
        </>
      }
    >
      <View style={styles.photo}>
        <MemoryPhoto memory={memory} height={190} />
      </View>
      <Text variant="caption" color={t.color.inkMuted}>
        {memoryLabels.eyebrow(memory.yearsAgo)}
      </Text>
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
