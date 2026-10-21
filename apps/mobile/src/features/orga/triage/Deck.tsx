// File de tri par glissement (lot 23, § 7.3) : une candidature à la fois, plein écran, pour les véhicules ou pour les
// prestataires (deux files séparées côté API). Les règles sont celles de l'API : l'appli arme une décision, la laisse
// 5 s annulable (comme le site : la décision reçue par l'API est définitive), puis l'envoie par `decide`. L'API tranche :
// `409 event_full` ramène la carte avec le message, `409` « déjà décidée » (site, autre organisateur) la retire et
// recharge la file. Sans réseau, rien ne part : la carte revient et le message le dit.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ApplicationKind,
  type EventZone,
  type RefusalReason,
  type TriageDecision,
  triageAppLabels,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AppState, Image, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useChannel } from "@/lib/realtime";
import {
  type Armed,
  classifyDecisionError,
  currentOf,
  type DecisionExtra,
  decideBody,
  dueArmed,
  emptyQueue,
  needsRefill,
  queueReducer,
  secondsLeft,
} from "@/lib/triage";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { CandidateCard, photosOf, titleOf } from "./CandidateCard";
import { FullSheet } from "./FullSheet";
import { RefusalSheet } from "./RefusalSheet";
import { SwipeCard, type SwipeControl } from "./SwipeCard";
import { ZoneSheet } from "./ZoneSheet";

const { space1, space2, space3 } = tokens.spacing;
const PAGE = 30;

const decisionTag: Record<TriageDecision, string> = {
  accept: triageAppLabels.tagAccepted,
  waitlist: triageAppLabels.tagWaitlisted,
  refuse: triageAppLabels.tagRefused,
};

