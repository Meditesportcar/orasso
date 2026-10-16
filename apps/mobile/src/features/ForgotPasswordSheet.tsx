// Écran d'auth, « Mot de passe oublié » : on saisit l'adresse, Better Auth envoie le lien (valable une heure) ; la
// suite se fait sur le site (`/reinitialisation`). Le message est le même que l'adresse ait un compte ou non.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

export function ForgotPasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  function close() {
    setSent(false);
    setError(null);
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      // Une erreur d'adresse inconnue ne doit rien révéler : seuls le réseau et la limite d'essais se disent.
      if (e instanceof ApiRequestError && (e.isNetwork || e.status === 429)) setError(errorMessage(e));
      else setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel="Mot de passe oublié">
      <Text variant="title" color={t.color.ink}>
        Mot de passe oublié
      </Text>
      {sent ? (
        <>
          <Text variant="body" color={t.color.ink} testID="reset-sent">
            Un e-mail t'a été envoyé : si un compte existe avec cette adresse, il contient un lien valable une heure.
            Ouvre-le pour choisir un nouveau mot de passe, puis reviens te connecter ici.
          </Text>
          <Button variant="plate" icon="check" onPress={close} fullWidth>
            Fermer
          </Button>
        </>
      ) : (
        <>
          <Text variant="body" color={t.color.ink}>
            Saisis l'adresse e-mail de ton compte : on t'envoie un lien pour choisir un nouveau mot de passe.
          </Text>
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            inputMode="email"
            onSubmitEditing={() => valid && !busy && void submit()}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant="secondary"
            icon="inbox"
            loading={busy}
            disabled={!valid}
            onPress={() => void submit()}
            fullWidth
          >
            Envoyer le lien
          </Button>
          <Button variant="plate" icon="back" disabled={busy} onPress={close} fullWidth>
            Annuler
          </Button>
        </>
      )}
    </AppSheet>
  );
}
