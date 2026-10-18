// Alerte du staff (docs/02 : « grand bouton », vers tout le staff présent et l'organisateur) : un message facultatif,
// envoyé tout de suite ou au retour du réseau (file, idempotent). La position (lot 24) est lue au toucher du bouton,
// seulement si le staff a autorisé la localisation « pendant l'utilisation » ; sans elle, l'alerte part quand même.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import type { AlertPosition } from "@/lib/staff/position";
import { currentAlertPosition } from "@/lib/staff/position";
import { AppSheet } from "@/ui/AppSheet";

export function AlertSheet({
  visible,
  onClose,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  onSend: (message: string, position: AlertPosition | null) => void;
}) {
  const { t } = useTheme();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Alerte">
      <Text variant="title" color={t.color.ink}>
        Alerte au staff
      </Text>
      <Text variant="body" color={t.color.ink}>
        Tout le staff présent et l'équipe organisatrice sont prévenus aussitôt, avec ta position si tu l'as autorisée.
        Sans réseau, l'alerte part dès qu'il revient.
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
        loading={busy}
        onPress={async () => {
          setBusy(true);
          // La position est lue maintenant, à ce toucher, et nulle part ailleurs ; trois secondes au plus.
          const position = await currentAlertPosition();
          setBusy(false);
          onSend(message.trim(), position);
          setMessage("");
        }}
      >
        Envoyer l'alerte
      </Button>
    </AppSheet>
  );
}
