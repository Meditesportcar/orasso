// Feuille « Mes crews » de l'onglet Crew (lot R7b2, maquette R7.11 `.r7csel`) : le nom du crew affiché (haut compact, partie E) l'ouvre
// quand j'ai plusieurs crews. Le nom ne se tronque jamais. Le rond du crew (`CrewBadge`) sert aussi au haut de l'onglet.
import { Icon, initialsOf, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewLabels, crewTabLabels as L, type MyCrew } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { AppSheet } from "@/ui/AppSheet";
import { CrewDot } from "@/ui/Kit";
import { Overlay } from "@/ui/Overlay";

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

/**
 * La feuille « Mes crews » (la liste, et « Rejoindre ou créer un crew »). Le haut compact du crew (partie E, option B) l'ouvre par
 * le nom du crew affiché (chevron ▾, plusieurs crews) ; elle ne dessine plus la carte du nom.
 */
export function CrewSwitchSheet({
  crews,
  current,
  unread,
  onChoose,
  open,
  onClose,
}: {
  crews: readonly MyCrew[];
  current: Pick<MyCrew, "id">;
  /** Messages non lus de la discussion du crew affiché (ligne sous le nom de la feuille). */
  unread: number;
  onChoose: (slug: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  return (
    <>
      {/* Dans la zone des feuilles de l'écran : rendue dans la zone qui défile, la feuille se caserait en bas du contenu. */}
      <Overlay>
        <AppSheet visible={open} onClose={onClose} accessibilityLabel={L.selectorTitle}>
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
                    onClose();
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
                onClose();
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
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
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
