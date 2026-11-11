// L'onglet « Présentation » de la fiche d'un pro (lot R8g, maquette R8.6 : « Présentation · Publications · Mentions ») : tout le
// contenu de la fiche d'hier, au même endroit pour que rien ne disparaisse : métiers, adresse ou zone, présentation, Appeler et
// Itinéraire, « Ses partenaires » (R7m1), réalisations (la visionneuse est celle de l'écran), remises par grade, horaires, contact,
// organisateurs partenaires, « offres et actualités » (jusqu'à R9c, qui en fera des publications « Offre »).
import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, grades, type ProPublic, proActivityLabels, weekdayLabels, weekdays } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { PartnersSection } from "@/features/partnerships/PartnersSection";
import { mediaSource } from "@/lib/media";
import { PhotoGrid } from "@/ui/PhotoGrid";
import { SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export function ProPresentation({
  pro: p,
  onOpenPhoto,
  onTrack,
}: {
  pro: ProPublic;
  onOpenPhoto: (index: number) => void;
  onTrack: (kind: "call" | "route") => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const where = p.city
    ? [p.addressLine, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : p.interventionDepartments.length > 0
      ? `Intervient : ${p.interventionDepartments.join(", ")}`
      : "";
  const discounts = grades.filter((g) => p.discounts[g] !== undefined);
  const hours = weekdays.filter((d) => p.hours[d]);
  const hasPosition = p.lat !== null && p.lng !== null;
  return (
    <View style={styles.wrap} testID="pro-presentation">
      <Plate style={styles.block} testID="pro-about">
        <ChipRow>
          {p.activities.map((a) => (
            <Chip key={a} surface="plate">
              {proActivityLabels[a]}
            </Chip>
          ))}
        </ChipRow>
        {where ? (
          <Text variant="meta" color={t.color.plateMuted}>
            {where}
          </Text>
        ) : null}
        {p.description ? (
          <Text variant="body" color={t.color.plateInk}>
            {p.description}
          </Text>
        ) : null}
      </Plate>

      <View style={styles.row}>
        {p.phone ? (
          <Button
            variant="secondary"
            icon="phone"
            onPress={() => {
              onTrack("call");
              void Linking.openURL(`tel:${p.phone?.replace(/\s+/g, "")}`).catch(() => undefined);
            }}
            testID="pro-call"
          >
            Appeler
          </Button>
        ) : null}
        {hasPosition ? (
          <Button
            variant="secondary"
            icon="place"
            onPress={() => {
              onTrack("route");
              void Linking.openURL(`https://www.openstreetmap.org/directions?to=${p.lat}%2C${p.lng}`).catch(
                () => undefined,
              );
            }}
            testID="pro-route"
          >
            Itinéraire
          </Button>
        ) : null}
      </View>

      {/* Lot R7m1 : « Ses partenaires » (les passionnés à partenariat actif ; l'API ne sert rien sans compte connecté). */}
      <PartnersSection items={p.memberPartners ?? []} total={p.memberPartnersTotal} slug={p.slug} onPlate />

      {/* Lot 36 : les photos de réalisations, comme sur le site. */}
      {p.photos.length > 0 ? (
        <>
          <SectionTitle>Réalisations</SectionTitle>
          <PhotoGrid
            photos={p.photos.map((x, i) => ({
              key: x.id,
              source: mediaSource(x.url),
              label: `Réalisation ${i + 1} en plein écran`,
            }))}
            onOpen={onOpenPhoto}
            testID="pro-public-photos"
          />
        </>
      ) : null}

      {discounts.length > 0 ? (
        <>
          <SectionTitle>Remises selon ton grade</SectionTitle>
          <Plate style={styles.block} testID="pro-discounts">
            {discounts.map((g) => (
              <Text key={g} variant="body" color={t.color.plateInk}>
                {`${gradeLabels[g]} : −${p.discounts[g]} %`}
              </Text>
            ))}
          </Plate>
        </>
      ) : null}

      {hours.length > 0 ? (
        <>
          <SectionTitle>Horaires</SectionTitle>
          <Plate style={styles.block}>
            {hours.map((d) => (
              <Text key={d} variant="body" color={t.color.plateInk}>
                {`${weekdayLabels[d]} : ${p.hours[d]}`}
              </Text>
            ))}
          </Plate>
        </>
      ) : null}

      {p.website || p.email ? (
        <>
          <SectionTitle>Contact</SectionTitle>
          <Plate style={styles.block}>
            {p.website ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(p.website as string).catch(() => undefined)}
              >
                <Text variant="body" color={t.color.plateInk}>
                  {p.website}
                </Text>
              </Pressable>
            ) : null}
            {p.email ? (
              <Text variant="body" color={t.color.plateInk}>
                {p.email}
              </Text>
            ) : null}
          </Plate>
        </>
      ) : null}

      {p.partners.length > 0 ? (
        <>
          <SectionTitle>Partenaire de</SectionTitle>
          {p.partners.map((o) => (
            <Pressable key={o.slug} accessibilityRole="link" onPress={() => router.push(`/o/${o.slug}`)}>
              <Plate style={styles.block}>
                <Text variant="posterS" color={t.color.plateInk}>
                  {o.name}
                </Text>
                {o.city ? (
                  <Text variant="meta" color={t.color.plateMuted}>
                    {o.city}
                  </Text>
                ) : null}
              </Plate>
            </Pressable>
          ))}
        </>
      ) : null}

      {p.posts && p.posts.length > 0 ? (
        <>
          <SectionTitle>Offres et actualités</SectionTitle>
          {p.posts.map((post) => (
            <Plate key={post.id} style={styles.block}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {post.title}
              </Text>
              <Text variant="body" color={t.color.plateInk}>
                {post.body}
              </Text>
            </Plate>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  block: { gap: space1, padding: space3 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
