// La ligne « Publier avec… » de l'écran « Publier » (lot R8o, maquette R8.13 `p-collab`) : inviter un co-auteur, une personne, une
// structure, un pro ou un média. Choisi, la ligne dit « <nom> · invité : tant qu'il n'a pas accepté, la publication est
// seulement chez toi. » ; un pro partenaire ajoute la phrase de la « Collaboration commerciale ». Masquée quand « Info
// importante » est cochée (l'écran ne la pose pas alors).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CoAuthorSearchItem, coauthorLabels as T } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CheckBox, SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { CoAuthorPicker } from "./CoAuthorPicker";
import { Note } from "./PublishChoices";

const { space1, space2, space3 } = tokens.spacing;

export function CoAuthorLine({
  value,
  onChange,
  disabled,
}: {
  value: CoAuthorSearchItem | null;
  onChange: (item: CoAuthorSearchItem | null) => void;
  disabled: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [open, setOpen] = useState(false);
  const sub = value ? (value.partner ? T.linePickedPartner(value.name) : T.linePicked(value.name)) : T.lineHint;
  return (
    <View style={styles.block} testID="coauthor-line">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${T.lineTitle} ${sub}`}
        accessibilityState={{ expanded: open, checked: value !== null, disabled }}
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.row, { backgroundColor: c.surface, borderColor: value ? c.accent : c.line }]}
        testID="coauthor-toggle"
      >
        <Icon name="crew" size={22} color={value ? c.accentText : c.ink} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" color={c.ink}>
            {T.lineTitle}
          </Text>
          <Text variant="caption" color={c.inkMuted} testID="coauthor-sub">
            {sub}
          </Text>
        </View>
        <CheckBox on={value !== null} />
      </Pressable>
      {open ? (
        <>
          <CoAuthorPicker
            disabled={disabled}
            onPick={(item) => {
              onChange(item);
              setOpen(false);
            }}
          />
          {value ? (
            <SmButton
              kind="g"
              wide
              icon="close"
              disabled={disabled}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
              testID="coauthor-clear"
            >
              {T.pickClear}
            </SmButton>
          ) : null}
        </>
      ) : null}
      {value ? (
        <>
          <Note lead={T.banner.lead(value.name)} testID="coauthor-banner">
            {T.banner.rest}
          </Note>
          {value.partner ? <Muted variant="caption">{T.partnerNote(value.name)}</Muted> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  flex: { flex: 1, flexShrink: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 + space1,
    minHeight: tokens.spacing.touch,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: space1 / 2,
  },
});
