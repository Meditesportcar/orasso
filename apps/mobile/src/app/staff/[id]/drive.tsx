// Accueil drive (lot 48, prototype DA v2 `s-drive`, idée retenue n° 1) : la caméra photographie la voiture toutes les
// 900 ms (basse résolution), ML Kit lit le texte sur l'appareil, la plaque est hachée et retrouvée dans la liste en
// mémoire, sans réseau. Résultat plein écran comme le scan (OK + zone moutarde, déjà entré crème, refusé rouge), pointage
// en file avec la méthode `drive`, puis « Voiture suivante ». Aucune photo gardée (fichier effacé aussitôt lu), aucune
// plaque en clair stockée ni envoyée. Issues de secours en bas : plaque ou pseudo, express, sans scan.
// Web (recette) : la plaque se tape au clavier à la place de la caméra.

import {
  AppBar,
  Button,
  Ground,
  Icon,
  type IconName,
  Plate,
  ScanResult,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { type AccessListEntry, driveLabels as L, scanRefusalLabels } from "@orasso/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { NativeModules, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pointEntry } from "@/features/staff/actions";
import { ExpressSheet } from "@/features/staff/ExpressSheet";
import { clock, pointedResult, resultProps, type ShownResult, vibrate } from "@/features/staff/result";
import { SearchSheet } from "@/features/staff/SearchSheet";
import { serverNow } from "@/lib/clock";
import { recognizeText } from "@/lib/plates/mlkit";
import { type PlateGroup, plateGroups } from "@/lib/plates/recognize";
import { DriveGate, type DriveOutcome, driveOutcome } from "@/lib/staff/drive";
import { counters } from "@/lib/staff/model";
import { deleteLocalPhoto } from "@/lib/staff/photo";
import { newId } from "@/lib/staff/runtime";
import { useStaffEvent } from "@/lib/staff/useStaff";

const { space1, space2, space3 } = tokens.spacing;
/** Une photo toutes les 900 ms quand aucune lecture n'est en cours (docs : résultat en une seconde). */
const EVERY_MS = 900;
/** ML Kit est-il dans ce build ? (Web, Expo Go, ancien APK : non → saisie de la plaque au clavier.) */
const ocrAvailable = () => Platform.OS !== "web" && Boolean(NativeModules.TextRecognition);

/** « GA-662-KS » pour l'affichage de la plaque lue (jamais gardée). */
const shown = (p: string) =>
  /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) ? `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}` : p;

