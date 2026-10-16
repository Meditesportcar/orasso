// Moi > Sécurité : changer le mot de passe. Les autres appareils sont déconnectés par l'API et une alerte part par
// e-mail (§ 1.1) ; cet appareil reste connecté.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import { api } from "@/lib/api";
import { passwordFormError } from "@/lib/passwordForm";
import { securityErrorMessage } from "@/lib/securityMessages";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";

export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const { adoptToken } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function close() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setDone(false);
    onClose();
  }

  async function submit() {
    const problem = passwordFormError(current, next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await api.changePassword(current, next);
      if (token) await adoptToken(token);
      setDone(true);
    } catch (e) {
      setError(securityErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel="Changer le mot de passe">
      <Text variant="title" color={t.color.ink}>
        Changer le mot de passe
      </Text>
      {done ? (
        <>
          <Text variant="body" color={t.color.ink} testID="password-changed">
            Mot de passe changé. Tes autres appareils sont déconnectés et un e-mail te le confirme.
          </Text>
          <Button variant="plate" icon="check" onPress={close} fullWidth>
            Fermer
          </Button>
        </>
      ) : (
        <>
          <TextField
            label="Mot de passe actuel"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            revealable
            autoCapitalize="none"
            autoComplete="current-password"
          />
          <TextField
            label="Nouveau mot de passe"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            revealable
            autoCapitalize="none"
            autoComplete="new-password"
            help="8 caractères au moins."
          />
          <TextField
            label="Nouveau mot de passe, encore une fois"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            revealable
            autoCapitalize="none"
            autoComplete="new-password"
            onSubmitEditing={() => void submit()}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button variant="secondary" icon="check" loading={busy} onPress={() => void submit()} fullWidth>
            Changer le mot de passe
          </Button>
          <Button variant="plate" icon="back" disabled={busy} onPress={close} fullWidth>
            Annuler
          </Button>
        </>
      )}
    </AppSheet>
  );
}
