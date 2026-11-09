// L'aperçu de la story (lot R7f3, maquette R7.8 « Aperçu en 9:16, tel que le voient les autres ») : le canevas final, fond
// flouté, cadrage, légende et autocollants, et la plaque floutée **simulée** par le cadre plein du kit (le vrai flou est celui
// du serveur : aucun floutage local, la photo d'origine ne quitte l'appareil que dans l'envoi). « Publier pour 24 h » est le
// bouton principal de l'écran parent.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyPublishLabels as L } from "@orasso/shared";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Muted } from "@/ui/Muted";
import type { StoryDraft } from "./model";
import { type OverlayData, StoryOverlays } from "./parts";
import { StoryCanvas } from "./StoryCanvas";

const { space2, space3 } = tokens.spacing;

export function Preview({ draft, overlays }: { draft: StoryDraft; overlays: OverlayData }) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const { photo } = draft.plate;
  // Pleine largeur du contenu, sans dépasser ce qu'une tablette ou un navigateur large montre raisonnablement.
  const viewWidth = Math.min(win.width - space3 * 2, 360);
  return (
    <View style={styles.block} testID="story-preview">
      <Text variant="posterM" color={t.color.ink}>
        {L.previewTitle}
      </Text>
      <View style={styles.center}>
        <StoryCanvas
          uri={draft.display.uri}
          width={photo.width}
          height={photo.height}
          frame={draft.frame}
          viewWidth={viewWidth}
          plateRects={draft.plate.noPlate ? undefined : draft.plate.rects}
          testID="story-preview-canvas"
        >
          <StoryOverlays width={viewWidth} data={overlays} />
        </StoryCanvas>
      </View>
      <Muted variant="caption">{L.previewNote}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  center: { alignItems: "center" },
});
