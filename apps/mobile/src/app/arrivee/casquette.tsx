// Fin de l'arrivée : le profil choisi mène à sa barre. Un Pro, un Organisateur, un Prestataire ou un Média crée sa casquette par les
// écrans de création existants ; un Exposant sans véhicule ajoute sa voiture ; « Plus tard » ouvre l'appli sur la barre
// visiteur, avec une carte « Termine ta fiche » (Accueil, Mon profil).
import { Button } from "@orasso/design-system/native";
import { pendingLabels } from "@orasso/shared";
import { Redirect, useRouter } from "expo-router";

import { ArriveeScreen, ObHead } from "@/features/arrivee/ArriveeScreen";
import { arriveeStore, useArrivee } from "@/features/arrivee/model";
import { usePendingCasquette } from "@/features/arrivee/PendingCard";
import { pendingPath } from "@/features/arrivee/pending";
import { T, useArt } from "@/features/tuto/art";

export default function ArriveeCasquette() {
  const a = useArt();
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
      onClose={() => leave(next ?? "/")}
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
      <ObHead title={text.title} text={text.caption} />
      <T k="cap" color={a.muted}>
        {pendingLabels.barNote}
      </T>
    </ArriveeScreen>
  );
}
