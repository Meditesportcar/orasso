// Le bloc « Étiquette · facultatif » de l'écran « Publier » (lot R9c, maquette R9.2b `n-publier`) : « Aucune | Offre », puis, pour
// « Offre », le titre, la ligne des dates (« Du 10 nov. au 30 nov. · dates de l'offre » avec « modifier ») et une phrase d'aide.
// Seulement pour la casquette fiche pro et une publication (jamais une story). Les règles (titre, dates, ligne « ce qui
// manque ») sont celles de `rules/proOffers.ts` ; l'API les revérifie. Les jours s'écrivent `AAAA-MM-JJ` (sélecteur natif sur
// l'appli, clavier dans le navigateur de recette).
import { Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { OFFER_TITLE_MAX, type OfferForm, offerEditorLabel, proOffersLabels as T } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useDateTimePicker } from "@/features/orga/wizard/datePicker";
import { Seg, SmButton } from "@/ui/Kit";

import { Note } from "./PublishChoices";

const { space1, space2, space3 } = tokens.spacing;

export function OfferBlock({
  value,
  onChange,
  disabled,
}: {
  value: OfferForm;
  onChange: (next: OfferForm) => void;
  disabled: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const native = useDateTimePicker();
  const [editing, setEditing] = useState(true);
  const patch = (p: Partial<OfferForm>) => onChange({ ...value, ...p });
  return (
    <View style={styles.block} testID="fil-publish-offer">
      <Text variant="bodyStrong" color={c.ink}>
        {T.tagTitle}
      </Text>
      <Seg
        options={[
          { value: "none", label: T.tagNone },
          { value: "offer", label: T.tagOffer, icon: "ticket" },
        ]}
        value={value.on ? "offer" : "none"}
        onChange={(v) => patch({ on: v === "offer" })}
        disabled={disabled}
        testID="fil-publish-offer-seg"
      />
      {value.on ? (
        <View style={styles.block}>
          <TextField
            label={T.titleLabel}
            value={value.title}
            onChangeText={(title) => patch({ title })}
            editable={!disabled}
            placeholder={T.titlePlaceholder}
            maxLength={OFFER_TITLE_MAX}
            testID="fil-publish-offer-title"
          />
          <View style={[styles.dates, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Icon name="calendar" size={18} color={c.inkMuted} />
            <Text variant="caption" color={c.inkMuted} style={styles.datesText} testID="fil-publish-offer-dates">
              <Text variant="bodyStrong" color={c.ink}>
                {offerEditorLabel(value)}
              </Text>
              {` · ${T.datesSuffix}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={T.datesEdit}
              disabled={disabled}
              onPress={() => setEditing((e) => !e)}
              hitSlop={8}
              style={styles.edit}
              testID="fil-publish-offer-edit"
            >
              <Text variant="label" color={c.accentText}>
                {T.datesEdit}
              </Text>
            </Pressable>
          </View>
          {editing ? (
            <View style={styles.block}>
              <TextField
                {...native.fieldProps("date", value.startsOn, (startsOn) => patch({ startsOn }))}
                label={T.startLabel}
                value={value.startsOn}
                onChangeText={(startsOn) => patch({ startsOn: startsOn.trim() })}
                editable={!disabled}
                placeholder="AAAA-MM-JJ"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                maxLength={10}
                testID="fil-publish-offer-start"
              />
              {value.startsOn ? (
                <SmButton
                  kind="s"
                  icon="close"
                  disabled={disabled}
                  onPress={() => patch({ startsOn: "" })}
                  testID="fil-publish-offer-start-clear"
                >
                  {T.startClear}
                </SmButton>
              ) : null}
              <TextField
                {...native.fieldProps("date", value.endsOn, (endsOn) => patch({ endsOn }))}
                label={T.endLabel}
                value={value.endsOn}
                onChangeText={(endsOn) => patch({ endsOn: endsOn.trim() })}
                editable={!disabled}
                placeholder="AAAA-MM-JJ"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                maxLength={10}
                testID="fil-publish-offer-end"
              />
              {native.picker}
            </View>
          ) : null}
          <Note testID="fil-publish-offer-help">{T.help}</Note>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  dates: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: space1 / 2,
  },
  datesText: { flex: 1, flexShrink: 1 },
  edit: { minHeight: tokens.spacing.touch, justifyContent: "center", paddingHorizontal: space1 },
});
