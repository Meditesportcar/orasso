// Onglet Le Fil (lot R7a1, D38) : la place est prise, le contenu viendra du lot R7e2 (publications des personnes
// suivies, filtres, « ⋯ »). En attendant, la page montre les notifications sous le titre « Le Fil », avec la bande
// ORASSO et la barre d'onglets comme tout onglet (mode A). Elle ne marque rien comme lu (c'est le rôle de la cloche,
// tour 2) ; elle se relit au retour sur l'onglet (`useApi`), au glissement et à chaque notification reçue.
import { navLabels } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { JournalList, useJournalFeed } from "@/ui/JournalSheet";
import { Muted } from "@/ui/Muted";
import { TabScreen } from "@/ui/Screens";

export function FilScreen() {
  const focused = useIsFocused();
  const { me } = useSession();
  const feed = useJournalFeed(focused);
  const { reload } = feed;
  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "notification") void reload();
  });
  return (
    <TabScreen title={navLabels.fil.title} onRefresh={reload}>
      <Muted variant="body">{navLabels.fil.note}</Muted>
      <JournalList active={focused} feed={feed} markRead={false} />
    </TabScreen>
  );
}
