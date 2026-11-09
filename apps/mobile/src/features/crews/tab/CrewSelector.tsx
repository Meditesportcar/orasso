// Sélecteur de crew de l'onglet Crew (lot R7b2, maquette R7.11 `.r7csel`) : « Roussillon Drift ▾ » ouvre « Mes crews »
// (feuille du kit) quand j'ai plusieurs crews ; avec un seul, le nom seul (pas de chevron). Le nom ne se tronque jamais.
import { Icon, initialsOf, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewLabels, crewTabLabels as L, type MyCrew } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { AppSheet } from "@/ui/AppSheet";
import { CrewDot } from "@/ui/Kit";

const { space2, space3 } = tokens.spacing;

/** Le rond du crew : son logo, sinon ses initiales sur la moutarde (`.cr-mini` de la maquette). */
export function CrewBadge({ crew, size = 40 }: { crew: Pick<MyCrew, "name" | "logoUrl">; size?: number }) {
  const source = mediaSource(crew.logoUrl);
  if (!source) return <CrewDot initials={initialsOf(crew.name).slice(0, 2)} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }} accessibilityElementsHidden>
      <Photo source={source} style={{ width: size, height: size }} />
    </View>
  );
}

export function CrewSelector({
  crews,
  current,
  unread,
  onChoose,
}: {
  crews: readonly MyCrew[];
  current: MyCrew;
  /** Messages non lus de la discussion du crew affiché (ligne sous le nom de la feuille). */
  unread: number;
  onChoose: (slug: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const several = crews.length > 1;
  const sub = [
    crewLabels.membersCount(current.membersCount),
    several ? L.otherCrews(crews.length - 1) : current.role === "leader" ? L.youLeader : L.youMember,
  ].join(" · ");
  const head = (
    <View style={[styles.sel, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
      <CrewBadge crew={current} size={40} />
      <View style={styles.text}>
        <Text variant="posterS" color={c.ink}>
          {current.name}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {sub}
        </Text>
      </View>
      {several ? <Icon name="down" size={20} color={c.inkMuted} /> : null}
    </View>
  );
  if (!several) {
    return (
      <View testID="crew-selector-single" accessibilityRole="header" accessibilityLabel={current.name}>
        {head}
      </View>
    );
  }
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={L.selectorA11y(current.name)}
        testID="crew-selector"
      >
        {head}
      </Pressable>
      <AppSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel={L.selectorTitle}>
        <Text variant="posterM" color={c.ink} accessibilityRole="header">
          {L.selectorTitle}
        </Text>
        <View style={styles.list} testID="crew-selector-list">
          {crews.map((crew) => {
            const on = crew.id === current.id;
            return (
              <Pressable
                key={crew.id}
                onPress={() => {
                  setOpen(false);
                  if (!on) onChoose(crew.slug);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={crew.name}
                testID={`crew-choice-${crew.slug}`}
                style={[styles.row, { backgroundColor: on ? c.surfaceRaised : c.surface, borderColor: c.line }]}
              >
                <CrewBadge crew={crew} size={36} />
                <View style={styles.text}>
                  <Text variant="bodyStrong" color={c.ink}>
                    {crew.name}
                  </Text>
                  <Text variant="caption" color={c.inkMuted}>
                    {on && unread > 0
                      ? `${crewLabels.membersCount(crew.membersCount)} · ${L.unreadMessages(unread)}`
                      : crewLabels.membersCount(crew.membersCount)}
                  </Text>
                </View>
                {on ? <Icon name="check" size={20} color={c.accent} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              setOpen(false);
              router.push("/rejoindre-crew");
            }}
            accessibilityRole="link"
            testID="crew-choice-more"
            style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}
          >
            <Icon name="add" size={22} color={c.ink} />
            <View style={styles.text}>
              <Text variant="bodyStrong" color={c.ink}>
                {L.joinOrCreate}
              </Text>
            </View>
          </Pressable>
        </View>
      </AppSheet>
    </>
  );
}

const styles = StyleSheet.create({
  sel: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2 + 2,
    borderRadius: tokens.radius.radiusLg,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  list: { gap: space2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2 + 2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1,
  },
});
