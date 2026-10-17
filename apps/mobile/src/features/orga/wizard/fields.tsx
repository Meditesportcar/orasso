// Petits morceaux de l'assistant d'événement de l'appli (lot 35b) : choix en pastilles qui passent à la ligne, date et
// heure saisies au clavier (pas de sélecteur natif de date : aucune dépendance native de plus), intitulé de groupe.
import { Chip, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { eventEditorLabels as L } from "@orasso/shared";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { datePart, joinDateTime, normalizeTime, timePart } from "@/lib/eventDraft";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

/** Un choix parmi plusieurs (format, accès, admission…) : des pastilles, passées à la ligne. */
export function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  return (
    <Group label={label} testID={testID}>
      <View style={styles.wrap}>
        {options.map((o) => (
          <Chip
            key={o.value}
            selected={o.value === value}
            onPress={() => onChange(o.value)}
            accessibilityLabel={o.label}
          >
            {o.label}
          </Chip>
        ))}
      </View>
    </Group>
  );
}

/** Plusieurs choix (catégories, origine) : des pastilles qui se cochent. */
export function MultiChoices({
  label,
  options,
  values,
  onToggle,
  testID,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  values: readonly string[];
  onToggle: (value: string) => void;
  testID?: string;
}) {
  return (
    <Group label={label} testID={testID}>
      <View style={styles.wrap}>
        {options.map((o) => (
          <Chip
            key={o.value}
            selected={values.includes(o.value)}
            onPress={() => onToggle(o.value)}
            accessibilityLabel={o.label}
          >
            {o.label}
          </Chip>
        ))}
      </View>
    </Group>
  );
}

/** Un groupe de champs avec son intitulé en capitales étroites. */
export function Group({ label, children, testID }: { label: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.group} testID={testID}>
      <Muted variant="label">{label}</Muted>
      {children}
    </View>
  );
}

/**
 * Date et heure d'un champ « AAAA-MM-JJTHH:MM » (heure de Paris), en deux saisies. L'heure se normalise en quittant le
 * champ (« 9h » → « 09:00 ») ; une saisie illisible reste affichée et l'étape la refuse avec le message du site.
 */
export function DateTimeFields({
  dateLabel,
  timeLabel,
  value,
  onChange,
  testID,
}: {
  dateLabel: string;
  timeLabel: string;
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}) {
  const date = datePart(value);
  const time = timePart(value);
  return (
    <View style={styles.row}>
      <TextField
        label={dateLabel}
        value={date}
        placeholder={L.datePlaceholder}
        onChangeText={(v) => onChange(joinDateTime(v, time, false))}
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        maxLength={10}
        style={styles.date}
        testID={testID ? `${testID}-date` : undefined}
      />
      <TextField
        label={timeLabel}
        value={time}
        placeholder={L.timePlaceholder}
        onChangeText={(v) => onChange(joinDateTime(date, v, false))}
        onBlur={() => onChange(joinDateTime(date, time))}
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        maxLength={5}
        style={styles.time}
        testID={testID ? `${testID}-time` : undefined}
      />
    </View>
  );
}

/** Une heure seule (jours d'un événement sur plusieurs jours), normalisée en quittant le champ. */
export function TimeField({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      placeholder={L.timePlaceholder}
      onChangeText={onChange}
      onBlur={() => onChange(normalizeTime(value))}
      keyboardType="numbers-and-punctuation"
      autoCorrect={false}
      maxLength={5}
      style={styles.time}
      testID={testID}
    />
  );
}

/** Une ligne « intitulé : valeur » du récapitulatif, sur une plaque. */
export function RecapRow({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.recap}>
      <Text variant="caption" color={t.color.plateMuted}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={t.color.plateInk}>
        {value}
      </Text>
    </View>
  );
}

export const wizardStyles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  row: { flexDirection: "row", gap: space2, flexWrap: "wrap" },
  grow: { flex: 1, minWidth: 120 },
});

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  group: { gap: space2 },
  row: { flexDirection: "row", gap: space2 },
  date: { flex: 3 },
  time: { flex: 2, minWidth: 96 },
  recap: { gap: 2 },
});
