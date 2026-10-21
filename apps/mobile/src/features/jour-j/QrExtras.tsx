// Autour du QR tournant (lot 48, prototype `s-qr`) : blocage des captures sur cet écran seulement, la note qui le dit,
// « Comment ça marche sans réseau » (repliable), et l'itinéraire en un geste (Maps, Waze, Sur la carte).
import { Button, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

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
    <View style={styles.lock} testID="qr-capture-note">
      <Icon name="eyeOff" size={22} color={t.color.ink} />
      <Text variant="caption" color={t.color.ink} style={styles.grow}>
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
    <Plate style={styles.block}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.summary}
        testID="qr-how"
      >
        <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
          Comment ça marche sans réseau
        </Text>
        <Icon name={open ? "up" : "down"} size={18} color={c.plateInk} />
      </Pressable>
      {open
        ? HOW.map((line, i) => (
            <View key={line} style={styles.step}>
              <Text variant="bodyStrong" color={c.plateMuted}>
                {i + 1}.
              </Text>
              <Text variant="body" color={c.plateInk} style={styles.grow}>
                {line}
              </Text>
            </View>
          ))
        : null}
    </Plate>
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

/** Maps, Waze, Sur la carte (la fiche de l'événement et sa carte). */
export function GpsRow({ destination, onMap }: { destination: Destination; onMap: () => void }) {
  return (
    <View style={styles.row}>
      <Button
        variant="rescue"
        icon="place"
        onPress={() => void Linking.openURL(mapsUrl(destination))}
        style={styles.grow}
      >
        Maps
      </Button>
      <Button
        variant="rescue"
        icon="place"
        onPress={() => void Linking.openURL(wazeUrl(destination))}
        style={styles.grow}
      >
        Waze
      </Button>
      <Button variant="rescue" icon="explore" onPress={onMap} style={styles.grow}>
        Sur la carte
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  lock: { flexDirection: "row", gap: space2, alignItems: "center", paddingHorizontal: space1 },
  block: { gap: space2, padding: space3 },
  summary: { flexDirection: "row", alignItems: "center", gap: space2, minHeight: 32 },
  step: { flexDirection: "row", gap: space2 },
  row: { flexDirection: "row", gap: space2 },
});
