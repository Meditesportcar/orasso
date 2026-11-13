// « QR de la page » (lot R9b, T23) : la feuille du propriétaire qui montre le QR du lien public de sa page (`/o/<slug>`, `/p/<slug>`,
// `/providers/<id>`, `/m/<id>`) et un bouton « Partager ». Le QR est celui du kit (`QrCode`, sombre sur clair dans les deux thèmes) ;
// il porte une adresse publique, jamais un secret : aucune capture n'est bloquée.
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { pagesLabels as L } from "@orasso/shared";
import { Share, StyleSheet, useWindowDimensions, View } from "react-native";

import { siteUrl } from "@/api";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { QrCode } from "@/ui/QrCode";

const { space2, space3, space8, space12 } = tokens.spacing;
// Côté maximal du QR : 288 px, composé depuis les jetons.
const QR_MAX = space12 * 6;

export function PageQrSheet({
  visible,
  onClose,
  name,
  path,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
  /** Le chemin public de la page (`/o/<slug>`…) ; `null` : la page n'est pas encore lisible, rien à montrer. */
  path: string | null;
}) {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 2 * space3 - space8, QR_MAX);
  const url = path ? siteUrl(path) : null;
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.qrTitle}>
      <Text variant="title" color={t.color.ink}>
        {L.qrTitle}
      </Text>
      {url ? (
        <View style={styles.center} testID="page-qr">
          <QrCode value={url} size={size} label={`${L.qrTitle} : ${name}`} logo />
          <Text variant="bodyStrong" color={t.color.ink} style={styles.name}>
            {name}
          </Text>
          <Muted variant="caption" style={styles.name}>
            {L.qrHelp}
          </Muted>
        </View>
      ) : (
        <Muted variant="body">Chargement…</Muted>
      )}
      <Button
        variant="plate"
        icon="share"
        fullWidth
        disabled={!url}
        onPress={() => {
          if (url) void Share.share({ message: url }).catch(() => undefined);
        }}
        testID="page-qr-share"
      >
        {L.share}
      </Button>
      <Button variant="plate" icon="close" fullWidth onPress={onClose} testID="page-qr-close">
        {L.close}
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: space2 },
  name: { textAlign: "center" },
});
