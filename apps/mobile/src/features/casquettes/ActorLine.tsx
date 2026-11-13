// La pastille « Tu lis en tant que » du Fil en casquette (lot R9n, maquette R9 `r9as`) : le logo de la casquette (petit), le
// nom en gras (jamais tronqué : il passe à la ligne) et le bouton « Changer » (icône) qui ouvre « Mes casquettes ». Rien pour
// le passionné et le visiteur, ni pour l'administration ou le survol : on ne lit « en tant que » que d'une page.
import { OrgLogo, Text, tokens, useTheme, WordSafeText } from "@orasso/design-system/native";
import { casquettesLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { useActor } from "@/lib/useActor";
import { SmButton } from "@/ui/Kit";
import { openCasquettes } from "./sheetStore";

const { space2, space3 } = tokens.spacing;
const { radiusLg } = tokens.radius;

export function ActorLine() {
  const { t } = useTheme();
  const actor = useActor();
  const { active } = usePersona();
  if (!actor) return null;
  return (
    <View
      style={[styles.row, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
      testID="fil-actor"
      accessibilityLabel={`${L.readingAs} ${active.label}`}
    >
      <OrgLogo name={active.label} logoUrl={mediaSource(active.logoUrl)?.uri ?? null} size={36} />
      <View style={styles.text}>
        <Text variant="caption" color={t.color.inkMuted}>
          {L.readingAs}
        </Text>
        {/* Le nom ne se coupe jamais au milieu d'un mot (corps réduit au besoin), il passe à la ligne entre les mots. */}
        <WordSafeText base={15} variant="bodyStrong" color={t.color.ink} testID="fil-actor-name">
          {active.label}
        </WordSafeText>
      </View>
      <SmButton icon="sort" onPress={openCasquettes} testID="fil-actor-change" accessibilityLabel={L.changeHint}>
        {L.change}
      </SmButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2,
    paddingHorizontal: space3,
    borderWidth: 1,
    borderRadius: radiusLg,
  },
  text: { flex: 1, gap: 1 },
});
