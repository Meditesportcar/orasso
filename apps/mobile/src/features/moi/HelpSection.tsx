// Aide (lot 42 ; lot M5 : maquette 7.3). « Revoir le tuto » : une carte par casquette de la personne, qui ouvre vraiment
// le tuto de cette casquette (lot C3, `features/tuto`) ; les questions fréquentes (candidater, liste d'attente, QR et
// jour J, points, certification, floutage) ; « Nous écrire » (l'équipe Orasso par e-mail, signaler un problème) ; une
// ligne qui dit où sont passés les sanctions (Compte) et l'export des données (Confidentialité) ; la version de l'appli.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  CONTACT_EMAIL,
  helpFaq,
  helpLabels,
  type MainProfile,
  tutoProfileNames,
  tutoReplayCaptions,
  tutoSlides,
} from "@orasso/shared";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { replayProfiles } from "@/features/tuto/model";
import { useSession } from "@/lib/session";
import { SecHead } from "@/ui/SecHead";

const { space1, space2, space3 } = tokens.spacing;

/** Un e-mail préparé (destinataire, sujet, corps) ; le client de messagerie de l'appareil s'ouvre. */
export function mailto(subject: string, body?: string): string {
  const q = [`subject=${encodeURIComponent(subject)}`, ...(body ? [`body=${encodeURIComponent(body)}`] : [])];
  return `mailto:${CONTACT_EMAIL}?${q.join("&")}`;
}

/** `.tuto-b` : rond moutarde « lecture », nom de la casquette, ce que montre le tuto et le nombre d'écrans. */
function TutoCard({ profile, onPress }: { profile: MainProfile; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const count = tutoSlides[profile].length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${helpLabels.replay} : ${tutoProfileNames[profile]}`}
      onPress={onPress}
      testID={`replay-tuto-${profile}`}
      style={({ pressed }) => [
        styles.tuto,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.play, { backgroundColor: c.accent }]}>
        {/* Le triangle « lecture » de la maquette (`.tuto-b .pi`). */}
        <Svg width={16} height={16} viewBox="0 0 24 24" style={styles.playIcon}>
          <Path d="M7 4l13 8-13 8z" fill={c.accentInk} />
        </Svg>
      </View>
      <Text variant="bodyStrong" color={c.ink} style={styles.tutoName}>
        {tutoProfileNames[profile]}
      </Text>
      <Text variant="caption" color={c.inkMuted} style={styles.tutoCap}>
        {`${tutoReplayCaptions[profile]} · ${count} écrans`}
      </Text>
    </Pressable>
  );
}

/** Une question de la FAQ, repliable (`.faq details`). */
function Faq({
  q,
  a,
  open,
  onToggle,
  first,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
  first: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={!first ? { borderTopWidth: 1, borderTopColor: c.line } : null}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={q}
        onPress={onToggle}
        style={styles.summary}
        testID="help-faq-question"
      >
        <Text variant="bodyStrong" color={c.ink} style={styles.question}>
          {q}
        </Text>
        <Icon name={open ? "up" : "down"} size={18} color={c.inkMuted} />
      </Pressable>
      {open ? (
        <Text variant="body" color={c.inkMuted} style={styles.answer} testID="help-faq-answer">
          {a}
        </Text>
      ) : null}
    </View>
  );
}

function WriteRow({
  icon,
  title,
  caption,
  onPress,
  first,
  testID,
}: {
  icon: IconName;
  title: string;
  caption: string;
  onPress: () => void;
  first?: boolean;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${caption}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.setRow,
        !first && { borderTopWidth: 1, borderTopColor: c.line },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={20} color={c.inkMuted} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.setTitle}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.setCaption}>
          {caption}
        </Text>
      </View>
      <Icon name="next" size={16} color={c.inkMuted} />
    </Pressable>
  );
}

export function HelpSection() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const [open, setOpen] = useState<string | null>(helpFaq[0]?.id ?? null);
  const version = Constants.expoConfig?.version ?? "";
  const profiles = replayProfiles(
    (me?.personas ?? []).map((p) => p.kind),
    me?.profile.mainProfile ?? null,
  );
  const card = [styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }];
  const send = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <>
      <SecHead title={helpLabels.replay} hint={helpLabels.replayHint} />
      <View style={styles.tutos} testID="help-tutos">
        {profiles.map((p) => (
          <TutoCard
            key={p}
            profile={p}
            // Lot M5 (bug du retour 32) : la route du tuto de cette casquette, par son nom et son paramètre.
            onPress={() => router.push({ pathname: "/tuto/[profile]", params: { profile: p } })}
          />
        ))}
      </View>

      <SecHead title={helpLabels.faq} />
      <View style={card} testID="help-faq">
        {helpFaq.map((f, i) => (
          <Faq
            key={f.id}
            q={f.q}
            a={f.a}
            first={i === 0}
            open={open === f.id}
            onToggle={() => setOpen(open === f.id ? null : f.id)}
          />
        ))}
      </View>

      <SecHead title={helpLabels.write} />
      <View style={card} testID="help-write">
        <WriteRow
          first
          icon="chat"
          title={helpLabels.writeTeam}
          caption={helpLabels.writeTeamCaption}
          onPress={() => send(mailto(helpLabels.writeSubject(version)))}
          testID="help-write-team"
        />
        <WriteRow
          icon="flag"
          title={helpLabels.report}
          caption={helpLabels.reportCaption}
          onPress={() => send(mailto(helpLabels.reportSubject(version, Platform.OS), helpLabels.reportBody))}
          testID="help-report"
        />
      </View>

      <Text variant="caption" color={c.inkMuted} style={styles.center} testID="help-moved">
        {helpLabels.movedNote}
      </Text>
      <Text variant="caption" color={c.inkFaint} style={styles.center}>
        {helpLabels.version(version)}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  tutos: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tuto: { width: "48%", flexGrow: 1, gap: space2, padding: space3, borderRadius: 16 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  playIcon: { marginLeft: 2 },
  tutoName: { fontSize: 14, lineHeight: 17, fontWeight: "800" },
  tutoCap: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.8 },
  card: { borderRadius: 18, overflow: "hidden" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space2 + 2,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  question: { flex: 1, fontSize: 14.5, lineHeight: 19, fontWeight: "700" },
  answer: { paddingHorizontal: 14, paddingBottom: 14, fontSize: 13.5, lineHeight: 20 },
  setRow: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: 13, paddingHorizontal: 14 },
  grow: { flex: 1, minWidth: 0, gap: space1 / 2 },
  setTitle: { fontSize: 14.5, lineHeight: 19, fontWeight: "800" },
  setCaption: { fontSize: 12, lineHeight: 16 },
  center: { textAlign: "center" },
});
