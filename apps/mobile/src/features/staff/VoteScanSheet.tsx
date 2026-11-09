// « Ajouter par QR » (lot R7l2, maquette R7.16 `vl_qr`) : la file d'un concours passe, l'organisateur scanne le QR de chaque
// voiture avec la caméra du téléphone, elles deviennent candidates du vote « à la main ». Réutilise la caméra du scan du
// staff (`expo-camera`, mêmes réglages) mais ne vérifie rien lui-même : le QR part tel quel à l'API
// (`POST /events/:id/votes/:voteId/candidates { qr }`) qui vérifie la signature, l'événement et l'entrée. Le scan ne vaut
// pas entrée : une voiture pas encore entrée est refusée (« Pas encore entrée : scanne-la à l'entrée d'abord »).
// Dans le navigateur (recette), pas de caméra : un champ « charge utile » et `__orassoVoteScan(payload)`.
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { voteOrgaLabels as L } from "@orasso/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { ApiRequestError, errorMessage } from "@/lib/http";
import { RECETTE } from "@/lib/recette";
import { AppSheet } from "@/ui/AppSheet";
import { plateText } from "@/ui/plateText";

const { space2, space3 } = tokens.spacing;

/** Ce que l'écran répond à un QR : la voiture ajoutée (et le total des candidats), ou le refus de l'API. */
export type VoteScanOutcome = { label: string; count: number };

/** Le message d'un refus de l'API, avec les mots de la maquette pour « pas encore entrée » et les QR invalides. */
export function voteScanRefusal(error: unknown): string {
  if (error instanceof ApiRequestError) return L.scanRefusals[error.code] ?? errorMessage(error);
  return errorMessage(error);
}

export function VoteScanSheet({
  visible,
  voteTitle,
  count,
  onScan,
  onClose,
}: {
  visible: boolean;
  voteTitle: string;
  /** Candidats déjà choisis (« Terminé · 5 voitures »). */
  count: number;
  /** Envoie le QR à l'API ; rend la voiture ajoutée, ou lève l'erreur de l'API. */
  onScan: (payload: string) => Promise<VoteScanOutcome>;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraOk = Platform.OS !== "web" && permission?.granted === true;
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const seen = useRef<{ payload: string; at: number } | null>(null);
  const busy = useRef(false);
  const handler = useRef(onScan);
  handler.current = onScan;

  const handle = useCallback(async (raw: string) => {
    const payload = raw.trim();
    if (!payload || busy.current) return;
    // Une même lecture n'est renvoyée qu'après 3 s (la caméra relit le code en continu).
    const now = Date.now();
    if (seen.current && seen.current.payload === payload && now - seen.current.at < 3_000) return;
    seen.current = { payload, at: now };
    busy.current = true;
    try {
      const outcome = await handler.current(payload);
      setLast({ ok: true, text: L.scanAdded(outcome.label, outcome.count) });
    } catch (err) {
      setLast({ ok: false, text: voteScanRefusal(err) });
    } finally {
      busy.current = false;
    }
  }, []);

  // Recette : injecte une lecture sans caméra (réservé aux builds de recette, jamais à l'APK).
  useEffect(() => {
    if (!RECETTE || !visible) return;
    const g = globalThis as { __orassoVoteScan?: (p: string) => Promise<void> };
    g.__orassoVoteScan = handle;
    return () => {
      g.__orassoVoteScan = undefined;
    };
  }, [visible, handle]);

  useEffect(() => {
    if (!visible) {
      setLast(null);
      seen.current = null;
    }
  }, [visible]);

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.scanTitle} maxHeight={0.92}>
      <Text variant="title" color={c.ink}>
        {L.scanTitle}
      </Text>
      <Text variant="meta" color={c.inkMuted}>
        {voteTitle}
      </Text>
      <View style={[styles.camera, { backgroundColor: c.night, borderRadius: tokens.radius.radiusLg }]}>
        {cameraOk && visible ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => void handle(data)}
          />
        ) : null}
        <View pointerEvents="none" style={styles.aim}>
          <Text variant="label" color={c.nightInk} style={styles.center}>
            {cameraOk ? L.scanAim : Platform.OS === "web" ? L.scanNoCamera : L.scanCameraOff}
          </Text>
        </View>
        {!cameraOk && Platform.OS !== "web" ? (
          <View style={styles.permission}>
            <Button variant="plate" icon="qr" onPress={() => void requestPermission()}>
              {L.scanAllow}
            </Button>
          </View>
        ) : null}
      </View>
      {RECETTE ? <PayloadField onSubmit={(p) => void handle(p)} /> : null}
      {last ? (
        <Plate style={styles.result} testID={last.ok ? "vote-scan-ok" : "vote-scan-refused"}>
          <Text variant="bodyStrong" color={last.ok ? c.plateInk : plateText.alert}>
            {last.text}
          </Text>
        </Plate>
      ) : null}
      <Text variant="caption" color={c.inkMuted}>
        {L.scanNote}
      </Text>
      <Button icon="check" onPress={onClose} fullWidth testID="vote-scan-done">
        {L.scanDone(count)}
      </Button>
    </AppSheet>
  );
}

function PayloadField({ onSubmit }: { onSubmit: (payload: string) => void }) {
  const [text, setText] = useState("");
  return (
    <TextField
      label={L.scanPayload}
      value={text}
      onChangeText={setText}
      autoCapitalize="characters"
      autoCorrect={false}
      onSubmitEditing={() => {
        onSubmit(text);
        setText("");
      }}
      testID="vote-scan-payload"
    />
  );
}

const styles = StyleSheet.create({
  camera: { height: 260, overflow: "hidden", justifyContent: "flex-end" },
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
  result: { padding: space3, marginTop: space2 },
});
