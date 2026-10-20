// Scan du staff (docs/02 « Mode staff (détail) », S-Scan, A-Scan) : caméra ouverte en continu, aucun geste entre
// deux véhicules. Chaque QR est vérifié sur le téléphone (signature Ed25519, liste locale) puis le résultat couvre
// l'écran 1 s, coloré, sonore et vibrant (OK + zone moutarde / déjà entré crème / refusé rouge), et la caméra revient
// seule. Boutons toujours visibles en bas : plaque ou pseudo, express, sans scan, liste, incident, alerte.
// Lot 48 : le code tournant OR2 (secret de la liste, heure d'Orasso) et l'ancien QR OR1 passent tous deux par
// `decideLocal` ; un code périmé est refusé « Code périmé : demande à la personne de rafraîchir son écran ».

import {
  AppBar,
  Button,
  Ground,
  Plate,
  playScanSound,
  ScanResult,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  driveLabels,
  eventDaysLabels,
  formatDayDate,
  localScanDecisionLabels,
  type ScanDecision,
  unverifiedScanLabels,
} from "@orasso/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertSheet } from "@/features/staff/AlertSheet";
import { pointEntry, recordAlert, recordIncident, recordScan } from "@/features/staff/actions";
import { ExpressSheet } from "@/features/staff/ExpressSheet";
import { IncidentSheet } from "@/features/staff/IncidentSheet";
import { clock, pointedResult, resultOf, resultProps, type ShownResult, vibrate } from "@/features/staff/result";
import { SearchSheet } from "@/features/staff/SearchSheet";
import { serverNow } from "@/lib/clock";
import { ed25519Verify } from "@/lib/staff/crypto";
import { counters, decideLocal, ScanGate } from "@/lib/staff/model";
import { clearWriteError, getWriteError, newId, trustedKeysNow } from "@/lib/staff/runtime";
import { useStaffEvent } from "@/lib/staff/useStaff";

const { space2, space3 } = tokens.spacing;

/**
 * Mesures de la recette (les 50 dernières, en ms) : détection → résultat inscrit à l'écran (validation du rendu React),
 * et détection → image suivante (seulement quand la page est visible : le navigateur suspend les images sinon).
 */
const timings: number[] = [];
const commits: number[] = [];

