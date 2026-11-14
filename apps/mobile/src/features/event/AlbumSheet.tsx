// Le « … » d'un album de la section « Photos » (lot R9g, maquette R9.8 `ossheetH`, organisateur seulement) : « Choisir cet album comme
// « officiel » » ou « Retirer « officiel » ». Un seul album officiel par événement : la pose déplace l'étoile (règle de l'API).
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { AlbumSummary } from "@orasso/shared";
import { eventPhotosLabels as L } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2 } = tokens.spacing;

export function AlbumSheet({
  album,
  onClose,
  onChanged,
}: {
  album: AlbumSummary | null;
  onClose: () => void;
  /** L'étoile a changé : la section se recharge. */
  onChanged: (message: string) => void;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    if (!album || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.setAlbumOfficial(album.event.id, album.id, !album.official);
      onChanged(album.official ? L.officialRemoved : L.officialDone(album.media.name));
      onClose();
    } catch (e) {
      setError(errorMessage(e) || L.officialFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppSheet visible={album !== null} onClose={onClose} accessibilityLabel={L.albumMenu}>
      {album ? (
        <View style={styles.col}>
          <Text variant="bodyStrong" color={t.color.ink}>
            {album.title}
          </Text>
          <Button
            variant="secondary"
            icon="star"
            fullWidth
            disabled={busy}
            onPress={() => void toggle()}
            testID="album-sheet-official"
          >
            {album.official ? L.removeOfficial : L.makeOfficial}
          </Button>
          <Muted variant="caption">{album.official ? L.removeOfficialHint : L.makeOfficialHint}</Muted>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({ col: { gap: space2 } });
