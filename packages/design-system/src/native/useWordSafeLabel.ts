// Lot R5b (« AJOUT/ER EN AMI » sur le Xiaomi) : un libellé de bouton ne se coupe jamais au milieu d'un mot. Il passe à
// la ligne entre deux mots ; si un mot seul ne tient pas, le corps baisse d'un pixel à la fois jusqu'au plus petit
// libellé de bouton du système (11 px). Mesuré tel que posé : `onTextLayout` sur Android et iOS, le DOM sur le web.
// Sans coupure, rien ne change (aucune mesure cachée, aucun nouveau rendu).
//
// Tour 2 (relecture Opus 5) :
// - la clé est le texte à plat, enfants JSX compris (`flatText`) ; un autre texte, un autre corps, une autre largeur de
//   fenêtre ou une autre échelle de police repart du corps de base, dès le rendu (pas une image avec l'ancien corps) ;
// - la place qui grandit après une coupure (`onLayout` : rotation, colonne élargie, cellule de liste d'abord estimée)
//   repart aussi de zéro, une fois par libellé (garde contre un aller-retour si le système mesure un texte sur deux
//   lignes plus étroit que sa place) ;
// - pas de mesure inutile : sur le web, une seule mesure tant que le libellé tient sur une ligne ; sur le téléphone,
//   la largeur n'est suivie qu'après une coupure ; plus rien au plancher.

import { type ReactNode, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  Platform,
  type TextLayoutEventData,
  useWindowDimensions,
} from "react-native";
import { breaksInsideWord, flatText, nextCut, webLabelBreaksInsideWord, widthGrew } from "./buttonLabelFit";

export type WordSafeLabel = {
  /** Corps à poser sur le libellé ; `null` tant qu'aucune coupure n'a été vue (le style du bouton s'applique). */
  fontSize: number | null;
  /** À poser sur le `Text` du libellé. */
  textProps: {
    ref?: { current: unknown };
    onLayout?: (e: LayoutChangeEvent) => void;
    onTextLayout?: (e: NativeSyntheticEvent<TextLayoutEventData>) => void;
  };
};

type Box = { sig: string; width: number | null; cutWidth: number | null; regrown: boolean };

/**
 * `base` : corps du libellé ; `label` : le libellé (texte ou enfants JSX) ; `min` : le plancher (libellé de bouton,
 * 11 px, par défaut ; lot R6-police : plus bas pour un libellé de compteur sous son chiffre).
 */
export function useWordSafeLabel(base: number, label: ReactNode, min?: number): WordSafeLabel {
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const sig = `${base}|${min ?? ""}|${Math.round(windowWidth)}|${fontScale}|${flatText(label)}`;
  const [fit, setFit] = useState({ sig, cut: 0 });
  const cut = fit.sig === sig ? fit.cut : 0;
  const box = useRef<Box>({ sig, width: null, cutWidth: null, regrown: false });
  if (box.current.sig !== sig) box.current = { sig, width: null, cutWidth: null, regrown: false };
  const ref = useRef<unknown>(null);
  const atFloor = nextCut(base, cut, min) === null;

  const shrink = () => {
    const next = nextCut(base, cut, min);
    if (next === null) return;
    box.current.cutWidth = box.current.width;
    setFit({ sig, cut: next });
  };
  const onWidth = (width: number) => {
    const b = box.current;
    b.width = width;
    if (cut === 0) return;
    if (b.cutWidth === null) {
      b.cutWidth = width;
      return;
    }
    if (!b.regrown && widthGrew(b.cutWidth, width)) {
      b.regrown = true;
      b.cutWidth = null;
      setFit({ sig, cut: 0 });
    }
  };

  const textProps: WordSafeLabel["textProps"] =
    Platform.OS === "web"
      ? {
          ref,
          onLayout: (e) => {
            onWidth(e.nativeEvent.layout.width);
            if (!atFloor && webLabelBreaksInsideWord(ref.current)) shrink();
          },
        }
      : {
          onLayout: cut > 0 ? (e) => onWidth(e.nativeEvent.layout.width) : undefined,
          onTextLayout: atFloor
            ? undefined
            : (e) => {
                const lines = e.nativeEvent.lines;
                if (lines.length > 1 && breaksInsideWord(lines.map((l) => l.text))) shrink();
              },
        };
  return { fontSize: cut > 0 ? base - cut : null, textProps };
}
