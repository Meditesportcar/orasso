// « Qui es-tu ? » (prototype `s-nom`) : pseudo public ; prénom et nom obligatoires et privés ; e-mail, mot de passe,
// conditions générales. Crée le compte (`POST /api/auth/sign-up/email`) puis ouvre le tuto (lot 42).
import { Button, CheckboxField, Icon, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { arriveeLabels, expressLabels, namePrivacy, passwordHint, pseudoHint } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { FlowScreen } from "@/features/arrivee/FlowScreen";
import { arriveeStore, identityReady, useArrivee } from "@/features/arrivee/model";
import { pseudoRule, usePseudoCheck } from "@/features/arrivee/usePseudoCheck";
import { authErrorMessage } from "@/lib/http";
import { kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

export default function ArriveeIdentite() {
  const { t } = useTheme();
  const router = useRouter();
  const { signUp } = useSession();
  const { profile: chosen, departments, identity } = useArrivee();
  const profile = chosen ?? "exhibitor";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pseudoState = usePseudoCheck(identity.pseudo);
  const set = (patch: Partial<typeof identity>) => arriveeStore.set({ identity: { ...identity, ...patch } });

  const pseudoHelp =
    pseudoState === "checking"
      ? "Vérification…"
      : pseudoState === "free"
        ? "Ce pseudo est libre."
        : pseudoHint[profile];
  const pseudoError =
    pseudoState === "taken" ? "Ce pseudo est déjà pris." : pseudoState === "invalid" ? pseudoRule : undefined;
  const ready = identityReady(identity, pseudoState === "free" || pseudoState === "idle") && departments.length > 0;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signUp({
        email: identity.email.trim(),
        password: identity.password,
        pseudo: identity.pseudo,
        mainProfile: profile,
        departments,
        firstName: identity.firstName,
        lastName: identity.lastName,
      });
      await kvSet("onboarded", "1");
      arriveeStore.set({ identity: { ...identity, password: "" } });
      router.replace("/arrivee/tuto");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      step={2}
      onBack={() => router.back()}
      footer={
        <Button variant="primary" icon="next" fullWidth loading={busy} disabled={!ready} onPress={() => void submit()}>
          {arriveeLabels.identity.submit}
        </Button>
      }
    >
      <View style={styles.head}>
        <Text variant="posterL" color={t.color.ink}>
          {arriveeLabels.identity.title}
        </Text>
        <Muted variant="body">{arriveeLabels.identity.text}</Muted>
      </View>
      <Plate style={styles.plate}>
        <TextField
          label={arriveeLabels.identity.pseudo}
          value={identity.pseudo}
          onChangeText={(pseudo) => set({ pseudo })}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          help={pseudoHelp}
          error={pseudoError}
          maxLength={24}
        />
        <View style={styles.names}>
          <TextField
            style={styles.name}
            label={arriveeLabels.identity.firstName}
            value={identity.firstName}
            onChangeText={(firstName) => set({ firstName })}
            autoComplete="given-name"
            autoCorrect={false}
            maxLength={60}
          />
          <TextField
            style={styles.name}
            label={arriveeLabels.identity.lastName}
            value={identity.lastName}
            onChangeText={(lastName) => set({ lastName })}
            autoComplete="family-name"
            autoCorrect={false}
            maxLength={60}
          />
        </View>
        <View style={styles.privacy} testID="name-privacy">
          <Icon name="profile" size={20} color={t.color.plateMuted} />
          <View style={styles.privacyText}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {arriveeLabels.identity.privacyTitle}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {`${arriveeLabels.identity.privacyShared} ${namePrivacy[profile]} ${arriveeLabels.identity.privacyEnd}`}
            </Text>
          </View>
        </View>
        <TextField
          label={arriveeLabels.identity.email}
          value={identity.email}
          onChangeText={(email) => set({ email })}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          inputMode="email"
        />
        <TextField
          label={arriveeLabels.identity.password}
          value={identity.password}
          onChangeText={(password) => set({ password })}
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoComplete="new-password"
          help={passwordHint}
        />
        <CheckboxField label={expressLabels.terms} checked={identity.terms} onChange={(terms) => set({ terms })} />
        <Button
          variant="plate"
          icon="next"
          onPress={() => void Linking.openURL(siteUrl("/conditions")).catch(() => undefined)}
        >
          {expressLabels.termsLink}
        </Button>
        {error ? (
          <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Plate>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space2 },
  plate: { gap: space3, padding: 16 },
  names: { flexDirection: "row", gap: space2 },
  name: { flex: 1 },
  privacy: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
  privacyText: { flex: 1, gap: 2 },
});
