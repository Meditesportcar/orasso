// Feuille « Mes casquettes » (docs/02) : le passionné en premier, puis mes structures (avec leur logo), ma fiche pro, mon
// profil prestataire ; en bas, créer une casquette. Un appui sur une ligne change de casquette (la session reste la
// même) ; « Moi » ouvre le compte. La structure et le profil prestataire se créent dans l'appli (lots 21 et 22), la fiche pro sur le site.
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { AppSheet } from "@/ui/AppSheet";
import { CreateCasquettes, PersonaRows } from "./parts";

const { space2 } = tokens.spacing;

export function CasquettesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Mes casquettes">
      <Text variant="title" color={t.color.ink}>
        Mes casquettes
      </Text>
      <PersonaRows onPicked={onClose} />
      <Button
        variant="plate"
        icon="profile"
        fullWidth
        onPress={() => {
          onClose();
          router.push("/moi");
        }}
      >
        Moi : profil, réglages, sécurité
      </Button>
      <Text variant="label" color={t.color.inkMuted} style={styles.section} accessibilityRole="header">
        Créer une casquette
      </Text>
      <CreateCasquettes onNavigate={onClose} />
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space2 },
});
