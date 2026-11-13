// Le haut du Profil, version « Compact » (lot R8b1, décision D40, maquette R8.1 `pr-profil`, option A) : une grille de trois
// colonnes (`.r8id`) : la photo de 72 px, au milieu le pseudo (une ligne, il rapetisse au lieu de se couper), la ligne du
// grade et du département (ou « Suivre » chez un autre) et la bio sur une seule ligne avec « plus », à droite deux icônes
// empilées ; dessous la bande de compteurs (`.r8cnt.band`). Mon profil et le profil d'un autre montent les mêmes briques.
import {
  GradientFill,
  Icon,
  type IconName,
  Text,
  tokens,
  useTheme,
  WordSafeGroup,
  WordSafeText,
  withAlpha,
} from "@orasso/design-system/native";
import { fitWideWordSize, profileTabsLabels as PT } from "@orasso/shared";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { Num } from "@/ui/Kit";

const { space1, space2, space3, space4 } = tokens.spacing;
/** Corps du pseudo (maquette : `.r8idm h1 { font-size: 18px }`). */
const PSEUDO_SIZE = 18;
const SIDE_ICON = 36;

/** `.r8ib.s` : une icône carrée de 36 px, empilée à droite de la photo (la zone tactile déborde de 6 px). */
export function SideIcon({
  icon,
  label,
  onPress,
  testID,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [styles.sideIcon, { backgroundColor: t.color.surfaceRaised }, pressed && styles.pressed]}
    >
      <Icon name={icon} size={20} color={t.color.ink} />
    </Pressable>
  );
}

/**
 * La bio sur une seule ligne (`.r8bio`) : « plus » (avec un chevron bas) la déroule en entier, « moins » la replie. Sans bio,
 * pas de ligne. « plus » n'apparaît que si la bio est vraiment coupée : une copie invisible du texte, sans limite de
 * lignes, est mesurée contre la ligne affichée (même mesure sur le web et sur le téléphone).
 */
export function ProfileBio({
  text,
  testID,
  extra,
}: {
  text: string | null | undefined;
  testID?: string;
  /** Ce que « plus » dévoile sous la bio (l'Instagram du crew) : avec lui, « plus » est toujours là. */
  extra?: ReactNode;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [one, setOne] = useState(0);
  const [full, setFull] = useState(0);
  if (!text) return null;
  const cut = one > 0 && full > one + 2;
  const showToggle = cut || open || Boolean(extra);
  return (
    <>
      <View style={styles.bio}>
        <View style={styles.bioText}>
          <Text
            variant="body"
            color={t.color.inkMuted}
            numberOfLines={open ? undefined : 1}
            style={styles.bioLine}
            onLayout={(e) => {
              if (!open) setOne(e.nativeEvent.layout.height);
            }}
            testID={testID}
          >
            {text}
          </Text>
          {/* Copie de mesure : invisible, hors flux, cachée aux lecteurs d'écran. */}
          <Text
            variant="body"
            style={[styles.bioLine, styles.measure]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            onLayout={(e) => setFull(e.nativeEvent.layout.height)}
          >
            {text}
          </Text>
        </View>
        {showToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? PT.bioLess : PT.bioMore}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            hitSlop={8}
            testID={testID ? `${testID}-toggle` : undefined}
            style={styles.plus}
          >
            <Text variant="bodyStrong" color={t.color.accentText} style={styles.plusText}>
              {open ? PT.bioLess : PT.bioMore}
            </Text>
            <View style={open ? styles.flip : undefined}>
              <Icon name="down" size={14} color={t.color.accentText} />
            </View>
          </Pressable>
        ) : null}
      </View>
      {open && extra ? <View style={styles.extra}>{extra}</View> : null}
    </>
  );
}

/**
 * La grille d'identité : `avatar` (déjà dans son anneau de 72 px), le pseudo, `line` (grade et département, ou « Suivre »),
 * la bio, `side` (deux icônes empilées). Le voile du fond derrière la grille (lisibilité sur les lumières du fond) est gardé.
 */
