// Casquette Prestataire, Profil (lot 21) : type, nom, présentation, photos, contact, Instagram, portfolio, départements.
// Il faut au moins une photo (ou, pour un photographe, un Instagram ou un portfolio) pour candidater.
import { Button, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { ProviderProfileView } from "@orasso/shared";
import { PROVIDER_MAX_PHOTOS } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ProviderForm } from "@/features/provider/ProviderForm";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { photoForm, pickPhotos } from "@/lib/photos";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space2 } = tokens.spacing;

export default function Profil() {
  const { t } = useTheme();
  const { refreshMe } = useSession();
  const profile = useApi(async () => (await api.providerProfile()).profile, [], { cacheKey: "provider-profile" });
  const p = profile.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function replace(next: ProviderProfileView) {
    profile.setData(next);
    void refreshMe();
  }

  async function addPhotos() {
    if (!p) return;
    setError(null);
    setBusy(true);
    try {
      const picked = await pickPhotos(PROVIDER_MAX_PHOTOS - p.photos.length);
      let last: ProviderProfileView | null = null;
      for (const [i, photo] of picked.entries()) last = await api.uploadProviderPhoto(await photoForm(photo, i));
      if (last) replace(last);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(id: string) {
    setError(null);
    setBusy(true);
    try {
      replace(await api.deleteProviderPhoto(id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TabScreen
      title="Profil"
      facts={p?.name}
      onRefresh={async () => {
        await profile.reload();
      }}
    >
      {!p && profile.loading ? (
        <Muted variant="body">Chargement…</Muted>
      ) : (
        <>
          {p?.issue ? <Notice>Pour candidater : {p.issue}</Notice> : null}
          <ProviderForm key={p?.id ?? "new"} profile={p} submitLabel="Enregistrer" onSaved={replace} />
          {p ? (
            <>
              <SectionTitle>
                Photos · {p.photos.length} / {PROVIDER_MAX_PHOTOS}
              </SectionTitle>
              <Text variant="body" color={t.color.inkMuted}>
                Montre ton activité, ton stand ou ton travail. Touche une photo pour la retirer.
              </Text>
              {p.photos.length > 0 ? (
                <View style={styles.photos}>
                  {p.photos.map((photo, i) => (
                    <Pressable
                      key={photo.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer la photo ${i + 1}`}
                      onPress={() => !busy && void removePhoto(photo.id)}
                    >
                      <Photo source={mediaSource(photo.url)} style={styles.photo} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              {p.photos.length < PROVIDER_MAX_PHOTOS ? (
                <Button
                  variant="secondary"
                  icon="add"
                  loading={busy}
                  disabled={busy}
                  onPress={() => void addPhotos()}
                  fullWidth
                >
                  Ajouter des photos
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  photo: { width: 92, height: 70, borderRadius: 8 },
});
