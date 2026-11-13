// L'onglet « Prestations » de la page d'un prestataire (lot R9b, T25, maquette R9.3 `pageTabBody` cas `pre`) : la vitrine d'aujourd'hui
// (celle que voit l'organisateur qui trie : métier, menu avec les prix, besoins, zone, avis), au même endroit pour le propriétaire,
// l'organisateur et le passionné. Reprend, sans changer un mot, le corps de la fiche publique d'hier : les réalisations (photos de la
// vitrine, visionneuse), la vitrine, les réseaux. La présentation est dans l'en-tête (la bio) ; le téléphone et l'e-mail ne sont jamais
// envoyés par l'API aux autres comptes.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ProviderPage, proV2Labels } from "@orasso/shared";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { VitrineView } from "@/features/provider/VitrineView";
import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { mediaSource } from "@/lib/media";
import { Overlay } from "@/ui/Overlay";
import { PhotoGrid } from "@/ui/PhotoGrid";
import { SecHead } from "@/ui/SecHead";

const { space1, space3 } = tokens.spacing;

export function PagePrestations({ provider: p }: { provider: ProviderPage }) {
  const { t } = useTheme();
  const [viewer, setViewer] = useState<number | null>(null);
  const links = [
    { label: p.instagram, url: p.instagram },
    { label: p.website, url: p.website },
    { label: p.portfolioUrl, url: p.portfolioUrl },
  ].filter((l): l is { label: string; url: string } => Boolean(l.label && l.url));
  return (
    <View style={styles.wrap} testID="page-prestations">
      {/* Lecture seule : les photos que le prestataire a ajoutées à sa vitrine ; aucune photo, rien à afficher. */}
      {p.photos.length > 0 ? (
        <>
          <SecHead title={proV2Labels.worksTitle} hint={proV2Labels.works(p.photos.length)} />
          <PhotoGrid
            testID="provider-public-photos"
            photos={p.photos.map((photo, i) => ({
              key: photo.id,
              source: mediaSource(photo.url),
              label: `Photo ${i + 1} de ${p.name}`,
            }))}
            onOpen={setViewer}
          />
          <Overlay>
            <PhotoViewer
              photos={p.photos.map((x, i) => ({
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
          </Overlay>
        </>
      ) : null}
      <VitrineView vitrine={p} reviews={p.reviews ?? null} />
      {links.length > 0 ? (
        <View style={styles.links}>
          {links.map((l) => (
            <Text
              key={l.url}
              variant="body"
              color={t.color.ink}
              accessibilityRole="link"
              onPress={() =>
                void Linking.openURL(/^https?:/.test(l.url) ? l.url : `https://${l.url}`).catch(() => undefined)
              }
            >
              {l.label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  links: { gap: space1 },
});
