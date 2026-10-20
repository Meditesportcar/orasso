// Casquette Organisateur, onglet Tri (lot 23, docs/01 « Tri », ARCHITECTURE-SUITE § 7.3) : l'événement à trier, les
// segments Véhicules / Prestataires / Liste d'attente / Liste, les compteurs en tête (mêmes que le site, en direct par
// le canal `event:{id}:triage`) et, dessous, la file par glissement, la liste d'attente ou le mode liste. Toutes les
// règles (capacité, liste d'attente, délais, verrouillage) restent dans l'API : l'écran n'affiche que ce qu'elle répond.
import { Button, Chip, ChipRow, Counters, Ground, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { orgaV2Labels, triageAppLabels } from "@orasso/shared";
import { useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTabSwipeDisabled } from "@/features/nav/useTabSwipe";
import { api } from "@/lib/api";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { COUNTER_ACTIVE, counterCells, triageEvents } from "@/lib/triage";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { TabTitle } from "@/ui/TabTitle";
import { TopBar } from "@/ui/TopBar";
import { OrgaFailure, useOrga } from "../OrgaGate";
import { Deck } from "./Deck";
import { ListMode } from "./ListMode";
import { MissionsPanel } from "./MissionsPanel";
import { PressList } from "./PressList";
import { ScreenSheet } from "./ScreenSheet";
import { Waitlist } from "./Waitlist";

const { space2, space3, space4 } = tokens.spacing;

type Segment = "vehicles" | "waitlist" | "providers" | "press" | "list";

export function TriageScreen() {
  const { t } = useTheme();
  const { structureId, structureName } = useOrga();
  const { refreshMe } = useSession();
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ event?: string }>();
  const at = useNow(60_000);
  // Lot 40 : le tri se fait en glissant les cartes ; le glissement entre onglets est coupé sur cet écran.
  useTabSwipeDisabled();
  const [segment, setSegment] = useState<Segment>("vehicles");
  const [picked, setPicked] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  // Compteurs de la cloche à jour à chaque retour sur l'onglet (comme les autres onglets).
  useFocusEffect(
    useCallback(() => {
      void refreshMe();
    }, [refreshMe]),
  );

  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
    refreshMs: 120_000,
  });
  const choices = useMemo(() => triageEvents(events.data ?? [], at), [events.data, at]);
  const eventId =
    choices.find((e) => e.id === picked)?.id ?? choices.find((e) => e.id === params.event)?.id ?? choices[0]?.id;
  const event = choices.find((e) => e.id === eventId) ?? null;

  const counters = useApi(() => api.triageCounters(eventId ?? ""), [eventId], {
    enabled: Boolean(eventId),
    refreshMs: 60_000,
  });
  const detail = useApi(() => api.orgEvent(eventId ?? ""), [eventId], { enabled: Boolean(eventId) });
  const providers = useApi(
    () => api.triagePage(eventId ?? "", { kind: "provider", status: "pending", sort: "created_at", limit: 100 }),
    [eventId],
    { enabled: Boolean(eventId), refreshMs: 60_000 },
  );
  const reloadCounters = counters.reload;
  const reloadProviders = providers.reload;
  // Lot 52 : les places prises des missions se relisent quand une décision part.
  const [changes, setChanges] = useState(0);
  const onChanged = useCallback(() => {
    void reloadCounters();
    void reloadProviders();
    setChanges((n) => n + 1);
  }, [reloadCounters, reloadProviders]);

  // Compteurs en direct. La preuve de 2FA de la session est exigée par l'API pour ce canal.
  const setCounters = counters.setData;
  useChannel(focused && eventId ? `event:${eventId}:triage` : null, (message) => {
    if (message.type === "counters") setCounters(message.payload as typeof counters.data);
  });

  const providerCount = providers.data?.items.length ?? 0;
  const zones = detail.data?.zones ?? [];
  const firstError = events.error ?? counters.error;

  // Lot 52 (DA v2, `s-otri`) : Candidatures · Liste d'attente · Prestataires · Presse, puis le mode liste.
  const segments: { key: Segment; label: string }[] = [
    { key: "vehicles", label: orgaV2Labels.segApplications },
    { key: "waitlist", label: orgaV2Labels.segWaitlist },
    {
      key: "providers",
      label: providerCount > 0 ? `${orgaV2Labels.segProviders} · ${providerCount}` : orgaV2Labels.segProviders,
    },
    { key: "press", label: orgaV2Labels.segPress },
    { key: "list", label: orgaV2Labels.segList },
  ];

  return (
    <Ground animated={false} style={styles.fill}>
      <TopBar />
      <View style={styles.body}>
        <TabTitle
          title={triageAppLabels.title}
          label={event ? orgaV2Labels.triRemaining(event.title, counters.data?.pending ?? 0) : structureName}
        />
        {firstError && !event ? <OrgaFailure error={firstError} /> : null}
        {!event ? (
          <Plate kind="note" testID="triage-no-event">
            <Text variant="body" color={t.color.plateMuted}>
              {events.loading ? triageAppLabels.loading : triageAppLabels.noEvent}
            </Text>
          </Plate>
        ) : (
          <>
            {choices.length > 1 ? (
              <Button
                variant="plate"
                icon="calendar"
                onPress={() => setPicker(true)}
                fullWidth
                accessibilityLabel={`${triageAppLabels.eventPicker} : ${event.title}`}
                testID="triage-event-picker"
              >
                {event.title}
              </Button>
            ) : null}
            <ChipRow>
              {segments.map((s) => (
                <Chip key={s.key} selected={segment === s.key} onPress={() => setSegment(s.key)}>
                  {s.label}
                </Chip>
              ))}
            </ChipRow>
            <View testID="triage-counters">
              <Counters
                items={counterCells(counters.data, triageAppLabels)}
                active={COUNTER_ACTIVE}
                style={undefined}
              />
            </View>
            <View style={styles.fill} testID={`triage-${segment}`}>
              {segment === "vehicles" ? (
                <Deck
                  key={`${event.id}-vehicle`}
                  eventId={event.id}
                  kind="vehicle"
                  zones={zones}
                  onChanged={onChanged}
                />
              ) : null}
              {segment === "providers" ? (
                <>
                  <MissionsPanel eventId={event.id} pending={providers.data?.items ?? []} reloadKey={changes} />
                  <Deck
                    key={`${event.id}-provider`}
                    eventId={event.id}
                    kind="provider"
                    zones={[]}
                    onChanged={onChanged}
                  />
                </>
              ) : null}
              {segment === "press" ? <PressList key={event.id} eventId={event.id} onChanged={onChanged} /> : null}
              {segment === "waitlist" ? <Waitlist key={event.id} eventId={event.id} onChanged={onChanged} /> : null}
              {segment === "list" ? (
                <ListMode
                  key={event.id}
                  eventId={event.id}
                  kind="vehicle"
                  zones={zones}
                  days={detail.data?.days ?? []}
                  onChanged={onChanged}
                />
              ) : null}
            </View>
          </>
        )}
      </View>

      <ScreenSheet visible={picker} onClose={() => setPicker(false)} accessibilityLabel={triageAppLabels.eventPicker}>
        <Text variant="title" color={t.color.ink}>
          {triageAppLabels.eventPicker}
        </Text>
        {choices.map((e) => (
          <Button
            key={e.id}
            variant={e.id === eventId ? "secondary" : "plate"}
            icon="calendar"
            onPress={() => {
              setPicked(e.id);
              setPicker(false);
            }}
            fullWidth
            testID="triage-event-choice"
          >
            {e.title}
          </Button>
        ))}
      </ScreenSheet>
    </Ground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, paddingHorizontal: space4, paddingTop: space3, paddingBottom: space4, gap: space2 },
});
