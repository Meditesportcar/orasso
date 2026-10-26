// Proposer (ou modifier) une sortie du crew (lot R5c2, maquette R5.9) : nom, jour, heure de rendez-vous, point de
// rendez-vous (adresse, puis la carte pour placer le point, comme la création d'événement), programme, la ligne de
// visibilité et « Proposer la sortie ». Réservée au crew : ni candidature, ni QR, ni points. Mode B (en-tête de fiche).
// Paramètres : `crew` (adresse du crew) et `sortie` (identifiant, pour modifier).
import { Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  CREW_OUTING_PLACE_MAX,
  CREW_OUTING_PLACE_MIN,
  CREW_OUTING_PROGRAM_MAX,
  CREW_OUTING_TITLE_MAX,
  CREW_OUTING_TITLE_MIN,
  crewErrors,
  crewPageLabels as L,
  wallTime,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { outingDayReady, outingInstant } from "@/features/crews/page/outingForm";
import { InfoBox } from "@/features/crews/page/parts";
import { useDateTimePicker } from "@/features/orga/wizard/datePicker";
import { PinMap } from "@/features/orga/wizard/PinMap";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2 } = tokens.spacing;
const pad = (n: number) => String(n).padStart(2, "0");

type Draft = {
  title: string;
  day: string;
  time: string;
  place: string;
  lat: number | null;
  lng: number | null;
  program: string;
};

const EMPTY: Draft = { title: "", day: "", time: "", place: "", lat: null, lng: null, program: "" };

