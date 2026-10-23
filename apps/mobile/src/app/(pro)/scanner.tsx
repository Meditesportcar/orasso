// Casquette Pro, Scanner (DA v2, lot 54, prototype `s-pscan`) : la caméra en plein cadre sur le QR de compte du client,
// puis le dernier scan en carte (pseudo, grade, remise appliquée) et un historique court. Résultat : pseudo, grade et
// remise du pro pour ce grade, rien d'autre. Le code HOTP de 60 s est vérifié par l'API (réservée aux pros, limitée) ;
// chaque remise lue est comptée dans les statistiques. Ce n'est PAS le QR d'accès tournant du jour J (lot 48) : le
// pointage est réservé aux rôles staff de pointage. Aucun paiement dans l'appli.
import { Button, Credit, Plate, ScanResult, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { proV2Labels } from "@orasso/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { AngledTag } from "@/features/pro/kit";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { type ProScan, proScanOf } from "@/lib/pro";
import { RECETTE } from "@/lib/recette";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

/** Un même QR lu plusieurs fois par la caméra n'est envoyé qu'une fois dans cet intervalle (ms). */
const REPEAT_MS = 4_000;
/** Scans gardés dans l'historique de la séance (le dernier en carte + les précédents). */
const HISTORY = 6;

type OkScan = Extract<ProScan, { state: "ok" }>;

export default function ProScanner() {
  const { t } = useTheme();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const [result, setResult] = useState<ProScan | null>(null);
  const [history, setHistory] = useState<OkScan[]>([]);
  const [busy, setBusy] = useState(false);
  const seen = useRef<{ payload: string; at: number } | null>(null);
  const counter = useRef(0);
  useKeepAwake();

  const handle = useCallback(async (raw: string) => {
    const payload = raw.trim();
    if (!payload) return;
    const last = seen.current;
    if (last && last.payload === payload && Date.now() - last.at < REPEAT_MS) return;
    seen.current = { payload, at: Date.now() };
    setBusy(true);
    const key = `scan-${++counter.current}`;
    try {
      const scan = proScanOf(await api.verifyAccountQr(payload), key);
      setResult(scan);
      if (scan.state === "ok") setHistory((h) => [scan, ...h].slice(0, HISTORY));
    } catch (error) {
      // 403 (pas de fiche publiée), 429 (limite de vérifications) ou réseau : le message de l'API, tel quel.
      setResult({ state: "refused", key, reason: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  // Recette seulement (pas de caméra dans le navigateur de test) : injection d'une charge utile.
  useEffect(() => {
    if (!RECETTE) return;
    const g = globalThis as { __orassoProScan?: (p: string) => void };
    g.__orassoProScan = (payload) => void handle(payload);
    return () => {
      g.__orassoProScan = undefined;
    };
  }, [handle]);

  const pro = myPro.data;
  const cameraOk = permission?.granted && Platform.OS !== "web";
  // Le dernier scan réussi en carte ; les précédents dessous.
  const lastOk = result?.state === "ok" ? result : null;
  const earlier = history.filter((h) => h.key !== lastOk?.key);

  return (
    <TabScreen title={proV2Labels.scannerTitle} facts={proV2Labels.scannerLabel}>
      {!pro && myPro.loading ? null : !pro ? (
        <Notice>
          Tu n'as pas encore de fiche pro. Crée-la sur le site Orasso (menu Professionnels) : le lecteur s'ouvre dès que
          ta fiche est publiée.
        </Notice>
      ) : !pro.published ? (
        <Notice>Publie ta fiche (onglet Ma fiche) pour ouvrir le lecteur : il est réservé aux fiches publiées.</Notice>
      ) : (
        <>
          <View
            style={[styles.camera, { backgroundColor: t.color.night, borderRadius: tokens.radius.radiusLg }]}
            testID="pro-camera"
          >
            {cameraOk && focused ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => void handle(data)}
              />
            ) : null}
            <View pointerEvents="none" style={styles.aim}>
              <View style={[styles.frame, { borderColor: t.color.accent }]} />
            </View>
            <View pointerEvents="none" style={styles.credit}>
              <Credit />
            </View>
            <View pointerEvents="none" style={styles.caption}>
              <Text variant="label" color={t.color.nightInk} style={styles.center}>
                {cameraOk
                  ? "Caméra ouverte · vise le QR de compte du client"
                  : Platform.OS === "web"
                    ? "Pas de caméra dans le navigateur"
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
          </View>

          {result ? (
            <View testID="pro-scan-result" accessibilityLabel={result.state === "ok" ? "Scan valide" : "Scan refusé"}>
              {result.state === "ok" ? (
                // Lot C4b (artefact `s-pscan`) : `.card.p.row`, grade en étiquette inclinée rouge (`.tag.win`).
                <View style={[styles.last, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
                  <Avatar pseudo={result.pseudo} size={40} />
                  <View style={styles.lastText}>
                    <Text variant="bodyStrong" color={t.color.ink}>
                      {proV2Labels.lastScan(result.pseudo)}
                    </Text>
                    <Text variant="caption" color={t.color.inkMuted} testID="pro-scan-discount">
                      {proV2Labels.lastScanDetail(result.grade, result.percent)}
                    </Text>
                  </View>
                  <AngledTag tone="win">{result.grade}</AngledTag>
                </View>
              ) : (
                <ScanResult key={result.key} state="refused" reason={result.reason} animated={false} sound={false} />
              )}
            </View>
          ) : (
            <Muted variant="caption">{proV2Labels.noScanYet}</Muted>
          )}

          {earlier.length ? (
            <>
              <SectionTitle>{proV2Labels.historyTitle}</SectionTitle>
              <Plate style={styles.history} testID="pro-scan-history">
                {earlier.map((h) => (
                  <View key={h.key} style={styles.historyRow}>
                    <Text variant="bodyStrong" color={t.color.plateInk} style={styles.lastText}>
                      {h.pseudo}
                    </Text>
                    <Text variant="caption" color={t.color.plateMuted}>
                      {`${h.grade} · ${h.discount}`}
                    </Text>
                  </View>
                ))}
              </Plate>
            </>
          ) : null}

          {RECETTE ? <DevInject onInject={(p) => void handle(p)} busy={busy} /> : null}
        </>
      )}
    </TabScreen>
  );
}

/** Recette (développement seulement) : simule la lecture d'un QR de compte, faute de caméra dans le navigateur. */
function DevInject({ onInject, busy }: { onInject: (payload: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <View style={styles.dev}>
      <TextField
        label={`Recette · charge utile${busy ? " · vérification…" : ""}`}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => onInject(text)}
        style={styles.flex}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  camera: { width: "100%", aspectRatio: 1, overflow: "hidden", justifyContent: "flex-end" },
  aim: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  // `.qrbox` : 62 %, rayon 20, filet moutarde de 3 px.
  frame: { width: "62%", aspectRatio: 1, borderWidth: 3, borderRadius: 20 },
  credit: { position: "absolute", right: space3, bottom: space3 },
  caption: { padding: space3 },
  center: { textAlign: "center" },
  permission: { position: "absolute", top: space3, left: space3, right: space3 },
  last: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: tokens.spacing.space4,
    borderRadius: tokens.radius.radiusLg,
  },
  lastText: { flex: 1, minWidth: 0, gap: 2 },
  history: { gap: space1, padding: space3 },
  historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  dev: { flexDirection: "row", paddingTop: space2 },
});
