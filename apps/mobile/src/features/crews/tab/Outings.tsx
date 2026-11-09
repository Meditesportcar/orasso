// Onglet « Sorties » du crew (lot R7b2, maquette R7.11 `ct_sor`) : « Proposer une sortie », les sorties du crew (réponse
// « Je viens | Peut-être | Non »), « Où va le crew » (événements Orasso où des membres sont retenus), « Inscrire le crew ».
import { type CrewOutingRsvp, type CrewOutingView, type CrewSpace, crewPageLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { CrewEventRow, CrewSecHead, OutingCard } from "../page/parts";

export function CrewOutings({
  slug,
  space,
  leader,
  busy,
  onAnswer,
  onCancel,
}: {
  slug: string;
  space: CrewSpace;
  leader: boolean;
  busy: boolean;
  onAnswer: (outing: CrewOutingView, answer: CrewOutingRsvp) => void;
  onCancel: (outing: CrewOutingView) => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.col} testID="crew-outings">
      {space.canProposeOuting ? (
        <SmButton
          kind="p"
          big
          wide
          icon="add"
          onPress={() => router.push({ pathname: "/crew/sortie", params: { crew: slug } })}
          testID="crew-propose-outing"
        >
          {L.proposeOuting}
        </SmButton>
      ) : (
        <Muted variant="caption" testID="crew-propose-reserved">
          {L.proposeReserved}
        </Muted>
      )}
      <CrewSecHead title={L.outingsTitle} hint={L.outingsHint} icon="lock" />
      {space.outings.length === 0 ? <Muted variant="body">{L.outingsEmpty}</Muted> : null}
      {space.outings.map((o) => (
        <OutingCard
          key={o.id}
          outing={o}
          busy={busy}
          onAnswer={(a) => onAnswer(o, a)}
          onEdit={() => router.push({ pathname: "/crew/sortie", params: { crew: slug, sortie: o.id } })}
          onCancel={() => onCancel(o)}
        />
      ))}
      <CrewSecHead title={L.crewEventsTitle} hint={L.crewEventsHint} />
      {space.events.length === 0 ? <Muted variant="body">{L.crewEventsEmpty}</Muted> : null}
      {space.events.map((e) => (
        <CrewEventRow
          key={e.slug}
          event={e}
          onPress={() =>
            leader && e.registered > 0
              ? router.push({ pathname: "/crew/inscription", params: { event: e.slug } })
              : router.push(`/e/${e.slug}`)
          }
        />
      ))}
      {leader ? (
        <SmButton kind="s" big wide icon="ticket" onPress={() => router.navigate("/explorer")} testID="crew-register">
          {L.registerCrew}
        </SmButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 12 },
});
