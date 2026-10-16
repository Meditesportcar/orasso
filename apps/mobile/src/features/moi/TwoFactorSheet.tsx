// Moi > Sécurité : double authentification par application (TOTP). Activer = mot de passe, puis QR (ou clé à saisir),
// codes de secours affichés **une seule fois**, puis premier code pour confirmer. Compte déjà protégé : nouveaux
// codes de secours ou désactivation (mot de passe demandé). Les clés d'accès se gèrent sur le site (S2).
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { securityErrorMessage } from "@/lib/securityMessages";
import { useSession } from "@/lib/session";
import { totpSecretOf } from "@/lib/totp";
import { AppSheet } from "@/ui/AppSheet";
import { QrCode } from "@/ui/QrCode";
import { PasskeyOnlyNotice } from "./PasskeyOnlyNotice";

const { space2, space3 } = tokens.spacing;

type Step =
  | { name: "menu" }
  | { name: "password"; goal: "enable" | "codes" | "disable" }
  | { name: "scan"; uri: string; codes: string[] }
  | { name: "codes"; codes: string[]; title: string }
  | { name: "done"; text: string };

export function TwoFactorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const { me, refreshMe, adoptToken } = useSession();
  const enabled = Boolean(me?.user.twoFactorEnabled);
  const [step, setStep] = useState<Step>({ name: "menu" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setStep({ name: "menu" });
    setPassword("");
    setCode("");
    setError(null);
    onClose();
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(securityErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const submitPassword = (goal: "enable" | "codes" | "disable") =>
    run(async () => {
      if (goal === "enable") {
        const result = await api.enableTwoFactor(password);
        setStep({ name: "scan", uri: result.totpURI, codes: result.backupCodes });
      } else if (goal === "codes") {
        const result = await api.regenerateBackupCodes(password);
        setStep({ name: "codes", codes: result.backupCodes, title: "Nouveaux codes de secours" });
      } else {
        const token = await api.disableTwoFactor(password);
        if (token) await adoptToken(token);
        await refreshMe();
        setStep({ name: "done", text: "Double authentification désactivée. Un e-mail te le confirme." });
      }
      setPassword("");
    });

  const confirmCode = () =>
    run(async () => {
      const token = await api.verifyTotp(code);
      if (token) await adoptToken(token);
      await refreshMe();
      setCode("");
      setStep({ name: "done", text: "Double authentification activée. Elle te sera demandée à chaque connexion." });
    });

  if (me?.twoFactorHint === "passkey_sign_in") {
    return (
      <AppSheet visible={visible} onClose={close} accessibilityLabel="Double authentification">
        <Text variant="title" color={t.color.ink}>
          Double authentification
        </Text>
        <PasskeyOnlyNotice onClose={close} />
      </AppSheet>
    );
  }

  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel="Double authentification" maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        Double authentification
      </Text>

      {step.name === "menu" ? (
        <>
          <Text variant="body" color={t.color.ink}>
            {enabled
              ? "Elle est activée : à chaque connexion, Orasso te demande le code de ton application d'authentification."
              : "Elle protège ton compte avec un code à 6 chiffres qui change toutes les 30 secondes. Obligatoire pour organiser des événements."}
          </Text>
          {enabled ? (
            <>
              <Button
                variant="plate"
                icon="list"
                onPress={() => setStep({ name: "password", goal: "codes" })}
                fullWidth
              >
                Nouveaux codes de secours
              </Button>
              <Button
                variant="alert"
                icon="close"
                onPress={() => setStep({ name: "password", goal: "disable" })}
                fullWidth
              >
                Désactiver
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              icon="qr"
              onPress={() => setStep({ name: "password", goal: "enable" })}
              fullWidth
            >
              Activer la double authentification
            </Button>
          )}
          <Button variant="plate" icon="back" onPress={close} fullWidth>
            Fermer
          </Button>
        </>
      ) : null}

      {step.name === "password" ? (
        <>
          <Text variant="body" color={t.color.ink}>
            {step.goal === "enable"
              ? "Pour commencer, confirme ton mot de passe."
              : step.goal === "codes"
                ? "Confirme ton mot de passe : les anciens codes de secours ne serviront plus."
                : "Confirme ton mot de passe pour désactiver la double authentification."}
          </Text>
          <TextField
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            revealable
            autoCapitalize="none"
            autoComplete="current-password"
            onSubmitEditing={() => password && void submitPassword(step.goal)}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant={step.goal === "disable" ? "alert" : "secondary"}
            icon={step.goal === "disable" ? "close" : "check"}
            loading={busy}
            disabled={!password}
            onPress={() => void submitPassword(step.goal)}
            fullWidth
          >
            Continuer
          </Button>
          <Button
            variant="plate"
            icon="back"
            disabled={busy}
            onPress={() => {
              setStep({ name: "menu" });
              setPassword("");
              setError(null);
            }}
            fullWidth
          >
            Retour
          </Button>
        </>
      ) : null}

      {step.name === "scan" ? (
        <>
          <Text variant="body" color={t.color.ink}>
            1. Scanne ce QR avec ton application d'authentification (ou saisis la clé à la main).
          </Text>
          <View style={styles.qr}>
            <QrCode value={step.uri} size={200} label="QR de la double authentification" />
          </View>
          <Plate kind="note" style={styles.keyBox}>
            <Text variant="label" color={t.color.plateMuted}>
              Clé à saisir
            </Text>
            <Text variant="bodyStrong" color={t.color.plateInk} selectable testID="totp-secret">
              {totpSecretOf(step.uri)}
            </Text>
          </Plate>
          <Button
            variant="plate"
            icon="export"
            onPress={() => void Linking.openURL(step.uri).catch(() => undefined)}
            fullWidth
          >
            Ouvrir dans mon application
          </Button>
          <Text variant="body" color={t.color.ink}>
            2. Note tes codes de secours : chacun sert une fois si tu perds ton téléphone. Ils ne seront plus affichés.
          </Text>
          <BackupCodes codes={step.codes} />
          <Text variant="body" color={t.color.ink}>
            3. Saisis le code à 6 chiffres affiché par l'application pour terminer.
          </Text>
          <TextField
            label="Code à 6 chiffres"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={7}
            onSubmitEditing={() => /^\d{6}$/.test(code.replace(/\s+/g, "")) && void confirmCode()}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant="secondary"
            icon="check"
            loading={busy}
            disabled={!/^\d{6}$/.test(code.replace(/\s+/g, ""))}
            onPress={() => void confirmCode()}
            fullWidth
          >
            Activer
          </Button>
        </>
      ) : null}

      {step.name === "codes" ? (
        <>
          <Text variant="body" color={t.color.ink}>
            {step.title}. Chacun ne sert qu'une fois ; ils ne seront plus affichés.
          </Text>
          <BackupCodes codes={step.codes} />
          <Button variant="plate" icon="check" onPress={close} fullWidth>
            J'ai noté mes codes
          </Button>
        </>
      ) : null}

      {step.name === "done" ? (
        <>
          <Text variant="body" color={t.color.ink} testID="two-factor-done">
            {step.text}
          </Text>
          <Button variant="plate" icon="check" onPress={close} fullWidth>
            Fermer
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const { t } = useTheme();
  return (
    <Plate style={styles.codes} testID="backup-codes">
      {codes.map((c) => (
        <Text key={c} variant="bodyStrong" color={t.color.plateInk} selectable>
          {c}
        </Text>
      ))}
    </Plate>
  );
}

const styles = StyleSheet.create({
  qr: { alignItems: "center" },
  keyBox: { gap: space2 },
  codes: { gap: space2, padding: space3 },
});