export default function Scan() {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, state } = useStaffEvent(id);
  const superStaff = state?.meta.myRoles.includes("super_staff") ?? false;
  const [permission, requestPermission] = useCameraPermissions();
  const gate = useRef(new ScanGate(3_000));
  const [result, setResult] = useState<ShownResult | null>(null);
  const [last, setLast] = useState<ShownResult | null>(null);
  // `unverified` (relecture du lot 48) : code tournant d'un pass absent de la liste, impossible à vérifier hors ligne.
  type Unknown = { passId: string; payload: string; unverified?: boolean };
  const [unknown, setUnknown] = useState<Unknown | null>(null);
  const unknownRef = useRef<Unknown | null>(null);
  // Lot 26 : QR valable un autre jour (événement sur plusieurs jours) : refusé, ou « Accepter quand même ».
  type OtherDay = { decision: Extract<ScanDecision, { decision: "refused" }>; payload: string };
  const [otherDay, setOtherDay] = useState<OtherDay | null>(null);
  const otherDayRef = useRef<OtherDay | null>(null);
  const [sheet, setSheet] = useState<"search" | "express" | "incident" | "alert" | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);
  // Caméra seulement quand l'écran est au premier plan (pas sous la liste empilée par-dessus).
  const focused = useIsFocused();
  useKeepAwake();
  const latest = useRef({ state, userId });
  latest.current = { state, userId };

  // Quitter l'écran sans répondre au panneau « absent de la liste » : la lecture compte comme refusée.
  useEffect(
    () => () => {
      const pending = unknownRef.current;
      const { state: s, userId: u } = latest.current;
      if (pending && s && u) recordScan(s, u, { decision: "unknown_pass", passId: pending.passId }, pending.payload);
      unknownRef.current = null;
      const day = otherDayRef.current;
      if (day && s && u) recordScan(s, u, day.decision, day.payload);
      otherDayRef.current = null;
    },
    [],
  );

  const show = useCallback((shown: ShownResult) => {
    setResult(shown);
    vibrate(shown.state);
  }, []);

  /** Un QR lu par la caméra (ou injecté en recette). Décision en mémoire, écriture en file ensuite. */
  const handle = useCallback(
    (payload: string) => {
      const detectedAt = performance.now();
      if (!state || !userId) return;
      if (!gate.current.accept(payload, Date.now())) return;
      const decision = decideLocal(state, payload, trustedKeysNow() ?? new Map(), ed25519Verify, serverNow());
      // Un panneau « autre jour » laissé sans réponse compte comme refusé.
      const previousDay = otherDayRef.current;
      if (previousDay) {
        recordScan(state, userId, previousDay.decision, previousDay.payload);
        otherDayRef.current = null;
        setOtherDay(null);
      }
      if (decision.decision === "refused" && decision.reason === "other_day") {
        otherDayRef.current = { decision, payload };
        setOtherDay(otherDayRef.current);
        playScanSound("refused");
        vibrate("refused");
        return;
      }
      if (decision.decision === "unknown_pass" && decision.unverified && !superStaff) {
        // Code tournant non vérifiable : seul le super staff peut l'accepter quand même ; les autres le refusent.
        recordScan(state, userId, decision, payload);
        show({ key: newId(), state: "refused", reason: unverifiedScanLabels.refused, detectedAt });
        return;
      }
      if (decision.decision === "unknown_pass") {
        // Un QR « absent de la liste » laissé sans réponse compte comme refusé.
        const previous = unknownRef.current;
        if (previous)
          recordScan(state, userId, { decision: "unknown_pass", passId: previous.passId }, previous.payload);
        unknownRef.current = { passId: decision.passId, payload, unverified: decision.unverified };
        setUnknown(unknownRef.current);
        playScanSound("refused");
        vibrate("refused");
        return;
      }
      recordScan(state, userId, decision, payload);
      show(resultOf(decision, newId(), detectedAt));
    },
    [state, userId, show, superStaff],
  );

  // Temps entre la détection et le premier rendu du résultat (image suivante).
  useEffect(() => {
    if (!result?.detectedAt) return;
    const start = result.detectedAt;
    commits.push(Math.round(performance.now() - start));
    if (commits.length > 50) commits.shift();
    const frame = requestAnimationFrame(() => {
      const ms = Math.round(performance.now() - start);
      timings.push(ms);
      if (timings.length > 50) timings.shift();
      setLastMs(ms);
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);

  // Recette seulement (pas de caméra dans le navigateur de test) : injection d'une charge utile.
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as {
      __orassoScan?: (p: string) => void;
      __orassoScanTimings?: number[];
      __orassoScanCommits?: number[];
    };
    g.__orassoScan = handle;
    g.__orassoScanTimings = timings;
    g.__orassoScanCommits = commits;
    return () => {
      g.__orassoScan = undefined;
    };
  }, [handle]);

  const resolveUnknown = (accept: boolean) => {
    if (!unknown || !state || !userId) return;
    recordScan(
      state,
      userId,
      {
        decision: accept ? "override" : "unknown_pass",
        passId: unknown.passId,
        // Entrée non vérifiée (code tournant sans secret) : le serveur la rapproche à la synchro.
        ...(accept && unknown.unverified ? { reason: "unverified_otp" } : {}),
      },
      unknown.payload,
    );
    show(
      accept
        ? { key: newId(), state: "ok", time: localScanDecisionLabels.override, pseudo: "Absent de la liste" }
        : { key: newId(), state: "refused", reason: "Absent de la liste : synchronise" },
    );
    unknownRef.current = null;
    setUnknown(null);
  };

  const resolveOtherDay = (accept: boolean) => {
    const pending = otherDayRef.current;
    if (!pending || !state || !userId || !pending.decision.passId) return;
    const entry = state.entries.get(pending.decision.passId);
    if (accept) {
      recordScan(
        state,
        userId,
        { decision: "override", passId: pending.decision.passId, reason: "other_day" },
        pending.payload,
      );
      show(
        entry
          ? pointedResult(entry, newId(), null)
          : { key: newId(), state: "ok", time: localScanDecisionLabels.override },
      );
    } else {
      recordScan(state, userId, pending.decision, pending.payload);
      show(resultOf(pending.decision, newId()));
    }
    otherDayRef.current = null;
    setOtherDay(null);
  };

  const count = state ? counters(state) : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/staff/${id}`));
  const cameraOk = permission?.granted && Platform.OS !== "web";
  const writeError = getWriteError();

  return (
    <Ground animated={false} style={styles.fill}>
      <AppBar
        kind="flow"
        title="Scan accueil"
        facts={state ? `Liste à jour ${clock(state.meta.syncedAt)} · hors ligne OK` : "Liste absente : synchronise"}
        counter={count ? `${count.arrived} / ${count.expected}` : undefined}
        onClose={close}
        closeLabel="Quitter le scan"
        safeTop={insets.top}
      />

      {/* Lot 48 : l'accueil drive (la caméra lit la plaque) en tête de l'écran de scan. */}
      <View style={styles.driveTile}>
        <Button
          variant="rescue"
          icon="vehicle"
          onPress={() => router.push(`/staff/${id}/drive`)}
          fullWidth
          testID="scan-drive-tile"
        >
          {driveLabels.tile}
        </Button>
      </View>

      <View style={[styles.camera, { backgroundColor: c.night, borderRadius: tokens.radius.radiusLg }]}>
        {cameraOk && focused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            // Une feuille ouverte (plaque, express, incident, alerte) : la caméra ne lit plus derrière elle.
            onBarcodeScanned={sheet ? undefined : ({ data }) => handle(data)}
          />
        ) : null}
        {writeError ? (
          <Plate style={styles.unknown}>
            <Text variant="bodyStrong" color={c.plateInk}>
              {writeError}
            </Text>
            <Button variant="plate" icon="check" onPress={clearWriteError}>
              Compris
            </Button>
          </Plate>
        ) : null}
        <View pointerEvents="none" style={styles.aim}>
          <Text variant="label" color={c.nightInk} style={styles.center}>
            {cameraOk
              ? "Caméra ouverte · vise le QR à travers le pare-brise"
              : Platform.OS === "web"
                ? "Pas de caméra dans le navigateur : plaque ou pseudo"
                : "Caméra non autorisée"}
          </Text>
        </View>
        {!cameraOk && Platform.OS !== "web" ? (
          <View style={styles.permission}>
            <Button variant="plate" icon="qr" onPress={() => void requestPermission()}>
              Autoriser la caméra
            </Button>
          </View>
        ) : null}
        {otherDay ? (
          <Plate style={styles.unknown} testID="scan-other-day">
            <Text variant="bodyStrong" color={c.plateInk}>
              {eventDaysLabels.otherDay}
              {otherDay.decision.dayDate ? ` · ${formatDayDate(otherDay.decision.dayDate)}` : ""}
            </Text>
            {otherDay.decision.entry ? (
              <Text variant="meta" color={c.plateMuted}>
                {otherDay.decision.entry.pseudo}
                {otherDay.decision.entry.vehicleLabel ? ` · ${otherDay.decision.entry.vehicleLabel}` : ""}
              </Text>
            ) : null}
            <Text variant="meta" color={c.plateMuted}>
              {eventDaysLabels.otherDayHint}
            </Text>
            <View style={styles.row}>
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                onPress={() => resolveOtherDay(false)}
                style={styles.flex}
              >
                Refuser
              </Button>
              <Button icon="check" onPress={() => resolveOtherDay(true)} style={styles.flex}>
                Accepter quand même
              </Button>
            </View>
          </Plate>
        ) : unknown ? (
          <Plate style={styles.unknown} testID="scan-unknown">
            <Text variant="bodyStrong" color={c.plateInk}>
              {unknown.unverified ? unverifiedScanLabels.title : localScanDecisionLabels.unknown_pass}
            </Text>
            <Text variant="meta" color={c.plateMuted}>
              {unknown.unverified
                ? unverifiedScanLabels.superStaff
                : "QR signé d'Orasso, absent de la liste du téléphone (inscription express d'un collègue ?)."}
            </Text>
            <View style={styles.row}>
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                onPress={() => resolveUnknown(false)}
                style={styles.flex}
              >
                Refuser
              </Button>
              <Button icon="check" onPress={() => resolveUnknown(true)} style={styles.flex}>
                Accepter quand même
              </Button>
            </View>
          </Plate>
        ) : last ? (
          <View style={styles.lastCard}>
            <ScanResult {...resultProps(last)} settled animated={false} sound={false} />
          </View>
        ) : null}
      </View>

      {__DEV__ ? <DevInject onInject={handle} lastMs={lastMs} /> : null}

      <View style={[styles.actions, { paddingBottom: space3 + insets.bottom }]}>
        <View style={styles.row}>
          <Button variant="rescue" height={72} icon="plate" onPress={() => setSheet("search")} style={styles.flex}>
            Plaque ou pseudo
          </Button>
          <Button variant="rescue" height={72} icon="express" onPress={() => setSheet("express")} style={styles.flex}>
            Express
          </Button>
          <Button
            variant="rescue"
            height={72}
            dashed
            icon="skip"
            onPress={() => router.push(`/staff/${id}/liste?rapide=1`)}
            style={styles.flex}
          >
            Sans scan
          </Button>
        </View>
        <View style={styles.row}>
          <Button variant="rescue" icon="list" onPress={() => router.push(`/staff/${id}/liste`)} style={styles.flex}>
            Liste
          </Button>
          <Button variant="rescue" icon="incident" onPress={() => setSheet("incident")} style={styles.flex}>
            Incident
          </Button>
          <Button variant="alert" icon="alert" onPress={() => setSheet("alert")} style={styles.flex}>
            Alerte
          </Button>
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
          show(pointedResult(entry, newId(), already));
        }}
      />
      <ExpressSheet visible={sheet === "express"} eventId={id} userId={userId} onClose={() => setSheet(null)} />
      <IncidentSheet
        visible={sheet === "incident"}
        onClose={() => setSheet(null)}
        onSave={(draft) => {
          if (userId) void recordIncident(id, userId, draft);
          setSheet(null);
        }}
      />
      <AlertSheet
        visible={sheet === "alert"}
        onClose={() => setSheet(null)}
        onSend={(message, position) => {
          if (userId) recordAlert(id, userId, message, position);
          setSheet(null);
        }}
      />
    </Ground>
  );
}

/** Recette (développement seulement) : simule la lecture d'un QR, faute de caméra dans le navigateur. */
function DevInject({ onInject, lastMs }: { onInject: (payload: string) => void; lastMs: number | null }) {
  const [text, setText] = useState("");
  return (
    <View style={styles.dev}>
      <TextField
        label={`Recette · charge utile${lastMs !== null ? ` · dernier résultat en ${lastMs} ms` : ""}`}
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        autoCorrect={false}
        onSubmitEditing={() => onInject(text.trim())}
        style={styles.flex}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  camera: { flex: 1, marginHorizontal: space3, marginTop: space2, overflow: "hidden", justifyContent: "flex-end" },
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
  center: { textAlign: "center" },
  permission: { position: "absolute", top: space3, left: space3, right: space3 },
  unknown: { margin: space2, gap: space2, padding: space3 },
  lastCard: { margin: space2 },
  driveTile: { paddingHorizontal: space3, paddingTop: space2 },
  dev: { flexDirection: "row", paddingHorizontal: space3, paddingTop: space2 },
  actions: { gap: space2, paddingHorizontal: space3, paddingTop: space3 },
  row: { flexDirection: "row", gap: space2 },
});
