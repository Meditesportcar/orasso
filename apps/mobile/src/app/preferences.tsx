// « Tes préférences » (lot M6, maquette 8.3, retour 19) : LA page de ce qu'on veut voir, à l'arrivée et dans les réglages
// (plein écran, mode B, en-tête de fiche, sans barre d'onglets). Première fois (`?premiere=1`, après l'ajout du premier
// véhicule, lot M1) : dernière étape de l'arrivée, « Découvrir les événements » enregistre et ouvre l'Explorer déjà
// filtré, ✕ « Passer » marque l'étape comme vue sans rien changer. Ensuite, rouverte depuis Profil : « Enregistrer »
// puis retour. Dans l'ordre : ton coin (départements), la distance habituelle (10 à 200 km ou « Partout en France »),
// les types d'événements, les centres d'intérêt, un seul interrupteur « Me prévenir des nouveaux événements dans mon
// coin » (le réglage de l'écran Notifications). Tout est rangé sur le compte par l'API (`PATCH /me/preferences`) ; seuls
// les champs touchés sont envoyés, et une réponse tardive ne défait jamais ce que la personne vient de régler.
import { Chip, franceDepartmentByCode, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  arriveeLabels,
  clampPreferenceRadius,
  type EventFormat,
  eventFormatLabels,
  eventFormats,
  preferencesLabels as L,
  newEventsCaption,
  overseasDepartmentNames,
  PREFERENCE_RADIUS,
  preferenceNewEventsLabel,
  travelTimeLabel,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { DepartmentSheet } from "@/features/arrivee/DepartmentSheet";
import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { EXPLORER_ROUTE, usePreferences } from "@/lib/preferences";
import { mergeFresh, type PreferencesDraft, patchOf, type TouchedFields } from "@/lib/preferencesDraft";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";
import { Slider } from "@/ui/Slider";

const { space3 } = tokens.spacing;

const nameOf = (code: string) => franceDepartmentByCode[code]?.name ?? overseasDepartmentNames[code] ?? code;

type Draft = PreferencesDraft;

export default function TesPreferences() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { premiere } = useLocalSearchParams<{ premiere?: string }>();
  const first = premiere === "1";
  const { preferences, error: loadError, save } = usePreferences();
  const categories = useApi(() => api.categories(), [], { cacheKey: "categories" });
  const [draft, setDraft] = useState<Draft | null>(null);
  // Les champs que la personne a touchés : une réponse fraîche (après le cache) ne les écrase pas, et seuls eux partent.
  const touched = useRef<TouchedFields>({});
  // Dernière distance choisie au curseur : « Partout en France » la met de côté, la décocher la rend.
  const lastKm = useRef(50);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La copie de travail part des préférences du compte (le cache d'abord, puis la réponse fraîche) : les champs non
  // touchés suivent la valeur la plus récente, les champs touchés gardent le choix de la personne.
  useEffect(() => {
    if (!preferences) return;
    if (!touched.current.radiusKm) lastKm.current = clampPreferenceRadius(preferences.radiusKm);
    setDraft((d) => mergeFresh(d, touched.current, preferences));
  }, [preferences]);

  const leave = () => {
    if (first) router.replace(EXPLORER_ROUTE as never);
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/profil" as never);
  };

  async function submit(skip: boolean) {
    setBusy(true);
    setError(null);
    try {
      await save(skip || !draft ? {} : patchOf(draft, touched.current));
      leave();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => (first ? void submit(true) : leave());
  const set = (patch: Partial<Draft>) => {
    for (const k of Object.keys(patch) as (keyof Draft)[]) touched.current[k] = true;
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const everywhere = draft?.radiusKm === null;

  return (
    <FlowScreen
      title={L.title}
      facts={first ? L.stepFacts : L.editFacts}
      onClose={close}
      footer={
        <SmButton
          kind="p"
          big
          wide
          icon={first ? "explore" : "check"}
          disabled={!draft || busy}
          onPress={() => void submit(false)}
          testID="preferences-submit"
        >
          {first ? L.discover : L.save}
        </SmButton>
      }
      overlays={
        draft ? (
          <DepartmentSheet
            visible={sheet}
            selected={draft.departments}
            onCancel={() => setSheet(false)}
            onValidate={(next) => {
              set({ departments: next });
              setSheet(false);
            }}
          />
        ) : null
      }
    >
      {first ? (
        <View
          style={[styles.track, { backgroundColor: c.plateLine }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: 92 }}
        >
          <View style={[styles.bar, { backgroundColor: c.accent }]} />
        </View>
      ) : null}
      <View style={styles.head}>
        <Text variant="posterM" color={c.ink} accessibilityRole="header" style={styles.h1}>
          {L.heading}
        </Text>
        <Text variant="body" color={c.inkMuted}>
          {L.lead}
        </Text>
      </View>
      {!draft ? (
        <Muted variant="body">{loadError ? loadError.message : "Chargement…"}</Muted>
      ) : (
        <>
          <Text variant="label" color={c.inkMuted}>
            {L.departments}
          </Text>
          <View style={styles.dsel} testID="pref-departments">
            {draft.departments.length === 0 ? (
              <Text variant="caption" color={c.inkMuted}>
                {L.noDepartment}
              </Text>
            ) : null}
            {draft.departments.map((code, i) => (
              <View
                key={code}
                style={[
                  styles.dchip,
                  { backgroundColor: i === 0 ? c.poster : c.surface, boxShadow: t.shadow.shadowCard },
                ]}
              >
                <View style={[styles.num, { backgroundColor: c.accent }]}>
                  <Text variant="numberNarrow" color={c.accentInk} style={styles.numText}>
                    {code}
                  </Text>
                </View>
                <Text variant="bodyStrong" color={i === 0 ? c.posterInk : c.ink} style={styles.dname}>
                  {i === 0 ? `${nameOf(code)} · ${arriveeLabels.department.favorite}` : nameOf(code)}
                </Text>
              </View>
            ))}
            <SmButton kind="s" icon="edit" onPress={() => setSheet(true)} testID="pref-departments-edit">
              {L.editDepartments}
            </SmButton>
          </View>

          <Text variant="label" color={c.inkMuted}>
            {L.distance}
          </Text>
          <View style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
            <View style={styles.rv}>
              <Text variant="numberNarrow" color={c.ink} style={styles.km} testID="pref-radius">
                {everywhere ? L.everywhereShort : `${draft.radiusKm}`}
                {everywhere ? null : (
                  <Text variant="numberNarrow" color={c.ink} style={styles.kmUnit}>
                    {" km"}
                  </Text>
                )}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {draft.radiusKm === null ? L.everywhereCaption : travelTimeLabel(draft.radiusKm)}
              </Text>
            </View>
            {/* « Partout en France » : le curseur est grisé et ne répond plus ; décocher rend la dernière distance. */}
            <View style={everywhere ? styles.sliderOff : undefined} pointerEvents={everywhere ? "none" : "auto"}>
              <Slider
                label={L.distance}
                value={draft.radiusKm ?? lastKm.current}
                min={PREFERENCE_RADIUS.min}
                max={PREFERENCE_RADIUS.max}
                step={PREFERENCE_RADIUS.step}
                format={(v) => `${v} km`}
                onChange={(v) => {
                  lastKm.current = v;
                  set({ radiusKm: v });
                }}
                onCommit={(v) => {
                  lastKm.current = v;
                  set({ radiusKm: v });
                }}
              />
            </View>
            <View style={styles.everywhere} testID="pref-everywhere">
              <Chip
                selected={everywhere}
                onPress={() => set({ radiusKm: everywhere ? lastKm.current : null })}
                accessibilityRole="toggle"
              >
                {L.everywhere}
              </Chip>
            </View>
          </View>

          <Text variant="label" color={c.inkMuted}>
            {L.types}
          </Text>
          {/* Maquette 8.3 (`.pchips`) : les types passent à la ligne, tous visibles. */}
          <View style={styles.pchips} accessibilityLabel={L.types}>
            {eventFormats.map((f: EventFormat) => (
              <Chip
                key={f}
                selected={draft.eventFormats.includes(f)}
                onPress={() => set({ eventFormats: toggleIn(draft.eventFormats, f) })}
                accessibilityRole="toggle"
              >
                {eventFormatLabels[f]}
              </Chip>
            ))}
          </View>

          <Text variant="label" color={c.inkMuted}>
            {L.interests}
          </Text>
          {categories.data ? (
            <View style={styles.pchips} accessibilityLabel={L.interests} testID="pref-interests">
              {categories.data.map((cat) => (
                <Chip
                  key={cat.id}
                  selected={draft.interests.includes(cat.id)}
                  onPress={() => set({ interests: toggleIn(draft.interests, cat.id) })}
                  accessibilityRole="toggle"
                >
                  {cat.label}
                </Chip>
              ))}
            </View>
          ) : (
            <Text variant="caption" color={c.inkMuted}>
              {L.interestsLoading}
            </Text>
          )}

          <Text variant="label" color={c.inkMuted}>
            {L.notify}
          </Text>
          <View style={[styles.setlist, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
            <Pressable
              onPress={() => set({ newEvents: !draft.newEvents })}
              accessibilityRole="switch"
              accessibilityState={{ checked: draft.newEvents }}
              aria-checked={draft.newEvents}
              accessibilityLabel={preferenceNewEventsLabel.title}
              testID="pref-notify-newEvents"
              style={styles.swrow}
            >
              <View style={styles.swText}>
                <Text variant="bodyStrong" color={c.ink}>
                  {preferenceNewEventsLabel.title}
                </Text>
                <Text variant="caption" color={c.inkMuted}>
                  {newEventsCaption(draft.radiusKm)}
                </Text>
              </View>
              <View style={[styles.switch, { backgroundColor: draft.newEvents ? c.accent : c.plateLine }]}>
                <View
                  style={[
                    styles.knob,
                    { backgroundColor: c.surface, transform: [{ translateX: draft.newEvents ? 20 : 0 }] },
                  ]}
                />
              </View>
            </Pressable>
          </View>
          {error ? (
            <Text variant="caption" color={c.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  track: { width: "100%", height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { width: "92%", height: 6, borderRadius: 3 },
  head: { gap: 6 },
  pchips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  h1: { fontSize: 30, lineHeight: 30 },
  card: { borderRadius: 18, padding: 14, gap: 10 },
  sliderOff: { opacity: 0.4 },
  everywhere: { flexDirection: "row" },
  rv: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  km: { fontSize: 46, lineHeight: 48 },
  kmUnit: { fontSize: 18 },
  dsel: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  dchip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 12,
  },
  num: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { fontSize: 15, lineHeight: 17 },
  dname: { fontSize: 12.5, lineHeight: 16 },
  setlist: { borderRadius: 18, overflow: "hidden" },
  swrow: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: 12, paddingHorizontal: 14 },
  swText: { flex: 1, gap: 2 },
  switch: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11 },
});
