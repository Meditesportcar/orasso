// Fin de l'arrivée : le profil choisi mène à sa barre. Un Pro, un Organisateur ou un Prestataire crée sa casquette par les
// écrans de création existants ; un Exposant sans véhicule ajoute sa voiture ; « Plus tard » ouvre l'appli sur la barre
// visiteur, avec une carte « Termine ta fiche » (Accueil, Mon profil). Le profil média n'a pas encore d'écran de création
// (lot 55) : il passe directement à l'appli, la carte le dit.
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { pendingLabels } from "@orasso/shared";
import { Redirect, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ArriveeScreen } from "@/features/arrivee/ArriveeScreen";
import { arriveeStore, useArrivee } from "@/features/arrivee/model";
import { usePendingCasquette } from "@/features/arrivee/PendingCard";
import { pendingPath } from "@/features/arrivee/pending";
import { Muted } from "@/ui/Muted";

const { space2 } = tokens.spacing;

export default function ArriveeCasquette() {
  const { t } = useTheme();
  const router = useRouter();
  const { next } = useArrivee();
  const kind = usePendingCasquette();
  const path = kind ? pendingPath[kind] : null;
  if (!kind || !path) return <Redirect href={(next ?? "/") as never} />;
  const text = pendingLabels[kind];
  const leave = (to: string) => {
    arriveeStore.reset();
    router.replace(to as never);
  };
  return (
    <ArriveeScreen
      step={2}
      footer={
        <>
          <Button variant="primary" icon="next" fullWidth onPress={() => leave(path)}>
            {text.cta}
          </Button>
          <Button variant="plate" icon="wait" fullWidth onPress={() => leave(next ?? "/")}>
            {pendingLabels.later}
          </Button>
        </>
      }
    >
      <View style={styles.head}>
        <Text variant="posterL" color={t.color.ink} accessibilityRole="header">
          {text.title}
        </Text>
        <Muted variant="body">{text.caption}</Muted>
        <Muted variant="caption">{pendingLabels.barNote}</Muted>
      </View>
    </ArriveeScreen>
  );
}

const styles = StyleSheet.create({ head: { gap: space2 } });