export function ProfileHead({
  avatar,
  pseudo,
  pseudoTestID,
  line,
  bio,
  bioTestID,
  side,
  testID,
}: {
  avatar: ReactNode;
  pseudo: string;
  pseudoTestID: string;
  line: ReactNode;
  bio?: string | null;
  bioTestID?: string;
  side: ReactNode;
  testID: string;
}) {
  const { t } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [midW, setMidW] = useState(0);
  // Un pseudo long rapetisse (jusqu'à 9) au lieu de se couper ; la police du système compte (`fontScale`).
  const size = fitWideWordSize(pseudo, midW / Math.max(1, fontScale), PSEUDO_SIZE, 9);
  return (
    <View style={styles.id} testID={testID}>
      <GradientFill
        css={`linear-gradient(180deg, ${withAlpha(t.color.ground, 0.82)} 0%, ${withAlpha(t.color.ground, 0.82)} 62%, ${withAlpha(t.color.ground, 0)} 100%)`}
        style={styles.veil}
      />
      {avatar}
      <View style={styles.mid} onLayout={(e) => setMidW(e.nativeEvent.layout.width)}>
        <Text
          variant="posterL"
          color={t.color.ink}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: size, lineHeight: size + 1 }}
          testID={pseudoTestID}
        >
          {pseudo}
        </Text>
        <View style={styles.gl}>{line}</View>
        <ProfileBio text={bio} testID={bioTestID} />
      </View>
      <View style={styles.side}>{side}</View>
    </View>
  );
}

/** Une case de la bande de compteurs. `value` `null` : la lecture n'a pas abouti, la case dit « – ». */
export type BandCell = {
  key: string;
  value: number | null;
  /** Le libellé accordé au nombre (« abonné », « abonnés »). */
  label: string;
  accessibilityLabel: string;
  /** Absent : le nombre n'ouvre rien (sur le profil d'un autre, seuls les partenaires ouvrent quelque chose). */
  onPress?: () => void;
  testID: string;
};

/**
 * `.r8cnt.band` : un trait en haut et en bas, les colonnes séparées d'un trait, le nombre en 18 gras, le libellé dessous.
 * Police agrandie : un libellé ne se coupe jamais (« abonnement / s »), les cases partagent le corps le plus petit.
 */
export function CounterBand({
  cells,
  testID,
  accessibilityLabel,
}: {
  cells: readonly BandCell[];
  testID: string;
  accessibilityLabel: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <WordSafeGroup>
      <View
        style={[styles.band, { borderColor: c.line }]}
        accessibilityRole="summary"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {cells.map((cell, i) => {
          const body = (
            <>
              <Num size={18}>{cell.value === null ? PT.unknownCount : String(cell.value)}</Num>
              <WordSafeText variant="caption" base={11.5} color={c.inkMuted} style={styles.cellLabel}>
                {cell.label}
              </WordSafeText>
            </>
          );
          const box = [styles.cell, i > 0 && { borderLeftWidth: 1, borderLeftColor: c.line }];
          return cell.onPress ? (
            <Pressable
              key={cell.key}
              accessibilityRole="button"
              accessibilityLabel={cell.accessibilityLabel}
              onPress={cell.onPress}
              testID={cell.testID}
              style={({ pressed }) => [...box, pressed && styles.pressed]}
            >
              {body}
            </Pressable>
          ) : (
            <View
              key={cell.key}
              accessible
              accessibilityLabel={cell.accessibilityLabel}
              testID={cell.testID}
              style={box}
            >
              {body}
            </View>
          );
        })}
      </View>
    </WordSafeGroup>
  );
}

const styles = StyleSheet.create({
  id: { flexDirection: "row", alignItems: "flex-start", gap: space3 - 2 },
  veil: { top: -space3, bottom: -space3, left: -space4, right: -space4 },
  mid: { flex: 1, minWidth: 0, gap: 3 },
  gl: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space2, rowGap: 4 },
  side: { gap: 4 },
  sideIcon: {
    width: SIDE_ICON,
    height: SIDE_ICON,
    borderRadius: tokens.radius.radiusSm,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
  bio: { flexDirection: "row", alignItems: "flex-end", gap: space2, minHeight: 24 },
  bioText: { flex: 1, minWidth: 0, position: "relative" },
  bioLine: { fontSize: 13.5, lineHeight: 19 },
  measure: { position: "absolute", left: 0, right: 0, top: 0, opacity: 0 },
  extra: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2, paddingTop: 2 },
  plus: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 24 },
  plusText: { fontSize: 12.5, lineHeight: 16 },
  flip: { transform: [{ rotate: "180deg" }] },
  band: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1 },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    paddingHorizontal: space1,
    gap: 1,
  },
  cellLabel: { textAlign: "center", fontSize: 11.5, lineHeight: 14 },
});
