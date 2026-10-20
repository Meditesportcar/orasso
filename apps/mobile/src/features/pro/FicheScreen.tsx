// Casquette Pro, Ma fiche (DA v2, lot 54, prototype `s-pro`) : l'en-tête (logo rond, nom, « Pro validé », ville), deux
// segments « Vue passionné » (ce que voit un passionné : activités en tuiles, remises par grade en grands chiffres,
// réalisations en mosaïque, « Y aller » et « Favori ») et « Modifier ma fiche » (champs avec exemples de format, SIRET et
// adresse vérifiés, remises, photos, publication). Publier une actualité reste une page masquée, ouverte d'ici.
// L'abonnement et les emplacements sponsorisés se consultent seulement : aucun prix ni bouton de paiement dans l'appli,
// la souscription se fait sur le site Orasso.
import { Button, Chip, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { proAppLabels as L, proActivityLabels, proV2Labels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { api } from "@/lib/api";
import { mapsUrl } from "@/lib/directions";
import { mediaSource } from "@/lib/media";
import { discountCells, proActivityIcons } from "@/lib/proPresta";
import { useApi } from "@/lib/useApi";
import { IconTiles } from "@/ui/IconTiles";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { Segments } from "@/ui/Segments";
import { ProFicheFields } from "./FicheForm";
import {
  DiscountsBlock,
  MediaBlock,
  PartnersBlock,
  PublicationBlock,
  SiretBlock,
  SubscriptionBlock,
} from "./ProBlocks";

const { space1, space2, space3 } = tokens.spacing;

type Mode = "view" | "edit";

export function FicheScreen({ initial = "view" }: { initial?: Mode }) {
  const { t } = useTheme();
  const router = useRouter();
  // Fiche créée depuis Créer (lot 34) : un mot de confirmation.
  const { fait } = useLocalSearchParams<{ fait?: string }>();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const pro = myPro.data;
  const [mode, setMode] = useState<Mode>(initial);
  const [viewer, setViewer] = useState<number | null>(null);
  const [previewNote, setPreviewNote] = useState(false);
  const reload = () => myPro.reload();
  const zone = pro?.interventionDepartments.length ? `Intervient : ${pro.interventionDepartments.join(", ")}` : null;
  const cityLine = pro?.city
    ? pro.distanceKm != null
      ? proV2Labels.cityDistance(pro.city, pro.distanceKm)
      : pro.city
    : (zone ?? proV2Labels.noAddress);
  const cells = pro ? discountCells(pro.discounts) : [];
  const hasPosition = Boolean(pro && ((pro.lat !== null && pro.lng !== null) || pro.addressLine || pro.city));

  return (
    <TabScreen
      title={proV2Labels.ficheTitle}
      facts={pro?.name}
      onRefresh={async () => {
        await myPro.reload();
      }}
      overlays={
        pro ? (
          <PhotoViewer
            photos={pro.photos.map((x, i) => ({
              id: x.id,
              url: x.url,
              position: i + 1,
              width: 4,
              height: 3,
              plateBlurred: false,
            }))}
            start={viewer}
            onClose={() => setViewer(null)}
          />
        ) : null
      }
    >
      {!pro ? (
        myPro.loading ? null : (
          <Notice>{L.noPro}</Notice>
        )
      ) : (
        <>
          {fait === "creee" ? <Notice>{L.created}</Notice> : null}
          {/* Copie en cache d'avant le lot 21 : pas de `visibility`. */}
          {pro.visibility?.banner ? <Notice>{pro.visibility.banner}</Notice> : null}

          <View style={styles.identity} testID="pro-identity">
            <Photo
              source={mediaSource(pro.logoUrl)}
              placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
              cut="thumb"
              style={styles.logo}
              accessibilityLabel={`Logo de ${pro.name}`}
            />
            <View style={styles.identityText}>
              <Text variant="posterM" color={t.color.ink}>
                {pro.name}
              </Text>
              <View style={styles.pills}>
                {pro.verifiedAt ? (
                  <Chip variant="verified">{proV2Labels.proValidated}</Chip>
                ) : (
                  <Chip>{L.toVerify}</Chip>
                )}
                {pro.published ? null : <Chip>{L.draft}</Chip>}
                <Muted variant="caption">{cityLine}</Muted>
              </View>
            </View>
          </View>

          <Segments
            testID="pro-segments"
            value={mode}
            onChange={setMode}
            items={[
              { id: "view", label: proV2Labels.segView },
              { id: "edit", label: proV2Labels.segEdit },
            ]}
          />

          {mode === "view" ? (
            <View style={styles.stack} testID="pro-view">
              <Muted variant="label">{proV2Labels.activities}</Muted>
              <IconTiles
                testID="pro-view-activities"
                items={pro.activities.map((a) => ({ key: a, label: proActivityLabels[a], icon: proActivityIcons[a] }))}
              />

              <SecHead title={proV2Labels.discountsTitle} hint={proV2Labels.discountsHint} />
              {cells.length ? (
                <Plate style={styles.discounts} testID="pro-view-discounts">
                  {cells.map((c, i) => (
                    <View
                      key={c.key}
                      style={[styles.discount, i > 0 && { borderLeftWidth: 1, borderLeftColor: t.color.plateLine }]}
                    >
                      <Text variant="label" color={t.color.plateMuted}>
                        {c.label}
                      </Text>
                      <Text variant="numberNarrow" color={t.color.plateInk} style={styles.percent}>
                        {`${c.percent} %`}
                      </Text>
                    </View>
                  ))}
                </Plate>
              ) : (
                <Muted variant="body">{proV2Labels.discountsNone}</Muted>
              )}

              <SecHead
                title={proV2Labels.worksTitle}
                hint={pro.photos.length ? proV2Labels.works(pro.photos.length) : undefined}
              />
              {pro.photos.length ? (
                <View style={styles.works} testID="pro-view-works">
                  {pro.photos.map((p, i) => (
                    <Pressable
                      key={p.id}
                      style={styles.work}
                      onPress={() => setViewer(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Réalisation ${i + 1} en plein écran`}
                    >
                      <Photo source={mediaSource(p.url)} style={styles.workPhoto} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Muted variant="body">{proV2Labels.worksNone}</Muted>
              )}

              <View style={styles.actions}>
                {hasPosition ? (
                  <Button
                    variant="primary"
                    icon="place"
                    style={styles.grow}
                    onPress={() =>
                      void Linking.openURL(
                        mapsUrl({
                          lat: pro.lat,
                          lng: pro.lng,
                          addressLine: pro.addressLine,
                          city: pro.city,
                          title: pro.name,
                        }),
                      ).catch(() => undefined)
                    }
                    testID="pro-go"
                  >
                    {proV2Labels.goThere}
                  </Button>
                ) : null}
                <Button variant="secondary" icon="heart" onPress={() => setPreviewNote(true)} testID="pro-favorite">
                  {proV2Labels.favorite}
                </Button>
              </View>
              {previewNote ? <Notice>{proV2Labels.favoritePreview}</Notice> : null}
            </View>
          ) : (
            <View style={styles.stack} testID="pro-edit">
              <ProFicheFields />
              {/* Lot 40 : Publier n'est plus un onglet (barre v2) ; on y arrive depuis Ma fiche. */}
              <Button
                variant="plate"
                icon="add"
                next
                onPress={() => router.push("/(pro)/publier")}
                fullWidth
                testID="pro-new-post"
              >
                Publier une actualité
              </Button>
              <PublicationBlock pro={pro} reload={reload} />
              <SiretBlock pro={pro} reload={reload} />
              <DiscountsBlock pro={pro} reload={reload} />
              <MediaBlock pro={pro} reload={reload} />
              <PartnersBlock pro={pro} reload={reload} />
              <SubscriptionBlock pro={pro} />
            </View>
          )}
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: space3 },
  identityText: { flex: 1, minWidth: 0, gap: space1 },
  logo: { width: 64, height: 64, borderRadius: 32, overflow: "hidden" },
  pills: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space2 },
  stack: { gap: space3 },
  discounts: { flexDirection: "row", padding: 0, overflow: "hidden" },
  discount: { flex: 1, minWidth: 0, alignItems: "center", gap: 2, paddingVertical: space3, paddingHorizontal: space1 },
  percent: { fontSize: 30, lineHeight: 34, textAlign: "center" },
  works: { flexDirection: "row", flexWrap: "wrap", gap: space1 },
  work: { width: "32.4%" },
  workPhoto: { width: "100%", aspectRatio: 1, borderRadius: tokens.radius.radiusSm },
  actions: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
});
