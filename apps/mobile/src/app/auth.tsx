// Connexion d'un utilisateur qui a déjà un compte (accueil › « J'ai déjà un compte », ou lien partagé) : après la
// connexion, retour exactement là où il était (`next`). La création de compte est le flux d'arrivée. L'artefact n'a pas
// d'écran de connexion : celui-ci reprend les écrans de flux de l'arrivée (lot C3) : `.flowbar` (croix à droite),
// titre `.ob-h`, champs `.field` / `.inp`, bouton `.btn-p`, sur le fond de l'appli.
import { Ground } from "@orasso/design-system/native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthForm } from "@/features/AuthForm";
import { ObHead } from "@/features/arrivee/ArriveeScreen";
import { ForgotPasswordSheet } from "@/features/ForgotPasswordSheet";
import { useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";
import { KeyboardSafe } from "@/ui/KeyboardSafe";

export default function Auth() {
  const a = useArt();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const [forgot, setForgot] = useState(false);
  const router = useRouter();
  // Seuls les chemins internes sont acceptés comme destination.
  const next = params.next?.startsWith("/") ? params.next : undefined;
  const toArrivee = () => router.replace({ pathname: "/arrivee/profil", params: next ? { next } : {} });
  if (params.mode === "signup")
    return <Redirect href={{ pathname: "/arrivee/profil", params: next ? { next } : {} }} />;

  return (
    <Ground variant="battle" style={styles.fill}>
      <KeyboardSafe style={styles.fill}>
        <View style={[styles.flowbar, { paddingTop: insets.top + 26 }]}>
          <View style={styles.fill} />
          <Pressable
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace({ pathname: "/arrivee", params: next ? { next } : {} })
            }
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            testID="auth-close"
            hitSlop={6}
            style={[styles.closex, { backgroundColor: a.card, boxShadow: `inset 0 0 0 1.5px ${a.line}` }]}
          >
            <ArtIcon name="x" size={20} color={a.ink} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <ObHead title="Content de te revoir" text="Connecte-toi pour retrouver ton garage et tes accès." />
          <AuthForm next={next} onSwitchMode={toArrivee} onForgotPassword={() => setForgot(true)} />
        </ScrollView>
      </KeyboardSafe>
      <ForgotPasswordSheet visible={forgot} onClose={() => setForgot(false)} />
    </Ground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flowbar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 6, gap: 18 },
});
