// Main courante (docs/02, inventaire « Staff jour J ») : nouvel incident, heure, lieu, description ; enregistré sur
// le téléphone et envoyé au retour du réseau (idempotent). La photo viendra avec l'envoi de fichiers hors ligne.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import { AppSheet } from "@/ui/AppSheet";

export function IncidentSheet({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (incident: { location: string | null; description: string }) => void;
}) {
  const { t } = useTheme();
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
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
      <Button
        icon="incident"
        disabled={!description.trim()}
        fullWidth
        onPress={() => {
          onSave({ location: location.trim() || null, description: description.trim() });
          setLocation("");
          setDescription("");
        }}
      >
        Enregistrer l'incident
      </Button>
    </AppSheet>
  );
}
