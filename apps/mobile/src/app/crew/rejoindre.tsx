// Rejoindre un crew (lot R3b, retour 16 de Damien) : « Crée ou rejoins un crew » du profil ouvrait directement la
// création. D'abord rejoindre : la recherche de crews et « Crews de ton coin », avec la même logique et les mêmes appels
// que le segment Personnes et crews de l'Explorer (lot R2, `PeopleSegment` limité aux crews) ; « Créer un crew » vient
// ensuite, en lien secondaire. Mode B : en-tête de fiche, sans barre d'onglets.
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ExSearch } from "@/features/explorer/ExplorerHead";
import { emptyPeopleFilters } from "@/features/explorer/explorerChoice";
import { PeopleSegment } from "@/features/explorer/PeopleSegment";
import { useSession } from "@/lib/session";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export default function JoinCrew() {
  const router = useRouter();
  const { t } = useTheme();
  const { me } = useSession();
  const [q, setQ] = useState("");
  const coin = me?.profile.departments ?? [];
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profil"));
  return (
    <FlowScreen title={crewLabels.joinTitle} onClose={close}>
      <Text variant="body" color={t.color.inkMuted}>
        {crewLabels.joinHint}
      </Text>
      <ExSearch value={q} onChange={setQ} placeholder={crewLabels.joinSearchPlaceholder} testID="crew-join-q" />
      <PeopleSegment q={q} where={null} show="crews" filters={emptyPeopleFilters} coin={coin} create={false} />
      <View style={styles.create} testID="crew-join-create">
        <Text variant="caption" color={t.color.inkMuted}>
          {crewLabels.joinOrCreate}
        </Text>
        <Button variant="secondary" icon="add" onPress={() => router.push("/crew/nouveau")} testID="crew-new">
          {crewLabels.createCrew}
        </Button>
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  create: { gap: space2, marginTop: space3, alignItems: "flex-start" },
});
