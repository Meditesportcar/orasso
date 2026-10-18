// Clavier (lot 36, retour de Damien : « le clavier masque les champs en saisie, partout ») : le champ en saisie reste
// visible au-dessus du clavier. Avec Expo SDK 57, Android est en bord à bord : la fenêtre n'est plus redimensionnée à
// l'ouverture du clavier (`adjustResize` sans effet), et `KeyboardAvoidingView` calcule le recouvrement avec une
// position relative à son parent, fausse dès que la vue n'est pas en haut de l'écran. Ici, on mesure la vue dans la
// fenêtre (`measureInWindow`) et on la réduit (marge du bas) de la hauteur réellement recouverte par le clavier. La zone
// qui défile rétrécit ; Android fait alors défiler le champ qui a le focus pour le garder visible (ScrollView natif).
// Aucune dépendance native nouvelle. Navigateur : sans effet (le navigateur gère son clavier).
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, type StyleProp, View, type ViewStyle } from "react-native";

/** Hauteur de la vue `ref` recouverte par le clavier (0 sans clavier, ou dans le navigateur). */
export function useKeyboardOverlap(ref: RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      const top = e.endCoordinates.screenY;
      const node = ref.current;
      if (!node) return;
      node.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, Math.round(y + h - top))));
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () =>
      setOverlap(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);
  return overlap;
}

/** Conteneur qui laisse la place au clavier (zone qui défile et bouton principal du bas restent au-dessus). */
export function KeyboardSafe({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  const overlap = useKeyboardOverlap(ref);
  return (
    <View ref={ref} style={[style, overlap > 0 ? { paddingBottom: overlap } : null]}>
      {children}
    </View>
  );
}
