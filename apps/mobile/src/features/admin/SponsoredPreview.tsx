// Aperçu de la carte « Sponsorisé » du Fil (lot R7k1, administration) : un cadre 4:5, l'image (ou sa place), la mention
// « Sponsorisé » et celle de l'annonceur (« Publicité »), le nom, le titre, le texte et le domaine du lien. Ce n'est pas
// la carte du Fil elle-même (lot R7k2) : un dessin fidèle de ce que l'annonceur y verra. Le site a le même aperçu.
import { Chip, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { adminAppLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import { mediaSource } from "@/lib/media";

const { space2, space3 } = tokens.spacing;

export type SponsoredPreviewProps = {
  advertiserName: string;
  title: string;
  body: string;
  imageUrl: string | null;
  disclosure: string | null;
  /** Domaine du lien, affiché pour un annonceur externe. */
  domain: string | null;
};

export function SponsoredPreview({ advertiserName, title, body, imageUrl, disclosure, domain }: SponsoredPreviewProps) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      accessibilityLabel={L.sponsoredPreview}
      style={[styles.card, { backgroundColor: c.surface }]}
      testID="placement-preview"
    >
      <View style={[styles.media, { backgroundColor: c.surfaceSunken }]}>
        {imageUrl ? (
          <Photo source={mediaSource(imageUrl)} style={StyleSheet.absoluteFill} />
        ) : (
          <Text variant="caption" color={c.inkMuted} style={styles.noImage}>
            {L.sponsoredPreviewNoImage}
          </Text>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.tags}>
          <Chip>{L.sponsoredPreviewBadge}</Chip>
          {disclosure ? (
            <Text variant="caption" color={c.inkMuted}>
              {disclosure}
            </Text>
          ) : null}
        </View>
        <Text variant="meta" color={c.ink}>
          {advertiserName || "…"}
        </Text>
        <Text variant="title" color={c.ink}>
          {title || "…"}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {body}
        </Text>
        {domain ? (
          <Text variant="caption" color={c.inkMuted}>
            {domain}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", maxWidth: 260, aspectRatio: 4 / 5, overflow: "hidden", borderRadius: tokens.radius.radiusLg },
  media: { flex: 1, alignItems: "center", justifyContent: "center", padding: space3 },
  noImage: { textAlign: "center" },
  body: { gap: 4, padding: space3 },
  tags: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space2 },
});
