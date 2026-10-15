// VehicleCard : photo pleine, nom en italique d'affiche, catégories. Voir docs/design-system/components/VehicleCard.

import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Chip } from "./Chip";
import { GradientFill } from "./Gradient";
import { Photo, type PhotoProps } from "./Photo";
import { Plate } from "./Plate";
import { Text } from "./text";
import { radius, useTheme } from "./theme";

export type VehicleCategory = {
  label: string;
  /** La catégorie recherchée par l'événement : en moutarde. */
  highlighted?: boolean;
};

export type VehicleCardProps = {
  /** Photo pleine (image ou dégradé de maquette), fondue vers photo-fade sur les 45 % du bas. */
  photo?: Pick<PhotoProps, "source" | "placeholder">;
  /** 156 px pour la première carte du garage, 120 px pour les suivantes. */
  first?: boolean;
  /** Tag « Certifié » en haut à gauche. */
  certified?: boolean;
  /** « 6 photos » en haut à droite. */
  photoCount?: number;
  /** Nom du véhicule : jamais tronqué, il passe sur deux lignes. */
  name: string;
  year?: number | string;
  /** Puissance (« 250 ch »). */
  power?: string;
  categories?: readonly VehicleCategory[];
  /** Ligne de faits (« 8 événements · dernier : Nocturne de Canet »). */
  facts?: ReactNode;
  style?: ViewStyle;
};

/**
 * La carte d'un véhicule : une photo pleine, un nom en italique d'affiche, ses catégories. C'est une plaque, dans
 * les deux thèmes. La signature « ORASSO » n'est pas ici mais sur la carte profil au-dessus (une par écran).
 */
export function VehicleCard({
  photo,
  first = false,
  certified = false,
  photoCount,
  name,
  year,
  power,
  categories = [],
  facts,
  style,
}: VehicleCardProps) {
  const { t } = useTheme();
  const c = t.color;
  const specs = [year, power].filter(Boolean).join(" · ");
  return (
    <Plate style={[styles.card, style]} accessibilityLabel={name}>
      <View style={{ height: first ? 156 : 120 }}>
        {photo ? <Photo {...photo} style={StyleSheet.absoluteFill} /> : null}
        {/* La photo se fond vers le graphite sur les 45 % du bas. Jamais de filtre de couleur sur la photo. */}
        <GradientFill css={`linear-gradient(180deg, transparent 55%, ${c.photoFade} 100%)`} />
        {certified && (
          <View style={[styles.tag, styles.tagLeft, { backgroundColor: c.poster }]}>
            <Text variant="credit" color={c.posterInk} style={styles.tagText}>
              Certifié
            </Text>
          </View>
        )}
        {photoCount ? (
          <View style={[styles.tag, styles.tagRight, { backgroundColor: c.scrim }]}>
            <Text variant="credit" color={c.nightInk} style={styles.tagText}>
              {photoCount} photos
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="posterM" color={c.plateInk} style={styles.name}>
            {name}
          </Text>
          {specs ? (
            <Text variant="meta" color={c.plateMuted}>
              {specs}
            </Text>
          ) : null}
        </View>
        {categories.length > 0 && (
          <View style={styles.chips}>
            {categories.map((category) => (
              <Chip key={category.label} surface="plate" lit={category.highlighted}>
                {category.label}
              </Chip>
            ))}
          </View>
        )}
        {facts ? (
          <Text variant="body" color={c.plateMuted} style={styles.facts}>
            {facts}
          </Text>
        ) : null}
      </View>
    </Plate>
  );
}

export type VehicleThumbProps = {
  /** Photo de 84 px de haut, coupée à 10°. */
  photo?: Pick<PhotoProps, "source" | "placeholder">;
  title: string;
  /** Faits (« Dim 25 oct · 12 km · 40 pl. »). */
  meta?: ReactNode;
  style?: ViewStyle;
};

/** La vignette (Autour de moi, Explorer) : 150 px, photo coupée, titre poster-s, faits meta. */
export function VehicleThumb({ photo, title, meta, style }: VehicleThumbProps) {
  const { t } = useTheme();
  return (
    <View style={[styles.thumb, style]}>
      <Photo {...photo} cut="thumb" style={styles.thumbPhoto} />
      <Text variant="posterS" color={t.color.ink} style={styles.thumbTitle}>
        {title}
      </Text>
      {meta ? (
        <Text variant="meta" color={t.color.inkMuted} style={styles.thumbMeta}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", padding: 0 },
  tag: { position: "absolute", top: 10, zIndex: 1, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  tagLeft: { left: 12 },
  tagRight: { right: 12 },
  tagText: { fontSize: 10, lineHeight: 12, letterSpacing: 0.8 },
  body: { gap: 6, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14 },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  name: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  facts: { fontSize: 13, lineHeight: 18 },
  thumb: { width: 150 },
  thumbPhoto: { height: 84, borderRadius: radius.radiusMd },
  thumbTitle: { marginTop: 6 },
  thumbMeta: { fontSize: 10, lineHeight: 13 },
});
