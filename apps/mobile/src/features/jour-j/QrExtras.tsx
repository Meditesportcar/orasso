// Autour du QR tournant (lot 48, prototype `s-qr`) : blocage des captures sur cet écran seulement, la note qui le dit,
// « Comment ça marche sans réseau » (repliable), et l'itinéraire en un geste (Maps, Waze, Sur la carte).
// Lot M4 (maquette 5.1, retour 26) : luminosité au maximum tant que le QR est à l'écran (`useMaxBrightness`), « ? » à
// côté de « Hors ligne » (`OfflineLine`), bandeau des captures seulement lors d'une tentative (`CaptureBanner`),
// Maps et Waze plus discrets et seulement à l'approche (`GpsRow`, `directions`).
import { Button, Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useIsFocused } from "expo-router";
import { addScreenshotListener, allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { type BrightnessApi, createBrightnessController, createBrightnessHolders } from "./brightness";

const { space2, space3 } = tokens.spacing;

const CAPTURE_KEY = "jour-j-qr";

/**
 * Captures et enregistrement d'écran bloqués tant que l'écran du QR est ouvert (Android : FLAG_SECURE ; iOS : écran
 * masqué à l'enregistrement). Rien sur le web (recette) : le module n'y existe pas.
 */
export function useBlockCapture(active: boolean, key = CAPTURE_KEY) {
  useEffect(() => {
    if (!active || Platform.OS === "web") return;
    preventScreenCaptureAsync(key).catch(() => undefined);
    return () => {
      allowScreenCaptureAsync(key).catch(() => undefined);
    };
  }, [active, key]);
}

/**
 * `expo-brightness`, importé à la demande (tour 2, relecture Opus) : un binaire sans le module natif (ancien APK) ne
 * plante pas l'écran du QR, la luminosité reste simplement celle du téléphone.
 */
let brightnessModule: Promise<BrightnessApi | null> | null = null;
function loadBrightness(): Promise<BrightnessApi | null> {
  brightnessModule ??= import("expo-brightness")
    .then(
      (B): BrightnessApi => ({
        get: () => B.getBrightnessAsync(),
        set: (value) => B.setBrightnessAsync(value),
        restoreSystem: Platform.OS === "android" ? () => B.restoreSystemBrightnessAsync() : undefined,
      }),
    )
    .catch(() => null);
  return brightnessModule;
}

/**
 * Lot M4 : luminosité de l'écran au maximum tant que le QR est à l'écran **et** que l'écran a le focus **et** que
 * l'appli est active (tour 2 : « Sur la carte » ou une autre route la rend, l'arrière-plan aussi). Android : seule la
 * fenêtre de l'appli change (aucune permission), puis elle suit de nouveau le réglage du téléphone ; iPhone : la
 * valeur d'avant est remise. Ordre et annulation des opérations : `brightness.ts`. Rien sur le web.
 */
/** Tour 2 : une seule file et une seule valeur d'avant pour toute l'appli (deux écrans QR empilés). */
let brightnessHolders: ReturnType<typeof createBrightnessHolders> | null = null;
function holdBrightness(id: symbol, on: boolean) {
  if (Platform.OS === "web") return;
  brightnessHolders ??= createBrightnessHolders(createBrightnessController(loadBrightness));
  void brightnessHolders.hold(id, on);
}

export function useMaxBrightness(active: boolean) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => sub.remove();
  }, []);
  const id = useRef(Symbol("qr")).current;
  const wanted = active && focused && appActive;
  useEffect(() => {
    holdBrightness(id, wanted);
  }, [id, wanted]);
  useEffect(() => () => holdBrightness(id, false), [id]);
}

/** Lot M4 : durée du bandeau des captures (celle des bandeaux d'annonce, retour 25). */
const BANNER_MS = 4000;

/**
 * Lot M4 : le pavé « captures bloquées » n'est plus affiché d'office ; un bandeau le dit, en haut, seulement quand la
 * personne tente une capture (Android 14 et plus, iPhone ; aucune permission demandée).
 */
export function CaptureBanner({ active, text }: { active: boolean; text?: string }) {
  const { t } = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active || Platform.OS === "web") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sub: { remove: () => void } | null = null;
    try {
      sub = addScreenshotListener(() => {
        setShown(true);
        clearTimeout(timer);
        timer = setTimeout(() => setShown(false), BANNER_MS);
      });
    } catch {
      sub = null;
    }
    return () => {
      clearTimeout(timer);
      sub?.remove();
    };
  }, [active]);
  if (!shown) return null;
  return (
    <Pressable
      onPress={() => setShown(false)}
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: t.color.surfaceRaised, boxShadow: t.shadow.shadowCard }]}
      testID="qr-capture-banner"
    >
      <Icon name="eyeOff" size={20} color={t.color.accent} />
      <Text variant="caption" color={t.color.ink} style={[styles.grow, styles.lockText]}>
        {text ?? CAPTURE_BANNER}
      </Text>
    </Pressable>
  );
}

