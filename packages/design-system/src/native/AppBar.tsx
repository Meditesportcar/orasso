// AppBar : l'en-tête. Voir docs/design-system/components/AppBar.
// Lot C1 (D33) : reproduit l'artefact DA v2. Barre d'onglet = `.appbar` (58 px, fond `--bar` uni, filet bas 2 px
// `--bar-line`, logotype 118 px, boutons `.abtn` 38 px rayon 12, pastille `.capchip` « Organisateur ») ; plus de
// métal brossé. Écran de flux = `.flowbar` (pas de barre : titre italique et ✕ carré `.closex` posés sur le fond).

import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import type { IconName } from "../icons";
import { initialsOf } from "../initials";
import { Logo } from "./Brand";
import {
  BAR_ACTION,
  BAR_GAP,
  BAR_PAD_LEFT,
  BAR_PAD_RIGHT,
  CAPCHIP_GAP,
  CAPCHIP_LOGO,
  CAPCHIP_MAX_FONT_SCALE,
  CAPCHIP_PAD_LEFT,
  CAPCHIP_PAD_RIGHT,
  capChipCompact,
  LOGO_NARROW_BELOW,
  LOGO_WIDTH,
  LOGO_WIDTH_NARROW,
} from "./capChipFit";
import { archivoAt } from "./fontFamily";
import { Icon } from "./Icon";
import { Text } from "./text";
import { angle, radius, spacing, useTheme } from "./theme";

/** `.appbar` de l'artefact : 58 px sous la zone de sécurité. */
export const APP_BAR_HEIGHT = 58;
/** Cibles tactiles d'au moins 44 px autour des boutons de 38 px (lot C1, tour 2). */
const HIT_38 = { top: 3, bottom: 3, left: 3, right: 3 };
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

