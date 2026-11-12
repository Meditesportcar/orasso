// Carte « annonce » d'un organisateur suivi : son texte, sa photo éventuelle, « Voir la fiche ».
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L } from "@orasso/shared";
import { Image, StyleSheet, View } from "react-native";
import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { useCardRouter } from "../openFromCard";
import { CardShell } from "./CardShell";
import { OrgLogo, reasonLine } from "./parts";
import type { CardProps } from "./types";

export function AnnouncementCard({ card, onMenu, faded }: CardProps<"announcement">) {
  const { t } = useTheme();
  const router = useCardRouter();
  const { event, announcement } = card.payload;
  return (
    <CardShell
      card={card}
      head={<OrgLogo url={event.structure.logoUrl} name={event.structure.name} />}
      title={event.structure.name}
      reason={reasonLine(card)}
      onMenu={onMenu}
      onTitle={() => router.push(`/o/${event.structure.slug}`)}
      faded={faded}
      actions={
        <>
          <View style={styles.grow} />
          <SmButton
            kind="s"
            icon="next"
            onPress={() => router.push(`/e/${event.slug}`)}
            testID="feed-announcement-open"
          >
            {L.seeEvent}
          </SmButton>
        </>
      }
    >
      {announcement.imageUrl ? (
        <View style={[styles.photo, { backgroundColor: t.color.night }]}>
          <Image
            source={mediaSource(announcement.imageUrl)}
            style={styles.img}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}
      <Text variant="body" color={t.color.ink} style={styles.text}>
        {announcement.body}
      </Text>
      <Text variant="caption" color={t.color.inkMuted}>
        {event.title}
      </Text>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  text: { fontSize: 14, lineHeight: 20 },
  photo: { height: 170, borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
});
