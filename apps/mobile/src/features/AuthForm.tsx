// Connexion par e-mail + mot de passe (lot C3 : champs de l'artefact `.field` / `.inp` posés sur le fond, bouton
// principal `.btn-p`, liens `.btn-g`). La création de compte n'est plus ici : elle passe par le flux d'arrivée
// (`app/arrivee/`, lot 41 : profil, département, nom et prénom obligatoires). Google et Apple sont prévus par l'API mais
// restent masqués ici tant que leurs identifiants n'existent pas (PLAN, H6) : aucun bouton qui ne marcherait pas.

import { Button, TextField } from "@orasso/design-system/native";
import { EMAIL_MAX_LENGTH, loginMissing } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { MissingLine } from "@/features/arrivee/MissingLine";
import { T, useArt } from "@/features/tuto/art";
import { ArtIcon, type ArtIconName } from "@/features/tuto/icons";
import { authErrorMessage } from "@/lib/http";
import { kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";

import { TwoFactorStep } from "./TwoFactorStep";

/** Un lien de l'artefact (`.btn.btn-g`) : icône et capitales, sans fond ni bord. */
function GhostLink({ icon, onPress, children }: { icon: ArtIconName; onPress: () => void; children: string }) {
  const a = useArt();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.ghost, pressed ? styles.pressed : null]}
    >
      <ArtIcon name={icon} size={20} color={a.ink} />
      <T k="btn" size={14} lh={17} color={a.ink}>
        {children}
      </T>
    </Pressable>
  );
}

export function AuthForm({
  onSwitchMode,
  next,
  onForgotPassword,
}: {
  /** Bascule vers la création de compte (le flux d'arrivée). */
  onSwitchMode: () => void;
  /** Où aller après la connexion (retour exactement là où on était : lien partagé vers un événement). */
  next?: string;
  /** Ouvre la feuille « Mot de passe oublié » (écran d'auth). */
  onForgotPassword?: () => void;
}) {
  const a = useArt();
  const { signIn, verifyTwoFactor } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Le compte a la double authentification : étape du code. */
  const [needsCode, setNeedsCode] = useState(false);

  // Lot R3d, tour 2 : le bouton grisé dit ce qui manque (même règle et même ligne que l'arrivée).
  const missing = loginMissing(email, password);
  const ready = missing === null;

  async function done() {
    await kvSet("onboarded", "1");
    router.replace((next ?? "/") as "/");
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if ((await signIn(email.trim(), password)) === "two_factor") {
        setNeedsCode(true);
        return;
      }
      await done();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (needsCode) {
    return (
      <TwoFactorStep
        onVerify={async (code, opts) => {
          await verifyTwoFactor(code, opts);
          await done();
        }}
        onCancel={() => setNeedsCode(false)}
      />
    );
  }

  return (
    <View style={styles.form}>
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="username"
        inputMode="email"
        maxLength={EMAIL_MAX_LENGTH}
      />
      <TextField
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        revealable
        autoCapitalize="none"
        autoComplete="current-password"
        onSubmitEditing={() => ready && !busy && void submit()}
      />
      {error ? (
        <T k="cap" color={a.winText} accessibilityRole="alert">
          {error}
        </T>
      ) : null}
      <View style={styles.actions}>
        <Button
          variant="primary"
          icon="entry"
          loading={busy}
          disabled={!ready}
          onPress={() => void submit()}
          fullWidth
          accessibilityHint={missing?.text}
        >
          Me connecter
        </Button>
        <MissingLine missing={missing} />
        {onForgotPassword ? (
          <GhostLink icon="lock" onPress={onForgotPassword}>
            Mot de passe oublié ?
          </GhostLink>
        ) : null}
        <GhostLink icon="user" onPress={onSwitchMode}>
          Créer un compte
        </GhostLink>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18 },
  actions: { gap: 8, marginTop: 6 },
  ghost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    paddingVertical: 10,
  },
  pressed: { transform: [{ scale: 0.97 }] },
});
