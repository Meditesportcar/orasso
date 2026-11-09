// Onglet Le Fil (lot R7a1, D38) : la place est prise, le contenu viendra du lot R7e2 (publications des personnes
// suivies, filtres, « ⋯ »). En attendant, la page montre le Journal actuel (notifications) sous le titre « Le Fil », avec
// la bande ORASSO et la barre d'onglets comme tout onglet (mode A).
import { navLabels } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { JournalList } from "@/ui/JournalSheet";
import { Muted } from "@/ui/Muted";
import { TabScreen } from "@/ui/Screens";

export function FilScreen() {
  const focused = useIsFocused();
  return (
    <TabScreen title={navLabels.fil.title}>
      <Muted variant="body">{navLabels.fil.note}</Muted>
      <JournalList active={focused} />
    </TabScreen>
  );
}
