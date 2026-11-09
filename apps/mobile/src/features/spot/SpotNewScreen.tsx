// Lancer un rendez-vous au spot (lot R7i, maquette R7.9) : le lieu (adresse trouvée par le géocodage, puis la carte pour viser
// le point), l'heure (maintenant ou plus tard, 24 h devant au plus), la durée (puces de `durationOptions`, 12 h au plus), un
// mot, et qui est prévenu (mes abonnés ou un de mes crews). Mode B (en-tête de fiche). Un seul rendez-vous actif : l'écran
// le dit et mène à lui. La position de l'appareil sert seulement à centrer la carte (`useMyPosition`) : jamais envoyée,
// seul le point que la personne vise est envoyé.
import { Chip, Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  clampStart,
  customEndsAt,
  defaultDuration,
  durationOptions,
  spotLabels as L,
  SPOT_CUSTOM_MAX_MIN,
  SPOT_CUSTOM_MIN_MIN,
  SPOT_CUSTOM_STEP_MIN,
  SPOT_NOTE_MAX,
  SPOT_PLACE_MAX,
  spotEndLabel,
  spotTimeLabel,
  spotUntilLabel,
  startOptions,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useMyPosition } from "@/features/explorer/useMyPosition";
import { PinMap } from "@/features/orga/wizard/PinMap";
import { api } from "@/lib/api";
import { now as orassoNow } from "@/lib/clock";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Card, SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;
const MIN = 60_000;

type Audience = { kind: "followers" } | { kind: "crew"; crewId: string };

