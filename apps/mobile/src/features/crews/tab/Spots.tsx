// Onglet « Spots » du crew (lot R7b2 pour l'état vide, lot R7i pour le contenu, maquette R7.11 `ct_spo`) : les rendez-vous au
// spot lancés pour le crew. D'abord ceux qui durent (carte avec le lieu, « Je viens » / « Peut-être »), puis les 30 derniers
// jours, sans lieu ni liste. « Lancer un rendez-vous pour le crew » ouvre l'écran de lancement, audience préremplie. Tout est
// décidé par l'API (membres actifs seulement) ; une panne se dit et se relance, jamais une liste vide.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewTabLabels as CL, spotLabels as L, type SpotMeetupView } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { CrewSecHead } from "@/features/crews/page/parts";
import { SpotCard } from "@/features/spot/SpotCard";
import { api } from "@/lib/api";
import { now as orassoNow } from "@/lib/clock";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

export function CrewSpots({ crewId, archived }: { crewId: string; archived?: boolean }) {
  const { t } = useTheme();
  const router = useRouter();
  const list = useApi(() => api.crewSpots(crewId), [crewId]);
  const [active, setActive] = useState<SpotMeetupView[]>([]);
  const [past, setPast] = useState<SpotMeetupView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  useEffect(() => {
    if (!list.data) return;
    setActive(list.data.active);
    setPast(list.data.past);
    setCursor(list.data.nextCursor);
  }, [list.data]);

  async function more() {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await api.crewSpots(crewId, cursor);
      setPast((p) => [...p, ...page.past.filter((x) => !p.some((y) => y.id === x.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setMoreBusy(false);
    }
  }

  const replace = (view: SpotMeetupView) => setActive((a) => a.map((x) => (x.id === view.id ? view : x)));
  const now = orassoNow();
  const empty = list.data && active.length === 0 && past.length === 0;
  const launch = archived ? null : (
    <SmButton
      kind="s"
      big
      wide
      icon="place"
      onPress={() => router.push({ pathname: "/spot/nouveau", params: { crew: crewId } })}
      testID="crew-spots-launch"
    >
      {L.launchForCrew}
    </SmButton>
  );
  return (
    <View style={styles.col} testID="crew-spots">
      {empty ? null : launch}
      {list.error && !list.data ? <LoadError message={list.error.message} onRetry={() => void list.reload()} /> : null}
      {empty ? (
        <View style={[styles.empty, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
          <Icon name="place" size={28} color={t.color.inkMuted} />
          <Text variant="posterS" color={t.color.ink} style={styles.center}>
            {CL.spotsEmptyTitle}
          </Text>
          <Muted variant="caption" style={styles.center}>
            {CL.spotsEmptyHint}
          </Muted>
        </View>
      ) : null}
      {empty ? launch : null}
      {active.length ? <CrewSecHead title={L.crewActive} /> : null}
      {active.map((m) => (
        <SpotCard
          key={m.id}
          meetup={m}
          now={now}
          onChange={replace}
          onOpen={() => router.push({ pathname: "/spot/[id]", params: { id: m.id } })}
          testID="crew-spot-card"
        />
      ))}
      {past.length ? <CrewSecHead title={L.crewPast} /> : null}
      {past.map((m) => (
        <View
          key={m.id}
          style={[styles.pastRow, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
          testID="crew-spot-past"
        >
          <Avatar url={m.author.avatarUrl} pseudo={m.author.pseudo} size={32} />
          <View style={styles.fill}>
            <Text variant="bodyStrong" color={t.color.ink}>
              {L.from(m.author.pseudo)}
            </Text>
            <Text variant="caption" color={t.color.inkMuted}>
              {`${formatDayHour(m.startsAt, undefined, now)}${m.cameCount !== null ? ` · ${L.endedCame(m.cameCount)}` : ""}`}
            </Text>
          </View>
        </View>
      ))}
      {cursor ? (
        <SmButton kind="s" icon="down" wide disabled={moreBusy} onPress={() => void more()} testID="crew-spots-more">
          Voir plus
        </SmButton>
      ) : null}
      {moreError ? <LoadError message={moreError} onRetry={() => void more()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  fill: { flex: 1, minWidth: 0 },
  empty: {
    alignItems: "center",
    gap: space2,
    padding: space3 + 4,
    borderRadius: tokens.radius.radiusLg,
  },
  center: { textAlign: "center" },
  pastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: 12,
    borderRadius: tokens.radius.radiusLg,
  },
});
