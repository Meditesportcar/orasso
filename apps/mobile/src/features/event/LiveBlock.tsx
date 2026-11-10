// La fiche pendant l'événement (lot R7d2, maquette R7.13) : « En cours · jour 2 sur 4 », « 11 sur place, sur 14
// retenues » et, pour qui n'est pas encore présent et n'a pas de place de véhicule, « Je suis sur place ». Tout vient du
// bloc `live` de l'API : l'écran ne calcule aucun nombre et ne garde rien d'une lecture précédente (après la fin l'API ne
// renvoie plus ni retenues ni présents, et `liveOnSiteLine` n'affiche rien hors de la phase « en cours »).
import { tokens, useTheme } from "@orasso/design-system/native";
import { type EventLive, presenceLabels as L, liveOnSiteLine, nearCountdown, storyShareLabels } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { nowMs } from "@/lib/clock";

import { Row } from "./EventFacts";

const { space1 } = tokens.spacing;

export function LiveBlock({
  live,
  event,
  showPhase,
  offerPresence,
  onPresence,
  onOrganizerStory,
}: {
  live: EventLive;
  event: { startsAt: string; endsAt: string };
  /** « En cours · jour 2 sur 4 » : masqué quand « Ta place » le dit déjà. */
  showPhase: boolean;
  offerPresence: boolean;
  onPresence: () => void;
  /** Lot R7h : ouvre la story de l'organisateur (la ligne n'existe que si le bloc `live` la dit disponible). */
  onOrganizerStory?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const onSite = liveOnSiteLine(live);
  const story = live.organizerStoryAvailable && onOrganizerStory ? onOrganizerStory : null;
  if (live.phase !== "running" || (!showPhase && !onSite && !offerPresence && !story)) return null;
  const sep = <View style={[styles.sep, { borderTopColor: c.line }]} />;
  return (
    <View style={[styles.box, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID="event-live">
      {showPhase ? <Row icon="live" title={nearCountdown(event, new Date(nowMs()))} testID="event-live-phase" /> : null}
      {showPhase && onSite ? sep : null}
      {onSite ? <Row icon="staff" title={onSite} testID="event-live-onsite" /> : null}
      {(showPhase || onSite) && story ? sep : null}
      {story ? (
        <Pressable
          onPress={story}
          accessibilityRole="button"
          accessibilityLabel={storyShareLabels.organizerStoryOpen}
          testID="event-organizer-story"
        >
          <Row icon="live" title={storyShareLabels.organizerStory} />
        </Pressable>
      ) : null}
      {(showPhase || onSite || story) && offerPresence ? sep : null}
      {offerPresence ? (
        <View style={styles.action}>
          <SmButton kind="s" big wide icon="target" onPress={onPresence} testID="event-presence-open">
            {L.action}
          </SmButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Même carte que `EventRows` (`.frows` : rayon 18, filet pointillé entre deux lignes).
  box: { borderRadius: 18, overflow: "hidden" },
  sep: { borderTopWidth: 1, borderStyle: "dashed" },
  action: { padding: 14, paddingTop: space1 + 8 },
});
