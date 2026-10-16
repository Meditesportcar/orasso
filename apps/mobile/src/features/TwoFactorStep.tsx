// Deuxième étape de la connexion quand la double authentification est activée (lot 15) : code à 6 chiffres de
// l'application d'authentification, ou code de secours. Un seul bouton principal ; la session ouverte ainsi prouve
// la double authentification (espace organisateur, mode staff de l'organisateur).
import { Button, CheckboxField, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { authErrorMessage } from "@/lib/http";

const { space3 } = tokens.spacing;

export function TwoFactorStep({
  onVerify,
  onCancel,
}: {
  onVerify: (code: string, opts: { backup: boolean; trustDevice: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTheme();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = code.replace(/\s+/g, "");
  const ready = backup ? clean.length >= 6 : /^\d{6}$/.test(clean);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await onVerify(clean, { backup, trustDevice });
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Plate style={styles.plate} testID="two-factor-step">
      <Text variant="title" color={t.color.plateInk}>
        Double authentification
      </Text>
      <Text variant="body" color={t.color.plateInk}>
        {backup
          ? "Saisis l'un des codes de secours reçus à l'activation (chacun ne sert qu'une fois)."
          : "Saisis le code à 6 chiffres affiché par ton application d'authentification."}
      </Text>
      <TextField
        label={backup ? "Code de secours" : "Code à 6 chiffres"}
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={backup ? "default" : "number-pad"}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={backup ? 20 : 7}
        onSubmitEditing={() => ready && !busy && void submit()}
      />
      <CheckboxField
        label="Faire confiance à cet appareil pendant 30 jours (le code ne sera plus demandé ici)."
        checked={trustDevice}
        onChange={setTrustDevice}
      />
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button variant="primary" icon="check" loading={busy} disabled={!ready} onPress={() => void submit()} fullWidth>
          Valider
        </Button>
        <Button
          variant="plate"
          icon={backup ? "qr" : "list"}
          onPress={() => {
            setBackup(!backup);
            setCode("");
            setError(null);
          }}
          fullWidth
        >
          {backup ? "Utiliser le code de l'application" : "Utiliser un code de secours"}
        </Button>
        <Button variant="plate" icon="back" onPress={onCancel} fullWidth>
          Revenir à la connexion
        </Button>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  plate: { gap: space3, padding: 16 },
  actions: { gap: 8, marginTop: 4 },
});
