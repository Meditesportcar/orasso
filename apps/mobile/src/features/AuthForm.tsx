// Création de compte et connexion par e-mail + mot de passe. Google et Apple sont prévus par l'API mais restent
// masqués ici tant que leurs identifiants n'existent pas (PLAN, H6) : aucun bouton qui ne marcherait pas.

import { Button, CheckboxField, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { expressLabels, PASSWORD_MIN_LENGTH, passwordHint, pseudoSchema } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { authApi } from "@/lib/api";
import { authErrorMessage } from "@/lib/http";
import { kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";

import { TwoFactorStep } from "./TwoFactorStep";

const { space3 } = tokens.spacing;

type PseudoState = "idle" | "checking" | "free" | "taken" | "invalid";

export function AuthForm({
  mode,
  onSwitchMode,
  next,
  onForgotPassword,
}: {
  mode: "signup" | "signin";
  onSwitchMode: () => void;
  /** Où aller après la connexion (retour exactement là où on était : lien partagé vers un événement). */
  next?: string;
  /** Ouvre la feuille « Mot de passe oublié » (écran d'auth). */
  onForgotPassword?: () => void;
}) {
  const { t } = useTheme();
  const { signIn, signUp, verifyTwoFactor } = useSession();
  const router = useRouter();
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  // Lot 36 : conditions générales, case obligatoire à l'inscription (tracée par l'API).
  const [terms, setTerms] = useState(false);
  const [password, setPassword] = useState("");
  const [pseudoState, setPseudoState] = useState<PseudoState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Le compte a la double authentification : étape du code. */
  const [needsCode, setNeedsCode] = useState(false);
  const signup = mode === "signup";

  // Le pseudo est vérifié pendant la saisie (format, puis disponibilité auprès de l'API).
  useEffect(() => {
    if (!signup || pseudo.length === 0) {
      setPseudoState("idle");
      return;
    }
    if (!pseudoSchema.safeParse(pseudo).success) {
      setPseudoState("invalid");
      return;
    }
    setPseudoState("checking");
    let cancelled = false;
    const timer = setTimeout(() => {
      authApi
        .pseudoAvailable(pseudo)
        .then((r) => !cancelled && setPseudoState(r.available ? "free" : "taken"))
        .catch(() => !cancelled && setPseudoState("idle"));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pseudo, signup]);

  const pseudoHelp: Record<PseudoState, string | undefined> = {
    idle: "3 à 24 caractères : lettres, chiffres, « _ » ou « . ».",
    checking: "Vérification…",
    free: "Ce pseudo est libre.",
    taken: undefined,
    invalid: undefined,
  };
  const pseudoError =
    pseudoState === "taken"
      ? "Ce pseudo est déjà pris."
      : pseudoState === "invalid"
        ? "3 à 24 caractères : lettres, chiffres, « _ » ou « . »."
        : undefined;
  const ready =
    email.includes("@") &&
    password.length >= PASSWORD_MIN_LENGTH &&
    (!signup || ((pseudoState === "free" || pseudoState === "idle") && terms));

  async function done() {
    await kvSet("onboarded", "1");
    router.replace((next ?? "/") as "/");
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (signup) await signUp(email.trim(), password, pseudo);
      else if ((await signIn(email.trim(), password)) === "two_factor") {
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
    <Plate style={styles.plate}>
      {signup ? (
        <TextField
          label="Pseudo"
          value={pseudo}
          onChangeText={setPseudo}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          help={pseudoHelp[pseudoState]}
          error={pseudoError}
          maxLength={24}
        />
      ) : null}
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete={signup ? "email" : "username"}
        inputMode="email"
      />
      <TextField
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        revealable
        autoCapitalize="none"
        autoComplete={signup ? "new-password" : "current-password"}
        help={signup ? passwordHint : undefined}
        onSubmitEditing={() => ready && !busy && void submit()}
      />
      {signup ? (
        <>
          <CheckboxField label={expressLabels.terms} checked={terms} onChange={setTerms} />
          <Button
            variant="plate"
            icon="next"
            onPress={() => void Linking.openURL(siteUrl("/conditions")).catch(() => undefined)}
          >
            {expressLabels.termsLink}
          </Button>
        </>
      ) : null}
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          variant="primary"
          icon={signup ? "check" : "entry"}
          loading={busy}
          disabled={!ready}
          onPress={() => void submit()}
          fullWidth
        >
          {signup ? "Créer mon compte" : "Me connecter"}
        </Button>
        {!signup && onForgotPassword ? (
          <Button variant="plate" icon="inbox" onPress={onForgotPassword} fullWidth>
            Mot de passe oublié ?
          </Button>
        ) : null}
        <Button variant="plate" icon="profile" onPress={onSwitchMode} fullWidth>
          {signup ? "J'ai déjà un compte" : "Créer un compte"}
        </Button>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  plate: { gap: space3, padding: 16 },
  actions: { gap: 8, marginTop: 4 },
});
