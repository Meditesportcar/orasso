// Moi : bandeau « Vérifie ton e-mail » tant que l'adresse n'est pas confirmée (la connexion n'est jamais bloquée, S1 :
// une adresse non vérifiée prive seulement du parrainage et de la newsletter). « Renvoyer » : 3 par heure.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";

const { space2, space3 } = tokens.spacing;

export function EmailBanner() {
  const { t } = useTheme();
  const { me, refreshMe } = useSession();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me || me.user.emailVerified) return null;

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await api.resendVerification();
      setSent(true);
      void refreshMe();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Plate kind="note" style={styles.box} testID="email-banner">
      <Text variant="bodyStrong" color={t.color.plateInk}>
        Vérifie ton e-mail
      </Text>
      <Text variant="body" color={t.color.plateMuted}>
        {sent
          ? `Un e-mail vient de partir vers ${me.user.email}. Ouvre le lien qu'il contient.`
          : `Confirme ${me.user.email} pour recevoir le parrainage et la newsletter. Ton compte fonctionne déjà normalement.`}
      </Text>
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button variant="plate" icon="next" loading={busy} onPress={() => void resend()} fullWidth>
        {sent ? "Renvoyer encore" : "Renvoyer"}
      </Button>
    </Plate>
  );
}

const styles = StyleSheet.create({
  box: { gap: space2, padding: space3 },
});
