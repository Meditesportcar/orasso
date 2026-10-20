// Blocs de la fiche événement repris de l'ancienne page (lots 20 à 36) : une information en plaque, les prestataires
// présents, les avis des participants pointés.
import { Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventReviews, instagramHandle } from "@orasso/shared";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { ReportButton } from "@/features/ReportSheet";

const { space1, space3 } = tokens.spacing;

export function Info({ label, children, testID }: { label: string; children: ReactNode; testID?: string }) {
  const { t } = useTheme();
  return (
    <Plate style={styles.info} testID={testID}>
      <Text variant="label" color={t.color.plateMuted}>
        {label}
      </Text>
      <Text variant="body" color={t.color.plateInk}>
        {children}
      </Text>
    </Plate>
  );
}

type Provider = {
  id: string;
  name: string;
  typeLabel: string;
  instagram: string | null;
  accreditedMedia?: boolean;
};

export function ProvidersPresent({ providers, reportable }: { providers: Provider[]; reportable: boolean }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <Plate style={styles.info} testID="providers-present">
      <Text variant="label" color={t.color.plateMuted}>
        Prestataires présents
      </Text>
      {providers.map((p) => (
        <View key={p.id} style={styles.provider} testID="provider-present">
          <View style={styles.providerText}>
            {/* Lot 54 : la vitrine du prestataire (menu, besoins, avis des organisateurs). */}
            <Text
              variant="bodyStrong"
              color={t.color.plateInk}
              accessibilityRole="link"
              onPress={() => router.push(`/providers/${p.id}`)}
            >
              {p.name}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {p.typeLabel}
            </Text>
            {p.instagram ? (
              <Text
                variant="meta"
                color={t.color.plateInk}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(p.instagram as string)}
              >
                {instagramHandle(p.instagram) ?? "Instagram"}
              </Text>
            ) : null}
          </View>
          {p.accreditedMedia ? (
            <Chip surface="plate" variant="accent">
              Média officiel
            </Chip>
          ) : null}
          {reportable ? <ReportButton look="link" onPlate type="provider" id={p.id} /> : null}
        </View>
      ))}
    </Plate>
  );
}

/** Avis des participants pointés : moyenne à partir du minimum d'avis, réponse publique de l'organisateur. */
export function Reviews({ data, reportable }: { data: EventReviews; reportable: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const average = data.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <Plate style={styles.info}>
      <Text variant="label" color={c.plateMuted}>
        Avis des participants
      </Text>
      <Text variant="body" color={c.plateInk}>
        {data.count === 0
          ? "Pas encore d'avis. Seuls les participants pointés à l'entrée peuvent noter, pendant la semaine qui suit."
          : average
            ? `${average} / 3 · ${data.count} avis`
            : `${data.count} avis · la moyenne s'affiche à partir de ${data.minForAverage} avis.`}
      </Text>
      {data.items.map((r) => (
        <View key={r.id} style={[styles.review, { borderTopColor: c.plateLine }]}>
          <View style={styles.reviewHead}>
            <Text variant="bodyStrong" color={c.plateInk}>
              {r.pseudo}
            </Text>
            <Text
              variant="bodyStrong"
              color={c.accent}
              accessibilityLabel={`${r.rating} étoile${r.rating > 1 ? "s" : ""} sur 3`}
            >
              {"★".repeat(r.rating)}
            </Text>
          </View>
          <Text variant="body" color={c.plateInk}>
            {r.comment}
          </Text>
          {r.reply ? (
            <Text variant="meta" color={c.plateMuted}>
              Réponse de l'équipe organisatrice : {r.reply.text}
            </Text>
          ) : null}
          {reportable ? <ReportButton look="link" onPlate type="review" id={r.id} /> : null}
        </View>
      ))}
    </Plate>
  );
}

const styles = StyleSheet.create({
  info: { gap: space1, padding: space3 },
  review: { gap: space1, paddingTop: space3, marginTop: space1, borderTopWidth: 1 },
  provider: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space3 },
  providerText: { flex: 1, gap: space1 },
  reviewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space3 },
});
