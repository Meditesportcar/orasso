// Casquette Prestataire, Ma vitrine (DA v2, lot 54, prototype `s-vitrine`) : ce que voit l'organisateur, et la modification.
// En-tête (initiales rondes, nom, métier · zone), deux segments « Vue organisateur » et « Modifier ma vitrine ». Il faut au
// moins une photo (ou, pour un photographe, un Instagram ou un portfolio) pour candidater.
import { Button, departmentChoices, Text, tokens, useTheme } from "@orasso/design-system/native";
import { PROVIDER_MAX_PHOTOS, type ProviderProfileView, proV2Labels, vitrineTexts } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { photoForm, pickPhotos } from "@/lib/photos";
import { initialsOf } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PhotoGrid } from "@/ui/PhotoGrid";
import { TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { Segments } from "@/ui/Segments";
import { ProviderForm } from "./ProviderForm";
import { VitrineView } from "./VitrineView";

const { space1, space3, space4, space12 } = tokens.spacing;
/** Logo rond de l'en-tête : 64 px. */
const LOGO = space12 + space4;

type Mode = "view" | "edit";

export function VitrineScreen() {
  const { t } = useTheme();
  const { refreshMe } = useSession();
  const profile = useApi(async () => (await api.providerProfile()).profile, [], { cacheKey: "provider-profile" });
  const p = profile.data;
  const reviews = useApi(() => api.providerReviews(p?.id ?? ""), [p?.id], {
    enabled: Boolean(p),
    cacheKey: "provider-reviews",
  });
  const [mode, setMode] = useState<Mode>("view");
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

  const place = p?.departments[0] ? departmentChoices.find((d) => d.code === p.departments[0])?.name : undefined;

  return (
    <TabScreen
      title={proV2Labels.vitrineTitle}
      facts={p?.name}
      onRefresh={async () => {
        await Promise.all([profile.reload(), reviews.reload()]);
      }}
    >
      {!p && profile.error ? (
        <LoadError message={profile.error.message} onRetry={() => void profile.reload()} />
      ) : !p && profile.loading ? (
        <Muted variant="body">Chargement…</Muted>
      ) : (
        <>
          {p ? (
            <View style={styles.identity} testID="vitrine-identity">
              <View style={[styles.logo, { backgroundColor: t.color.surfaceRaised, borderColor: t.color.line }]}>
                <Text variant="posterS" color={t.color.ink}>
                  {initialsOf(p.name)}
                </Text>
              </View>
              <View style={styles.identityText}>
                <Text variant="posterM" color={t.color.ink}>
                  {p.name}
                </Text>
                <Muted variant="caption">{proV2Labels.tradePlace(p.typeLabel, place ?? null)}</Muted>
              </View>
            </View>
          ) : null}
          {p ? (
            <Segments
              testID="vitrine-segments"
              value={mode}
              onChange={setMode}
              items={[
                { id: "view", label: vitrineTexts.orgView },
                { id: "edit", label: vitrineTexts.edit },
              ]}
            />
          ) : null}
          {p?.issue ? <Notice>Pour candidater : {p.issue}</Notice> : null}

          {p ? (
            <View style={mode === "view" ? undefined : styles.hidden}>
              <VitrineView vitrine={p} reviews={reviews.data} />
            </View>
          ) : null}
          {/* Montée en permanence : changer de segment ne perd pas la saisie en cours. */}
          <View style={[styles.stack, p && mode === "view" && styles.hidden]} testID="vitrine-edit">
            <ProviderForm key={p?.id ?? "new"} profile={p} submitLabel={proV2Labels.save} onSaved={replace} />
            {p ? (
              <>
                <SecHead title={proV2Labels.photosTitle(p.photos.length, PROVIDER_MAX_PHOTOS)} />
                <Muted variant="body">{proV2Labels.photosHelp}</Muted>
                {/* Lot 36 : retrait par la croix visible puis une confirmation (plus au simple toucher). */}
                {p.photos.length > 0 ? (
                  <PhotoGrid
                    photos={p.photos.map((photo, i) => ({
                      key: photo.id,
                      source: mediaSource(photo.url),
                      label: `Photo ${i + 1}`,
                    }))}
                    onRemove={(i) => {
                      const photo = p.photos[i];
                      return photo ? removePhoto(photo.id) : undefined;
                    }}
                    disabled={busy}
                    testID="provider-photos"
                  />
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
                    {proV2Labels.photosAdd}
                  </Button>
                ) : null}
              </>
            ) : null}
          </View>
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: space3 },
  identityText: { flex: 1, minWidth: 0, gap: space1 },
  hidden: { display: "none" },
  logo: {
    width: LOGO,
    height: LOGO,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: { gap: space3 },
});
