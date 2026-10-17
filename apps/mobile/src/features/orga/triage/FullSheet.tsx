// Fiche complète d'une candidature (lot 23) : tout ce que la carte résume, dans une feuille qui défile (le glissement de
// la carte est réservé aux décisions). Même contenu que la fiche du site : véhicule (marque, modèle, génération, année,
// puissance, poids, catégories, préparation), candidat, historique avec la structure, crew et ses autres candidatures,
// avis de filtration avec leurs notes, alertes. Les coordonnées du candidat ne sont pas affichées.
import { Chip, ChipRow, Plate, Text, useTheme } from "@orasso/design-system/native";
import { type ApplicationForTriage, triageAppLabels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { FactRows, PhotoCarousel, photosOf, titleOf } from "./CandidateCard";
import { ScreenSheet } from "./ScreenSheet";

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  const { t } = useTheme();
  if (value === null || value === undefined || value === "") return null;
  return (
    <View style={styles.fact}>
      <Text variant="meta" color={t.color.plateMuted} style={styles.factLabel}>
        {label}
      </Text>
      <Text variant="caption" color={t.color.plateInk} style={styles.factValue}>
        {String(value)}
      </Text>
    </View>
  );
}

export function FullSheet({ item, onClose }: { item: ApplicationForTriage | null; onClose: () => void }) {
  const { t } = useTheme();
  const v = item?.vehicle ?? null;
  const p = item?.provider ?? null;
  return (
    <ScreenSheet
      visible={item !== null}
      onClose={onClose}
      accessibilityLabel={triageAppLabels.fullSheetTitle}
      maxHeight={0.9}
    >
      {item ? (
        <>
          <Text variant="posterM" color={t.color.ink} testID="triage-full-title">
            {titleOf(item)}
          </Text>
          <PhotoCarousel photos={photosOf(item)} label={titleOf(item)} certified={Boolean(v?.certified)} height={220} />
          {v ? (
            <Plate>
              <Text variant="label" color={t.color.plateMuted}>
                {triageAppLabels.sectionVehicle}
              </Text>
              <Fact label={triageAppLabels.factMake} value={v.makeName} />
              <Fact label={triageAppLabels.factModel} value={v.modelName} />
              <Fact label={triageAppLabels.factGeneration} value={v.generationName} />
              <Fact label={triageAppLabels.factYear} value={v.year} />
              <Fact label={triageAppLabels.factColor} value={v.color} />
              <Fact label={triageAppLabels.engine} value={v.engine} />
              <Fact label={triageAppLabels.factPower} value={v.powerHp ? triageAppLabels.power(v.powerHp) : null} />
              <Fact label={triageAppLabels.factWeight} value={v.weightKg ? triageAppLabels.weight(v.weightKg) : null} />
              <Fact label={triageAppLabels.factOrigin} value={v.country} />
              <Fact label={triageAppLabels.preparation} value={v.preparation} />
              {v.categories.length > 0 ? (
                <ChipRow>
                  {v.categories.map((c) => (
                    <Chip key={c.id} surface="plate">
                      {c.label}
                    </Chip>
                  ))}
                </ChipRow>
              ) : null}
              {v.description ? (
                <Text variant="caption" color={t.color.plateInk}>
                  {v.description}
                </Text>
              ) : null}
            </Plate>
          ) : null}
          {p ? (
            <Plate>
              <Text variant="label" color={t.color.plateMuted}>
                {triageAppLabels.sectionProvider}
              </Text>
              <Fact label={triageAppLabels.providerType} value={p.typeLabel} />
              <Fact label={triageAppLabels.factInstagram} value={p.instagram} />
              <Fact label={triageAppLabels.factWebsite} value={p.website} />
              <Fact label={triageAppLabels.factPortfolio} value={p.portfolioUrl} />
              <Fact label={triageAppLabels.providerZone} value={p.departments.join(", ")} />
              {p.description ? (
                <Text variant="caption" color={t.color.plateInk}>
                  {p.description}
                </Text>
              ) : null}
            </Plate>
          ) : null}
          <Plate>
            <Text variant="label" color={t.color.plateMuted}>
              {triageAppLabels.sectionApplicant}
            </Text>
            <FactRows item={item} full />
          </Plate>
        </>
      ) : null}
    </ScreenSheet>
  );
}

const styles = StyleSheet.create({
  fact: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  factLabel: { width: 96 },
  factValue: { flex: 1 },
});
