// Lot C4b (conformité DA v2, D33) : pièces de l'artefact reprises telles quelles pour les casquettes Pro, Prestataire et
// Média, en attendant les composants du socle (lot C1). Chaque pièce porte le nom de sa classe dans l'artefact
// (`.seg`, `.acts-g`, `.pill-o`, `.pro-logo`, `.disc`) et en recopie les valeurs ; les couleurs viennent des jetons.
// À la fusion, `SegBlock` se remplace par le `Seg` du socle s'il en a un (consigné au journal des choix, lot C4b).
// Lot C7 : versé dans le socle (`@/ui/KitTz`, ancien `features/pro/kit.tsx`, qui le réexporte encore).
import { Icon, type IconName, Monogram, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { stubOf } from "@/features/explorer/EventCardV2";

import { mediaSource } from "@/lib/media";
import { useSecHeadStack } from "@/ui/SecHead";

/** Cible tactile d'un segment : le jeton `touch` (48 px), quand le segment n'en montre que 38 (lot 54b). */
const SEG_H = 38;
const SEG_SLOP = (tokens.spacing.touch - SEG_H) / 2;

/**
 * `.seg` : un bloc (fond `--card-2`, rayon 14, 3 px de marge) où les choix se partagent la largeur ; le choix actif
 * prend l'encre (`--ink`) et le texte du fond (`--bg`). Rôles `tablist` / `tab` avec l'état sélectionné.
 */
export function SegBlock<T extends string>({
  items,
  value,
  onChange,
  testID,
  style,
}: {
  items: readonly { id: T; label: string; testID?: string }[];
  value: T;
  onChange: (id: T) => void;
  testID?: string;
  style?: ViewStyle;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.seg, { backgroundColor: c.surfaceRaised }, style]} testID={testID} accessibilityRole="tablist">
      {items.map((s) => {
        const on = value === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => onChange(s.id)}
            accessibilityRole="tab"
            aria-selected={on}
            accessibilityLabel={s.label}
            testID={s.testID}
            style={styles.segHit}
          >
            <View style={[styles.segBtn, on && { backgroundColor: c.ink }]}>
              <Text variant="bodyStrong" color={on ? c.ground : c.inkMuted} style={styles.segText}>
                {s.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export type ActItem = { key: string; label: string; icon: IconName; checked?: boolean };

/**
 * `.acts-g` : tuiles en trois colonnes, icône moutarde au-dessus du libellé centré. En modification
 * (`.acts-g.edit`), la tuile cochée prend l'encre et son icône la moutarde. Le libellé passe à la ligne, jamais coupé.
 */
export function ActGrid({
  items,
  onToggle,
  testID,
}: {
  items: readonly ActItem[];
  onToggle?: (key: string) => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.acts} testID={testID}>
      {items.map((item) => {
        const on = Boolean(onToggle && item.checked);
        const tile = (
          <View
            style={[
              styles.act,
              on
                ? { backgroundColor: c.ink }
                : { backgroundColor: c.surface, borderWidth: 1, borderColor: c.cardLine, boxShadow: undefined },
            ]}
          >
            <Icon name={item.icon} size={24} color={on ? c.accent : c.accentText} />
            <Text variant="bodyStrong" color={on ? c.ground : c.ink} style={styles.actText}>
              {item.label}
            </Text>
          </View>
        );
        return (
          <View key={item.key} style={styles.actCell}>
            {onToggle ? (
              <Pressable
                onPress={() => onToggle(item.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={item.label}
              >
                {tile}
              </Pressable>
            ) : (
              tile
            )}
          </View>
        );
      })}
    </View>
  );
}

/** `.pill-o` : pastille moutarde inclinée à −8°, le O en badge, « Pro validé » / « Vérifié ». */
export function ValidatedPill({ label, testID }: { label: string; testID?: string }) {
  const { t } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: t.color.accent }]} testID={testID}>
      <View style={styles.unskew}>
        <Monogram size={20} tone="dark" alt="" />
      </View>
      <Text variant="meta" color={t.color.accentInk} style={[styles.unskew, styles.pillText]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * `.pro-logo` : logo carré à coins de 20, initiales en chiffres étroits (62 %, 900, 30 px) sur une couleur d'avatar,
 * ou l'image du logo quand il existe. Couleur : jeton `avatar-2` du socle (#2f5fb8 de l'artefact).
 */
export function SquareLogo({
  initials,
  url,
  size = 74,
  tone = "blue",
  label,
}: {
  initials: string;
  url?: string | null;
  size?: number;
  tone?: "blue" | "red";
  label?: string;
}) {
  const { t } = useTheme();
  const box = { width: size, height: size, borderRadius: size * 0.27, boxShadow: t.shadow.shadowCard };
  return url ? (
    <Photo source={mediaSource(url)} style={{ ...styles.logoBox, ...box }} accessibilityLabel={label} />
  ) : (
    <View style={[styles.logoBox, box, { backgroundColor: t.color.avatar2 }]} accessibilityLabel={label}>
      {/* Vitrine : le dégradé de l'artefact, jetons `vitrine-from` → `vitrine-to` du socle. */}
      {tone === "red" ? (
        <Photo
          placeholder={`linear-gradient(135deg, ${t.color.vitrineFrom} 0%, ${t.color.vitrineTo} 100%)`}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Text variant="numberNarrow" color={t.color.nightInk} style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {initials}
      </Text>
    </View>
  );
}

export type DiscTile = { key: string; label: string; value: string; top?: boolean };

/** `.disc` : quatre tuiles (ou moins), petit libellé et grand chiffre 62 % ; la tuile `.top` passe en rouge (`--win`). */
export function DiscGrid({ items, testID }: { items: readonly DiscTile[]; testID?: string }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.disc} testID={testID}>
      {items.map((d) => (
        <View
          key={d.key}
          style={[
            styles.discTile,
            d.top
              ? { backgroundColor: c.win }
              : { backgroundColor: c.surface, borderWidth: 1, borderColor: c.cardLine },
          ]}
          accessibilityLabel={d.top ? `${d.label}, ton grade : ${d.value}` : `${d.label} : ${d.value}`}
        >
          <Text variant="label" color={d.top ? c.winInk : c.inkMuted} style={styles.discLabel}>
            {d.label}
          </Text>
          <Text variant="numberNarrow" color={d.top ? c.winInk : c.ink} style={styles.discValue}>
            {d.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * `.dir-big` : deux grandes tuiles côte à côte, rayon 20, chiffre étroit (62 %) de 64 px ; la première (`.me`) est
 * l'affiche (`--poster` : crème en Béton, noire en Sable), la seconde une carte.
 */
export function DirBig({
  items,
  testID,
}: {
  items: readonly { value: string; label: string; testID?: string }[];
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.dirBig} testID={testID}>
      {items.map((it, i) => {
        const me = i === 0;
        return (
          <View
            key={it.label}
            style={[styles.dirTile, { backgroundColor: me ? c.poster : c.surface, boxShadow: t.shadow.shadowCard }]}
          >
            <Text variant="label" color={me ? c.posterMuted : c.inkMuted}>
              {it.label}
            </Text>
            <Text variant="numberNarrow" color={me ? c.posterInk : c.ink} style={styles.dirNum} testID={it.testID}>
              {it.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** `.sec-h` : titre de section italique large (125 %, 900, 16 px) ; à droite, un mot d'aide ou un lien moutarde. */
export function SecH({
  title,
  hint,
  link,
  onLink,
}: {
  title: string;
  hint?: string;
  link?: string;
  onLink?: () => void;
}) {
  const { t } = useTheme();
  // Lot R5b, tour 2 : l'aide ou le lien reste à droite ; dessous avec une police agrandie ou s'ils ne tiennent pas à
  // côté du titre (`SecHead`, `secHeadLayout`).
  const withLink = Boolean(link && onLink);
  const { stacked, onLayout, titleStyle } = useSecHeadStack({
    title,
    titleSize: 16,
    side: withLink ? link : hint,
    sideSize: withLink ? 13 : tokens.type.caption.fontSize,
    sideExtra: withLink ? 20 : 0,
    gap: 10,
  });
  return (
    <View style={styles.secH} onLayout={onLayout}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header" style={[styles.secTitle, titleStyle]}>
        {title}
      </Text>
      {link && onLink ? (
        <Pressable onPress={onLink} accessibilityRole="link" style={styles.secLink} hitSlop={12}>
          <Text variant="bodyStrong" color={t.color.accentText} style={styles.secLinkText}>
            {link}
          </Text>
          <Icon name="next" size={16} color={t.color.accentText} />
        </Pressable>
      ) : hint ? (
        <Text variant="caption" color={t.color.inkMuted} style={[styles.secHint, stacked && styles.secHintStacked]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** `.tag` : étiquette inclinée à −8°, encre (défaut), moutarde (`.acc`) ou rouge (`.win`). */
export function AngledTag({
  children,
  tone = "ink",
  testID,
}: {
  children: string;
  tone?: "ink" | "acc" | "win" | "line" | "wait";
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  // Encre, moutarde et contour : le `Tag` du socle (lot C1). Rouge (`.win`) et bleu (`.wait`) : pas encore au socle.
  if (tone !== "win" && tone !== "wait") {
    return (
      <Tag tone={tone} testID={testID}>
        {children}
      </Tag>
    );
  }
  const bg = tone === "win" ? c.win : c.statusWaitlist;
  const fg = tone === "win" ? c.winInk : c.nightInk;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]} testID={testID}>
      <Text variant="meta" color={fg} style={[styles.unskew, styles.tagText]}>
        {children}
      </Text>
    </View>
  );
}

/**
 * `.tz-chip` : puce de 30 px, fond `--card-2`, texte 12 px gras ; allumée (`.on`) en moutarde. Touchable : la cible
 * tactile grandit au jeton `touch` sans changer la puce.
 */
export function TzChip({
  label,
  icon,
  on = false,
  onPress,
  kind = "choice",
  testID,
}: {
  label: string;
  icon?: IconName;
  on?: boolean;
  onPress?: () => void;
  /** `choice` : un choix parmi d'autres (radio) ; `toggle` : une bascule (filtre cumulable). */
  kind?: "choice" | "toggle";
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const ink = on ? c.accentInk : c.inkMuted;
  const chip = (
    <View
      style={[
        styles.tzChip,
        on
          ? { backgroundColor: c.accent }
          : { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.cardLine },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={ink} /> : null}
      <Text variant="bodyStrong" color={ink} style={styles.tzChipText}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return <View testID={testID}>{chip}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={kind === "choice" ? "radio" : "togglebutton"}
      accessibilityState={kind === "choice" ? { checked: on } : { selected: on }}
      aria-checked={kind === "choice" ? on : undefined}
      aria-pressed={kind === "toggle" ? on : undefined}
      accessibilityLabel={label}
      hitSlop={{ top: 9, bottom: 9 }}
      testID={testID}
    >
      {chip}
    </Pressable>
  );
}

/** `.evc-date.mini` : souche datée (jour, chiffre étroit 24 px, mois). */
export function MiniDate({ iso }: { iso: string }) {
  const { t } = useTheme();
  const s = stubOf(iso);
  return (
    <View style={styles.mini}>
      <Text variant="label" color={t.color.inkMuted} style={styles.miniSmall}>
        {s.day}
      </Text>
      <Text variant="numberNarrow" color={t.color.ink} style={styles.miniNum}>
        {s.date}
      </Text>
      <Text variant="label" color={t.color.inkMuted} style={styles.miniSmall}>
        {s.month}
      </Text>
      {s.year ? (
        <Text variant="label" color={t.color.inkMuted} style={styles.miniSmall}>
          {s.year}
        </Text>
      ) : null}
    </View>
  );
}

/** `.tz-it` : une ligne de liste posée sur le fond (`--bg`), rayon 12, ombre ; titre gras 13,5 px, légende 11,5 px. */
export function TzRow({
  leading,
  title,
  caption,
  trailing,
  onPress,
  testID,
}: {
  leading?: ReactNode;
  title: string;
  caption?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const body = (
    <View style={[styles.tz, { backgroundColor: c.ground, boxShadow: t.shadow.shadowCard }]}>
      {leading}
      <View style={styles.tzText}>
        <Text variant="bodyStrong" color={c.ink} style={styles.tzTitle}>
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" color={c.inkMuted} style={styles.tzCap}>
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="next" size={18} color={c.ink} /> : null)}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID}>
      {body}
    </Pressable>
  ) : (
    <View testID={testID}>{body}</View>
  );
}

/** `.tz-av` : rond de 36 px, initiales étroites ; couleur prise dans les jetons. */
export function RoundInitials({ text, tone = "red" }: { text: string; tone?: "red" | "blue" | "ink" }) {
  const { t } = useTheme();
  const bg = tone === "red" ? t.color.avatar5 : tone === "blue" ? t.color.avatar2 : t.color.avatar3;
  return (
    <View style={[styles.av, { backgroundColor: bg }]}>
      <Text variant="meta" color={t.color.nightInk} style={styles.avText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", padding: 3, borderRadius: 14, gap: 2 },
  segHit: {
    flex: 1,
    minWidth: 0,
    minHeight: tokens.spacing.touch,
    marginVertical: -SEG_SLOP,
    justifyContent: "center",
  },
  // Un libellé trop long passe sur deux lignes (jamais coupé) : le segment grandit.
  segBtn: {
    minHeight: SEG_H,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  segText: { fontSize: 13, lineHeight: 15, textAlign: "center" },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // Trois colonnes : (100 % − 2 × 8 px) / 3.
  actCell: { width: "31.6%", flexGrow: 1 },
  act: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6,
    minHeight: 72,
    justifyContent: "center",
  },
  actText: { fontSize: 12.5, lineHeight: 15, textAlign: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    height: 26,
    paddingLeft: 3,
    paddingRight: 10,
    borderRadius: 999,
    transform: [{ skewX: "-8deg" }],
  },
  unskew: { transform: [{ skewX: "8deg" }] },
  pillText: { fontSize: 11, letterSpacing: 0.4 },
  logoBox: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  disc: { flexDirection: "row", gap: 6 },
  discTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
  },
  discLabel: { fontSize: 10.5, textAlign: "center" },
  discValue: { fontSize: 30, lineHeight: 30 },
  dirBig: { flexDirection: "row", gap: 10 },
  dirTile: { flex: 1, minWidth: 0, borderRadius: 20, padding: 14, gap: 4 },
  dirNum: { fontSize: 64, lineHeight: 60 },
  // Lot R5b (titres « SON ») : le titre prend la place restante (jamais un mot perdu), l'aide passe dessous au besoin.
  secH: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: 10,
    rowGap: 2,
  },
  secTitle: { flexGrow: 1, flexShrink: 1, fontSize: 16 },
  secHint: { flexShrink: 1, textAlign: "right" },
  secHintStacked: { textAlign: "left" },
  secLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  secLinkText: { fontSize: 13 },
  tag: {
    alignSelf: "flex-start",
    minHeight: 22,
    paddingHorizontal: 9,
    borderRadius: 4,
    justifyContent: "center",
    transform: [{ skewX: "-8deg" }],
  },
  tagText: { fontSize: 11, letterSpacing: 0.6 },
  tzChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 999 },
  tzChipText: { fontSize: 12 },
  mini: { alignItems: "center", paddingRight: 8, minWidth: 40 },
  miniSmall: { fontSize: 10.5 },
  miniNum: { fontSize: 24, lineHeight: 24 },
  tz: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tzText: { flex: 1, minWidth: 0 },
  tzTitle: { fontSize: 13.5 },
  tzCap: { fontSize: 11.5, lineHeight: 15 },
  av: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 12 },
});
