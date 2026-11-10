// Pièces communes des étapes de la story (lot R7f3) : une ligne de choix à la maquette (`r7opts`), les étiquettes de section,
// et les autocollants posés sur le canevas (événement, lieu, voiture, identifiés, légende).
import { Icon, type IconName, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

/** Une ligne de choix : icône, titre, sous-titre ; le choix actif prend le contour moutarde. */
export function Option({
  icon,
  title,
  hint,
  selected,
  disabled = false,
  onPress,
  testID,
  role = "radio",
}: {
  icon: IconName;
  title: string;
  hint: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  role?: "radio" | "button";
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: c.surface,
          borderColor: selected ? c.accent : c.line,
          opacity: disabled && !selected ? 0.6 : 1,
        },
      ]}
      testID={testID}
    >
      <Icon name={icon} size={22} color={selected ? c.accentText : c.ink} />
      <View style={styles.optionText}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return (
    <Text variant="label" color={t.color.inkMuted}>
      {children}
    </Text>
  );
}

export type OverlayData = {
  caption: string;
  eventTitle: string | null;
  place: string | null;
  vehicle: string | null;
  tags: readonly string[];
  /** « Collaboration commerciale · Wrap 66 » (lot R7m2) : en tête des autocollants, comme sur la story publiée. */
  commercial?: string | null;
};

/**
 * Ce qui se pose sur la story : autocollants en haut à gauche (événement, lieu, voiture), personnes identifiées dessous, la
 * légende en bas. `width` : la largeur du canevas à l'écran (les tailles suivent). Fixe : on ne déplace pas encore les
 * autocollants (à revoir avec Damien).
 */
export function StoryOverlays({ width, data }: { width: number; data: OverlayData }) {
  const { t } = useTheme();
  const c = t.color;
  const fs = Math.max(10, Math.round(width * 0.036));
  const pad = Math.round(width * 0.04);
  const chips: { icon: IconName; text: string; testID: string }[] = [];
  if (data.commercial) chips.push({ icon: "briefcase", text: data.commercial, testID: "story-sticker-commercial" });
  if (data.eventTitle) chips.push({ icon: "ticket", text: data.eventTitle, testID: "story-sticker-event" });
  if (data.place) chips.push({ icon: "place", text: data.place, testID: "story-sticker-place" });
  if (data.vehicle) chips.push({ icon: "vehicle", text: data.vehicle, testID: "story-sticker-vehicle" });
  for (const pseudo of data.tags) chips.push({ icon: "profile", text: pseudo, testID: "story-sticker-tag" });
  return (
    <>
      {chips.length ? (
        <View
          style={[styles.stickers, { left: pad, top: pad, right: pad, gap: Math.round(pad / 2) }]}
          pointerEvents="none"
        >
          {chips.map((chip) => (
            <View
              key={`${chip.testID}:${chip.text}`}
              style={[
                styles.sticker,
                { backgroundColor: c.poster, paddingHorizontal: pad * 0.7, paddingVertical: pad * 0.4 },
              ]}
              testID={chip.testID}
            >
              <Icon name={chip.icon} size={fs + 2} color={c.posterInk} />
              <Text variant="bodyStrong" color={c.posterInk} style={{ fontSize: fs, lineHeight: fs + 4 }}>
                {chip.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {data.caption.trim() ? (
        <View style={[styles.caption, { left: pad, right: pad, bottom: pad * 1.6 }]} pointerEvents="none">
          <Text
            variant="bodyStrong"
            color={c.nightInk}
            style={[
              styles.captionText,
              { fontSize: fs + 2, lineHeight: fs + 8, backgroundColor: withAlpha(c.night, 0.62), padding: pad * 0.6 },
            ]}
            testID="story-caption-overlay"
          >
            {data.caption.trim()}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 2,
  },
  optionText: { flex: 1, gap: space1 / 2 },
  stickers: { position: "absolute", flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" },
  sticker: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 / 2,
    borderRadius: tokens.radius.radiusPill,
    maxWidth: "100%",
  },
  caption: { position: "absolute", alignItems: "center" },
  captionText: { textAlign: "center", borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
});
