// Connexion d'un utilisateur qui a déjà vu le premier lancement, ou qui arrive d'un lien partagé : après la
// connexion, retour exactement là où il était (`next`). La création de compte est le flux d'arrivée (lot 41).
import { Ground, Logo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthForm } from "@/features/AuthForm";
import { ForgotPasswordSheet } from "@/features/ForgotPasswordSheet";
import { KeyboardSafe } from "@/ui/KeyboardSafe";
import { Muted } from "@/ui/Muted";

const { space3, space4 } = tokens.spacing;

export default function Auth() {
  const { t } = useTheme();
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
    <Ground animated style={styles.fill}>
      <KeyboardSafe style={styles.fill}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + space4, paddingBottom: insets.bottom + space4 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Logo width={160} />
          <View style={styles.middle}>
            <Text variant="posterL" color={t.color.ink}>
              Content de te revoir
            </Text>
            <Muted variant="body">Connecte-toi pour retrouver ton garage et tes accès.</Muted>
            <AuthForm next={next} onSwitchMode={toArrivee} onForgotPassword={() => setForgot(true)} />
          </View>
        </ScrollView>
      </KeyboardSafe>
      <ForgotPasswordSheet visible={forgot} onClose={() => setForgot(false)} />
    </Ground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space4, gap: space3 },
  middle: { flexGrow: 1, justifyContent: "center", gap: space3 },
});