export default function Drive() {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, state } = useStaffEvent(id);
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  useKeepAwake();
  const camera = useRef<CameraView>(null);
  const gate = useRef(new DriveGate());
  const busy = useRef(false);
  const [paused, setPaused] = useState(false);
  const [read, setRead] = useState<string | null>(null);
  const [result, setResult] = useState<ShownResult | null>(null);
  const [last, setLast] = useState<ShownResult | null>(null);
  const [sheet, setSheet] = useState<"search" | "express" | null>(null);
  const [typed, setTyped] = useState("");
  // Deux plaques de participants sur la même photo : le staff choisit (relecture du lot 48).
  const [choice, setChoice] = useState<AccessListEntry[] | null>(null);

  const show = useCallback((r: ShownResult) => {
    setResult(r);
    vibrate(r.state);
  }, []);

  /** Ce que devient une voiture reconnue (ou non) : pointage `drive` en file, résultat à l'écran. */
  const settle = useCallback(
    (outcome: DriveOutcome) => {
      if (!state || !userId) return;
      setPaused(true);
      if (outcome.kind === "ok") {
        const already = pointEntry(state, userId, outcome.entry, "drive");
        show(pointedResult(outcome.entry, newId(), already));
      } else if (outcome.kind === "already") {
        show(pointedResult(outcome.entry, newId(), outcome.checkedInAt));
      } else if (outcome.kind === "refused") {
        const reason =
          outcome.reason === "other_day"
            ? L.otherDay
            : outcome.entry.revokedReason
              ? scanRefusalLabels[outcome.entry.revokedReason]
              : L.revoked;
        show({ key: newId(), state: "refused", reason, pseudo: outcome.entry.pseudo });
      } else if (outcome.kind === "choose") {
        setChoice(outcome.entries);
      } else {
        show({ key: newId(), state: "refused", reason: L.unknown });
      }
    },
    [state, userId, show],
  );

  /** Plaques d'une lecture, de la plus proche à la plus lointaine (caméra, ou clavier : `confirmed`). */
  const onPlates = useCallback(
    (groups: PlateGroup[], confirmed: boolean) => {
      if (!state || paused) return;
      const head = groups[0]?.plates[0];
      if (head) setRead(shown(head));
      const outcome = gate.current.feed(state, groups, serverNow(), confirmed);
      if (outcome) settle(outcome);
    },
    [state, paused, settle],
  );

  const cameraOk = Boolean(permission?.granted) && Platform.OS !== "web";
  const reading = cameraOk && focused && !paused && !sheet && ocrAvailable();

  // La boucle de lecture : une photo basse résolution, lue sur l'appareil puis effacée.
  useEffect(() => {
    if (!reading) return;
    let alive = true;
    const timer = setInterval(async () => {
      if (busy.current || !alive) return;
      busy.current = true;
      let uri: string | undefined;
      try {
        const photo = await camera.current?.takePictureAsync({
          quality: 0.3,
          skipProcessing: true,
          shutterSound: false,
        });
        uri = photo?.uri;
        // Lecture ML Kit du lot 51 (lib/plates/mlkit) : une ligne lue par ligne de texte, jamais deux lignes assemblées.
        const lines = uri ? await recognizeText(uri) : null;
        if (alive && lines) onPlates(plateGroups(lines), false);
      } catch {
        // Photo manquée (caméra occupée) : la suivante part dans 900 ms.
      } finally {
        if (uri) void deleteLocalPhoto(uri);
        busy.current = false;
      }
    }, EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [reading, onPlates]);

  const next = () => {
    gate.current.reset();
    setChoice(null);
    setRead(null);
    setLast(null);
    setPaused(false);
  };

  const count = state ? counters(state) : null;
  const inMemory = state ? [...state.entries.values()].filter((e) => e.status === "valid").length : 0;
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/staff/${id}`));
  const web = Platform.OS === "web";

  return (
    <Ground animated={false} style={styles.fill}>
      <AppBar
        kind="flow"
        title={L.title}
        facts={state ? `Liste à jour ${clock(state.meta.syncedAt)}` : "Liste absente : synchronise"}
        counter={count ? `${count.arrived} entrés` : undefined}
        onClose={close}
        closeLabel="Quitter l'accueil drive"
        safeTop={insets.top}
      />

      {/* Artefact `.offl` : pastille « hors ligne » cerclée de moutarde. */}
      <View style={styles.status}>
        <View style={[styles.offl, { backgroundColor: c.night, borderColor: c.accent }]}>
          <View style={[styles.offlDot, { backgroundColor: c.accent }]} />
          <Text variant="bodyStrong" color={c.nightInk} style={styles.offlText} testID="drive-offline">
            {L.offline(inMemory, count?.arrived ?? 0)}
          </Text>
        </View>
      </View>

      <View style={[styles.camera, { backgroundColor: c.night }]}>
        {cameraOk && focused ? (
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />
        ) : null}
        <View pointerEvents="none" style={styles.aim}>
          {read ? (
            <View style={[styles.read, { backgroundColor: c.poster }]}>
              <Text variant="posterM" color={c.posterInk} testID="drive-read">
                {read}
              </Text>
            </View>
          ) : (
            <Text variant="label" color={c.nightInk} style={styles.center}>
              {web ? L.noCamera : !cameraOk ? "Caméra non autorisée" : ocrAvailable() ? L.aim : L.noOcr}
            </Text>
          )}
        </View>
        {!cameraOk && !web ? (
          <View style={styles.permission}>
            <Button variant="plate" icon="qr" onPress={() => void requestPermission()}>
              Autoriser la caméra
            </Button>
          </View>
        ) : null}
        {choice ? (
          <Plate style={styles.choice} testID="drive-choice">
            <Text variant="bodyStrong" color={c.plateInk}>
              {L.choose}
            </Text>
            {choice.map((entry) => (
              <Button
                key={entry.passId}
                variant="plate"
                icon="vehicle"
                fullWidth
                onPress={() => {
                  if (!state) return;
                  setChoice(null);
                  settle(driveOutcome(state, entry, serverNow()));
                }}
              >
                {[entry.vehicleLabel, entry.pseudo].filter(Boolean).join(" · ")}
              </Button>
            ))}
          </Plate>
        ) : last ? (
          <View style={styles.lastCard}>
            {last.state === "ok" ? (
              <DriveOk result={last} />
            ) : (
              <ScanResult {...resultProps(last)} settled animated={false} sound={false} />
            )}
          </View>
        ) : null}
      </View>

      {web || !ocrAvailable() ? (
        <View style={styles.typed}>
          <TextField
            label={L.typed}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={(e) => {
              // Le texte de l'évènement : l'état `typed` peut ne pas être encore à jour à la validation.
              onPlates(plateGroups([{ text: e.nativeEvent.text ?? typed }]), true);
              setTyped("");
            }}
            testID="drive-typed"
          />
        </View>
      ) : null}

      <View style={[styles.actions, { paddingBottom: space3 + insets.bottom }]}>
        <Button variant="plate" icon="next" onPress={next} fullWidth testID="drive-next">
          {L.next}
        </Button>
        <View style={styles.row}>
          {/* Artefact `.dr-fb` : trois issues de secours en tuiles crème (dans les deux thèmes, comme l'artefact), icône au-dessus. */}
          <RescueTile icon="search" label={L.searchOrPseudo} onPress={() => setSheet("search")} />
          <RescueTile icon="express" label={L.express} onPress={() => setSheet("express")} />
          <RescueTile icon="skip" label={L.noScan} onPress={() => router.push(`/staff/${id}/liste?rapide=1`)} />
        </View>
      </View>

      {result ? (
        <ScanResult
          key={result.key}
          {...resultProps(result)}
          fullscreen
          onReturn={
            // Recette : `__orassoScanHold` garde le résultat affiché le temps d'une capture d'écran.
            __DEV__ && (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold
              ? undefined
              : () => {
                  setLast(result);
                  setResult(null);
                }
          }
        />
      ) : null}

      <SearchSheet
        visible={sheet === "search"}
        state={state ?? null}
        onClose={() => setSheet(null)}
        onPoint={(entry) => {
          if (!state || !userId) return;
          const already = pointEntry(state, userId, entry, "manual");
          setSheet(null);
          setPaused(true);
          show(pointedResult(entry, newId(), already));
        }}
      />
      <ExpressSheet visible={sheet === "express"} eventId={id} userId={userId} onClose={() => setSheet(null)} />
    </Ground>
  );
}

/**
 * Dernier pointage réussi (artefact `.dr-res`) : carte moutarde lumineuse, « Retenue · zone », la zone en chiffres
 * étroits de 64 px, le pseudo et le véhicule à droite, l'heure du pointage (le drive pointe seul : pas de bouton).
 */
function DriveOk({ result }: { result: ShownResult }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.ok, { backgroundColor: c.accent, boxShadow: `0 0 34px ${c.accent}8c` }]}
      testID="drive-result-ok"
    >
      <Text variant="label" color={c.accentInk}>
        {L.resultKicker}
      </Text>
      <View style={styles.okRow}>
        <Text variant="numberNarrow" color={c.accentInk} style={styles.okZone} numberOfLines={1}>
          {result.zone ?? "—"}
        </Text>
        <View style={styles.okWho}>
          {result.pseudo ? (
            <Text variant="bodyStrong" color={c.accentInk} style={styles.right}>
              {result.pseudo}
            </Text>
          ) : null}
          {result.vehicle ? (
            <Text variant="body" color={c.accentInk} style={styles.right}>
              {result.vehicle}
            </Text>
          ) : null}
        </View>
      </View>
      {result.time ? (
        <Text variant="caption" color={c.accentInk}>
          {L.resultPointed(result.time)}
        </Text>
      ) : null}
    </View>
  );
}

/** Une issue de secours du drive (`.dr-fb button`). */
function RescueTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, { backgroundColor: t.color.nightInk, opacity: pressed ? 0.85 : 1 }]}
    >
      <Icon name={icon} size={26} color={t.color.night} />
      <Text variant="button" color={t.color.night} style={styles.tileText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  status: { paddingHorizontal: space3, paddingTop: space2, flexDirection: "row" },
  offl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  ok: { borderRadius: 22, padding: 16, gap: 6 },
  okRow: { flexDirection: "row", alignItems: "flex-end", gap: space2 },
  okZone: { fontSize: 64, lineHeight: 64, fontWeight: "800", flexShrink: 1 },
  okWho: { flex: 1, alignItems: "flex-end" },
  right: { textAlign: "right" },
  offlDot: { width: 8, height: 8, borderRadius: 4 },
  offlText: { fontSize: 12, flexShrink: 1 },
  tile: {
    flex: 1,
    minHeight: 72,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: space1,
  },
  tileText: { fontSize: 11, textAlign: "center", textTransform: "uppercase" },
  // Artefact `.cam` : rayon 22.
  camera: {
    flex: 1,
    marginHorizontal: space3,
    marginTop: space2,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderRadius: 22,
  },
  aim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: space3,
  },
  read: { paddingHorizontal: space3, paddingVertical: space2, borderRadius: tokens.radius.radiusMd },
  center: { textAlign: "center" },
  permission: { position: "absolute", top: space3, left: space3, right: space3 },
  lastCard: { margin: space2 },
  choice: { margin: space2, gap: space2, padding: space3 },
  typed: { paddingHorizontal: space3, paddingTop: space2 },
  actions: { gap: space2, paddingHorizontal: space3, paddingTop: space3 },
  row: { flexDirection: "row", gap: space2 },
});
