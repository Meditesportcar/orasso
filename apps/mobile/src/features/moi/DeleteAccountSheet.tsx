// Moi > Supprimer mon compte (exigé par les stores) : conséquences, mot de passe, code de double authentification si elle
// est activée, case de confirmation, bouton rouge. L'API anonymise le compte (S5) ; l'appli efface ensuite tout ce qui
// est sur l'appareil et revient à l'écran de connexion.
import { Button, CheckboxField, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useState } from "react";

import { api } from "@/lib/api";
import { securityErrorMessage } from "@/lib/securityMessages";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";
import { PasskeyOnlyNotice } from "./PasskeyOnlyNotice";

/** Ce que la suppression change, en clair (le même texte que sur le site). */
export const DELETE_CONSEQUENCES =
  "Ton pseudo, ton adresse, tes coordonnées, tes véhicules et leurs photos sont effacés. L'historique des événements reste chez les organisateurs, au nom de « Compte supprimé ». C'est définitif.";

export function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const { me, signOut } = useSession();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const twoFactor = Boolean(me?.user.twoFactorEnabled);
  const ready = sure && password.length > 0 && (!twoFactor || code.trim().length >= 6);

  function close() {
    setPassword("");
    setCode("");
    setSure(false);
    setError(null);
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount({ password, totpCode: twoFactor ? code.replace(/\s+/g, "") : null });
      // Le compte n'a plus de session : on efface le jeton, le profil et les données de l'appareil.
      await signOut();
      onClose();
      router.replace("/auth");
    } catch (e) {
      setError(securityErrorMessage(e));
      setBusy(false);
    }
  }

  if (me?.twoFactorHint === "passkey_sign_in") {
    return (
      <AppSheet visible={visible} onClose={close} accessibilityLabel="Supprimer mon compte">
        <Text variant="title" color={t.color.ink}>
          Supprimer mon compte
        </Text>
        <PasskeyOnlyNotice onClose={close} />
      </AppSheet>
    );
  }

  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel="Supprimer mon compte" maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        Supprimer mon compte
      </Text>
      <Text variant="body" color={t.color.ink}>
        {DELETE_CONSEQUENCES}
      </Text>
      <TextField
        label="Ton mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        revealable
        autoCapitalize="none"
        autoComplete="current-password"
      />
      {twoFactor ? (
        <TextField
          label="Code de ton application d'authentification (ou code de secours)"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="one-time-code"
          maxLength={20}
        />
      ) : null}
      <CheckboxField label="Je comprends que la suppression est définitive." checked={sure} onChange={setSure} />
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert" testID="delete-error">
          {error}
        </Text>
      ) : null}
      <Button variant="alert" icon="close" loading={busy} disabled={!ready} onPress={() => void submit()} fullWidth>
        Supprimer mon compte
      </Button>
      <Button variant="plate" icon="back" disabled={busy} onPress={close} fullWidth>
        Garder mon compte
      </Button>
    </AppSheet>
  );
}
