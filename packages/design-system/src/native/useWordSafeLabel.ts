// Lot R5b (« AJOUT/ER EN AMI » sur le Xiaomi) : un libellé de bouton ne se coupe jamais au milieu d'un mot. Il passe à
// la ligne entre deux mots ; si un mot seul ne tient pas, le corps baisse d'un pixel à la fois jusqu'au plus petit
// libellé de bouton du système (11 px). Mesuré tel que posé : `onTextLayout` sur Android et iOS, le DOM sur le web.
// Sans coupure, rien ne change (aucune mesure cachée, aucun nouveau rendu).

import { useEffect, useRef, useState } from "react";
import { type NativeSyntheticEvent, Platform, type TextLayoutEventData } from "react-native";
import { BUTTON_LABEL_MIN, breaksInsideWord, webLabelBreaksInsideWord } from "./buttonLabelFit";

export type WordSafeLabel = {
  /** Corps à poser sur le libellé ; `null` tant qu'aucune coupure n'a été vue (le style du bouton s'applique). */
  fontSize: number | null;
  /** À poser sur le `Text` du libellé. */
  textProps: {
    ref?: { current: unknown };
    onLayout?: () => void;
    onTextLayout?: (e: NativeSyntheticEvent<TextLayoutEventData>) => void;
  };
};

/** `base` : corps du libellé ; `labelKey` : le texte (un nouveau libellé repart du corps de base). */
export function useWordSafeLabel(base: number, labelKey: string): WordSafeLabel {
  const [cut, setCut] = useState(0);
  const ref = useRef<unknown>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: un nouveau libellé ou un autre corps repart de zéro
  useEffect(() => setCut(0), [labelKey, base]);
  const shrink = () => setCut((c) => (base - c - 1 >= BUTTON_LABEL_MIN ? c + 1 : c));
  const textProps: WordSafeLabel["textProps"] =
    Platform.OS === "web"
      ? {
          ref,
          onLayout: () => {
            if (webLabelBreaksInsideWord(ref.current)) shrink();
          },
        }
      : {
          onTextLayout: (e) => {
            if (breaksInsideWord(e.nativeEvent.lines.map((l) => l.text))) shrink();
          },
        };
  return { fontSize: cut > 0 ? Math.max(BUTTON_LABEL_MIN, base - cut) : null, textProps };
}
