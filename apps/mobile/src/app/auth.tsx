// Connexion (ou création de compte) d'un utilisateur qui a déjà vu le premier lancement, ou qui arrive d'un lien
// partagé : après la connexion, retour exactement là où il était (`next`).
import { Ground, Logo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthForm } from "@/features/AuthForm";
import { Muted } from "@/ui/Muted";

const { space3, space4 } = tokens.spacing;

export default function Auth() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const [mode, setMode] = useState<"signin" | "signup">(params.mode === "signup" ? "signup" : "signin");
  // Seuls les chemins internes sont acceptés comme destination.
  const next = params.next?.startsWith("/") ? params.next : undefined;

  return (
    <Ground animated style={styles.fill}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
              {mode === "signin" ? "Content de te revoir" : "On y va ?"}
            </Text>
            <Muted variant="body">
              {mode === "signin"
                ? "Connecte-toi pour retrouver ton garage et tes accès."
                : "Un pseudo, un e-mail. Les véhicules, tu les ajouteras au moment de candidater."}
            </Muted>
            <AuthForm mode={mode} next={next} onSwitchMode={() => setMode(mode === "signin" ? "signup" : "signin")} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space4, gap: space3 },
  middle: { flexGrow: 1, justifyContent: "center", gap: space3 },
});
