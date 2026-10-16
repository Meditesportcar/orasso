// AppBar : l'en-tête en métal brossé. Voir docs/design-system/components/AppBar.

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import type { IconName } from "../icons";
import { Logo, Monogram } from "./Brand";
import { Button } from "./Button";
import { textShadowOf, withAlpha } from "./color";
import { Icon } from "./Icon";
import { Metal } from "./Metal";
import { Text } from "./text";
import { angle, radius, spacing, useTheme } from "./theme";

type ActionProps = {
  icon: IconName;
  /** Nom accessible (« Rechercher », « Journal »). */
  label: string;
  onPress?: () => void;
  /** Appui long (l'avatar : retour au passionné). */
  onLongPress?: () => void;
  /** On est sur l'écran que la pastille ouvre : fond bar-ink, icône inversée. */
  on?: boolean;
  /** Pastille de notification : un compteur moutarde. */
  count?: number;
  /** Contenu libre à la place de l'icône (avatar, logo de structure). */
  children?: ReactNode;
};

/** Une pastille d'action de l'en-tête : 34 px, `radius-chip`. */
export function AppBarAction({ icon, label, onPress, onLongPress, on = false, count, children }: ActionProps) {
  const { t, theme } = useTheme();
  const c = t.color;
  const sable = theme === "sable";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.action,
        children ? styles.avatar : null,
        {
          borderWidth: sable ? 2 : 1.5,
          borderColor: sable ? c.barInk : c.line,
          backgroundColor: on ? c.barInk : sable ? withAlpha(c.nightInk, 0.22) : "transparent",
        },
      ]}
    >
      {children ?? <Icon name={icon} size={18} color={on ? c.bar : c.barInk} />}
      {count ? (
        <View style={[styles.count, { backgroundColor: c.accent, boxShadow: t.shadow.neonAccent }]}>
          <Text variant="credit" color={c.accentInk} style={styles.countText}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export type AppBarProps = {
  /**
   * `home` : le logotype complet, sans titre (Accueil). `page` : le monogramme, le titre, puis les trois pastilles
   * Recherche, Cloche, Avatar. `flow` : écran de flux (Scan, Jour J, Candidature) : le monogramme, le titre,
   * l'action de contexte éventuelle, puis ✕ Fermer en dernier.
   */
  kind: "home" | "page" | "flow";
  title?: string;
  /** Ligne de faits sous le titre (Tri, Scan, Direct) : « Nocturne de Canet · MéditeSportCar · J-2 ». */
  facts?: string;
  /** Écran de flux : compteur de contexte (« 62 / 116 »). */
  counter?: string;
  /** Pastille Recherche (écrans à onglets). */
  onSearch?: () => void;
  searchOn?: boolean;
  /** Pastille Cloche, avec son compteur ; elle perd son compteur quand on est sur la Boîte. */
  onNotifications?: () => void;
  notificationsOn?: boolean;
  notificationCount?: number;
  /** Avatar à droite : photo du compte, ou logo de la structure active. Il ouvre « Moi ». */
  avatar?: ReactNode;
  onAvatar?: () => void;
  /** Appui long sur l'avatar : retour au passionné quand une autre casquette est active (lot 16). */
  onAvatarLongPress?: () => void;
  avatarLabel?: string;
  /** Une autre casquette a quelque chose à traiter : pastille moutarde sur l'avatar. */
  avatarDot?: boolean;
  /** Écran de flux : ✕ Fermer. */
  onClose?: () => void;
  closeLabel?: string;
  /** Déborde de la marge de 16 px de l'écran, sur toute sa largeur. */
  bleed?: boolean;
  /** Hauteur de la zone de sécurité du haut (encoche, barre d'état), ajoutée au-dessus des 64 px. */
  safeTop?: number;
  style?: ViewStyle;
};

/**
 * L'en-tête : 64 px de métal brossé bordé d'un filet moutarde. La marque est toujours le premier élément à
 * gauche (même O, même place d'un écran à l'autre) ; la navigation « Fermer » est toujours à droite.
 */
export function AppBar({
  kind,
  title,
  facts,
  counter,
  onSearch,
  searchOn,
  onNotifications,
  notificationsOn,
  notificationCount,
  avatar,
  onAvatar,
  onAvatarLongPress,
  avatarLabel = "Moi et mes casquettes",
  avatarDot,
  onClose,
  closeLabel = "Fermer",
  bleed = false,
  safeTop = 0,
  style,
}: AppBarProps) {
  const { t, theme } = useTheme();
  const c = t.color;
  const showTabActions = kind !== "flow";
  const emboss = textShadowOf(t.shadow.embossBar);
  const titleSize =
    facts && kind === "flow" ? { fontSize: 12, lineHeight: 14 } : facts ? { fontSize: 13, lineHeight: 15 } : null;
  return (
    <View
      accessibilityRole="header"
      style={[
        styles.bar,
        {
          height: spacing.barTop + safeTop,
          paddingTop: 12 + safeTop,
          borderBottomWidth: t.barEdgeHeader,
          borderBottomColor: c.barEdge,
          boxShadow: t.shadow.shadowBarTop,
        },
        bleed && { marginHorizontal: -spacing.space4 },
        style,
      ]}
    >
      <Metal />
      {kind === "home" ? <Logo width={spacing.brandLogo} /> : <Monogram />}
      {kind === "home" ? (
        <View style={styles.spacer} />
      ) : (
        <View style={styles.heading}>
          <Text variant="title" color={c.barInk} style={[titleSize, emboss]} accessibilityRole="header">
            {title}
          </Text>
          {facts ? (
            <Text variant="label" color={c.barMuted} numberOfLines={1}>
              {facts}
            </Text>
          ) : null}
        </View>
      )}
      {kind === "flow" && counter ? (
        <View
          style={[
            styles.counter,
            { borderColor: c.accent, backgroundColor: theme === "sable" ? c.accent : "transparent" },
            { transform: [{ skewX: `${angle.skew}deg` }] },
          ]}
        >
          <View style={{ transform: [{ skewX: `${-angle.skew}deg` }] }}>
            <Text variant="meta" color={theme === "sable" ? c.accentInk : c.accent}>
              {counter}
            </Text>
          </View>
        </View>
      ) : null}
      {showTabActions && (
        <>
          <AppBarAction icon="search" label="Rechercher" onPress={onSearch} on={searchOn} />
          <AppBarAction
            icon="bell"
            label="Journal"
            onPress={onNotifications}
            on={notificationsOn}
            count={notificationsOn ? undefined : notificationCount}
          />
          {avatar ? (
            <AppBarAction icon="profile" label={avatarLabel} onPress={onAvatar} onLongPress={onAvatarLongPress}>
              {avatar}
              {avatarDot ? (
                <View style={[styles.dot, { backgroundColor: c.accent, boxShadow: t.shadow.neonAccentSoft }]} />
              ) : null}
            </AppBarAction>
          ) : null}
        </>
      )}
      {kind === "flow" && <Button variant="close" label={closeLabel} onPress={onClose} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  spacer: { flex: 1 },
  heading: { flex: 1, minWidth: 0 },
  counter: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderRadius: radius.radiusSm,
  },
  action: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.radiusChip,
  },
  avatar: { padding: 3 },
  count: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 16,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: radius.radiusPill,
    alignItems: "center",
  },
  countText: { textAlign: "center" },
  dot: { position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: radius.radiusPill },
});
