// Feuille posée sur tout l'écran (voile compris) quel que soit l'endroit où l'écran la déclare : la feuille du système
// remplit son parent, et celles du tri sont déclarées dans la file, la liste d'attente ou le mode liste, pas à la racine
// de l'écran. Un `Modal` natif lui donne un parent plein écran (et le retour Android la ferme).
import type { SheetProps } from "@orasso/design-system/native";
import { Modal, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";

export function ScreenSheet({ visible, onClose, ...rest }: SheetProps & { maxHeight?: number }) {
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <AppSheet visible onClose={onClose} {...rest} />
      </View>
    </Modal>
  );
}