export function Deck({
  eventId,
  kind,
  zones,
  onChanged,
  onProviderCount,
  fallbackPhoto = null,
}: {
  eventId: string;
  /** Grande photo quand la candidature n'en a pas (photo de l'événement, sinon son affiche ; lot C4a). */
  fallbackPhoto?: string | null;
  kind: ApplicationKind;
  zones: readonly EventZone[];
  /** Une décision est partie : l'écran recharge ses compteurs. */
  onChanged: () => void;
  onProviderCount?: (pending: number) => void;
}) {
  const { t, reducedMotion } = useTheme();
  const focused = useIsFocused();
  const network = useNetworkState();
  const offline = network.isInternetReachable === false || network.isConnected === false;
  const [state, dispatch] = useReducer(queueReducer, emptyQueue);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refusing, setRefusing] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [fullFor, setFullFor] = useState<string | null>(null);
  const [zonePick, setZonePick] = useState<Record<string, EventZone | null>>({});
  const [areaHeight, setAreaHeight] = useState(420);
  const control = useRef<SwipeControl | null>(null);
  const refusalExtra = useRef<DecisionExtra | null>(null);
  const inflight = useRef(new Set<string>());
  const fetching = useRef(false);
  const mayHaveMore = useRef(true);
  const fillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (fillTimer.current) clearTimeout(fillTimer.current);
    };
  }, []);

  const current = currentOf(state);

  // --- Charger la file --------------------------------------------------------------------------------------------
  // Toujours depuis le début : un décalage de page n'a pas de sens quand la file se vide à mesure qu'on décide. Les
  // candidatures déjà connues (file, décisions armées) ne sont pas ajoutées deux fois.
  const fill = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const page = await api.triagePage(eventId, { kind, status: "pending", sort: "created_at", limit: PAGE });
      if (!alive.current) return;
      mayHaveMore.current = page.nextCursor !== null;
      setLoadError(null);
      dispatch({ type: "load", items: page.items });
      if (kind === "provider") onProviderCount?.(page.items.length);
    } catch (e) {
      if (alive.current) setLoadError(errorMessage(e));
    } finally {
      fetching.current = false;
      if (alive.current) setLoaded(true);
    }
  }, [eventId, kind, onProviderCount]);

  const fillSoon = useCallback(() => {
    if (fillTimer.current) clearTimeout(fillTimer.current);
    fillTimer.current = setTimeout(() => void fill(), 600);
  }, [fill]);

  useEffect(() => {
    void fill();
    const timer = setInterval(() => void fill(), 60_000);
    return () => clearInterval(timer);
  }, [fill]);

  // File presque vide : on va chercher la suite tout de suite (la suivante est déjà prête quand on décide).
  useEffect(() => {
    if (loaded && mayHaveMore.current && needsRefill(state)) void fill();
  }, [loaded, state, fill]);

  // Décision prise ailleurs : la file se recharge.
  useEffect(() => {
    if (state.needsReload) {
      mayHaveMore.current = true;
      void fill();
      onChanged();
    }
  }, [state.needsReload, fill, onChanged]);

  // Photo de la suivante chargée à l'avance.
  const next = state.queue[1];
  useEffect(() => {
    const url = next ? photosOf(next)[0]?.url : undefined;
    const source = mediaSource(url);
    if (source) void Image.prefetch(source.uri).catch(() => undefined);
  }, [next]);

  // Temps réel : une candidature change de statut ailleurs (site, autre organisateur) ou arrive.
  useChannel(focused ? `event:${eventId}:triage` : null, (event) => {
    if (event.type !== "application.changed") return;
    const p = event.payload as { applicationId?: string; status?: string };
    if (!p.applicationId || !p.status) return;
    dispatch({ type: "external", id: p.applicationId, status: p.status });
    if (p.status === "pending") {
      mayHaveMore.current = true;
      fillSoon();
    }
  });

  // --- Envoyer les décisions armées -------------------------------------------------------------------------------
  const send = useCallback(
    async (armed: Armed) => {
      const id = armed.item.id;
      if (inflight.current.has(id)) return;
      inflight.current.add(id);
      dispatch({ type: "sending", id });
      const who = armed.item.applicant.pseudo;
      try {
        await api.triageDecide(eventId, id, decideBody(armed.decision, armed.extra));
        dispatch({ type: "sent", id, text: triageAppLabels.sent(decisionTag[armed.decision], who) });
        onChanged();
      } catch (e) {
        const status = e instanceof ApiRequestError ? e.status : 500;
        const code = e instanceof ApiRequestError ? e.code : "internal";
        const failure = classifyDecisionError(status, code);
        const text =
          failure === "offline"
            ? triageAppLabels.offline
            : failure === "full"
              ? triageAppLabels.eventFull
              : failure === "elsewhere"
                ? triageAppLabels.elsewhere
                : failure === "locked"
                  ? triageAppLabels.locked
                  : triageAppLabels.decideFailed(who, errorMessage(e));
        dispatch({ type: "failed", id, failure, text });
      } finally {
        inflight.current.delete(id);
      }
    },
    [eventId, onChanged],
  );

  // Compte à rebours : un tic tant qu'une décision est armée ; au délai écoulé, elle part.
  const hasArmed = state.armed.length > 0;
  useEffect(() => {
    if (!hasArmed) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [hasArmed]);
  useEffect(() => {
    for (const armed of dueArmed(stateRef.current, now)) void send(armed);
  }, [now, send]);

  // Quitter l'écran (démontage : changement de casquette, d'événement) ou passer l'appli en arrière-plan : les
  // décisions armées partent tout de suite plutôt que de se perdre avec leur minuterie.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const flush = () => {
      for (const armed of stateRef.current.armed) if (!armed.sending) void sendRef.current(armed);
    };
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") flush();
    });
    return () => {
      sub.remove();
      flush();
    };
  }, []);

  // --- Décider ---------------------------------------------------------------------------------------------------
  const arm = (decision: TriageDecision) => {
    const item = currentOf(stateRef.current);
    if (!item) return;
    const extra: DecisionExtra =
      decision === "refuse"
        ? { ...(refusalExtra.current ?? { reasons: [] as RefusalReason[], note: "", sendReasons: true }) }
        : decision === "accept"
          ? { zoneId: zonePick[item.id]?.id ?? null }
          : {};
    refusalExtra.current = null;
    dispatch({
      type: "arm",
      id: item.id,
      decision,
      extra,
      now: Date.now(),
    });
    setNow(Date.now());
  };

  const busy = !current || offline;
  const press = (decision: TriageDecision) => {
    if (busy) return;
    if (decision === "refuse") control.current?.refuse();
    else control.current?.exit(decision);
  };

  // Artefact `.tri .tph` : 230 px de photo, moins sur un petit écran.
  const photoHeight = Math.max(130, Math.min(230, Math.round(areaHeight * 0.48)));
  const armedShown = state.armed.slice(-2).reverse();
  const hidden = state.armed.length - armedShown.length;
  const zoneNow = current ? (zonePick[current.id] ?? null) : null;
  const fullItem = fullFor ? (state.queue.find((q) => q.id === fullFor) ?? null) : null;

  // Lot C4a (artefact `.tri-act`) : les trois décisions sont dans la carte, sous les faits.
  const decisions = (
    <View style={styles.row}>
      <Button
        variant="plate"
        tone="dashed"
        icon="close"
        disabled={busy}
        onPress={() => press("refuse")}
        style={styles.grow}
        testID="triage-refuse"
      >
        {triageAppLabels.refuse}
      </Button>
      <Button
        variant="plate"
        tone="wait"
        icon="wait"
        disabled={busy}
        onPress={() => press("waitlist")}
        style={styles.grow}
        testID="triage-waitlist"
      >
        {triageAppLabels.waitlist}
      </Button>
      <Button
        variant="primary"
        icon="check"
        disabled={busy}
        onPress={() => press("accept")}
        style={styles.grow}
        testID="triage-accept"
      >
        {triageAppLabels.accept}
      </Button>
    </View>
  );
  return (
    <View style={styles.fill}>
      {offline ? <Notice tone="error">{triageAppLabels.offlineBanner}</Notice> : null}
      {loadError && !current ? <Notice tone="error">{loadError}</Notice> : null}
      {state.notice ? (
        <Notice tone={state.notice.kind === "error" ? "error" : "info"}>{state.notice.text}</Notice>
      ) : null}

      <View style={styles.area} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
        {current ? (
          <SwipeCard
            key={current.id}
            disabled={busy}
            controlRef={control}
            onExited={(decision) => arm(decision)}
            onRefuse={() => setRefusing(true)}
            testID="triage-swipe"
          >
            <CandidateCard item={current} photoHeight={photoHeight} fallbackPhoto={fallbackPhoto} actions={decisions} />
          </SwipeCard>
        ) : (
          <Plate kind="note" testID="triage-empty">
            <Text variant="posterM" color={t.color.plateInk}>
              {loaded
                ? kind === "provider"
                  ? triageAppLabels.noProviders
                  : triageAppLabels.empty
                : triageAppLabels.loading}
            </Text>
            {loaded && state.armed.length === 0 ? (
              <Text variant="body" color={t.color.plateMuted}>
                {triageAppLabels.allClear}
              </Text>
            ) : null}
          </Plate>
        )}
      </View>

      {armedShown.map((armed) => (
        <Plate key={armed.item.id} kind="note" style={styles.armed} testID="triage-armed">
          <View style={styles.armedText}>
            <Text
              variant="bodyStrong"
              color={t.color.plateInk}
              accessibilityLabel={`${triageAppLabels.armed(decisionTag[armed.decision], armed.item.applicant.pseudo)}. ${titleOf(armed.item)}`}
            >
              {triageAppLabels.armed(decisionTag[armed.decision], armed.item.applicant.pseudo)}
            </Text>
          </View>
          <Button
            variant="plate"
            icon="undo"
            disabled={armed.sending}
            onPress={() => dispatch({ type: "undo", id: armed.item.id })}
            testID="triage-undo"
          >
            {triageAppLabels.undoIn(secondsLeft(armed, now))}
          </Button>
        </Plate>
      ))}
      {hidden > 0 ? <Muted variant="caption">{triageAppLabels.armedMore(hidden)}</Muted> : null}

      <View style={styles.row}>
        <Button
          variant="plate"
          icon="list"
          disabled={!current}
          onPress={() => current && setFullFor(current.id)}
          style={styles.grow}
          testID="triage-full"
        >
          {triageAppLabels.fullSheetShort}
        </Button>
        {zones.length > 0 && kind === "vehicle" ? (
          <Button
            variant="plate"
            icon="place"
            disabled={!current}
            onPress={() => setZoneOpen(true)}
            style={styles.grow}
            testID="triage-zone"
          >
            {zoneNow ? zoneNow.code : triageAppLabels.zone}
          </Button>
        ) : null}
        <Button
          variant="plate"
          icon="skip"
          disabled={!current || state.queue.length < 2}
          onPress={() => current && dispatch({ type: "skip", id: current.id })}
          style={styles.grow}
          testID="triage-skip"
        >
          {triageAppLabels.skip}
        </Button>
      </View>
      {hasArmed ? null : (
        <Muted variant="caption" style={styles.hint}>
          {reducedMotion ? triageAppLabels.swipeHintReduced : triageAppLabels.swipeHint}
        </Muted>
      )}

      <RefusalSheet
        visible={refusing}
        onClose={() => setRefusing(false)}
        onConfirm={(extra) => {
          refusalExtra.current = extra;
          setRefusing(false);
          control.current?.exit("refuse");
        }}
      />
      <ZoneSheet
        visible={zoneOpen}
        zones={zones}
        current={zoneNow?.id ?? null}
        onPick={(zone) => {
          if (current) setZonePick((cur) => ({ ...cur, [current.id]: zone }));
          setZoneOpen(false);
        }}
        onClose={() => setZoneOpen(false)}
      />
      <FullSheet item={fullItem} eventId={eventId} onClose={() => setFullFor(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: space2 },
  area: { flex: 1, minHeight: 200 },
  row: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
  armed: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: space2 },
  armedText: { flex: 1, gap: space1 },
  hint: { textAlign: "center" },
});