/**
 * Relecture du lot 48 : sur iPhone, seul l'enregistrement d'écran est masqué (la capture reste possible, iOS ne permet
 * pas de la bloquer) ; un code reste valable au plus une minute (créneau de 20 s, ±1 créneau de tolérance).
 */
const CAPTURE_TEXT =
  Platform.OS === "ios"
    ? "Enregistrement d'écran masqué sur cet écran. Une capture ou une photo du code est périmée en moins d'une minute."
    : "Captures et enregistrement d'écran bloqués sur cet écran. Une photo du code est périmée en moins d'une minute.";

/** Lot 59c : QR de compte (retour de Damien sur l'APK d'essai) ; il se redessine toutes les 60 s. */
export const ACCOUNT_CAPTURE_TEXT =
  Platform.OS === "ios"
    ? "Enregistrement d'écran masqué sur cet écran. Une capture du code est périmée en une à deux minutes."
    : "Captures et enregistrement d'écran bloqués sur cet écran. Une photo du code est périmée en une à deux minutes.";

/** Lot M4 : le bandeau d'une tentative de capture sur Mon QR. */
const CAPTURE_BANNER =
  Platform.OS === "ios"
    ? "Enregistrement d'écran masqué ici. Une capture du code est périmée en moins d'une minute."
    : "Captures bloquées sur cet écran : une photo du code est périmée en moins d'une minute.";

export function CaptureNote({ text = CAPTURE_TEXT }: { text?: string }) {
  const { t } = useTheme();
  return (
    <View style={[styles.lock, { backgroundColor: t.color.surfaceSunken }]} testID="qr-capture-note">
      <Icon name="eyeOff" size={22} color={t.color.accent} />
      <Text variant="caption" color={t.color.ink} style={[styles.grow, styles.lockText]}>
        {text}
      </Text>
    </View>
  );
}

const HOW = [
  "Ton téléphone a reçu une clé à la validation de ta place.",
  "Il fabrique un nouveau code toutes les 20 secondes, signé avec cette clé et l'heure.",
  "Le téléphone du staff vérifie la signature et l'heure, sans réseau.",
  "Un code copié ou filmé ne passe plus après moins d'une minute.",
];

/**
 * Lot M4 (maquette 5.1) : « Hors ligne : tout est déjà sur ton téléphone » et son « ? », qui ouvre l'explication
 * (`.qpop`) sous la ligne ; « Compris » la referme.
 */
