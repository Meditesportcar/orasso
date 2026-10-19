// Tuto d'arrivée : écran de transition jusqu'au lot 42, qui le remplace par un tuto par profil (`features/tuto/`).
// Le compte est déjà créé ; « C'est parti » mène à l'onglet central du profil (ou au lien partagé qui a mené ici).
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { FlowScreen } from "@/features/arrivee/FlowScreen";
import { arriveeStore, useArrivee } from "@/features/arrivee/model";

const { space2 } = tokens.spacing;

export default function ArriveeTuto() {
  const { t } = useTheme();
  const router = useRouter();
  const { next } = useArrivee();
  const go = () => {
    arriveeStore.reset();
    router.replace((next ?? "/") as never);
  };
  return (
    <FlowScreen
      step={2}
      footer={
        <Button variant="primary" icon="next" fullWidth onPress={go}>
          C'est parti
        </Button>
      }
    >
      <Plate kind="note" style={styles.plate}>
        <Text variant="posterM" color={t.color.plateInk}>
          Bientôt
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          Le tuto de ton profil arrive. En attendant, ton compte est prêt.
        </Text>
      </Plate>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({ plate: { gap: space2 } });
