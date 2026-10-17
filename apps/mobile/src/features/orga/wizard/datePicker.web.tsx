// Navigateur (recette web de l'appli) : pas de sélecteur natif, la date et l'heure se saisissent au clavier (lot 34 ;
// version native : `datePicker.tsx`).
import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";

export type PickMode = "date" | "time";

/** Ce que le sélecteur pose sur le champ (pas de style : le `TextField` garde le sien). */
export type PickerFieldProps = Pick<TextInputProps, "showSoftInputOnFocus" | "caretHidden" | "onPressIn">;

export function useDateTimePicker(): {
  fieldProps: (mode: PickMode, value: string, onPick: (value: string) => void) => PickerFieldProps;
  picker: ReactNode;
} {
  return { fieldProps: () => ({}), picker: null };
}
