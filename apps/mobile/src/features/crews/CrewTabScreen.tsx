// Onglet Crew (lot R7a1, D38) : la place est prise, l'écran viendra du lot R7b2. En attendant : avec un crew, sa ligne
// et « Ouvrir mon crew » (la page actuelle du crew, fiche avec son retour) ; sans crew, « Rejoindre un crew » (le seul
// bouton principal, comme dans le Profil) et « Créer un crew ». Mode A : bande ORASSO et barre d'onglets.
import { Button } from "@orasso/design-system/native";
import { navLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { CrewRowNative } from "./CrewSearch";

const L = navLabels.crewTab;

export function CrewTabScreen() {
  const router = useRouter();
  const crews = useApi(() => api.myCrews(), [], { cacheKey: "my-crews" });
  const list = crews.data;
  const first = list?.[0];
  return (
    <TabScreen title={L.title} onRefresh={crews.reload}>
      {!list && crews.error ? <LoadError message={crews.error.message} onRetry={() => void crews.reload()} /> : null}
      {!list && !crews.error ? <Muted variant="body">Chargement…</Muted> : null}
      {first ? (
        <View style={styles.col} testID="crew-tab-mine">
          {list.map((crew) => (
            <CrewRowNative key={crew.id} crew={crew} onPress={() => router.push(`/crew/${crew.slug}`)} />
          ))}
          <Button
            variant="primary"
            icon="crew"
            fullWidth
            onPress={() => router.push(`/crew/${first.slug}`)}
            testID="crew-tab-open"
          >
            {L.open}
          </Button>
        </View>
      ) : null}
      {list && !first ? (
        <View style={styles.col} testID="crew-tab-none">
          <Notice>{`${L.none} ${L.noneHint}`}</Notice>
          <Button
            variant="primary"
            icon="crew"
            fullWidth
            onPress={() => router.push("/rejoindre-crew")}
            testID="crew-tab-join"
          >
            {L.join}
          </Button>
          <Button
            variant="secondary"
            icon="add"
            fullWidth
            onPress={() => router.push("/crew/nouveau")}
            testID="crew-tab-create"
          >
            {L.create}
          </Button>
        </View>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  col: { gap: 12 },
});
