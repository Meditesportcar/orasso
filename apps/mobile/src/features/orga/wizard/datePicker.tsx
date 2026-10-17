// Sélecteur natif de date et d'heure de l'assistant (lot 34, `@react-native-community/datetimepicker`). Le champ garde sa
// valeur texte (« AAAA-MM-JJ », « HH:MM », heure de Paris) : un appui ouvre le sélecteur au lieu du clavier. Android :
// la boîte du système ; iOS : la roue (ou le calendrier) sous le champ, refermée par « Valider ». Le navigateur (recette
// web) garde la saisie au clavier : `datePicker.web.tsx`.

import { Button, tokens, useTheme } from "@orasso/design-system/native";
import { eventEditorLabels as L } from "@orasso/shared";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { type ReactNode, useState } from "react";
import { Platform, StyleSheet, type TextInputProps, View } from "react-native";

import { now } from "@/lib/clock";

export type PickMode = "date" | "time";

/** Ce que le sélecteur pose sur le champ (pas de style : le `TextField` garde le sien). */
export type PickerFieldProps = Pick<TextInputProps, "showSoftInputOnFocus" | "caretHidden" | "onPressIn">;

const pad = (n: number) => String(n).padStart(2, "0");

/** Valeur du champ → date locale du téléphone (seuls les chiffres affichés comptent : pas de fuseau à convertir). */
export function pickerDate(mode: PickMode, value: string): Date {
  if (mode === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0);
    const t = now();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0);
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  return m ? new Date(2000, 0, 1, Number(m[1]), Number(m[2])) : new Date(2000, 0, 1, 9, 0);
}

/** Date choisie → valeur du champ. */
export const pickerValue = (mode: PickMode, d: Date): string =>
  mode === "date"
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`;

type Open = { mode: PickMode; value: string; onPick: (value: string) => void };

/**
 * `fieldProps(mode, valeur, onPick)` se pose sur un `TextField` (pas de clavier, l'appui ouvre le sélecteur) ;
 * `picker` se place sous le champ (la roue d'iOS, rien sur Android).
 */
export function useDateTimePicker(): {
  fieldProps: (mode: PickMode, value: string, onPick: (value: string) => void) => PickerFieldProps;
  picker: ReactNode;
} {
  const { t, theme } = useTheme();
  const [open, setOpen] = useState<Open | null>(null);

  const show = (o: Open) => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: pickerDate(o.mode, o.value),
        mode: o.mode,
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === "set" && date) o.onPick(pickerValue(o.mode, date));
        },
      });
      return;
    }
    setOpen(o);
  };

  const fieldProps = (mode: PickMode, value: string, onPick: (value: string) => void): PickerFieldProps => ({
    showSoftInputOnFocus: false,
    caretHidden: true,
    onPressIn: () => show({ mode, value, onPick }),
  });

  const picker = open ? (
    <View style={styles.ios}>
      <DateTimePicker
        value={pickerDate(open.mode, open.value)}
        mode={open.mode}
        display={open.mode === "date" ? "inline" : "spinner"}
        locale="fr-FR"
        is24Hour
        themeVariant={theme === "sable" ? "light" : "dark"}
        accentColor={t.color.accent}
        textColor={t.color.ink}
        onChange={(_event: DateTimePickerEvent, date?: Date) => {
          if (!date) return;
          const value = pickerValue(open.mode, date);
          open.onPick(value);
          setOpen({ ...open, value });
        }}
      />
      <Button variant="secondary" icon="check" onPress={() => setOpen(null)} fullWidth>
        {L.pickerDone}
      </Button>
    </View>
  ) : null;

  return { fieldProps, picker };
}

const styles = StyleSheet.create({
  ios: { gap: tokens.spacing.space2 },
});
