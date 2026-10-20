// La vitrine d'un prestataire telle que la voit l'organisateur (DA v2, lot 54, prototype `s-vitrine` « Vue organisateur ») :
// métier, spécialité, équipe, menu avec les prix, besoins sur place, zone d'intervention, avis des organisateurs. Un seul
// gabarit pour l'onglet Vitrine (mon aperçu) et la fiche publique d'un prestataire (`/providers/[id]`).
import { Chip, departmentChoices, departmentLabel, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  formatMenuPrice,
  type ProviderPublic,
  type ProviderReviewsSummary,
  proV2Labels,
  providerReviewTexts,
  vendorTypeLabels,
  vitrineTexts,
} from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { formatRating, frontageIcon, monthYear, powerIcon, tradeIcons, waterIcon } from "@/lib/proPresta";
import { IconTiles } from "@/ui/IconTiles";
import { Muted } from "@/ui/Muted";
import { SecHead } from "@/ui/SecHead";

const { space1, space2, space3 } = tokens.spacing;

export function VitrineView({
  vitrine,
  reviews,
}: {
  vitrine: Pick<
    ProviderPublic,
    | "trades"
    | "tagline"
    | "teamSize"
    | "menu"
    | "menuRange"
    | "powerNeed"
    | "frontageM"
    | "waterNeed"
    | "radiusKm"
    | "departments"
  >;
  reviews: ProviderReviewsSummary | null;
}) {
  const { t } = useTheme();
  const needs = [
    vitrine.powerNeed ? { key: "power", label: vitrineTexts.power(vitrine.powerNeed), icon: powerIcon } : null,
    vitrine.frontageM ? { key: "frontage", label: vitrineTexts.frontage(vitrine.frontageM), icon: frontageIcon } : null,
    vitrine.waterNeed !== null ? { key: "water", label: vitrineTexts.water(vitrine.waterNeed), icon: waterIcon } : null,
  ].filter((n): n is NonNullable<typeof n> => n !== null);
  const places = vitrine.departments.map((code) => {
    const choice = departmentChoices.find((d) => d.code === code);
    return { code, label: choice ? departmentLabel(choice) : code };
  });

  return (
    <View style={styles.stack} testID="vitrine-view">
      <IconTiles
        testID="vitrine-identity-tiles"
        items={[
          ...vitrine.trades.map((code) => ({ key: code, label: vendorTypeLabels[code], icon: tradeIcons[code] })),
          ...(vitrine.tagline ? [{ key: "tagline", label: vitrine.tagline, icon: "badge" as const }] : []),
          ...(vitrine.teamSize
            ? [{ key: "team", label: vitrineTexts.teamSize(vitrine.teamSize), icon: "crew" as const }]
            : []),
        ]}
      />

      <SecHead
        title={vitrineTexts.menuTitle}
        hint={vitrine.menuRange ? vitrineTexts.menuRange(vitrine.menuRange.min, vitrine.menuRange.max) : undefined}
      />
      {vitrine.menu.length ? (
        <Plate style={styles.menu} testID="vitrine-menu-list">
          {vitrine.menu.map((item, i) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: deux plats peuvent porter le même nom, la liste est affichée telle quelle
              key={`${item.label}-${i}`}
              style={[styles.menuRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.color.plateLine }]}
            >
              <Text variant="bodyStrong" color={t.color.plateInk} style={styles.menuLabel}>
                {item.label}
              </Text>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {formatMenuPrice(item.priceCents)}
              </Text>
            </View>
          ))}
        </Plate>
      ) : (
        <Muted variant="body">{proV2Labels.menuNone}</Muted>
      )}

      {needs.length ? (
        <>
          <SecHead title={vitrineTexts.needsTitle} />
          <IconTiles items={needs} testID="vitrine-needs" />
        </>
      ) : null}

      <SecHead title={vitrineTexts.zoneTitle} hint={vitrineTexts.radius(vitrine.radiusKm)} />
      {places.length ? (
        <View style={styles.chips} testID="vitrine-zone">
          {places.map((p) => (
            <Chip key={p.code} selected>
              {p.label}
            </Chip>
          ))}
        </View>
      ) : null}

      <SecHead
        title={providerReviewTexts.sectionTitle}
        hint={
          reviews?.average !== null && reviews?.average !== undefined
            ? providerReviewTexts.summary(reviews.average, reviews.count)
            : undefined
        }
      />
      {reviews && reviews.latest.length ? (
        <View style={styles.stack} testID="vitrine-reviews">
          {reviews.latest.map((r) => (
            <Plate key={r.id} style={styles.review}>
              <View style={styles.reviewHead}>
                <View style={styles.reviewWho}>
                  <Text variant="bodyStrong" color={t.color.plateInk}>
                    {r.structureName}
                  </Text>
                  <Text variant="caption" color={t.color.plateMuted}>
                    {`${r.eventTitle} · ${monthYear(r.eventEndsAt)}`}
                  </Text>
                </View>
                <Chip surface="plate" selected>
                  {`${formatRating(r.rating)}/5`}
                </Chip>
              </View>
              {r.comment ? (
                <Text variant="body" color={t.color.plateInk}>
                  {`« ${r.comment} »`}
                </Text>
              ) : null}
            </Plate>
          ))}
        </View>
      ) : (
        <Muted variant="body">{providerReviewTexts.none}</Muted>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  menu: { padding: space3, gap: 0 },
  menuRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space3,
    paddingVertical: space2,
  },
  menuLabel: { flex: 1, minWidth: 0 },
  review: { gap: space2, padding: space3 },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  reviewWho: { flex: 1, minWidth: 0, gap: space1 },
});
