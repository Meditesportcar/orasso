// « Termine ta fiche » : la carte de l'Accueil et de Mon profil tant que la casquette du profil choisi à l'arrivée n'existe
// pas (ou que l'exposant n'a pas de véhicule). Disparaît d'elle-même dès que c'est fait : la barre du profil s'affiche.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { pendingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { useSession } from "@/lib/session";

import { type PendingKind, pendingCasquette, pendingPath } from "./pending";

const { space2 } = tokens.spacing;

/** Ce qu'il reste à faire pour le compte connecté (`null` : rien). */
export function usePendingCasquette(): PendingKind | null {
  const { me } = useSession();
  if (!me) return null;
  return pendingCasquette(
    me.profile.mainProfile,
    (me.personas ?? []).map((p) => p.kind),
    me.counts.vehicles,
  );
}

export function PendingCard({ where }: { where: "home" | "profil" }) {
  const { t } = useTheme();
  const router = useRouter();
  const kind = usePendingCasquette();
  // L'Accueil du visiteur invite déjà à ajouter un véhicule : pas de doublon.
  if (!kind || (where === "home" && kind === "vehicle")) return null;
  const text = pendingLabels[kind];
  const path = pendingPath[kind];
  return (
    <Plate style={styles.card} testID={`pending-${kind}`}>
      <Text variant="label" color={t.color.plateMuted}>
        {pendingLabels.kicker}
      </Text>
      <Text variant="posterM" color={t.color.plateInk}>
        {text.title}
      </Text>
      <Text variant="body" color={t.color.plateMuted}>
        {text.caption}
      </Text>
      {path ? (
        <Button variant="plate" icon="next" onPress={() => router.push(path as never)} fullWidth>
          {text.cta}
        </Button>
      ) : null}
    </Plate>
  );
}

const styles = StyleSheet.create({ card: { gap: space2 } });
