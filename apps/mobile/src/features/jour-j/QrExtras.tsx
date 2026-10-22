// Autour du QR tournant (lot 48, prototype `s-qr`) : blocage des captures sur cet écran seulement, la note qui le dit,
// « Comment ça marche sans réseau » (repliable), et l'itinéraire en un geste (Maps, Waze, Sur la carte).
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";

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

/** Bouton `.gps` de l'artefact : encadré, 46 px, rayon 12, capitales 12 px. */
function Gps({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => [styles.gps, { borderColor: c.line, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
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
}: {
  destination: Destination;
  onMap: () => void;
  /** `false` : Maps et Waze éteints (pas de coordonnées sûres : un nom de ville mènerait au mauvais endroit). */
  routes?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.grow}>
        <Gps icon="place" label="Maps" disabled={!routes} onPress={() => void Linking.openURL(mapsUrl(destination))} />
      </View>
      <View style={styles.grow}>
        <Gps icon="place" label="Waze" disabled={!routes} onPress={() => void Linking.openURL(wazeUrl(destination))} />
      </View>
      <View style={styles.wide}>
        <Gps icon="explore" label="Sur la carte" onPress={onMap} />
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
