// Casquette Pro, Scanner (onglet par défaut, docs/02) : lecteur du QR de compte du client. Résultat : pseudo, grade et
// remise du pro pour ce grade, rien d'autre. Le code HOTP de 60 s est vérifié par l'API (réservée aux pros, limitée) ;
// chaque remise lue est comptée dans les statistiques. Aucun paiement dans l'appli.
import { Button, Plate, ScanResult, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { type ProScan, proScanOf } from "@/lib/pro";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

/** Un même QR lu plusieurs fois par la caméra n'est envoyé qu'une fois dans cet intervalle (ms). */
const REPEAT_MS = 4_000;

export default function ProScanner() {
  const { t } = useTheme();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const [result, setResult] = useState<ProScan | null>(null);
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
      setResult(proScanOf(await api.verifyAccountQr(payload), key));
    } catch (error) {
      // 403 (pas de fiche publiée), 429 (limite de vérifications) ou réseau : le message de l'API, tel quel.
      setResult({ state: "refused", key, reason: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  // Recette seulement (pas de caméra dans le navigateur de test) : injection d'une charge utile.
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as { __orassoProScan?: (p: string) => void };
    g.__orassoProScan = (payload) => void handle(payload);
    return () => {
      g.__orassoProScan = undefined;
    };
  }, [handle]);

  const pro = myPro.data;
  const cameraOk = permission?.granted && Platform.OS !== "web";

  return (
    <TabScreen title="Scanner" facts="QR de compte du client">
      {!pro && myPro.loading ? null : !pro ? (
        <Notice>
          Tu n'as pas encore de fiche pro. Crée-la sur le site Orasso (menu Professionnels) : le lecteur s'ouvre dès que
          ta fiche est publiée.
        </Notice>
      ) : !pro.published ? (
        <Notice>Publie ta fiche (onglet Fiche) pour ouvrir le lecteur : il est réservé aux fiches publiées.</Notice>
      ) : (
        <>
          <View style={[styles.camera, { backgroundColor: t.color.night, borderRadius: tokens.radius.radiusLg }]}>
            {cameraOk && focused ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => void handle(data)}
              />
            ) : null}
            <View pointerEvents="none" style={styles.aim}>
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
                <>
                  <ScanResult
                    key={result.key}
                    state="ok"
                    pseudo={result.pseudo}
                    vehicle={`${result.grade} · ${result.discount}`}
                    animated={false}
                    sound={false}
                  />
                  <Plate style={styles.discount}>
                    <Text variant="label" color={t.color.plateMuted}>
                      Remise à appliquer
                    </Text>
                    <Text variant="posterL" color={t.color.plateInk} testID="pro-scan-discount">
                      {result.discount}
                    </Text>
                  </Plate>
                </>
              ) : (
                <ScanResult key={result.key} state="refused" reason={result.reason} animated={false} sound={false} />
              )}
            </View>
          ) : (
            <Muted variant="caption">
              Le client ouvre son QR de compte (onglet Garage). Il change toutes les minutes : une capture prêtée
              expire.
            </Muted>
          )}

          {__DEV__ ? <DevInject onInject={(p) => void handle(p)} busy={busy} /> : null}
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
  discount: { gap: space2, padding: space3, marginTop: space2 },
  dev: { flexDirection: "row", paddingTop: space2 },
});
