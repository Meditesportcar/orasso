// La vitrine d'un prestataire telle que la voit l'organisateur (DA v2, lot 54, prototype `s-vitrine` « Vue organisateur ») :
// métier, spécialité, équipe, menu avec les prix, besoins sur place, zone d'intervention, avis des organisateurs. Un seul
// gabarit pour l'onglet Vitrine (mon aperçu) et la fiche publique d'un prestataire (`/providers/[id]`).
// Lot C4b : pièces de l'artefact — puces `.tz-chips`, menu `.vit-menu` (une ligne par plat, prix étroit moutarde),
// besoins en `.acts-g`, zone en puces allumées, avis en `.tz-card` (logo de la structure en initiales).
import { departmentChoices, departmentLabel, Text, tokens, useTheme } from "@orasso/design-system/native";
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

import { ActGrid, AngledTag, SecH, TzChip } from "@/features/pro/kit";
import { formatRating, frontageIcon, initialsOf, monthYear, powerIcon, waterIcon } from "@/lib/proPresta";
import { Muted } from "@/ui/Muted";

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
      <View style={styles.chips} testID="vitrine-identity-tiles">
        {vitrine.trades.map((code) => (
          <TzChip key={code} label={vendorTypeLabels[code]} />
        ))}
        {vitrine.tagline ? <TzChip label={vitrine.tagline} /> : null}
        {vitrine.teamSize ? <TzChip label={vitrineTexts.teamSize(vitrine.teamSize)} /> : null}
      </View>

      <SecH
        title={vitrineTexts.menuTitle}
        hint={vitrine.menuRange ? vitrineTexts.menuRange(vitrine.menuRange.min, vitrine.menuRange.max) : undefined}
      />
      {vitrine.menu.length ? (
        <View style={[styles.menu, { backgroundColor: t.color.surface }]} testID="vitrine-menu-list">
          {vitrine.menu.map((item, i) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: deux plats peuvent porter le même nom, la liste est affichée telle quelle
              key={`${item.label}-${i}`}
              style={[
                styles.menuRow,
                i > 0 && { borderTopWidth: 1, borderStyle: "dashed", borderTopColor: t.color.line },
              ]}
            >
              <Text variant="bodyStrong" color={t.color.ink} style={styles.menuLabel}>
                {item.label}
              </Text>
              <Text variant="numberNarrow" color={t.color.accentText} style={styles.menuPrice}>
                {formatMenuPrice(item.priceCents)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Muted variant="body">{proV2Labels.menuNone}</Muted>
      )}

      {needs.length ? (
        <>
          <SecH title={vitrineTexts.needsTitle} />
          <ActGrid items={needs} testID="vitrine-needs" />
        </>
      ) : null}

      <SecH title={vitrineTexts.zoneTitle} hint={vitrineTexts.radius(vitrine.radiusKm)} />
      {places.length ? (
        <View style={styles.chips} testID="vitrine-zone">
          {places.map((p) => (
            <TzChip key={p.code} label={p.label} on />
          ))}
        </View>
      ) : null}

      <SecH
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
            <View
              key={r.id}
              style={[styles.review, { backgroundColor: t.color.ground, boxShadow: t.shadow.shadowCard }]}
            >
              <View style={styles.reviewHead}>
                {/* `.orglogo` : 36 px, rayon 10, initiales moutarde sur l'encre. */}
                <View style={[styles.orgLogo, { backgroundColor: t.color.ink }]}>
                  <Text variant="numberNarrow" color={t.color.accentText} style={styles.orgLogoText}>
                    {initialsOf(r.structureName)}
                  </Text>
                </View>
                <View style={styles.reviewWho}>
                  <Text variant="bodyStrong" color={t.color.ink} style={styles.reviewName}>
                    {r.structureName}
                  </Text>
                  <Text variant="caption" color={t.color.inkMuted} style={styles.reviewMeta}>
                    {`${r.eventTitle} · ${monthYear(r.eventEndsAt)}`}
                  </Text>
                </View>
                <AngledTag tone="acc">{`${formatRating(r.rating)}/5`}</AngledTag>
              </View>
              {r.comment ? (
                <Text variant="caption" color={t.color.ink} style={styles.quote}>
                  {`« ${r.comment} »`}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Muted variant="body">{providerReviewTexts.none}</Muted>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // `.vit-menu` : rayon 14, une ligne par plat (11 × 14 px), filet pointillé entre deux plats.
  menu: { borderRadius: 14, overflow: "hidden" },
  menuRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  menuLabel: { flex: 1, minWidth: 0, fontSize: 14 },
  menuPrice: { fontSize: 20, lineHeight: 22 },
  // `.tz-card` : fond, rayon 14, 12 × 14 px.
  review: { gap: space2, paddingVertical: space3, paddingHorizontal: 14, borderRadius: 14 },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewWho: { flex: 1, minWidth: 0, gap: space1 },
  reviewName: { fontSize: 13.5 },
  reviewMeta: { fontSize: 11.5 },
  orgLogo: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  orgLogoText: { fontSize: 13 },
  quote: { fontStyle: "italic", lineHeight: 18 },
});
