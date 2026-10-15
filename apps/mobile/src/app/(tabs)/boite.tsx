// Boîte : ce qu'on m'écrit (messages et demandes). La messagerie n'est pas dans ce lot : l'onglet existe pour que la
// navigation soit celle de la structure validée (docs/02).
import { Plate, Text, useTheme } from "@orasso/design-system/native";

import { TabScreen } from "@/ui/Screens";

export default function Boite() {
  const { t } = useTheme();
  return (
    <TabScreen title="Boîte">
      <Plate kind="note">
        <Text variant="posterM" color={t.color.plateInk}>
          Bientôt
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          Tes messages (amis, crews, organisateurs) et tes demandes arriveront ici. Pour l'instant, les nouvelles de tes
          candidatures sont dans le Journal, derrière la cloche.
        </Text>
      </Plate>
    </TabScreen>
  );
}
