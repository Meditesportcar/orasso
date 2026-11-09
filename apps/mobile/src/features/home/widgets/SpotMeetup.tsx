// Bloc « Au spot » de l'Accueil (lot R7i, maquette R7.9) : le prochain rendez-vous reçu (sinon le mien), avec « Qui vient ? »,
// le lieu, l'heure et les deux réponses. `GET /me/home` ne le renvoie que s'il y en a un : le bloc ne s'affiche jamais vide.
// Les règles (qui est invité, le lieu servi aux invités seuls) sont dans l'API.
import { tokens } from "@orasso/design-system/native";
import { type HomeSpotMeetup, spotLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { SpotCard } from "@/features/spot/SpotCard";
import { now as orassoNow } from "@/lib/clock";
import { SecH } from "../fanBlocks";

export function SpotMeetup({ data, onOthers }: { data: HomeSpotMeetup; onOthers?: () => void }) {
  const router = useRouter();
  const [meetup, setMeetup] = useState(data.meetup);
  useEffect(() => setMeetup(data.meetup), [data.meetup]);
  return (
    <View style={styles.wrap} testID="home-spot-meetup">
      <SecH
        title={L.block}
        link={data.others > 0 ? L.homeOthers(data.others) : undefined}
        onLink={data.others > 0 ? onOthers : undefined}
      />
      <SpotCard
        meetup={meetup}
        now={orassoNow()}
        onChange={setMeetup}
        onOpen={() => router.push({ pathname: "/spot/[id]", params: { id: meetup.id } })}
        testID="home-spot-card"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.spacing.space2 },
});
