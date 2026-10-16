// Écran « Bientôt » d'un onglet de casquette dont le contenu arrive dans un lot suivant (Organisateur : lot 22,
// Prestataire : lot 21). Même gabarit que les autres onglets : barre du haut, avatar, cloche.
import { Plate, Text, useTheme } from "@orasso/design-system/native";

import { TabScreen } from "./Screens";

export function Soon({ title, children }: { title: string; children: string }) {
  const { t } = useTheme();
  return (
    <TabScreen title={title}>
      <Plate kind="note">
        <Text variant="posterM" color={t.color.plateInk}>
          Bientôt
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          {children}
        </Text>
      </Plate>
    </TabScreen>
  );
}