export default function CrewOutingForm() {
  const { t } = useTheme();
  const router = useRouter();
  const { crew: slug, sortie } = useLocalSearchParams<{ crew: string; sortie?: string }>();
  const crew = useApi(() => api.crewBySlug(slug), [slug]);
  const v = crew.data;
  const editing = v?.space?.outings.find((o) => o.id === sortie) ?? null;
  const [d, setD] = useState<Draft>(EMPTY);
  const filled = useRef(false);
  const [status, setStatus] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useDateTimePicker();
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/crew/${slug}`));

  // Modifier : le formulaire part de la sortie (une seule fois).
  useEffect(() => {
    if (!editing || filled.current) return;
    filled.current = true;
    const w = wallTime(new Date(editing.startsAt));
    setD({
      title: editing.title,
      day: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
      time: `${pad(w.hour)}:${pad(w.minute)}`,
      place: editing.place,
      lat: editing.lat,
      lng: editing.lng,
      program: editing.program ?? "",
    });
  }, [editing]);

  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));
  const at = outingInstant(d.day, d.time);
  const missing = [
    d.title.trim().length < CREW_OUTING_TITLE_MIN ? L.outingMissingName : null,
    outingDayReady(d.day) ? null : L.outingMissingDay,
    at || !outingDayReady(d.day) ? null : L.outingMissingTime,
    d.place.trim().length < CREW_OUTING_PLACE_MIN ? L.outingMissingPlace : null,
  ].filter((x) => x !== null) as string[];

  async function find() {
    if (d.place.trim().length < CREW_OUTING_PLACE_MIN) return;
    setFinding(true);
    setStatus(L.outingFinding);
    try {
      const { match } = await api.geocode(d.place.trim());
      if (match) {
        set({ lat: match.lat, lng: match.lng });
        setStatus(L.outingFound(match.label));
      } else setStatus(L.outingNotFound);
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setFinding(false);
    }
  }

  async function send() {
    if (!v || !at || missing.length) return;
    setBusy(true);
    setError(null);
    const body = {
      title: d.title.trim(),
      startsAt: at.toISOString(),
      place: d.place.trim(),
      lat: d.lat,
      lng: d.lng,
      program: d.program.trim() || null,
    };
    try {
      if (editing) await api.updateCrewOuting(v.id, editing.id, body);
      else await api.createCrewOuting(v.id, body);
      // La page du crew se relit à son retour (onglet Sorties déjà ouvert).
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? L.outingEditTitle : L.outingFormTitle;
  if (!v) {
    return (
      <FlowScreen title={title} onClose={close} closeLabel={L.outingBack}>
        {crew.error ? <Notice tone="error">{crew.error.message}</Notice> : <Muted variant="body">Chargement…</Muted>}
      </FlowScreen>
    );
  }
  if (!v.space || (sortie && !editing) || (!sortie && !v.space.canProposeOuting)) {
    return (
      <FlowScreen title={title} facts={L.outingFormSub(v.name)} onClose={close} closeLabel={L.outingBack}>
        <Notice tone="error">{v.space ? L.proposeReserved : crewErrors.membersOnly}</Notice>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      title={title}
      facts={L.outingFormSub(v.name)}
      onClose={close}
      closeLabel={L.outingBack}
      footer={
        <View style={styles.footer}>
          {missing.length ? (
            <Muted variant="caption" testID="outing-missing">
              {L.outingMissing(missing)}
            </Muted>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="send"
            disabled={busy || missing.length > 0}
            onPress={() => void send()}
            testID="outing-send"
          >
            {editing ? L.outingSave : L.outingSend}
          </SmButton>
        </View>
      }
    >
      <TextField
        label={L.outingName}
        value={d.title}
        onChangeText={(title) => set({ title })}
        maxLength={CREW_OUTING_TITLE_MAX}
        placeholder={L.outingNamePlaceholder}
        testID="outing-title"
      />
      <View style={styles.two}>
        <TextField
          {...picker.fieldProps("date", d.day, (day) => set({ day }))}
          label={L.outingDay}
          value={d.day}
          onChangeText={(day) => set({ day })}
          placeholder="AAAA-MM-JJ"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          style={styles.half}
          testID="outing-day"
        />
        <TextField
          {...picker.fieldProps("time", d.time, (time) => set({ time }))}
          label={L.outingTime}
          value={d.time}
          onChangeText={(time) => set({ time })}
          placeholder="09:00"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          style={styles.half}
          testID="outing-time"
        />
      </View>
      {picker.picker}
      {at ? (
        <Muted variant="caption" testID="outing-when">
          {formatDayHour(at)}
        </Muted>
      ) : null}
      <TextField
        label={L.outingPlace}
        value={d.place}
        onChangeText={(place) => set({ place })}
        maxLength={CREW_OUTING_PLACE_MAX}
        placeholder={L.outingPlacePlaceholder}
        testID="outing-place"
      />
      <SmButton
        icon="place"
        disabled={finding || d.place.trim().length < CREW_OUTING_PLACE_MIN}
        onPress={() => void find()}
        testID="outing-find"
      >
        {L.outingFind}
      </SmButton>
      <PinMap lat={d.lat} lng={d.lng} onMove={(lat, lng) => set({ lat, lng })} label={L.outingPlace} />
      <Muted variant="caption" testID="outing-point">
        {status ?? (d.lat !== null ? L.outingPointSet : `${L.outingMapHint}. ${L.outingPointMissing}`)}
      </Muted>
      <TextField
        label={L.outingProgram}
        value={d.program}
        onChangeText={(program) => set({ program })}
        maxLength={CREW_OUTING_PROGRAM_MAX}
        placeholder={L.outingProgramPlaceholder}
        multiline
        testID="outing-program"
      />
      <InfoBox icon="lock" title={L.outingVisibility(v.membersCount)} caption={L.outingVisibilityHint} />
      <View style={styles.note}>
        <Text variant="caption" color={t.color.inkMuted} style={styles.grow}>
          {L.outingNote}
        </Text>
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  two: { flexDirection: "row", gap: space2 + 2 },
  half: { flex: 1, minWidth: 0 },
  grow: { flex: 1, minWidth: 0 },
  note: { flexDirection: "row", gap: space2 },
  footer: { gap: space2 },
});