export function OfflineLine({ text }: { text: string }) {
  const { t } = useTheme();
  const c = t.color;
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.offline}>
      <View style={styles.offlineRow}>
        <Text variant="caption" color={c.inkMuted} style={styles.offlineText}>
          {text}
        </Text>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel="Comment ça marche sans réseau"
          accessibilityState={{ expanded: open }}
          hitSlop={12}
          style={styles.help}
          testID="qr-offline-help"
        >
          <Icon name="help" size={18} color={c.accent} />
        </Pressable>
      </View>
      {open ? (
        <View
          style={[styles.pop, { backgroundColor: c.surfaceRaised, boxShadow: t.shadow.shadowCard }]}
          testID="qr-offline-pop"
        >
          <Text variant="bodyStrong" color={c.ink} style={styles.summaryText}>
            Comment ça marche sans réseau
          </Text>
          {HOW.map((line, i) => (
            <View key={line} style={styles.step}>
              <Text variant="caption" color={c.inkMuted}>
                {i + 1}.
              </Text>
              <Text variant="caption" color={c.inkMuted} style={styles.grow}>
                {line}
              </Text>
            </View>
          ))}
          <View style={styles.popAction}>
            <Button variant="plate" icon="check" onPress={() => setOpen(false)}>
              Compris
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function HowItWorks() {
  const { t } = useTheme();
  const c = t.color;
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.block, { backgroundColor: t.color.surfaceSunken }]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.summary}
        testID="qr-how"
      >
        <Text variant="bodyStrong" color={c.ink} style={[styles.grow, styles.summaryText]}>
          Comment ça marche sans réseau
        </Text>
        <Icon name={open ? "up" : "down"} size={18} color={c.ink} />
      </Pressable>
      {open
        ? HOW.map((line, i) => (
            <View key={line} style={styles.step}>
              <Text variant="caption" color={c.inkMuted}>
                {i + 1}.
              </Text>
              <Text variant="caption" color={c.inkMuted} style={styles.grow}>
                {line}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

export type Destination = {
  title: string;
  lat: number | null;
  lng: number | null;
  address: string;
};

function mapsUrl(d: Destination): string {
  const where = d.lat !== null && d.lng !== null ? `${d.lat},${d.lng}` : d.address;
  if (Platform.OS === "ios") return `maps:?daddr=${encodeURIComponent(where)}`;
  if (Platform.OS === "android") return `geo:0,0?q=${encodeURIComponent(where)}(${encodeURIComponent(d.title)})`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`;
}

function wazeUrl(d: Destination): string {
  return d.lat !== null && d.lng !== null
    ? `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(d.address)}&navigate=yes`;
}

/** Bouton `.gps` de l'artefact : encadré, 46 px, rayon 12, capitales 12 px ; `discreet` (Mon QR, maquette 5.1) : 40 px. */
function Gps({
  icon,
  label,
  onPress,
  disabled = false,
  discreet = false,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  discreet?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const rest = discreet ? 0.85 : 1;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.gps,
        discreet && styles.gpsDiscreet,
        { borderColor: c.line, opacity: disabled ? 0.4 : pressed ? 0.8 : rest },
      ]}
    >
      <Icon name={icon} size={16} color={c.ink} />
      <Text variant="meta" color={c.ink} style={styles.gpsText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Maps, Waze, Sur la carte (`.gpsrow` : 1fr 1fr 1,25fr ; aucun libellé coupé, D34). */
export function GpsRow({
  destination,
  onMap,
  routes = true,
  directions = true,
  discreet = false,
}: {
  destination: Destination;
  onMap: () => void;
  /** `false` : Maps et Waze éteints (pas de coordonnées sûres : un nom de ville mènerait au mauvais endroit). */
  routes?: boolean;
  /** Lot M4 : `false` loin de l'événement (avant la veille) : ni Maps ni Waze, « Sur la carte » seulement. */
  directions?: boolean;
  /** Lot M4 : boutons plus discrets (Mon QR). */
  discreet?: boolean;
}) {
  return (
    <View style={styles.row}>
      {directions ? (
        <>
          <View style={styles.grow}>
            <Gps
              icon="place"
              label="Maps"
              disabled={!routes}
              discreet={discreet}
              testID="gps-maps"
              onPress={() => void Linking.openURL(mapsUrl(destination))}
            />
          </View>
          <View style={styles.grow}>
            <Gps
              icon="place"
              label="Waze"
              disabled={!routes}
              discreet={discreet}
              testID="gps-waze"
              onPress={() => void Linking.openURL(wazeUrl(destination))}
            />
          </View>
        </>
      ) : null}
      <View style={directions ? styles.wide : styles.grow}>
        <Gps icon="explore" label="Sur la carte" discreet={discreet} testID="gps-map" onPress={onMap} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // `.qr-lock`, `.qr-how` : encarts de rayon 14, padding 12 × 14.
  lock: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: space3,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  lockText: { fontSize: 13.5, lineHeight: 18 },
  summaryText: { fontSize: 14, fontWeight: "800" },
  wide: { flex: 1.25 },
  gpsDiscreet: { height: 40 },
  banner: {
    position: "absolute",
    top: space2,
    left: space3,
    right: space3,
    zIndex: 20,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: space3,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  offline: { gap: space2, marginTop: -space2 },
  offlineRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  offlineText: { flexShrink: 1 },
  help: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  // `.qpop` : rayon 16, padding 14.
  pop: { gap: space2, padding: 14, borderRadius: 16 },
  popAction: { alignItems: "flex-start" },
  gps: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  // Étroite (et non 110 % comme l'artefact) : « Sur la carte » tient entier à 390 px (D34, aucun libellé coupé).
  gpsText: { fontSize: 12, lineHeight: 15, fontWeight: "800", textAlign: "center" },
  block: { gap: space2, paddingVertical: space3, paddingHorizontal: 14, borderRadius: 14 },
  summary: { flexDirection: "row", alignItems: "center", gap: space2, minHeight: 32 },
  step: { flexDirection: "row", gap: space2 },
  row: { flexDirection: "row", gap: space2 },
});
