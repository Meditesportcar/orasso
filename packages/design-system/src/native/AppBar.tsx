// AppBar : l'en-tête en métal brossé. Voir docs/design-system/components/AppBar.

import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import type { IconName } from "../icons";
import { Logo, Monogram } from "./Brand";
import { Button } from "./Button";
import { textShadowOf } from "./color";
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
  const { t } = useTheme();
  const c = t.color;
  // DA v2 : la barre est nuit dans les deux thèmes, la pastille aussi (plus de variante Sable).
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
          borderWidth: 1.5,
          borderColor: c.line,
          backgroundColor: on ? c.barInk : "transparent",
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

/** Pastille de casquette à côté du logotype (DA v2) : logo rond de la structure, ou son initiale. */
export type AppBarPersona = { logoUrl: string | null; label: string };

export type AppBarProps = {
  /**
   * `tab` (DA v2, lot 38) : le logotype toujours à gauche (128 px, 112 px sous 360 px), la pastille de casquette,
   * puis Recherche et Boîte à droite (✕ Fermer si `onClose`) ; le titre de la page est un `BigTitle` sous la barre.
   * `flow` : écran de flux (Scan, Jour J, Candidature) : le monogramme, le titre, l'action de contexte éventuelle,
   * puis ✕ Fermer en dernier. `home` et `page` : barres v1, dépréciées (remplacées par `tab` au lot 40).
   */
  kind: "tab" | "flow" | "home" | "page";
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
  /** Barre `tab` : pastille de casquette à côté du logotype. */
  persona?: AppBarPersona;
  /** Barre `tab` : la Boîte, avec son compteur ; elle perd son compteur quand on y est. */
  onInbox?: () => void;
  inboxOn?: boolean;
  inboxCount?: number;
  /** Écran de flux : ✕ Fermer (et, en barre `tab`, une fermeture facultative). */
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
  persona,
  onInbox,
  inboxOn,
  inboxCount,
  onClose,
  closeLabel = "Fermer",
  bleed = false,
  safeTop = 0,
  style,
}: AppBarProps) {
  const { t, theme } = useTheme();
  const { width } = useWindowDimensions();
  const c = t.color;
  const showTabActions = kind !== "flow";
  const barStyle = [
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
  ];
  if (kind === "tab") {
    return (
      <View accessibilityRole="header" style={barStyle}>
        <Metal />
        <Logo width={width < 360 ? 112 : spacing.brandLogo} tone="dark" />
        {persona ? (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={persona.label}
            style={[styles.persona, { borderColor: c.line, backgroundColor: c.night }]}
          >
            {persona.logoUrl ? (
              <Image source={{ uri: persona.logoUrl }} style={styles.personaImage} />
            ) : (
              <Text variant="label" color={c.barInk}>
                {persona.label.trim().charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        ) : null}
        <View style={styles.spacer} />
        <AppBarAction icon="search" label="Rechercher" onPress={onSearch} on={searchOn} />
        <AppBarAction
          icon="inbox"
          label="Boîte"
          onPress={onInbox}
          on={inboxOn}
          count={inboxOn ? undefined : inboxCount}
        />
        {onClose ? <Button variant="close" label={closeLabel} onPress={onClose} /> : null}
      </View>
    );
  }
  const emboss = textShadowOf(t.shadow.embossBar);
  const titleSize =
    facts && kind === "flow" ? { fontSize: 12, lineHeight: 14 } : facts ? { fontSize: 13, lineHeight: 15 } : null;
  return (
    <View accessibilityRole="header" style={barStyle}>
      <Metal />
      {kind === "home" ? <Logo width={spacing.brandLogo} tone="dark" /> : <Monogram tone="dark" />}
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
  persona: {
    width: 30,
    height: 30,
    borderRadius: radius.radiusPill,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  personaImage: { width: "100%", height: "100%" },
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
