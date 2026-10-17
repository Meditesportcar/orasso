// Main courante (docs/02, inventaire « Staff jour J ») : nouvel incident, heure, lieu, description, photo (lot 24) ;
// enregistré sur le téléphone et envoyé au retour du réseau (idempotent). La photo reste sur le téléphone jusqu'à
// l'envoi de l'incident, puis part à son tour.
import { Button, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { type KeptPhoto, takeIncidentPhoto } from "@/lib/staff/photo";
import { AppSheet } from "@/ui/AppSheet";

const { space2 } = tokens.spacing;

export type IncidentDraft = { location: string | null; description: string; photoUri: string | null };

export function IncidentSheet({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (incident: IncidentDraft) => void;
}) {
  const { t } = useTheme();
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<KeptPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: "camera" | "library") {
    setError(null);
    try {
      const kept = await takeIncidentPhoto(source);
      if (kept) setPhoto(kept);
      else if (source === "camera") setError("Appareil photo non autorisé ou photo annulée.");
    } catch {
      setError("Photo impossible. Tu peux enregistrer l'incident sans photo.");
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Main courante">
      <Text variant="title" color={t.color.ink}>
        Main courante · nouvel incident
      </Text>
      <TextField label="Lieu" value={location} onChangeText={setLocation} maxLength={200} placeholder="Entrée A" />
      <TextField
        label="Ce qui s'est passé"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={4000}
        style={{ minHeight: 96 }}
      />
      {photo ? (
        <View style={styles.photoRow}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.photo}
            accessibilityLabel="Photo de l'incident"
            testID="incident-photo-preview"
          />
          <Button variant="plate" tone="dashed" icon="close" onPress={() => setPhoto(null)}>
            Retirer la photo
          </Button>
        </View>
      ) : (
        <View style={styles.photoRow}>
          <Button variant="plate" icon="plate" onPress={() => void pick("camera")} testID="incident-photo-camera">
            Prendre une photo
          </Button>
          <Button variant="plate" icon="add" onPress={() => void pick("library")} testID="incident-photo-library">
            Photothèque
          </Button>
        </View>
      )}
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        icon="incident"
        disabled={!description.trim()}
        fullWidth
        onPress={() => {
          onSave({ location: location.trim() || null, description: description.trim(), photoUri: photo?.uri ?? null });
          setLocation("");
          setDescription("");
          setPhoto(null);
          setError(null);
        }}
      >
        Enregistrer l'incident
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: "row", gap: space2, alignItems: "center", flexWrap: "wrap" },
  photo: { width: 96, height: 96, borderRadius: tokens.radius.radiusMd },
});
