// Premier lancement : trois écrans (la promesse, ce que tu peux faire, créer un compte), jamais revus. Aucune demande
// de notifications ici : elle viendra quand tu seras retenu (docs/02).
import { Button, Ground, Logo, PosterCard, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthForm } from "@/features/AuthForm";
import { kvSet } from "@/lib/kv";
import { Muted } from "@/ui/Muted";

const { space2, space3, space4 } = tokens.spacing;

const pages = [
  {
    label: "La promesse",
    title: "Tout le monde\nà sa place",
    text: "Orasso centralise les rassos : tu candidates une fois, tu sais où tu en es, tu entres avec un QR.",
  },
  {
    label: "Ce que tu peux faire",
    title: "Ton garage,\ntes accès",
    text: "Enregistre tes véhicules une fois pour toutes, découvre les événements autour de toi, suis tes candidatures, gagne des points.",
  },
  {
    label: "Créer un compte",
    title: "On y va ?",
    text: "Un pseudo, un e-mail. Les véhicules, tu les ajouteras au moment de candidater, pas avant.",
  },
] as const;

export default function Welcome() {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const page = pages[step] ?? pages[0];
  const last = step === pages.length - 1;

  const goTo = (n: number) => {
    setStep(n);
    // Le premier lancement ne se revoit jamais : dès le dernier écran vu, il est marqué comme fait.
    if (n === pages.length - 1) void kvSet("onboarded", "1");
  };

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
            <PosterCard
              key={step}
              label={`${page.label} · ${step + 1} / ${pages.length}`}
              title={page.title}
              facts={
                <Text variant="body" color={t.color.posterMuted} style={styles.plain}>
                  {page.text}
                </Text>
              }
              reveal={false}
            />
            {last ? <AuthForm mode="signup" onSwitchMode={() => router.replace("/auth")} /> : null}
          </View>
          <View style={styles.dots}>
            <View style={styles.dotsRow} accessibilityLabel={`Écran ${step + 1} sur ${pages.length}`}>
              {pages.map((p, i) => (
                <View
                  key={p.label}
                  style={[
                    styles.dot,
                    i === step ? styles.dotOn : null,
                    { backgroundColor: i === step ? t.color.accent : t.color.line },
                  ]}
                />
              ))}
            </View>
            {!last ? (
              <Button variant="secondary" icon="next" onPress={() => goTo(pages.length - 1)}>
                Passer
              </Button>
            ) : null}
          </View>
          {!last ? (
            <Button variant="primary" icon="next" onPress={() => goTo(step + 1)} fullWidth>
              Continuer
            </Button>
          ) : (
            <Muted variant="caption" style={styles.center}>
              Pas de demande de notifications ici : on te la fera quand tu seras retenu.
            </Muted>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Ground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space4, gap: space3 },
  middle: { flexGrow: 1, justifyContent: "center", gap: space3 },
  plain: { textTransform: "none" },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  dotsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { width: 22 },
  center: { textAlign: "center" },
});
