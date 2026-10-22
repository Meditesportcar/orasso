// Petites pièces de l'artefact DA v2 communes aux écrans du passionné (lot C2a) : l'étiquette inclinée `.tag` et le
// petit bouton d'action de carte `.btn.sm`. Après la fusion du socle (lot C1) : l'étiquette passe par son `Tag` ; le socle
// n'a ni `Button` taille `sm` ni `Seg` : ils restent ici. Valeurs relevées dans l'artefact :
// `.tag` h 22, padding 0 9, skewX(-8deg), rayon 4, Archivo 80 % 800 11 px, interlettrage .06em, capitales ;
// `.btn.sm` h 40, padding 0 12, rayon 10, Archivo 118 % 900 12 px, capitales, icône 16 px.
import { Icon, type IconName, Tag, Text, useTheme } from "@orasso/design-system/native";
import { Pressable, StyleSheet, View } from "react-native";

import { useOnTicketPoster } from "./Ticket";

export type TagTone = "ink" | "acc" | "line" | "wait" | "win";

/**
 * L'étiquette inclinée de l'artefact : le `Tag` du socle (lot C1) pour l'encre, la moutarde et le contour ; `wait`
 * (liste d'attente, bleu) et `win` (annulé, rouge) n'existent pas dans le `Tag` du socle : rendus ici aux mêmes cotes.
 * `onPoster` : sur une carte d'affiche (`.poster .tag`), l'encre de l'affiche.
 */
export function SkewTag({
  children,
  tone = "ink",
  onPoster: onPosterProp,
  testID,
}: {
  children: string;
  tone?: TagTone;
  onPoster?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const inTicket = useOnTicketPoster();
  const onPoster = onPosterProp ?? inTicket;
  if (tone === "ink" || tone === "acc" || tone === "line") {
    return (
      <Tag tone={tone} on={onPoster ? "poster" : "card"} testID={testID}>
        {children}
      </Tag>
    );
  }
  const look = tone === "wait" ? { bg: c.statusWaitlist, fg: c.barInk } : { bg: c.win, fg: c.winInk };
  return (
    <View testID={testID} style={[styles.tag, { backgroundColor: look.bg }]}>
      <Text variant="label" color={look.fg} style={styles.tagText} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** Le petit bouton d'une carte : `p` moutarde (seul néon permis), `s` encadré, `k` encre pleine, `g` fantôme. */
export function SmallButton({
  icon,
  children,
  kind = "s",
  onPress,
  onPoster: onPosterProp,
  disabled,
  testID,
}: {
  icon: IconName;
  children: string;
  kind?: "p" | "s" | "k" | "g";
  onPress?: () => void;
  onPoster?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const inTicket = useOnTicketPoster();
  const onPoster = onPosterProp ?? inTicket;
  const ink = onPoster ? c.posterInk : c.ink;
  const look =
    kind === "p"
      ? { bg: c.accent, fg: c.accentInk, border: undefined }
      : kind === "k"
        ? { bg: ink, fg: onPoster ? c.poster : c.ground, border: undefined }
        : kind === "g"
          ? { bg: "transparent", fg: ink, border: undefined }
          : { bg: onPoster ? "transparent" : c.surface, fg: ink, border: onPoster ? c.posterMuted : c.line };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      onPress={onPress}
      disabled={disabled || !onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        kind === "g" && styles.ghost,
        { backgroundColor: look.bg, opacity: disabled ? 0.5 : 1 },
        look.border ? { borderWidth: 1.5, borderColor: look.border } : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Icon name={icon} size={16} color={look.fg} />
      <Text variant="button" color={look.fg} style={styles.btnText} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tag: {
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 4,
    alignSelf: "flex-start",
    justifyContent: "center",
    transform: [{ skewX: "-8deg" }],
  },
  tagText: { fontSize: 11, lineHeight: 13, letterSpacing: 0.66, transform: [{ skewX: "8deg" }] },
  btn: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  ghost: { paddingHorizontal: 6 },
  btnText: { fontSize: 12, lineHeight: 15 },
  pressed: { transform: [{ scale: 0.97 }] },
});

const rankOf = (n: number) => (n === 1 ? "1er" : `${n}e`);

/** Le statut d'une candidature en étiquette inclinée (artefact : Retenue `acc`, En attente `line`, Attente `wait`). */
export function applicationTag(
  app: { status: string; checkedInAt?: string | null; waitlistRank?: number | null },
  short = false,
): { label: string; tone: TagTone } {
  switch (app.status) {
    case "accepted":
      return app.checkedInAt ? { label: "Sur place", tone: "acc" } : { label: "Retenue", tone: "acc" };
    case "pending":
      return { label: "En attente", tone: "line" };
    case "offered":
      return { label: "Place libérée", tone: "acc" };
    case "waitlisted": {
      const head = short ? "Attente" : "Liste d'attente";
      return { label: app.waitlistRank ? `${head} · ${rankOf(app.waitlistRank)}` : head, tone: "wait" };
    }
    case "awaiting_member":
      return { label: "À confirmer", tone: "line" };
    case "refused":
      return { label: "Refusée", tone: "ink" };
    case "cancelled":
      return { label: "Annulé", tone: "win" };
    default:
      return { label: "Candidature", tone: "line" };
  }
}

/** `applicationTag` rendu en étiquette. */
export function ApplicationTag({
  app,
  short,
  onPoster,
}: {
  app: { status: string; checkedInAt?: string | null; waitlistRank?: number | null };
  short?: boolean;
  onPoster?: boolean;
}) {
  const tag = applicationTag(app, short);
  return (
    <SkewTag tone={tag.tone} onPoster={onPoster}>
      {tag.label}
    </SkewTag>
  );
}

/**
 * `.seg` de l'artefact : un bloc de fond `--card-2`, rayon 14, padding 3 ; segment de 38 px, rayon 11, 13 px 750,
 * l'actif en encre pleine. Chaque segment est un onglet (`tab`, `selected`).
 */
export function Seg<T extends string>({
  items,
  value,
  onChange,
  testID,
}: {
  items: readonly { id: T; label: string; testID?: string }[];
  value: T;
  onChange: (id: T) => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[segStyles.seg, { backgroundColor: c.surfaceRaised }]} accessibilityRole="tablist" testID={testID}>
      {items.map((s) => {
        const on = s.id === value;
        return (
          <Pressable
            key={s.id}
            onPress={() => onChange(s.id)}
            accessibilityRole="tab"
            aria-selected={on}
            accessibilityLabel={s.label}
            testID={s.testID}
            style={[segStyles.segItem, on ? { backgroundColor: c.ink } : null]}
          >
            <Text variant="bodyStrong" color={on ? c.ground : c.inkMuted} style={segStyles.segText} numberOfLines={1}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  seg: { flexDirection: "row", padding: 3, borderRadius: 14, gap: 2 },
  segItem: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segText: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
});
