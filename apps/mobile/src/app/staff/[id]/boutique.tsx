// Boutique du mode staff (lot 24, docs/01 « rôle boutique », contenu proposé et à confirmer : AS4) : contrôle des
// billets du public avec la même boucle caméra que le scan d'accueil (QR de billet `OB1`, vérifié sur le téléphone,
// « Billet OK » / « Déjà utilisé » / « Refusé »), et compteur d'entrées des visiteurs (+1, +10, −1). Tout marche sans
// réseau : la liste des billets est sur le téléphone, chaque geste entre dans la file (idempotente) et part au retour
// du réseau ; le serveur arbitre (un billet ne passe qu'une fois, le total est la somme de tous les téléphones).
import { Button, Ground, Plate, ScanResult, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { shopLabels } from "@orasso/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertSheet } from "@/features/staff/AlertSheet";
import { recordAlert, recordIncident, recordTicketScan, recordVisitor } from "@/features/staff/actions";
import { IncidentSheet } from "@/features/staff/IncidentSheet";
import { clock, resultProps, type ShownResult, ticketResultOf, vibrate } from "@/features/staff/result";
import { RECETTE } from "@/lib/recette";
import { ed25519Verify } from "@/lib/staff/crypto";
import { decideTicketLocal, ScanGate, shopAccess, visitorTotals } from "@/lib/staff/model";
import { clearWriteError, getWriteError, newId, trustedKeysNow } from "@/lib/staff/runtime";
import { useStaffActions, useStaffEvent } from "@/lib/staff/useStaff";
import { FicheHeader } from "@/ui/FicheHeader";

const { space2, space3 } = tokens.spacing;

export default function Boutique() {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, state } = useStaffEvent(id);
  const actions = useStaffActions(userId, id);
  const [permission, requestPermission] = useCameraPermissions();
  const gate = useRef(new ScanGate(3_000));
  const [result, setResult] = useState<ShownResult | null>(null);
  const [last, setLast] = useState<ShownResult | null>(null);
  const [sheet, setSheet] = useState<"alert" | "incident" | null>(null);
  const focused = useIsFocused();
  useKeepAwake();

  const access = shopAccess(state?.meta);
  const totals = visitorTotals(actions);
  const tickets = state ? [...state.tickets.values()] : [];
  const checked = tickets.filter((x) => x.status === "used" || state?.ticketUses.has(x.ticketId)).length;

  const show = useCallback((shown: ShownResult) => {
    setResult(shown);
    vibrate(shown.state);
  }, []);

  /** Un QR lu par la caméra (ou injecté en recette) : décision en mémoire, écriture en file ensuite. */
  const handle = useCallback(
    (payload: string) => {
      const detectedAt = performance.now();
      if (!state || !userId || access !== "ok") return;
      if (!gate.current.accept(payload, Date.now())) return;
      const decision = decideTicketLocal(state, payload, trustedKeysNow() ?? new Map(), ed25519Verify);
      recordTicketScan(state, userId, decision, payload);
      show(ticketResultOf(decision, newId(), detectedAt));
    },
    [state, userId, access, show],
  );

  // Recette seulement (pas de caméra dans le navigateur de test) : injection d'une charge utile.
  useEffect(() => {
    if (!RECETTE) return;
    const g = globalThis as { __orassoTicketScan?: (p: string) => void };
    g.__orassoTicketScan = handle;
    return () => {
      g.__orassoTicketScan = undefined;
    };
  }, [handle]);

  const count = (delta: 1 | 10 | -1) => {
    if (state && userId && access === "ok") recordVisitor(state, userId, delta);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/staff/${id}`));
  const cameraOk = permission?.granted && Platform.OS !== "web";
  const writeError = getWriteError();
  const blocked =
    access === "no_role"
      ? shopLabels.noRole
      : access === "disabled"
        ? shopLabels.disabled
        : state === null
          ? shopLabels.noList
          : null;

  return (
    <Ground animated={false} style={styles.fill}>
      <FicheHeader
        title={shopLabels.title}
        facts={
          state
            ? `Liste à jour ${clock(state.meta.syncedAt)} · hors ligne OK`
            : "Liste absente : synchronise depuis l'écran du mode staff"
        }
        counter={tickets.length > 0 ? `${checked} / ${tickets.length}` : undefined}
        onClose={close}
        closeLabel="Quitter l'entrée visiteurs"
      />

      <View style={[styles.camera, { backgroundColor: c.night, borderRadius: tokens.radius.radiusLg }]}>
        {cameraOk && focused && access === "ok" ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            // Une feuille ouverte (alerte, incident) : la caméra ne lit plus derrière elle.
            onBarcodeScanned={sheet ? undefined : ({ data }) => handle(data)}
          />
        ) : null}
        {writeError ? (
          <Plate style={styles.notice}>
            <Text variant="bodyStrong" color={c.plateInk}>
              {writeError}
            </Text>
            <Button variant="plate" icon="check" onPress={clearWriteError}>
              Compris
            </Button>
          </Plate>
        ) : null}
        {blocked ? (
          <Plate style={styles.notice}>
            <Text variant="bodyStrong" color={c.plateInk}>
              {blocked}
            </Text>
          </Plate>
        ) : (
          <View pointerEvents="none" style={styles.aim}>
            <Text variant="label" color={c.nightInk} style={styles.center}>
              {cameraOk
                ? `${shopLabels.scanTitle} · ${shopLabels.scanHint}`
                : Platform.OS === "web"
                  ? "Pas de caméra dans le navigateur"
                  : "Caméra non autorisée"}
            </Text>
          </View>
        )}
        {!cameraOk && Platform.OS !== "web" && access === "ok" ? (
          <View style={styles.permission}>
            <Button variant="plate" icon="qr" onPress={() => void requestPermission()}>
              Autoriser la caméra
            </Button>
          </View>
        ) : null}
        {last && !blocked ? (
          <View style={styles.lastCard}>
            <ScanResult {...resultProps(last)} settled animated={false} sound={false} />
          </View>
        ) : null}
      </View>

      {RECETTE ? <DevInject onInject={handle} /> : null}

      <View style={[styles.actions, { paddingBottom: space3 + insets.bottom }]}>
        <Plate style={styles.counter} testID="visitor-counter">
          <Text variant="label" color={c.plateMuted}>
            {shopLabels.visitors}
          </Text>
          <Text variant="title" color={c.plateInk} testID="visitor-total">
            {totals.local}
          </Text>
          <Text variant="meta" color={c.plateMuted}>
            {shopLabels.visitorsLocal}
            {totals.server !== null ? ` · ${shopLabels.visitorsServer} : ${totals.server}` : ""}
            {totals.pending !== 0 ? " · à envoyer" : ""}
          </Text>
        </Plate>
        <View style={styles.row}>
          <Button
            icon="add"
            onPress={() => count(1)}
            disabled={access !== "ok"}
            style={styles.tallFlex}
            testID="visitor-plus-1"
          >
            +1
          </Button>
          <Button
            variant="rescue"
            height={72}
            icon="add"
            onPress={() => count(10)}
            disabled={access !== "ok"}
            style={styles.flex}
            testID="visitor-plus-10"
          >
            +10
          </Button>
          <Button
            variant="plate"
            tone="dashed"
            icon="close"
            onPress={() => count(-1)}
            disabled={access !== "ok" || totals.local === 0}
            style={styles.tallFlex}
            testID="visitor-minus-1"
          >
            −1
          </Button>
        </View>
        {/* Toujours accessibles en bas (docs/02) : main courante et alerte. */}
        <View style={styles.row}>
          <Button variant="rescue" icon="incident" onPress={() => setSheet("incident")} style={styles.flex}>
            Main courante
          </Button>
          <Button variant="alert" icon="alert" onPress={() => setSheet("alert")} style={styles.flex}>
            Alerte
          </Button>
        </View>
      </View>

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

      {result ? (
        <ScanResult
          key={result.key}
          {...resultProps(result)}
          fullscreen
          onReturn={
            RECETTE && (globalThis as { __orassoScanHold?: boolean }).__orassoScanHold
              ? undefined
              : () => {
                  setLast(result);
                  setResult(null);
                }
          }
        />
      ) : null}
    </Ground>
  );
}

/** Recette (développement seulement) : simule la lecture d'un QR de billet, faute de caméra dans le navigateur. */
function DevInject({ onInject }: { onInject: (payload: string) => void }) {
  const [text, setText] = useState("");
  return (
    <View style={styles.dev}>
      <TextField
        label="Recette · charge utile du billet"
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        autoCorrect={false}
        onSubmitEditing={() => onInject(text.trim())}
        style={styles.flex}
        testID="ticket-inject"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  // Gros boutons, touchables d'un pouce ganté en plein soleil.
  tallFlex: { flex: 1, minHeight: 72 },
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
  notice: { margin: space2, gap: space2, padding: space3 },
  lastCard: { margin: space2 },
  dev: { flexDirection: "row", paddingHorizontal: space3, paddingTop: space2 },
  actions: { gap: space2, paddingHorizontal: space3, paddingTop: space3 },
  counter: { gap: 2, padding: space3 },
  row: { flexDirection: "row", gap: space2 },
});
