// Carte « voiture » : un véhicule d'un profil public, dont la photo est masquée côté API (plaque floutée, ou non
// immatriculé) ; le nom du véhicule ne se tronque jamais ; le pseudo ouvre le profil.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Image, Pressable, StyleSheet } from "react-native";

import { mediaSource } from "@/lib/media";
import { Avatar } from "@/ui/Avatar";
import { CardShell } from "./CardShell";
import { reasonLine } from "./parts";
import type { CardProps } from "./types";

export function VehiclePublicCard({ card, onMenu, faded }: CardProps<"vehicle_public">) {
  const { t } = useTheme();
  const router = useRouter();
  const { vehicle, owner } = card.payload;
  return (
    <CardShell
      card={card}
      head={<Avatar url={owner.avatarUrl} pseudo={owner.pseudo} size={38} />}
      title={owner.pseudo}
      reason={reasonLine(card)}
      onMenu={onMenu}
      onTitle={() => router.push(`/u/${encodeURIComponent(owner.pseudo)}`)}
      faded={faded}
    >
      <Text variant="body" color={t.color.ink} style={styles.text}>
        {L.vehicleAdded} : <Text variant="bodyStrong">{vehicle.label}</Text>
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={vehicle.label}
        onPress={() => router.push(`/v/${vehicle.id}`)}
        style={[styles.photo, { backgroundColor: t.color.night }]}
        testID="feed-vehicle-photo"
      >
        <Image
          source={mediaSource(vehicle.photoUrl)}
          style={styles.img}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 20 },
  photo: { height: 240, borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
});
