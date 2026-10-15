// Alerte du staff (docs/02 : « grand bouton », vers tout le staff présent et l'organisateur) : un message facultatif,
// envoyé tout de suite ou au retour du réseau (file, idempotent). La position viendra avec la géolocalisation.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import { AppSheet } from "@/ui/AppSheet";

export function AlertSheet({
  visible,
  onClose,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
}) {
  const { t } = useTheme();
  const [message, setMessage] = useState("");
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Alerte">
      <Text variant="title" color={t.color.ink}>
        Alerte au staff
      </Text>
      <Text variant="body" color={t.color.ink}>
        Tout le staff présent et l'organisateur sont prévenus aussitôt. Sans réseau, l'alerte part dès qu'il revient.
      </Text>
      <TextField
        label="Ce qui se passe (facultatif)"
        value={message}
        onChangeText={setMessage}
        maxLength={300}
        placeholder="Entrée A, besoin de renfort"
      />
      <Button
        variant="alert"
        icon="alert"
        fullWidth
        onPress={() => {
          onSend(message.trim());
          setMessage("");
        }}
      >
        Envoyer l'alerte
      </Button>
    </AppSheet>
  );
}
