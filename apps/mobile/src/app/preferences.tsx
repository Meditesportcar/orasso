// « Tes préférences » (lot M6, maquette 8.3, retour 19) : écran plein écran (mode B, en-tête de fiche, sans barre
// d'onglets). Première fois (`?premiere=1`, après l'ajout du premier véhicule, lot M1) : dernière étape de l'arrivée,
// « Découvrir les événements » enregistre et ouvre l'Explorer déjà filtré, ✕ « Passer » marque l'étape comme vue sans
// rien changer. Ensuite, rouverte depuis Profil › Préférences : « Enregistrer » puis retour. Types d'événements
// (plusieurs choix), distance autour de toi (10 à 200 km), départements (la feuille de « Ton coin »), notifications
// « pour toi ». Tout est rangé sur le compte par l'API (`PATCH /me/preferences`).
import { Chip, ChipRow, franceDepartmentByCode, Text, tokens, useTheme } from "@orasso/design-system/native";
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
  type PreferenceNotification,
  preferenceNotificationLabels,
  preferenceNotifications,
  travelTimeLabel,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { DepartmentSheet } from "@/features/arrivee/DepartmentSheet";
import { SmButton } from "@/features/passionne/kit";
import { errorMessage } from "@/lib/http";
import { EXPLORER_ROUTE, usePreferences } from "@/lib/preferences";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";
import { Slider } from "@/ui/Slider";

const { space3 } = tokens.spacing;

const nameOf = (code: string) => franceDepartmentByCode[code]?.name ?? overseasDepartmentNames[code] ?? code;

type Draft = {
  eventFormats: EventFormat[];
  radiusKm: number;
  departments: string[];
  notifications: Record<PreferenceNotification, boolean>;
};

export default function TesPreferences() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { premiere } = useLocalSearchParams<{ premiere?: string }>();
  const first = premiere === "1";
  const { preferences, error: loadError, save } = usePreferences();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La copie de travail part des préférences du compte, une fois lues.
  useEffect(() => {
    if (!preferences || draft) return;
    setDraft({
      eventFormats: preferences.eventFormats,
      radiusKm: clampPreferenceRadius(preferences.radiusKm),
      departments: preferences.departments,
      notifications: preferences.notifications,
    });
  }, [preferences, draft]);

  const leave = () => {
    if (first) router.replace(EXPLORER_ROUTE as never);
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/profil" as never);
  };

  async function submit(skip: boolean) {
    setBusy(true);
    setError(null);
    try {
      await save(skip || !draft ? {} : draft);
      leave();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => (first ? void submit(true) : leave());
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleFormat = (f: EventFormat) =>
    draft &&
    set({
      eventFormats: draft.eventFormats.includes(f)
        ? draft.eventFormats.filter((x) => x !== f)
        : [...draft.eventFormats, f],
    });

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
            {L.types}
          </Text>
          <ChipRow accessibilityLabel={L.types}>
            {eventFormats.map((f) => (
              <Chip
                key={f}
                selected={draft.eventFormats.includes(f)}
                onPress={() => {
                  toggleFormat(f);
                }}
                accessibilityRole="toggle"
              >
                {eventFormatLabels[f]}
              </Chip>
            ))}
          </ChipRow>

          <Text variant="label" color={c.inkMuted}>
            {L.distance}
          </Text>
          <View style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
            <View style={styles.rv}>
              <Text variant="numberNarrow" color={c.ink} style={styles.km} testID="pref-radius">
                {`${draft.radiusKm}`}
                <Text variant="numberNarrow" color={c.ink} style={styles.kmUnit}>
                  {" km"}
                </Text>
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {travelTimeLabel(draft.radiusKm)}
              </Text>
            </View>
            <Slider
              label={L.distance}
              value={draft.radiusKm}
              min={PREFERENCE_RADIUS.min}
              max={PREFERENCE_RADIUS.max}
              step={PREFERENCE_RADIUS.step}
              format={(v) => `${v} km`}
              onChange={(v) => set({ radiusKm: v })}
              onCommit={(v) => set({ radiusKm: v })}
            />
          </View>

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
            {L.notify}
          </Text>
          <View style={[styles.setlist, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
            {preferenceNotifications.map((k, i) => {
              const on = draft.notifications[k];
              const label = preferenceNotificationLabels[k];
              return (
                <Pressable
                  key={k}
                  onPress={() => set({ notifications: { ...draft.notifications, [k]: !on } })}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on }}
                  aria-checked={on}
                  accessibilityLabel={label.title}
                  testID={`pref-notify-${k}`}
                  style={[styles.swrow, i > 0 ? { borderTopWidth: 1, borderTopColor: c.plateLine } : null]}
                >
                  <View style={styles.swText}>
                    <Text variant="bodyStrong" color={c.ink}>
                      {label.title}
                    </Text>
                    <Text variant="caption" color={c.inkMuted}>
                      {k === "newEvents" ? newEventsCaption(draft.radiusKm) : label.caption}
                    </Text>
                  </View>
                  <View style={[styles.switch, { backgroundColor: on ? c.accent : c.plateLine }]}>
                    <View
                      style={[styles.knob, { backgroundColor: c.surface, transform: [{ translateX: on ? 20 : 0 }] }]}
                    />
                  </View>
                </Pressable>
              );
            })}
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
  h1: { fontSize: 30, lineHeight: 30 },
  card: { borderRadius: 18, padding: 14, gap: 10 },
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
