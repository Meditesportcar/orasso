// Casquette Pro, Ma fiche (DA v2, lot 54, reconstruite au lot C4b d'après l'artefact `s-pro`) : photo d'atelier en
// tête qui fond vers le fond (`.pro-hero`, 230 px), logo carré et nom remontés sur la photo (`.pro-id`), « Pro validé »
// moutarde inclinée (`.pill-o`), puis le bloc de segments (`.seg`) :
//  - « Vue passionné » : activités en tuiles à icône sur trois colonnes (`.acts-g`), remises par grade en quatre tuiles
//    dont celle du grade de celui qui regarde en rouge (`.disc .top`), réalisations en mosaïque (`.works`), « Y aller »
//    et « Favori » ;
//  - « Modifier ma fiche » : les champs dans l'ordre de l'artefact (activités à cocher, SIRET, adresse, téléphone,
//    Instagram, site web, présentation), puis remises, logo et photos ;
//  - « Publications » (§ 5.2 de l'audit, le fourre-tout sorti de Modifier) : publier une actualité, l'état de la fiche
//    dans l'annuaire, les organisateurs partenaires, l'abonnement et les emplacements sponsorisés en consultation.
// L'abonnement se consulte seulement : aucun prix ni bouton de paiement dans l'appli, la souscription se fait sur le site.
import { Button, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { proAppLabels as L, proActivityLabels, proV2Labels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { api } from "@/lib/api";
import { mapsUrl } from "@/lib/directions";
import { mediaSource } from "@/lib/media";
import { discountCells, initialsOf, proActivityIcons, viewerCellKey } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { ProFicheFields } from "./FicheForm";
import { ActGrid, DiscGrid, SecH, SegBlock, SquareLogo, ValidatedPill } from "./kit";
import {
  DiscountsBlock,
  MediaBlock,
  PartnersBlock,
  PublicationBlock,
  SiretBlock,
  SubscriptionBlock,
} from "./ProBlocks";

const { space1, space3, space4 } = tokens.spacing;
/** `.pro-hero` : 230 px ; `.pro-id` remonte de 56 px sur la photo. */
const HERO = 230;
const ID_LIFT = 56;
/** `.works` : deux rangées de 90 px, 6 px d'écart. */
const WORK_ROW = 90;
const WORK_GAP = 6;

type Mode = "view" | "edit" | "posts";

export function FicheScreen({ initial = "view" }: { initial?: Mode }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
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
  const top = viewerCellKey(cells, me?.profile.grade);
  const hasPosition = Boolean(pro && ((pro.lat !== null && pro.lng !== null) || pro.addressLine || pro.city));
  const works = pro?.photos.slice(0, 3) ?? [];
  const heroUrl = pro?.photos[0]?.url ?? null;

  return (
    <TabScreen
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
          {/* `.pro-hero` : la photo d'atelier pleine largeur (première réalisation), assombrie en haut, fondue vers le fond. */}
          <View style={styles.hero} testID="pro-hero">
            <Photo
              source={heroUrl ? mediaSource(heroUrl) : undefined}
              placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.groundDeep} 100%)`}
              style={StyleSheet.absoluteFill}
              accessibilityLabel={heroUrl ? `Photo de ${pro.name}` : undefined}
            />
            <Photo
              placeholder={`linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, ${c.ground} 100%)`}
              style={StyleSheet.absoluteFill}
            />
          </View>

          <View style={styles.identity} testID="pro-identity">
            <SquareLogo initials={initialsOf(pro.name)} url={pro.logoUrl} label={`Logo de ${pro.name}`} />
            <View style={styles.identityText}>
              <Text variant="posterL" color={c.ink} accessibilityRole="header">
                {pro.name}
              </Text>
              <View style={styles.pills}>
                {pro.verifiedAt ? (
                  <ValidatedPill label={proV2Labels.proValidated} />
                ) : (
                  <Text variant="meta" color={c.accentText}>
                    {L.toVerify}
                  </Text>
                )}
                {pro.published ? null : (
                  <Text variant="meta" color={c.inkMuted}>
                    {L.draft}
                  </Text>
                )}
                <Muted variant="caption">{cityLine}</Muted>
              </View>
            </View>
          </View>
          {fait === "creee" ? <Notice>{L.created}</Notice> : null}
          {/* Copie en cache d'avant le lot 21 : pas de `visibility`. */}
          {pro.visibility?.banner ? <Notice>{pro.visibility.banner}</Notice> : null}

          <SegBlock
            testID="pro-segments"
            value={mode}
            onChange={setMode}
            items={[
              { id: "view", label: proV2Labels.segView },
              { id: "edit", label: proV2Labels.segEdit },
              { id: "posts", label: proV2Labels.segPosts },
            ]}
          />

          <View style={[styles.stack, mode !== "view" && styles.hidden]} testID="pro-view">
            <Text variant="label" color={c.inkMuted}>
              {proV2Labels.activities}
            </Text>
            <ActGrid
              testID="pro-view-activities"
              items={pro.activities.map((a) => ({ key: a, label: proActivityLabels[a], icon: proActivityIcons[a] }))}
            />

            <SecH title={proV2Labels.discountsTitle} hint={proV2Labels.discountsHint} />
            {cells.length ? (
              <DiscGrid
                testID="pro-view-discounts"
                items={cells.map((cell) => ({
                  key: cell.key,
                  label: cell.label,
                  // Espace insécable : « 10 % » ne se coupe jamais entre le chiffre et le signe.
                  value: `${cell.percent} %`,
                  top: cell.key === top,
                }))}
              />
            ) : (
              <Muted variant="body">{proV2Labels.discountsNone}</Muted>
            )}

            <SecH
              title={proV2Labels.worksTitle}
              hint={pro.photos.length ? proV2Labels.works(pro.photos.length) : undefined}
            />
            {works.length ? (
              <View style={styles.works} testID="pro-view-works">
                {works.map((p, i) => (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.work,
                      works.length === 1 ? styles.workAlone : i === 0 ? styles.workMain : styles.workSide,
                      works.length === 2 && i === 1 && styles.workTall,
                    ]}
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
                  icon="nav"
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
              <Button variant="secondary" icon="star" onPress={() => setPreviewNote(true)} testID="pro-favorite">
                {proV2Labels.favorite}
              </Button>
            </View>
            {previewNote ? <Notice>{proV2Labels.favoritePreview}</Notice> : null}
          </View>

          {/* Montés en permanence : changer de segment ne perd pas la saisie en cours. */}
          <View style={[styles.stack, mode !== "edit" && styles.hidden]} testID="pro-edit">
            <ProFicheFields state={myPro} siret={<SiretBlock pro={pro} reload={reload} />} />
            <DiscountsBlock pro={pro} reload={reload} />
            <MediaBlock pro={pro} reload={reload} />
          </View>

          <View style={[styles.stack, mode !== "posts" && styles.hidden]} testID="pro-posts">
            {/* Lot 40 : Publier n'est plus un onglet (barre v2) ; on y arrive depuis Ma fiche. */}
            <Button
              variant="secondary"
              icon="add"
              next
              onPress={() => router.push("/(pro)/publier")}
              fullWidth
              testID="pro-new-post"
            >
              Publier une actualité
            </Button>
            <PublicationBlock pro={pro} reload={reload} />
            <PartnersBlock pro={pro} reload={reload} />
            <SubscriptionBlock pro={pro} />
          </View>
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  // La zone qui défile a 16 px de marge et 12 px en haut (`TabScreen`) : la photo les reprend pour aller bord à bord.
  hero: { height: HERO, marginHorizontal: -space4, marginTop: -space3, overflow: "hidden" },
  identity: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space3,
    marginTop: -ID_LIFT - space3,
    zIndex: 3,
  },
  identityText: { flex: 1, minWidth: 0, gap: space1 },
  pills: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: space1 },
  stack: { gap: 16 },
  hidden: { display: "none" },
  // `.works` : grille 2fr / 1fr sur deux rangées ; la première photo prend les deux rangées.
  works: { height: WORK_ROW * 2 + WORK_GAP, flexDirection: "column", flexWrap: "wrap", gap: WORK_GAP },
  work: { borderRadius: 12, overflow: "hidden" },
  workMain: { height: WORK_ROW * 2 + WORK_GAP, width: "66%" },
  workSide: { height: WORK_ROW, width: "32%" },
  workTall: { height: WORK_ROW * 2 + WORK_GAP },
  workAlone: { height: WORK_ROW * 2 + WORK_GAP, width: "100%" },
  workPhoto: { width: "100%", height: "100%" },
  actions: { flexDirection: "row", gap: space3 },
  grow: { flex: 1 },
});
