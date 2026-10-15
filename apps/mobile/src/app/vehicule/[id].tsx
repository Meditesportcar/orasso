// Fiche d'un de mes véhicules : ses photos (au moins une pour candidater, 8 au plus) et ses informations. La plaque
// n'est montrée qu'ici, à son propriétaire.
import { Button, Chip, ChipRow, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/endpoints";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { MAX_PHOTOS, photoForm, pickPhotos } from "@/lib/photos";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function VehiculeFiche() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useApi(() => api.vehicle(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const v = vehicle.data;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/garage"));

  async function add() {
    if (!v) return;
    setError(null);
    try {
      const picked = await pickPhotos(MAX_PHOTOS - v.photos.length);
      for (let i = 0; i < picked.length; i++) {
        setBusy(`Envoi de la photo ${i + 1} sur ${picked.length}…`);
        await api.uploadVehiclePhoto(v.id, await photoForm(picked[i] as (typeof picked)[number], i));
      }
      await vehicle.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(photoId: string) {
    if (!v) return;
    setBusy("Suppression…");
    setError(null);
    try {
      await api.deleteVehiclePhoto(v.id, photoId);
      await vehicle.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <FlowScreen title="Mon véhicule" onClose={close} onRefresh={vehicle.reload}>
      {!v ? (
        <Muted variant="body">{vehicle.error ? vehicle.error.message : "Chargement…"}</Muted>
      ) : (
        <>
          <Text variant="posterL" color={t.color.ink}>
            {v.label}
          </Text>
          <Muted variant="meta">
            {[v.year, v.powerHp ? `${v.powerHp} ch` : null, v.color].filter(Boolean).join(" · ")}
          </Muted>
          {v.categories.length > 0 ? (
            <ChipRow>
              {v.categories.map((c) => (
                <Chip key={c.id}>{c.label}</Chip>
              ))}
            </ChipRow>
          ) : null}

          <Muted variant="label">
            Photos · {v.photos.length} / {MAX_PHOTOS}
          </Muted>
          {v.photos.length === 0 ? (
            <Notice>Ajoute au moins une photo : il en faut une pour candidater à un événement.</Notice>
          ) : (
            <View style={styles.photos}>
              {v.photos.map((p) => (
                <View key={p.id}>
                  <Photo source={mediaSource(p.url)} style={styles.photo} />
                  <View style={styles.remove}>
                    <Button
                      variant="close"
                      label="Retirer cette photo"
                      onPhoto
                      disabled={busy !== null}
                      onPress={() => void remove(p.id)}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
          <Muted variant="body">Évite de montrer la plaque : tes photos sont visibles de tous les inscrits.</Muted>
          {v.photos.length < MAX_PHOTOS ? (
            <Button variant="primary" icon="add" loading={busy !== null} onPress={() => void add()} fullWidth>
              Ajouter des photos
            </Button>
          ) : null}
          {busy ? <Muted variant="meta">{busy}</Muted> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}

          <Plate style={styles.plate}>
            <Text variant="label" color={t.color.plateMuted}>
              Plaque · visible par l'organisateur seulement
            </Text>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {v.unregistered ? "Non immatriculé" : (v.plate ?? "—")}
            </Text>
          </Plate>
        </>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  photo: { width: 160, height: 120, borderRadius: 8 },
  remove: { position: "absolute", top: space1, right: space1 },
  plate: { gap: space1, padding: space3 },
});
