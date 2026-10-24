// « Qui es-tu ? » (lot C3, artefact `s-nom`) : pseudo public ; prénom et nom côte à côte, obligatoires et privés ;
// l'encart crème « Ton nom et ton prénom sont privés » (`.privacy`, cadenas sur carré moutarde). L'artefact s'arrête là ;
// l'e-mail, le mot de passe et les conditions, nécessaires à la création du compte, suivent avec les mêmes champs.
// Crée le compte (`POST /api/auth/sign-up/email`) puis ouvre le tuto.
import { Button, CheckboxField, TextField } from "@orasso/design-system/native";
import { arriveeLabels, EMAIL_MAX_LENGTH, expressLabels, namePrivacy, passwordHint, pseudoHint } from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { ArriveeScreen, ObHead } from "@/features/arrivee/ArriveeScreen";
import { MissingLine } from "@/features/arrivee/MissingLine";
import { arriveeStore, identityBlocker, useArrivee } from "@/features/arrivee/model";
import { finishArrivee } from "@/features/arrivee/persist";
import { pseudoRule, usePseudoCheck } from "@/features/arrivee/usePseudoCheck";
import { T, useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";
import { authErrorMessage } from "@/lib/http";
import { kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { announce } from "@/ui/Announce";

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
  // Lot R3d (retour réel du 24/10) : le bouton grisé dit toujours pourquoi (la première chose qui manque) ; une
  // vérification du pseudo en panne (`idle`) ne bloque pas, l'API tranche à l'envoi.
  const missing = identityBlocker(identity, pseudoState, departments);
  const ready = missing === null;
  useFocusEffect(useCallback(() => arriveeStore.set({ step: "identite" }), []));
  // « Retour à Ton coin » : l'écran d'avant dans la pile (parcours normal ou reprise), sinon on l'ouvre.
  const toDepartments = () => (router.canGoBack() ? router.back() : router.replace("/arrivee/departement"));

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const created = await signUp({
        email: identity.email.trim(),
        password: identity.password,
        pseudo: identity.pseudo,
        mainProfile: profile,
        departments,
        firstName: identity.firstName,
        lastName: identity.lastName,
      });
      await kvSet("onboarded", "1");
      // Le brouillon gardé sur l'appareil s'efface ; le mot de passe quitte aussi la mémoire.
      await finishArrivee();
      arriveeStore.set({ identity: { ...identity, password: "" } });
      // Tour 2 : pseudo pris entre la vérification et l'envoi, l'API l'a complété de chiffres : on le dit.
      if (created && created.profile.pseudo !== identity.pseudo) {
        announce({
          id: `pseudo-pris-${created.user.id}`,
          tone: "info",
          icon: "profile",
          title: arriveeLabels.pseudoTaken.title(created.profile.pseudo),
          text: arriveeLabels.pseudoTaken.text,
        });
      }
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
        <>
          <Button
            variant="primary"
            icon="next"
            fullWidth
            loading={busy}
            disabled={!ready}
            onPress={() => void submit()}
            accessibilityHint={missing?.text}
          >
            {arriveeLabels.identity.submit}
          </Button>
          <MissingLine missing={missing} onDepartments={toDepartments} />
        </>
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
        maxLength={EMAIL_MAX_LENGTH}
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
        <T k="cap" color={a.winText} accessibilityRole="alert">
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
