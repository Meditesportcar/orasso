// « Qui es-tu ? » (lot C3, artefact `s-nom`) : pseudo public ; prénom et nom côte à côte, obligatoires et privés ;
// l'encart crème « Ton nom et ton prénom sont privés » (`.privacy`, cadenas sur carré moutarde). L'artefact s'arrête là ;
// l'e-mail, le mot de passe et les conditions, nécessaires à la création du compte, suivent avec les mêmes champs.
// Crée le compte (`POST /api/auth/sign-up/email`) puis ouvre le tuto.
import { Button, CheckboxField, TextField } from "@orasso/design-system/native";
import { arriveeLabels, expressLabels, namePrivacy, passwordHint, pseudoHint } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { ArriveeScreen, ObHead } from "@/features/arrivee/ArriveeScreen";
import { arriveeStore, identityReady, useArrivee } from "@/features/arrivee/model";
import { pseudoRule, usePseudoCheck } from "@/features/arrivee/usePseudoCheck";
import { T, useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";
import { authErrorMessage } from "@/lib/http";
import { kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";

export default function ArriveeIdentite() {
  const a = useArt();
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
    <ArriveeScreen
      step={2}
      onClose={() => router.back()}
      footer={
        <Button variant="primary" icon="next" fullWidth loading={busy} disabled={!ready} onPress={() => void submit()}>
          {arriveeLabels.identity.submit}
        </Button>
      }
    >
      <ObHead title={arriveeLabels.identity.title} text={arriveeLabels.identity.text} />
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
      <View style={[styles.privacy, { backgroundColor: a.poster }]} testID="name-privacy">
        <View style={[styles.pi, { backgroundColor: a.accent }]}>
          <ArtIcon name="lock" size={24} color={a.accentInk} />
        </View>
        <View style={styles.privacyText}>
          <T k="b" size={15} lh={19} color={a.posterInk}>
            {arriveeLabels.identity.privacyTitle}
          </T>
          <T k="body" size={13.5} lh={19.5} color={a.posterMuted}>
            {`${arriveeLabels.identity.privacyShared} ${namePrivacy[profile]} ${arriveeLabels.identity.privacyEnd}`}
          </T>
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
      <Pressable
        onPress={() => void Linking.openURL(siteUrl("/conditions")).catch(() => undefined)}
        accessibilityRole="link"
        style={styles.link}
      >
        <ArtIcon name="chr" size={16} color={a.ink} />
        <T k="btn" size={12} lh={14} color={a.ink}>
          {expressLabels.termsLink}
        </T>
      </Pressable>
      {error ? (
        <T k="cap" color={a.win} accessibilityRole="alert">
          {error}
        </T>
      ) : null}
    </ArriveeScreen>
  );
}

const styles = StyleSheet.create({
  names: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  name: { flex: 1 },
  privacy: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 18 },
  pi: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  privacyText: { flex: 1, gap: 4 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 6,
    alignSelf: "flex-start",
  },
});