export function SpotNewScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { crew: crewParam } = useLocalSearchParams<{ crew?: string }>();
  const audiences = useApi(() => api.spotAudiences(), []);
  const position = useMyPosition();
  const [now] = useState(() => orassoNow());

  // Lieu : le point visé (envoyé), le centre de la carte (la position de l'appareil ne sert qu'à elle), le nom affiché.
  const [query, setQuery] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const geo = useRef(0);

  // Heure et durée : on retient le choix, les dates se calculent au lancement (« Maintenant » = l'instant du toucher).
  const starts = useMemo(() => startOptions(now), [now]);
  const [startKey, setStartKey] = useState("now");
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const startsAt =
    startKey === "custom" && customStart ? customStart : (starts.find((s) => s.id === startKey)?.startsAt ?? now);
  const options = useMemo(() => durationOptions(now, startsAt), [now, startsAt]);
  const [durKey, setDurKey] = useState<string | null>(null);
  const [customMin, setCustomMin] = useState(180);
  const chosenDur =
    durKey === "custom"
      ? "custom"
      : (options.find((o) => o.id === durKey)?.id ?? defaultDuration(options, now)?.id ?? null);
  const endsAt =
    chosenDur === "custom"
      ? customEndsAt(startsAt, customMin)
      : (options.find((o) => o.id === chosenDur)?.endsAt ?? null);

  const [note, setNote] = useState("");
  const [audience, setAudience] = useState<Audience>({ kind: "followers" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/accueil"));

  // Audience préremplie depuis l'onglet Spots d'un crew (`?crew=<id>`), une seule fois.
  const prefilled = useRef(false);
  useEffect(() => {
    const list = audiences.data?.crews;
    if (prefilled.current || !list) return;
    prefilled.current = true;
    if (crewParam && list.some((x) => x.id === crewParam)) setAudience({ kind: "crew", crewId: crewParam });
  }, [audiences.data, crewParam]);

  // La position de l'appareil (arrondie) centre la carte, jamais le point envoyé.
  useEffect(() => {
    if (position.position) setCenter({ lat: position.position.lat, lng: position.position.lng });
  }, [position.position]);

  const existing = activeId ?? audiences.data?.activeMeetupId ?? null;
  const crews = audiences.data?.crews ?? [];
  const noAudience = audiences.data ? audiences.data.followers === 0 && crews.length === 0 : false;

  async function find() {
    const q = query.trim();
    if (q.length < 3) return;
    const mine = ++geo.current;
    setFinding(true);
    setStatus(null);
    try {
      const { match } = await api.geocode(q);
      if (mine !== geo.current) return;
      if (match) {
        setPoint({ lat: match.lat, lng: match.lng });
        setCenter({ lat: match.lat, lng: match.lng });
        setPlaceName((p) => p || match.label.slice(0, SPOT_PLACE_MAX));
        setStatus(L.whereFound(match.label));
      } else setStatus(L.whereNotFound);
    } catch (e) {
      if (mine === geo.current) setStatus(errorMessage(e));
    } finally {
      if (mine === geo.current) setFinding(false);
    }
  }

  const missing = [
    point ? null : L.whereMissing,
    placeName.trim().length < 2 ? "Donne un nom au lieu." : null,
    endsAt ? null : "Choisis une durée.",
    noAudience ? L.noAudience : null,
  ].filter((x): x is string => x !== null);

  async function launch() {
    if (!point || !endsAt || missing.length) return;
    setBusy(true);
    setError(null);
    // « Maintenant » : l'instant du toucher ; la durée choisie est recalculée depuis lui.
    const at = orassoNow();
    const start = startKey === "now" ? at : startsAt;
    const end =
      chosenDur === "custom"
        ? customEndsAt(start, customMin)
        : (durationOptions(at, start).find((o) => o.id === chosenDur)?.endsAt ?? endsAt);
    try {
      const view = await api.createSpot({
        placeLabel: placeName.trim(),
        lat: point.lat,
        lng: point.lng,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        note: note.trim() || null,
        audience: audience.kind,
        crewId: audience.kind === "crew" ? audience.crewId : null,
      });
      router.replace({ pathname: "/spot/[id]", params: { id: view.id } });
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "meetup_active") {
        setActiveId(typeof e.details?.meetupId === "string" ? e.details.meetupId : null);
        setError(L.active);
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const until = endsAt ? spotUntilLabel(startsAt, endsAt) : null;

  return (
    <FlowScreen
      title={L.title}
      facts={L.subtitle}
      onClose={close}
      closeLabel="Fermer"
      footer={
        <View style={styles.footer}>
          {missing.length ? (
            <Muted variant="caption" testID="spot-missing">
              {missing[0]}
            </Muted>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="send"
            disabled={busy || missing.length > 0 || Boolean(existing)}
            onPress={() => void launch()}
            testID="spot-launch"
          >
            {busy ? L.launching : L.launch}
          </SmButton>
        </View>
      }
    >
      {existing ? (
        <View style={styles.gap} testID="spot-active-notice">
          <Notice tone="error">{L.active}</Notice>
          <SmButton
            kind="s"
            icon="next"
            wide
            onPress={() => router.replace({ pathname: "/spot/[id]", params: { id: existing } })}
            testID="spot-see-active"
          >
            {L.seeActive}
          </SmButton>
        </View>
      ) : null}
      {audiences.error ? <Notice tone="error">{audiences.error.message}</Notice> : null}

      <Text variant="label" color={c.inkMuted}>
        {L.where}
      </Text>
      <TextField
        label={L.whereSearch}
        value={query}
        onChangeText={(v) => {
          geo.current++;
          setFinding(false);
          setQuery(v);
        }}
        maxLength={200}
        placeholder="Port de Saint-Cyprien"
        testID="spot-query"
      />
      <View style={styles.two}>
        <View style={styles.fill}>
          <SmButton
            icon="place"
            wide
            disabled={finding || query.trim().length < 3}
            onPress={() => void find()}
            testID="spot-find"
          >
            {L.whereFind}
          </SmButton>
        </View>
        <View style={styles.fill}>
          <SmButton
            icon="target"
            wide
            disabled={position.status === "asking"}
            onPress={() => void position.request()}
            testID="spot-around-me"
          >
            {L.whereMine}
          </SmButton>
        </View>
      </View>
      <PinMap
        lat={center?.lat ?? point?.lat ?? null}
        lng={center?.lng ?? point?.lng ?? null}
        onMove={(lat, lng) => setPoint({ lat, lng })}
        label={L.where}
      />
      <Muted variant="caption" testID="spot-point">
        {position.status === "denied"
          ? L.whereMineDenied
          : (status ?? (point ? L.whereTouch : `${L.whereTouch} ${L.whereHint}`))}
      </Muted>
      <TextField
        label={L.placeName}
        value={placeName}
        onChangeText={setPlaceName}
        maxLength={SPOT_PLACE_MAX}
        placeholder="Port de Saint-Cyprien"
        testID="spot-place-name"
      />

      <Text variant="label" color={c.inkMuted}>
        {L.whatTime}
      </Text>
      <View style={styles.chips} testID="spot-starts">
        {starts.map((s) => (
          <Chip key={s.id} selected={startKey === s.id} accessibilityRole="radio" onPress={() => setStartKey(s.id)}>
            {s.label}
          </Chip>
        ))}
        <Chip
          selected={startKey === "custom"}
          accessibilityRole="radio"
          onPress={() => {
            setCustomStart((p) => p ?? clampStart(new Date(now.getTime() + 60 * MIN), now));
            setStartKey("custom");
          }}
        >
          {L.otherTime}
        </Chip>
      </View>
      {startKey === "custom" && customStart ? (
        <Stepper
          label={`${spotTimeLabel(customStart)}`}
          onLess={() => setCustomStart(clampStart(new Date(customStart.getTime() - SPOT_CUSTOM_STEP_MIN * MIN), now))}
          onMore={() => setCustomStart(clampStart(new Date(customStart.getTime() + SPOT_CUSTOM_STEP_MIN * MIN), now))}
          testID="spot-start-stepper"
        />
      ) : null}

      <Text variant="label" color={c.inkMuted}>
        {L.howLong}
      </Text>
      <View style={styles.chips} testID="spot-durations">
        {options.map((o) => (
          <Chip key={o.id} selected={chosenDur === o.id} accessibilityRole="radio" onPress={() => setDurKey(o.id)}>
            {o.label}
          </Chip>
        ))}
        <Chip selected={chosenDur === "custom"} accessibilityRole="radio" onPress={() => setDurKey("custom")}>
          {L.otherLength}
        </Chip>
      </View>
      {chosenDur === "custom" ? (
        <Stepper
          label={durationLabel(customMin)}
          onLess={() => setCustomMin((m) => Math.max(SPOT_CUSTOM_MIN_MIN, m - SPOT_CUSTOM_STEP_MIN))}
          onMore={() => setCustomMin((m) => Math.min(SPOT_CUSTOM_MAX_MIN, m + SPOT_CUSTOM_STEP_MIN))}
          testID="spot-length-stepper"
        />
      ) : null}
      {until ? (
        <View style={styles.note} testID="spot-until">
          <Icon name="wait" size={16} color={c.accentText} />
          <Text variant="caption" color={c.ink} style={styles.fill}>
            {`${until.charAt(0).toUpperCase()}${until.slice(1)}. Un rendez-vous dure 12 h au plus.`}
          </Text>
        </View>
      ) : null}

      <TextField
        label={`${L.note} (${L.noteOptional})`}
        value={note}
        onChangeText={setNote}
        maxLength={SPOT_NOTE_MAX}
        placeholder={L.notePlaceholder}
        testID="spot-note"
      />

      <Text variant="label" color={c.inkMuted}>
        {L.warned}
      </Text>
      <View style={styles.gap} testID="spot-audience">
        <AudienceOption
          selected={audience.kind === "followers"}
          icon="profile"
          title={L.followers}
          hint={audiences.data ? L.followersHint(audiences.data.followers) : "…"}
          onPress={() => setAudience({ kind: "followers" })}
          testID="spot-audience-followers"
        />
        {crews.map((cr) => (
          <AudienceOption
            key={cr.id}
            selected={audience.kind === "crew" && audience.crewId === cr.id}
            icon="shield"
            title={L.crew(cr.name)}
            hint={L.crewHint(cr.members)}
            onPress={() => setAudience({ kind: "crew", crewId: cr.id })}
            testID={`spot-audience-crew-${cr.id}`}
          />
        ))}
      </View>
      {until ? (
        <View style={styles.note}>
          <Icon name="lock" size={16} color={c.accentText} />
          <Text variant="caption" color={c.ink} style={styles.fill} testID="spot-privacy">
            {L.privacy(spotEndLabel(startsAt, endsAt as Date))}
          </Text>
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </FlowScreen>
  );
}

const durationLabel = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

function Stepper({
  label,
  onLess,
  onMore,
  testID,
}: {
  label: string;
  onLess: () => void;
  onMore: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.stepper} testID={testID}>
      <SmButton icon="minus" onPress={onLess} accessibilityLabel={L.lengthLess} testID={`${testID}-less`}>
        {L.lengthLess}
      </SmButton>
      <Text variant="bodyStrong" color={t.color.ink} style={styles.stepperLabel}>
        {label}
      </Text>
      <SmButton icon="add" onPress={onMore} accessibilityLabel={L.lengthMore} testID={`${testID}-more`}>
        {L.lengthMore}
      </SmButton>
    </View>
  );
}

function AudienceOption({
  selected,
  icon,
  title,
  hint,
  onPress,
  testID,
}: {
  selected: boolean;
  icon: "profile" | "shield";
  title: string;
  hint: string;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Card padded={false}>
      <Pressable
        accessibilityRole="radio"
        aria-checked={selected}
        testID={testID}
        accessibilityLabel={`${title}, ${hint}`}
        onPress={onPress}
        style={[styles.option, selected && { borderColor: c.accentText, borderWidth: 2 }]}
      >
        <Icon name={icon} size={22} color={selected ? c.accentText : c.inkMuted} />
        <View style={styles.fill}>
          <Text variant="bodyStrong" color={c.ink}>
            {title}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {hint}
          </Text>
        </View>
        {selected ? <Icon name="check" size={20} color={c.accentText} /> : null}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  gap: { gap: space2 },
  two: { flexDirection: "row", gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
  footer: { gap: space2 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space3 },
  stepperLabel: { fontSize: 18, lineHeight: 24 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
  },
});
