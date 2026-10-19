// Tuto d'arrivée : écran de transition jusqu'au lot 42, qui le remplace par un tuto par profil (`features/tuto/`).
// Le compte est déjà créé ; « C'est parti » mène à `arrivee/casquette` (créer sa casquette ou « Plus tard »), qui ouvre ensuite l'onglet central du profil. Le lot 42 garde cette sortie.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { ArriveeScreen } from "@/features/arrivee/ArriveeScreen";

const { space2 } = tokens.spacing;

export default function ArriveeTuto() {
  const { t } = useTheme();
  const router = useRouter();
  // Le profil choisi mène à sa barre : l'écran suivant propose de créer la casquette (ou redirige s'il n'y a rien à faire).
  const go = () => router.replace("/arrivee/casquette");
  return (
    <ArriveeScreen
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
    </ArriveeScreen>
  );
}

const styles = StyleSheet.create({ plate: { gap: space2 } });