/** Un bouton de l'en-tête (`.abtn`) : 38 px, rayon 12, contour 1,5 px ; compteur `.dot` moutarde. */
export function AppBarAction({ icon, label, onPress, onLongPress, on = false, count, children }: ActionProps) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={HIT_38}
      style={[
        styles.action,
        children ? styles.avatar : null,
        { borderColor: c.barControlEdge, backgroundColor: on ? c.barInk : "transparent" },
      ]}
    >
      {children ?? <Icon name={icon} size={20} color={on ? c.bar : c.barInk} />}
      {count ? (
        <View style={[styles.count, { backgroundColor: c.accent, boxShadow: `0 0 0 2px ${c.bar}` }]}>
          <Text variant="credit" color={c.accentInk} style={styles.countText}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Pastille de casquette à côté du logotype (`.capchip`) : logo rond de la structure (ou ses initiales sur moutarde)
 * et le nom de la casquette. L'artefact ne la montre que pour l'organisateur.
 */
export type AppBarPersona = { logoUrl: string | null; label: string; role?: string; hint?: string };

function CapChip({
  persona,
  compact = false,
  onPress,
  testID,
}: {
  persona: AppBarPersona;
  /** Logo rond seul (écran étroit ou texte agrandi) ; le nom de la casquette reste dans le libellé accessible. */
  compact?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={persona.role ? `${persona.label}, ${persona.role}` : persona.label}
      accessibilityHint={persona.hint}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={{ top: 7, bottom: 7 }}
      testID={testID}
      style={[styles.capchip, persona.role && !compact ? null : styles.capchipRound, { backgroundColor: c.barChip }]}
    >
      <View style={[styles.capLogo, { backgroundColor: persona.logoUrl ? c.night : c.accent }]}>
        {persona.logoUrl ? (
          <Image source={{ uri: persona.logoUrl }} style={styles.capImage} />
        ) : (
          <Text variant="credit" color={c.accentInk} style={styles.capInitials}>
            {initialsOf(persona.label)}
          </Text>
        )}
      </View>
      {persona.role && !compact ? (
        <Text
          variant="label"
          color={c.barInk}
          style={styles.capText}
          numberOfLines={1}
          maxFontSizeMultiplier={CAPCHIP_MAX_FONT_SCALE}
        >
          {persona.role}
        </Text>
      ) : null}
    </Pressable>
  );
}

export type AppBarProps = {
  /**
   * `tab` : le logotype à gauche, la pastille de casquette, puis Recherche et Boîte à droite (✕ Fermer si `onClose`) ;
   * le titre de la page est sous la barre. `flow` : écran de flux (`.flowbar` de l'artefact) : titre italique, ligne
   * de faits, compteur éventuel, ✕ carré. `home` et `page` : barres v1, dépréciées (rendues comme `tab` et `flow`).
   */
  kind: "tab" | "flow" | "home" | "page";
  title?: string;
  /**
   * Écran de flux (lot M7, en-tête de fiche) : une bande à la place du titre (l'organisateur d'une fiche événement) ;
   * le ✕ garde sa place.
   */
  lead?: ReactNode;
  /** Ligne de faits sous le titre (Tri, Scan, Direct) : « Nocturne de Canet · MéditeSportCar · J-2 ». */
  facts?: string;
  /** Écran de flux : compteur de contexte (« 62 / 116 »). */
  counter?: string;
  /** Bouton Recherche (écrans à onglets). */
  onSearch?: () => void;
  searchOn?: boolean;
  /** Barres v1 : cloche, avec son compteur. */
  onNotifications?: () => void;
  notificationsOn?: boolean;
  notificationCount?: number;
  /** Barres v1 : avatar à droite. */
  avatar?: ReactNode;
  onAvatar?: () => void;
  onAvatarLongPress?: () => void;
  avatarLabel?: string;
  avatarDot?: boolean;
  /** Barre `tab` : pastille de casquette à côté du logotype, et son appui. */
  persona?: AppBarPersona;
  onPersona?: () => void;
  /** Barre `tab` : appui (et appui long) sur le logotype. */
  onLogo?: () => void;
  onLogoLongPress?: () => void;
  logoLabel?: string;
  logoHint?: string;
  /** Barre `tab` : la Boîte, avec son compteur ; elle perd son compteur quand on y est. */
  onInbox?: () => void;
  inboxOn?: boolean;
  inboxCount?: number;
  /** Écran de flux (lot R5b) : boutons posés avant le ✕ (`AppBarFlowAction`, ou un petit bouton « Modifier »). */
  actions?: ReactNode;
  /** ✕ Fermer (obligatoire en flux ; facultatif en barre `tab`). */
  onClose?: () => void;
  closeLabel?: string;
  /** Déborde de la marge de 16 px de l'écran, sur toute sa largeur. */
  bleed?: boolean;
  /** Hauteur de la zone de sécurité du haut (encoche, barre d'état), ajoutée au-dessus de la barre. */
  safeTop?: number;
  style?: ViewStyle;
};

/** Le ✕ carré de l'artefact (`.closex`) : 38 px, rayon 12. Sur la barre : contour clair ; en flux : fond de carte. */
function CloseX({ label, onPress, onBar }: { label: string; onPress?: () => void; onBar: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={HIT_38}
      testID="appbar-close"
      style={[
        styles.action,
        // Lot M7 : en flux, le ✕ reste en haut quand le titre passe sur deux lignes (même place sur tous les écrans).
        onBar ? null : styles.closeTop,
        onBar
          ? { borderColor: c.barControlEdge }
          : { backgroundColor: c.surface, borderColor: c.plateLine, borderWidth: 1.5 },
      ]}
    >
      <Icon name="close" size={20} color={onBar ? c.barInk : c.ink} />
    </Pressable>
  );
}

/**
 * Lot R5b (maquette R5.6) : un bouton carré de l'en-tête de fiche, à gauche du ✕ (« Écrire », « ⋯ » du profil d'un
 * membre) : même carré que le ✕ en flux (38 px, rayon 12, fond de carte, filet de plaque).
 */
export function AppBarFlowAction({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={HIT_38}
      testID={testID}
      style={[styles.action, { backgroundColor: c.surface, borderColor: c.plateLine, borderWidth: 1.5 }]}
    >
      <Icon name={icon} size={20} color={c.ink} />
    </Pressable>
  );
}

/**
 * L'en-tête d'onglet : 58 px de barre unie bordée d'un filet moutarde. La marque est toujours le premier élément à
 * gauche ; la navigation « Fermer » est toujours à droite.
 */
export function AppBar({
  kind,
  title,
  lead,
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
  onPersona,
  onLogo,
  onLogoLongPress,
  logoLabel = "Orasso, accueil",
  logoHint,
  onInbox,
  inboxOn,
  inboxCount,
  actions,
  onClose,
  closeLabel = "Fermer",
  bleed = false,
  safeTop = 0,
  style,
}: AppBarProps) {
  const { t } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const c = t.color;
  if (kind === "flow" || kind === "page") {
    // `.flowbar` : posée sur le fond, sans barre ni filet.
    return (
      <View
        accessibilityRole="header"
        style={[
          styles.flow,
          { paddingTop: 12 + safeTop },
          bleed ? null : styles.flowInset,
          bleed && { marginHorizontal: -spacing.space4, paddingHorizontal: spacing.space4 },
          style,
        ]}
      >
        <View style={styles.heading}>
          {lead ?? (
            <>
              <Text variant="posterM" color={c.ink} style={styles.flowTitle} accessibilityRole="header">
                {title}
              </Text>
              {facts ? (
                <Text
                  variant="caption"
                  color={c.inkMuted}
                  // Lot R5b : avec des boutons à côté, la ligne de faits passe à la ligne au lieu de finir en « … ».
                  numberOfLines={actions ? undefined : 1}
                  style={styles.flowFacts}
                >
                  {facts}
                </Text>
              ) : null}
            </>
          )}
        </View>
        {counter ? (
          <View style={[styles.counter, { backgroundColor: c.accent, transform: [{ skewX: `${angle.skew}deg` }] }]}>
            <View style={{ transform: [{ skewX: `${-angle.skew}deg` }] }}>
              <Text variant="meta" color={c.accentInk}>
                {counter}
              </Text>
            </View>
          </View>
        ) : null}
        {actions ? <View style={styles.flowActions}>{actions}</View> : null}
        {onClose || kind === "flow" ? <CloseX label={closeLabel} onPress={onClose} onBar={false} /> : null}
      </View>
    );
  }
  return (
    <View
      accessibilityRole="header"
      style={[
        styles.bar,
        {
          height: APP_BAR_HEIGHT + safeTop,
          paddingTop: safeTop,
          backgroundColor: c.bar,
          borderBottomColor: c.barEdge,
          boxShadow: t.shadow.shadowBarTop,
        },
        bleed && { marginHorizontal: -spacing.space4 },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={logoLabel}
        accessibilityHint={logoHint}
        onPress={onLogo}
        onLongPress={onLogoLongPress}
        disabled={!onLogo && !onLogoLongPress}
        testID="topbar-logo"
      >
        <Logo width={width < LOGO_NARROW_BELOW ? LOGO_WIDTH_NARROW : LOGO_WIDTH} tone="dark" />
      </Pressable>
      {persona ? (
        <CapChip
          persona={persona}
          // Correctif R4 : le rôle en entier s'il tient (« ORGANISATEUR » à 390 px), sinon le logo rond ; jamais de « … »,
          // et la Boîte reste dans l'écran (lot C7).
          compact={capChipCompact({ width, fontScale, role: persona.role, withClose: Boolean(onClose) })}
          onPress={onPersona}
          testID="topbar-persona"
        />
      ) : null}
      {/* Recherche, Boîte (et ✕) poussés à droite : un écart de barre de moins qu'avec une cale (correctif R4). */}
      <View style={styles.end}>
        {kind === "home" ? (
          <>
            {onSearch ? <AppBarAction icon="search" label="Rechercher" onPress={onSearch} on={searchOn} /> : null}
            {onNotifications ? (
              <AppBarAction
                icon="bell"
                label="Journal"
                onPress={onNotifications}
                on={notificationsOn}
                count={notificationsOn ? undefined : notificationCount}
              />
            ) : null}
            {avatar ? (
              <AppBarAction icon="profile" label={avatarLabel} onPress={onAvatar} onLongPress={onAvatarLongPress}>
                {avatar}
                {avatarDot ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
              </AppBarAction>
            ) : null}
          </>
        ) : (
          <>
            <AppBarAction icon="search" label="Rechercher" onPress={onSearch} on={searchOn} />
            <AppBarAction
              icon="inbox"
              label="Boîte"
              onPress={onInbox}
              on={inboxOn}
              count={inboxOn ? undefined : inboxCount}
            />
          </>
        )}
        {onClose ? <CloseX label={closeLabel} onPress={onClose} onBar /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "relative",
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: BAR_GAP,
    paddingLeft: BAR_PAD_LEFT,
    paddingRight: BAR_PAD_RIGHT,
    borderBottomWidth: 2,
  },
  flow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10 },
  flowInset: { paddingHorizontal: spacing.space4 },
  flowTitle: { fontSize: 16, lineHeight: 17 },
  flowFacts: { fontSize: 12.5 },
  end: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: BAR_GAP },
  // Au moins la hauteur du ✕ : un titre d'une ligne reste centré sur lui, comme avant le lot M7.
  heading: { flex: 1, minWidth: 0, minHeight: 38, justifyContent: "center" },
  closeTop: { alignSelf: "flex-start" },
  flowActions: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8 },
  counter: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.radiusSm },
  action: {
    width: BAR_ACTION,
    height: BAR_ACTION,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
  },
  avatar: { padding: 3 },
  capchip: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: CAPCHIP_GAP,
    height: 30,
    paddingLeft: CAPCHIP_PAD_LEFT,
    paddingRight: CAPCHIP_PAD_RIGHT,
    borderRadius: radius.radiusPill,
  },
  capchipRound: { paddingRight: CAPCHIP_PAD_LEFT },
  capLogo: {
    width: CAPCHIP_LOGO,
    height: CAPCHIP_LOGO,
    borderRadius: radius.radiusPill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  capImage: { width: "100%", height: "100%" },
  capInitials: { fontFamily: archivoAt(75, 900), fontSize: 8.5, lineHeight: 10, letterSpacing: 0 },
  capText: { flexShrink: 1, fontFamily: archivoAt(100, 800), fontSize: 11, letterSpacing: 0.33 },
  count: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { textAlign: "center", fontFamily: archivoAt(100, 800), fontSize: 10.5, lineHeight: 12, letterSpacing: 0 },
  dot: { position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: radius.radiusPill },
});
