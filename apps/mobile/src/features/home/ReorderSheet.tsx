// Feuille « Réorganiser » (lot 30) : monter, descendre, masquer les blocs de l'Accueil. Chaque geste est enregistré tout
// de suite (`PUT /me/home/widgets`) ; « Prochain accès » reste en tête et ne se masque pas. Des boutons plutôt qu'un
// glisser-déposer : lisible en plein soleil, au doigt ganté et au lecteur d'écran.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  HOME_FIXED_WIDGET,
  type HomeWidgetsConfig,
  homeLabels,
  homeWidgetTitles,
  moveHomeWidget,
  toggleHomeWidget,
} from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

export function ReorderSheet({
  visible,
  config,
  error,
  onChange,
  onClose,
}: {
  visible: boolean;
  config: HomeWidgetsConfig;
  error: string | null;
  onChange: (next: HomeWidgetsConfig) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={homeLabels.reorder}>
      <Text variant="title" color={t.color.ink}>
        {homeLabels.reorder}
      </Text>
      <Muted variant="body">{homeLabels.reorderHint}</Muted>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {config.order.map((id, i) => {
        const hidden = config.hidden.includes(id);
        const fixed = id === HOME_FIXED_WIDGET;
        return (
          <Plate key={id} style={styles.item} testID={`reorder-${id}`}>
            <Text variant="bodyStrong" color={hidden ? t.color.plateMuted : t.color.plateInk}>
              {homeWidgetTitles[id]}
              {hidden ? ` · ${homeLabels.hiddenTag}` : ""}
            </Text>
            {fixed ? null : (
              <View style={styles.row}>
                <Button
                  variant="plate"
                  icon="up"
                  disabled={i <= 1}
                  onPress={() => onChange(moveHomeWidget(config, id, -1))}
                  accessibilityLabel={`${homeLabels.moveUp} : ${homeWidgetTitles[id]}`}
                  testID={`up-${id}`}
                >
                  {homeLabels.moveUp}
                </Button>
                <Button
                  variant="plate"
                  icon="down"
                  disabled={i === config.order.length - 1}
                  onPress={() => onChange(moveHomeWidget(config, id, 1))}
                  accessibilityLabel={`${homeLabels.moveDown} : ${homeWidgetTitles[id]}`}
                  testID={`down-${id}`}
                >
                  {homeLabels.moveDown}
                </Button>
                <Button
                  variant="plate"
                  icon={hidden ? "eye" : "eyeOff"}
                  onPress={() => onChange(toggleHomeWidget(config, id))}
                  accessibilityLabel={`${hidden ? homeLabels.show : homeLabels.hide} : ${homeWidgetTitles[id]}`}
                  testID={`toggle-${id}`}
                >
                  {hidden ? homeLabels.show : homeLabels.hide}
                </Button>
              </View>
            )}
          </Plate>
        );
      })}
      <Button variant="secondary" icon="check" onPress={onClose} fullWidth testID="reorder-done">
        {homeLabels.done}
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  item: { gap: space2, padding: space3 },
  row: { flexDirection: "row", gap: space2, flexWrap: "wrap" },
});
