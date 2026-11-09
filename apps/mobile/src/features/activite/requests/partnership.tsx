// Proposition de partenariat reçue (lot R7m1, maquette R7.20 `pq_dem` ; carte de `GET /me/requests`, `kind partnership`) : le
// pro, son texte entre guillemets, la voiture concernée (« Partenaire : … » apparaîtra sur sa carte), puis « Accepter » /
// « Refuser ». `id` = le partenariat, routes `/me/partnerships/:id/accept` et `/decline`. Aucune somme : Orasso ne touche à
// aucun paiement, la carte le dit.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { partnershipLabels as L, proActivityLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";

import { RequestCard } from "../RequestCard";
import { fromOf, payloadObject, payloadString, type RequestCardProps, textOf } from "./types";

const { space2, space3 } = tokens.spacing;

export function PartnershipRequest({ item, onDone }: RequestCardProps) {
  const { t } = useTheme();
  const router = useRouter();
  const { name, imageUrl } = fromOf(item);
  const message = payloadString(item, "message");
  const vehicle = textOf(payloadObject(item, "vehicle"), "label");
  const pro = payloadObject(item, "pro");
  const slug = textOf(pro, "slug");
  const city = textOf(pro, "city");
  const activities = Array.isArray(pro?.activities) ? (pro.activities as string[]) : [];
  const detail = [
    "Pro vérifié",
    activities.length
      ? activities
          .map((a) => (a in proActivityLabels ? proActivityLabels[a as keyof typeof proActivityLabels] : a))
          .join(", ")
      : null,
    city,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <RequestCard
      testID="request-partnership"
      avatarUrl={imageUrl}
      pseudo={name}
      title={L.requestTitle(name)}
      detail={detail}
      message={message ? `« ${message} »` : null}
      onOpenProfile={slug ? () => router.push(`/p/${slug}`) : undefined}
      onAccept={async () => {
        await api.acceptPartnership(item.id);
        onDone();
      }}
      onDecline={async () => {
        await api.declinePartnership(item.id);
        onDone();
      }}
    >
      {vehicle ? (
        <View style={[styles.car, { borderColor: t.color.plateLine }]} testID="request-partnership-vehicle">
          <Icon name="vehicle" size={18} color={t.color.plateMuted} />
          <View style={styles.carText}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {L.requestForVehicle(vehicle)}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {L.requestForVehicleHint(name)}
            </Text>
          </View>
        </View>
      ) : null}
    </RequestCard>
  );
}

const styles = StyleSheet.create({
  car: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2 + 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  carText: { flex: 1, gap: 2 },
});
