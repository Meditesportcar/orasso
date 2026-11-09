// Étiquette « À propos de » (lot M4, maquette 4.2, retour 21) : l'événement dont parle un message écrit depuis sa fiche.
// Bordée de moutarde (`.ctx`), elle ouvre la fiche ; la même dans la feuille « Écrire à » et dans la conversation, des
// deux côtés (l'API la porte sur le message).
import { Icon, Text, useTheme } from "@orasso/design-system/native";
import { type MessageAbout, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDay } from "@/lib/format";

export function AboutCard({ about, link = true }: { about: MessageAbout; link?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const when = [formatDay(about.startsAt), about.city].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole={link ? "link" : undefined}
      accessibilityLabel={`${messagingLabels.aboutEvent} : ${about.title}, ${when}`}
      disabled={!link}
      onPress={() => router.push(`/e/${about.slug}`)}
      style={[styles.ctx, { backgroundColor: c.surface, borderColor: c.accent }]}
      testID="message-about"
    >
      <View style={[styles.th, { backgroundColor: c.surfaceSunken }]}>
        <Icon name="calendar" size={20} color={c.accentText} />
      </View>
      <View style={styles.grow}>
        <Text variant="label" color={c.accentText} style={styles.small}>
          {messagingLabels.aboutEvent}
        </Text>
        <Text variant="bodyStrong" color={c.ink} style={styles.title}>
          {about.title}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.when}>
          {when}
        </Text>
      </View>
      {link ? <Icon name="next" size={18} color={c.inkMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `.ctx` : rayon 14, padding 8, filet moutarde de 1,5 px.
  ctx: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 14, borderWidth: 1.5 },
  th: { width: 44, height: 52, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0, gap: 1 },
  small: { fontSize: 10.5, lineHeight: 13 },
  title: { fontSize: 14, lineHeight: 18, fontFamily: "Archivo-ExtraBold" },
  when: { fontSize: 12, lineHeight: 16 },
});
