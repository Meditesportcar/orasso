// Casquette Prestataire, Ma vitrine (DA v2, lot 54, prototype `s-vitrine`) : ce que voit l'organisateur, et la modification.
// En-tête (initiales rondes, nom, métier · zone), deux segments « Vue organisateur » et « Modifier ma vitrine ». Il faut au
// moins une photo (ou, pour un photographe, un Instagram ou un portfolio) pour candidater.
// Lot C4b (artefact `s-vitrine`) : pas de grand titre ; bandeau `.vit-hero` (170 px, dégradé rouge, icône du métier),
// logo carré remonté dessus (`.pro-id`), segments en bloc (`.seg`).
import { Button, departmentChoices, Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { PROVIDER_MAX_PHOTOS, type ProviderProfileView, proV2Labels, vitrineTexts } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { photoForm, pickPhotos } from "@/lib/photos";
import { initialsOf, tradeIcons } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { SegBlock, SquareLogo } from "@/ui/KitTz";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PhotoGrid } from "@/ui/PhotoGrid";
import { TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { ProviderForm } from "./ProviderForm";
import { VitrineView } from "./VitrineView";

const { space1, space3, space4 } = tokens.spacing;
/** `.vit-hero` : 170 px ; `.pro-id` remonte de 56 px sur le bandeau. */
const HERO = 170;
const ID_LIFT = 56;

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
            <>
              {/* `.vit-hero` : dégradé de l'artefact, jetons `vitrine-from` → `vitrine-to` du socle, puis la nuit. */}
              <View style={styles.hero} testID="vitrine-hero">
                <Photo
                  placeholder={`linear-gradient(135deg, ${t.color.vitrineFrom} 0%, ${t.color.vitrineTo} 70%, ${t.color.night} 100%)`}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroIcon}>
                  <Icon name={tradeIcons[p.type]} size={64} color={t.color.nightInk} />
                </View>
              </View>
              <View style={styles.identity} testID="vitrine-identity">
                <SquareLogo initials={initialsOf(p.name)} tone="red" label={`Logo de ${p.name}`} />
                <View style={styles.identityText}>
                  <Text variant="posterL" color={t.color.ink} accessibilityRole="header">
                    {p.name}
                  </Text>
                  <Muted variant="caption">{proV2Labels.tradePlace(p.typeLabel, place ?? null)}</Muted>
                </View>
              </View>
            </>
          ) : null}
          {p ? (
            <SegBlock
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
  hero: { height: HERO, marginHorizontal: -space4, marginTop: -space3, overflow: "hidden" },
  heroIcon: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 30 },
  identity: { flexDirection: "row", alignItems: "flex-end", gap: space3, marginTop: -ID_LIFT - space3 },
  identityText: { flex: 1, minWidth: 0, gap: space1 },
  hidden: { display: "none" },
  stack: { gap: space3 },
});
