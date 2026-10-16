// Inscription express (docs/02, parcours 3) : le staff saisit l'e-mail de la personne sans compte, l'API lui envoie
// le lien du formulaire de 2 minutes. Le lien est aussi rendu ici en QR, à scanner avec son téléphone si l'e-mail
// tarde. Sans réponse en 4,5 s (réseau absent ou saturé) : la demande est mise en file et part au retour du réseau.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { record } from "@/lib/staff/runtime";
import { AppSheet } from "@/ui/AppSheet";
import { QrCode } from "@/ui/QrCode";

type Sent = { email: string; url: string | null };

export function ExpressSheet({
  visible,
  eventId,
  userId,
  onClose,
}: {
  visible: boolean;
  eventId: string;
  userId: string | null;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function send() {
    if (!userId) return;
    const target = email.trim().toLowerCase();
    setBusy(true);
    setError(null);
    try {
      const r = await api.expressInvite(eventId, target);
      setSent({ email: r.email, url: r.url });
    } catch (e) {
      if (e instanceof ApiRequestError && e.isNetwork) {
        await record(eventId, userId, "express", { email: target });
        setSent({ email: target, url: null });
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setSent(null);
    setEmail("");
    setError(null);
    onClose();
  };

  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel="Inscription express" maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        Express · sans compte
      </Text>
      {sent ? (
        <>
          <Text variant="body" color={t.color.ink}>
            {sent.url
              ? `Lien envoyé à ${sent.email}. Il crée son compte et son véhicule en 2 minutes, puis présente son QR. Il peut aussi scanner ce code :`
              : `Pas de réponse du réseau : la demande pour ${sent.email} est gardée et partira dès qu'il revient.`}
          </Text>
          {sent.url ? (
            <View style={styles.qr}>
              <QrCode value={sent.url} size={220} label="Lien d'inscription express" />
            </View>
          ) : null}
          <Button variant="secondary" icon="check" onPress={close} fullWidth>
            Terminé
          </Button>
        </>
      ) : (
        <>
          <Text variant="body" color={t.color.ink}>
            L'e-mail de la personne : elle reçoit un lien valable 24 h, son véhicule est accepté directement.
          </Text>
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            onSubmitEditing={() => valid && void send()}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button icon="express" loading={busy} disabled={!valid} onPress={() => void send()} fullWidth>
            Envoyer le lien
          </Button>
        </>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  qr: { alignSelf: "center" },
});
